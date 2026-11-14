import type { DeviceInfo, Frame, Pose } from '../domain/types';
import type { SessionStore } from '../state/sessionStore';
import { DEFAULT_CALIBRATION_CONFIG } from './calibrationConfig';
import type { CalibrationConfig } from './calibrationConfig';
import type { CorrectionStage } from './correctionStage';
import type { ReferenceTarget, SkeletonFitter } from './measurementTargets';
import { MotionCoverageSums } from './motionCoverage';
import type { PairGesture } from './pairGesture';
import type { PairSample } from './pairSample';
import { PairSampler } from './pairSampler';
import { solveCalibration } from './solveCalibration';

export type CalibrationPhase = 'idle' | 'delay' | 'collecting' | 'paused' | 'computing' | 'done' | 'failed';

export interface CalibrationPair {
  readonly controllerId: string;
  readonly trackerId: string;
}

export interface CalibrationResult {
  /** The correction in effect. */
  readonly headsetFromLighthouse: Pose;
  readonly controllerId: string;
  readonly trackerId: string;
  /** Samples the solution used. */
  readonly samples: number;
  /** RMS residual of the rigid link, millimeters. */
  readonly fitErrorMm: number;
  /** Wall-clock time it was applied. */
  readonly appliedAt: Date;
}

export type CalibrationFailure =
  | { readonly reason: 'degenerate' }
  | { readonly reason: 'fit-error'; readonly fitErrorMm: number; readonly limitMm: number };

export type CalibrationBlock =
  | { readonly reason: 'source-unavailable' | 'replay' | 'no-controller' | 'no-tracker' | 'no-pair' }
  | { readonly reason: 'pair-not-tracking'; readonly deviceId: string };

export interface CalibrationSnapshot {
  readonly phase: CalibrationPhase;
  readonly pair: CalibrationPair | null;
  /** Candidates: controllers of the headset's tracking system. */
  readonly controllers: readonly DeviceInfo[];
  /** Candidates: trackers of the Lighthouse tracking system. */
  readonly trackers: readonly DeviceInfo[];
  readonly blocked: CalibrationBlock | null;
  /** Whole seconds left, during `delay`; 0 otherwise. */
  readonly delayLeftSeconds: number;
  /** 0…1 in whole percents; never decreases within one collection. */
  readonly progress: number;
  /** The device of the pair that is not tracking, during `paused`. */
  readonly pausedDeviceId: string | null;
  /** Progress has not grown for `stallSeconds` while samples arrive. */
  readonly stalled: boolean;
  /** Collected motion was dropped after an origin change. */
  readonly discarded: boolean;
  /** Why the last attempt failed, during `failed`. */
  readonly failure: CalibrationFailure | null;
  /** The correction in effect; a failed attempt keeps it. */
  readonly result: CalibrationResult | null;
  /** The configured start delay, seconds. */
  readonly startDelaySeconds: number;
  /** Which options `finish` would apply now. */
  readonly doneOptions: DoneOptions;
  /** Whether the simulator can join the chosen pair; null when the source is not simulated. */
  readonly canJoinOnSimulator: boolean | null;
}

/** Why an option of the Done step cannot be applied now; null when it can. */
export interface DoneOptions {
  readonly reference: 'pair-not-tracking' | null;
  readonly skeleton: 'headset-not-tracking' | null;
}

export interface FinishOptions {
  readonly setReference: boolean;
  readonly fitSkeleton: boolean;
}

export interface FinishOutcome {
  readonly referenceApplied: boolean;
  readonly skeletonApplied: boolean;
}

export interface CalibrationDeps {
  readonly store: SessionStore;
  readonly stage: CorrectionStage;
  readonly figures: ReferenceTarget;
  readonly skeleton: SkeletonFitter;
  readonly config?: CalibrationConfig;
  readonly now?: () => Date;
}

/** Progress counts as grown when it rises by one whole percent, the resolution the snapshot shows. */
const GROWTH_STEP = 0.01;

function sameBlock(a: CalibrationBlock | null, b: CalibrationBlock | null): boolean {
  if (a === null || b === null) return a === b;
  return a.reason === b.reason && (a.reason !== 'pair-not-tracking' || (b.reason === 'pair-not-tracking' && a.deviceId === b.deviceId));
}

function sameDevices(a: readonly DeviceInfo[], b: readonly DeviceInfo[]): boolean {
  return a.length === b.length && a.every((device, index) => device === b[index]);
}

