import { describe, expect, it } from 'vitest';
import type { DeviceState, Frame } from '../domain/types';
import { PairSampler } from './pairSampler';

const IDENTITY = [0, 0, 0, 1] as const;

function frame(time: number, controller: DeviceState = 'tracking', tracker: DeviceState = 'tracking'): Frame {
  return {
    time,
    devices: [
      { id: 'c', state: controller, pose: { position: [0, 1, 0], rotation: IDENTITY } },
      { id: 't', state: tracker, pose: { position: [1, 1, 1], rotation: IDENTITY } },
    ],
  };
}

describe('PairSampler', () => {
  it('samples at the configured rate of frame time, not at the frame rate', () => {
    const sampler = new PairSampler(20);
    let taken = 0;
    for (let i = 0; i < 600; i++) {
      if (sampler.take(frame(i / 60), 'c', 't').sample) taken += 1;
    }
    // 10 seconds at 20 Hz.
    expect(taken).toBeGreaterThanOrEqual(199);
    expect(taken).toBeLessThanOrEqual(201);
  });

  it('takes the controller pose and the tracker position', () => {
    const { sample } = new PairSampler(20).take(frame(2), 'c', 't');
    expect(sample).toEqual({ time: 2, headsetFromController: { position: [0, 1, 0], rotation: IDENTITY }, trackerInLighthouse: [1, 1, 1] });
  });

  it('reports the device that is not tracking and takes no sample', () => {
    const sampler = new PairSampler(20);
    expect(sampler.take(frame(0, 'tracking-lost'), 'c', 't')).toEqual({ sample: null, pausedDeviceId: 'c' });
    expect(sampler.take(frame(0, 'tracking', 'disconnected'), 'c', 't')).toEqual({ sample: null, pausedDeviceId: 't' });
    expect(sampler.take(frame(0), 'c', 'missing')).toEqual({ sample: null, pausedDeviceId: 'missing' });
  });

  it('samples again at once after a pause and after a reset', () => {
    const sampler = new PairSampler(20);
    expect(sampler.take(frame(0), 'c', 't').sample).not.toBeNull();
    expect(sampler.take(frame(0.01), 'c', 't').sample).toBeNull();
    sampler.take(frame(0.02, 'disconnected'), 'c', 't');
    expect(sampler.take(frame(0.03), 'c', 't').sample).toBeNull();
    sampler.reset();
    expect(sampler.take(frame(0.04), 'c', 't').sample).not.toBeNull();
  });
});
