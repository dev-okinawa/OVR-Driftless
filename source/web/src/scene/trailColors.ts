/**
 * Writes the vertex colors (r, g, b, a for both ends of every segment) of a trail of `segments` segments.
 * The trail is cut into as many equal parts as `partOpacity` has entries, oldest first; each part has its entry's
 * opacity, so the trail fades toward its tail. `out` must hold `8 * segments` numbers.
 */
export function writeTrailColors(
  out: Float32Array,
  segments: number,
  red: number,
  green: number,
  blue: number,
  partOpacity: readonly number[],
): void {
  const parts = partOpacity.length;
  for (let segment = 0; segment < segments; segment++) {
    const part = Math.min(parts - 1, Math.floor((segment * parts) / segments));
    const alpha = partOpacity[part] ?? 1;
    const at = segment * 8;
    out[at] = red;
    out[at + 1] = green;
    out[at + 2] = blue;
    out[at + 3] = alpha;
    out[at + 4] = red;
    out[at + 5] = green;
    out[at + 6] = blue;
    out[at + 7] = alpha;
  }
}
