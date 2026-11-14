// Pure, deterministic model of a person in a VR room. No timers, no DOM, no randomness.
//
// Time contract: `sample(time)` takes seconds and advances the model; `time` never goes back (an earlier value is
// treated as the last one). Every control method takes effect from the time of the LAST `sample` call, so a caller that
// samples at its frame rate gets changes accurate to one frame. `getTrueMisalignment(time)` takes its own time and
// extrapolates the drift from the last sample without changing the model.
//
// What is reported: the body model gives each device its TRUE pose in a common world. Headset-system devices and the
// headset play area are reported as `headsetShift ∘ truePose`, Lighthouse devices, base stations and the Lighthouse
// play area as `lighthouseCreep ∘ truePose`. Both transforms only rotate about the vertical axis and translate.

import type { DeviceInfo, DeviceSample, Frame, PlayArea, Pose, Quat, SessionInfo, Vec3 } from '../../domain/types';
import { POSE_IDENTITY, poseCompose, poseInverse, poseTransformPoint } from '../../math/pose';
import {
  QUAT_IDENTITY,
  quatFromAxisAngle,
  quatFromYaw,
  quatMultiply,
  quatNormalize,
  quatRotateVec3,
} from '../../math/quat';
import { vec3Add, vec3Lerp, vec3Normalize, vec3Scale } from '../../math/vec3';

export const DEVICE_IDS = {
  headset: 'headset',
  controllerLeft: 'controller-left',
  controllerRight: 'controller-right',
  trackerWaist: 'tracker-waist',
  trackerLeftFoot: 'tracker-left-foot',
  trackerRightFoot: 'tracker-right-foot',
  baseStation1: 'base-station-1',
  baseStation2: 'base-station-2',
} as const;

export type MotionPreset = 'stand' | 'walk' | 'squat' | 'reach' | 'wave';

export const MOTION_PRESETS: readonly MotionPreset[] = ['stand', 'walk', 'squat', 'reach', 'wave'];

export interface SimulatorOptions {
  /** Height of the person, meters. Default 1.75. */
  readonly heightMeters?: number;
  /** Default `stand`. */
  readonly motion?: MotionPreset;
  /** The Lighthouse space starts displaced by this much (a yaw and a horizontal offset); default none. */
  readonly lighthouseOffset?: { readonly yawDeg: number; readonly offsetMm: number };
}

export interface DriftRate {
  readonly yawDegPerMinute: number;
  readonly positionMmPerMinute: number;
}

export interface Jump {
  readonly yawDeg: number;
  readonly offsetMm: number;
}

export interface SimulatorDeviceState {
  readonly id: string;
  readonly name: string;
  readonly present: boolean;
  readonly connected: boolean;
  readonly tracked: boolean;
}

/** Everything the control panel shows. The same object is returned until something changes. */
export interface SimulatorState {
  readonly motion: MotionPreset;
  readonly paused: boolean;
  readonly driftRate: DriftRate;
  readonly pairAttached: boolean;
  readonly devices: readonly SimulatorDeviceState[];
}

/** The changes a user can make. Unknown device ids are ignored. */
export interface SimulatorSettings {
  setMotion(motion: MotionPreset): void;
  /** A paused body stands still; time keeps running. */
  setPaused(paused: boolean): void;
  /** `lighthouseCreep` grows at this rate from now on. */
  setDriftRate(rate: DriftRate): void;
  /**
   * Models the headset recentering: a sudden change of `headsetShift`, a rotation about the vertical axis through the
   * headset's current position plus a horizontal offset of `offsetMm` along `JUMP_DIRECTION`.
   */
  jump(jump: Jump): void;
  /** Both transforms back to identity. The drift rate is kept. */
  resetMisalignment(): void;
  setDeviceTracking(deviceId: string, tracked: boolean): void;
  setDeviceConnected(deviceId: string, connected: boolean): void;
  /** Removes a device from the session, or adds it back (a tracker powered on mid-session). */
  setDevicePresent(deviceId: string, present: boolean): void;
  /**
   * Measurement setup: the waist tracker is rigidly joined to the right controller, 8 cm to its side, and has no
   * body part; when false it is back on the waist.
   */
  setPairAttached(attached: boolean): void;
}

