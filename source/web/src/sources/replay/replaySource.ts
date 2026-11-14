import type { Recording } from '../../recording/format';
import type { PoseSource, PoseSourceListener } from '../source';

export interface ReplaySnapshot {
  readonly playing: boolean;
  /** Seconds from the start of the recording. */
  readonly time: number;
  readonly duration: number;
  readonly speed: number;
  readonly ended: boolean;
}

export interface ReplayControls {
  play(): void;
  pause(): void;
  /** Clamped to [0, duration]. */
  seek(time: number): void;
  setSpeed(speed: number): void;
  readonly getSnapshot: () => ReplaySnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface ReplaySource extends PoseSource {
  readonly controls: ReplayControls;
  readonly recording: Recording;
}

export interface ReplayOptions {
  /** Wall clock in milliseconds. */
  readonly now?: () => number;
  /** Calls `callback` every `intervalMs` until the returned function is called. */
  readonly schedule?: (callback: () => void, intervalMs: number) => () => void;
}

const TICK_MS = 16;
/** The snapshot drives React, so its time is refreshed a few times a second, not on every tick. */
const SNAPSHOT_INTERVAL_MS = 250;

function defaultSchedule(callback: () => void, intervalMs: number): () => void {
  const id = setInterval(callback, intervalMs);
  return () => clearInterval(id);
}

export function createReplaySource(recording: Recording, options: ReplayOptions = {}): ReplaySource {
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? defaultSchedule;
  const { frames, sessions } = recording;
  const duration = frames.length > 0 ? (frames[frames.length - 1]?.time ?? 0) : 0;

  let listener: PoseSourceListener | null = null;
  let stopped = false;
  let cancelTimer: (() => void) | null = null;

  let playing = false;
  let ended = false;
  let time = 0;
  let speed = 1;
  let next = 0; // index of the next frame to emit
  let emittedSession = -1; // index in `sessions` of the session last sent
  let lastWall = 0;
  let lastSnapshotWall = 0;

  let snapshot: ReplaySnapshot = { playing, time, duration, speed, ended };
  const snapshotListeners = new Set<() => void>();

  function publish(): void {
    snapshot = { playing, time, duration, speed, ended };
    lastSnapshotWall = now();
    for (const l of snapshotListeners) l();
  }

  function sessionIndexAt(frameTime: number): number {
    let found = 0;
    for (let i = 0; i < sessions.length; i++) {
      if ((sessions[i]?.time ?? 0) <= frameTime) found = i;
      else break;
    }
    return found;
  }

  function emitFrame(index: number): void {
    const frame = frames[index];
    if (!listener || !frame) return;
    const sessionIndex = sessionIndexAt(frame.time);
    const session = sessions[sessionIndex]?.session;
    if (session && sessionIndex !== emittedSession) {
      emittedSession = sessionIndex;
      listener.onSession(session);
    }
    listener.onFrame(frame);
  }

  /** Jumps to `target`: emits the frame at or just before it, with its session. */
  function jumpTo(target: number): void {
    time = Math.min(Math.max(target, 0), duration);
    let index = 0;
    for (let i = 0; i < frames.length; i++) {
      if ((frames[i]?.time ?? 0) <= time) index = i;
      else break;
    }
    emitFrame(index);
    next = index + 1;
  }

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function finish(): void {
    stopTimer();
    playing = false;
    ended = true;
    time = duration;
    listener?.onStatus({ state: 'ended' });
    publish();
  }

  /** Moves the position forward by the wall time since the last call and emits what became due. */
  function advance(): void {
    const wall = now();
    time = Math.min(time + ((wall - lastWall) / 1000) * speed, duration);
    lastWall = wall;
    while (next < frames.length && (frames[next]?.time ?? 0) <= time) {
      emitFrame(next);
      next++;
    }
  }

  function tick(): void {
    if (stopped || !playing) return;
    advance();
    if (stopped) return;
    if (time >= duration && next >= frames.length) finish();
    else if (now() - lastSnapshotWall >= SNAPSHOT_INTERVAL_MS) publish();
  }

  function play(): void {
    if (stopped || playing || frames.length === 0) return;
    if (ended) {
      ended = false;
      jumpTo(0);
      listener?.onStatus({ state: 'running' });
    }
    playing = true;
    lastWall = now();
    cancelTimer = schedule(tick, TICK_MS);
    publish();
  }

  function pause(): void {
    if (stopped || !playing) return;
    advance();
    stopTimer();
    playing = false;
    publish();
  }

  function seek(target: number): void {
    if (stopped || frames.length === 0) return;
    const wasEnded = ended;
    ended = false;
    jumpTo(target);
    lastWall = now();
    if (wasEnded) listener?.onStatus({ state: 'running' });
    // Playing on from the very end has nothing left to play.
    if (playing && time >= duration) finish();
    else publish();
  }

  function setSpeed(value: number): void {
    if (stopped || !(value > 0)) return;
    if (playing) advance();
    speed = value;
    publish();
  }

  const controls: ReplayControls = {
    play,
    pause,
    seek,
    setSpeed,
    getSnapshot: () => snapshot,
    subscribe: (l) => {
      snapshotListeners.add(l);
      return () => snapshotListeners.delete(l);
    },
  };

  return {
    kind: 'replay',
    controls,
    recording,
    start(l) {
      if (stopped || listener) return;
      listener = l;
      l.onStatus({ state: 'connecting' });
      if (frames.length === 0) {
        l.onStatus({ state: 'unavailable', message: 'The recording contains no frames.' });
        return;
      }
      l.onStatus({ state: 'running' });
      jumpTo(0);
      play();
    },
    stop() {
      stopped = true;
      stopTimer();
      playing = false;
      listener = null;
      snapshotListeners.clear();
    },
  };
}
