import { serve } from '@hono/node-server';
import { Bot } from 'grammy';
import { Hono } from 'hono';
import { createApi } from './api.ts';
import { configureBot, registerBotHandlers } from './bot.ts';
import { createClipService } from './clips.ts';
import { config } from './config.ts';
import { serveWebapp } from './static.ts';
import { openStore } from './store.ts';

const store = openStore(config.dbPath);

let bot: Bot | null = null;
if (config.botToken) {
  bot = new Bot(config.botToken);
  await bot.init();
} else if (config.production) {
  throw new Error('BOT_TOKEN is required in production.');
} else {
  console.warn('BOT_TOKEN is not set — running the API only (cutting and sending clips are disabled).');
}

if (config.production && config.allowedUserIds.size === 0) {
  console.warn('ALLOWED_USER_IDS is empty — anyone who finds the bot can use your server to download from YouTube.');
}

const clips = createClipService(store, bot);

const app = new Hono();
app.route('/api', createApi({ store, clips, bot }));
app.get('*', serveWebapp(config.webappDist));

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`HTTP server on http://${info.address}:${info.port}`);
});

if (bot) {
  const polling = bot;
  registerBotHandlers(polling, store, clips);
  await configureBot(polling);
  polling
    .start({
      allowed_updates: ['message', 'inline_query', 'chosen_inline_result'],
      onStart: (me) => console.log(`Bot @${me.username} is listening`),
    })
    .catch((error: unknown) => {
      console.error('Bot polling stopped:', error);
      process.exit(1);
    });
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await bot?.stop();
  server.close();
  store.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
