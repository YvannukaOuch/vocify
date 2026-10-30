# Voicify

A Telegram meme soundboard. Pick a few seconds of any YouTube video and it becomes a real
voice message you can drop into any chat — no laptop speakers, no re-recording.

## How it works

1. **Mini App (on your phone):** search YouTube or paste a link, then preview and trim the part
   you want in YouTube's own player. Previewing runs entirely on your phone — the server isn't involved.
2. **Create:** the server does one small job per clip — `yt-dlp` downloads only those seconds,
   `ffmpeg` encodes them as an Opus voice note, and the bot sends it to you. Telegram hands back a
   `file_id`, which is stored in SQLite.
3. **Send, as often as you like (costs the server nothing — Telegram already has the file):**
   - type `@yourbot bruh` in any chat and tap the clip (inline mode),
   - tap **Send** in the Mini App and pick a chat, or
   - forward the clip from your chat with the bot and choose **Hide sender name** — it then looks
     exactly like a voice message you recorded. (The first two show a small "via @yourbot".)

You can also skip the Mini App: send the bot `https://youtu.be/ID 0:12-0:19 bruh` and it cuts the
clip right away. Sharing a video to the bot from the YouTube app gives you a button that opens the
trimmer on that video.

> For personal use: downloading from YouTube is against YouTube's Terms of Service.

## 1. Create the bot

