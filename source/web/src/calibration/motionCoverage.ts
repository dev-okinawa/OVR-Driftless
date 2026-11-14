import {
  MAT3_ZERO,
  mat3Add,
  mat3FromQuat,
  mat3Multiply,
  mat3Scale,
  mat3SymmetricEigenvalues,
  mat3Transpose,
} from '../math/mat3';
import type { Mat3 } from '../math/mat3';
import type { CalibrationConfig } from './calibrationConfig';
import type { PairSample } from './pairSample';

export interface MotionCoverage {
  /** `ρ = sqrt(1 − σ_max(R̄)²)`: 0 when every controller rotation keeps one direction. About radians. */
  readonly rotationSpread: number;
  /** Square root of the largest eigenvalue of the horizontal covariance of the controller positions, meters. */
  readonly travelMeters: number;
  /** 0…1: the least of samples, rotation spread and travel, each against its need. */
  readonly progress: number;
}

type CoverageConfig = Pick<CalibrationConfig, 'samplesNeeded' | 'minRotationSpread' | 'minTravelMeters'>;

/** Running sums of the samples, so that each sample costs O(1) and the coverage can be read at any time. */
export class MotionCoverageSums {
  private count = 0;
  private rotations: Mat3 = MAT3_ZERO;
  private sumX = 0;
  private sumZ = 0;
  private sumXX = 0;
  private sumZZ = 0;
  private sumXZ = 0;

  add(sample: PairSample): void {
    const [x, , z] = sample.headsetFromController.position;
    this.count += 1;
    this.rotations = mat3Add(this.rotations, mat3FromQuat(sample.headsetFromController.rotation));
    this.sumX += x;
    this.sumZ += z;
    this.sumXX += x * x;
    this.sumZZ += z * z;
    this.sumXZ += x * z;
  }

  reset(): void {
    this.count = 0;
    this.rotations = MAT3_ZERO;
    this.sumX = 0;
    this.sumZ = 0;
    this.sumXX = 0;
    this.sumZZ = 0;
    this.sumXZ = 0;
  }

  read(config: CoverageConfig): MotionCoverage {
    const n = this.count;
    if (n === 0) return { rotationSpread: 0, travelMeters: 0, progress: 0 };

    const mean = mat3Scale(this.rotations, 1 / n);
    const largest = mat3SymmetricEigenvalues(mat3Multiply(mat3Transpose(mean), mean))[0];
    const rotationSpread = Math.sqrt(Math.max(0, 1 - largest));

    const meanX = this.sumX / n;
    const meanZ = this.sumZ / n;
    const varianceX = this.sumXX / n - meanX * meanX;
    const varianceZ = this.sumZZ / n - meanZ * meanZ;
    const covariance = this.sumXZ / n - meanX * meanZ;
    const largestVariance =
      (varianceX + varianceZ) / 2 + Math.sqrt(((varianceX - varianceZ) / 2) ** 2 + covariance * covariance);
    const travelMeters = Math.sqrt(Math.max(0, largestVariance));

    const clip = (value: number): number => Math.min(1, Math.max(0, value));
    const progress = Math.min(
      clip(n / config.samplesNeeded),
      clip(rotationSpread / config.minRotationSpread),
      clip(travelMeters / config.minTravelMeters),
    );
    return { rotationSpread, travelMeters, progress };
  }
}

export function motionCoverage(samples: readonly PairSample[], config: CoverageConfig): MotionCoverage {
  const sums = new MotionCoverageSums();
  for (const sample of samples) sums.add(sample);
  return sums.read(config);
}
