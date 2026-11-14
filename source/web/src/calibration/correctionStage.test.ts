import { describe, expect, it } from 'vitest';
import type { DeviceInfo, Frame, Pose, SessionInfo } from '../domain/types';
import { quatFromYaw } from '../math/quat';
import { vec3Distance } from '../math/vec3';
import type { OriginChange, PoseSource, PoseSourceListener, SourceKind } from '../sources/source';
import { SessionStore } from '../state/sessionStore';
import { CorrectionStage } from './correctionStage';

const HEADSET: DeviceInfo = { id: 'hmd', role: 'headset', trackingSystem: 'headset', name: 'HMD', serial: '1' };
const TRACKER: DeviceInfo = { id: 'trk', role: 'tracker', trackingSystem: 'lighthouse', name: 'Tracker', serial: '2' };
const BASE: DeviceInfo = { id: 'base', role: 'base-station', trackingSystem: 'lighthouse', name: 'Base', serial: '3' };

const SESSION: SessionInfo = {
  devices: [HEADSET, TRACKER, BASE],
  playAreas: [
    { trackingSystem: 'headset', corners: [[1, 0, 1]] },
    { trackingSystem: 'lighthouse', corners: [[1, 0, 0]] },
  ],
  floorHeight: 0.1,
};

const IDENTITY = [0, 0, 0, 1] as const;

function frame(time: number): Frame {
  return {
    time,
    devices: [
      { id: 'hmd', state: 'tracking', pose: { position: [0, 1.6, 0], rotation: IDENTITY } },
      { id: 'trk', state: 'tracking', pose: { position: [1, 0.5, 0], rotation: IDENTITY } },
      { id: 'base', state: 'tracking-lost', pose: null },
    ],
  };
}

// A quarter turn about +Y and a shift: a point (1, y, 0) of Lighthouse space lands at (0, y, -1) + shift.
const CORRECTION: Pose = { position: [0.5, 0.1, 0.2], rotation: quatFromYaw(Math.PI / 2) };

class FakeSource implements PoseSource {
  listener: PoseSourceListener | null = null;
  stopped = false;
  constructor(readonly kind: SourceKind = 'simulated') {}
  start(listener: PoseSourceListener): void {
    this.listener = listener;
    listener.onSession(SESSION);
  }
  stop(): void {
    this.stopped = true;
    this.listener = null;
  }
}

function setup(kind: SourceKind = 'simulated') {
  const store = new SessionStore();
  const stage = new CorrectionStage();
  const source = new FakeSource(kind);
  store.attach(stage.wrap(source));
  const raw: { frame: Frame; session: SessionInfo }[] = [];
  const origins: OriginChange[] = [];
  stage.subscribeRaw((rawFrame, session) => raw.push({ frame: rawFrame, session }));
  stage.subscribeOrigin((change) => origins.push(change));
  const send = (time: number) => source.listener?.onFrame(frame(time));
  return { store, stage, source, raw, origins, send };
}

describe('CorrectionStage', () => {
  it('passes the source objects through without a correction', () => {
    const { store, send } = setup();
    send(0);
    expect(store.frame).toEqual(frame(0));
    expect(store.getSnapshot().session).toBe(SESSION);
  });

  it('shows the store corrected Lighthouse poses and the raw tap the raw ones', () => {
    const { store, stage, raw, send } = setup();
    expect(stage.apply(CORRECTION)).toBe(true);
    send(1);

    const corrected = store.frame?.devices.find((sample) => sample.id === 'trk')?.pose;
    expect(corrected && vec3Distance(corrected.position, [0.5, 0.6, -0.8])).toBeLessThan(1e-9);
    // Headset devices are unchanged; a null pose stays null; the base station without a pose is kept as is.
    expect(store.frame?.devices[0]).toEqual(frame(1).devices[0]);
    expect(store.frame?.devices[2]).toEqual(frame(1).devices[2]);

    expect(raw).toHaveLength(1);
    expect(raw[0]?.frame).toEqual(frame(1));
    expect(raw[0]?.session).toBe(SESSION);
  });

  it('corrects the Lighthouse play area and keeps the floor, announcing the session at once', () => {
    const { store, stage } = setup();
    stage.apply(CORRECTION);
    const session = store.getSnapshot().session;
    expect(session).not.toBe(SESSION);
    expect(session?.floorHeight).toBe(0.1);
    expect(session?.playAreas[0]).toBe(SESSION.playAreas[0]);
    const corner = session?.playAreas[1]?.corners[0];
    expect(corner && vec3Distance(corner, [0.5, 0.1, -0.8])).toBeLessThan(1e-9);
  });

  it('keeps one corrected session object per raw session and correction', () => {
    const { store, stage, source } = setup();
    stage.apply(CORRECTION);
    const first = store.getSnapshot().session;
    source.listener?.onSession(SESSION);
    expect(store.getSnapshot().session).toBe(first);
    stage.apply({ ...CORRECTION });
    expect(store.getSnapshot().session).not.toBe(first);
    const second = store.getSnapshot().session;
    source.listener?.onSession(SESSION);
    expect(store.getSnapshot().session).toBe(second);
  });

  it('clear returns the source objects', () => {
    const { store, stage } = setup();
    stage.apply(CORRECTION);
    stage.clear();
    expect(store.getSnapshot().session).toBe(SESSION);
    expect(stage.getSnapshot().headsetFromLighthouse).toBeNull();
  });

  it('does not correct a replay and refuses a correction', () => {
    const { store, stage, send } = setup('replay');
    expect(stage.apply(CORRECTION)).toBe(false);
    send(0);
    expect(store.getSnapshot().session).toBe(SESSION);
    expect(store.frame).toEqual(frame(0));
    expect(stage.getSnapshot().headsetFromLighthouse).toBeNull();
  });

  it('clears the correction for a new source', () => {
    const { stage, source } = setup();
    stage.apply(CORRECTION);
    const next = new FakeSource();
    const wrapped = stage.wrap(next);
    expect(stage.getSnapshot().headsetFromLighthouse).toBeNull();
    // The old source stops after the new one was wrapped: it must not disturb the new one.
    source.stop();
    wrapped.start({ onStatus: () => undefined, onSession: () => undefined, onFrame: () => undefined });
    expect(next.listener).not.toBeNull();
  });

  it('notifies subscribers of the snapshot and forwards origin changes', () => {
    const { stage, source, origins } = setup();
    let notified = 0;
    stage.subscribe(() => (notified += 1));
    stage.apply(CORRECTION);
    stage.clear();
    expect(notified).toBe(2);
    source.listener?.onOriginChange?.({ time: 3, trackingSystem: 'headset' });
    expect(origins).toEqual([{ time: 3, trackingSystem: 'headset' }]);
  });

  it('delivers raw frames to the tap before the store sees them, in time order', () => {
    const { raw, send } = setup();
    send(0);
    send(0.5);
    send(1);
    expect(raw.map((entry) => entry.frame.time)).toEqual([0, 0.5, 1]);
  });
});
