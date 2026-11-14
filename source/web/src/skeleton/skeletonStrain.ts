import type { BodyPart, Frame, SessionInfo } from '../domain/types';
import type { ChartPoint, ChartSeries } from '../figures/chartSeries';
import type { SessionStore } from '../state/sessionStore';
import { calibrateSkeleton, type BodyDevices, type SkeletonCalibration } from './calibration';
import { DEFAULT_PROPORTIONS } from './proportions';
import { solveSkeleton, type SkeletonPose } from './solve';
import { computeStrain, createStrainState, type StrainResult, type StrainState } from './strain';

export interface SkeletonSnapshot {
  readonly calibrated: boolean;
  readonly heightMeters: number | null;
  /** Null when not calibrated or nothing connects the two systems. */
  readonly strain: StrainResult | null;
}

export interface SkeletonLatest {
  readonly pose: SkeletonPose;
  readonly strain: StrainResult | null;
  /** The tracking devices the pose was solved from; the drawn hands turn with the controllers. */
  readonly devices: BodyDevices;
}

/** The snapshot (for React) changes at most this often, in seconds of frame time. */
const SNAPSHOT_INTERVAL_S = 0.25;

/**
 * History scheme: a point is kept when at least `step` seconds passed since the last one. When the
 * list exceeds MAX_POINTS, every second point is dropped and `step` doubles. The history therefore
 * never exceeds MAX_POINTS and always covers the whole session, with a resolution that gets coarser
 * as the session gets longer (0.05 s for the first two minutes, 0.1 s up to four, and so on).
 */
const INITIAL_STEP_S = 0.05;
const MAX_POINTS = 2400;

const NOT_CALIBRATED: SkeletonSnapshot = { calibrated: false, heightMeters: null, strain: null };

/**
 * Before calibration: a body of the default height. The head and the hands follow the headset and the controllers;
 * trackers drive nothing, since where each sits on its bone is not known yet.
 */
const UNCALIBRATED: SkeletonCalibration = { proportions: DEFAULT_PROPORTIONS, jointOffsets: {} };

export class SkeletonStrain {
  private calibration: SkeletonCalibration | null = null;
  private strainState: StrainState = createStrainState();
  private current: SkeletonLatest | null = null;
  private snapshot: SkeletonSnapshot = NOT_CALIBRATED;
  private snapshotTime = Number.NEGATIVE_INFINITY;

  private history: ChartPoint[] = [];
  private step = INITIAL_STEP_S;
  private series: readonly ChartSeries[] | null = null;
  private lastFrameTime = Number.NEGATIVE_INFINITY;

  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeFrames: () => void;
  private readonly unsubscribeStore: () => void;

  /** Body part of each device of the session the cache was built for. */
  private partsSession: SessionInfo | null = null;
  private partById = new Map<string, BodyPart>();

  constructor(private readonly store: SessionStore) {
    this.unsubscribeFrames = store.subscribeFrames((frame, session) => this.onFrame(frame, session));
    this.unsubscribeStore = store.subscribe(() => {
      // A new or stopped source: the calibration belonged to the old one.
      if (this.calibration && store.getSnapshot().session === null) this.clearCalibration();
    });
  }

  /** The latest solved pose and strain, for the scene layer; null when not calibrated. */
  get latest(): SkeletonLatest | null {
    return this.current;
  }

  /** Calibrates from the current frame. False when the head is not tracking. */
  calibrate(): boolean {
    const frame = this.store.frame;
    const session = this.store.getSnapshot().session;
    if (!frame || !session) return false;
    const calibration = calibrateSkeleton(this.bodyDevices(frame, session), session.floorHeight);
    if (!calibration) return false;

    this.calibration = calibration;
    this.resetResults();
    this.onFrame(frame, session);
    this.publish(frame.time);
    return true;
  }

  clearCalibration(): void {
    if (!this.calibration) return;
    this.calibration = null;
    this.resetResults();
    this.publish(0);
  }