const WAVING_PHASES: readonly CalibrationPhase[] = ['collecting', 'paused', 'computing'];

/**
 * The initial calibration: a state machine over the raw frames of the joined pair. It owns no UI; the panel
 * shows its snapshot and sends commands. Samples come from the stage's raw tap, the result goes back through the stage.
 */
export class CalibrationController {
  private readonly store: SessionStore;
  private readonly stage: CorrectionStage;
  private readonly figures: ReferenceTarget;
  private readonly skeleton: SkeletonFitter;
  private readonly config: CalibrationConfig;
  private readonly now: () => Date;

  private phase: CalibrationPhase = 'idle';
  private pair: CalibrationPair | null = null;
  private gesture: PairGesture | null = null;
  private waving = false;
  private result: CalibrationResult | null = null;
  private failure: CalibrationFailure | null = null;
  private discarded = false;

  private delayStartTime: number | null = null;
  private delayLeft = 0;
  private pausedDeviceId: string | null = null;
  private stalled = false;
  private progress = 0;
  private growthProgress = 0;
  private growthTime: number | null = null;
  private samples: PairSample[] = [];
  private readonly coverage = new MotionCoverageSums();
  private readonly sampler: PairSampler;

  private controllers: readonly DeviceInfo[] = [];
  private trackers: readonly DeviceInfo[] = [];
  private block: CalibrationBlock | null = null;
  private doneOptions: DoneOptions = { reference: null, skeleton: null };
  private snapshot: CalibrationSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribers: (() => void)[];

  constructor(deps: CalibrationDeps) {
    this.store = deps.store;
    this.stage = deps.stage;
    this.figures = deps.figures;
    this.skeleton = deps.skeleton;
    this.config = deps.config ?? DEFAULT_CALIBRATION_CONFIG;
    this.now = deps.now ?? (() => new Date());
    this.sampler = new PairSampler(this.config.sampleRateHz);
    this.updateCandidates();
    this.snapshot = this.build();
    this.unsubscribers = [
      this.stage.subscribeRaw((frame) => this.onRawFrame(frame)),
      this.stage.subscribeOrigin(() => this.onOriginChange()),
      this.stage.subscribe(() => this.onStageChange()),
      this.store.subscribe(() => this.onStoreChange()),
    ];
  }

  readonly getSnapshot = (): CalibrationSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Only the simulator has a gesture; null for every other source. */
  setPairGesture(gesture: PairGesture | null): void {
    this.gesture = gesture;
    this.refresh();
  }

  choosePair(controllerId: string, trackerId: string): void {
    if (this.phase !== 'idle' && this.phase !== 'done' && this.phase !== 'failed') return;
    if (this.phase === 'done') this.gesture?.release();
    this.pair = { controllerId, trackerId };
    this.phase = 'idle';
    this.failure = null;
    this.refresh();
  }

  /** False when the calibration cannot start: see `blocked` in the snapshot. */
  start(): boolean {
    if (this.phase !== 'idle' && this.phase !== 'done' && this.phase !== 'failed') return false;
    if (this.computeBlock() !== null) return false;
    this.resetCollection();
    this.failure = null;
    this.discarded = false;
    this.phase = 'delay';
    this.delayLeft = Math.ceil(this.config.startDelaySeconds);
    this.refresh();
    return true;
  }

  cancel(): void {
    if (this.phase !== 'delay' && !WAVING_PHASES.includes(this.phase)) return;
    this.stopWaving();
    this.resetCollection();
    this.phase = 'idle';
    this.refresh();
  }

  tryAgain(): boolean {
    return this.phase === 'failed' && this.start();
  }

  /**
   * Ends a successful calibration with the optional measurements that need the aligned, still joined pair.
   * An option whose precondition fails is not applied; the outcome says so.
   */
  finish(options: FinishOptions): FinishOutcome {
    if (this.phase !== 'done' || !this.pair) return { referenceApplied: false, skeletonApplied: false };
    const allowed = this.computeDoneOptions();
    let referenceApplied = false;
    if (options.setReference && allowed.reference === null) {
      this.figures.setPair(this.pair.controllerId, this.pair.trackerId);
      referenceApplied = this.figures.setReference();
    }
    const skeletonApplied = options.fitSkeleton && allowed.skeleton === null ? this.skeleton.calibrate() : false;
    // A reference measures the drift of the joined pair, so the pair stays joined; otherwise the user detaches it.
    if (!referenceApplied) this.gesture?.release();
    this.phase = 'idle';
    this.refresh();
    return { referenceApplied, skeletonApplied };
  }

