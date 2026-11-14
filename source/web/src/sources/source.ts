import type { Frame, SessionInfo, TrackingSystem } from '../domain/types';

/** Where the data comes from. The UI shows it, so that simulated or replayed data is never taken for live data. */
export type SourceKind = 'simulated' | 'replay' | 'live';

export interface SourceStatus {
  /**
   * - `connecting`: started, no data yet;
   * - `running`: frames are arriving;
   * - `unavailable`: the data cannot be had (VR runtime not running, file unreadable); `message` says why;
   * - `ended`: the source has no more frames (end of a replay).
   */
  readonly state: 'connecting' | 'running' | 'unavailable' | 'ended';
  readonly message?: string;
}

/** The origin of one tracking system moved, for example a headset recenter. Poses before and after are in different spaces. */
export interface OriginChange {
  /** Frame time of the source when it happened, seconds. */
  readonly time: number;
  readonly trackingSystem: TrackingSystem;
}

export interface PoseSourceListener {
  onStatus(status: SourceStatus): void;
  /** Called before the first frame, and again whenever a device joins or leaves or a play area changes. */
  onSession(session: SessionInfo): void;
  /** Called for every frame, in time order. Each frame matches the most recent session. */
  onFrame(frame: Frame): void;
  /** Optional: a source that cannot know about origin changes never calls it. */
  onOriginChange?(change: OriginChange): void;
}

/**
 * A stream of sessions and frames. The simulator, a replay and the live connection all implement it,
 * and nothing downstream knows which one it is fed by, except through `kind`.
 */
export interface PoseSource {
  readonly kind: SourceKind;
  /** Starts producing data. Called once. */
  start(listener: PoseSourceListener): void;
  /** Stops producing data and releases timers and handles. No listener call happens after it returns. */
  stop(): void;
}
