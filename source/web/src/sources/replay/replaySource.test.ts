import { describe, expect, it } from 'vitest';
import type { Frame, SessionInfo } from '../../domain/types';
import type { Recording } from '../../recording/format';
import type { PoseSourceListener, SourceStatus } from '../source';
import { createReplaySource } from './replaySource';

function makeSession(ids: string[]): SessionInfo {
  return {
    devices: ids.map((id) => ({ id, role: 'tracker', trackingSystem: 'lighthouse', name: id, serial: id })),
    playAreas: [],
    floorHeight: 0,
  };
}

const s1 = makeSession(['a']);
const s2 = makeSession(['a', 'b']);

// 11 frames, one every 0.1 s: times 0 .. 1.0. The session changes at frame 5 (0.5 s).
const frames: Frame[] = Array.from({ length: 11 }, (_, i) => ({
  time: i / 10,
  devices: [{ id: 'a', state: 'tracking', pose: null }],
}));
const recording: Recording = {
  createdAt: 'x',
  sessions: [
    { time: 0, session: s1 },
    { time: 0.5, session: s2 },
  ],
  frames,
  annotations: [],
  truncated: false,
};

function setup(rec: Recording = recording) {
  let clock = 0;
  let timerCallback: (() => void) | null = null;
  let cancelled = false;
  const log: string[] = [];
  const statuses: SourceStatus[] = [];
  const listener: PoseSourceListener = {
    onStatus: (s) => statuses.push(s),
    onSession: (s) => log.push(s === s1 ? 's1' : 's2'),
    onFrame: (f) => log.push(`f${Math.round(f.time * 10)}`),
  };
  const source = createReplaySource(rec, {
    now: () => clock,
    schedule: (cb) => {
      timerCallback = cb;
      cancelled = false;
      return () => {
        timerCallback = null;
        cancelled = true;
      };
    },
  });
  const run = (ms: number, step = 10) => {
    for (let t = 0; t < ms; t += step) {
      clock += step;
      timerCallback?.();
    }
  };
  return { source, listener, log, statuses, run, isCancelled: () => cancelled };
}

describe('replay source', () => {
  it('emits every frame in order at speed 1, with the session first', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    run(1200);
    const frameLog = log.filter((e) => e.startsWith('f'));
    expect(frameLog).toEqual(Array.from({ length: 11 }, (_, i) => `f${i}`));
    expect(log[0]).toBe('s1');
    expect(log.indexOf('s2')).toBe(log.indexOf('f5') - 1);
  });

  it('reports connecting, running, then ended', () => {
    const { source, listener, statuses, run } = setup();
    source.start(listener);
    expect(statuses.map((s) => s.state)).toEqual(['connecting', 'running']);
    run(1200);
    expect(statuses.at(-1)?.state).toBe('ended');
    expect(source.controls.getSnapshot()).toMatchObject({ ended: true, playing: false });
  });

  it('plays twice as fast at speed 2', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    source.controls.setSpeed(2);
    run(250);
    expect(log.filter((e) => e.startsWith('f')).at(-1)).toBe('f5');
  });

  it('emits all due frames on a coarse tick', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    source.controls.setSpeed(4);
    run(200, 200);
    expect(log.filter((e) => e.startsWith('f'))).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']);
  });

  it('stops emitting while paused and resumes', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    run(200);
    source.controls.pause();
    const count = log.length;
    run(500);
    expect(log.length).toBe(count);
    source.controls.play();
    run(100);
    expect(log.length).toBeGreaterThan(count);
  });

  it('seeks while paused: session and frame at or before the time', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    source.controls.pause();
    log.length = 0;
    source.controls.seek(0.77);
    expect(log).toEqual(['s2', 'f7']);
    source.controls.seek(5);
    expect(source.controls.getSnapshot().time).toBe(1);
    expect(log.at(-1)).toBe('f10');
    run(100);
    expect(log.at(-1)).toBe('f10');
  });

  it('delivers the old session again after seeking back', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    run(700);
    log.length = 0;
    source.controls.seek(0.2);
    expect(log).toEqual(['s1', 'f2']);
    run(400);
    expect(log.indexOf('s2')).toBe(log.indexOf('f5') - 1);
  });

  it('restarts from 0 when played after the end', () => {
    const { source, listener, log, run } = setup();
    source.start(listener);
    run(1200);
    log.length = 0;
    source.controls.play();
    expect(log).toEqual(['s1', 'f0']);
    expect(source.controls.getSnapshot()).toMatchObject({ playing: true, ended: false });
  });

  it('emits nothing after stop', () => {
    const { source, listener, log, run, isCancelled } = setup();
    source.start(listener);
    run(100);
    source.stop();
    const count = log.length;
    run(500);
    source.controls.seek(0.5);
    source.controls.play();
    expect(log.length).toBe(count);
    expect(isCancelled()).toBe(true);
  });

  it('is unavailable for an empty recording', () => {
    const { source, listener, statuses } = setup({ ...recording, frames: [] });
    source.start(listener);
    expect(statuses.at(-1)?.state).toBe('unavailable');
    expect(statuses.at(-1)?.message).toBeTruthy();
  });
});
