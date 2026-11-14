import { describe, expect, it } from 'vitest';
import { TrailBuffer } from './trailBuffer';

function segmentsOf(buffer: TrailBuffer): number[][] {
  const out = new Float32Array(6 * (buffer.capacity - 1));
  const count = buffer.writeSegments(out);
  return Array.from({ length: count }, (_, i) => Array.from(out.slice(i * 6, i * 6 + 6)));
}

describe('TrailBuffer', () => {
  it('joins consecutive points into segments', () => {
    const buffer = new TrailBuffer(8);
    buffer.push(0, 0, 0, 0);
    buffer.push(1, 1, 0, 0);
    buffer.push(2, 2, 0, 0);
    expect(segmentsOf(buffer)).toEqual([
      [0, 0, 0, 1, 0, 0],
      [1, 0, 0, 2, 0, 0],
    ]);
  });

  it('keeps only the last seconds after trim', () => {
    const buffer = new TrailBuffer(16);
    for (let t = 0; t <= 10; t++) buffer.push(t, t, 0, 0);
    buffer.trim(10 - 3);
    expect(buffer.length).toBe(4);
    expect(segmentsOf(buffer)[0]).toEqual([7, 0, 0, 8, 0, 0]);
  });

  it('overwrites the oldest points when full and keeps order across the wrap', () => {
    const buffer = new TrailBuffer(4);
    for (let t = 0; t < 7; t++) buffer.push(t, t, 0, 0);
    expect(buffer.length).toBe(4);
    expect(segmentsOf(buffer)).toEqual([
      [3, 0, 0, 4, 0, 0],
      [4, 0, 0, 5, 0, 0],
      [5, 0, 0, 6, 0, 0],
    ]);
  });

  it('trims correctly after wrapping', () => {
    const buffer = new TrailBuffer(4);
    for (let t = 0; t < 7; t++) buffer.push(t, t, 0, 0);
    buffer.trim(5);
    expect(buffer.length).toBe(2);
    expect(segmentsOf(buffer)).toEqual([[5, 0, 0, 6, 0, 0]]);
  });

  it('clear empties the buffer and starts a new line', () => {
    const buffer = new TrailBuffer(4);
    buffer.push(0, 0, 0, 0);
    buffer.push(1, 1, 0, 0);
    buffer.clear();
    expect(buffer.length).toBe(0);
    buffer.push(2, 5, 0, 0);
    buffer.push(3, 6, 0, 0);
    expect(segmentsOf(buffer)).toEqual([[5, 0, 0, 6, 0, 0]]);
  });

  it('leaves a gap where the device was not tracked', () => {
    const buffer = new TrailBuffer(8);
    buffer.push(0, 0, 0, 0);
    buffer.push(1, 1, 0, 0);
    buffer.breakLine();
    buffer.push(5, 9, 0, 0);
    buffer.push(6, 10, 0, 0);
    expect(segmentsOf(buffer)).toEqual([
      [0, 0, 0, 1, 0, 0],
      [9, 0, 0, 10, 0, 0],
    ]);
  });

  it('does not join the first point to anything', () => {
    const buffer = new TrailBuffer(4);
    buffer.push(0, 0, 0, 0);
    expect(segmentsOf(buffer)).toEqual([]);
  });
});
