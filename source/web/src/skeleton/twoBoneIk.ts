import type { Vec3 } from '../domain/types';
import { vec3Add, vec3Cross, vec3Dot, vec3Length, vec3Normalize, vec3Scale, vec3Sub } from '../math/vec3';

export interface TwoBoneChain {
  readonly mid: Vec3;
  /** Where the chain actually ends: the target, or a point short of it when the target is out of reach. */
  readonly end: Vec3;
}

/**
 * Analytic two-bone inverse kinematics. The bones keep their lengths: a target that is too far is
 * approached in a straight line and the chain stops at full length; a target closer than the
 * bones can fold is met at the shortest distance they allow.
 * `pole` is the direction the middle joint bends toward (a knee forward, an elbow back).
 */
export function solveTwoBoneChain(root: Vec3, target: Vec3, upper: number, lower: number, pole: Vec3): TwoBoneChain {
  const toTarget = vec3Sub(target, root);
  const dir = vec3Normalize(toTarget, [0, -1, 0]);
  const reach = Math.min(upper + lower, Math.max(Math.abs(upper - lower), vec3Length(toTarget)));

  // Distance along the root-target line to the foot of the perpendicular through the middle joint.
  const along = reach > 1e-9 ? (upper * upper - lower * lower + reach * reach) / (2 * reach) : 0;
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));

  let bend = vec3Sub(pole, vec3Scale(dir, vec3Dot(pole, dir)));
  if (vec3Length(bend) < 1e-6) {
    // The pole is parallel to the line: take any direction perpendicular to it.
    bend = vec3Cross(dir, Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]);
  }
  bend = vec3Normalize(bend);

  return {
    mid: vec3Add(vec3Add(root, vec3Scale(dir, along)), vec3Scale(bend, height)),
    end: vec3Add(root, vec3Scale(dir, reach)),
  };
}