  /** The calibration in use, or null. A recording stores it, so that a replay shows the recorded skeleton. */
  get currentCalibration(): SkeletonCalibration | null {
    return this.calibration;
  }

  /** Uses a calibration made at another moment: the one stored in a recording. */
  restoreCalibration(calibration: SkeletonCalibration): void {
    this.calibration = calibration;
    this.resetResults();
    const frame = this.store.frame;
    const session = this.store.getSnapshot().session;
    if (frame && session) this.onFrame(frame, session);
    this.publish(frame?.time ?? 0);
  }

  /** Strain history for the graph: one series, total strain in mm; a null value where there was no strain to compute. */
  getSeries(): readonly ChartSeries[] {
    this.series ??= [{ label: 'Strain', unit: 'mm', points: this.history.slice() }];
    return this.series;
  }

  readonly getSnapshot = (): SkeletonSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose(): void {
    this.unsubscribeFrames();
    this.unsubscribeStore();
    this.listeners.clear();
  }

  private resetResults(): void {
    this.current = null;
    this.strainState = createStrainState();
    this.history = [];
    this.step = INITIAL_STEP_S;
    this.series = null;
    this.lastFrameTime = Number.NEGATIVE_INFINITY;
  }

  private onFrame(frame: Frame, session: SessionInfo): void {
    const calibration = this.calibration;
    if (!calibration) {
      const devices = this.bodyDevices(frame, session);
      const pose = solveSkeleton(devices, UNCALIBRATED, session.floorHeight);
      this.current = pose ? { pose, strain: null, devices } : null;
      return;
    }

    if (frame.time < this.lastFrameTime) this.truncateAfter(frame.time);
    this.lastFrameTime = frame.time;

    const devices = this.bodyDevices(frame, session);
    const pose = solveSkeleton(devices, calibration, session.floorHeight);
    const strain = pose ? computeStrain(devices, calibration, pose, session.floorHeight, this.strainState, frame.time) : null;
    this.current = pose ? { pose, strain, devices } : null;

    this.record(frame.time, strain ? strain.totalMm : null);
    if (frame.time < this.snapshotTime || frame.time - this.snapshotTime >= SNAPSHOT_INTERVAL_S) this.publish(frame.time);
  }

  private publish(time: number): void {
    this.snapshotTime = time;
    this.snapshot = this.calibration
      ? { calibrated: true, heightMeters: this.calibration.proportions.heightMeters, strain: this.current?.strain ?? null }
      : NOT_CALIBRATED;
    for (const listener of this.listeners) listener();
  }

  private record(time: number, value: number | null): void {
    const last = this.history[this.history.length - 1];
    if (last && time - last.time < this.step) return;
    this.history.push({ time, value });
    this.series = null;
    if (this.history.length > MAX_POINTS) {
      this.history = this.history.filter((_, index) => index % 2 === 0 || index === this.history.length - 1);
      this.step *= 2;
    }
  }

  private truncateAfter(time: number): void {
    let length = this.history.length;
    while (length > 0 && (this.history[length - 1]?.time ?? 0) > time) length -= 1;
    if (length < this.history.length) {
      this.history.length = length;
      this.series = null;
    }
  }

  /** Devices tracking now, by body part. When two devices claim one part the first in the frame wins. */
  private bodyDevices(frame: Frame, session: SessionInfo): BodyDevices {
    if (this.partsSession !== session) {
      this.partsSession = session;
      this.partById = new Map();
      for (const device of session.devices) if (device.bodyPart) this.partById.set(device.id, device.bodyPart);
    }
    const devices: BodyDevices = {};
    for (const sample of frame.devices) {
      const part = this.partById.get(sample.id);
      if (part && sample.state === 'tracking' && sample.pose && !devices[part]) devices[part] = sample.pose;
    }
    return devices;
  }
}