export interface SimulatorModel extends SimulatorSettings {
  sample(time: number): { readonly session: SessionInfo; readonly frame: Frame };
  /**
   * `headsetWorldFromLighthouseWorld` at `time`: the transform that re-aligns Lighthouse devices with headset devices.
   * Identity when aligned.
   */
  getTrueMisalignment(time: number): Pose;
  getState(): SimulatorState;
}

/** Horizontal direction of the Lighthouse translation drift. */
export const DRIFT_DIRECTION: Vec3 = vec3Normalize([0.6, 0, 0.8]);
/** Horizontal direction of the offset of a jump. */
export const JUMP_DIRECTION: Vec3 = vec3Normalize([0.8, 0, -0.6]);

const DEFAULT_HEIGHT = 1.75;
/** Lengths of the stances below are written for this height and scaled. */
const REFERENCE_HEIGHT = 1.75;
const FOOT_TOP_HEIGHT = 0.09;
const WAIST_TRACKER_FORWARD = 0.1;
const PAIR_OFFSET: Pose = { position: [0.08, 0, 0], rotation: QUAT_IDENTITY };
const BLEND_SECONDS = 0.5;
/** While a drift is running the play areas are re-announced this often. */
const PLAY_AREA_REFRESH_SECONDS = 1;
const PLAY_AREA_HALF_SIZE = 1.5;
const WALK_RADIUS = 0.9;
const WALK_SPEED = 1;
const GAIT_HZ = 0.9;
const SQUAT_PERIOD = 4;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------
// Body model

/** The body at one moment, in a frame whose origin is on the floor and which faces `rootYaw`. */
interface Stance {
  readonly rootPosition: Vec3;
  readonly rootYaw: number;
  readonly pelvis: Vec3;
  readonly pelvisPitch: number;
  readonly head: Vec3;
  readonly headPitch: number;
  readonly leftHand: Vec3;
  readonly rightHand: Vec3;
  /** Soles of the feet; the tracker sits `FOOT_TOP_HEIGHT` above. */
  readonly leftFoot: Vec3;
  readonly rightFoot: Vec3;
  readonly leftFootPitch: number;
  readonly rightFootPitch: number;
  /** Extra turn of a controller on top of its usual orientation, radians; absent means none. */
  readonly leftHandPitch?: number;
  readonly leftHandRoll?: number;
  readonly rightHandPitch?: number;
  readonly rightHandRoll?: number;
}

interface BodyPoses {
  readonly headset: Pose;
  readonly controllerLeft: Pose;
  readonly controllerRight: Pose;
  readonly waist: Pose;
  readonly footLeft: Pose;
  readonly footRight: Pose;
}

function standStance(t: number, s: number): Stance {
  const swayX = 0.012 * s * Math.sin(0.8 * t);
  const swayZ = 0.008 * s * Math.sin(0.5 * t + 1);
  const handDrift = 0.01 * s * Math.sin(0.9 * t);
  return {
    rootPosition: [0, 0, 0],
    rootYaw: 0,
    pelvis: [swayX * 0.5, 0.93 * s, swayZ * 0.5],
    pelvisPitch: 0,
    head: [swayX, 1.62 * s + 0.004 * s * Math.sin(1.7 * t), swayZ],
    headPitch: 0.03 * Math.sin(0.6 * t),
    leftHand: [-0.24 * s + handDrift, 0.82 * s, -0.06 * s],
    rightHand: [0.24 * s - handDrift, 0.82 * s, -0.06 * s],
    leftFoot: [-0.12 * s, 0, 0],
    rightFoot: [0.12 * s, 0, 0],
    leftFootPitch: 0,
    rightFootPitch: 0,
  };
}

