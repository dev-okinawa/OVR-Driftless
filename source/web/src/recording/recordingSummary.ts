import type { Recording } from './format';

/** Length of a recording in seconds: the time of its last frame. */
export function recordingDuration(recording: Recording): number {
  return recording.frames[recording.frames.length - 1]?.time ?? 0;
}

/** "14 Nov 2026, 21:42": when the recording was made, in the user's time zone. */
export function formatRecordedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'at an unknown time';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
