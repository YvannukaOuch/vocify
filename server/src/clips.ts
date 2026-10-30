import { GrammyError, InputFile, type Bot } from 'grammy';
import { config } from './config.ts';
import { UserError } from './errors.ts';
import { createLimiter } from './limiter.ts';
import { cutClip } from './media.ts';
import type { Clip, Store } from './store.ts';
import { VIDEO_ID } from './youtube.ts';

export const MAX_TITLE_LENGTH = 64;
export const MAX_TAGS = 10;

export interface CreateClipInput {
  ownerId: number;
  videoId: string;
  startSec: number;
  endSec: number;
  title?: string | null;
  tags?: string[];
}

/** Trims and limits user-provided tags; drops empties and duplicates. */
export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.replace(/^#/, '').replace(/\s+/g, ' ').trim().slice(0, 32))
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, MAX_TAGS);
}

export function cleanTitle(title: unknown): string {
  return typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) : '';
}

export function createClipService(store: Store, bot: Bot | null) {
  const limit = createLimiter(config.maxConcurrentJobs, 10);
  const usersCutting = new Set<number>();

  function requireBot(): Bot {
    if (!bot) throw new UserError('The Telegram bot is not configured (BOT_TOKEN is missing).', 503, 'no_bot');
    return bot;
  }

  /**
   * Cuts the clip, sends it to the owner's chat with the bot (which is also how
   * we get a reusable Telegram file_id) and saves it.
   */
  async function create(input: CreateClipInput): Promise<Clip> {
    const { ownerId, videoId, startSec, endSec } = input;
    if (!VIDEO_ID.test(videoId)) throw new UserError("That isn't a valid YouTube video.");
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) {
      throw new UserError('The end time has to be after the start time.');
    }
    const length = endSec - startSec;
    if (length < 0.3) throw new UserError('Clips need to be at least 0.3 seconds long.');
    if (length > config.maxClipSeconds + 0.05) throw new UserError(`Clips can be at most ${config.maxClipSeconds} seconds long.`);

    const api = requireBot().api;
    if (usersCutting.has(ownerId)) throw new UserError('Already cutting a clip for you — give it a second.', 429, 'busy_user');
    usersCutting.add(ownerId);
    try {
      // Fails fast if the bot can't message this user, before we spend time downloading.
      await api.sendChatAction(ownerId, 'upload_voice').catch((error: unknown) => {
        throw explainTelegramError(error);
      });

      return await limit(async () => {
        const cut = await cutClip(videoId, startSec, endSec);
        try {
          const message = await api
            .sendVoice(ownerId, new InputFile(cut.file, 'clip.ogg'), { duration: Math.max(1, Math.round(cut.durationSec)) })
            .catch((error: unknown) => {
              throw explainTelegramError(error);
            });

          const title = cleanTitle(input.title) || cleanTitle(cut.videoTitle) || 'Untitled';
          const clip = store.insert({
            ownerId,
            title,
            tags: cleanTags(input.tags),
            videoId,
            videoTitle: cut.videoTitle,
            startMs: Math.round(startSec * 1000),
            endMs: Math.round(endSec * 1000),
            durationMs: Math.round(cut.durationSec * 1000),
            fileId: message.voice.file_id,
            fileUniqueId: message.voice.file_unique_id,
          });

          // A separate reply keeps the voice itself caption-free, so forwarding it looks like a normal voice message.
          const username = bot!.botInfo.username;
          await api
            .sendMessage(
              ownerId,
              `✅ Saved as “${title}”.\nSend it anywhere by typing @${username} ${title} in a chat — or forward the voice above with “Hide sender name” so it shows up as your own.`,
              { reply_parameters: { message_id: message.message_id } },
            )
            .catch(() => {});
          return clip;
        } finally {
          await cut.dispose();
        }
      });
    } finally {
      usersCutting.delete(ownerId);
    }
  }

  /** Prepares a message the Mini App can hand to Telegram's share dialog (Bot API 8.0 shareMessage). */
  async function prepareShare(ownerId: number, id: number): Promise<string> {
    const clip = store.get(ownerId, id);
    if (!clip) throw new UserError('That clip no longer exists.', 404, 'not_found');
    const prepared = await requireBot().api.savePreparedInlineMessage(
      ownerId,
      { type: 'voice', id: String(clip.id), voice_file_id: clip.fileId, title: clip.title },
      { allow_user_chats: true, allow_bot_chats: true, allow_group_chats: true, allow_channel_chats: true },
    );
    store.markUsed(ownerId, id);
    return prepared.id;
  }

  return { create, prepareShare };
}

export type ClipService = ReturnType<typeof createClipService>;

function explainTelegramError(error: unknown): unknown {
  if (!(error instanceof GrammyError)) return error;
  if (/VOICE_MESSAGES_FORBIDDEN/i.test(error.description)) {
    return new UserError(
      'Your privacy settings block voice messages from this bot. Allow them in Settings → Privacy and Security → Voice Messages.',
      403,
      'voice_forbidden',
    );
  }
  if (error.error_code === 403) {
    return new UserError("I can't message you yet — open the chat with the bot and press Start.", 403, 'cannot_message');
  }
  return error;
}
