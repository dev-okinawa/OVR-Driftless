import type { Vec3 } from '../domain/types';

export const VEC3_ZERO: Vec3 = [0, 0, 0];
export const VEC3_UP: Vec3 = [0, 1, 0];

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function vec3Length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return vec3Length(vec3Sub(a, b));
}

/** Returns `fallback` for a zero-length vector. */
export function vec3Normalize(a: Vec3, fallback: Vec3 = VEC3_UP): Vec3 {
  const length = vec3Length(a);
  return length > 1e-12 ? vec3Scale(a, 1 / length) : fallback;
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
