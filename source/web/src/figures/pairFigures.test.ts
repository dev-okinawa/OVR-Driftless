import { afterEach, describe, expect, it } from 'vitest';
import type { DeviceInfo, DeviceState, Frame, Pose, SessionInfo } from '../domain/types';
import type { PoseSource, PoseSourceListener } from '../sources/source';
import { SessionStore } from '../state/sessionStore';
import { MAX_POINTS_PER_SERIES, PairFigures } from './pairFigures';

const devices: DeviceInfo[] = [
  { id: 'ctrl', role: 'controller', trackingSystem: 'headset', name: 'Quest Touch', serial: 'Q1' },
  { id: 'trk', role: 'tracker', trackingSystem: 'lighthouse', name: 'Vive Tracker', serial: 'T1' },
];
const session: SessionInfo = { devices, playAreas: [], floorHeight: 0 };

class FakeSource implements PoseSource {
  readonly kind = 'simulated' as const;
  private listener: PoseSourceListener | null = null;
  start(listener: PoseSourceListener): void {
    this.listener = listener;
    listener.onSession(session);
  }
  stop(): void {
    this.listener = null;
  }
  emit(time: number, trk: { state?: DeviceState; x?: number } = {}, ctrlState: DeviceState = 'tracking'): void {
    const at = (x: number): Pose => ({ position: [x, 0, 0], rotation: [0, 0, 0, 1] });
    const frame: Frame = {
      time,
      devices: [
        { id: 'ctrl', state: ctrlState, pose: at(0) },
        { id: 'trk', state: trk.state ?? 'tracking', pose: at(0.1 + (trk.x ?? 0)) },
      ],
    };
    this.listener?.onFrame(frame);
  }
}

function setup(): { source: FakeSource; figures: PairFigures } {
  const store = new SessionStore();
  const source = new FakeSource();
  store.attach(source);
  const figures = new PairFigures(store);
  return { source, figures };
}

describe('PairFigures', () => {
  let figures: PairFigures | null = null;
  afterEach(() => figures?.dispose());

  it('has no points before a reference and points after', () => {
    const ctx = setup();
    figures = ctx.figures;
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0);
    ctx.source.emit(1);
    expect(figures.getSeries()[0]?.points).toHaveLength(0);
    expect(figures.getSnapshot().current).toBeNull();

    expect(figures.setReference()).toBe(true);
    expect(figures.getSnapshot().hasReference).toBe(true);
    ctx.source.emit(2, { x: 0.05 });
    const [distance, angle] = figures.getSeries();
    expect(distance?.points.at(-1)).toEqual({ time: 2, value: expect.closeTo(50, 6) });
    expect(angle?.points.at(-1)?.value).toBeCloseTo(0, 3);
    expect(figures.getSnapshot().current?.distanceMm).toBeCloseTo(50, 6);
  });

  it('leaves a gap while a device is tracking-lost', () => {
    const ctx = setup();
    figures = ctx.figures;
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0);
    figures.setReference();
    ctx.source.emit(1, { state: 'tracking-lost', x: 0.2 });
    ctx.source.emit(2, {}, 'disconnected');
    ctx.source.emit(3);
    const values = figures.getSeries().map((s) => s.points.map((p) => p.value));
    expect(values[0]?.slice(1, 3)).toEqual([null, null]);
    expect(values[1]?.slice(1, 3)).toEqual([null, null]);
    expect(values[0]?.[3]).toBeCloseTo(0, 6);
    expect(figures.getSnapshot().current).not.toBeNull();
  });

  it('refuses a reference while a device is not tracking', () => {
    const ctx = setup();
    figures = ctx.figures;
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0, { state: 'tracking-lost' });
    expect(figures.getSnapshot().canSetReference).toBe(false);
    expect(figures.setReference()).toBe(false);
    expect(figures.getSnapshot().hasReference).toBe(false);
  });

  it('drops later points when time goes backwards', () => {
    const ctx = setup();
    figures = ctx.figures;
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0);
    figures.setReference();
    for (const t of [1, 2, 3, 4]) ctx.source.emit(t);
    ctx.source.emit(2.5);
    expect(figures.getSeries()[0]?.points.map((p) => p.time)).toEqual([0, 1, 2, 2.5]);
  });

  it('clears the history when the pair changes', () => {
    const ctx = setup();
    figures = ctx.figures;
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0);
    figures.setReference();
    ctx.source.emit(1);
    figures.setPair('ctrl', 'trk');
    expect(figures.getSeries()[0]?.points).toHaveLength(0);
    expect(figures.getSnapshot().hasReference).toBe(false);
  });

  it('notifies subscribers and keeps the snapshot between changes', () => {
    const ctx = setup();
    figures = ctx.figures;
    let calls = 0;
    figures.subscribe(() => calls++);
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0);
    const before = figures.getSnapshot();
    figures.setReference();
    expect(figures.getSnapshot()).not.toBe(before);
    expect(calls).toBeGreaterThan(0);
    const after = figures.getSnapshot();
    ctx.source.emit(0.01); // within the publish interval and unchanged
    expect(figures.getSnapshot()).toBe(after);
  });

  it('keeps memory bounded and the whole time span', () => {
    const ctx = setup();
    figures = ctx.figures;
    figures.setPair('ctrl', 'trk');
    ctx.source.emit(0);
    figures.setReference();
    const total = MAX_POINTS_PER_SERIES * 2;
    for (let i = 1; i <= total; i++) ctx.source.emit(i * 0.01, i === 100 ? { state: 'tracking-lost' } : {});
    const points = figures.getSeries()[0]?.points ?? [];
    expect(points.length).toBeLessThanOrEqual(MAX_POINTS_PER_SERIES);
    expect(points[0]?.time).toBe(0);
    expect(points.at(-1)?.time).toBeCloseTo(total * 0.01, 6);
    expect(points.some((p) => p.value === null)).toBe(true);
    for (let i = 1; i < points.length; i++) expect(points[i]?.time).toBeGreaterThan(points[i - 1]?.time ?? Infinity);
  });
});
