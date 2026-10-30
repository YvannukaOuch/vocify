const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts a bare video ID or any common YouTube URL shape (watch, youtu.be, shorts, embed, live). */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;
  const url = toUrl(value);
  if (!url) return null;

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

/** Reads YouTube's `t=` parameter: "90", "90s", "1m30s". */
export function linkStartTime(input: string): number {
  const raw = toUrl(input.trim())?.searchParams.get('t');
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function toUrl(value: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

/** The parts of the IFrame Player API we use: https://developers.google.com/youtube/iframe_api_reference */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
  getVideoData?(): { title?: string };
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PlayerState = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the YouTube player.'));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Human explanation for the player's onError codes. In the trimmer the fix is
 * to type the times; for a saved clip the voice message itself is unaffected.
 */
export function playerErrorMessage(code: number, context: 'trim' | 'clip'): string {
  const fallback = context === 'trim' ? 'type the start and end times instead.' : 'the clip itself still works.';
  if (code === 101 || code === 150 || code === 153) return `This video can't be played outside YouTube, so there's no preview — ${fallback}`;
  if (code === 100) return 'This video was removed or is private.';
  if (code === -1) return `Couldn't load the YouTube player — ${fallback}`;
  return `This video can't be previewed here — ${fallback}`;
}
