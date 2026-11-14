import type { Vec3 } from '../domain/types';
import { vec3Add, vec3Cross, vec3Dot, vec3Length, vec3Normalize, vec3Scale, vec3Sub } from '../math/vec3';

/**
 * The design kit's octahedral bone (`ui-spatial-view`, `bone-geometry.ts`), in world space, meters: a diamond
 * from the head joint to the tail joint, widest near the head, like a Blender armature in octahedral display.
 */

/** Half the width of the widest ring, as a share of the bone's length, between these bounds. */
const HALF_WIDTH_RATIO = 0.1;
const MIN_HALF_WIDTH = 0.002;
const MAX_HALF_WIDTH = 0.05;
/** Where along the bone the ring sits, as a share of its length. */
const RING_AT = 0.12;
const WORLD_UP: Vec3 = [0, 1, 0];

export type Segment = readonly [Vec3, Vec3];

export interface BoneOptions {
  /** The direction the bone's front faces; only turns the diamond about its axis. Default: world up. */
  readonly up?: Vec3;
  /** Full width of the widest ring, meters; overrides the slender default. */
  readonly width?: number;
  /** Where the widest ring sits, as a share of the length, 0.05 to 0.9. */
  readonly widest?: number;
}

export interface BoneEdges {
  /** Edges of the facets that face the eye. */
  readonly facets: readonly Segment[];
  /** The bone's silhouette seen from the eye: edges between a facet that faces it and one that does not. */
  readonly outline: readonly Segment[];
}

/** Full width of a bone's widest ring, meters. */
export function boneWidth(length: number, options: BoneOptions = {}): number {
  if (options.width !== undefined && options.width > 0) return options.width;
  return 2 * Math.min(MAX_HALF_WIDTH, Math.max(MIN_HALF_WIDTH, length * HALF_WIDTH_RATIO));
}

/** Radius of the joint ring at a bone's head, meters. */
export function jointRadius(length: number): number {
  return Math.min(0.024, Math.max(0.0015, length * 0.11));
}

/** The bone's edges as seen from `eye`; null for a bone of no length. */
export function boneEdges(head: Vec3, tail: Vec3, eye: Vec3, options: BoneOptions = {}): BoneEdges | null {
  const axis = vec3Sub(tail, head);
  const length = vec3Length(axis);
  if (length < 1e-4) return null;
  const y = vec3Scale(axis, 1 / length);
  const across = (v: Vec3): Vec3 => vec3Sub(v, vec3Scale(y, vec3Dot(v, y)));
  let hint = across(options.up ?? WORLD_UP);
  if (vec3Length(hint) < 0.2) hint = across([0, 0, 1]);
  if (vec3Length(hint) < 0.2) hint = [1, 0, 0];
  const x = vec3Normalize(hint);
  const z = vec3Cross(x, y);

  const half = boneWidth(length, options) / 2;
  const ringAt = Math.min(0.9, Math.max(0.05, options.widest ?? RING_AT));
  const center = vec3Add(head, vec3Scale(y, length * ringAt));
  const ring = [x, z, vec3Scale(x, -1), vec3Scale(z, -1)].map((direction) => vec3Add(center, vec3Scale(direction, half)));
  const apexes = [head, tail] as const;

  // faces[apex][i]: whether the facet (apex, ring i, ring i+1) faces the eye.
  const faces = apexes.map((apex) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % 4] ?? a;
      const centroid = vec3Scale(vec3Add(vec3Add(apex, a), b), 1 / 3);
      let normal = vec3Cross(vec3Sub(a, apex), vec3Sub(b, apex));
      if (vec3Dot(normal, vec3Sub(centroid, center)) < 0) normal = vec3Scale(normal, -1);
      return vec3Dot(normal, vec3Sub(eye, centroid)) > 0;
    }),
  );

  const facets: Segment[] = [];
  const outline: Segment[] = [];
  const edge = (a: Vec3, b: Vec3, oneSide: boolean, otherSide: boolean): void => {
    if (oneSide || otherSide) facets.push([a, b]);
    if (oneSide !== otherSide) outline.push([a, b]);
  };
  const [headFaces, tailFaces] = faces;
  ring.forEach((point, i) => {
    const next = ring[(i + 1) % 4] ?? point;
    const previous = (i + 3) % 4;
    edge(point, next, headFaces?.[i] === true, tailFaces?.[i] === true);
    apexes.forEach((apex, side) => edge(apex, point, faces[side]?.[previous] === true, faces[side]?.[i] === true));
  });
  return { facets, outline };
}
