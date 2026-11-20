# 🍿 kerNEl backend

A small **Cloudflare Worker** with a free SQLite-backed **Durable Object** for storage that gives kerNEl:

| Feature | What it does |
|---|---|
| 📰 **News collector** | Every 5 minutes it fetches Hacker News, DEV, The Verge, TechCrunch, Ars Technica, Engadget and Wired (RSS parsed on the server, no third-party RSS service), sorts them into categories with the same rules as the website, and stores them. |
| 🖼️ **Real thumbnails** | Visits new articles and grabs their `og:image`, so cards show real pictures instead of emoji art. |
| 🔐 **Accounts** | Username + password (no email). Passwords hashed with salted PBKDF2-SHA256; one-time recovery codes for forgotten passwords; 30-day sessions stored as hashes; rate-limited logins and sign-ups. |
| 🔄 **Sync** | Name tag, XP, saved stories, reactions, achievements, settings and the kids' stars follow you to every device. |
| 🏆 **Leaderboard & streaks** | Top 20 by XP (opt-out), daily check-in streaks with bonus XP. |
| 💬 **Chat** | Rooms, mentions, reactions, story sharing, @codme replies; swear filter, rate limits, reports → auto-hide → 24h mutes; 30-day history. |
| 🔔 **Notifications** | Per-user inbox + Web Push (RFC 8291 encryption, RFC 8292 VAPID signing; the key pair is generated inside the Worker and never leaves Cloudflare). Mentions instantly; big-news alerts and 7 pm streak reminders on a second cron. |
| 🗳️ **Daily poll & profiles** | One "Hot Take" a day (one vote each) and public profile cards (no private data). |
| 🔥 **Shared reactions** | Everyone sees the same reaction counts (signed-in users can vote, one reaction per story each). |
| 🤖 **codme AI** | codme answers with Claude, using kerNEl's live stories and citing them. Rate-limited per visitor, per user and per day to protect your bill. |

The website keeps working without the backend. If the backend is down, it fetches news directly like before.

**Cost:** Cloudflare's free Workers plan covers a hobby site (100k requests a day, plus free SQLite storage). The only paid part is codme AI, billed by Anthropic per use. Turn it off by not setting the key.

---

## Deploy

**kerNEl's live server:** https://kernel-api.tech-kernel.workers.dev (check it at `/api/health`).

To deploy your own copy, you need [Node.js](https://nodejs.org) 20+ and a free [Cloudflare account](https://dash.cloudflare.com/sign-up):

```bash
cd backend
npm install
npx wrangler login      # or set CLOUDFLARE_API_TOKEN (template "Edit Cloudflare Workers")
npm run deploy          # prints your URL: https://kernel-api.<you>.workers.dev
```

- There's no database to create. Data lives in a SQLite-backed **Durable Object**, and its tables are created automatically on first use. If you prefer D1, bind it as `DB` and it is used instead.
- In `wrangler.toml`, set `ALLOWED_ORIGINS` to your site's address.
- **codme AI (optional):** `npx wrangler secret put ANTHROPIC_API_KEY` (key from <https://console.anthropic.com>). Without it, codme uses its built-in offline brain.
- Put the worker URL in the website's config as `apiBase`.

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | – | Status, story count, which features are configured |
| `GET /api/news?limit=200` | – | Latest stories with thumbnails + shared reaction counts, and source health |
| `GET /api/auth/available?username=` | – | Is a username free? |
| `POST /api/auth/register` | – | `{ username, password, leaderboard? }` → `{ token, isNew, recoveryCode, user }` |
| `POST /api/auth/login` | – | `{ username, password }` → `{ token, user }` |
| `POST /api/auth/recover` | – | `{ username, recoveryCode, newPassword }` → `{ token, recoveryCode (new), user }` |
| `POST /api/auth/logout` | Bearer | End this session |
| `GET /api/me` | Bearer | Account, profile, streak and synced data |
| `PUT /api/me/profile` | Bearer | `{ nickname, avatar, topics, leaderboard }` |
| `PATCH /api/me/data` | Bearer | Any of `{ xp, read, saved, reactions, badges, settings, kids, codmeAsks, konami }`, merged in |
| `POST /api/me/checkin` | Bearer | Daily streak → `{ streak, bestStreak, bonusXp }` |
| `POST /api/me/password` | Bearer | `{ currentPassword, newPassword }` (signs out other devices) |
| `POST /api/me/recovery-code` | Bearer | `{ password }` → a new recovery code |
| `DELETE /api/me` | Bearer | Delete the account and everything in it |
| `GET /api/leaderboard` | optional | Top 20 by XP, plus your place |
| `GET /api/chat?room=&since=` | optional | Messages changed since `since` (ms), rooms + online counts |
| `POST /api/chat` | Bearer | `{ room, text, storyKey? }` (start with `@codme` to ask the bot) |
| `POST /api/chat/react` · `/api/chat/report` | Bearer | `{ id, emoji? }` |
| `DELETE /api/chat/:id` | Bearer | Delete your own message |
| `GET /api/users/:username` | – | Public profile card |
| `GET /api/poll` · `POST /api/poll` | – / Bearer | Today's Hot Take · `{ option }` |
| `GET /api/push/key` | – | VAPID public key for `PushManager.subscribe()` |
| `POST /api/push/subscribe` · `/api/push/unsubscribe` | Bearer | `{ subscription, tz? }` · `{ endpoint }` |
| `POST /api/push/test` | Bearer | Send yourself a test notification |
| `GET` / `PUT /api/notify/prefs` | Bearer | `{ prefs: { mentions, news, streak }, tz }` |
| `GET /api/notifications` · `POST /api/notifications/read` | Bearer | 🔔 inbox · `{ id }` or `{ all: true }` |
| `POST /api/react` | Bearer | `{ key, emoji: "fire"\|"lol"\|"mind"\|"meh"\|null }` → shared counts |
| `POST /api/codme` | optional | `{ messages: [{ role, content }] }` → `{ reply, stories, refs }` |

Limits you can change in `wrangler.toml`: `CODME_PER_IP_HOUR` (20), `CODME_PER_USER_DAY` (100), `CODME_GLOBAL_DAY` (2000), `SIGNUPS_PER_IP_HOUR` (5).

**Password hashing strength:** `PBKDF2_ITERATIONS` is 20,000 by default. That costs about 4 ms of CPU per sign-in, which fits the free plan's 10 ms limit. On the Workers Paid plan ($5/month), set it to `100000`, the Workers maximum. Existing passwords upgrade automatically the next time each person signs in.

## Develop & test

```bash
npm test          # bundles the worker and runs it in Cloudflare's local runtime (Miniflare); STORAGE=do npm test uses the Durable Object
                  # every outside service (news sites, Anthropic) is replaced by test stand-ins
npm run dev       # local dev server at http://localhost:8787
```

## Files

```
src/index.js   routes, CORS, cron handler
src/db.js      storage: SQLite Durable Object (or D1 if bound)
src/news.js    collector, RSS/Atom parser, thumbnails, story queries (reuses ../js/news.js for categories)
src/auth.js    accounts: password hashing, recovery codes, sessions, streaks, cleaning what browsers send
src/codme.js   Claude-powered codme replies grounded in kerNEl's stories
src/community.js  chat rooms, @codme in chat, moderation, daily poll, profile cards
src/push.js    notifications: inbox, Web Push encryption + VAPID, mention / big-news / streak triggers
schema.sql     database tables
test/          end-to-end test
```