function walkStance(t: number, s: number): Stance {
  const angle = (WALK_SPEED / WALK_RADIUS) * t;
  const phase = 2 * Math.PI * GAIT_HZ * t;
  // Counter-clockwise loop seen from above; the body faces along the path, so the heading equals the path angle.
  const rootPosition: Vec3 = [WALK_RADIUS * Math.cos(angle), 0, -WALK_RADIUS * Math.sin(angle)];
  const bob = 0.012 * s * Math.cos(2 * phase);
  const sway = 0.02 * s * Math.sin(phase);
  const stride = 0.28 * s;
  const lift = 0.1 * s;
  const leftSwing = Math.sin(phase);
  const rightSwing = Math.sin(phase + Math.PI);
  const leftLift = Math.max(0, Math.cos(phase));
  const rightLift = Math.max(0, Math.cos(phase + Math.PI));
  const armSwing = 0.25 * s;
  return {
    rootPosition,
    rootYaw: angle,
    pelvis: [sway, 0.93 * s + bob, 0],
    pelvisPitch: -0.05,
    head: [sway, 1.62 * s + bob + 0.004 * s, -0.01 * s],
    headPitch: 0.02 * Math.sin(2 * phase),
    leftHand: [-0.24 * s, 0.85 * s, -0.05 * s + armSwing * leftSwing],
    rightHand: [0.24 * s, 0.85 * s, -0.05 * s + armSwing * rightSwing],
    leftFoot: [-0.1 * s, lift * leftLift, -stride * leftSwing],
    rightFoot: [0.1 * s, lift * rightLift, -stride * rightSwing],
    leftFootPitch: 0.3 * leftLift,
    rightFootPitch: 0.3 * rightLift,
  };
}

function squatStance(t: number, s: number): Stance {
  const depth01 = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / SQUAT_PERIOD);
  const depth = 0.45 * s * depth01;
  return {
    rootPosition: [0, 0, 0],
    rootYaw: 0,
    pelvis: [0, 0.93 * s - depth, 0.5 * depth],
    pelvisPitch: -0.7 * depth01,
    head: [0, 1.62 * s - 0.9 * depth, -0.25 * s * depth01],
    headPitch: 0.1 * depth01,
    leftHand: [-0.25 * s, 0.82 * s - 0.3 * depth, -0.1 * s - 0.5 * depth],
    rightHand: [0.25 * s, 0.82 * s - 0.3 * depth, -0.1 * s - 0.5 * depth],
    leftFoot: [-0.15 * s, 0, 0],
    rightFoot: [0.15 * s, 0, 0],
    leftFootPitch: 0,
    rightFootPitch: 0,
  };
}

function reachStance(t: number, s: number): Stance {
  return {
    rootPosition: [0, 0, 0],
    rootYaw: 0,
    pelvis: [0.02 * s * Math.sin(0.45 * t), 0.93 * s, 0],
    pelvisPitch: 0,
    head: [0.04 * s * Math.sin(0.45 * t), 1.6 * s, -0.03 * s],
    headPitch: 0.1 * Math.sin(0.5 * t),
    leftHand: [
      -0.25 * s - 0.45 * s * Math.sin(0.8 * t + 2),
      1.1 * s + 0.55 * s * Math.sin(0.6 * t + 3),
      -0.15 * s - 0.45 * s * (0.5 + 0.5 * Math.sin(1.1 * t + 1)),
    ],
    rightHand: [
      0.25 * s + 0.45 * s * Math.sin(0.9 * t),
      1.1 * s + 0.55 * s * Math.sin(0.7 * t + 1),
      -0.15 * s - 0.45 * s * (0.5 + 0.5 * Math.sin(1.3 * t)),
    ],
    leftFoot: [-0.15 * s, 0, 0],
    rightFoot: [0.15 * s, 0, 0],
    leftFootPitch: 0,
    rightFootPitch: 0,
  };
}

/**
 * Both hands move about 0.3 m horizontally and turn about two horizontal axes, at unrelated rates, so that a
 * controller's rotation does not keep one direction.
 */
function waveStance(t: number, s: number): Stance {
  const base = standStance(t, s);
  return {
    ...base,
    leftHand: [
      -0.24 * s - 0.3 * s * Math.sin(1.1 * t + 2),
      0.9 * s + 0.08 * s * Math.sin(0.7 * t),
      -0.3 * s + 0.3 * s * Math.sin(1.6 * t + 0.5),
    ],
    rightHand: [
      0.24 * s + 0.3 * s * Math.sin(1.3 * t),
      0.9 * s + 0.08 * s * Math.sin(0.9 * t + 1),
      -0.3 * s + 0.3 * s * Math.sin(1.7 * t + 1),
    ],
    leftHandPitch: 0.5 * Math.sin(1.4 * t + 1),
    leftHandRoll: 0.5 * Math.sin(2.1 * t),
    rightHandPitch: 0.5 * Math.sin(1.9 * t + 0.5),
    rightHandRoll: 0.5 * Math.sin(1.2 * t),
  };
}

