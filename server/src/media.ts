import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from './config.ts';
import { UserError } from './errors.ts';
import { oggOpusDuration } from './ogg.ts';
import { CommandError, run } from './run.ts';
import { VIDEO_ID } from './youtube.ts';

export interface CutClip {
  /** Path to the finished Ogg Opus file, ready for Telegram's sendVoice. */
  file: string;
  durationSec: number;
  videoTitle: string | null;
  dispose(): Promise<void>;
}

/**
 * Downloads only [startSec, endSec] of the video's audio and encodes it the way
 * Telegram voice messages are encoded: mono Opus in an Ogg container.
 */
export async function cutClip(videoId: string, startSec: number, endSec: number): Promise<CutClip> {
  const dir = await mkdtemp(join(tmpdir(), 'voicify-'));
  const dispose = () => rm(dir, { recursive: true, force: true });

  try {
    const stdout = await run(
      config.ytdlpPath,
      [
        ...ytdlpArgs(),
        '--no-playlist',
        '-f', 'bestaudio/best',
        '--download-sections', `*${startSec.toFixed(3)}-${endSec.toFixed(3)}`,
        // Re-encode at the cut points instead of snapping to the nearest keyframe/cluster.
        '--force-keyframes-at-cuts',
        '--print', 'title',
        '--no-simulate',
        '-o', join(dir, 'source.%(ext)s'),
        '--', `https://www.youtube.com/watch?v=${videoId}`,
      ],
      180_000,
    ).catch((error: unknown) => {
      throw explainYtdlpError(error);
    });

    const source = (await readdir(dir)).find((name) => name.startsWith('source.') && !name.endsWith('.part'));
    if (!source) throw new Error('yt-dlp finished without producing a file');

    const length = endSec - startSec;
    const fade = Math.min(0.03, length / 4);
    const output = join(dir, 'clip.ogg');
    await run(
      config.ffmpegPath,
      [
        '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
        '-i', join(dir, source),
        '-map', '0:a:0', '-map_metadata', '-1',
        '-t', length.toFixed(3),
        // Tiny fades so the cut points don't click.
        '-af', `afade=t=in:d=${fade.toFixed(3)},afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
        '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '64k', '-application', 'audio',
        '-f', 'ogg', output,
      ],
      60_000,
    ).catch((error: unknown) => {
      if (error instanceof CommandError && /matches no streams|does not contain any stream/i.test(error.stderr)) {
        throw new UserError('That video has no audio track.');
      }
      throw error;
    });

    const durationSec = await oggOpusDuration(output);
    if (durationSec < 0.2) throw new UserError('That part of the video is empty — is the start time past the end of the video?');

    const videoTitle = stdout.trim().split(/\r?\n/)[0]?.trim() || null;
    return { file: output, durationSec, videoTitle, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export interface SearchResult {
  id: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnail: string;
}

const searchCache = new Map<string, { at: number; results: SearchResult[] }>();
const SEARCH_CACHE_MS = 10 * 60_000;

/** YouTube search via yt-dlp's flat extraction (one light request, no downloads). */
export async function searchYouTube(query: string): Promise<SearchResult[]> {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.results;

  const stdout = await run(
    config.ytdlpPath,
    [...ytdlpArgs(), '--flat-playlist', '--dump-single-json', '--no-warnings', `ytsearch15:${query}`],
    45_000,
  ).catch((error: unknown) => {
    throw explainYtdlpError(error);
  });

  const data = JSON.parse(stdout) as { entries?: Array<Record<string, unknown> | null> };
  const results = (data.entries ?? []).flatMap((entry): SearchResult[] => {
    if (!entry || typeof entry.id !== 'string' || !VIDEO_ID.test(entry.id)) return [];
    if (entry.live_status === 'is_live' || entry.live_status === 'is_upcoming') return [];
    return [{
      id: entry.id,
      title: typeof entry.title === 'string' ? entry.title : 'Untitled video',
      channel: typeof entry.channel === 'string' ? entry.channel : typeof entry.uploader === 'string' ? entry.uploader : null,
      durationSec: typeof entry.duration === 'number' ? entry.duration : null,
      thumbnail: `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`,
    }];
  });

  searchCache.set(key, { at: Date.now(), results });
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value!);
  return results;
}

function ytdlpArgs(): string[] {
  const args = ['--ignore-config', '--no-progress'];
  if (config.ytdlpJsRuntime) args.push('--js-runtimes', config.ytdlpJsRuntime);
  if (config.ffmpegPath !== 'ffmpeg') args.push('--ffmpeg-location', config.ffmpegPath);
  return [...args, ...config.ytdlpExtraArgs];
}

function explainYtdlpError(error: unknown): unknown {
  if (!(error instanceof CommandError)) return error;
  const log = error.stderr;
  if (error.timedOut) return new UserError('YouTube took too long to respond — try again.', 504, 'timeout');
  if (/not a bot|Sign in to confirm/i.test(log)) {
    return new UserError('YouTube is blocking the server with a bot check. Add YouTube cookies (see the README).', 502, 'youtube_blocked');
  }
  if (/Private video/i.test(log)) return new UserError('That video is private.');
  if (/age.restricted|confirm your age/i.test(log)) return new UserError('That video is age-restricted. Add YouTube cookies to clip it (see the README).');
  if (/live event|is live|Premieres in/i.test(log)) return new UserError("Live streams and premieres can't be clipped.");
  if (/Video unavailable|not available|removed/i.test(log)) return new UserError('That video is unavailable.');
  console.error(`[yt-dlp] ${error.message}\n${log}`);
  return new UserError("Couldn't get that video from YouTube. Try again — if it keeps failing, update yt-dlp (yt-dlp -U).", 502, 'download_failed');
}
