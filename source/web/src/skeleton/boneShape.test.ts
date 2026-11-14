import { describe, expect, it } from 'vitest';
import { boneEdges, boneWidth, jointRadius } from './boneShape';

describe('boneWidth', () => {
  it('is 20% of the length, at most 10 cm, unless given', () => {
    expect(boneWidth(0.3)).toBeCloseTo(0.06, 9);
    expect(boneWidth(1)).toBeCloseTo(0.1, 9);
    expect(boneWidth(1, { width: 0.15 })).toBe(0.15);
  });
});

describe('jointRadius', () => {
  it('follows the length between 1.5 mm and 2.4 cm', () => {
    expect(jointRadius(0.1)).toBeCloseTo(0.011, 9);
    expect(jointRadius(1)).toBe(0.024);
    expect(jointRadius(0.001)).toBe(0.0015);
  });
});

describe('boneEdges', () => {
  // A vertical bone 1 m long seen from the front (+Z): the diamond's corners point to ±X and ±Z.
  const edges = boneEdges([0, 0, 0], [0, 1, 0], [0, 0.5, 5]);

  it('draws the edges of the four facets facing the eye', () => {
    expect(edges?.facets).toHaveLength(8);
  });

  it('outlines the silhouette through the side corners of the ring, 12% up the bone', () => {
    expect(edges?.outline).toHaveLength(4);
    for (const [a, b] of edges?.outline ?? []) {
      const corner = a[1] === 0.12 ? a : b;
      expect(corner[1]).toBeCloseTo(0.12, 9);
      expect(Math.abs(corner[0])).toBeCloseTo(0.05, 9);
    }
  });

  it('moves the widest ring when asked', () => {
    const head = boneEdges([0, 0, 0], [0, 1, 0], [0, 0.5, 5], { widest: 0.4 });
    const ys = new Set((head?.outline ?? []).flatMap(([a, b]) => [a[1], b[1]]).map((y) => y.toFixed(6)));
    expect(ys).toEqual(new Set(['0.000000', '0.400000', '1.000000']));
  });

  it('has no edges for a bone of no length', () => {
    expect(boneEdges([1, 1, 1], [1, 1, 1], [0, 0, 5])).toBeNull();
  });
});
