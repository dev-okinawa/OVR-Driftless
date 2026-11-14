// A stand-in for SteamVR, so that the interface can be run and tested against the real core without VR hardware.
// It replaces only the OpenVR adapter: polling, conversion, the protocol and the WebSocket stay the real ones.
import type { OpenvrSession, RawDevice, RawPose } from './openvr.ts';
import { MAX_DEVICES } from './openvr.ts';
import type { Vec3 } from './protocol.ts';
import type { TrackerRoles } from './trackerRoles.ts';

/** `ETrackedDeviceClass`: HMD, controller, generic tracker, tracking reference. */
const HMD = 1;
const CONTROLLER = 2;
const TRACKER = 3;
const BASE_STATION = 4;
const RUNNING_OK = 200;
const CALIBRATING_OUT_OF_RANGE = 101;

const tracker = (serial: string) => ({ registeredDeviceType: `htc/vive_tracker${serial}`, trackingSystemName: 'lighthouse' });

const DEVICES: readonly RawDevice[] = [
  { index: 0, deviceClass: HMD, trackingSystemName: 'fake', model: 'Fake Headset', serial: 'FAKE-HMD', registeredDeviceType: 'fake/hmd', controllerRoleHint: 0 },
  { index: 1, deviceClass: CONTROLLER, trackingSystemName: 'fake', model: 'Fake Controller', serial: 'FAKE-LEFT', registeredDeviceType: 'fake/left', controllerRoleHint: 1 },
  { index: 2, deviceClass: CONTROLLER, trackingSystemName: 'fake', model: 'Fake Controller', serial: 'FAKE-RIGHT', registeredDeviceType: 'fake/right', controllerRoleHint: 2 },
  { index: 3, deviceClass: TRACKER, model: 'VIVE Tracker 3.0', serial: 'LHR-FAKE01', controllerRoleHint: 0, ...tracker('LHR-FAKE01') },
  { index: 4, deviceClass: TRACKER, model: 'VIVE Tracker 3.0', serial: 'LHR-FAKE02', controllerRoleHint: 0, ...tracker('LHR-FAKE02') },
  { index: 5, deviceClass: TRACKER, model: 'VIVE Tracker 3.0', serial: 'LHR-FAKE03', controllerRoleHint: 0, ...tracker('LHR-FAKE03') },
  { index: 6, deviceClass: BASE_STATION, trackingSystemName: 'lighthouse', model: 'Valve SR Imp', serial: 'LHB-FAKE01', registeredDeviceType: 'fake/lhb1', controllerRoleHint: 0 },
  { index: 7, deviceClass: BASE_STATION, trackingSystemName: 'lighthouse', model: 'Valve SR Imp', serial: 'LHB-FAKE02', registeredDeviceType: 'fake/lhb2', controllerRoleHint: 0 },
];

/** The roles a user would set in SteamVR's "Manage Trackers" for the fake trackers. */
export const FAKE_TRACKER_ROLES: TrackerRoles = new Map([
  ['/devices/htc/vive_trackerLHR-FAKE01', 'TrackerRole_Waist'],
  ['/devices/htc/vive_trackerLHR-FAKE02', 'TrackerRole_LeftFoot'],
  ['/devices/htc/vive_trackerLHR-FAKE03', 'TrackerRole_RightFoot'],
]);

/** Faults on a fixed schedule, seconds into each cycle: the left foot tracker loses tracking, the right controller switches off. */
const FAULTS = {
  footLost: { cycle: 20, from: 15, to: 17 },
  controllerOff: { cycle: 30, from: 24, to: 27 },
} as const;
const within = (t: number, fault: { cycle: number; from: number; to: number }): boolean => {
  const phase = t % fault.cycle;
  return phase >= fault.from && phase < fault.to;
};

/** `HmdMatrix34_t` of a yaw about +Y, then a translation, row-major. */
function matrix(position: Vec3, yaw: number): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c, 0, s, position[0], 0, 1, 0, position[1], -s, 0, c, position[2]];
}

/** A person standing near the middle of the room, swaying and turning, arms moving. */
export function fakePoses(t: number): RawPose[] {
  const center: Vec3 = [0.3 * Math.sin(0.3 * t), 0, 0.2 * Math.sin(0.17 * t)];
  const yaw = 0.4 * Math.sin(0.1 * t);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const body = (local: Vec3): Vec3 => [center[0] + c * local[0] + s * local[2], local[1], center[2] - s * local[0] + c * local[2]];
  const at = (position: Vec3, rotation = yaw, trackingResult = RUNNING_OK, connected = true): RawPose => ({
    matrix: matrix(position, rotation),
    trackingResult,
    valid: trackingResult === RUNNING_OK,
    connected,
  });

  const footLost = within(t, FAULTS.footLost);
  const controllerOff = within(t, FAULTS.controllerOff);
  const poses: RawPose[] = [
    at(body([0, 1.65 + 0.02 * Math.sin(1.1 * t), 0])),
    at(body([-0.25, 1.05 + 0.15 * Math.sin(1.3 * t), -0.25])),
    controllerOff
      ? at(body([0.25, 1.05, -0.25]), yaw, RUNNING_OK, false)
      : at(body([0.25, 1.05 + 0.15 * Math.sin(1.3 * t + Math.PI), -0.25])),
    at(body([0, 1.0, -0.1])),
    footLost ? at(body([-0.1, 0.1, 0]), yaw, CALIBRATING_OUT_OF_RANGE) : at(body([-0.1, 0.1 + 0.03 * Math.max(0, Math.sin(2 * t)), 0])),
    at(body([0.1, 0.1 + 0.03 * Math.max(0, -Math.sin(2 * t)), 0])),
    at([-2, 2.2, -2], Math.PI / 4),
    at([2, 2.2, 2], (-3 * Math.PI) / 4),
  ];
  const idle: RawPose = { matrix: matrix([0, 0, 0], 0), trackingResult: 1, valid: false, connected: false };
  while (poses.length < MAX_DEVICES) poses.push(idle);
  return poses;
}

/** A fake SteamVR session; `now` is the core's clock, seconds. */
export function createFakeSteamvr(now: () => number): OpenvrSession {
  return {
    devices: () => [...DEVICES],
    poses: () => fakePoses(now()),
    quitRequested: () => false,
    playArea: () => [
      [-1.5, 0, -1.5],
      [1.5, 0, -1.5],
      [1.5, 0, 1.5],
      [-1.5, 0, 1.5],
    ],
    shutdown: () => undefined,
  };
}
