import { describe, expect, it } from 'vitest';
import { writeTrailColors } from './trailColors';

describe('writeTrailColors', () => {
  it('fades the trail in parts from the oldest segment to the newest', () => {
    const out = new Float32Array(8 * 8);
    writeTrailColors(out, 8, 1, 0.5, 0.25, [0.1, 0.2, 0.3, 0.4]);
    const alphaOf = (segment: number): number => out[segment * 8 + 3]!;
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(alphaOf)).toEqual([0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4].map(Math.fround));
  });

  it('colors both ends of a segment alike', () => {
    const out = new Float32Array(8);
    writeTrailColors(out, 1, 1, 0.5, 0.25, [0.9]);
    expect(Array.from(out)).toEqual([1, 0.5, 0.25, Math.fround(0.9), 1, 0.5, 0.25, Math.fround(0.9)]);
  });

  it('spreads a trail shorter than the number of parts over the parts evenly', () => {
    const out = new Float32Array(16);
    writeTrailColors(out, 2, 0, 0, 0, [0.1, 0.2, 0.3, 0.4]);
    expect([out[3], out[11]]).toEqual([Math.fround(0.1), Math.fround(0.3)]);
  });
});
