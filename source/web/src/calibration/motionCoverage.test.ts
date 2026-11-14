import { describe, expect, it } from 'vitest';
import { DEFAULT_CALIBRATION_CONFIG } from './calibrationConfig';
import { makePairSamples } from './pairFixtures';
import type { FixtureMotion } from './pairFixtures';
import { motionCoverage } from './motionCoverage';

function coverageOf(motion: FixtureMotion, count = 250) {
  const samples = makePairSamples({ count, theta: 0, translation: [0, 0, 0], link: [0.08, 0, 0], motion });
  return motionCoverage(samples, DEFAULT_CALIBRATION_CONFIG);
}

describe('motionCoverage', () => {
  it('has no rotation spread when the controller only changes its yaw', () => {
    expect(coverageOf('yaw-only').rotationSpread).toBeCloseTo(0, 6);
  });

  it('has no rotation spread when the controller turns about one horizontal axis', () => {
    expect(coverageOf('one-axis').rotationSpread).toBeCloseTo(0, 6);
  });

  it('has rotation spread when the controller turns about two axes', () => {
    expect(coverageOf('full').rotationSpread).toBeGreaterThan(2 * DEFAULT_CALIBRATION_CONFIG.minRotationSpread);
  });

  it('has no travel without horizontal motion', () => {
    const coverage = coverageOf('still');
    expect(coverage.travelMeters).toBeCloseTo(0, 6);
    expect(coverage.progress).toBe(0);
  });

  it('measures the travel in meters', () => {
    expect(coverageOf('full').travelMeters).toBeGreaterThan(0.15);
  });

  it('progress grows with the samples and is capped at 1', () => {
    const few = coverageOf('full', 25).progress;
    const many = coverageOf('full', 250).progress;
    expect(few).toBeCloseTo(0.1, 6);
    expect(many).toBe(1);
  });

  it('is empty without samples', () => {
    expect(motionCoverage([], DEFAULT_CALIBRATION_CONFIG)).toEqual({ rotationSpread: 0, travelMeters: 0, progress: 0 });
  });
});
