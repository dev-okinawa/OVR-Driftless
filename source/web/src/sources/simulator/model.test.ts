import { describe, expect, it } from 'vitest';
import type { DeviceSample, Pose } from '../../domain/types';
import { poseCompose, poseInverse } from '../../math/pose';
import { quatAngleBetween } from '../../math/quat';
import { vec3Distance } from '../../math/vec3';
import { DEFAULT_CALIBRATION_CONFIG } from '../../calibration/calibrationConfig';
import { motionCoverage } from '../../calibration/motionCoverage';
import type { PairSample } from '../../calibration/pairSample';
import { DEVICE_IDS, MOTION_PRESETS, createSimulatorModel } from './model';
import type { SimulatorModel } from './model';

const IDENTITY_ROTATION = [0, 0, 0, 1] as const;

function poseOf(samples: readonly DeviceSample[], id: string): Pose {
  const pose = samples.find((sample) => sample.id === id)?.pose;
  if (pose === null || pose === undefined) throw new Error(`no pose for ${id}`);
  return pose;
}

function sampleDevice(model: SimulatorModel, time: number, id: string): Pose {
  return poseOf(model.sample(time).frame.devices, id);
}

describe('simulator model', () => {
  it('is deterministic', () => {
    const run = () => {
      const model = createSimulatorModel();
      model.setMotion('walk');
      model.setDriftRate({ yawDegPerMinute: 2, positionMmPerMinute: 30 });
      return [0, 0.5, 3.3, 10].map((time) => model.sample(time));
    };
    expect(run()).toEqual(run());
  });

  it.each(MOTION_PRESETS)('%s: one sample per device, unit rotations, feet on or above the floor', (motion) => {
    const model = createSimulatorModel({ motion });
    for (let time = 0; time < 20; time += 0.25) {
      const { session, frame } = model.sample(time);
      expect(frame.devices.map((sample) => sample.id)).toEqual(session.devices.map((device) => device.id));
      for (const sample of frame.devices) {
        const rotation = sample.pose?.rotation ?? IDENTITY_ROTATION;
        expect(Math.hypot(...rotation)).toBeCloseTo(1, 9);
      }
      expect(poseOf(frame.devices, DEVICE_IDS.trackerLeftFoot).position[1]).toBeGreaterThanOrEqual(0);
      expect(poseOf(frame.devices, DEVICE_IDS.trackerRightFoot).position[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it('describes the standard devices and two play areas', () => {
    const { session } = createSimulatorModel().sample(0);
    expect(session.devices.map((device) => device.id)).toEqual(Object.values(DEVICE_IDS));
    expect(session.playAreas.map((area) => area.trackingSystem)).toEqual(['headset', 'lighthouse']);
    expect(session.floorHeight).toBe(0);
  });

  it('keeps the misalignment at identity without drift or jump', () => {
    const model = createSimulatorModel({ motion: 'walk' });
    model.sample(5);
    const misalignment = model.getTrueMisalignment(30);
    expect(vec3Distance(misalignment.position, [0, 0, 0])).toBeCloseTo(0, 12);
    expect(quatAngleBetween(misalignment.rotation, IDENTITY_ROTATION)).toBeCloseTo(0, 9);
  });

  it('turns a drift of X degrees per minute into X degrees after a minute', () => {
    const model = createSimulatorModel();
    model.sample(0);
    model.setDriftRate({ yawDegPerMinute: 3, positionMmPerMinute: 60 });
    model.sample(60);
    const misalignment = model.getTrueMisalignment(60);
    expect((quatAngleBetween(misalignment.rotation, IDENTITY_ROTATION) * 180) / Math.PI).toBeCloseTo(3, 6);
    expect(vec3Distance(misalignment.position, [0, 0, 0])).toBeCloseTo(0.06, 6);
  });

  it('changes only headset-system devices on a jump', () => {
    const model = createSimulatorModel();
    const before = model.sample(1).frame;
    model.jump({ yawDeg: 10, offsetMm: 100 });
    const after = model.sample(1).frame;
    for (const sample of after.devices) {
      const unchanged = sample.pose && before.devices.find((other) => other.id === sample.id)?.pose;
      const device = model.sample(1).session.devices.find((info) => info.id === sample.id);
      if (device?.trackingSystem === 'lighthouse') expect(sample.pose).toEqual(unchanged);
      else expect(sample.pose).not.toEqual(unchanged);
    }
    const misalignment = model.getTrueMisalignment(1);
    expect((quatAngleBetween(misalignment.rotation, IDENTITY_ROTATION) * 180) / Math.PI).toBeCloseTo(10, 6);
  });

  it('rotates a jump about the headset itself', () => {
    const model = createSimulatorModel();
    const before = sampleDevice(model, 1, DEVICE_IDS.headset);
    model.jump({ yawDeg: 45, offsetMm: 0 });
    expect(vec3Distance(sampleDevice(model, 1, DEVICE_IDS.headset).position, before.position)).toBeCloseTo(0, 9);
  });

  it('resets the misalignment', () => {
    const model = createSimulatorModel();
    model.jump({ yawDeg: 10, offsetMm: 100 });
    model.resetMisalignment();
    expect(quatAngleBetween(model.getTrueMisalignment(0).rotation, IDENTITY_ROTATION)).toBeCloseTo(0, 9);
  });

  it('joins the tracker to the controller rigidly until a jump', () => {
    const model = createSimulatorModel({ motion: 'reach' });
    model.setPairAttached(true);
    const relativeAt = (time: number) => {
      const { frame } = model.sample(time);
      return poseCompose(
        poseInverse(poseOf(frame.devices, DEVICE_IDS.controllerRight)),
        poseOf(frame.devices, DEVICE_IDS.trackerWaist),
      );
    };
    const first = relativeAt(0);
    expect(first.position[0]).toBeCloseTo(0.08, 9);
    for (const time of [1, 2.5, 7]) {
      const relative = relativeAt(time);
      expect(vec3Distance(relative.position, first.position)).toBeCloseTo(0, 9);
    }
    model.jump({ yawDeg: 5, offsetMm: 100 });
    expect(vec3Distance(relativeAt(8).position, first.position)).toBeGreaterThan(0.01);
  });

  it('drops the body part of the waist tracker while attached', () => {
    const model = createSimulatorModel();
    const waist = (attached: boolean) => {
      model.setPairAttached(attached);
      return model.sample(0).session.devices.find((device) => device.id === DEVICE_IDS.trackerWaist);
    };
    expect(waist(true)?.bodyPart).toBeUndefined();
    expect(waist(false)?.bodyPart).toBe('waist');
  });

  it('freezes the pose when tracking is lost', () => {
    const model = createSimulatorModel({ motion: 'walk' });
    const last = model.sample(2).frame.devices.find((sample) => sample.id === DEVICE_IDS.headset);
    model.setDeviceTracking(DEVICE_IDS.headset, false);
    const lost = model.sample(4).frame.devices.find((sample) => sample.id === DEVICE_IDS.headset);
    expect(lost?.state).toBe('tracking-lost');
    expect(lost?.pose).toEqual(last?.pose);
    model.setDeviceTracking(DEVICE_IDS.headset, true);
    expect(model.sample(5).frame.devices.find((sample) => sample.id === DEVICE_IDS.headset)?.state).toBe('tracking');
  });

  it('reports a disconnected device, and no pose when it never connected', () => {
    const model = createSimulatorModel();
    model.setDeviceConnected(DEVICE_IDS.trackerWaist, false);
    const waist = model.sample(1).frame.devices.find((sample) => sample.id === DEVICE_IDS.trackerWaist);
    expect(waist).toEqual({ id: DEVICE_IDS.trackerWaist, state: 'disconnected', pose: null });
  });

  it('changes the session when a device is removed or added', () => {
    const model = createSimulatorModel();
    const full = model.sample(0).session;
    expect(model.sample(0.1).session).toBe(full);
    model.setDevicePresent(DEVICE_IDS.trackerLeftFoot, false);
    const { session, frame } = model.sample(0.2);
    expect(session).not.toBe(full);
    expect(session.devices.map((device) => device.id)).not.toContain(DEVICE_IDS.trackerLeftFoot);
    expect(frame.devices.map((sample) => sample.id)).not.toContain(DEVICE_IDS.trackerLeftFoot);
    model.setDevicePresent(DEVICE_IDS.trackerLeftFoot, true);
    expect(model.sample(0.3).session.devices).toHaveLength(full.devices.length);
  });

  it('stops the body when paused while time keeps running', () => {
    const model = createSimulatorModel({ motion: 'walk' });
    model.sample(1);
    model.setPaused(true);
    const first = model.sample(2).frame;
    const second = model.sample(3).frame;
    expect(second.time).toBe(3);
    expect(second.devices).toEqual(first.devices);
  });

  it('returns the same state object until something changes', () => {
    const model = createSimulatorModel();
    const state = model.getState();
    expect(model.getState()).toBe(state);
    model.setMotion('squat');
    expect(model.getState()).not.toBe(state);
    expect(model.getState().motion).toBe('squat');
  });
});

describe('simulator model: initial lighthouse offset and the wave preset', () => {
  it('starts with the Lighthouse space displaced, and reports it as the true misalignment', () => {
    const model = createSimulatorModel({ lighthouseOffset: { yawDeg: 8, offsetMm: 300 } });
    model.sample(0);
    const misalignment = model.getTrueMisalignment(0);
    // headsetShift is identity, so the misalignment is the inverse of the creep.
    expect((quatAngleBetween(misalignment.rotation, IDENTITY_ROTATION) * 180) / Math.PI).toBeCloseTo(8, 6);
    expect(vec3Distance(misalignment.position, [0, 0, 0])).toBeGreaterThan(0.25);
  });

  it('moves only Lighthouse devices by the offset', () => {
    const aligned = createSimulatorModel();
    const offset = createSimulatorModel({ lighthouseOffset: { yawDeg: 8, offsetMm: 300 } });
    const a = aligned.sample(1).frame;
    const b = offset.sample(1).frame;
    expect(sampleDeviceIn(b, DEVICE_IDS.headset)).toEqual(sampleDeviceIn(a, DEVICE_IDS.headset));
    expect(sampleDeviceIn(b, DEVICE_IDS.trackerWaist)).not.toEqual(sampleDeviceIn(a, DEVICE_IDS.trackerWaist));
  });

  it('resetMisalignment removes the offset too', () => {
    const model = createSimulatorModel({ lighthouseOffset: { yawDeg: 8, offsetMm: 300 } });
    model.sample(0);
    model.resetMisalignment();
    expect(vec3Distance(model.getTrueMisalignment(0).position, [0, 0, 0])).toBeCloseTo(0, 12);
  });

  it('moves both hands about 0.3 m and keeps rotations unit', () => {
    const model = createSimulatorModel({ motion: 'wave' });
    const xs: number[] = [];
    for (let time = 0; time < 20; time += 0.05) {
      const { frame } = model.sample(time);
      for (const id of [DEVICE_IDS.controllerLeft, DEVICE_IDS.controllerRight]) {
        expect(Math.hypot(...poseOf(frame.devices, id).rotation)).toBeCloseTo(1, 9);
      }
      xs.push(poseOf(frame.devices, DEVICE_IDS.controllerRight).position[0]);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
  });

  it.each([DEVICE_IDS.controllerLeft, DEVICE_IDS.controllerRight])('wave: %s has rotation spread of at least twice the minimum', (id) => {
    const model = createSimulatorModel({ motion: 'wave' });
    const samples: PairSample[] = [];
    for (let i = 0; i < 250; i++) {
      const pose = sampleDevice(model, i * 0.05, id);
      samples.push({ time: i * 0.05, headsetFromController: pose, trackerInLighthouse: [0, 0, 0] });
    }
    const spread = motionCoverage(samples, DEFAULT_CALIBRATION_CONFIG).rotationSpread;
    expect(spread).toBeGreaterThanOrEqual(2 * DEFAULT_CALIBRATION_CONFIG.minRotationSpread);
  });

  it('stand has no rotation spread to speak of, so only wave can calibrate', () => {
    const model = createSimulatorModel({ motion: 'stand' });
    const samples: PairSample[] = [];
    for (let i = 0; i < 250; i++) {
      const pose = sampleDevice(model, i * 0.05, DEVICE_IDS.controllerRight);
      samples.push({ time: i * 0.05, headsetFromController: pose, trackerInLighthouse: [0, 0, 0] });
    }
    expect(motionCoverage(samples, DEFAULT_CALIBRATION_CONFIG).rotationSpread).toBeLessThan(DEFAULT_CALIBRATION_CONFIG.minRotationSpread);
  });
});

function sampleDeviceIn(frame: { readonly devices: readonly DeviceSample[] }, id: string): Pose {
  return poseOf(frame.devices, id);
}
