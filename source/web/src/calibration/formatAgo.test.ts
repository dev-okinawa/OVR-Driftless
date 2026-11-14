import { describe, expect, it } from 'vitest';
import { formatAgo } from './formatAgo';

const at = (seconds: number): Date => new Date(Date.UTC(2026, 10, 14, 12, 0, 0) + seconds * 1000);

describe('formatAgo', () => {
  it('says just now within the first minute', () => {
    expect(formatAgo(at(0), at(59))).toBe('just now');
  });

  it('counts whole minutes, then hours', () => {
    expect(formatAgo(at(0), at(3 * 60 + 20))).toBe('3 min ago');
    expect(formatAgo(at(0), at(2 * 3600 + 60))).toBe('2 h ago');
  });

  it('does not go negative when the clock steps back', () => {
    expect(formatAgo(at(10), at(0))).toBe('just now');
  });
});
