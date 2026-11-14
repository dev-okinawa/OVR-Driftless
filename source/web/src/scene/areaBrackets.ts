import type { Vec3 } from '../domain/types';

/**
 * Corner brackets of a closed floor polygon as segment end points (x, y, z per point, two points per segment).
 * Every corner gets two arms along its two edges, `length` meters long but at most `maxFraction` of the edge, so
 * the arms of neighbouring corners never meet. A corner with a zero-length edge gets no arm on that edge.
 */
export function areaBrackets(corners: readonly Vec3[], y: number, length: number, maxFraction: number): number[] {
  const out: number[] = [];
  const count = corners.length;
  for (let i = 0; i < count; i++) {
    const corner = corners[i];
    if (!corner) continue;
    for (const neighbour of [corners[(i + count - 1) % count], corners[(i + 1) % count]]) {
      if (!neighbour) continue;
      const edge = Math.hypot(neighbour[0] - corner[0], neighbour[2] - corner[2]);
      if (edge === 0) continue;
      const t = Math.min(length, edge * maxFraction) / edge;
      out.push(
        corner[0],
        y,
        corner[2],
        corner[0] + (neighbour[0] - corner[0]) * t,
        y,
        corner[2] + (neighbour[2] - corner[2]) * t,
      );
    }
  }
  return out;
}