  /** Leaves a finished attempt: `done` ends without options, `failed` goes back to choosing with the pair kept. */
  dismissResult(): void {
    if (this.phase === 'done') {
      this.finish({ setReference: false, fitSkeleton: false });
    } else if (this.phase === 'failed') {
      this.failure = null;
      this.phase = 'idle';
      this.refresh();
    }
  }

  dismissDiscarded(): void {
    if (!this.discarded) return;
    this.discarded = false;
    this.refresh();
  }

  /** Removes the correction in effect. */
  remove(): void {
    this.stage.clear();
    this.result = null;
    this.refresh();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Events

  private onRawFrame(frame: Frame): void {
    switch (this.phase) {
      case 'delay':
        this.tickDelay(frame);
        break;
      case 'collecting':
      case 'paused':
        this.collect(frame);
        break;
      case 'computing':
        this.solve();
        break;
      default:
        return;
    }
    this.refresh();
  }

  private onOriginChange(): void {
    if (!WAVING_PHASES.includes(this.phase)) return;
    // The samples before the change belong to another space; collection goes on from nothing.
    this.resetCollection();
    this.discarded = true;
    this.phase = 'collecting';
    // `computing` had already stopped the waving.
    if (!this.waving && this.pair) {
      this.gesture?.startWaving(this.pair.controllerId, this.pair.trackerId);
      this.waving = true;
    }
    this.refresh();
  }

  private onStageChange(): void {
    if (this.result && this.stage.getSnapshot().headsetFromLighthouse === null) {
      this.result = null;
      this.refresh();
    }
  }

  private onStoreChange(): void {
    if (this.store.getSnapshot().session === null && (this.phase !== 'idle' || this.pair !== null)) {
      // A source change: the devices, and the correction, belonged to the old source.
      this.stopWaving();
      this.resetCollection();
      this.phase = 'idle';
      this.pair = null;
      this.failure = null;
      this.discarded = false;
    }
    this.refresh();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Phases

  private tickDelay(frame: Frame): void {
    this.delayStartTime ??= frame.time;
    const left = this.config.startDelaySeconds - (frame.time - this.delayStartTime);
    if (left > 0) {
      this.delayLeft = Math.ceil(left);
      return;
    }
    this.delayLeft = 0;
    if (!this.pair) return;
    this.gesture?.startWaving(this.pair.controllerId, this.pair.trackerId);
    this.waving = true;
    this.phase = 'collecting';
  }

  private collect(frame: Frame): void {
    if (!this.pair) return;
    const { sample, pausedDeviceId } = this.sampler.take(frame, this.pair.controllerId, this.pair.trackerId);
    if (pausedDeviceId !== null) {
      this.phase = 'paused';
      this.pausedDeviceId = pausedDeviceId;
      this.stalled = false;
      return;
    }
    if (this.phase === 'paused') {
      // Time spent paused is not time without progress.
      this.phase = 'collecting';
      this.pausedDeviceId = null;
      this.growthTime = frame.time;
      this.growthProgress = this.progress;
    }
    this.growthTime ??= frame.time;

    if (sample) {
      this.samples.push(sample);
      this.coverage.add(sample);
      this.progress = Math.max(this.progress, this.coverage.read(this.config).progress);
    }
    if (this.progress >= this.growthProgress + GROWTH_STEP) {
      this.growthProgress = this.progress;
      this.growthTime = frame.time;
    }
    this.stalled = frame.time - this.growthTime >= this.config.stallSeconds;

    if (this.progress >= 1) {
      this.stopWaving();
      this.stalled = false;
      this.phase = 'computing';
    }
  }

  private solve(): void {
    const pair = this.pair;
    const solution = solveCalibration(this.samples);
    if (!pair || !solution) {
      this.fail({ reason: 'degenerate' });
      return;
    }
    if (solution.fitErrorMm > this.config.maxFitErrorMm) {
      this.fail({ reason: 'fit-error', fitErrorMm: solution.fitErrorMm, limitMm: this.config.maxFitErrorMm });
      return;
    }

    const previous = this.result;
    this.result = {
      headsetFromLighthouse: solution.headsetFromLighthouse,
      controllerId: pair.controllerId,
      trackerId: pair.trackerId,
      samples: this.samples.length,
      fitErrorMm: solution.fitErrorMm,
      appliedAt: this.now(),
    };
    this.failure = null;
    this.phase = 'done';
    if (!this.stage.apply(solution.headsetFromLighthouse)) {
      this.result = previous;
      this.fail({ reason: 'degenerate' });
    }
  }

  private fail(failure: CalibrationFailure): void {
    this.failure = failure;
    this.phase = 'failed';
  }

  private stopWaving(): void {
    if (!this.waving) return;
    this.waving = false;
    this.gesture?.stopWaving();
  }

  private resetCollection(): void {
    this.samples = [];
    this.coverage.reset();
    this.sampler.reset();
    this.progress = 0;
    this.growthProgress = 0;
    this.growthTime = null;
    this.delayStartTime = null;
    this.delayLeft = 0;
    this.pausedDeviceId = null;
    this.stalled = false;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Snapshot

  /** Candidate lists keep their identity while the devices are the same, so that React does not redraw them. */
  private updateCandidates(): void {
    const devices = this.store.getSnapshot().session?.devices ?? [];
    const controllers = devices.filter((device) => device.role === 'controller' && device.trackingSystem === 'headset');
    const trackers = devices.filter((device) => device.role === 'tracker' && device.trackingSystem === 'lighthouse');
    if (!sameDevices(this.controllers, controllers)) this.controllers = controllers;
    if (!sameDevices(this.trackers, trackers)) this.trackers = trackers;
  }

  private computeBlock(): CalibrationBlock | null {
    const store = this.store.getSnapshot();
    if (store.session === null || store.status?.state === 'unavailable') return { reason: 'source-unavailable' };
    if (store.sourceKind === 'replay') return { reason: 'replay' };
    if (this.controllers.length === 0) return { reason: 'no-controller' };
    if (this.trackers.length === 0) return { reason: 'no-tracker' };
    if (!this.pair) return { reason: 'no-pair' };
    for (const deviceId of [this.pair.controllerId, this.pair.trackerId]) {
      if (store.deviceStates[deviceId] !== 'tracking') return { reason: 'pair-not-tracking', deviceId };
    }
    return null;
  }

  private computeDoneOptions(): DoneOptions {
    const store = this.store.getSnapshot();
    const tracking = (id: string): boolean => store.deviceStates[id] === 'tracking';
    const headset = store.session?.devices.find((device) => device.role === 'headset');
    const next: DoneOptions = {
      reference: this.pair && tracking(this.pair.controllerId) && tracking(this.pair.trackerId) ? null : 'pair-not-tracking',
      skeleton: headset && tracking(headset.id) ? null : 'headset-not-tracking',
    };
    if (next.reference !== this.doneOptions.reference || next.skeleton !== this.doneOptions.skeleton) this.doneOptions = next;
    return this.doneOptions;
  }

  private build(): CalibrationSnapshot {
    const blocked = this.computeBlock();
    // The same object while the reason is the same, so that the snapshot can be compared by identity.
    if (!sameBlock(this.block, blocked)) this.block = blocked;
    return {
      phase: this.phase,
      pair: this.pair,
      controllers: this.controllers,
      trackers: this.trackers,
      blocked: this.block,
      delayLeftSeconds: this.phase === 'delay' ? this.delayLeft : 0,
      progress: Math.floor(this.progress * 100) / 100,
      pausedDeviceId: this.phase === 'paused' ? this.pausedDeviceId : null,
      stalled: this.phase === 'collecting' && this.stalled,
      discarded: this.discarded,
      failure: this.phase === 'failed' ? this.failure : null,
      result: this.result,
      startDelaySeconds: this.config.startDelaySeconds,
      doneOptions: this.computeDoneOptions(),
      canJoinOnSimulator: this.gesture
        ? this.pair !== null && this.gesture.canJoin(this.pair.controllerId, this.pair.trackerId)
        : null,
    };
  }

  /** Publishes a new snapshot only when something the panel shows changed. */
  private refresh(): void {
    this.updateCandidates();
    const previous = this.snapshot;
    const next = this.build();
    const same =
      previous.phase === next.phase &&
      previous.pair === next.pair &&
      previous.controllers === next.controllers &&
      previous.trackers === next.trackers &&
      previous.blocked === next.blocked &&
      previous.delayLeftSeconds === next.delayLeftSeconds &&
      previous.progress === next.progress &&
      previous.pausedDeviceId === next.pausedDeviceId &&
      previous.stalled === next.stalled &&
      previous.discarded === next.discarded &&
      previous.failure === next.failure &&
      previous.result === next.result &&
      previous.doneOptions === next.doneOptions &&
      previous.canJoinOnSimulator === next.canJoinOnSimulator;
    if (same) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}
