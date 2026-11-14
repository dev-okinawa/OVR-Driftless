import { describe, expect, it } from 'vitest';
import type { Pose, Quat, Vec3 } from '../domain/types';
import { POSE_IDENTITY, poseCompose, poseInverse, poseRelative, poseTransformPoint } from './pose';
import { quatAngleBetween, quatFromAxisAngle, quatFromYaw, quatMultiply, quatRotateVec3, quatSlerp } from './quat';

function expectVec3(actual: Vec3, expected: Vec3): void {
  for (let axis = 0; axis < 3; axis++) expect(actual[axis]).toBeCloseTo(expected[axis]!, 9);
}

function expectPose(actual: Pose, expected: Pose): void {
  expectVec3(actual.position, expected.position);
  expect(quatAngleBetween(actual.rotation, expected.rotation)).toBeCloseTo(0, 6);
}

const QUARTER_TURN = Math.PI / 2;

describe('quat', () => {
  it('yaw turns -Z (forward) towards -X (left)', () => {
    expectVec3(quatRotateVec3(quatFromYaw(QUARTER_TURN), [0, 0, -1]), [-1, 0, 0]);
  });

  it('multiply applies the right operand first', () => {
    const yaw: Quat = quatFromYaw(QUARTER_TURN);
    const pitch: Quat = quatFromAxisAngle([1, 0, 0], QUARTER_TURN);
    const combined = quatMultiply(yaw, pitch);
    expectVec3(quatRotateVec3(combined, [0, 0, -1]), quatRotateVec3(yaw, quatRotateVec3(pitch, [0, 0, -1])));
  });

  it('slerp reaches both ends and the middle', () => {
    const start = quatFromYaw(0);
    const end = quatFromYaw(QUARTER_TURN);
    expect(quatAngleBetween(quatSlerp(start, end, 0), start)).toBeCloseTo(0, 6);
    expect(quatAngleBetween(quatSlerp(start, end, 1), end)).toBeCloseTo(0, 6);
    expect(quatAngleBetween(quatSlerp(start, end, 0.5), quatFromYaw(QUARTER_TURN / 2))).toBeCloseTo(0, 6);
  });
});

describe('pose', () => {
  const worldFromA: Pose = { position: [1, 2, 3], rotation: quatFromYaw(0.7) };
  const worldFromB: Pose = { position: [-2, 0.5, 4], rotation: quatFromAxisAngle([1, 1, 0], 1.1) };

  it('compose with the inverse is the identity', () => {
    expectPose(poseCompose(worldFromA, poseInverse(worldFromA)), POSE_IDENTITY);
    expectPose(poseCompose(poseInverse(worldFromA), worldFromA), POSE_IDENTITY);
  });

  it('transformPoint agrees with compose', () => {
    const pointInB: Vec3 = [0.3, -0.2, 0.9];
    const aFromB = poseRelative(worldFromA, worldFromB);
    expectVec3(poseTransformPoint(worldFromA, poseTransformPoint(aFromB, pointInB)), poseTransformPoint(worldFromB, pointInB));
  });

  it('relative pose of rigidly joined devices does not change when both move together', () => {
    const worldFromWorldMoved: Pose = { position: [5, 0, -1], rotation: quatFromYaw(2.2) };
    const before = poseRelative(worldFromA, worldFromB);
    const after = poseRelative(poseCompose(worldFromWorldMoved, worldFromA), poseCompose(worldFromWorldMoved, worldFromB));
    expectPose(after, before);
  });
});
