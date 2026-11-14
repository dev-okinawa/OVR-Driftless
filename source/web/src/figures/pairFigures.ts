import type { Frame, Pose } from '../domain/types';
import type { SessionStore } from '../state/sessionStore';
import type { ChartPoint, ChartSeries } from './chartSeries';
import { driftFromReference, pairRelativePose, type PairDrift } from './pairDrift';

export interface PairFiguresSnapshot {
  readonly pair: { readonly deviceIdA: string; readonly deviceIdB: string } | null;
  readonly hasReference: boolean;
  /** Null when there is no pair, no reference, or either device is not tracking right now. */
  readonly current: PairDrift | null;
  /** True when a pair is declared and both its devices are tracking now, so a reference can be taken. */
  readonly canSetReference: boolean;
}

/**
 * Most points kept per series. When exceeded, the older half of the history loses every second point,
 * so the whole session stays on the graph at a coarser resolution towards its start. Of two points
 * folded into one, a gap point wins, so a short gap never disappears.
 */
export const MAX_POINTS_PER_SERIES = 20_000;

/** The numbers in the snapshot change at most this often (seconds of frame time), except on a state change. */
const CURRENT_PUBLISH_INTERVAL_S = 0.25;

const EMPTY_SNAPSHOT: PairFiguresSnapshot = { pair: null, hasReference: false, current: null, canSetReference: false };

/** The drift of one declared pair of devices: current figures and the history for the graph. */
export class PairFigures {
  private pair: { readonly deviceIdA: string; readonly deviceIdB: string } | null = null;
  private reference: Pose | null = null;
  private readonly distancePoints: ChartPoint[] = [];
  private readonly anglePoints: ChartPoint[] = [];
  // The same two array objects for the whole life of the instance: they are mutated, never copied.
  private readonly series: readonly ChartSeries[] = [
    { label: 'Distance', unit: 'mm', points: this.distancePoints },
    { label: 'Angle', unit: '°', points: this.anglePoints },
  ];
  private snapshot: PairFiguresSnapshot = EMPTY_SNAPSHOT;
  private lastPublishTime = 0;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeFrames: () => void;

  constructor(private readonly store: SessionStore) {
    this.unsubscribeFrames = store.subscribeFrames((frame) => this.onFrame(frame));
  }

  setPair(deviceIdA: string, deviceIdB: string): void {
    this.pair = { deviceIdA, deviceIdB };
    this.reference = null;
    this.clearHistory();
    this.refresh(this.store.frame);
  }

  clearPair(): void {
    this.pair = null;
    this.reference = null;
    this.clearHistory();
    this.publish({ ...EMPTY_SNAPSHOT });
  }

  /** Takes the current frame as the reference. False when there is no pair or either device is not tracking. */
  setReference(): boolean {
    const frame = this.store.frame;
    const relative = frame ? this.relativePose(frame) : null;
    if (!frame || !relative) return false;
    this.reference = relative;
    this.clearHistory();
    this.appendPoint(frame.time, this.refresh(frame));
    return true;
  }

  clearReference(): void {
    this.reference = null;
    this.clearHistory();
    this.refresh(this.store.frame);
  }

  /** The reference `aFromB` of the pair, or null. A recording stores it, so that a replay shows the recorded figures. */
  get referencePose(): Pose | null {
    return this.reference;
  }

  /** Sets a reference taken at another moment: the one stored in a recording. False when there is no pair. */
  restoreReference(referenceAFromB: Pose): boolean {
    if (!this.pair) return false;
    this.reference = referenceAFromB;
    this.clearHistory();
    this.refresh(this.store.frame);
    return true;
  }

  /** Two series, distance in mm and angle in degrees. Always the same arrays, holding the latest data. */
  getSeries(): readonly ChartSeries[] {
    return this.series;
  }

  readonly getSnapshot = (): PairFiguresSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose(): void {
    this.unsubscribeFrames();
    this.listeners.clear();
  }

  private onFrame(frame: Frame): void {
    if (!this.pair) return;
    const current = this.refresh(frame, true);
    if (this.reference) this.appendPoint(frame.time, current);
  }

  /** Computes the figures for `frame` and publishes a snapshot; returns the figures. */
  private refresh(frame: Frame | null, throttle = false): PairDrift | null {
    const relative = frame && this.pair ? this.relativePose(frame) : null;
    const current = relative && this.reference ? driftFromReference(this.reference, relative) : null;
    const canSetReference = relative !== null;
    const previous = this.snapshot;
    const hasReference = this.reference !== null;
    const structural =
      previous.pair !== this.pair ||
      previous.hasReference !== hasReference ||
      previous.canSetReference !== canSetReference ||
      (previous.current === null) !== (current === null);
    const time = frame?.time ?? 0;
    const due = Math.abs(time - this.lastPublishTime) >= CURRENT_PUBLISH_INTERVAL_S;
    if (structural || !throttle || due) {
      if (structural || current !== null || previous.current !== null) {
        this.lastPublishTime = time;
        this.publish({ pair: this.pair, hasReference, current, canSetReference });
      }
    }
    return current;
  }

  /** `aFromB` of the pair, or null when either device is not tracking or has no pose. */
  private relativePose(frame: Frame): Pose | null {
    if (!this.pair) return null;
    const a = frame.devices.find((sample) => sample.id === this.pair?.deviceIdA);
    const b = frame.devices.find((sample) => sample.id === this.pair?.deviceIdB);
    if (!a || !b || a.state !== 'tracking' || b.state !== 'tracking' || !a.pose || !b.pose) return null;
    return pairRelativePose(a.pose, b.pose);
  }

  private appendPoint(time: number, drift: PairDrift | null): void {
    // A replay seeking backwards: what was stored after this moment is no longer the past.
    while ((this.distancePoints.at(-1)?.time ?? -Infinity) > time) {
      this.distancePoints.pop();
      this.anglePoints.pop();
    }
    this.distancePoints.push({ time, value: drift ? drift.distanceMm : null });
    this.anglePoints.push({ time, value: drift ? drift.angleDeg : null });
    if (this.distancePoints.length > MAX_POINTS_PER_SERIES) this.thinOlderHalf();
  }

  private thinOlderHalf(): void {
    const older = (this.distancePoints.length >> 2) << 1; // even count of points to fold in pairs
    let write = 0;
    for (let i = 0; i < older; i += 2) {
      // Both series have gaps at the same indexes, so one decision serves both.
      const keep = this.distancePoints[i + 1]?.value === null ? i + 1 : i;
      const distance = this.distancePoints[keep];
      const angle = this.anglePoints[keep];
      if (!distance || !angle) break;
      this.distancePoints[write] = distance;
      this.anglePoints[write] = angle;
      write++;
    }
    this.distancePoints.splice(write, older - write);
    this.anglePoints.splice(write, older - write);
  }

  private clearHistory(): void {
    this.distancePoints.length = 0;
    this.anglePoints.length = 0;
  }

  private publish(snapshot: PairFiguresSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
