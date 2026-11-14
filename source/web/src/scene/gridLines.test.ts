import { describe, expect, it } from 'vitest';
import { buildGridLines, gridFade } from './gridLines';

describe('gridFade', () => {
  it('is 1 up to the start and 0 from the end', () => {
    expect(gridFade(0, 2, 8)).toBe(1);
    expect(gridFade(2, 2, 8)).toBe(1);
    expect(gridFade(8, 2, 8)).toBe(0);
    expect(gridFade(20, 2, 8)).toBe(0);
  });

  it('falls smoothly and symmetrically in between', () => {
    expect(gridFade(5, 2, 8)).toBeCloseTo(0.5);
    let previous = 1;
    for (let d = 2; d <= 8; d += 0.25) {
      const value = gridFade(d, 2, 8);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('buildGridLines', () => {
  it('makes a line every step in both directions, through the whole grid', () => {
    const { positions, kinds } = buildGridLines(2, 0.5);
    // 9 lines per direction
    expect(positions.length / 6).toBe(18);
    expect(kinds.length).toBe(36);
    for (let i = 0; i < positions.length; i += 6) {
      const alongX = positions[i + 2] === positions[i + 5];
      const alongZ = positions[i] === positions[i + 3];
      expect(alongX || alongZ).toBe(true);
      expect(Math.abs(positions[i]! - positions[i + 3]!) + Math.abs(positions[i + 2]! - positions[i + 5]!)).toBe(4);
    }
  });

  it('marks whole-meter lines as major and half-meter lines as minor', () => {
    const { positions, kinds } = buildGridLines(2, 0.5);
    for (let line = 0; line < positions.length / 6; line++) {
      const offset = positions[line * 6] === positions[line * 6 + 3] ? positions[line * 6]! : positions[line * 6 + 2]!;
      expect(kinds[line * 2]).toBe(Number.isInteger(offset) ? 1 : 0);
      expect(kinds[line * 2 + 1]).toBe(kinds[line * 2]);
    }
  });
});
