import { describe, expect, it } from 'vitest';
import type { Frame, SessionInfo } from '../domain/types';
import type { PoseSource, PoseSourceListener } from '../sources/source';
import { SessionStore } from './sessionStore';

class FakeSource implements PoseSource {
  readonly kind = 'live' as const;
  listener: PoseSourceListener | null = null;
  start(listener: PoseSourceListener): void {
    this.listener = listener;
  }
  stop(): void {
    this.listener = null;
  }
}

const SESSION: SessionInfo = {
  devices: [{ id: 'HMD', role: 'headset', trackingSystem: 'headset', name: 'Quest', serial: 'HMD' }],
  playAreas: [],
  floorHeight: 0,
};
const FRAME: Frame = { time: 1, devices: [{ id: 'HMD', state: 'tracking', pose: { position: [0, 1.6, 0], rotation: [0, 0, 0, 1] } }] };

describe('SessionStore', () => {
  it.each(['unavailable', 'connecting'] as const)('drops the session and the frame when the source turns %s', (state) => {
    const store = new SessionStore();
    const source = new FakeSource();
    store.attach(source);
    source.listener?.onSession(SESSION);
    source.listener?.onStatus({ state: 'running' });
    source.listener?.onFrame(FRAME);
    expect(store.frame).toBe(FRAME);

    source.listener?.onStatus(state === 'unavailable' ? { state, message: 'SteamVR has closed.' } : { state });
    expect(store.frame).toBeNull();
    expect(store.getSnapshot().session).toBeNull();
    expect(store.getSnapshot().deviceStates).toEqual({});
    expect(store.getSnapshot().status?.state).toBe(state);
  });

  it('keeps the session when the source runs or ends', () => {
    const store = new SessionStore();
    const source = new FakeSource();
    store.attach(source);
    source.listener?.onSession(SESSION);
    source.listener?.onFrame(FRAME);
    source.listener?.onStatus({ state: 'ended' });
    expect(store.getSnapshot().session).toBe(SESSION);
    expect(store.frame).toBe(FRAME);
  });
});
