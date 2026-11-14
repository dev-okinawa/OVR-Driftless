/**
 * Solves `matrix · x = rhs` by Gaussian elimination with partial pivoting. Neither argument is changed.
 * Returns null when the matrix is singular: a pivot is below `1e-12` times the largest entry.
 */
export function linearSolve(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] | null {
  const size = rhs.length;
  const rows = matrix.map((row, index) => [...row, rhs[index] ?? 0]);
  const largest = Math.max(0, ...matrix.map((row) => Math.max(0, ...row.map(Math.abs))));
  const tolerance = 1e-12 * largest;

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivotRow]?.[column] ?? 0)) pivotRow = row;
    }
    const pivot = rows[pivotRow];
    const top = rows[column];
    if (!pivot || !top || Math.abs(pivot[column] ?? 0) <= tolerance) return null;
    rows[pivotRow] = top;
    rows[column] = pivot;

    for (let row = column + 1; row < size; row++) {
      const current = rows[row];
      if (!current) return null;
      const factor = (current[column] ?? 0) / (pivot[column] ?? 1);
      for (let k = column; k <= size; k++) current[k] = (current[k] ?? 0) - factor * (pivot[k] ?? 0);
    }
  }

  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row--) {
    const current = rows[row];
    if (!current) return null;
    let value = current[size] ?? 0;
    for (let k = row + 1; k < size; k++) value -= (current[k] ?? 0) * (solution[k] ?? 0);
    solution[row] = value / (current[row] ?? 1);
  }
  return solution;
}
