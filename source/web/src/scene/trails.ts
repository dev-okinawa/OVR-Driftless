import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, LineBasicMaterial, LineSegments, type Color } from 'three';
import type { DeviceInfo, Frame, SessionInfo } from '../domain/types';
import type { SceneColors } from './sceneColors';
import { SCENE_CONFIG } from './sceneConfig';
import { TrailBuffer } from './trailBuffer';
import { writeTrailColors } from './trailColors';

const { capacity: CAPACITY, quarterOpacity } = SCENE_CONFIG.trails;

class DeviceTrail {
  readonly buffer = new TrailBuffer(CAPACITY);
  readonly lines: LineSegments;
  private readonly geometry = new BufferGeometry();
  private readonly attribute: BufferAttribute;
  private readonly colorAttribute: BufferAttribute;
  private readonly material: LineBasicMaterial;
  private readonly color: Color;

  constructor(info: DeviceInfo, colors: SceneColors) {
    this.attribute = new BufferAttribute(new Float32Array(6 * (CAPACITY - 1)), 3);
    this.attribute.setUsage(DynamicDrawUsage);
    this.colorAttribute = new BufferAttribute(new Float32Array(8 * (CAPACITY - 1)), 4);
    this.colorAttribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.attribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setDrawRange(0, 0);
    this.color = colors[info.trackingSystem];
    // Opacity comes from the vertex colors: the trail fades toward its tail.
    this.material = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    this.lines = new LineSegments(this.geometry, this.material);
    // The bounding sphere is not kept up to date while the buffer changes.
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
  }

  /** Copies the buffer into the GPU attributes. */
  upload(): void {
    const segments = this.buffer.writeSegments(this.attribute.array as Float32Array);
    writeTrailColors(
      this.colorAttribute.array as Float32Array,
      segments,
      this.color.r,
      this.color.g,
      this.color.b,
      quarterOpacity,
    );
    this.geometry.setDrawRange(0, segments * 2);
    this.attribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Motion trails of the moving devices; base stations do not move and have none. */
export class Trails {
  readonly group = new Group();
  private readonly trails = new Map<string, DeviceTrail>();

  constructor(private readonly colors: SceneColors) {}

  /** Adds a point for every tracked device, breaks the line of every untracked one, and drops old points. */
  update(frame: Frame, session: SessionInfo, trailSeconds: number): void {
    for (const sample of frame.devices) {
      const info = session.devices.find((device) => device.id === sample.id);
      if (!info || info.role === 'base-station') continue;

      let trail = this.trails.get(sample.id);
      if (!trail) {
        trail = new DeviceTrail(info, this.colors);
        this.trails.set(sample.id, trail);
        this.group.add(trail.lines);
      }

      if (sample.state === 'tracking' && sample.pose) {
        trail.buffer.push(frame.time, sample.pose.position[0], sample.pose.position[1], sample.pose.position[2]);
      } else {
        trail.buffer.breakLine();
      }
      trail.buffer.trim(frame.time - trailSeconds);
      trail.upload();
    }
  }

  /** Forgets the trails of devices that left the session; all of them when there is no session. */
  keepOnly(session: SessionInfo | null): void {
    for (const [id, trail] of this.trails) {
      if (session?.devices.some((device) => device.id === id)) continue;
      trail.dispose();
      this.trails.delete(id);
    }
  }

  clear(): void {
    for (const trail of this.trails.values()) {
      trail.buffer.clear();
      trail.upload();
    }
  }

  dispose(): void {
    for (const trail of this.trails.values()) trail.dispose();
    this.trails.clear();
    this.group.removeFromParent();
  }
}
