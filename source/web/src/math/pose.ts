import type { Pose, Vec3 } from '../domain/types';
import { QUAT_IDENTITY, quatInverse, quatMultiply, quatRotateVec3 } from './quat';
import { VEC3_ZERO, vec3Add, vec3Scale } from './vec3';

export const POSE_IDENTITY: Pose = { position: VEC3_ZERO, rotation: QUAT_IDENTITY };

/** `aFromC = aFromB ∘ bFromC`. */
export function poseCompose(aFromB: Pose, bFromC: Pose): Pose {
  return {
    position: vec3Add(aFromB.position, quatRotateVec3(aFromB.rotation, bFromC.position)),
    rotation: quatMultiply(aFromB.rotation, bFromC.rotation),
  };
}

/** `bFromA` for a given `aFromB`. */
export function poseInverse(aFromB: Pose): Pose {
  const rotation = quatInverse(aFromB.rotation);
  return { position: vec3Scale(quatRotateVec3(rotation, aFromB.position), -1), rotation };
}

/** Maps a point given in space B into space A. */
export function poseTransformPoint(aFromB: Pose, pointInB: Vec3): Vec3 {
  return vec3Add(aFromB.position, quatRotateVec3(aFromB.rotation, pointInB));
}

/** `aFromB` for two poses given in the same world: the pose of B as seen from A. */
export function poseRelative(worldFromA: Pose, worldFromB: Pose): Pose {
  return poseCompose(poseInverse(worldFromA), worldFromB);
}
