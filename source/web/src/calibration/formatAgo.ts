/** How long ago something happened, for a status line: "just now", "3 min ago", "2 h ago". */
export function formatAgo(then: Date, now: Date): string {
  const minutes = Math.floor(Math.max(0, now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/** "21:42": the wall-clock time of a moment, in the user's time zone. */
export function formatTimeOfDay(moment: Date): string {
  return moment.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
