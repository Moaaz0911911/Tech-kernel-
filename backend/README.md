# 🍿 kerNEl backend

A small **Cloudflare Worker** with a free **D1** database that gives kerNEl:

| Feature | What it does |
|---|---|
| 📰 **News collector** | Every 5 minutes it fetches Hacker News, DEV, The Verge, TechCrunch, Ars Technica, Engadget and Wired (RSS parsed on the server, no third-party RSS service), sorts them into categories with the same rules as the website, and stores them. |
| 🖼️ **Real thumbnails** | Visits new articles and grabs their `og:image`, so cards show real pictures instead of emoji art. |
| 🔐 **Real accounts** | Verifies Google / Apple sign-in tokens **with their cryptographic signatures**, then opens a 30-day session. Only a hash of each session token is stored. |
| 🔄 **Sync** | Name tag, XP, saved stories and reactions follow you to every device. |
| 🔥 **Shared reactions** | Everyone sees the same reaction counts (signed-in users can vote, one reaction per story each). |
| 🤖 **codme AI** | codme answers with Claude, using kerNEl's live stories and citing them. Rate-limited per visitor, per user and per day to protect your bill. |

The website keeps working without the backend. If the backend is down, it fetches news directly like before.

**Cost:** Cloudflare Workers + D1 free tier covers a hobby site (100k requests a day, 5 GB database). The only paid part is codme AI, billed by Anthropic per use. Turn it off by not setting the key.

---

## Deploy (about 10 minutes, once)

You need [Node.js](https://nodejs.org) 20+ and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
cd backend
npm install
npx wrangler login                     # opens the browser to connect your Cloudflare account
npx wrangler d1 create kernel-db       # prints a database_id
```

1. Paste the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_YOUR_DATABASE_ID`).
2. In `wrangler.toml` → `[vars]`:
   - `ALLOWED_ORIGINS`: your site, e.g. `https://moaaz0911911.github.io`
   - `GOOGLE_CLIENT_ID`: the same Client ID as in the website's config
   - `APPLE_CLIENT_ID`: your Apple Services ID (leave empty if you don't use Apple)
3. Create the tables and deploy:
   ```bash
   npm run db:init
   npm run deploy                      # prints your URL: https://kernel-api.<you>.workers.dev
   ```
4. **codme AI (optional):** get an API key at <https://console.anthropic.com>, then run
   `npx wrangler secret put ANTHROPIC_API_KEY` and paste it when asked.
   (Or in the Cloudflare dashboard: Workers → kernel-api → Settings → Variables and Secrets → Add → Secret.)
5. Put the worker URL in the website's config as `apiBase`. In `js/config.js` for the multi-file site, or the `CONFIG` block of the single-file `index.html`:
   ```js
   apiBase: 'https://kernel-api.<you>.workers.dev',
   ```
6. Open `https://kernel-api.<you>.workers.dev/api/health`. It should show `"ok": true` and which features are on.

News appears on the first visit, and the cron keeps it fresh every 5 minutes after that.

---

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | – | Status, story count, which features are configured |
| `GET /api/news?limit=200` | – | Latest stories with thumbnails + shared reaction counts, and source health |
| `POST /api/auth/google` · `/api/auth/apple` | – | `{ idToken, nonce?, name?, givenName? }` → `{ token, isNew, user }` |
| `POST /api/auth/logout` | Bearer | End this session |
| `GET /api/me` | Bearer | Account, profile and synced data |
| `PUT /api/me/profile` | Bearer | `{ nickname, avatar, topics }` |
| `PUT /api/me/data` | Bearer | `{ xp, read, saved, reactions, konami }` |
| `DELETE /api/me` | Bearer | Delete the account and everything in it |
| `POST /api/react` | Bearer | `{ key, emoji: "fire"\|"lol"\|"mind"\|"meh"\|null }` → shared counts |
| `POST /api/codme` | optional | `{ messages: [{ role, content }] }` → `{ reply, stories, refs }` |

Limits you can change in `wrangler.toml`: `CODME_PER_IP_HOUR` (20), `CODME_PER_USER_DAY` (100), `CODME_GLOBAL_DAY` (2000).

## Develop & test

```bash
npm test          # bundles the worker and runs it in Cloudflare's local runtime (Miniflare) with a local D1;
                  # every outside service (news sites, Google/Apple keys, Anthropic) is replaced by test stand-ins
npm run dev       # local dev server at http://localhost:8787 (run `npx wrangler d1 execute kernel-db --local --file=schema.sql` first)
```

## Files

```
src/index.js   routes, CORS, cron handler
src/news.js    collector, RSS/Atom parser, thumbnails, story queries (reuses ../js/news.js for categories)
src/auth.js    ID-token signature verification, sessions, input cleaning
src/codme.js   Claude-powered codme replies grounded in kerNEl's stories
schema.sql     database tables
test/          end-to-end test
```
