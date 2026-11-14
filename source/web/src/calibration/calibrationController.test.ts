import { describe, expect, it } from 'vitest';
import type { Frame, Pose, SessionInfo } from '../domain/types';
import { PairFigures } from '../figures/pairFigures';
import { quatAngleBetween } from '../math/quat';
import { vec3Distance } from '../math/vec3';
import { SkeletonStrain } from '../skeleton/skeletonStrain';
import { DEVICE_IDS } from '../sources/simulator/model';
import type { SimulatorOptions } from '../sources/simulator/model';
import { createSimulatorPairGesture } from '../sources/simulator/simulatorPairGesture';
import { createSimulatorSource } from '../sources/simulator/simulatorSource';
import type { PoseSource, PoseSourceListener, SourceKind } from '../sources/source';
import { SessionStore } from '../state/sessionStore';
import { CalibrationController } from './calibrationController';
import type { CalibrationPhase } from './calibrationController';
import { CorrectionStage } from './correctionStage';
import { resetMeasurementsOnCorrectionChange } from './resetMeasurementsOnCorrectionChange';

const FRAME_MS = 1000 / 60;
const RIGHT = DEVICE_IDS.controllerRight;
const LEFT = DEVICE_IDS.controllerLeft;
const WAIST = DEVICE_IDS.trackerWaist;

function setup(model: SimulatorOptions = { lighthouseOffset: { yawDeg: 8, offsetMm: 300 } }) {
  let nowMs = 0;
  let tick: (() => void) | null = null;
  const source = createSimulatorSource({
    model,
    rateHz: 60,
    now: () => nowMs,
    timer: {
      schedule(callback) {
        tick = callback;
        return () => {
          tick = null;
        };
      },
    },
  });
  const store = new SessionStore();
  const stage = new CorrectionStage();
  const figures = new PairFigures(store);
  const skeleton = new SkeletonStrain(store);
  const appliedAt = new Date('2026-01-01T00:00:00Z');
  const controller = new CalibrationController({ store, stage, figures, skeleton, now: () => appliedAt });
  controller.setPairGesture(createSimulatorPairGesture(source.controls));
  store.attach(stage.wrap(source));

  const frame = () => {
    nowMs += FRAME_MS;
    tick?.();
  };
  const seconds = (duration: number) => {
    for (let i = 0; i < Math.round((duration * 1000) / FRAME_MS); i++) frame();
  };
  const runUntil = (phases: readonly CalibrationPhase[], limitSeconds = 60) => {
    for (let i = 0; i < (limitSeconds * 1000) / FRAME_MS; i++) {
      if (phases.includes(controller.getSnapshot().phase)) return;
      frame();
    }
    throw new Error(`phase stayed ${controller.getSnapshot().phase}`);
  };
  const phase = () => controller.getSnapshot().phase;
  return { source, store, stage, figures, skeleton, controller, frame, seconds, runUntil, phase, appliedAt };
}

function differenceFrom(truth: Pose, applied: Pose | null): { degrees: number; millimeters: number } {
  if (!applied) throw new Error('no correction');
  return {
    degrees: (quatAngleBetween(applied.rotation, truth.rotation) * 180) / Math.PI,
    millimeters: vec3Distance(applied.position, truth.position) * 1000,
  };
}

function startRightWithWaist(env: ReturnType<typeof setup>) {
  env.frame();
  env.controller.choosePair(RIGHT, WAIST);
  expect(env.controller.start()).toBe(true);
}

