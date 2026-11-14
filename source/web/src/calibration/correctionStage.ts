import type { Frame, Pose, SessionInfo } from '../domain/types';
import type { OriginChange, PoseSource, PoseSourceListener, SourceKind } from '../sources/source';
import { correctFrame, correctSession, lighthouseDeviceIds } from './applyCorrection';

export interface CorrectionSnapshot {
  readonly headsetFromLighthouse: Pose | null;
}

export type RawFrameListener = (frame: Frame, session: SessionInfo) => void;
export type OriginListener = (change: OriginChange) => void;

/** One wrapped source: what the stage knows about the source it currently serves. */
interface Wrapped {
  readonly kind: SourceKind;
  downstream: PoseSourceListener | null;
  rawSession: SessionInfo | null;
  /** Lighthouse devices of `rawSession`, computed once per session. */
  lighthouseIds: ReadonlySet<string>;
}

const NO_CORRECTION: CorrectionSnapshot = { headsetFromLighthouse: null };

/**
 * Sits between a source and the `SessionStore`: everything downstream sees Lighthouse poses moved by
 * `headsetFromLighthouse`, while the calibration taps the raw poses. A replay is never corrected.
 */
export class CorrectionStage {
  private snapshot: CorrectionSnapshot = NO_CORRECTION;
  private wrapped: Wrapped | null = null;
  private cachedSession: { readonly raw: SessionInfo; readonly correction: Pose; readonly corrected: SessionInfo } | null = null;
  private readonly snapshotListeners = new Set<() => void>();
  private readonly rawListeners = new Set<RawFrameListener>();
  private readonly originListeners = new Set<OriginListener>();

  /** The source to attach to the store. A new source has new tracking spaces, so the correction is cleared. */
  wrap(source: PoseSource): PoseSource {
    const wrapped: Wrapped = { kind: source.kind, downstream: null, rawSession: null, lighthouseIds: new Set() };
    this.wrapped = wrapped;
    this.setCorrection(null);
    return {
      kind: source.kind,
      start: (listener) => {
        wrapped.downstream = listener;
        source.start(this.listenerFor(wrapped));
      },
      stop: () => {
        source.stop();
        wrapped.downstream = null;
      },
    };
  }

  /** Sets the correction and announces the corrected session at once. False for a replay or without a source. */
  apply(headsetFromLighthouse: Pose): boolean {
    if (!this.wrapped || this.wrapped.kind === 'replay') return false;
    this.setCorrection(headsetFromLighthouse);
    this.reannounce();
    return true;
  }

  /** Removes the correction and announces the raw session. */
  clear(): void {
    if (this.snapshot.headsetFromLighthouse === null) return;
    this.setCorrection(null);
    this.reannounce();
  }

  readonly getSnapshot = (): CorrectionSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  /** Raw frames with their raw session, in time order. */
  subscribeRaw(listener: RawFrameListener): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  /** Origin changes reported by the wrapped source. */
  subscribeOrigin(listener: OriginListener): () => void {
    this.originListeners.add(listener);
    return () => this.originListeners.delete(listener);
  }

  private setCorrection(headsetFromLighthouse: Pose | null): void {
    if (this.snapshot.headsetFromLighthouse === headsetFromLighthouse) return;
    this.snapshot = headsetFromLighthouse ? { headsetFromLighthouse } : NO_CORRECTION;
    for (const listener of [...this.snapshotListeners]) listener();
  }

  private reannounce(): void {
    const wrapped = this.wrapped;
    if (wrapped?.downstream && wrapped.rawSession) wrapped.downstream.onSession(this.sessionOut(wrapped.rawSession));
  }

  /** The raw session without a correction; otherwise one corrected object per raw session, which consumers key on. */
  private sessionOut(raw: SessionInfo): SessionInfo {
    const correction = this.snapshot.headsetFromLighthouse;
    if (!correction) return raw;
    const cached = this.cachedSession;
    if (cached && cached.raw === raw && cached.correction === correction) return cached.corrected;
    const corrected = correctSession(raw, correction);
    this.cachedSession = { raw, correction, corrected };
    return corrected;
  }

  private listenerFor(wrapped: Wrapped): PoseSourceListener {
    return {
      onStatus: (status) => wrapped.downstream?.onStatus(status),
      onSession: (session) => {
        wrapped.rawSession = session;
        wrapped.lighthouseIds = lighthouseDeviceIds(session);
        wrapped.downstream?.onSession(this.sessionOut(session));
      },
      onFrame: (frame) => {
        const session = wrapped.rawSession;
        if (!session) return;
        // Sets iterate safely while a listener unsubscribes, so the hot path copies nothing.
        if (this.wrapped === wrapped) for (const listener of this.rawListeners) listener(frame, session);
        const downstream = wrapped.downstream;
        if (!downstream) return;
        const correction = this.snapshot.headsetFromLighthouse;
        downstream.onFrame(correction ? correctFrame(frame, wrapped.lighthouseIds, correction) : frame);
      },
      onOriginChange: (change) => {
        if (this.wrapped === wrapped) for (const listener of this.originListeners) listener(change);
      },
    };
  }
}
