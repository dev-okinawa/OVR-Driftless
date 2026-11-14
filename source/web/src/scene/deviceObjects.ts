import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  type Vector3,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { DeviceInfo, DeviceSample, DeviceState } from '../domain/types';
import { deviceView } from './deviceView';
import type { SceneColors } from './sceneColors';
import { SCENE_CONFIG } from './sceneConfig';

/** CSS classes of the marker elements, from the scene's CSS module. */
export interface MarkerClasses {
  readonly marker: string;
  readonly highlighted: string;
}

/**
 * One device in the scene: a screen-space `ui-device-mark` at the device position (shape by role, tone by tracking
 * system, state by dashes or ghost) and, when asked, a hairline down to the floor that ends in a small ring.
 * Only the position of the device is used; marks do not turn with it.
 * All geometries and materials are created once and only their parameters change afterwards.
 */
export class DeviceObject {
  readonly root = new Group();
  private readonly element = document.createElement('div');
  private readonly mark = document.createElement('ui-device-mark');
  private readonly marker: CSS2DObject;
  private readonly stem = new Group();
  private readonly stemLine: Line;
  private readonly stemPositions: Float32BufferAttribute;
  private readonly stemGeometry = new BufferGeometry();
  private readonly footGeometry = new BufferGeometry();
  private readonly stemMaterial: LineBasicMaterial;
  private readonly foot: LineLoop;
  private shownState: DeviceState | null = null;
  private hasPose = false;
  private showHeightLine = false;
  private highlighted = false;
  private tooltip = '';

  constructor(
    readonly info: DeviceInfo,
    private devices: readonly DeviceInfo[],
    colors: SceneColors,
    private readonly classes: MarkerClasses,
  ) {
    this.element.className = classes.marker;
    this.mark.shape = info.role;
    this.mark.tone = info.trackingSystem;
    this.mark.size = 'md';
    this.applyState('disconnected');
    this.element.append(this.mark);
    this.marker = new CSS2DObject(this.element);

    this.stemPositions = new Float32BufferAttribute(new Float32Array(6), 3);
    this.stemGeometry.setAttribute('position', this.stemPositions);
    this.stemMaterial = new LineBasicMaterial({ color: colors.stem });
    this.stemLine = new Line(this.stemGeometry, this.stemMaterial);
    this.stemLine.frustumCulled = false;

    const { footRadius, footSegments } = SCENE_CONFIG.marks;
    const ring: number[] = [];
    for (let i = 0; i < footSegments; i++) {
      const angle = (i / footSegments) * Math.PI * 2;
      ring.push(Math.cos(angle) * footRadius, 0, Math.sin(angle) * footRadius);
    }
    this.footGeometry.setAttribute('position', new Float32BufferAttribute(ring, 3));
    this.foot = new LineLoop(this.footGeometry, this.stemMaterial);
    this.foot.frustumCulled = false;

    this.stem.add(this.stemLine, this.foot);
    this.stem.visible = false;
    this.root.add(this.marker, this.stem);
    this.root.visible = false;
  }

  /** The device position in world space; meaningful while `drawn`. */
  get position(): Vector3 {
    return this.root.position;
  }

  get drawn(): boolean {
    return this.hasPose;
  }

  /** The tooltip text for the current state of the device. */
  get description(): string {
    return this.tooltip;
  }

  update(sample: DeviceSample, floorHeight: number): void {
    const pose = sample.pose;
    this.hasPose = pose !== null;
    this.root.visible = this.hasPose;
    if (pose === null) return;

    this.root.position.set(pose.position[0], pose.position[1], pose.position[2]);
    if (sample.state !== this.shownState) this.applyState(sample.state);

    const height = pose.position[1] - floorHeight;
    this.stem.visible = this.showHeightLine && height >= SCENE_CONFIG.marks.minHeightLine;
    if (this.stem.visible) {
      this.stemPositions.setY(1, -height);
      this.stemPositions.needsUpdate = true;
      this.foot.position.y = -height;
    }
  }

  setHighlighted(highlighted: boolean): void {
    if (highlighted === this.highlighted) return;
    this.highlighted = highlighted;
    this.element.classList.toggle(this.classes.highlighted, highlighted);
  }

  setHeightLineVisible(visible: boolean): void {
    this.showHeightLine = visible;
    if (!visible) this.stem.visible = false;
  }

  dispose(): void {
    this.marker.removeFromParent();
    this.element.remove();
    this.root.removeFromParent();
    this.stemGeometry.dispose();
    this.footGeometry.dispose();
    this.stemMaterial.dispose();
  }

  /** The session's devices changed: a tracker's number is its place among the trackers. */
  setDevices(devices: readonly DeviceInfo[]): void {
    this.devices = devices;
    this.applyState(this.shownState ?? 'disconnected');
  }

  private applyState(state: DeviceState): void {
    this.shownState = state;
    const view = deviceView(this.info, this.devices, state);
    this.mark.state = view.mark.state;
    this.mark.code = view.mark.code;
    this.tooltip = view.description;
  }
}
