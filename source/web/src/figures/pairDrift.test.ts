import { describe, expect, it } from 'vitest';
import type { Pose } from '../domain/types';
import { poseCompose } from '../math/pose';
import { quatFromAxisAngle, quatFromYaw } from '../math/quat';
import { driftFromReference, pairRelativePose } from './pairDrift';

const deg = (d: number): number => (d * Math.PI) / 180;

const worldFromA: Pose = { position: [0.2, 1.1, -0.4], rotation: quatFromAxisAngle([0.3, 1, 0.2], deg(33)) };
// B is rigidly fixed to A, 15 cm to the side and slightly rotated.
const aFromB: Pose = { position: [0.15, 0, 0.02], rotation: quatFromAxisAngle([1, 0, 0], deg(12)) };
const worldFromB = poseCompose(worldFromA, aFromB);

describe('driftFromReference', () => {
  it('is zero for identical poses', () => {
    const rel = pairRelativePose(worldFromA, worldFromB);
    const drift = driftFromReference(rel, rel);
    expect(drift.distanceMm).toBeCloseTo(0, 9);
    expect(drift.angleDeg).toBeCloseTo(0, 4);
  });

  it('does not change when the joined pair moves through the world', () => {
    const reference = pairRelativePose(worldFromA, worldFromB);
    const move: Pose = { position: [3, -0.5, 2], rotation: quatFromAxisAngle([0.4, 0.7, -0.5], deg(117)) };
    const moved = pairRelativePose(poseCompose(move, worldFromA), poseCompose(move, worldFromB));
    const drift = driftFromReference(reference, moved);
    expect(drift.distanceMm).toBeCloseTo(0, 6);
    expect(drift.angleDeg).toBeCloseTo(0, 3);
  });

  it('turns a 10 degree yaw of one device space into 10 degrees and the lever-arm displacement', () => {
    const a: Pose = { position: [0, 1, 0], rotation: [0, 0, 0, 1] };
    const b: Pose = { position: [1, 1, 0], rotation: [0, 0, 0, 1] }; // 1 m from the vertical axis through the origin
    const yaw: Pose = { position: [0, 0, 0], rotation: quatFromYaw(deg(10)) };
    const reference = pairRelativePose(a, b);
    const drift = driftFromReference(reference, pairRelativePose(a, poseCompose(yaw, b)));
    expect(drift.angleDeg).toBeCloseTo(10, 4);
    const lever = 2 * Math.sin(deg(10) / 2) * 1000;
    expect(drift.distanceMm).toBeCloseTo(lever, 4);
  });

  it('turns a 50 mm shift of one device into 50 mm and 0 degrees', () => {
    const reference = pairRelativePose(worldFromA, worldFromB);
    const shifted: Pose = {
      position: [worldFromB.position[0] + 0.03, worldFromB.position[1] + 0.04, worldFromB.position[2]],
      rotation: worldFromB.rotation,
    };
    // The shift is expressed in the world; A is unrotated in effect only for its length, which is preserved.
    const drift = driftFromReference(reference, pairRelativePose(worldFromA, shifted));
    expect(drift.distanceMm).toBeCloseTo(50, 6);
    expect(drift.angleDeg).toBeCloseTo(0, 3);
  });
});
