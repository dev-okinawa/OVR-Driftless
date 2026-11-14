// Pure conversions from OpenVR values to the project's types. SteamVR's standing universe already uses the
// project's convention (right-handed, +Y up, -Z forward, meters), so no axis changes here.
import type { BodyPart, DeviceRole, DeviceState, Pose, Quat, TrackingSystem } from './protocol.ts';

/** `ETrackedDeviceClass` values. */
const DEVICE_CLASS_ROLE: Readonly<Record<number, DeviceRole>> = {
  1: 'headset',
  2: 'controller',
  3: 'tracker',
  4: 'base-station',
};

/** `ETrackingResult::TrackingResult_Running_OK`. */
const RUNNING_OK = 200;

/** `ETrackedControllerRole` values of the two hands. */
const CONTROLLER_ROLE_PART: Readonly<Record<number, BodyPart>> = { 1: 'left-hand', 2: 'right-hand' };

/** SteamVR tracker roles that name a body part the skeleton uses. */
const TRACKER_ROLE_PART: Readonly<Record<string, BodyPart>> = {
  TrackerRole_Waist: 'waist',
  TrackerRole_Chest: 'chest',
  TrackerRole_LeftFoot: 'left-foot',
  TrackerRole_RightFoot: 'right-foot',
};

/** The role of a device class; null for classes the scene does not show. */
export function deviceRole(deviceClass: number): DeviceRole | null {
  return DEVICE_CLASS_ROLE[deviceClass] ?? null;
}

/** The HMD defines the headset's tracking; any other device is Lighthouse when its driver says so. */
export function trackingSystemOf(role: DeviceRole, trackingSystemName: string): TrackingSystem {
  return role !== 'headset' && trackingSystemName.toLowerCase() === 'lighthouse' ? 'lighthouse' : 'headset';
}

export function deviceState(connected: boolean, poseIsValid: boolean, trackingResult: number): DeviceState {
  if (!connected) return 'disconnected';
  return poseIsValid && trackingResult === RUNNING_OK ? 'tracking' : 'tracking-lost';
}

export function bodyPartOf(role: DeviceRole, controllerRoleHint: number, trackerRole: string | undefined): BodyPart | undefined {
  if (role === 'headset') return 'head';
  if (role === 'controller') return CONTROLLER_ROLE_PART[controllerRoleHint];
  if (role === 'tracker' && trackerRole !== undefined) return TRACKER_ROLE_PART[trackerRole];
  return undefined;
}

/**
 * `HmdMatrix34_t` (row-major 3×4: rotation in the first three columns, translation in the last), meters, as a pose.
 * The rotation is re-normalized as a quaternion, since the matrix carries float error.
 */
export function poseFromMatrix34(m: readonly number[]): Pose {
  const at = (row: number, column: number): number => m[row * 4 + column] ?? 0;
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = [at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(1, 1), at(1, 2), at(2, 0), at(2, 1), at(2, 2)];
  const trace = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  const length = Math.hypot(...q) || 1;
  const rotation: Quat = [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  return { position: [at(0, 3), at(1, 3), at(2, 3)], rotation };
}
