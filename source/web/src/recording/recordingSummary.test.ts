import { describe, expect, it } from 'vitest';
import type { Recording } from './format';
import { formatRecordedAt, recordingDuration } from './recordingSummary';

const recording = (times: readonly number[]): Recording => ({
  createdAt: '2026-11-14T21:42:00.000Z',
  sessions: [],
  frames: times.map((time) => ({ time, devices: [] })),
  annotations: [],
  truncated: false,
});

describe('recordingDuration', () => {
  it('is the time of the last frame', () => {
    expect(recordingDuration(recording([0, 1.5, 42]))).toBe(42);
  });

  it('is zero for a recording without frames', () => {
    expect(recordingDuration(recording([]))).toBe(0);
  });
});

describe('formatRecordedAt', () => {
  it('names the day and the time', () => {
    expect(formatRecordedAt('2026-11-14T21:42:00.000Z')).toMatch(/^1[45] Nov 2026, \d{2}:\d{2}$/);
  });

  it('does not fail on a date it cannot read', () => {
    expect(formatRecordedAt('not a date')).toBe('at an unknown time');
  });
});
