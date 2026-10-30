export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_URL = /(?:https?:\/\/)?(?:[\w-]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/\S+/i;
const TIME = String.raw`\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?`;
const TIME_RANGE = new RegExp(String.raw`(?:^|\s)(${TIME})\s*(?:-|–|—|\bto\b)\s*(${TIME})(?=\s|$)`, 'i');

/** Accepts a bare video ID or any common YouTube URL shape (watch, youtu.be, shorts, embed, live). */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? '';
    return VIDEO_ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return v;
    const match = url.pathname.match(/^\/(?:shorts|embed|live|v|e)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
    if (match) return match[1]!;
  }
  return null;
}

/** "83.5", "1:23.5", "1:02:03" → seconds. */
export function parseTime(value: string): number | null {
  const parts = value.trim().replace(',', '.').split(':');
  if (parts.length > 3) return null;
  if (parts.some((part, i) => !(i === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** Reads YouTube's `t=` / `start=` parameter: "90", "90s", "1m30s", "1h2m3s". */
export function urlStartTime(link: string): number | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return null;
  }
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export interface ClipRequest {
  videoId: string;
  startSec: number | null;
  endSec: number | null;
  title: string | null;
}

/**
 * Understands chat messages like "https://youtu.be/ID 0:12-0:19 bruh".
 * The time range and the name are optional.
 */
export function parseClipRequest(text: string): ClipRequest | null {
  const link = text.match(YOUTUBE_URL);
  if (!link) return null;
  const videoId = parseVideoId(link[0]);
  if (!videoId) return null;

  let rest = `${text.slice(0, link.index)} ${text.slice(link.index! + link[0].length)}`;
  let startSec = urlStartTime(link[0]);
  let endSec: number | null = null;

  const range = rest.match(TIME_RANGE);
  if (range) {
    const start = parseTime(range[1]!);
    const end = parseTime(range[2]!);
    if (start !== null && end !== null) {
      startSec = start;
      endSec = end;
      rest = `${rest.slice(0, range.index)} ${rest.slice(range.index! + range[0].length)}`;
    }
  }

  const title = rest.replace(/\s+/g, ' ').trim();
  return { videoId, startSec, endSec, title: title || null };
}
