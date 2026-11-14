import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../domain/types';
import { areaBrackets } from './areaBrackets';

const square = (side: number): Vec3[] => [
  [0, 0, 0],
  [side, 0, 0],
  [side, 0, side],
  [0, 0, side],
];

describe('areaBrackets', () => {
  it('gives every corner two arms of the given length along its edges', () => {
    const points = areaBrackets(square(4), 0.5, 0.25, 0.2);
    expect(points.length).toBe(4 * 2 * 6);
    // the first corner's arms run to (0.25, 0, 0) and (0, 0, 0.25), lifted to y = 0.5
    expect(points.slice(0, 12)).toEqual([0, 0.5, 0, 0, 0.5, 0.25, 0, 0.5, 0, 0.25, 0.5, 0]);
  });

  it('shortens the arms on a short edge so they cover at most the given fraction of it', () => {
    const points = areaBrackets(square(1), 0, 0.25, 0.2);
    // 1 m edge, fraction 0.2: arms of 0.2 m, not 0.25 m
    expect(points[5]).toBeCloseTo(0.2);
  });

  it('skips an arm on a zero-length edge', () => {
    const corners: Vec3[] = [
      [0, 0, 0],
      [0, 0, 0],
      [2, 0, 2],
    ];
    expect(areaBrackets(corners, 0, 0.25, 0.2).every(Number.isFinite)).toBe(true);
  });
});
