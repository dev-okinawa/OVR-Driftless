import type { Quat, Vec3 } from '../domain/types';

/** A 3×3 matrix, row-major: [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const MAT3_ZERO: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The rotation matrix of a unit quaternion. */
export function mat3FromQuat(q: Quat): Mat3 {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

export function mat3Add(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] + b[0], a[1] + b[1], a[2] + b[2],
    a[3] + b[3], a[4] + b[4], a[5] + b[5],
    a[6] + b[6], a[7] + b[7], a[8] + b[8],
  ];
}

export function mat3Scale(m: Mat3, factor: number): Mat3 {
  return [
    m[0] * factor, m[1] * factor, m[2] * factor,
    m[3] * factor, m[4] * factor, m[5] * factor,
    m[6] * factor, m[7] * factor, m[8] * factor,
  ];
}

export function mat3Transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** `a · b`: applies `b` first. */
export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const entry = (row: number, column: number): number =>
    (a[row * 3] ?? 0) * (b[column] ?? 0) + (a[row * 3 + 1] ?? 0) * (b[3 + column] ?? 0) + (a[row * 3 + 2] ?? 0) * (b[6 + column] ?? 0);
  return [entry(0, 0), entry(0, 1), entry(0, 2), entry(1, 0), entry(1, 1), entry(1, 2), entry(2, 0), entry(2, 1), entry(2, 2)];
}

export function mat3MultiplyVec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Eigenvalues of a symmetric matrix in closed form, largest first. Only the upper triangle is read. */
export function mat3SymmetricEigenvalues(m: Mat3): readonly [number, number, number] {
  const offDiagonal = m[1] * m[1] + m[2] * m[2] + m[5] * m[5];
  const mean = (m[0] + m[4] + m[8]) / 3;
  const spread =
    (m[0] - mean) ** 2 + (m[4] - mean) ** 2 + (m[8] - mean) ** 2 + 2 * offDiagonal;
  if (spread === 0) return [mean, mean, mean];

  const scale = Math.sqrt(spread / 6);
  const a = (m[0] - mean) / scale;
  const b = (m[4] - mean) / scale;
  const c = (m[8] - mean) / scale;
  const d = m[1] / scale;
  const e = m[2] / scale;
  const f = m[5] / scale;
  const determinant = a * (b * c - f * f) - d * (d * c - f * e) + e * (d * f - b * e);
  const angle = Math.acos(Math.max(-1, Math.min(1, determinant / 2))) / 3;

  const largest = mean + 2 * scale * Math.cos(angle);
  const smallest = mean + 2 * scale * Math.cos(angle + (2 * Math.PI) / 3);
  return [largest, 3 * mean - largest - smallest, smallest];
}
