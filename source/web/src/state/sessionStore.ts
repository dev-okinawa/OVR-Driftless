import type { DeviceState, Frame, SessionInfo } from '../domain/types';
import type { PoseSource, PoseSourceListener, SourceKind, SourceStatus } from '../sources/source';

/** The slowly changing part of the session, for React through `useSyncExternalStore`. */
export interface SessionSnapshot {
  readonly sourceKind: SourceKind | null;
  readonly status: SourceStatus | null;
  readonly session: SessionInfo | null;
  /** State of every device of the session, by device id. */
  readonly deviceStates: Readonly<Record<string, DeviceState>>;
}

export type FrameListener = (frame: Frame, session: SessionInfo) => void;

const EMPTY_SNAPSHOT: SessionSnapshot = { sourceKind: null, status: null, session: null, deviceStates: {} };

/**
 * The single place the current source feeds into.
 *
 * Two channels with different rates:
 * - the snapshot changes rarely (status, device list, device states) and drives React;
 * - frames arrive many times a second and go to frame listeners directly, never through React state.
 */
export class SessionStore implements PoseSourceListener {
  private source: PoseSource | null = null;
  private snapshot: SessionSnapshot = EMPTY_SNAPSHOT;
  private latestFrame: Frame | null = null;
  private readonly snapshotListeners = new Set<() => void>();
  private readonly frameListeners = new Set<FrameListener>();

  /** Replaces the current source: stops the old one, clears the session, starts the new one. */
  attach(source: PoseSource): void {
    this.detach();
    this.source = source;
    this.setSnapshot({ ...EMPTY_SNAPSHOT, sourceKind: source.kind, status: { state: 'connecting' } });
    source.start(this);
  }

  detach(): void {
    this.source?.stop();
    this.source = null;
    this.latestFrame = null;
    this.setSnapshot(EMPTY_SNAPSHOT);
  }

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  /** The most recent frame of the current source, or null before the first one. */
  get frame(): Frame | null {
    return this.latestFrame;
  }

  /** Calls `listener` for every frame from now on. Returns the function that unsubscribes. */
  subscribeFrames(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Without data there is nothing current to draw, measure or record: connecting and unavailable drop the session. */
  onStatus(status: SourceStatus): void {
    if (status.state === 'connecting' || status.state === 'unavailable') {
      this.latestFrame = null;
      this.setSnapshot({ ...this.snapshot, status, session: null, deviceStates: {} });
      return;
    }
    this.setSnapshot({ ...this.snapshot, status });
  }

  onSession(session: SessionInfo): void {
    const deviceStates: Record<string, DeviceState> = {};
    for (const device of session.devices) deviceStates[device.id] = this.snapshot.deviceStates[device.id] ?? 'disconnected';
    this.setSnapshot({ ...this.snapshot, session, deviceStates });
  }

  onFrame(frame: Frame): void {
    const session = this.snapshot.session;
    if (!session) return;
    this.latestFrame = frame;

    let changedStates: Record<string, DeviceState> | null = null;
    for (const sample of frame.devices) {
      if (this.snapshot.deviceStates[sample.id] !== sample.state) {
        changedStates ??= { ...this.snapshot.deviceStates };
        changedStates[sample.id] = sample.state;
      }
    }
    if (changedStates) this.setSnapshot({ ...this.snapshot, deviceStates: changedStates });

    for (const listener of this.frameListeners) listener(frame, session);
  }

  private setSnapshot(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.snapshotListeners) listener();
  }
}
