import type { Frame, SessionInfo } from '../domain/types';
import type { SessionStore } from '../state/sessionStore';
import type { Recording, RecordingAnnotation } from './format';

export interface RecorderSnapshot {
  readonly isRecording: boolean;
  readonly frameCount: number;
  readonly durationSeconds: number;
}

export interface RecorderOptions {
  readonly now?: () => Date;
}

/** The snapshot drives React, so it is refreshed a few times a second, not on every frame. */
const SNAPSHOT_INTERVAL_MS = 250;

const IDLE: RecorderSnapshot = { isRecording: false, frameCount: 0, durationSeconds: 0 };

/** Captures what the store's source emits. It only listens: the live view is not affected. */
export class Recorder {
  private readonly now: () => Date;
  private unsubscribeFrames: (() => void) | null = null;
  private snapshot: RecorderSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();

  private createdAt = '';
  private firstFrameTime: number | null = null;
  private lastTime = 0;
  private lastSession: SessionInfo | null = null;
  private lastSnapshotAt = 0;
  private sessions: { time: number; session: SessionInfo }[] = [];
  private frames: Frame[] = [];
  private annotations: RecordingAnnotation[] = [];

  constructor(
    private readonly store: SessionStore,
    options: RecorderOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.unsubscribeFrames) return;
    const now = this.now();
    this.createdAt = now.toISOString();
    this.firstFrameTime = null;
    this.lastTime = 0;
    this.lastSession = null;
    this.sessions = [];
    this.frames = [];
    this.annotations = [];
    this.lastSnapshotAt = now.getTime();
    this.unsubscribeFrames = this.store.subscribeFrames((frame, session) => this.capture(frame, session));
    this.setSnapshot({ isRecording: true, frameCount: 0, durationSeconds: 0 });
  }

  stop(): Recording {
    this.unsubscribeFrames?.();
    this.unsubscribeFrames = null;
    const recording: Recording = {
      createdAt: this.createdAt,
      sessions: this.sessions,
      frames: this.frames,
      annotations: this.annotations,
      truncated: false,
    };
    this.sessions = [];
    this.frames = [];
    this.annotations = [];
    this.lastSession = null;
    this.setSnapshot(IDLE);
    return recording;
  }

  addAnnotation(kind: string, data: unknown): void {
    if (!this.unsubscribeFrames) return;
    this.annotations.push({ time: this.lastTime, kind, data });
  }

  readonly getSnapshot = (): RecorderSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private capture(frame: Frame, session: SessionInfo): void {
    this.firstFrameTime ??= frame.time;
    // Times of a recording start at 0.
    const time = frame.time - this.firstFrameTime;
    if (session !== this.lastSession) {
      this.sessions.push({ time, session });
      this.lastSession = session;
    }
    this.frames.push({ time, devices: frame.devices });
    this.lastTime = time;

    const nowMs = this.now().getTime();
    if (nowMs - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      this.lastSnapshotAt = nowMs;
      this.setSnapshot({ isRecording: true, frameCount: this.frames.length, durationSeconds: time });
    }
  }

  private setSnapshot(snapshot: RecorderSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
