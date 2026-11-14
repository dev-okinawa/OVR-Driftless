import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { ConnectResult, OpenvrSession, RawDevice, RawPose } from './openvr.ts';
import { MAX_DEVICES } from './openvr.ts';
import { Poller } from './poller.ts';
import type { CoreStatus, Frame, SessionInfo } from './protocol.ts';

const CONFIG = { port: 0, pollHz: 10, retrySeconds: 2, scanSeconds: 2 };

const IDENTITY_AT = (x: number, y: number, z: number): number[] => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];

function device(index: number, deviceClass: number, serial: string, extra: Partial<RawDevice> = {}): RawDevice {
  return { index, deviceClass, trackingSystemName: 'oculus', model: `model-${serial}`, serial, registeredDeviceType: '', controllerRoleHint: 0, ...extra };
}

class FakeVr implements OpenvrSession {
  rawDevices: RawDevice[] = [device(0, 1, 'HMD')];
  rawPoses: RawPose[] = Array.from({ length: MAX_DEVICES }, () => ({ matrix: IDENTITY_AT(0, 0, 0), trackingResult: 1, valid: false, connected: false }));
  quit = false;
  closed = false;
  constructor() {
    this.track(0, 0, 1.6, 0);
  }
  devices(): RawDevice[] {
    return this.rawDevices;
  }
  poses(): RawPose[] {
    return this.rawPoses;
  }
  quitRequested(): boolean {
    return this.quit;
  }
  playArea() {
    return null;
  }
  shutdown(): void {
    this.closed = true;
  }
  track(index: number, x: number, y: number, z: number): void {
    this.rawPoses[index] = { matrix: IDENTITY_AT(x, y, z), trackingResult: 200, valid: true, connected: true };
  }
}

function setup(results: ConnectResult[]) {
  const statuses: CoreStatus[] = [];
  const sessions: SessionInfo[] = [];
  const frames: Frame[] = [];
  let time = 0;
  const poller = new Poller(
    CONFIG,
    {
      connect: async () => results.shift() ?? { ok: false, message: 'SteamVR is not running.' },
      trackerRoles: async () => new Map([['/devices/htc/vive_trackerLHR-1', 'TrackerRole_Waist']]),
      now: () => (time += 0.1),
    },
    { status: (s) => statuses.push(s), session: (s) => sessions.push(s), frame: (f) => frames.push(f) },
  );
  return { poller, statuses, sessions, frames };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('Poller', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }));
  afterEach(() => mock.timers.reset());

  it('reports SteamVR missing and connects when it starts', async () => {
    const vr = new FakeVr();
    const { poller, statuses, sessions } = setup([{ ok: false, message: 'SteamVR is not running.' }, { ok: true, session: vr }]);
    poller.start();
    await settle();
    assert.deepEqual(statuses, [{ state: 'connecting' }, { state: 'unavailable', message: 'SteamVR is not running.' }]);
    mock.timers.tick(2000);
    await settle();
    assert.deepEqual(statuses.at(-1), { state: 'running' });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.devices[0]?.bodyPart, 'head');
    poller.stop();
  });

  it('sends frames with the last pose kept while a device is lost', async () => {
    const vr = new FakeVr();
    const { poller, frames } = setup([{ ok: true, session: vr }]);
    poller.start();
    await settle();
    vr.track(0, 0, 1.6, 0);
    mock.timers.tick(100);
    assert.equal(frames.at(-1)?.devices[0]?.state, 'tracking');
    vr.rawPoses[0] = { matrix: IDENTITY_AT(5, 5, 5), trackingResult: 201, valid: true, connected: true };
    mock.timers.tick(100);
    const lost = frames.at(-1)?.devices[0];
    assert.equal(lost?.state, 'tracking-lost');
    assert.deepEqual(lost?.pose?.position, [0, 1.6, 0]);
    poller.stop();
  });

  it('adds a device that connects later, with its tracker role, and keeps the session otherwise', async () => {
    const vr = new FakeVr();
    const { poller, sessions } = setup([{ ok: true, session: vr }]);
    poller.start();
    await settle();
    mock.timers.tick(2000);
    await settle();
    assert.equal(sessions.length, 1);
    vr.rawDevices = [...vr.rawDevices, device(3, 3, 'LHR-1', { trackingSystemName: 'lighthouse', registeredDeviceType: 'htc/vive_trackerLHR-1' })];
    vr.track(3, 0, 1, 0);
    mock.timers.tick(2000);
    await settle();
    assert.equal(sessions.length, 2);
    assert.deepEqual(sessions[1]?.devices[1], {
      id: 'LHR-1',
      role: 'tracker',
      trackingSystem: 'lighthouse',
      name: 'model-LHR-1',
      serial: 'LHR-1',
      bodyPart: 'waist',
    });
    poller.stop();
  });

  it('leaves out a device until it connects, then keeps it when it goes', async () => {
    const vr = new FakeVr();
    vr.rawDevices = [...vr.rawDevices, device(5, 2, 'HANDL', { model: 'Hand Left', controllerRoleHint: 1 })];
    const { poller, sessions, frames } = setup([{ ok: true, session: vr }]);
    poller.start();
    await settle();
    assert.deepEqual(sessions.at(-1)?.devices.map((d) => d.id), ['HMD']);

    vr.track(5, -0.3, 1, -0.3);
    mock.timers.tick(100);
    assert.deepEqual(sessions.at(-1)?.devices.map((d) => d.id), ['HMD', 'HANDL']);
    assert.equal(frames.at(-1)?.devices[1]?.state, 'tracking');

    vr.rawPoses[5] = { matrix: IDENTITY_AT(0, 0, 0), trackingResult: 1, valid: false, connected: false };
    mock.timers.tick(100);
    assert.deepEqual(sessions.at(-1)?.devices.map((d) => d.id), ['HMD', 'HANDL']);
    assert.equal(frames.at(-1)?.devices[1]?.state, 'disconnected');
    poller.stop();
  });

  it('lets SteamVR go when it quits and tries again', async () => {
    const vr = new FakeVr();
    const { poller, statuses } = setup([{ ok: true, session: vr }]);
    poller.start();
    await settle();
    vr.quit = true;
    mock.timers.tick(100);
    assert.equal(vr.closed, true);
    assert.deepEqual(statuses.at(-1), { state: 'unavailable', message: 'SteamVR has closed.' });
    mock.timers.tick(2000);
    await settle();
    assert.deepEqual(statuses.at(-1), { state: 'unavailable', message: 'SteamVR is not running.' });
    poller.stop();
  });
});
