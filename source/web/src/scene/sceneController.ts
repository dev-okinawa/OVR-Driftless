import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { DeviceInfo, Frame, SessionInfo } from '../domain/types';
import type { SessionStore } from '../state/sessionStore';
import { defaultCameraView, easeOutCubic, interpolateView, type CameraView } from './camera';
import { DeviceObject, type MarkerClasses } from './deviceObjects';
import { Floor } from './floor';
import type { SceneLayer } from './layer';
import { PlayAreas } from './playAreas';
import { readSceneColors, type SceneColors } from './sceneColors';
import { SCENE_CONFIG } from './sceneConfig';
import type { SceneOptions } from './sceneOptions';
import { Trails } from './trails';

export interface SceneInputs {
  readonly options: SceneOptions;
  readonly layers: readonly SceneLayer[];
  readonly highlightDeviceIds: readonly string[];
  readonly resetViewSignal: number;
  readonly onDeviceClick?: (deviceId: string) => void;
}

/** CSS classes from the scene's CSS module. */
export interface SceneClasses extends MarkerClasses {
  readonly canvas: string;
  readonly tooltip: string;
}

/** A pointer that moves less than this between press and release is a click, not a drag; pixels. */
const CLICK_TRAVEL_PX = 4;
const TOOLTIP_GAP_PX = 20;
const CURSOR_IDLE = 'grab';
const CURSOR_DRAGGING = 'grabbing';
const CURSOR_ON_MARK = 'pointer';

function sameDevice(a: DeviceInfo, b: DeviceInfo): boolean {
  return (
    a.role === b.role &&
    a.trackingSystem === b.trackingSystem &&
    a.name === b.name &&
    a.serial === b.serial &&
    a.bodyPart === b.bodyPart // the mark names the body part; a tracker moved to another place is drawn anew
  );
}

/**
 * Owns the renderer, camera, controls and everything drawn into the scene, and draws on the animation frame.
 * Frames are read from the store directly; nothing here goes through React state.
 */
export class SceneController {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer = new WebGLRenderer({ antialias: true });
  private readonly markRenderer = new CSS2DRenderer();
  private readonly controls: OrbitControls;
  private readonly colors: SceneColors;
  private readonly floor: Floor;
  private readonly playAreas: PlayAreas;
  private readonly trails: Trails;
  private readonly tooltip = document.createElement('div');
  private readonly devices = new Map<string, DeviceObject>();
  private readonly resizeObserver: ResizeObserver;
  private readonly projected = new Vector3();
  private readonly canvas: HTMLCanvasElement;

  private inputs: SceneInputs;
  private layers: readonly SceneLayer[] = [];
  private session: SessionInfo | null = null;
  private frame: Frame | null = null;
  private lastTime = Number.NEGATIVE_INFINITY;
  private floorHeight = 0;
  private userMoved = false;
  private dragging = false;
  private animation = 0;
  private width = 0;
  private height = 0;

  private glide: { readonly from: CameraView; readonly to: CameraView; readonly start: number } | null = null;

  /** The pointer over the canvas in canvas pixels, or null when it is elsewhere. */
  private pointer: { x: number; y: number } | null = null;
  private pressed: { x: number; y: number } | null = null;
  private shownTooltip = '';
  private cursor = '';

  constructor(
    private readonly container: HTMLElement,
    private readonly store: SessionStore,
    private readonly classes: SceneClasses,
    initial: SceneInputs,
  ) {
    const { camera } = SCENE_CONFIG;
    this.inputs = initial;
    this.colors = readSceneColors(container);
    this.scene.background = this.colors.background;
    this.camera = new PerspectiveCamera(camera.fovDegrees, 1, camera.near, camera.far);

    this.floor = new Floor(this.colors);
    this.scene.add(this.floor.group);
    this.playAreas = new PlayAreas(this.colors);
    this.scene.add(this.playAreas.group);
    this.trails = new Trails(this.colors);
    this.scene.add(this.trails.group);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = classes.canvas;
    this.canvas.style.display = 'block';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-roledescription', '3D view');
    this.canvas.setAttribute('aria-label', '3D scene');
    container.appendChild(this.canvas);
    // The mark layer lies over the canvas; it must let the mouse through to the controls.
    const markLayer = this.markRenderer.domElement;
    markLayer.style.position = 'absolute';
    markLayer.style.top = '0';
    markLayer.style.left = '0';
    markLayer.style.pointerEvents = 'none';
    container.appendChild(markLayer);
    this.tooltip.className = classes.tooltip;
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('role', 'tooltip');
    container.appendChild(this.tooltip);

    this.controls = new OrbitControls(this.camera, this.canvas);
    // Dragging follows the pointer directly, without inertia.
    this.controls.enableDamping = false;
    this.controls.minDistance = camera.minDistance;
    this.controls.maxDistance = camera.maxDistance;
    this.controls.minPolarAngle = (camera.minPolarDegrees * Math.PI) / 180;
    this.controls.maxPolarAngle = (camera.maxPolarDegrees * Math.PI) / 180;
    this.controls.keyPanSpeed = camera.keyboardPanSpeed;
    this.controls.listenToKeyEvents(this.canvas);
    this.controls.addEventListener('start', this.onControlsStart);
    this.controls.addEventListener('end', this.onControlsEnd);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('keydown', this.onKeyDown);
    this.moveCamera(defaultCameraView(null));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setInputs(initial);
    this.animation = requestAnimationFrame(this.tick);
  }

