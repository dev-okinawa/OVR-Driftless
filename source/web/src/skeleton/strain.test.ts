import { describe, expect, it } from 'vitest';
import { makeBody, shiftTrackers, type BodyVariant } from './bodyFixtures';
import { calibrateSkeleton, type BodyDevices } from './calibration';
import { solveSkeleton } from './solve';
import { computeStrain, createStrainState, type StrainResult } from './strain';

const RATE = 30;

function setup() {
  const calibration = calibrateSkeleton(makeBody().devices, 0);
  if (!calibration) throw new Error('no calibration');
  return { calibration, state: createStrainState(), clock: { time: 0 } };
}

/** Feeds the same devices for `seconds` at 30 Hz and returns the last result and the largest total seen. */
function hold(
  context: ReturnType<typeof setup>,
  devices: BodyDevices,
  seconds: number,
): { last: StrainResult | null; peak: number } {
  let last: StrainResult | null = null;
  let peak = 0;
  for (let i = 0; i < Math.max(1, Math.round(seconds * RATE)); i += 1) {
    context.clock.time += 1 / RATE;
    const pose = solveSkeleton(devices, context.calibration, 0);
    if (!pose) throw new Error('no pose');
    last = computeStrain(devices, context.calibration, pose, 0, context.state, context.clock.time);
    peak = Math.max(peak, last?.totalMm ?? 0);
  }
  return { last, peak };
}

const part = (result: StrainResult | null, name: string): number | undefined => result?.parts.find((p) => p.name === name)?.mm;

describe('computeStrain', () => {
  it('is zero for the calibrated pose', () => {
    const context = setup();
    const { last, peak } = hold(context, makeBody().devices, 10);
    expect(peak).toBe(0);
    expect(last?.parts.map((p) => p.name).sort()).toEqual(['hipsOffset', 'leftFootFloor', 'leftLeg', 'rightFootFloor', 'rightLeg', 'spine']);
  });

  it.each<BodyVariant>(['squat', 'lean', 'step'])('stays near zero in a %s pose held for a moment', (variant) => {
    const context = setup();
    hold(context, makeBody().devices, 10);
    const { peak } = hold(context, makeBody({ variant }).devices, 1.5);
    expect(peak).toBeLessThan(20);
  });

  it('shows a permanent horizontal offset of the trackers once the filter settles', () => {
    const context = setup();
    hold(context, makeBody().devices, 10);
    const shifted = shiftTrackers(makeBody().devices, [0.3, 0, 0]);
    const early = hold(context, shifted, 0.5).last;
    const settled = hold(context, shifted, 30).last;
    expect(part(settled, 'hipsOffset')).toBeGreaterThan(150);
    expect(part(early, 'hipsOffset')).toBeLessThan(part(settled, 'hipsOffset') ?? 0);
  });

  it('shows trackers 300 mm too low at once, as feet below the floor', () => {
    const context = setup();
    const { last } = hold(context, shiftTrackers(makeBody().devices, [0, -0.3, 0]), 0.1);
    expect(part(last, 'leftFootFloor')).toBeGreaterThan(250);
    expect(part(last, 'rightFootFloor')).toBeGreaterThan(250);
    expect(last?.totalMm).toBeGreaterThan(250);
    const leftFootFloor = last?.parts.find((p) => p.name === 'leftFootFloor');
    expect(leftFootFloor?.bones).toContain('leftKnee-leftFoot');
  });

  it('shows feet that lag behind the hips by more than the legs allow as leg strain', () => {
    // Only the foot trackers drift: the hip joint stays under the head and the foot goes 1 m away.
    const context = setup();
    const devices = makeBody().devices;
    const left = devices['left-foot'];
    if (!left) throw new Error('no foot');
    const drifted: BodyDevices = {
      ...devices,
      'left-foot': { rotation: left.rotation, position: [left.position[0], left.position[1], left.position[2] - 1.0] },
    };
    const { last } = hold(context, drifted, 0.1);
    expect(part(last, 'leftLeg')).toBeGreaterThan(300);
    expect(part(last, 'rightLeg')).toBe(0);
  });

  it('does not count trackers that moved closer to the head as strain: a raised foot is a pose', () => {
    const context = setup();
    const { last } = hold(context, shiftTrackers(makeBody().devices, [0, 0.4, 0]), 0.1);
    expect(part(last, 'leftLeg')).toBe(0);
    expect(part(last, 'spine')).toBe(0);
  });

  it('is null while no Lighthouse-tracked body part is tracking', () => {
    const context = setup();
    const { head, 'left-hand': leftHand, 'right-hand': rightHand } = makeBody().devices;
    const { last } = hold(context, { head, 'left-hand': leftHand, 'right-hand': rightHand }, 0.1);
    expect(last).toBeNull();
  });

  it('drops the parts of a foot tracker that is not tracking', () => {
    const context = setup();
    const { last } = hold(context, { ...makeBody().devices, 'left-foot': undefined }, 0.1);
    const names = last?.parts.map((p) => p.name) ?? [];
    expect(names).not.toContain('leftLeg');
    expect(names).not.toContain('leftFootFloor');
    expect(names).toContain('rightLeg');
  });

  it('forgets the filtered offset when time goes backwards', () => {
    const context = setup();
    hold(context, makeBody().devices, 10);
    const shifted = shiftTrackers(makeBody().devices, [0.3, 0, 0]);
    expect(part(hold(context, shifted, 30).last, 'hipsOffset')).toBeGreaterThan(150);
    context.clock.time = 5;
    expect(part(hold(context, makeBody().devices, 0.1).last, 'hipsOffset')).toBe(0);
  });
});

