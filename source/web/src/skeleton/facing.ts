import type { Quat, Vec3 } from '../domain/types';
import { quatRotateVec3 } from '../math/quat';
import { vec3Length } from '../math/vec3';

const FORWARD: Vec3 = [0, 0, -1];
const UP: Vec3 = [0, 1, 0];

/**
 * The unit horizontal direction a device faces (its local -Z with the vertical part dropped).
 * Looking straight up or down leaves nothing horizontal in -Z; the device's up axis then points
 * forward (looking down) or backward (looking up).
 */
export function horizontalForward(rotation: Quat): Vec3 {
  const forward = quatRotateVec3(rotation, FORWARD);
  const flat: Vec3 = [forward[0], 0, forward[2]];
  const length = vec3Length(flat);
  if (length > 1e-3) return [flat[0] / length, 0, flat[2] / length];

  const up = quatRotateVec3(rotation, UP);
  const sign = forward[1] < 0 ? 1 : -1;
  const upFlat: Vec3 = [up[0] * sign, 0, up[2] * sign];
  const upLength = vec3Length(upFlat);
  return upLength > 1e-6 ? [upFlat[0] / upLength, 0, upFlat[2] / upLength] : FORWARD;
}
