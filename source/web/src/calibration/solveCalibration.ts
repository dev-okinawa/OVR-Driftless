import type { Pose, Vec3 } from '../domain/types';
import { linearSolve } from '../math/linearSolve';
import { mat3FromQuat, mat3MultiplyVec3, mat3Transpose } from '../math/mat3';
import type { Mat3 } from '../math/mat3';
import { quatFromYaw } from '../math/quat';
import type { PairSample } from './pairSample';

export interface CalibrationSolution {
  readonly headsetFromLighthouse: Pose;
  /** The tracker's origin in the controller's frame (the rigid link), meters. */
  readonly linkInController: Vec3;
  /** RMS of the 3D residual of all samples, millimeters. */
  readonly fitErrorMm: number;
}

const SCAN_STEP = Math.PI / 180;
const REFINE_TOLERANCE = 1e-9;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

interface Prepared {
  readonly rotation: Mat3;
  readonly controller: Vec3;
  readonly tracker: Vec3;
}

type Vec6 = readonly [number, number, number, number, number, number];

function sumOfDots(a: readonly Vec3[], b: readonly Vec3[]): number {
  let sum = 0;
  a.forEach((v, index) => {
    const w = b[index] ?? [0, 0, 0];
    sum += v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  });
  return sum;
}

/**
 * Finds the yaw `θ` and translation `t` of `headsetFromLighthouse` and the rigid link `q` for which
 * `p_c = Ry(θ)·p_t + t − R_c·q` fits the samples best, in meters. Only the tracker's position is used.
 * Null when the system is singular: the controller never changed its direction enough (or there are too few samples).
 */
export function solveCalibration(samples: readonly PairSample[]): CalibrationSolution | null {
  const count = samples.length;
  if (count === 0) return null;
  const prepared: Prepared[] = samples.map((sample) => ({
    rotation: mat3FromQuat(sample.headsetFromController.rotation),
    controller: sample.headsetFromController.position,
    tracker: sample.trackerInLighthouse,
  }));

  // A_i = [I | -R_c(i)]: the normal matrix is the same for every right-hand side and every θ.
  const sumR = new Array<number>(9).fill(0);
  for (const { rotation } of prepared) {
    rotation.forEach((value, index) => {
      sumR[index] = (sumR[index] ?? 0) + value;
    });
  }
  const sumAt = (row: number, column: number): number => sumR[row * 3 + column] ?? 0;
  const normal: number[][] = [];
  for (let row = 0; row < 3; row++) {
    normal.push([
      ...[0, 1, 2].map((column) => (row === column ? count : 0)),
      ...[0, 1, 2].map((column) => -sumAt(row, column)),
    ]);
  }
  for (let row = 0; row < 3; row++) {
    normal.push([
      ...[0, 1, 2].map((column) => -sumAt(column, row)),
      ...[0, 1, 2].map((column) => (row === column ? count : 0)),
    ]);
  }

  // b_i(θ) = d_i − cos θ·e_i − sin θ·f_i, because Ry(θ)·p = (0, y, 0) + cos θ·(x, 0, z) + sin θ·(z, 0, −x).
  const rhsD = prepared.map(({ controller, tracker }): Vec3 => [controller[0], controller[1] - tracker[1], controller[2]]);
  const rhsE = prepared.map(({ tracker }): Vec3 => [tracker[0], 0, tracker[2]]);
  const rhsF = prepared.map(({ tracker }): Vec3 => [tracker[2], 0, -tracker[0]]);

  const solveFor = (rhs: readonly Vec3[]): Vec6 | null => {
    const vector = [0, 0, 0, 0, 0, 0];
    prepared.forEach(({ rotation }, index) => {
      const b = rhs[index] ?? [0, 0, 0];
      const turned = mat3MultiplyVec3(mat3Transpose(rotation), b);
      for (let k = 0; k < 3; k++) {
        vector[k] = (vector[k] ?? 0) + (b[k] ?? 0);
        vector[3 + k] = (vector[3 + k] ?? 0) - (turned[k] ?? 0);
      }
    });
    const w = linearSolve(normal, vector);
    return w && [w[0] ?? 0, w[1] ?? 0, w[2] ?? 0, w[3] ?? 0, w[4] ?? 0, w[5] ?? 0];
  };
  const wd = solveFor(rhsD);
  const we = solveFor(rhsE);
  const wf = solveFor(rhsF);
  if (!wd || !we || !wf) return null;

  const residuals = (rhs: readonly Vec3[], w: Vec6): Vec3[] =>
    prepared.map(({ rotation }, index) => {
      const b = rhs[index] ?? [0, 0, 0];
      const link = mat3MultiplyVec3(rotation, [w[3], w[4], w[5]]);
      return [b[0] - w[0] + link[0], b[1] - w[1] + link[1], b[2] - w[2] + link[2]];
    });
  const rd = residuals(rhsD, wd);
  const re = residuals(rhsE, we);
  const rf = residuals(rhsF, wf);
  const sums = {
    dd: sumOfDots(rd, rd),
    ee: sumOfDots(re, re),
    ff: sumOfDots(rf, rf),
    de: sumOfDots(rd, re),
    df: sumOfDots(rd, rf),
    ef: sumOfDots(re, rf),
  };
  const cost = (angle: number): number => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return sums.dd + c * c * sums.ee + s * s * sums.ff - 2 * c * sums.de - 2 * s * sums.df + 2 * c * s * sums.ef;
  };

  let scanned = -Math.PI;
  let scannedCost = Infinity;
  for (let angle = -Math.PI; angle < Math.PI; angle += SCAN_STEP) {
    const value = cost(angle);
    if (value < scannedCost) {
      scannedCost = value;
      scanned = angle;
    }
  }

  // Golden-section search inside the bracket of the best scan step.
  let low = scanned - SCAN_STEP;
  let high = scanned + SCAN_STEP;
  let x1 = high - GOLDEN * (high - low);
  let x2 = low + GOLDEN * (high - low);
  let f1 = cost(x1);
  let f2 = cost(x2);
  while (high - low > REFINE_TOLERANCE) {
    if (f1 < f2) {
      high = x2;
      x2 = x1;
      f2 = f1;
      x1 = high - GOLDEN * (high - low);
      f1 = cost(x1);
    } else {
      low = x1;
      x1 = x2;
      f1 = f2;
      x2 = low + GOLDEN * (high - low);
      f2 = cost(x2);
    }
  }
  const middle = (low + high) / 2;
  const theta = Math.atan2(Math.sin(middle), Math.cos(middle));

  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const w = wd.map((value, index) => value - c * (we[index] ?? 0) - s * (wf[index] ?? 0));
  const translation: Vec3 = [w[0] ?? 0, w[1] ?? 0, w[2] ?? 0];
  const link: Vec3 = [w[3] ?? 0, w[4] ?? 0, w[5] ?? 0];

  // The residual of the final solution is summed directly: the six sums above lose precision near zero cost.
  let squared = 0;
  for (const { rotation, controller, tracker } of prepared) {
    const turnedLink = mat3MultiplyVec3(rotation, link);
    const x = c * tracker[0] + s * tracker[2] + translation[0] - turnedLink[0] - controller[0];
    const y = tracker[1] + translation[1] - turnedLink[1] - controller[1];
    const z = -s * tracker[0] + c * tracker[2] + translation[2] - turnedLink[2] - controller[2];
    squared += x * x + y * y + z * z;
  }

  return {
    headsetFromLighthouse: { position: translation, rotation: quatFromYaw(theta) },
    linkInController: link,
    fitErrorMm: 1000 * Math.sqrt(squared / count),
  };
}
