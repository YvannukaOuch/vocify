/** 83.46 → "1:23.5" (or "1:02:03.0" past an hour). */
export function formatTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const hours = Math.floor(tenths / 36_000);
  const minutes = Math.floor((tenths % 36_000) / 600);
  const secs = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** Clip lengths: "4.2s", or "1:05" from a minute up. */
export function formatLength(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

/** Video durations from search results: 245 → "4:05". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "83.5", "1:23.5", "1:02:03" → seconds. */
export function parseTime(value: string): number | null {
  const parts = value.trim().replace(',', '.').split(':');
  if (parts.length > 3) return null;
  if (parts.some((part, i) => !(i === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
