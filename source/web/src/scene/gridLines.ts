/** Opacity factor of a grid line at `distance` from the camera target: 1 up to `start`, 0 from `end`, smooth between. */
export function gridFade(distance: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (distance - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}

export interface GridLines {
  /** Segment end points as x, y, z in the grid's own space, y = 0. */
  readonly positions: Float32Array;
  /** One value per vertex: 1 on a whole-meter line, 0 on a half-meter line. */
  readonly kinds: Float32Array;
}

/**
 * Lines at every `step` from `-halfSize` to `halfSize` in both directions, each as one segment through the whole
 * grid. `halfSize` is rounded down to a multiple of `step`.
 */
export function buildGridLines(halfSize: number, step: number): GridLines {
  const count = Math.floor(halfSize / step + 1e-6);
  const extent = count * step;
  const lines = 2 * (2 * count + 1);
  const positions = new Float32Array(lines * 6);
  const kinds = new Float32Array(lines * 2);
  let line = 0;
  for (let i = -count; i <= count; i++) {
    const c = i * step;
    const kind = Math.abs(c - Math.round(c)) < 1e-6 ? 1 : 0;
    positions.set([-extent, 0, c, extent, 0, c], line * 6);
    kinds.fill(kind, line * 2, line * 2 + 2);
    line++;
    positions.set([c, 0, -extent, c, 0, extent], line * 6);
    kinds.fill(kind, line * 2, line * 2 + 2);
    line++;
  }
  return { positions, kinds };
}