  /** Called on every React render; cheap when nothing changed. */
  setInputs(inputs: SceneInputs): void {
    const resetRequested = inputs.resetViewSignal !== this.inputs.resetViewSignal;
    this.inputs = inputs;

    this.trails.group.visible = inputs.options.showTrails;
    this.playAreas.setVisible(inputs.options.showPlayAreas);
    for (const device of this.devices.values()) device.setHeightLineVisible(inputs.options.showHeightLines);
    this.syncLayers(inputs.layers);
    if (resetRequested) this.resetView();
  }

  dispose(): void {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.controls.stopListenToKeyEvents();
    this.controls.dispose();
    this.syncLayers([]);
    for (const device of this.devices.values()) device.dispose();
    this.devices.clear();
    this.trails.dispose();
    this.playAreas.dispose();
    this.floor.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.markRenderer.domElement.remove();
    this.tooltip.remove();
  }

  private readonly tick = (): void => {
    this.animation = requestAnimationFrame(this.tick);
    this.draw();
  };

  private draw(): void {
    const session = this.store.getSnapshot().session;
    const frame = this.store.frame;
    if (session !== this.session) this.syncSession(session);

    if (session && frame) {
      if (frame !== this.frame) this.applyFrame(frame, session);
    } else if (this.frame) {
      // The source was replaced or stopped: show no stale poses.
      this.frame = null;
      this.lastTime = Number.NEGATIVE_INFINITY;
      this.trails.clear();
      for (const device of this.devices.values()) device.root.visible = false;
    }

    this.stepGlide();
    this.updateHighlights();
    this.controls.update();
    if (session && frame) for (const layer of this.layers) layer.update(frame, session, this.camera);
    this.floor.follow(this.controls.target.x, this.controls.target.z, this.floorHeight);
    this.updateHover();
    this.renderer.render(this.scene, this.camera);
    this.markRenderer.render(this.scene, this.camera);
  }

  private applyFrame(frame: Frame, session: SessionInfo): void {
    this.frame = frame;
    // A replay can seek back: the old trail would be a line through time.
    if (frame.time < this.lastTime) this.trails.clear();
    this.lastTime = frame.time;

    for (const sample of frame.devices) this.devices.get(sample.id)?.update(sample, this.floorHeight);
    this.trails.update(frame, session, this.inputs.options.trailSeconds);
  }

  /** Adds new devices, removes the gone ones and leaves the rest untouched. */
  private syncSession(session: SessionInfo | null): void {
    const hadSession = this.session !== null;
    this.session = session;
    this.floorHeight = session?.floorHeight ?? 0;
    this.trails.keepOnly(session);
    this.playAreas.rebuild(session);

    const infos = new Map((session?.devices ?? []).map((info) => [info.id, info]));
    for (const [id, device] of this.devices) {
      const info = infos.get(id);
      if (info && sameDevice(info, device.info)) continue;
      device.dispose();
      this.devices.delete(id);
    }
    for (const device of this.devices.values()) device.setDevices(session?.devices ?? []);
    for (const info of infos.values()) {
      if (this.devices.has(info.id)) continue;
      const device = new DeviceObject(info, session?.devices ?? [], this.colors, this.classes);
      device.setHeightLineVisible(this.inputs.options.showHeightLines);
      this.devices.set(info.id, device);
      this.scene.add(device.root);
    }

    if (session) {
      if (!hadSession && !this.userMoved) this.moveCamera(defaultCameraView(session));
    } else {
      this.frame = null;
      this.lastTime = Number.NEGATIVE_INFINITY;
    }
  }

