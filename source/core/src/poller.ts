import type { CoreConfig } from './config.ts';
import { bodyPartOf, deviceRole, deviceState, poseFromMatrix34, trackingSystemOf } from './convert.ts';
import type { ConnectResult, OpenvrSession, RawDevice, RawPose } from './openvr.ts';
import type { CoreStatus, DeviceInfo, DeviceSample, Frame, PlayArea, Pose, SessionInfo } from './protocol.ts';
import { trackerRoleOf, type TrackerRoles } from './trackerRoles.ts';

export interface PollerListener {
  status(status: CoreStatus): void;
  session(session: SessionInfo): void;
  frame(frame: Frame): void;
}

export interface PollerDeps {
  /** Finds openvr_api.dll and connects to SteamVR. */
  connect(): Promise<ConnectResult>;
  trackerRoles(): Promise<TrackerRoles>;
  /** Seconds on a clock that never goes back. */
  now(): number;
}

interface Tracked {
  readonly index: number;
  readonly info: DeviceInfo;
}

/**
 * Connects to SteamVR and retries, scans devices every `scanSeconds`, reads poses `pollHz` times a second.
 * A device joins the session the first time it is connected, so devices SteamVR only remembers (switched off
 * since an earlier run, or the headset's hand tracking while the controllers are held) stay out of the scene;
 * once in, it stays, marked disconnected when it goes. A new connection to SteamVR starts a new session.
 */
export class Poller {
  private vr: OpenvrSession | null = null;
  /** Every device SteamVR has a class for, by index, with its latest properties. */
  private known = new Map<number, DeviceInfo>();
  /** The devices of the session, in the order they joined. */
  private devices: Tracked[] = [];
  private playAreas: PlayArea[] = [];
  private sessionKey = '';
  private readonly lastPoses = new Map<string, Pose>();
  private statusKey = '';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  private readonly config: CoreConfig;
  private readonly deps: PollerDeps;
  private readonly listener: PollerListener;

  constructor(config: CoreConfig, deps: PollerDeps, listener: PollerListener) {
    this.config = config;
    this.deps = deps;
    this.listener = listener;
  }

  start(): void {
    this.report({ state: 'connecting' });
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const result = await this.deps.connect();
    if (this.stopped) {
      if (result.ok) result.session.shutdown();
      return;
    }
    if (!result.ok) {
      this.report({ state: 'unavailable', message: result.message });
      this.timers.push(setTimeout(() => void this.connect(), this.config.retrySeconds * 1000));
      return;
    }
    this.vr = result.session;
    this.known = new Map();
    this.devices = [];
    this.playAreas = [];
    this.sessionKey = '';
    this.lastPoses.clear();
    await this.scan();
    if (!this.vr) return;
    this.report({ state: 'running' });
    this.timers.push(setInterval(() => this.tick(), 1000 / this.config.pollHz));
    this.timers.push(setInterval(() => void this.scan(), this.config.scanSeconds * 1000));
  }

  private disconnect(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.vr?.shutdown();
    this.vr = null;
  }

  private async scan(): Promise<void> {
    const roles = await this.deps.trackerRoles();
    const vr = this.vr;
    if (!vr) return;
    for (const raw of vr.devices()) this.remember(raw, roles);
    this.devices = this.devices.map(({ index, info }) => ({ index, info: this.known.get(index) ?? info }));
    this.admit(vr.poses());
    const corners = vr.playArea();
    const hmd = this.devices.find((device) => device.info.role === 'headset');
    this.playAreas = corners ? [{ trackingSystem: hmd?.info.trackingSystem ?? 'headset', corners }] : [];
    this.publishSession();
  }

  /** Adds the known devices that are connected now and not yet in the session; true when any joined. */
  private admit(poses: readonly RawPose[]): boolean {
    let joined = false;
    for (const [index, info] of this.known) {
      if (!poses[index]?.connected || this.devices.some((device) => device.index === index)) continue;
      this.devices.push({ index, info });
      joined = true;
    }
    return joined;
  }

  private publishSession(): void {
    const session: SessionInfo = { devices: this.devices.map((device) => device.info), playAreas: this.playAreas, floorHeight: 0 };
    const key = JSON.stringify(session);
    if (key === this.sessionKey) return;
    this.sessionKey = key;
    this.listener.session(session);
  }

  private remember(raw: RawDevice, roles: TrackerRoles): void {
    const role = deviceRole(raw.deviceClass);
    if (!role) return;
    const wanted = raw.serial || `index-${raw.index}`;
    const taken = [...this.known].some(([index, info]) => index !== raw.index && info.id === wanted);
    const id = raw.serial && !taken ? raw.serial : `index-${raw.index}`;
    const bodyPart = bodyPartOf(role, raw.controllerRoleHint, trackerRoleOf(roles, raw.registeredDeviceType));
    const info: DeviceInfo = {
      id,
      role,
      trackingSystem: trackingSystemOf(role, raw.trackingSystemName),
      name: raw.model || role,
      serial: raw.serial,
      ...(bodyPart ? { bodyPart } : {}),
    };
    this.known.set(raw.index, info);
  }

  private tick(): void {
    const vr = this.vr;
    if (!vr) return;
    if (vr.quitRequested()) {
      this.disconnect();
      this.report({ state: 'unavailable', message: 'SteamVR has closed.' });
      this.timers.push(setTimeout(() => void this.connect(), this.config.retrySeconds * 1000));
      return;
    }
    const poses = vr.poses();
    // A device that just connected joins the session before the frame that carries it.
    if (this.admit(poses)) this.publishSession();
    const samples: DeviceSample[] = this.devices.map(({ index, info }) => {
      const raw = poses[index];
      const state = raw ? deviceState(raw.connected, raw.valid, raw.trackingResult) : 'disconnected';
      if (raw && state === 'tracking') this.lastPoses.set(info.id, poseFromMatrix34(raw.matrix));
      return { id: info.id, state, pose: this.lastPoses.get(info.id) ?? null };
    });
    this.listener.frame({ time: this.deps.now(), devices: samples });
  }

  private report(status: CoreStatus): void {
    const key = JSON.stringify(status);
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.listener.status(status);
  }
}
