import {
  Group,
  InterleavedBufferAttribute,
  Vector3,
  type Color,
  type InterleavedBuffer,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { Frame, SessionInfo, Vec3 } from '../domain/types';
import type { SceneLayer } from '../scene/layer';
import { readSceneColors } from '../scene/sceneColors';
import { boneEdges, boneWidth, jointRadius, type Segment } from './boneShape';
import { DEFAULT_PROPORTIONS } from './proportions';
import { RIG_BONE_COUNT, rigBones } from './rigBones';
import type { SkeletonStrain } from './skeletonStrain';

/** Line widths in CSS pixels and opacities of the design kit's rig (`ui-spatial-view`). */
const LOOK = {
  neutral: { facetPx: 0.75, facetOpacity: 0.55, outlinePx: 1.25, ringPx: 1.25 },
  critical: { facetPx: 0.75, facetOpacity: 0.7, outlinePx: 2.5, ringPx: 2 },
  /** A tail ring is smaller than a head ring by this factor. */
  tailRing: 0.7,
  /** A ring smaller than this on screen is a blob, not a joint, and is skipped. */
  minRingPx: 1.8,
  /** Facet edges of a bone narrower than this on screen would smear into its outline. */
  minFacetsPx: 4,
  ringSegments: 24,
} as const;

/** Segments each line set can hold: 12 edges per bone, two rings per bone. */
const CAPACITY = { facets: RIG_BONE_COUNT * 12, outline: RIG_BONE_COUNT * 12, rings: RIG_BONE_COUNT * 2 * LOOK.ringSegments };

/** A set of pixel-wide line segments whose positions are rewritten every frame without reallocating. */
class FatLines {
  readonly object: LineSegments2;
  private readonly geometry = new LineSegmentsGeometry();
  private readonly material: LineMaterial;
  private readonly buffer: InterleavedBuffer;
  private count = 0;

  constructor(capacity: number, color: Color, widthPx: number, opacity: number, renderOrder: number) {
    // `setPositions` keeps this array as the interleaved buffer, so the segments are written into it in place.
    this.geometry.setPositions(new Float32Array(capacity * 6));
    const start = this.geometry.getAttribute('instanceStart');
    if (!(start instanceof InterleavedBufferAttribute)) throw new Error('LineSegmentsGeometry without interleaved positions');
    this.buffer = start.data;
    this.material = new LineMaterial({ color, linewidth: widthPx, transparent: opacity < 1, opacity, depthWrite: false });
    this.object = new LineSegments2(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = renderOrder;
  }

  begin(): void {
    this.count = 0;
  }

  push(a: Vec3, b: Vec3): void {
    const array = this.buffer.array;
    const at = this.count * 6;
    if (at + 6 > array.length) return;
    array.set(a, at);
    array.set(b, at + 3);
    this.count += 1;
  }

  end(): void {
    this.buffer.needsUpdate = true;
    this.geometry.instanceCount = this.count;
    this.object.visible = this.count > 0;
  }

  /** Canvas height in CSS pixels, as the line material last saw it. */
  get viewportHeight(): number {
    return this.material.resolution.y;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface ToneLines {
  readonly facets: FatLines;
  readonly outline: FatLines;
  readonly rings: FatLines;
}

/**
 * Draws the skeleton from `skeleton.latest` as the Unity rig of `rigBones`, the way the design kit draws a rig: each bone an outline-only
 * octahedron (its silhouette and, fainter, the edges of the facets facing the camera) with a ring at each
 * joint, turned to the screen. A bone in a strain part with mm > 0 is drawn in the critical tone with a heavier
 * outline, so it reads in greyscale.
 */
export function createSkeletonLayer(skeleton: SkeletonStrain): SceneLayer {
  let visible = true;
  let group: Group | null = null;
  let lines: { neutral: ToneLines; critical: ToneLines } | null = null;

  const strained = new Set<string>();
  const eye = new Vector3();
  const forward = new Vector3();
  const screenRight = new Vector3();
  const screenUp = new Vector3();

  const refreshVisibility = (): void => {
    if (group) group.visible = visible && skeleton.latest !== null;
  };

  return {
    attach(scene: Scene): void {
      const colors = readSceneColors(document.documentElement);
      const toneLines = (color: Color, look: (typeof LOOK)['neutral' | 'critical'], order: number): ToneLines => ({
        facets: new FatLines(CAPACITY.facets, color, look.facetPx, look.facetOpacity, order),
        outline: new FatLines(CAPACITY.outline, color, look.outlinePx, 1, order + 1),
        rings: new FatLines(CAPACITY.rings, color, look.ringPx, 1, order + 1),
      });
      // Strained bones are drawn last, so they stay visible over bones that cross them.
      lines = { neutral: toneLines(colors.bone, LOOK.neutral, 5), critical: toneLines(colors.critical, LOOK.critical, 7) };

      group = new Group();
      group.visible = false;
      for (const tone of [lines.neutral, lines.critical]) group.add(tone.facets.object, tone.outline.object, tone.rings.object);
      scene.add(group);
    },

    update(_frame: Frame, _session: SessionInfo, camera: PerspectiveCamera): void {
      const latest = skeleton.latest;
      refreshVisibility();
      if (!group || !lines || !latest) return;
      const { pose, strain, devices } = latest;
      const heightMeters = skeleton.currentCalibration?.proportions.heightMeters ?? DEFAULT_PROPORTIONS.heightMeters;

      strained.clear();
      if (strain) for (const part of strain.parts) if (part.mm > 0) for (const name of part.bones) strained.add(name);

      eye.copy(camera.position);
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      screenRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const eyeVec: Vec3 = [eye.x, eye.y, eye.z];
      const sets = [lines.neutral, lines.critical].flatMap((tone) => [tone.facets, tone.outline, tone.rings]);
      // A set hidden last frame was not drawn and kept an old size; the largest is the current canvas.
      const focal = Math.max(...sets.map((set) => set.viewportHeight)) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      for (const set of sets) set.begin();
      const pixelsPerMeter = (point: Vec3): number => {
        const depth = (point[0] - eye.x) * forward.x + (point[1] - eye.y) * forward.y + (point[2] - eye.z) * forward.z;
        return depth > 1e-3 ? focal / depth : 0;
      };
      const ring = (target: FatLines, center: Vec3, radius: number): void => {
        if (radius * pixelsPerMeter(center) < LOOK.minRingPx) return;
        let previous: Vec3 | null = null;
        for (let i = 0; i <= LOOK.ringSegments; i += 1) {
          const angle = (i / LOOK.ringSegments) * Math.PI * 2;
          const c = Math.cos(angle) * radius;
          const s = Math.sin(angle) * radius;
          const point: Vec3 = [
            center[0] + screenRight.x * c + screenUp.x * s,
            center[1] + screenRight.y * c + screenUp.y * s,
            center[2] + screenRight.z * c + screenUp.z * s,
          ];
          if (previous) target.push(previous, point);
          previous = point;
        }
      };
      const pushAll = (target: FatLines, segments: readonly Segment[]): void => {
        for (const [a, b] of segments) target.push(a, b);
      };

      for (const bone of rigBones(pose, devices, heightMeters)) {
        const tone = bone.strainBone && strained.has(bone.strainBone) ? lines.critical : lines.neutral;
        const edges = boneEdges(bone.head, bone.tail, eyeVec, bone);
        if (!edges) continue;
        const length = Math.hypot(bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]);
        const middle: Vec3 = [(bone.head[0] + bone.tail[0]) / 2, (bone.head[1] + bone.tail[1]) / 2, (bone.head[2] + bone.tail[2]) / 2];
        if (boneWidth(length, bone) * pixelsPerMeter(middle) >= LOOK.minFacetsPx) pushAll(tone.facets, edges.facets);
        pushAll(tone.outline, edges.outline);
        const radius = jointRadius(length);
        ring(tone.rings, bone.head, radius);
        if (bone.leaf) ring(tone.rings, bone.tail, radius * LOOK.tailRing);
      }
      for (const set of sets) set.end();
    },

    setVisible(value: boolean): void {
      visible = value;
      refreshVisibility();
    },

    detach(): void {
      if (group) {
        group.removeFromParent();
        group.clear();
      }
      if (lines) for (const tone of [lines.neutral, lines.critical]) for (const set of [tone.facets, tone.outline, tone.rings]) set.dispose();
      group = null;
      lines = null;
    },
  };
}
