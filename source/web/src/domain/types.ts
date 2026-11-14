// Shared data types of the scene. No logic and no dependencies.
//
// Conventions (the same as OpenVR and three.js):
// - right-handed coordinates, +Y up, -Z forward; positions in meters;
// - rotations are unit quaternions [x, y, z, w];
// - a pose named `aFromB` maps a point given in space B into space A.

/** A position or a direction in meters: [x, y, z]. */
export type Vec3 = readonly [number, number, number];

/** A unit quaternion: [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

/** A rigid transform `aFromB`: rotate by `rotation`, then translate by `position`. */
export interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

/** Which tracking system reports a device: the headset's own tracking, or Lighthouse. */
export type TrackingSystem = 'headset' | 'lighthouse';

export type DeviceRole = 'headset' | 'controller' | 'tracker' | 'base-station';

/**
 * - `tracking`: the pose is current;
 * - `tracking-lost`: the device is connected but not tracked, the pose is the last known one;
 * - `disconnected`: the device is off or out of range, the pose is the last known one.
 */
export type DeviceState = 'tracking' | 'tracking-lost' | 'disconnected';

/** Where on the body a device is held or worn. */
export type BodyPart = 'head' | 'left-hand' | 'right-hand' | 'chest' | 'waist' | 'left-foot' | 'right-foot';

/** What does not change while a device stays in the session. */
export interface DeviceInfo {
  /** Unique within a session and stable for its whole length. */
  readonly id: string;
  readonly role: DeviceRole;
  readonly trackingSystem: TrackingSystem;
  /** Model name shown to the user. */
  readonly name: string;
  readonly serial: string;
  /** Set for devices held or worn on the body; absent for base stations and loose devices. */
  readonly bodyPart?: BodyPart;
}

/** One device at one moment. */
export interface DeviceSample {
  readonly id: string;
  readonly state: DeviceState;
  /** `worldFromDevice`. The last known pose when not tracking; null when the device was never tracked. */
  readonly pose: Pose | null;
}

/** Play-area bounds as a closed polygon on the floor, in world space. */
export interface PlayArea {
  readonly trackingSystem: TrackingSystem;
  readonly corners: readonly Vec3[];
}

/** What a session consists of. Sent again whenever a device joins or leaves, or a play area changes. */
export interface SessionInfo {
  readonly devices: readonly DeviceInfo[];
  readonly playAreas: readonly PlayArea[];
  /** Height of the floor in world space, meters. */
  readonly floorHeight: number;
}

/** All devices at one moment. Holds exactly one sample per device of the current `SessionInfo`. */
export interface Frame {
  /** Seconds since the session started; never decreases within a session. */
  readonly time: number;
  readonly devices: readonly DeviceSample[];
}
