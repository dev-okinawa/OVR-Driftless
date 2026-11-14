import { describe, expect, it } from 'vitest';
import type { Pose } from '../domain/types';
import type { PoseSource } from '../sources/source';
import { CorrectionStage } from './correctionStage';
import { resetMeasurementsOnCorrectionChange } from './resetMeasurementsOnCorrectionChange';

const POSE_A: Pose = { position: [1, 0, 0], rotation: [0, 0, 0, 1] };
const POSE_B: Pose = { position: [2, 0, 0], rotation: [0, 0, 0, 1] };

function setup() {
  const stage = new CorrectionStage();
  const calls: string[] = [];
  const figures = { setPair: () => undefined, setReference: () => true, clearReference: () => calls.push('reference') };
  const skeleton = { calibrate: () => true, clearCalibration: () => calls.push('skeleton') };
  const source: PoseSource = { kind: 'simulated', start: () => undefined, stop: () => undefined };
  stage.wrap(source);
  const stop = resetMeasurementsOnCorrectionChange(stage, figures, skeleton);
  return { stage, calls, stop, source };
}

describe('resetMeasurementsOnCorrectionChange', () => {
  it('clears the reference and the skeleton fit when a correction is applied, replaced and removed', () => {
    const { stage, calls } = setup();
    stage.apply(POSE_A);
    expect(calls).toEqual(['reference', 'skeleton']);
    stage.apply(POSE_B);
    expect(calls).toHaveLength(4);
    stage.clear();
    expect(calls).toHaveLength(6);
  });

  it('does nothing when the correction does not change', () => {
    const { stage, calls } = setup();
    stage.clear();
    stage.apply(POSE_A);
    calls.length = 0;
    stage.apply(POSE_A);
    expect(calls).toEqual([]);
  });

  it('clears when a new source drops the correction', () => {
    const { stage, calls, source } = setup();
    stage.apply(POSE_A);
    calls.length = 0;
    stage.wrap(source);
    expect(calls).toEqual(['reference', 'skeleton']);
  });

  it('stops after the returned function is called', () => {
    const { stage, calls, stop } = setup();
    stop();
    stage.apply(POSE_A);
    expect(calls).toEqual([]);
  });
});
