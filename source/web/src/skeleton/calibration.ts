import type { BodyPart, Pose, Vec3 } from '../domain/types';
import { poseInverse, poseTransformPoint } from '../math/pose';
import { vec3Add, vec3Scale } from '../math/vec3';
import { horizontalForward } from './facing';
import { CHEST_ALONG_SPINE, EYE_HEIGHT_RATIO, createProportions, type SkeletonProportions } from './proportions';

/** `worldFromDevice` by body part, only for devices whose state is `tracking`. */
export type BodyDevices = Partial<Record<BodyPart, Pose>>;

export interface SkeletonCalibration {
  readonly proportions: SkeletonProportions;
  /** For each tracked body part: the joint's position in the tracker's local frame (`trackerFromJoint` as a point). */
  readonly jointOffsets: Partial<Record<BodyPart, Vec3>>;
}

/**
 * Calibrates from a moment when the user stands straight and the two tracking spaces are aligned.
 * Null when the head is not tracking.
 */
export function calibrateSkeleton(devices: BodyDevices, floorHeight: number): SkeletonCalibration | null {
  const head = devices.head;
  if (!head) return null;

  // A headset reading outside the range of a standing person is not a calibration pose; keep the lengths sane.
  const height = (head.position[1] - floorHeight) / EYE_HEIGHT_RATIO;
  const proportions = createProportions(Math.min(2.5, Math.max(0.5, height)));
  const forward = horizontalForward(head.rotation);
  const right: Vec3 = [-forward[2], 0, forward[0]];

  // Standing reference under the head: hips straight below, feet at half the hip width to each side.
  const hips: Vec3 = [head.position[0], floorHeight + proportions.hipHeight, head.position[2]];
  const halfHip = vec3Scale(right, proportions.hipWidth / 2);
  const footY = floorHeight + proportions.ankleHeight;
  const reference: Partial<Record<BodyPart, Vec3>> = {
    waist: hips,
    chest: [hips[0], hips[1] + proportions.spine * CHEST_ALONG_SPINE, hips[2]],
    'left-foot': [hips[0] - halfHip[0], footY, hips[2] - halfHip[2]],
    'right-foot': vec3Add([hips[0], footY, hips[2]], halfHip),
  };

  const jointOffsets: Partial<Record<BodyPart, Vec3>> = {};
  for (const part of ['waist', 'chest', 'left-foot', 'right-foot'] as const) {
    const tracker = devices[part];
    const joint = reference[part];
    if (tracker && joint) jointOffsets[part] = poseTransformPoint(poseInverse(tracker), joint);
  }
  return { proportions, jointOffsets };
}
