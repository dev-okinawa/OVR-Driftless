import type { Pose, SessionInfo, TrackingSystem } from '../../domain/types';
import type { PoseSource, PoseSourceListener } from '../source';
import { createSimulatorModel } from './model';
import type { SimulatorOptions, SimulatorSettings, SimulatorState } from './model';

/** What the control panel works with: the changes, the state for `useSyncExternalStore`, and the live misalignment. */
export interface SimulatorControls extends SimulatorSettings {
  /** The same object until something changes. */
  getState(): SimulatorState;
  /** Returns the function that removes the listener. */
  subscribe(listener: () => void): () => void;
  /** `headsetWorldFromLighthouseWorld` now. Identity when aligned. */
  getTrueMisalignment(): Pose;
}

export interface SimulatorSource extends PoseSource {
  readonly kind: 'simulated';
  readonly controls: SimulatorControls;
}

/** Repeats `callback` every `intervalMs` until the returned function is called. Injectable so tests need no real time. */
export interface SimulatorTimer {
  schedule(callback: () => void, intervalMs: number): () => void;
}

export interface SimulatorSourceOptions {
  readonly model?: SimulatorOptions;
  /** Frames per second. Default 60. */
  readonly rateHz?: number;
  /** Current time in milliseconds. Default `performance.now`. */
  readonly now?: () => number;
  /** Default: `setInterval`. */
  readonly timer?: SimulatorTimer;
}

const DEFAULT_RATE_HZ = 60;

const intervalTimer: SimulatorTimer = {
  schedule(callback, intervalMs) {
    const handle = setInterval(callback, intervalMs);
    return () => clearInterval(handle);
  },
};

export function createSimulatorSource(options: SimulatorSourceOptions = {}): SimulatorSource {
  const model = createSimulatorModel(options.model);
  const now = options.now ?? (() => performance.now());
  const timer = options.timer ?? intervalTimer;
  const intervalMs = 1000 / (options.rateHz ?? DEFAULT_RATE_HZ);

  const subscribers = new Set<() => void>();
  let listener: PoseSourceListener | null = null;
  let cancelTimer: (() => void) | null = null;
  let startedAt = 0;
  let announcedSession: SessionInfo | null = null;

  function notify(): void {
    for (const subscriber of [...subscribers]) subscriber();
  }

  /** Wraps a model change so that subscribers hear about it. */
  function notifying<Args extends unknown[]>(change: (...args: Args) => void): (...args: Args) => void {
    return (...args) => {
      change(...args);
      notify();
    };
  }

  function currentTime(): number {
    return Math.max(0, (now() - startedAt) / 1000);
  }

  function emit(): void {
    const target = listener;
    if (target === null) return;
    const { session, frame } = model.sample(currentTime());
    if (session !== announcedSession) {
      announcedSession = session;
      target.onSession(session);
      if (listener !== target) return;
    }
    target.onFrame(frame);
  }

  function announceOrigin(trackingSystem: TrackingSystem): void {
    listener?.onOriginChange?.({ time: currentTime(), trackingSystem });
  }

  const controls: SimulatorControls = {
    getState: () => model.getState(),
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    getTrueMisalignment: () => model.getTrueMisalignment(currentTime()),
    setMotion: notifying(model.setMotion),
    setPaused: notifying(model.setPaused),
    setDriftRate: notifying(model.setDriftRate),
    jump(jump) {
      model.jump(jump);
      announceOrigin('headset');
      notify();
    },
    resetMisalignment() {
      model.resetMisalignment();
      announceOrigin('headset');
      announceOrigin('lighthouse');
      notify();
    },
    setDeviceTracking: notifying(model.setDeviceTracking),
    setDeviceConnected: notifying(model.setDeviceConnected),
    setDevicePresent: notifying(model.setDevicePresent),
    setPairAttached: notifying(model.setPairAttached),
  };

  return {
    kind: 'simulated',
    controls,

    start(target) {
      listener = target;
      startedAt = now();
      target.onStatus({ state: 'connecting' });
      if (listener !== target) return;
      const first = model.sample(0);
      announcedSession = first.session;
      target.onSession(first.session);
      if (listener !== target) return;
      target.onStatus({ state: 'running' });
      if (listener !== target) return;
      target.onFrame(first.frame);
      if (listener !== target) return;
      cancelTimer = timer.schedule(emit, intervalMs);
    },

    stop() {
      listener = null;
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}
