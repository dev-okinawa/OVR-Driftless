import { describe, expect, it } from 'vitest';
import type { Pose } from '../domain/types';
import { vec3Distance } from '../math/vec3';
import { createProportions } from './proportions';
import { RIG_BONE_COUNT, rigBones } from './rigBones';
import { solveSkeleton, type SkeletonPose } from './solve';

const proportions = createProportions(1.8);
// The headset alone, at eye height, facing -Z: the body stands straight under it, the arms hang.
const solved = solveSkeleton({ head: { position: [0, proportions.eyeHeight, 0], rotation: [0, 0, 0, 1] } }, { proportions, jointOffsets: {} }, 0);
if (!solved) throw new Error('no pose for a tracked headset');
const pose: SkeletonPose = solved;
const bones = rigBones(pose, {}, 1.8);
const byName = (name: string) => bones.find((b) => b.name === name);

describe('rigBones', () => {
  it('draws the Unity humanoid rig with fingers and toes', () => {
    expect(bones).toHaveLength(RIG_BONE_COUNT);
    for (const name of ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head', 'LeftShoulder', 'RightToes', 'LeftThumbDistal', 'RightLittleProximal']) {
      expect(byName(name), name).toBeDefined();
    }
  });

  it('runs the spine from the hips up to the neck joint without gaps', () => {
    const chain = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head'].map(byName);
    expect(chain[0]?.head).toEqual(pose.joints.hips);
    chain.slice(1).forEach((bone, i) => expect(bone?.head).toEqual(chain[i]?.tail));
    expect(byName('UpperChest')?.tail).toEqual(pose.joints.neck);
  });

  it('draws the head from the chin to the top of the head, as wide as a head', () => {
    const head = byName('Head');
    expect(head?.head[1]).toBeCloseTo(0.87 * 1.8, 6);
    expect(head?.tail[1]).toBeCloseTo(1.8, 6);
    expect(head?.width).toBeCloseTo(0.085 * 1.8, 9);
    expect(head?.widest).toBe(0.4);
  });

  it('ends the forearm at the wrist, behind the grip, and the hand past it', () => {
    const lower = byName('LeftLowerArm');
    expect(vec3Distance(lower?.tail ?? [0, 0, 0], pose.joints.leftHand)).toBeCloseTo(0.04 * 1.8, 6);
    expect(byName('LeftHand')?.head).toEqual(lower?.tail);
  });

  it('turns the hand with a tracked controller', () => {
    const pointingUp: Pose = { position: pose.joints.rightHand, rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
    const turned = rigBones(pose, { 'right-hand': pointingUp }, 1.8).find((b) => b.name === 'RightHand');
    const plain = byName('RightHand');
    expect(turned?.tail).not.toEqual(plain?.tail);
  });

  it('stands the feet on the floor, pointing forward', () => {
    const toes = byName('LeftToes');
    expect(toes?.head[1]).toBeCloseTo(0, 6);
    expect(toes?.tail[2]).toBeLessThan(toes?.head[2] ?? 0);
  });

  it('marks strain on the model bones only; fingers are never marked', () => {
    expect(byName('LeftUpperLeg')?.strainBone).toBe('leftHip-leftKnee');
    expect(byName('Spine')?.strainBone).toBe('hips-chest');
    expect(byName('LeftIndexProximal')?.strainBone).toBeNull();
  });

  it('rings the tails of the fingertips, the toes and the head', () => {
    const leaves = bones.filter((b) => b.leaf).map((b) => b.name);
    expect(leaves).toContain('Head');
    expect(leaves).toContain('LeftToes');
    expect(leaves).toContain('RightIndexDistal');
    expect(leaves).not.toContain('Neck');
    expect(leaves).not.toContain('LeftUpperLeg');
  });
});
