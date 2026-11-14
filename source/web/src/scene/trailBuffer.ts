/**
 * History of one device's positions as a fixed-size ring buffer.
 * Pure data: no three.js, so it runs in tests. Positions are world-space meters, times are seconds.
 */
export class TrailBuffer {
  private readonly positions: Float32Array;
  private readonly times: Float64Array;
  /** 1 when the point continues the line from the previous point, 0 after a gap. */
  private readonly linked: Uint8Array;
  private start = 0;
  private count = 0;
  private gap = true;

  constructor(readonly capacity: number) {
    this.positions = new Float32Array(capacity * 3);
    this.times = new Float64Array(capacity);
    this.linked = new Uint8Array(capacity);
  }

  /** Number of points kept. */
  get length(): number {
    return this.count;
  }

  /** Adds a point. When the buffer is full the oldest point is overwritten. */
  push(time: number, x: number, y: number, z: number): void {
    let index: number;
    if (this.count === this.capacity) {
      index = this.start;
      this.start = (this.start + 1) % this.capacity;
    } else {
      index = (this.start + this.count) % this.capacity;
      this.count++;
    }
    this.positions[index * 3] = x;
    this.positions[index * 3 + 1] = y;
    this.positions[index * 3 + 2] = z;
    this.times[index] = time;
    this.linked[index] = this.gap ? 0 : 1;
    this.gap = false;
  }

  /** The next point starts a new line: the device was not tracked in between. */
  breakLine(): void {
    this.gap = true;
  }

  /** Drops points older than `oldestTime`. */
  trim(oldestTime: number): void {
    while (this.count > 0 && (this.times[this.start] ?? 0) < oldestTime) {
      this.start = (this.start + 1) % this.capacity;
      this.count--;
    }
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
    this.gap = true;
  }

  /**
   * Writes the line segments, oldest first, as pairs of points [x, y, z, x, y, z] into `out`,
   * skipping gaps. `out` must hold `6 * (capacity - 1)` numbers. Returns the number of segments.
   */
  writeSegments(out: Float32Array): number {
    let segments = 0;
    for (let i = 1; i < this.count; i++) {
      const current = (this.start + i) % this.capacity;
      if (this.linked[current] === 0) continue;
      const previous = (current + this.capacity - 1) % this.capacity;
      const at = segments * 6;
      for (let axis = 0; axis < 3; axis++) {
        out[at + axis] = this.positions[previous * 3 + axis] ?? 0;
        out[at + 3 + axis] = this.positions[current * 3 + axis] ?? 0;
      }
      segments++;
    }
    return segments;
  }
}
