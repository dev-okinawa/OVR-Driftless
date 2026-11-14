import { describe, expect, it } from 'vitest';
import type { Frame, SessionInfo } from '../domain/types';
import type { PoseSourceListener } from '../sources/source';
import { SessionStore } from '../state/sessionStore';
import { Recorder } from './recorder';

function makeSession(ids: string[]): SessionInfo {
  return {
    devices: ids.map((id) => ({ id, role: 'tracker', trackingSystem: 'lighthouse', name: id, serial: id })),
    playAreas: [],
    floorHeight: 0,
  };
}

function makeFrame(time: number, ids: string[]): Frame {
  return { time, devices: ids.map((id) => ({ id, state: 'tracking', pose: null })) };
}

function setup() {
  let feed!: PoseSourceListener;
  const store = new SessionStore();
  store.attach({ kind: 'simulated', start: (l) => (feed = l), stop: () => {} });
  let clock = 0;
  const recorder = new Recorder(store, { now: () => new Date(clock) });
  return { store, feed, recorder, advance: (ms: number) => (clock += ms) };
}

describe('Recorder', () => {
  it('starts times at 0 and captures session changes', () => {
    const { feed, recorder } = setup();
    feed.onSession(makeSession(['a']));
    recorder.start();
    feed.onFrame(makeFrame(10, ['a']));
    feed.onFrame(makeFrame(10.5, ['a']));
    feed.onSession(makeSession(['a', 'b']));
    feed.onFrame(makeFrame(11, ['a', 'b']));
    const rec = recorder.stop();
    expect(rec.frames.map((f) => f.time)).toEqual([0, 0.5, 1]);
    expect(rec.sessions.map((s) => s.time)).toEqual([0, 1]);
    expect(rec.sessions[1]?.session.devices).toHaveLength(2);
  });

  it('stamps annotations with the latest frame time and ignores them when idle', () => {
    const { feed, recorder } = setup();
    feed.onSession(makeSession(['a']));
    recorder.addAnnotation('ignored', 1);
    recorder.start();
    feed.onFrame(makeFrame(5, ['a']));
    feed.onFrame(makeFrame(7, ['a']));
    recorder.addAnnotation('pair', { x: 1 });
    const rec = recorder.stop();
    expect(rec.annotations).toEqual([{ time: 2, kind: 'pair', data: { x: 1 } }]);
  });

  it('captures nothing after stop', () => {
    const { feed, recorder } = setup();
    feed.onSession(makeSession(['a']));
    recorder.start();
    feed.onFrame(makeFrame(0, ['a']));
    recorder.stop();
    feed.onFrame(makeFrame(1, ['a']));
    expect(recorder.getSnapshot().isRecording).toBe(false);
    expect(recorder.stop().frames).toHaveLength(0);
  });

  it('refreshes the snapshot a few times a second only', () => {
    const { feed, recorder, advance } = setup();
    feed.onSession(makeSession(['a']));
    recorder.start();
    const first = recorder.getSnapshot();
    feed.onFrame(makeFrame(0, ['a']));
    advance(10);
    feed.onFrame(makeFrame(0.01, ['a']));
    expect(recorder.getSnapshot()).toBe(first);
    advance(300);
    feed.onFrame(makeFrame(0.31, ['a']));
    expect(recorder.getSnapshot()).toMatchObject({ isRecording: true, frameCount: 3 });
  });
});