In Telegram, talk to [@BotFather](https://t.me/BotFather):

| Command | What to do |
| --- | --- |
| `/newbot` | Pick a name and username. Copy the token. |
| `/setinline` | Pick your bot, set the placeholder to e.g. `Search your sounds…` |
| `/setinlinefeedback` | Optional: `Enabled` — lets inline results show recently used clips first. |

The bot sets its own menu button and commands when it starts.

## 2. Try it on your PC (optional)

Needs Node 22.18+ (24 recommended), plus `yt-dlp` and `ffmpeg` on PATH
(`winget install yt-dlp.yt-dlp Gyan.FFmpeg`).

```powershell
npm install
copy server\.env.example server\.env   # put BOT_TOKEN in it
npm run build                          # builds the Mini App into webapp/dist
npm start                              # bot + API + Mini App on http://127.0.0.1:3000
```

Telegram only opens Mini Apps over HTTPS, so expose the local server with a tunnel:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Put the printed `https://….trycloudflare.com` address in `WEBAPP_URL` and restart. (Quick tunnels get
a new address every time — fine for testing.)

**Working on the UI:** `npm run dev` runs the server with auto-restart plus Vite on
http://localhost:5173. To use it in a normal browser, set `DEV_USER_ID` in `server/.env` to your
Telegram ID; requests without Telegram data are treated as that user (never in production).

## 3. Deploy on the VPS

Written for Ubuntu 24.04 / Debian 12. Run as root. You need a domain (or a free
[DuckDNS](https://www.duckdns.org) name) whose DNS points at the VPS, and ports 80/443 open.

Copy the code from your PC **without** `node_modules` (they contain Windows-only binaries) or your
local `.env`/database:

```powershell
tar --exclude=node_modules --exclude=dist --exclude=server/data --exclude=server/.env -czf voicify.tgz package.json package-lock.json server webapp deploy
ssh root@YOUR_VPS "mkdir -p /opt/voicify"
scp voicify.tgz root@YOUR_VPS:/opt/voicify/
ssh root@YOUR_VPS "cd /opt/voicify && tar xzf voicify.tgz && rm voicify.tgz"
```

Then on the VPS:

```bash
# Tools
apt update && apt install -y ffmpeg caddy curl
curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt install -y nodejs

# yt-dlp: use the official build, not apt's (it goes stale). ARM VPS: yt-dlp_linux_aarch64
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
# YouTube changes often — update yt-dlp daily
printf '#!/bin/sh\n/usr/local/bin/yt-dlp -U >/dev/null 2>&1\n' > /etc/cron.daily/yt-dlp
chmod +x /etc/cron.daily/yt-dlp

# App (copy the code over first — see below)
useradd --system --home /opt/voicify --shell /usr/sbin/nologin voicify
cd /opt/voicify
npm ci && npm run build
cp server/.env.example server/.env
nano server/.env        # BOT_TOKEN, WEBAPP_URL=https://your.domain, ALLOWED_USER_IDS
mkdir -p server/data && chown -R voicify:voicify /opt/voicify && chmod 600 server/.env

# Run it
cp deploy/voicify.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now voicify

# HTTPS: edit the domain in deploy/Caddyfile first
cp deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy

journalctl -u voicify -f   # should show "Bot @yourbot is listening"
```

Then lock it down: send `/start` to your bot, find `from user <your id>` in the log, put it in
`ALLOWED_USER_IDS` and `systemctl restart voicify`. Otherwise anyone who finds the bot can make your
server download from YouTube.

**Low on RAM?** If `npm ci && npm run build` runs out of memory on a 512 MB box, run
`npm run build` on your PC and copy `webapp/dist` over instead; the server itself only needs
`npm ci --omit=dev`.

**Updating:** copy the new files the same way, then `npm ci && npm run build`,
`chown -R voicify:voicify /opt/voicify` and `systemctl restart voicify`.

## Settings (`server/.env`)

| Variable | Default | |
| --- | --- | --- |
| `BOT_TOKEN` | — | Required. |
| `WEBAPP_URL` | — | Public HTTPS address of the server. Without it the Mini App buttons are hidden. |
| `ALLOWED_USER_IDS` | everyone | Comma-separated Telegram user IDs. |
| `MAX_CLIP_SECONDS` | `60` | Longest clip allowed. |
| `MAX_CONCURRENT_JOBS` | `1` | Clips cut at the same time (others queue). Keep 1 on a small VPS. |
| `YTDLP_EXTRA_ARGS` | — | Extra yt-dlp flags, e.g. `--cookies data/cookies.txt`. |
| `YTDLP_PATH` / `FFMPEG_PATH` | on PATH | Tool locations. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Where the server listens (Caddy proxies to it). |
| `DB_PATH` | `data/voicify.db` | SQLite file, relative to `server/`. |

## Troubleshooting

- **"YouTube is blocking the server with a bot check"** — YouTube often flags datacenter IPs.
  Export `cookies.txt` from a *throwaway* YouTube account (e.g. the "Get cookies.txt LOCALLY"
  browser extension), save it as `server/data/cookies.txt`, owned by `voicify`, set
  `YTDLP_EXTRA_ARGS=--cookies data/cookies.txt` and restart.
- **Downloads suddenly fail** — run `yt-dlp -U` (the daily cron job normally handles it).
- **`@yourbot` shows nothing** — enable inline mode with `/setinline`. It only lists *your* clips.
- **"Preview unavailable" in the trimmer** — the uploader disabled embedding. Type the start/end
  times instead; cutting still works.
- **"I can't message you yet"** — open the chat with the bot and press Start.
- **"Your privacy settings block voice messages"** — allow voice messages from the bot in
  Settings → Privacy and Security → Voice Messages.

## Project layout

```
server/   Node + TypeScript (runs directly on Node 24, no build step)
  src/index.ts    starts the bot (long polling) and the HTTP server
  src/bot.ts      /start, link messages, inline mode
  src/api.ts      Mini App API, authenticated with Telegram's signed initData
  src/media.ts    yt-dlp + ffmpeg: cut, encode, search
  src/store.ts    SQLite (node:sqlite) — clips and their Telegram file_ids
webapp/   Telegram Mini App: React + Vite + Tailwind + shadcn/ui, themed from Telegram's colors
deploy/   systemd unit and Caddyfile
```

`npm test` runs the server tests; `npm run typecheck` checks both packages.