  private updateHighlights(): void {
    const ids = this.inputs.highlightDeviceIds;
    for (const [id, device] of this.devices) device.setHighlighted(ids.includes(id));
  }

  private syncLayers(next: readonly SceneLayer[]): void {
    for (const layer of this.layers) if (!next.includes(layer)) layer.detach();
    for (const layer of next) if (!this.layers.includes(layer)) layer.attach(this.scene);
    this.layers = [...next];
  }

  // ---- Camera ---------------------------------------------------------------------------------------

  private moveCamera(view: CameraView): void {
    this.camera.position.set(view.position[0], view.position[1], view.position[2]);
    this.controls.target.set(view.target[0], view.target[1], view.target[2]);
    this.controls.update();
  }

  /** Returns to the default view: a short ease-out glide, or at once with reduced motion. */
  private resetView(): void {
    const to = defaultCameraView(this.session);
    this.userMoved = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.glide = null;
      this.moveCamera(to);
      return;
    }
    const from: CameraView = {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    };
    this.glide = { from, to, start: performance.now() };
  }

  private stepGlide(): void {
    if (!this.glide) return;
    const { from, to, start } = this.glide;
    const t = Math.min(1, (performance.now() - start) / SCENE_CONFIG.camera.glideMs);
    this.moveCamera(interpolateView(from, to, easeOutCubic(t)));
    if (t >= 1) this.glide = null;
  }

  private readonly onControlsStart = (): void => {
    this.glide = null;
    this.userMoved = true;
    this.dragging = true;
  };

  private readonly onControlsEnd = (): void => {
    this.dragging = false;
  };

  // ---- Pointer and keyboard -------------------------------------------------------------------------

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer = this.canvasPoint(event);
  };

  private readonly onPointerLeave = (): void => {
    this.pointer = null;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressed = this.canvasPoint(event);
  };

  private readonly onClick = (event: MouseEvent): void => {
    const at = this.canvasPoint(event);
    const press = this.pressed;
    this.pressed = null;
    if (press && Math.hypot(at.x - press.x, at.y - press.y) > CLICK_TRAVEL_PX) return;
    const id = this.deviceAt(at.x, at.y);
    if (id !== null) this.inputs.onDeviceClick?.(id);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Home' || event.key === '0') {
      event.preventDefault();
      this.resetView();
    }
  };

  private canvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** The drawn device whose mark is under the point and nearest to it, or null. */
  private deviceAt(x: number, y: number): string | null {
    const { hitRadiusPx } = SCENE_CONFIG.marks;
    let best: string | null = null;
    let bestDistance: number = hitRadiusPx;
    for (const [id, device] of this.devices) {
      if (!device.drawn) continue;
      this.projected.copy(device.position).project(this.camera);
      if (this.projected.z > 1) continue;
      const distance = Math.hypot(
        ((this.projected.x + 1) / 2) * this.width - x,
        ((1 - this.projected.y) / 2) * this.height - y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }

  /** Cursor and tooltip follow the pointer, and the marks under it as the camera or the devices move. */
  private updateHover(): void {
    const pointer = this.dragging ? null : this.pointer;
    const id = pointer ? this.deviceAt(pointer.x, pointer.y) : null;
    const device = id === null ? undefined : this.devices.get(id);

    const cursor = this.dragging ? CURSOR_DRAGGING : id !== null ? CURSOR_ON_MARK : CURSOR_IDLE;
    if (cursor !== this.cursor) {
      this.cursor = cursor;
      this.canvas.style.cursor = cursor;
    }

    if (!device || !pointer) {
      this.tooltip.hidden = true;
      return;
    }
    const text = device.description;
    if (text !== this.shownTooltip) {
      this.shownTooltip = text;
      this.tooltip.textContent = text;
    }
    this.tooltip.hidden = false;
    this.projected.copy(device.position).project(this.camera);
    const x = ((this.projected.x + 1) / 2) * this.width;
    const y = ((1 - this.projected.y) / 2) * this.height;
    // The tip opens toward the middle of the view, so it stays inside it.
    const side = x < this.width / 2 ? `${TOOLTIP_GAP_PX}px` : `calc(-100% - ${TOOLTIP_GAP_PX}px)`;
    this.tooltip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${side}, -50%)`;
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.markRenderer.setSize(width, height);
    this.playAreas.setResolution(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
