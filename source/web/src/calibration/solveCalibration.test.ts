import { describe, expect, it } from 'vitest';
import { quatAngleBetween, quatFromYaw } from '../math/quat';
import { vec3Distance } from '../math/vec3';
import { DEFAULT_CALIBRATION_CONFIG } from './calibrationConfig';
import { makePairSamples, seededRandom } from './pairFixtures';
import type { PairSample } from './pairSample';
import { solveCalibration } from './solveCalibration';

const DEG = Math.PI / 180;
const THETA = 27 * DEG;
const TRANSLATION = [0.4, 0.12, -0.7] as const;
const LINK = [0.08, 0.02, -0.05] as const;

describe('solveCalibration', () => {
  it('recovers a known correction without noise', () => {
    const samples = makePairSamples({ count: 250, theta: THETA, translation: TRANSLATION, link: LINK, motion: 'full' });
    const solution = solveCalibration(samples);
    expect(solution).not.toBeNull();
    if (!solution) return;
    const thetaError = quatAngleBetween(solution.headsetFromLighthouse.rotation, quatFromYaw(THETA));
    expect(thetaError).toBeLessThan(1e-6);
    expect(vec3Distance(solution.headsetFromLighthouse.position, TRANSLATION)).toBeLessThan(1e-6);
    expect(vec3Distance(solution.linkInController, LINK)).toBeLessThan(1e-6);
    expect(solution.fitErrorMm).toBeLessThan(1e-3);
  });

  it('recovers negative and large yaws', () => {
    for (const yaw of [-170 * DEG, -45 * DEG, 0, 179 * DEG]) {
      const samples = makePairSamples({ count: 100, theta: yaw, translation: TRANSLATION, link: LINK, motion: 'full' });
      const solution = solveCalibration(samples);
      expect(solution && quatAngleBetween(solution.headsetFromLighthouse.rotation, quatFromYaw(yaw))).toBeLessThan(1e-6);
    }
  });

  it('stays within 0.25 degrees and 5 mm with 2 mm noise and 250 samples', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const samples = makePairSamples({ count: 250, theta: THETA, translation: TRANSLATION, link: LINK, motion: 'full', noiseMm: 2, seed });
      const solution = solveCalibration(samples);
      expect(solution).not.toBeNull();
      if (!solution) return;
      const thetaDeg = (quatAngleBetween(solution.headsetFromLighthouse.rotation, quatFromYaw(THETA)) * 180) / Math.PI;
      const tError = vec3Distance(solution.headsetFromLighthouse.position, TRANSLATION) * 1000;
      expect(thetaDeg).toBeLessThan(0.25);
      expect(tError).toBeLessThan(5);
    }
  });

  it('fails the fit error limit when the tracker is not joined to the controller', () => {
    const random = seededRandom(7);
    const samples: PairSample[] = makePairSamples({ count: 250, theta: THETA, translation: TRANSLATION, link: LINK, motion: 'full' }).map(
      (sample) => ({ ...sample, trackerInLighthouse: [0.1 + 0.01 * random(), 0.9, 0.2 + 0.01 * random()] }),
    );
    const solution = solveCalibration(samples);
    expect(solution).not.toBeNull();
    expect(solution?.fitErrorMm ?? 0).toBeGreaterThan(DEFAULT_CALIBRATION_CONFIG.maxFitErrorMm);
  });

  it('returns null when the controller only turns about one axis', () => {
    expect(solveCalibration(makePairSamples({ count: 250, theta: THETA, translation: TRANSLATION, link: LINK, motion: 'one-axis' }))).toBeNull();
    expect(solveCalibration(makePairSamples({ count: 250, theta: THETA, translation: TRANSLATION, link: LINK, motion: 'yaw-only' }))).toBeNull();
  });

  it('returns null without samples', () => {
    expect(solveCalibration([])).toBeNull();
  });
});
