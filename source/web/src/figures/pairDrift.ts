import type { Pose } from '../domain/types';
import { quatAngleBetween } from '../math/quat';
import { poseRelative } from '../math/pose';
import { vec3Distance } from '../math/vec3';

/** How far the relative pose of a pair has moved from its reference. */
export interface PairDrift {
  readonly distanceMm: number;
  /** In [0, 180]. */
  readonly angleDeg: number;
}

/** `aFromB` of the pair: the pose of device B as seen from device A. Both inputs are `worldFromDevice`. */
export function pairRelativePose(worldFromA: Pose, worldFromB: Pose): Pose {
  return poseRelative(worldFromA, worldFromB);
}

/**
 * How far the pair's relative pose has moved from the reference. Zero when unchanged.
 * Both figures do not change when the joined pair moves through the world as a whole.
 */
export function driftFromReference(referenceAFromB: Pose, currentAFromB: Pose): PairDrift {
  return {
    distanceMm: vec3Distance(referenceAFromB.position, currentAFromB.position) * 1000,
    angleDeg: (quatAngleBetween(referenceAFromB.rotation, currentAFromB.rotation) * 180) / Math.PI,
  };
}
