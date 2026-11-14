import type { Quat, Vec3 } from '../domain/types';
import { vec3Add, vec3Cross, vec3Normalize, vec3Scale } from './vec3';

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  return length > 1e-12 ? [q[0] / length, q[1] / length, q[2] / length, q[3] / length] : QUAT_IDENTITY;
}

/** The rotation that applies `b` first, then `a`. */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Inverse of a unit quaternion. */
export function quatInverse(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
  const axis: Vec3 = [q[0], q[1], q[2]];
  const uv = vec3Cross(axis, v);
  const uuv = vec3Cross(axis, uv);
  return vec3Add(v, vec3Scale(vec3Add(vec3Scale(uv, q[3]), uuv), 2));
}

/** `axis` does not have to be normalized; `angle` is in radians. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const [x, y, z] = vec3Normalize(axis);
  const sin = Math.sin(angle / 2);
  return [x * sin, y * sin, z * sin, Math.cos(angle / 2)];
}

/** Rotation about the vertical axis (+Y), radians, counter-clockwise seen from above. */
export function quatFromYaw(yaw: number): Quat {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

/** The angle of the rotation that takes `a` to `b`, radians in [0, π]. */
export function quatAngleBetween(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

/** Shortest-path interpolation; `t` in [0, 1]. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (dot < 0) {
    dot = -dot;
    end = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (dot > 0.9995) {
    return quatNormalize([
      a[0] + (end[0] - a[0]) * t,
      a[1] + (end[1] - a[1]) * t,
      a[2] + (end[2] - a[2]) * t,
      a[3] + (end[3] - a[3]) * t,
    ]);
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const weightA = Math.sin((1 - t) * theta) / sinTheta;
  const weightB = Math.sin(t * theta) / sinTheta;
  return [
    a[0] * weightA + end[0] * weightB,
    a[1] * weightA + end[1] * weightB,
    a[2] * weightA + end[2] * weightB,
    a[3] * weightA + end[3] * weightB,
  ];
}
