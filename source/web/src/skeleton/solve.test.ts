import { describe, expect, it } from 'vitest';
import type { Pose, Vec3 } from '../domain/types';
import { quatFromAxisAngle } from '../math/quat';
import { vec3Distance } from '../math/vec3';
import { makeBody } from './bodyFixtures';
import { calibrateSkeleton } from './calibration';
import { JOINT_NAMES } from './proportions';
import { solveSkeleton } from './solve';
import { solveTwoBoneChain } from './twoBoneIk';

/** Deterministic pseudo-random numbers in [0, 1). */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const allFinite = (v: Vec3): boolean => v.every(Number.isFinite);

describe('calibrateSkeleton', () => {
  it('is null without a head', () => {
    const { devices } = makeBody();
    expect(calibrateSkeleton({ ...devices, head: undefined }, 0)).toBeNull();
  });

  it('takes the height from the headset', () => {
    const calibration = calibrateSkeleton(makeBody({ height: 1.7, floor: 0.2 }).devices, 0.2);
    expect(calibration?.proportions.heightMeters).toBeCloseTo(1.7, 9);
  });

  it('keeps no offset for the head and the controllers', () => {
    const calibration = calibrateSkeleton(makeBody().devices, 0);
    expect(Object.keys(calibration?.jointOffsets ?? {}).sort()).toEqual(['left-foot', 'right-foot', 'waist']);
  });
});

describe('solveSkeleton', () => {
  it('puts hips and feet where the reference skeleton had them, at any turn of the body', () => {
    for (const yaw of [0, 1.1, -2.5]) {
      const reference = makeBody({ yaw: 0 });
      const calibration = calibrateSkeleton(reference.devices, 0);
      if (!calibration) throw new Error('no calibration');
      const turned = makeBody({ yaw });
      const pose = solveSkeleton(turned.devices, calibration, 0);
      expect(pose).not.toBeNull();
      expect(vec3Distance(pose?.joints.hips ?? [0, 0, 0], turned.hips)).toBeLessThan(1e-3);
      expect(vec3Distance(pose?.joints.leftFoot ?? [0, 0, 0], turned.leftFoot)).toBeLessThan(1e-3);
      expect(vec3Distance(pose?.joints.rightFoot ?? [0, 0, 0], turned.rightFoot)).toBeLessThan(1e-3);
      expect([...(pose?.drivenJoints ?? [])].sort()).toEqual(['head', 'hips', 'leftFoot', 'leftHand', 'rightFoot', 'rightHand'].sort());
    }
  });

  it('is null when the head is not tracking', () => {
    const { devices } = makeBody();
    const calibration = calibrateSkeleton(devices, 0);
    if (!calibration) throw new Error('no calibration');
    expect(solveSkeleton({ ...devices, head: undefined }, calibration, 0)).toBeNull();
  });

  it('places a foot without its tracker by inverse kinematics, on the floor under the hip', () => {
    const { devices } = makeBody();
    const calibration = calibrateSkeleton(devices, 0);
    if (!calibration) throw new Error('no calibration');
    const pose = solveSkeleton({ ...devices, 'left-foot': undefined }, calibration, 0);
    expect(pose?.drivenJoints.has('leftFoot')).toBe(false);
    expect(pose?.drivenJoints.has('rightFoot')).toBe(true);
    const foot = pose?.joints.leftFoot ?? [0, 0, 0];
    expect(foot[1]).toBeCloseTo(calibration.proportions.ankleHeight, 6);
    expect(foot[0]).toBeCloseTo(-calibration.proportions.hipWidth / 2, 6);
  });

  it('bends knees forward and elbows back', () => {
    const { devices } = makeBody({ variant: 'squat' });
    const calibration = calibrateSkeleton(makeBody().devices, 0);
    if (!calibration) throw new Error('no calibration');
    const pose = solveSkeleton(devices, calibration, 0);
    expect(pose?.joints.leftKnee[2] ?? 0).toBeLessThan(pose?.joints.leftHip[2] ?? 0);
    // Hands without controllers hang straight down, so the elbow can only bend back.
    const hanging = solveSkeleton({ head: devices.head }, calibration, 0);
    expect(hanging?.joints.leftElbow[2] ?? 0).toBeGreaterThan(hanging?.joints.leftShoulder[2] ?? 0);
  });

  it('never stretches a chain placed by inverse kinematics, wherever the head goes', () => {
    const calibration = calibrateSkeleton(makeBody().devices, 0);
    if (!calibration) throw new Error('no calibration');
    const p = calibration.proportions;
    const next = random(7);
    for (let i = 0; i < 300; i += 1) {
      const head: Pose = {
        position: [(next() - 0.5) * 4, (next() - 0.2) * 3, (next() - 0.5) * 4],
        rotation: quatFromAxisAngle([next() - 0.5, next() - 0.5, next() - 0.5], next() * 6),
      };
      const pose = solveSkeleton({ head }, calibration, 0);
      if (!pose) throw new Error('no pose');
      const j = pose.joints;
      for (const side of ['left', 'right'] as const) {
        const [hip, knee, foot, shoulder, elbow, hand] =
          side === 'left'
            ? [j.leftHip, j.leftKnee, j.leftFoot, j.leftShoulder, j.leftElbow, j.leftHand]
            : [j.rightHip, j.rightKnee, j.rightFoot, j.rightShoulder, j.rightElbow, j.rightHand];
        if (!hip || !knee || !foot || !shoulder || !elbow || !hand) throw new Error('missing joint');
        expect(vec3Distance(hip, knee)).toBeLessThanOrEqual(p.thigh + 1e-9);
        expect(vec3Distance(knee, foot)).toBeLessThanOrEqual(p.shin + 1e-9);
        expect(vec3Distance(shoulder, elbow)).toBeLessThanOrEqual(p.upperArm + 1e-9);
        expect(vec3Distance(elbow, hand)).toBeLessThanOrEqual(p.forearm + 1e-9);
      }
      for (const name of JOINT_NAMES) expect(allFinite(j[name])).toBe(true);
    }
  });
});

