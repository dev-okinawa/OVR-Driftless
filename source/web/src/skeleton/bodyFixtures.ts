// Test helper: tracking poses of a person with a head, two controllers, a waist tracker and two foot trackers.
import type { Pose, Vec3 } from '../domain/types';
import { quatFromYaw, quatRotateVec3 } from '../math/quat';
import type { BodyDevices } from './calibration';
import { createProportions } from './proportions';

export type BodyVariant = 'standing' | 'squat' | 'lean' | 'step';

export interface BodyOptions {
  readonly height?: number;
  readonly floor?: number;
  readonly variant?: BodyVariant;
  /** Turns the whole body about the vertical axis through the origin, radians. */
  readonly yaw?: number;
}

export interface Body {
  readonly devices: BodyDevices;
  readonly hips: Vec3;
  readonly leftFoot: Vec3;
  readonly rightFoot: Vec3;
}

/** Trackers sit on the surface: the waist tracker in front of the pelvis, a foot tracker above the ankle. */
const WAIST_TRACKER_OFFSET: Vec3 = [0, 0, -0.1];
const FOOT_TRACKER_OFFSET: Vec3 = [0, 0.06, 0];

export function makeBody(options: BodyOptions = {}): Body {
  const { height = 1.8, floor = 0, variant = 'standing', yaw = 0 } = options;
  const p = createProportions(height);
  const spineLength = p.neck + p.spine;

  let hips: Vec3 = [0, floor + p.hipHeight, 0];
  let head: Vec3 = [0, floor + p.eyeHeight, 0];
  let leftFoot: Vec3 = [-p.hipWidth / 2, floor + p.ankleHeight, 0];
  let rightFoot: Vec3 = [p.hipWidth / 2, floor + p.ankleHeight, 0];

  if (variant === 'squat') {
    hips = [0, floor + 0.3, 0.2];
    head = [0, hips[1] + Math.sqrt(spineLength ** 2 - 0.2 ** 2), 0];
  } else if (variant === 'lean') {
    head = [0, hips[1] + Math.sqrt(spineLength ** 2 - 0.4 ** 2), -0.4];
  } else if (variant === 'step') {
    hips = [0, hips[1], -0.25];
    head = [0, head[1], -0.25];
    leftFoot = [leftFoot[0], leftFoot[1], -0.5];
  }

  const turn = quatFromYaw(yaw);
  const place = (position: Vec3): Pose => ({ position: quatRotateVec3(turn, position), rotation: turn });
  const at = (base: Vec3, offset: Vec3): Vec3 => [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];

  const devices: BodyDevices = {
    head: place(head),
    'left-hand': place([-0.25, floor + height * 0.6, head[2] - 0.3]),
    'right-hand': place([0.25, floor + height * 0.6, head[2] - 0.3]),
    waist: place(at(hips, WAIST_TRACKER_OFFSET)),
    'left-foot': place(at(leftFoot, FOOT_TRACKER_OFFSET)),
    'right-foot': place(at(rightFoot, FOOT_TRACKER_OFFSET)),
  };
  return {
    devices,
    hips: quatRotateVec3(turn, hips),
    leftFoot: quatRotateVec3(turn, leftFoot),
    rightFoot: quatRotateVec3(turn, rightFoot),
  };
}

/** Moves the Lighthouse-tracked devices (waist, chest, feet) by `delta` in world space, as a drifted tracking space would. */
export function shiftTrackers(devices: BodyDevices, delta: Vec3): BodyDevices {
  const shifted: BodyDevices = { ...devices };
  for (const part of ['waist', 'chest', 'left-foot', 'right-foot'] as const) {
    const pose = devices[part];
    if (pose) shifted[part] = { rotation: pose.rotation, position: [pose.position[0] + delta[0], pose.position[1] + delta[1], pose.position[2] + delta[2]] };
  }
  return shifted;
}
