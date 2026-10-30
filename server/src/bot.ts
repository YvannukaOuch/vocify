import { InlineKeyboard, type Api, type Bot } from 'grammy';
import type { InlineQueryResultCachedVoice } from 'grammy/types';
import type { ClipService } from './clips.ts';
import { config, isAllowed } from './config.ts';
import { UserError } from './errors.ts';
import type { Store } from './store.ts';
import { parseClipRequest, type ClipRequest } from './youtube.ts';

const INLINE_PAGE_SIZE = 50;

export function registerBotHandlers(bot: Bot, store: Store, clips: ClipService) {
  bot.use(async (ctx, next) => {
    const user = ctx.from;
    if (!user) return;
    if (isAllowed(user.id)) return next();

    console.warn(`[bot] blocked user ${user.id} (@${user.username ?? '-'})`);
    if (ctx.inlineQuery) await ctx.answerInlineQuery([], { cache_time: 300, is_personal: true });
    else if (ctx.chat?.type === 'private') {
      await ctx.reply(`This soundboard is private. Your Telegram ID is ${user.id} — the owner can add it to ALLOWED_USER_IDS.`);
    }
  });

  const privateChat = bot.chatType('private');

  privateChat.command(['start', 'help'], (ctx) => {
    // Handy for filling in ALLOWED_USER_IDS.
    console.log(`[bot] /${ctx.message.text.slice(1).split(/\s/)[0]} from user ${ctx.from.id} (@${ctx.from.username ?? '-'})`);
    return ctx.reply(helpText(bot.botInfo.username), {
      reply_markup: soundboardButton(),
      link_preview_options: { is_disabled: true },
    });
  });

  privateChat.on('message:text', async (ctx) => {
    const request = parseClipRequest(ctx.message.text);
    if (!request) {
      await ctx.reply('Send me a YouTube link — add a time range like 0:12-0:19 and a name to cut it straight away.', {
        reply_markup: soundboardButton(),
      });
      return;
    }

    if (request.endSec === null) {
      const trimmer = config.webappUrl
        ? new InlineKeyboard().webApp('✂️ Pick the part', trimmerUrl(request))
        : undefined;
      await ctx.reply(
        trimmer
          ? 'Pick the part you want in the trimmer — or reply with the link plus a time range like 0:12-0:19.'
          : 'Add a time range like 0:12-0:19 after the link so I know which part to cut.',
        { reply_markup: trimmer },
      );
      return;
    }

    // Not awaited: grammY handles updates one at a time, and a cut takes several seconds.
    void cutFromChat(ctx.api, ctx.from.id, request, clips);
  });

  bot.on('inline_query', async (ctx) => {
    const offset = Number(ctx.inlineQuery.offset) || 0;
    const found = store.search(ctx.from.id, ctx.inlineQuery.query, INLINE_PAGE_SIZE, offset);
    const results = found.map(
      (clip): InlineQueryResultCachedVoice => ({ type: 'voice', id: String(clip.id), voice_file_id: clip.fileId, title: clip.title }),
    );
    await ctx.answerInlineQuery(results, {
      cache_time: 0,
      is_personal: true,
      next_offset: found.length === INLINE_PAGE_SIZE ? String(offset + INLINE_PAGE_SIZE) : '',
      button: config.webappUrl
        ? { text: offset === 0 && found.length === 0 && !ctx.inlineQuery.query ? '➕ Add your first sound' : '🎛 Open soundboard', web_app: { url: config.webappUrl } }
        : undefined,
    });
  });

  // Only arrives when inline feedback is enabled in @BotFather (/setinlinefeedback).
  bot.on('chosen_inline_result', (ctx) => {
    const id = Number(ctx.chosenInlineResult.result_id);
    if (Number.isSafeInteger(id)) store.markUsed(ctx.from.id, id);
  });

  bot.catch(({ error, ctx }) => {
    console.error(`[bot] update ${ctx.update.update_id} failed:`, error);
  });
}

/** One-time setup: command list, the chat's menu button, and warnings about BotFather settings. */
export async function configureBot(bot: Bot) {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Open the soundboard' },
    { command: 'help', description: 'How to add and send sounds' },
  ]);

  if (config.webappUrl) {
    await bot.api
      .setChatMenuButton({ menu_button: { type: 'web_app', text: 'Soundboard', web_app: { url: config.webappUrl } } })
      .catch((error: unknown) => console.warn('[bot] could not set the menu button (WEBAPP_URL must be https):', error));
  } else {
    console.warn('[bot] WEBAPP_URL is not set — the Mini App buttons are hidden.');
  }

  if (!bot.botInfo.supports_inline_queries) {
    console.warn(`[bot] inline mode is off — enable it in @BotFather with /setinline so "@${bot.botInfo.username} name" works.`);
  }
}

async function cutFromChat(api: Api, userId: number, request: ClipRequest, clips: ClipService) {
  const status = await api.sendMessage(userId, '✂️ Cutting your clip…').catch(() => null);
  try {
    await clips.create({
      ownerId: userId,
      videoId: request.videoId,
      startSec: request.startSec ?? 0,
      endSec: request.endSec!,
      title: request.title,
    });
    if (status) await api.deleteMessage(userId, status.message_id).catch(() => {});
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[bot] clip from chat failed:', error);
    const message = error instanceof UserError ? error.message : 'Something went wrong while cutting that clip.';
    if (status) await api.editMessageText(userId, status.message_id, `❌ ${message}`).catch(() => {});
    else await api.sendMessage(userId, `❌ ${message}`).catch(() => {});
  }
}

function soundboardButton() {
  return config.webappUrl ? new InlineKeyboard().webApp('🎛 Open soundboard', config.webappUrl) : undefined;
}

function trimmerUrl(request: ClipRequest): string {
  const params = new URLSearchParams({ v: request.videoId });
  if (request.startSec) params.set('t', String(request.startSec));
  return `${config.webappUrl}/?${params}`;
}

function helpText(username: string): string {
  return [
    '🎛 Voicify — your meme soundboard',
    '',
    '➕ Add a sound',
    '• Tap “Open soundboard”, find a YouTube video and pick the part you want.',
    '• Or send me a link with a time range and a name:',
    '   https://youtu.be/dQw4w9WgXcQ 0:43-0:47 never gonna',
    '• Sharing a video to me from the YouTube app opens the trimmer.',
    '',
    '📤 Send a sound',
    `• In any chat, type @${username} and part of the name, then tap the clip.`,
    '• Or forward a clip from this chat with “Hide sender name” — it shows up as your own voice message.',
  ].join('\n');
}
