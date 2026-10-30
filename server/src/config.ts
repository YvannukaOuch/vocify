import { resolve } from 'node:path';

const serverRoot = resolve(import.meta.dirname, '..');
const production = process.env.NODE_ENV === 'production';

function number(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

function userIds(raw: string | undefined): Set<number> {
  const ids = (raw ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  return new Set(ids.filter(Number.isSafeInteger));
}

export const config = {
  production,
  botToken: process.env.BOT_TOKEN?.trim() ?? '',
  /** Public HTTPS address of this server — Telegram opens the Mini App from here. */
  webappUrl: (process.env.WEBAPP_URL ?? '').trim().replace(/\/+$/, ''),
  host: process.env.HOST || '127.0.0.1',
  port: number('PORT', 3000),
  dbPath: resolve(serverRoot, process.env.DB_PATH || 'data/voicify.db'),
  webappDist: resolve(serverRoot, process.env.WEBAPP_DIST || '../webapp/dist'),
  /** Empty = anyone who finds the bot can use it. */
  allowedUserIds: userIds(process.env.ALLOWED_USER_IDS),
  maxClipSeconds: number('MAX_CLIP_SECONDS', 60),
  maxConcurrentJobs: Math.max(1, number('MAX_CONCURRENT_JOBS', 1)),
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  /**
   * yt-dlp needs a JavaScript runtime to solve YouTube's challenges. We already
   * run on Node, so point it at this exact binary. Set to an empty value to
   * leave yt-dlp on its default (Deno).
   */
  ytdlpJsRuntime: process.env.YTDLP_JS_RUNTIME ?? `node:${process.execPath}`,
  /** Extra yt-dlp flags, e.g. "--cookies /opt/voicify/cookies.txt". */
  ytdlpExtraArgs: (process.env.YTDLP_EXTRA_ARGS ?? '').split(/\s+/).filter(Boolean),
  /** Dev only: treat API requests without Telegram auth as this user. */
  devUserId: production ? null : number('DEV_USER_ID', 0) || null,
};

export function isAllowed(userId: number): boolean {
  return config.allowedUserIds.size === 0 || config.allowedUserIds.has(userId);
}
