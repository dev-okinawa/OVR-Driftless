import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bodyPartOf, deviceRole, deviceState, poseFromMatrix34, trackingSystemOf } from './convert.ts';

const close = (actual: readonly number[], expected: readonly number[]): void => {
  actual.forEach((value, i) => assert.ok(Math.abs(value - (expected[i] ?? NaN)) < 1e-6, `${actual} != ${expected}`));
};

describe('poseFromMatrix34', () => {
  it('reads the translation from the last column', () => {
    const pose = poseFromMatrix34([1, 0, 0, 0.5, 0, 1, 0, 1.6, 0, 0, 1, -2]);
    close(pose.position, [0.5, 1.6, -2]);
    close(pose.rotation, [0, 0, 0, 1]);
  });

  it('turns a 90° yaw about +Y into its quaternion', () => {
    // Rotation about +Y by 90°: x → -z, z → x.
    const pose = poseFromMatrix34([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0]);
    close(pose.rotation, [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  });

  it('handles a half turn, where the trace is negative', () => {
    const pose = poseFromMatrix34([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0]);
    close(pose.rotation.map(Math.abs), [0, 1, 0, 0]);
  });
});

describe('device rules', () => {
  it('maps device classes to roles and leaves out the rest', () => {
    assert.equal(deviceRole(1), 'headset');
    assert.equal(deviceRole(2), 'controller');
    assert.equal(deviceRole(3), 'tracker');
    assert.equal(deviceRole(4), 'base-station');
    assert.equal(deviceRole(5), null);
    assert.equal(deviceRole(0), null);
  });

  it('puts the HMD in the headset system whatever its driver', () => {
    assert.equal(trackingSystemOf('headset', 'lighthouse'), 'headset');
    assert.equal(trackingSystemOf('tracker', 'lighthouse'), 'lighthouse');
    assert.equal(trackingSystemOf('base-station', 'lighthouse'), 'lighthouse');
    assert.equal(trackingSystemOf('controller', 'oculus'), 'headset');
  });

  it('tracks only a connected, valid, Running_OK pose', () => {
    assert.equal(deviceState(false, true, 200), 'disconnected');
    assert.equal(deviceState(true, true, 200), 'tracking');
    assert.equal(deviceState(true, true, 201), 'tracking-lost');
    assert.equal(deviceState(true, false, 200), 'tracking-lost');
  });

  it('gives body parts from the class, the controller role and the tracker role', () => {
    assert.equal(bodyPartOf('headset', 0, undefined), 'head');
    assert.equal(bodyPartOf('controller', 1, undefined), 'left-hand');
    assert.equal(bodyPartOf('controller', 2, undefined), 'right-hand');
    assert.equal(bodyPartOf('controller', 0, undefined), undefined);
    assert.equal(bodyPartOf('tracker', 0, 'TrackerRole_Waist'), 'waist');
    assert.equal(bodyPartOf('tracker', 0, 'TrackerRole_LeftFoot'), 'left-foot');
    assert.equal(bodyPartOf('tracker', 0, 'TrackerRole_Camera'), undefined);
    assert.equal(bodyPartOf('base-station', 0, undefined), undefined);
  });
});
