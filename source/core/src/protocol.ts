// Messages the core sends to the interface over its WebSocket, one JSON object per text message.
// The types are structurally the interface's domain types (docs/specification/scene/scene.md, Data Model).
// Any change to a message increments PROTOCOL_VERSION.

export const PROTOCOL_VERSION = 1;

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export type TrackingSystem = 'headset' | 'lighthouse';
export type DeviceRole = 'headset' | 'controller' | 'tracker' | 'base-station';
export type DeviceState = 'tracking' | 'tracking-lost' | 'disconnected';
export type BodyPart = 'head' | 'left-hand' | 'right-hand' | 'chest' | 'waist' | 'left-foot' | 'right-foot';

export interface DeviceInfo {
  readonly id: string;
  readonly role: DeviceRole;
  readonly trackingSystem: TrackingSystem;
  readonly name: string;
  readonly serial: string;
  readonly bodyPart?: BodyPart;
}

export interface DeviceSample {
  readonly id: string;
  readonly state: DeviceState;
  readonly pose: Pose | null;
}

export interface PlayArea {
  readonly trackingSystem: TrackingSystem;
  readonly corners: readonly Vec3[];
}

export interface SessionInfo {
  readonly devices: readonly DeviceInfo[];
  readonly playAreas: readonly PlayArea[];
  readonly floorHeight: number;
}

export interface Frame {
  readonly time: number;
  readonly devices: readonly DeviceSample[];
}

export type CoreStatus =
  | { readonly state: 'connecting' | 'running' }
  | { readonly state: 'unavailable'; readonly message: string };

export type CoreMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly core: string }
  | ({ readonly type: 'status' } & CoreStatus)
  | { readonly type: 'session'; readonly session: SessionInfo }
  | { readonly type: 'frame'; readonly frame: Frame };