describe('solveTwoBoneChain', () => {
  const pole: Vec3 = [0, 0, -1];

  it('keeps both bone lengths for reachable targets and ends on the target', () => {
    const next = random(3);
    for (let i = 0; i < 200; i += 1) {
      const target: Vec3 = [(next() - 0.5) * 0.8, (next() - 0.5) * 0.8, (next() - 0.5) * 0.8];
      const chain = solveTwoBoneChain([0, 0, 0], target, 0.45, 0.4, pole);
      const distance = vec3Distance([0, 0, 0], target);
      if (distance >= 0.05 && distance <= 0.85) {
        expect(vec3Distance([0, 0, 0], chain.mid)).toBeCloseTo(0.45, 9);
        expect(vec3Distance(chain.mid, chain.end)).toBeCloseTo(0.4, 9);
        expect(vec3Distance(chain.end, target)).toBeLessThan(1e-9);
      }
    }
  });

  it('draws a chain straight and short of a target out of reach', () => {
    const chain = solveTwoBoneChain([0, 0, 0], [0, -3, 0], 0.45, 0.4, pole);
    expect(chain.end[1]).toBeCloseTo(-0.85, 9);
    expect(chain.mid[1]).toBeCloseTo(-0.45, 9);
    expect(Math.abs(chain.mid[2])).toBeLessThan(1e-6);
  });

  it('stays finite for a target at the joint, very far, or along the pole', () => {
    const cases: Vec3[] = [[0, 0, 0], [1e9, -1e9, 1e9], [0, 0, -1], [0, 0, 1e-300], [0.001, 0, 0]];
    for (const target of cases) {
      for (const [upper, lower] of [[0.45, 0.4], [0.4, 0.4]] as const) {
        const chain = solveTwoBoneChain([0, 0, 0], target, upper, lower, pole);
        expect(allFinite(chain.mid)).toBe(true);
        expect(allFinite(chain.end)).toBe(true);
      }
    }
  });
});
