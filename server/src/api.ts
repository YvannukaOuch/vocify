import type { Bot } from 'grammy';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { validateInitData, type TelegramUser } from './auth.ts';
import { cleanTags, cleanTitle, type ClipService } from './clips.ts';
import { config, isAllowed } from './config.ts';
import { UserError } from './errors.ts';
import { searchYouTube } from './media.ts';
import type { Clip, Store } from './store.ts';

type Env = { Variables: { user: TelegramUser } };

/** What the Mini App sees — no owner ID or Telegram file handles. */
function publicClip(clip: Clip) {
  const { id, title, tags, videoId, videoTitle, startMs, endMs, durationMs, useCount, createdAt, lastUsedAt } = clip;
  return { id, title, tags, videoId, videoTitle, startMs, endMs, durationMs, useCount, createdAt, lastUsedAt };
}

export function createApi({ store, clips, bot }: { store: Store; clips: ClipService; bot: Bot | null }) {
  const api = new Hono<Env>();
  const lastSearch = new Map<number, number>();

  api.use('*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const initData = header.startsWith('tma ') ? header.slice(4).trim() : '';
    let user = initData ? validateInitData(initData, config.botToken) : null;
    // Dev convenience for a plain browser only: invalid Telegram data is still rejected.
    if (!user && !initData && config.devUserId) user = { id: config.devUserId, first_name: 'Dev' };
    if (!user) return c.json({ error: 'Open the soundboard from Telegram.', code: 'unauthorized' }, 401);
    if (!isAllowed(user.id)) return c.json({ error: 'This soundboard is private.', code: 'forbidden' }, 403);
    c.set('user', user);
    await next();
  });

  api.get('/me', (c) => {
    const user = c.get('user');
    return c.json({
      user: { id: user.id, firstName: user.first_name },
      botUsername: bot?.botInfo.username ?? null,
      maxClipSeconds: config.maxClipSeconds,
    });
  });

  api.get('/clips', (c) => c.json({ clips: store.list(c.get('user').id).map(publicClip) }));

  api.post('/clips', async (c) => {
    const body = await readJson(c);
    const clip = await clips.create({
      ownerId: c.get('user').id,
      videoId: String(body.videoId ?? ''),
      startSec: Number(body.start),
      endSec: Number(body.end),
      title: cleanTitle(body.title),
      tags: cleanTags(body.tags),
    });
    return c.json({ clip: publicClip(clip) }, 201);
  });

  api.patch('/clips/:id', async (c) => {
    const body = await readJson(c);
    const changes: { title?: string; tags?: string[] } = {};
    if (body.title !== undefined) {
      changes.title = cleanTitle(body.title);
      if (!changes.title) throw new UserError('The name can’t be empty.');
    }
    if (body.tags !== undefined) changes.tags = cleanTags(body.tags);
    const clip = store.update(c.get('user').id, clipId(c), changes);
    if (!clip) throw new UserError('That clip no longer exists.', 404, 'not_found');
    return c.json({ clip: publicClip(clip) });
  });

  api.delete('/clips/:id', (c) => {
    if (!store.remove(c.get('user').id, clipId(c))) throw new UserError('That clip no longer exists.', 404, 'not_found');
    return c.json({ ok: true });
  });

  api.post('/clips/:id/share', async (c) => {
    const preparedMessageId = await clips.prepareShare(c.get('user').id, clipId(c));
    return c.json({ preparedMessageId });
  });

  api.get('/search', async (c) => {
    const query = (c.req.query('q') ?? '').trim().slice(0, 120);
    if (!query) return c.json({ results: [] });
    const userId = c.get('user').id;
    const now = Date.now();
    if (now - (lastSearch.get(userId) ?? 0) < 1000) throw new UserError('Slow down a little.', 429, 'rate_limited');
    lastSearch.set(userId, now);
    return c.json({ results: await searchYouTube(query) });
  });

  api.onError((error, c) => {
    if (error instanceof UserError) return c.json({ error: error.message, code: error.code }, error.status as ContentfulStatusCode);
    console.error(`[api] ${c.req.method} ${c.req.path} failed:`, error);
    return c.json({ error: 'Something went wrong on the server.', code: 'internal' }, 500);
  });

  return api;
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Fall through to the error below.
  }
  throw new UserError('Expected a JSON object.');
}

function clipId(c: Context): number {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) throw new UserError('That clip no longer exists.', 404, 'not_found');
  return id;
}