function stanceFor(motion: MotionPreset, t: number, s: number): Stance {
  switch (motion) {
    case 'stand':
      return standStance(t, s);
    case 'walk':
      return walkStance(t, s);
    case 'squat':
      return squatStance(t, s);
    case 'reach':
      return reachStance(t, s);
    case 'wave':
      return waveStance(t, s);
  }
}

function lerp(a: number, b: number, w: number): number {
  return a + (b - a) * w;
}

/** Takes the short way round, because the heading of a walk grows without bound. */
function lerpAngle(a: number, b: number, w: number): number {
  const difference = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + difference * w;
}

function blendStance(a: Stance, b: Stance, w: number): Stance {
  return {
    rootPosition: vec3Lerp(a.rootPosition, b.rootPosition, w),
    rootYaw: lerpAngle(a.rootYaw, b.rootYaw, w),
    pelvis: vec3Lerp(a.pelvis, b.pelvis, w),
    pelvisPitch: lerp(a.pelvisPitch, b.pelvisPitch, w),
    head: vec3Lerp(a.head, b.head, w),
    headPitch: lerp(a.headPitch, b.headPitch, w),
    leftHand: vec3Lerp(a.leftHand, b.leftHand, w),
    rightHand: vec3Lerp(a.rightHand, b.rightHand, w),
    leftFoot: vec3Lerp(a.leftFoot, b.leftFoot, w),
    rightFoot: vec3Lerp(a.rightFoot, b.rightFoot, w),
    leftFootPitch: lerp(a.leftFootPitch, b.leftFootPitch, w),
    rightFootPitch: lerp(a.rightFootPitch, b.rightFootPitch, w),
    leftHandPitch: lerp(a.leftHandPitch ?? 0, b.leftHandPitch ?? 0, w),
    leftHandRoll: lerp(a.leftHandRoll ?? 0, b.leftHandRoll ?? 0, w),
    rightHandPitch: lerp(a.rightHandPitch ?? 0, b.rightHandPitch ?? 0, w),
    rightHandRoll: lerp(a.rightHandRoll ?? 0, b.rightHandRoll ?? 0, w),
  };
}

const AXIS_X: Vec3 = [1, 0, 0];
const AXIS_Z: Vec3 = [0, 0, 1];

function orientation(pitch: number, roll: number): Quat {
  return quatMultiply(quatFromAxisAngle(AXIS_X, pitch), quatFromAxisAngle(AXIS_Z, roll));
}

/** A controller points more upward the higher the hand is held. */
function handOrientation(handHeight: number, s: number, side: 1 | -1, extraPitch = 0, extraRoll = 0): Quat {
  return orientation(-0.4 + (handHeight / s - 0.8) * 0.8 + extraPitch, 0.2 * side + extraRoll);
}