describe('CalibrationController', () => {
  it('lists candidates and is blocked until a pair is chosen', () => {
    const { controller, frame } = setup();
    frame();
    const snapshot = controller.getSnapshot();
    expect(snapshot.controllers.map((device) => device.id)).toEqual([LEFT, RIGHT]);
    expect(snapshot.trackers.map((device) => device.id)).toEqual([WAIST, DEVICE_IDS.trackerLeftFoot, DEVICE_IDS.trackerRightFoot]);
    expect(snapshot.blocked).toEqual({ reason: 'no-pair' });
    expect(snapshot.canJoinOnSimulator).toBe(false);
    expect(controller.start()).toBe(false);
    expect(snapshot.phase).toBe('idle');
  });

  it('is blocked while the source gives no session', () => {
    const { controller, store } = setup();
    store.detach();
    expect(controller.getSnapshot().blocked).toEqual({ reason: 'source-unavailable' });
  });

  it('knows whether the simulator can join the chosen pair', () => {
    const { controller, frame } = setup();
    frame();
    controller.choosePair(RIGHT, WAIST);
    expect(controller.getSnapshot().canJoinOnSimulator).toBe(true);
    controller.choosePair(LEFT, WAIST);
    expect(controller.getSnapshot().canJoinOnSimulator).toBe(false);
  });

  it('blocks a pair with a device that is not tracking', () => {
    const { controller, source, frame } = setup();
    frame();
    controller.choosePair(RIGHT, WAIST);
    source.controls.setDeviceTracking(WAIST, false);
    frame();
    expect(controller.getSnapshot().blocked).toEqual({ reason: 'pair-not-tracking', deviceId: WAIST });
    expect(controller.start()).toBe(false);
  });

  it('counts the start delay down in whole seconds of frame time', () => {
    const env = setup();
    startRightWithWaist(env);
    expect(env.controller.getSnapshot().delayLeftSeconds).toBe(5);
    const seen = new Set<number>();
    env.controller.subscribe(() => seen.add(env.controller.getSnapshot().delayLeftSeconds));
    env.runUntil(['collecting']);
    expect([...seen].filter((value) => value > 0)).toEqual([4, 3, 2, 1]);
  });

  it('calibrates the joined pair and matches the true misalignment of the simulator', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done', 'failed']);

    const snapshot = env.controller.getSnapshot();
    expect(snapshot.phase).toBe('done');
    expect(snapshot.failure).toBeNull();
    expect(snapshot.result?.samples).toBe(250);
    expect(snapshot.result?.appliedAt).toBe(env.appliedAt);
    expect(snapshot.progress).toBe(1);

    const applied = env.stage.getSnapshot().headsetFromLighthouse;
    expect(applied).toBe(snapshot.result?.headsetFromLighthouse);
    const difference = differenceFrom(env.source.controls.getTrueMisalignment(), applied);
    // The measured values of this scenario are in the report; the contract is 0.1 degrees and 3 mm.
    expect(difference.degrees).toBeLessThan(0.1);
    expect(difference.millimeters).toBeLessThan(3);
    expect(snapshot.result?.fitErrorMm ?? Infinity).toBeLessThan(1);
  });

  it('shows the store aligned poses once applied: the joined tracker sits on the controller', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done']);
    env.frame();
    env.frame();
    const frame = env.store.frame;
    const pose = (id: string) => frame?.devices.find((sample) => sample.id === id)?.pose;
    const controllerPose = pose(RIGHT);
    const trackerPose = pose(WAIST);
    expect(controllerPose && trackerPose && vec3Distance(controllerPose.position, trackerPose.position)).toBeCloseTo(0.08, 3);
  });

  it('waves while collecting and restores the motion afterwards', () => {
    const env = setup();
    startRightWithWaist(env);
    expect(env.source.controls.getState().motion).toBe('stand');
    env.runUntil(['collecting']);
    env.frame();
    expect(env.source.controls.getState().motion).toBe('wave');
    expect(env.source.controls.getState().pairAttached).toBe(true);
    env.runUntil(['done']);
    expect(env.source.controls.getState().motion).toBe('stand');
    expect(env.source.controls.getState().pairAttached).toBe(true);
  });

  it('keeps progress from decreasing', () => {
    const env = setup();
    startRightWithWaist(env);
    let last = 0;
    let decreased = false;
    env.controller.subscribe(() => {
      const progress = env.controller.getSnapshot().progress;
      if (progress < last) decreased = true;
      last = progress;
    });
    env.runUntil(['done']);
    expect(decreased).toBe(false);
    expect(last).toBe(1);
  });

  it('pauses with the device named and resumes on its own, keeping the samples', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['collecting']);
    env.seconds(3);
    const before = env.controller.getSnapshot().progress;
    expect(before).toBeGreaterThan(0);

    env.source.controls.setDeviceTracking(WAIST, false);
    env.seconds(1);
    expect(env.controller.getSnapshot().phase).toBe('paused');
    expect(env.controller.getSnapshot().pausedDeviceId).toBe(WAIST);
    expect(env.controller.getSnapshot().progress).toBeCloseTo(before, 1);

    env.source.controls.setDeviceTracking(WAIST, true);
    env.seconds(1);
    expect(env.controller.getSnapshot().phase).toBe('collecting');
    expect(env.controller.getSnapshot().pausedDeviceId).toBeNull();
    expect(env.controller.getSnapshot().progress).toBeGreaterThan(before);
    env.runUntil(['done', 'failed']);
    expect(env.controller.getSnapshot().phase).toBe('done');
  });

  it('discards the collected motion after a jump and goes on from nothing', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['collecting']);
    env.seconds(5);
    expect(env.controller.getSnapshot().progress).toBeGreaterThan(0.2);

    env.source.controls.jump({ yawDeg: 15, offsetMm: 200 });
    env.frame();
    const snapshot = env.controller.getSnapshot();
    expect(snapshot.discarded).toBe(true);
    expect(snapshot.phase).toBe('collecting');
    expect(snapshot.progress).toBeLessThan(0.05);

    env.controller.dismissDiscarded();
    expect(env.controller.getSnapshot().discarded).toBe(false);

    env.runUntil(['done', 'failed']);
    expect(env.controller.getSnapshot().phase).toBe('done');
    const difference = differenceFrom(env.source.controls.getTrueMisalignment(), env.stage.getSnapshot().headsetFromLighthouse);
    expect(difference.degrees).toBeLessThan(0.1);
    expect(difference.millimeters).toBeLessThan(3);
  });

  it('cancels from every working phase, keeping the correction', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['collecting']);
    env.seconds(2);
    env.controller.cancel();
    expect(env.phase()).toBe('idle');
    expect(env.controller.getSnapshot().pair).toEqual({ controllerId: RIGHT, trackerId: WAIST });
    expect(env.source.controls.getState().motion).toBe('stand');
    expect(env.stage.getSnapshot().headsetFromLighthouse).toBeNull();

    expect(env.controller.start()).toBe(true);
    env.controller.cancel();
    expect(env.phase()).toBe('idle');
  });

  it('fails with another pair, keeps the previous result, and tries again', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done']);
    const first = env.controller.getSnapshot().result;
    expect(first).not.toBeNull();
    env.controller.finish({ setReference: false, fitSkeleton: false });
    expect(env.source.controls.getState().pairAttached).toBe(false);

    env.controller.choosePair(LEFT, WAIST);
    expect(env.controller.start()).toBe(true);
    env.runUntil(['done', 'failed']);

    const snapshot = env.controller.getSnapshot();
    expect(snapshot.phase).toBe('failed');
    expect(snapshot.failure?.reason).toBe('fit-error');
    if (snapshot.failure?.reason === 'fit-error') expect(snapshot.failure.fitErrorMm).toBeGreaterThan(snapshot.failure.limitMm);
    expect(snapshot.result).toBe(first);
    expect(env.stage.getSnapshot().headsetFromLighthouse).toBe(first?.headsetFromLighthouse);

    expect(env.controller.tryAgain()).toBe(true);
    expect(env.phase()).toBe('delay');
    expect(env.controller.getSnapshot().failure).toBeNull();
  });

  it('stalls when the pair is not turned, and goes on once it is', () => {
    const env = setup();
    env.frame();
    env.controller.choosePair(RIGHT, WAIST);
    env.source.controls.setPaused(true);
    env.controller.start();
    env.runUntil(['collecting']);
    env.seconds(1);
    expect(env.controller.getSnapshot().stalled).toBe(false);
    env.seconds(2.5);
    expect(env.controller.getSnapshot().stalled).toBe(true);
    expect(env.controller.getSnapshot().progress).toBeLessThan(0.1);
    env.controller.cancel();
  });

  it('finish sets the reference, fits the skeleton and keeps the pair joined for measuring', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done']);
    env.seconds(0.5);
    const outcome = env.controller.finish({ setReference: true, fitSkeleton: true });
    expect(outcome.referenceApplied).toBe(true);
    expect(env.figures.getSnapshot().pair).toEqual({ deviceIdA: RIGHT, deviceIdB: WAIST });
    expect(env.figures.getSnapshot().hasReference).toBe(true);
    expect(env.phase()).toBe('idle');
    expect(env.controller.getSnapshot().result).not.toBeNull();
    expect(env.source.controls.getState().pairAttached).toBe(true);
  });

  it('finish does nothing outside done', () => {
    const env = setup();
    env.frame();
    expect(env.controller.finish({ setReference: true, fitSkeleton: true })).toEqual({ referenceApplied: false, skeletonApplied: false });
  });

  it('removes the correction in effect', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done']);
    const sessionBefore = env.store.getSnapshot().session;
    env.controller.remove();
    expect(env.controller.getSnapshot().result).toBeNull();
    expect(env.stage.getSnapshot().headsetFromLighthouse).toBeNull();
    expect(env.store.getSnapshot().session).not.toBe(sessionBefore);
  });

  it('resets to idle when the source changes', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['collecting']);
    env.store.detach();
    const snapshot = env.controller.getSnapshot();
    expect(snapshot.phase).toBe('idle');
    expect(snapshot.pair).toBeNull();
    expect(snapshot.blocked).toEqual({ reason: 'source-unavailable' });
    expect(env.source.controls.getState().motion).toBe('stand');
  });

  it('publishes on meaningful changes only, not on every frame', () => {
    const env = setup();
    startRightWithWaist(env);
    let publishes = 0;
    env.controller.subscribe(() => (publishes += 1));
    env.runUntil(['done']);
    // About 18 s of frames at 60 Hz; whole seconds and whole percents are far fewer.
    expect(publishes).toBeLessThan(250);
  });

  it('is blocked on a replay and its stage refuses a correction', () => {
    const store = new SessionStore();
    const stage = new CorrectionStage();
    const figures = new PairFigures(store);
    const skeleton = new SkeletonStrain(store);
    const controller = new CalibrationController({ store, stage, figures, skeleton });
    const session: SessionInfo = {
      devices: [
        { id: 'c', role: 'controller', trackingSystem: 'headset', name: 'C', serial: '1' },
        { id: 't', role: 'tracker', trackingSystem: 'lighthouse', name: 'T', serial: '2' },
      ],
      playAreas: [],
      floorHeight: 0,
    };
    const frame: Frame = {
      time: 0,
      devices: [
        { id: 'c', state: 'tracking', pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
        { id: 't', state: 'tracking', pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
      ],
    };
    const replay: PoseSource = {
      kind: 'replay' as SourceKind,
      start(listener: PoseSourceListener) {
        listener.onStatus({ state: 'running' });
        listener.onSession(session);
        listener.onFrame(frame);
      },
      stop() {},
    };
    store.attach(stage.wrap(replay));
    controller.choosePair('c', 't');
    expect(controller.getSnapshot().blocked).toEqual({ reason: 'replay' });
    expect(controller.start()).toBe(false);
    expect(stage.apply({ position: [0, 0, 0], rotation: [0, 0, 0, 1] })).toBe(false);
  });

  it('stops listening after dispose', () => {
    const env = setup();
    env.frame();
    let publishes = 0;
    env.controller.subscribe(() => (publishes += 1));
    env.controller.dispose();
    env.controller.choosePair(RIGHT, WAIST);
    env.frame();
    expect(publishes).toBe(0);
  });

  it('restarts the waving when an origin change hits while computing', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['computing']);
    expect(env.source.controls.getState().motion).toBe('stand');
    env.source.controls.jump({ yawDeg: 10, offsetMm: 100 });
    expect(env.phase()).toBe('collecting');
    expect(env.controller.getSnapshot().discarded).toBe(true);
    expect(env.source.controls.getState().motion).toBe('wave');
    env.runUntil(['done', 'failed']);
    expect(env.phase()).toBe('done');
  });

  it('dismissResult ends done without options and failed with the pair kept', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done']);
    env.controller.dismissResult();
    expect(env.phase()).toBe('idle');
    expect(env.controller.getSnapshot().result).not.toBeNull();
    expect(env.figures.getSnapshot().hasReference).toBe(false);
    expect(env.source.controls.getState().pairAttached).toBe(false);

    env.controller.choosePair(LEFT, WAIST);
    env.controller.start();
    env.runUntil(['failed']);
    env.controller.dismissResult();
    const snapshot = env.controller.getSnapshot();
    expect(snapshot.phase).toBe('idle');
    expect(snapshot.failure).toBeNull();
    expect(snapshot.pair).toEqual({ controllerId: LEFT, trackerId: WAIST });
  });

  it('does not apply a Done option whose precondition fails, and says so', () => {
    const env = setup();
    startRightWithWaist(env);
    env.runUntil(['done']);
    env.seconds(0.2);
    expect(env.controller.getSnapshot().doneOptions).toEqual({ reference: null, skeleton: null });

    env.source.controls.setDeviceTracking(DEVICE_IDS.headset, false);
    env.source.controls.setDeviceTracking(WAIST, false);
    env.seconds(0.2);
    expect(env.controller.getSnapshot().doneOptions).toEqual({ reference: 'pair-not-tracking', skeleton: 'headset-not-tracking' });
    expect(env.controller.finish({ setReference: true, fitSkeleton: true })).toEqual({ referenceApplied: false, skeletonApplied: false });
    expect(env.figures.getSnapshot().hasReference).toBe(false);
    expect(env.skeleton.getSnapshot().calibrated).toBe(false);
    expect(env.phase()).toBe('idle');
  });

  it('exposes the configured start delay', () => {
    expect(setup().controller.getSnapshot().startDelaySeconds).toBe(5);
  });

  it('with the reset wiring, a reference from before the correction is dropped and finish sets a fresh one', () => {
    const env = setup();
    resetMeasurementsOnCorrectionChange(env.stage, env.figures, env.skeleton);
    env.frame();
    env.figures.setPair(RIGHT, WAIST);
    env.figures.setReference();
    expect(env.figures.getSnapshot().hasReference).toBe(true);

    env.controller.choosePair(RIGHT, WAIST);
    env.controller.start();
    env.runUntil(['done']);
    expect(env.figures.getSnapshot().hasReference).toBe(false);
    env.seconds(0.2);
    expect(env.controller.finish({ setReference: true, fitSkeleton: false }).referenceApplied).toBe(true);
    expect(env.figures.getSnapshot().hasReference).toBe(true);
    env.controller.remove();
    expect(env.figures.getSnapshot().hasReference).toBe(false);
  });
});
