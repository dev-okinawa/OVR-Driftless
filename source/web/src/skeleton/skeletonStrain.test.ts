import { describe, expect, it } from 'vitest';
import type { BodyPart, DeviceInfo, Frame, SessionInfo } from '../domain/types';
import type { PoseSource, PoseSourceListener } from '../sources/source';
import { SessionStore } from '../state/sessionStore';
import { makeBody } from './bodyFixtures';
import { SkeletonStrain } from './skeletonStrain';

class FakeSource implements PoseSource {
  readonly kind = 'simulated' as const;
  listener: PoseSourceListener | null = null;
  start(listener: PoseSourceListener): void {
    this.listener = listener;
  }
  stop(): void {
    this.listener = null;
  }
}

const PARTS: readonly BodyPart[] = ['head', 'left-hand', 'right-hand', 'waist', 'left-foot', 'right-foot'];

const session: SessionInfo = {
  devices: PARTS.map<DeviceInfo>((part) => ({
    id: part,
    role: part === 'head' ? 'headset' : part.endsWith('hand') ? 'controller' : 'tracker',
    trackingSystem: part === 'waist' || part.endsWith('foot') ? 'lighthouse' : 'headset',
    name: part,
    serial: part,
    bodyPart: part,
  })),
  playAreas: [],
  floorHeight: 0,
};

function frameAt(time: number, lost: readonly BodyPart[] = []): Frame {
  const { devices } = makeBody();
  return {
    time,
    devices: PARTS.map((part) => ({
      id: part,
      state: lost.includes(part) ? 'tracking-lost' : 'tracking',
      pose: devices[part] ?? null,
    })),
  };
}

function setup() {
  const store = new SessionStore();
  const source = new FakeSource();
  store.attach(source);
  source.listener?.onSession(session);
  const skeleton = new SkeletonStrain(store);
  const feed = (time: number, lost: readonly BodyPart[] = []) => source.listener?.onFrame(frameAt(time, lost));
  return { store, source, skeleton, feed };
}

describe('SkeletonStrain', () => {
  it('draws nothing and calibrates nothing before a frame', () => {
    const { skeleton } = setup();
    expect(skeleton.calibrate()).toBe(false);
    expect(skeleton.latest).toBeNull();
    expect(skeleton.getSnapshot().calibrated).toBe(false);
    expect(skeleton.getSeries()[0]?.points).toHaveLength(0);
  });

  it('follows the head and the hands with no strain until calibrated, then solves every frame', () => {
    const { skeleton, feed } = setup();
    feed(0);
    feed(0.1);
    const driven = skeleton.latest?.pose.drivenJoints;
    expect([...(driven ?? [])].sort()).toEqual(['head', 'leftHand', 'rightHand']);
    expect(skeleton.latest?.strain).toBeNull();
    expect(skeleton.getSnapshot().calibrated).toBe(false);

    expect(skeleton.calibrate()).toBe(true);
    expect(skeleton.latest).not.toBeNull();
    expect(skeleton.getSnapshot().calibrated).toBe(true);
    expect(skeleton.getSnapshot().heightMeters).toBeCloseTo(1.8, 6);

    feed(0.2);
    expect(skeleton.latest?.strain?.totalMm).toBe(0);
  });

  it('does not calibrate while the head is not tracking', () => {
    const { skeleton, feed } = setup();
    feed(0, ['head']);
    expect(skeleton.calibrate()).toBe(false);
  });

  it('keeps a snapshot object until something changes, and notifies subscribers', () => {
    const { skeleton, feed } = setup();
    let notified = 0;
    skeleton.subscribe(() => (notified += 1));
    feed(0);
    expect(skeleton.getSnapshot()).toBe(skeleton.getSnapshot());
    skeleton.calibrate();
    expect(notified).toBeGreaterThan(0);
    const before = skeleton.getSnapshot();
    feed(0.01);
    expect(skeleton.getSnapshot()).toBe(before);
  });

  it('records a growing history, bounded for a long session', () => {
    const { skeleton, feed } = setup();
    feed(0);
    skeleton.calibrate();
    for (let i = 1; i <= 100; i += 1) feed(i / 10);
    const small = skeleton.getSeries()[0]?.points.length ?? 0;
    expect(small).toBeGreaterThan(50);

    for (let i = 101; i <= 20000; i += 1) feed(i / 10);
    const points = skeleton.getSeries()[0]?.points ?? [];
    expect(points.length).toBeLessThanOrEqual(2400);
    expect(points[0]?.time).toBeLessThan(1);
    expect(points[points.length - 1]?.time).toBeGreaterThan(1990);
  });

  it('puts a gap in the history where nothing connects the two systems', () => {
    const { skeleton, feed } = setup();
    feed(0);
    skeleton.calibrate();
    feed(1, ['waist', 'left-foot', 'right-foot']);
    const points = skeleton.getSeries()[0]?.points ?? [];
    expect(points[points.length - 1]?.value).toBeNull();
    expect(skeleton.latest?.strain).toBeNull();
    expect(skeleton.latest?.pose.drivenJoints.has('hips')).toBe(false);
  });

  it('drops history later than the frame time when time goes backwards', () => {
    const { skeleton, feed } = setup();
    feed(0);
    skeleton.calibrate();
    for (let i = 1; i <= 100; i += 1) feed(i / 10);
    feed(4);
    const points = skeleton.getSeries()[0]?.points ?? [];
    expect(points[points.length - 1]?.time).toBe(4);
    expect(points.every((p) => p.time <= 4)).toBe(true);
  });

  it('forgets the calibration when the session ends', () => {
    const { store, skeleton, feed } = setup();
    feed(0);
    skeleton.calibrate();
    store.detach();
    expect(skeleton.getSnapshot().calibrated).toBe(false);
    expect(skeleton.latest).toBeNull();
  });

  it('stops listening after dispose', () => {
    const { skeleton, feed } = setup();
    feed(0);
    skeleton.calibrate();
    skeleton.dispose();
    const before = skeleton.getSeries()[0]?.points.length;
    feed(5);
    expect(skeleton.getSeries()[0]?.points.length).toBe(before);
  });
});