function bodyPoses(stance: Stance, s: number): BodyPoses {
  const root: Pose = { position: stance.rootPosition, rotation: quatFromYaw(stance.rootYaw) };
  const inWorld = (position: Vec3, rotation: Quat): Pose => poseCompose(root, { position, rotation });
  const pelvis: Pose = { position: stance.pelvis, rotation: orientation(stance.pelvisPitch, 0) };
  // The tracker sits on the surface of the body, in front of the pelvis joint.
  const waistLocal = poseCompose(pelvis, {
    position: [0, 0, -WAIST_TRACKER_FORWARD],
    rotation: QUAT_IDENTITY,
  });
  const footTop = (foot: Vec3): Vec3 => vec3Add(foot, [0, FOOT_TOP_HEIGHT, 0]);
  return {
    headset: inWorld(stance.head, orientation(stance.headPitch, 0)),
    controllerLeft: inWorld(
      stance.leftHand,
      handOrientation(stance.leftHand[1], s, -1, stance.leftHandPitch, stance.leftHandRoll),
    ),
    controllerRight: inWorld(
      stance.rightHand,
      handOrientation(stance.rightHand[1], s, 1, stance.rightHandPitch, stance.rightHandRoll),
    ),
    waist: poseCompose(root, waistLocal),
    footLeft: inWorld(footTop(stance.leftFoot), orientation(stance.leftFootPitch, 0)),
    footRight: inWorld(footTop(stance.rightFoot), orientation(stance.rightFootPitch, 0)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Devices

interface TruePoses extends BodyPoses {
  readonly baseStation1: Pose;
  readonly baseStation2: Pose;
}

interface DeviceSpec {
  readonly info: DeviceInfo;
  readonly truePose: (poses: TruePoses) => Pose;
}

/** Pose of a device at `position` whose forward axis (-Z) looks at `target`, with no roll. */
function lookAt(position: Vec3, target: Vec3): Pose {
  const forward = vec3Normalize([target[0] - position[0], target[1] - position[1], target[2] - position[2]]);
  const yaw = Math.atan2(-forward[0], -forward[2]);
  const pitch = Math.asin(forward[1]);
  return { position, rotation: quatMultiply(quatFromYaw(yaw), quatFromAxisAngle(AXIS_X, pitch)) };
}

const ROOM_CENTER: Vec3 = [0, 1, 0];
const BASE_STATION_1 = lookAt([-2, 2.2, -2], ROOM_CENTER);
const BASE_STATION_2 = lookAt([2, 2.2, 2], ROOM_CENTER);

const WAIST_INFO: DeviceInfo = {
  id: DEVICE_IDS.trackerWaist,
  role: 'tracker',
  trackingSystem: 'lighthouse',
  name: 'VIVE Tracker 3.0',
  serial: 'LHR-TRK-0003',
  bodyPart: 'waist',
};

/** The waist tracker when joined to the controller: no body part. */
const WAIST_INFO_ATTACHED: DeviceInfo = {
  id: WAIST_INFO.id,
  role: WAIST_INFO.role,
  trackingSystem: WAIST_INFO.trackingSystem,
  name: WAIST_INFO.name,
  serial: WAIST_INFO.serial,
};

const DEVICE_SPECS: readonly DeviceSpec[] = [
  {
    info: {
      id: DEVICE_IDS.headset,
      role: 'headset',
      trackingSystem: 'headset',
      name: 'Quest 3',
      serial: 'HMD-Q3-0001',
      bodyPart: 'head',
    },
    truePose: (poses) => poses.headset,
  },
  {
    info: {
      id: DEVICE_IDS.controllerLeft,
      role: 'controller',
      trackingSystem: 'headset',
      name: 'Touch Plus (left)',
      serial: 'CTL-TP-0001',
      bodyPart: 'left-hand',
    },
    truePose: (poses) => poses.controllerLeft,
  },
  {
    info: {
      id: DEVICE_IDS.controllerRight,
      role: 'controller',
      trackingSystem: 'headset',
      name: 'Touch Plus (right)',
      serial: 'CTL-TP-0002',
      bodyPart: 'right-hand',
    },
    truePose: (poses) => poses.controllerRight,
  },
  { info: WAIST_INFO, truePose: (poses) => poses.waist },
  {
    info: {
      id: DEVICE_IDS.trackerLeftFoot,
      role: 'tracker',
      trackingSystem: 'lighthouse',
      name: 'VIVE Tracker 3.0',
      serial: 'LHR-TRK-0001',
      bodyPart: 'left-foot',
    },
    truePose: (poses) => poses.footLeft,
  },
  {
    info: {
      id: DEVICE_IDS.trackerRightFoot,
      role: 'tracker',
      trackingSystem: 'lighthouse',
      name: 'VIVE Tracker 3.0',
      serial: 'LHR-TRK-0002',
      bodyPart: 'right-foot',
    },
    truePose: (poses) => poses.footRight,
  },
  {
    info: {
      id: DEVICE_IDS.baseStation1,
      role: 'base-station',
      trackingSystem: 'lighthouse',
      name: 'SteamVR Base Station 2.0',
      serial: 'LHB-BS2-0001',
    },
    truePose: (poses) => poses.baseStation1,
  },
  {
    info: {
      id: DEVICE_IDS.baseStation2,
      role: 'base-station',
      trackingSystem: 'lighthouse',
      name: 'SteamVR Base Station 2.0',
      serial: 'LHB-BS2-0002',
    },
    truePose: (poses) => poses.baseStation2,
  },
];

interface DeviceRuntime {
  present: boolean;
  connected: boolean;
  tracked: boolean;
  /** Reported pose at the last moment the device was tracked. */
  lastPose: Pose | null;
}

function transformCorners(shift: Pose, halfSize: number): readonly Vec3[] {
  const corners: Vec3[] = [
    [-halfSize, 0, -halfSize],
    [halfSize, 0, -halfSize],
    [halfSize, 0, halfSize],
    [-halfSize, 0, halfSize],
  ];
  return corners.map((corner) => poseTransformPoint(shift, corner));
}

function reported(shift: Pose, truePose: Pose): Pose {
  const composed = poseCompose(shift, truePose);
  return { position: composed.position, rotation: quatNormalize(composed.rotation) };
}

function creepPose(yaw: number, distance: number): Pose {
  return { position: vec3Scale(DRIFT_DIRECTION, distance), rotation: quatFromYaw(yaw) };
}

export function createSimulatorModel(options: SimulatorOptions = {}): SimulatorModel {
  const scale = (options.heightMeters ?? DEFAULT_HEIGHT) / REFERENCE_HEIGHT;

  let motion: MotionPreset = options.motion ?? 'stand';
  let transition: { readonly from: MotionPreset; readonly startBodyTime: number } | null = null;
  let paused = false;
  let pairAttached = false;
  let driftRate: DriftRate = { yawDegPerMinute: 0, positionMmPerMinute: 0 };

  let lastTime = 0;
  let bodyTime = 0;
  let headsetShift: Pose = POSE_IDENTITY;
  /** Accumulated drift of the Lighthouse space at `lastTime`. */
  let creepYaw = (options.lighthouseOffset?.yawDeg ?? 0) * DEG;
  let creepDistance = (options.lighthouseOffset?.offsetMm ?? 0) / 1000;

  /** Changes whenever the play areas or the device set change, so that `sample` returns a new session object. */
  let sessionVersion = 0;
  let cachedSession: { readonly key: string; readonly session: SessionInfo } | null = null;
  let cachedState: SimulatorState | null = null;

  const devices = new Map<string, DeviceRuntime>(
    DEVICE_SPECS.map((spec) => [spec.info.id, { present: true, connected: true, tracked: true, lastPose: null }]),
  );

  function advanceTo(time: number): void {
    const next = Math.max(time, lastTime);
    const elapsed = next - lastTime;
    if (!paused) bodyTime += elapsed;
    creepYaw += driftRate.yawDegPerMinute * DEG * (elapsed / 60);
    creepDistance += (driftRate.positionMmPerMinute / 1000) * (elapsed / 60);
    lastTime = next;
    if (transition !== null && (bodyTime - transition.startBodyTime) / BLEND_SECONDS >= 1) transition = null;
  }

  function lighthouseCreepAt(time: number): Pose {
    const elapsed = Math.max(time, lastTime) - lastTime;
    return creepPose(
      creepYaw + driftRate.yawDegPerMinute * DEG * (elapsed / 60),
      creepDistance + (driftRate.positionMmPerMinute / 1000) * (elapsed / 60),
    );
  }

  function currentTruePoses(): TruePoses {
    let stance = stanceFor(motion, bodyTime, scale);
    if (transition !== null) {
      const raw = (bodyTime - transition.startBodyTime) / BLEND_SECONDS;
      const weight = raw * raw * (3 - 2 * raw);
      stance = blendStance(stanceFor(transition.from, bodyTime, scale), stance, weight);
    }
    const body = bodyPoses(stance, scale);
    return {
      ...body,
      waist: pairAttached ? poseCompose(body.controllerRight, PAIR_OFFSET) : body.waist,
      baseStation1: BASE_STATION_1,
      baseStation2: BASE_STATION_2,
    };
  }

  function buildSession(lighthouseCreep: Pose): SessionInfo {
    const infos = DEVICE_SPECS.filter((spec) => devices.get(spec.info.id)?.present === true).map((spec) =>
      spec.info.id === DEVICE_IDS.trackerWaist && pairAttached ? WAIST_INFO_ATTACHED : spec.info,
    );
    const playAreas: PlayArea[] = [
      { trackingSystem: 'headset', corners: transformCorners(headsetShift, PLAY_AREA_HALF_SIZE) },
      { trackingSystem: 'lighthouse', corners: transformCorners(lighthouseCreep, PLAY_AREA_HALF_SIZE) },
    ];
    return { devices: infos, playAreas, floorHeight: 0 };
  }

  function sessionFor(time: number): SessionInfo {
    const refresh = driftRate.yawDegPerMinute !== 0 || driftRate.positionMmPerMinute !== 0
      ? Math.floor(time / PLAY_AREA_REFRESH_SECONDS)
      : 0;
    const key = `${sessionVersion}:${refresh}`;
    if (cachedSession === null || cachedSession.key !== key) {
      cachedSession = { key, session: buildSession(lighthouseCreepAt(time)) };
    }
    return cachedSession.session;
  }

  function changed(): void {
    cachedState = null;
  }

  function changedSession(): void {
    sessionVersion += 1;
    cachedState = null;
  }

  function sample(time: number): { readonly session: SessionInfo; readonly frame: Frame } {
    advanceTo(time);
    const session = sessionFor(lastTime);
    const poses = currentTruePoses();
    const lighthouseCreep = lighthouseCreepAt(lastTime);
    const samples: DeviceSample[] = [];
    for (const spec of DEVICE_SPECS) {
      const runtime = devices.get(spec.info.id);
      if (runtime === undefined || !runtime.present) continue;
      if (runtime.connected && runtime.tracked) {
        const shift = spec.info.trackingSystem === 'headset' ? headsetShift : lighthouseCreep;
        runtime.lastPose = reported(shift, spec.truePose(poses));
        samples.push({ id: spec.info.id, state: 'tracking', pose: runtime.lastPose });
      } else {
        samples.push({
          id: spec.info.id,
          state: runtime.connected ? 'tracking-lost' : 'disconnected',
          pose: runtime.lastPose,
        });
      }
    }
    return { session, frame: { time: lastTime, devices: samples } };
  }

  function updateDevice(deviceId: string, update: (runtime: DeviceRuntime) => void): void {
    const runtime = devices.get(deviceId);
    if (runtime === undefined) return;
    update(runtime);
  }

  return {
    sample,

    getTrueMisalignment(time) {
      return poseCompose(headsetShift, poseInverse(lighthouseCreepAt(time)));
    },

    getState() {
      cachedState ??= {
        motion,
        paused,
        driftRate,
        pairAttached,
        devices: DEVICE_SPECS.map((spec) => {
          const runtime = devices.get(spec.info.id);
          return {
            id: spec.info.id,
            name: spec.info.name,
            present: runtime?.present ?? false,
            connected: runtime?.connected ?? false,
            tracked: runtime?.tracked ?? false,
          };
        }),
      };
      return cachedState;
    },

    setMotion(next) {
      if (next === motion) return;
      // Blend from the previous motion so that switching does not look like a tracking jump.
      transition = { from: motion, startBodyTime: bodyTime };
      motion = next;
      changed();
    },

    setPaused(next) {
      paused = next;
      changed();
    },

    setDriftRate(rate) {
      driftRate = rate;
      sessionVersion += 1;
      changed();
    },

    jump({ yawDeg, offsetMm }) {
      const headsetPosition = reported(headsetShift, currentTruePoses().headset).position;
      const rotation = quatFromYaw(yawDeg * DEG);
      const rotated = quatRotateVec3(rotation, headsetPosition);
      const offset = vec3Scale(JUMP_DIRECTION, offsetMm / 1000);
      // Rotation about the vertical axis through the headset: x and z of `p - R p`; y is unchanged by a yaw.
      const aboutHeadset: Pose = {
        position: [headsetPosition[0] - rotated[0] + offset[0], 0, headsetPosition[2] - rotated[2] + offset[2]],
        rotation,
      };
      headsetShift = poseCompose(aboutHeadset, headsetShift);
      changedSession();
    },

    resetMisalignment() {
      headsetShift = POSE_IDENTITY;
      creepYaw = 0;
      creepDistance = 0;
      changedSession();
    },

    setDeviceTracking(deviceId, tracked) {
      updateDevice(deviceId, (runtime) => {
        runtime.tracked = tracked;
      });
      changed();
    },

    setDeviceConnected(deviceId, connected) {
      updateDevice(deviceId, (runtime) => {
        runtime.connected = connected;
      });
      changed();
    },

    setDevicePresent(deviceId, present) {
      updateDevice(deviceId, (runtime) => {
        if (present && !runtime.present) runtime.lastPose = null;
        runtime.present = present;
      });
      changedSession();
    },

    setPairAttached(attached) {
      pairAttached = attached;
      changedSession();
    },
  };
}
