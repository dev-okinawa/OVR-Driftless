import { describe, expect, it } from 'vitest';
import type { Frame, SessionInfo } from '../../domain/types';
import type { OriginChange, PoseSourceListener, SourceStatus } from '../source';
import { createSimulatorSource } from './simulatorSource';

function setup() {
  let nowMs = 0;
  let tick: (() => void) | null = null;
  const events: string[] = [];
  const frames: Frame[] = [];
  const sessions: SessionInfo[] = [];
  const listener: PoseSourceListener = {
    onStatus: (status: SourceStatus) => events.push(`status:${status.state}`),
    onSession: (session) => {
      sessions.push(session);
      events.push('session');
    },
    onFrame: (frame) => {
      frames.push(frame);
      events.push('frame');
    },
  };
  const source = createSimulatorSource({
    rateHz: 10,
    now: () => nowMs,
    timer: {
      schedule(callback) {
        tick = callback;
        return () => {
          tick = null;
        };
      },
    },
  });
  return {
    source,
    events,
    frames,
    sessions,
    listener,
    advance(ms: number) {
      nowMs += ms;
      tick?.();
    },
    isScheduled: () => tick !== null,
    // Calls the timer callback even after stop, as a timer that fires late would.
    fireStale: () => {
      nowMs += 100;
      tick?.();
    },
  };
}

describe('simulator source', () => {
  it('is simulated', () => {
    expect(setup().source.kind).toBe('simulated');
  });

  it('reports connecting, then a session, then running, then frames', () => {
    const { source, listener, events, advance } = setup();
    source.start(listener);
    advance(100);
    expect(events).toEqual(['status:connecting', 'session', 'status:running', 'frame', 'frame']);
  });

  it('emits frames in time order', () => {
    const { source, listener, frames, advance } = setup();
    source.start(listener);
    advance(100);
    advance(100);
    expect(frames.map((frame) => frame.time)).toEqual([0, 0.1, 0.2]);
  });

  it('sends the session again when it changes, before the frame that needs it', () => {
    const { source, listener, events, sessions, advance } = setup();
    source.start(listener);
    advance(100);
    source.controls.setDevicePresent('tracker-waist', false);
    advance(100);
    expect(sessions).toHaveLength(2);
    expect(events.slice(-2)).toEqual(['session', 'frame']);
  });

  it('emits nothing after stop', () => {
    const { source, listener, events, isScheduled, fireStale } = setup();
    source.start(listener);
    source.stop();
    const count = events.length;
    expect(isScheduled()).toBe(false);
    fireStale();
    expect(events).toHaveLength(count);
  });

  it('notifies subscribers and keeps the state object stable between changes', () => {
    const { source } = setup();
    let calls = 0;
    const unsubscribe = source.controls.subscribe(() => {
      calls += 1;
    });
    const state = source.controls.getState();
    expect(source.controls.getState()).toBe(state);
    source.controls.setPaused(true);
    expect(calls).toBe(1);
    expect(source.controls.getState()).not.toBe(state);
    unsubscribe();
    source.controls.setPaused(false);
    expect(calls).toBe(1);
  });

  it('reports the misalignment in time with the injected clock', () => {
    const { source, listener, advance } = setup();
    source.start(listener);
    source.controls.setDriftRate({ yawDegPerMinute: 6, positionMmPerMinute: 0 });
    advance(30_000);
    const yaw = (2 * Math.asin(Math.abs(source.controls.getTrueMisalignment().rotation[1])) * 180) / Math.PI;
    expect(yaw).toBeCloseTo(3, 3);
  });

  it('announces an origin change of the headset system on a jump', () => {
    const { source, listener, advance } = setup();
    const origins: OriginChange[] = [];
    source.start({ ...listener, onOriginChange: (change) => origins.push(change) });
    advance(200);
    source.controls.jump({ yawDeg: 10, offsetMm: 100 });
    expect(origins).toEqual([{ time: 0.2, trackingSystem: 'headset' }]);
  });

  it('announces an origin change of both systems when the misalignment is reset', () => {
    const { source, listener, advance } = setup();
    const origins: OriginChange[] = [];
    source.start({ ...listener, onOriginChange: (change) => origins.push(change) });
    advance(100);
    source.controls.resetMisalignment();
    expect(origins.map((change) => change.trackingSystem)).toEqual(['headset', 'lighthouse']);
  });

  it('works for a listener that does not implement onOriginChange', () => {
    const { source, listener } = setup();
    source.start(listener);
    expect(() => source.controls.jump({ yawDeg: 10, offsetMm: 100 })).not.toThrow();
  });
});
