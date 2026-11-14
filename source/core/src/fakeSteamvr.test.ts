import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deviceState } from './convert.ts';
import { fakePoses } from './fakeSteamvr.ts';

const states = (t: number): string[] => fakePoses(t).slice(0, 8).map((pose) => deviceState(pose.connected, pose.valid, pose.trackingResult));

describe('fake SteamVR', () => {
  it('tracks every device most of the time', () => {
    assert.deepEqual(states(1), Array(8).fill('tracking'));
  });

  it('loses the left foot tracker and switches the right controller off on schedule', () => {
    assert.equal(states(16)[4], 'tracking-lost');
    assert.equal(states(25)[2], 'disconnected');
  });

  it('stands the headset at head height and the feet near the floor', () => {
    const poses = fakePoses(3);
    assert.ok((poses[0]?.matrix[7] ?? 0) > 1.5);
    assert.ok((poses[5]?.matrix[7] ?? 1) < 0.2);
  });
});
