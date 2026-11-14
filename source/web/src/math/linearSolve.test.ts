import { describe, expect, it } from 'vitest';
import { linearSolve } from './linearSolve';

describe('linearSolve', () => {
  it('solves a system that needs pivoting', () => {
    const solution = linearSolve(
      [
        [0, 2, 1],
        [1, 1, 1],
        [2, 0, 3],
      ],
      [7, 6, 11],
    );
    expect(solution).not.toBeNull();
    (solution ?? []).forEach((value, index) => expect(value).toBeCloseTo(index + 1, 12));
  });

  it('solves the identity', () => {
    expect(linearSolve([[1, 0], [0, 1]], [3, -2])).toEqual([3, -2]);
  });

  it('returns null for a singular matrix', () => {
    expect(
      linearSolve(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });

  it('does not change its arguments', () => {
    const matrix = [
      [2, 1],
      [1, 3],
    ];
    const rhs = [3, 5];
    linearSolve(matrix, rhs);
    expect(matrix).toEqual([[2, 1], [1, 3]]);
    expect(rhs).toEqual([3, 5]);
  });
});
