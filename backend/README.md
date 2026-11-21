# 🍿 kerNEl backend

A small **Cloudflare Worker** with a free SQLite-backed **Durable Object** for storage that gives kerNEl:

| Feature | What it does |
|---|---|
| 📰 **News collector** | Every 5 minutes it fetches Hacker News, DEV, The Verge, TechCrunch, Ars Technica, Engadget and Wired (RSS parsed on the server, no third-party RSS service), sorts them into categories with the same rules as the website, and stores them. |
| 🖼️ **Real thumbnails + descriptions** | Visits new articles and grabs their `og:image` and the publisher's own short description (`og:description`), so cards show real pictures and the reader shows what the story is about. |
| 🔐 **Accounts** | Username + password (no email). Passwords hashed with salted PBKDF2-SHA256; one-time recovery codes for forgotten passwords; 30-day sessions stored as hashes; rate-limited logins and sign-ups. |
| 🔄 **Sync** | Name tag, XP, saved stories, reactions, achievements, settings and the kids' stars follow you to every device. |
| 🏆 **Leaderboard & streaks** | Top 20 by XP (opt-out), daily check-in streaks with bonus XP. |
| 💬 **Chat** | Rooms, mentions, reactions, story sharing, @codme replies; swear filter, rate limits, reports → auto-hide → 24h mutes; 30-day history. |
| 🔔 **Notifications** | Per-user inbox + Web Push (RFC 8291 encryption, RFC 8292 VAPID signing; the key pair is generated inside the Worker and never leaves Cloudflare). Mentions instantly; big-news alerts and 7 pm streak reminders on a second cron. |
| 🗳️ **Daily poll & profiles** | One "Hot Take" a day (one vote each) and public profile cards (no private data). |
| 🔥 **Shared reactions** | Everyone sees the same reaction counts (signed-in users can vote, one reaction per story each). |
| 🤖 **codme AI** | codme answers with Claude, using kerNEl's live stories and citing them. Rate-limited per visitor, per user and per day to protect your bill. |
| 🧠 **Explain / TL;DR** | Claude explains a story like you're 10, or gives a 3-point TL;DR, in the reader's language. Each answer is cached and shared, so a story is only explained once per language. |
| 🧠 **Daily Kernel Quiz** | 5 questions generated from the day's headlines, the same for everyone. Answers stay on the server until you play; one go per person per day; a daily board (ties go to the fastest). |
| 🍿 **Popcorn Battles** | Two of the day's hottest stories, one vote each; yesterday's winner is the Story of the Day. |
| 🏆 **Weekly tournament** | 8 Real-or-Fake headlines per week (the fakes never name real people or companies). On Monday the top 3 get trophies and a notification. |
| ⚔️ **Quiz Duels** | Two people, the same 5 questions from the day's news, played whenever each likes. Questions are kept on the server and checked there; the time each player takes counts from when they start. Winner by score, then speed. Open duels expire after 48 hours (whoever played wins). |
| 📺 **kerNEl Live** | A scheduled trivia show (12:00 and 18:00 UTC): a 10-minute lobby, then 10 questions everyone answers at the same time from the server clock. A wrong or missing answer knocks you out; survivors get +60 XP and the `liveWins` counter, players +15. Reminders go out with the notification cron. |
| 🔮 **Predictions** | Twice a day the news cron picks rising Hacker News stories and asks whether they'll reach a points target by tomorrow, then settles them from Hacker News. Moderators can post and settle their own. Right calls give +15 XP and the `prophet` counter. |
| 🏅 **Seasons** | XP earned in a calendar month (UTC) counts for that season. On the 1st, the top 3 of last month get 200/100/50 XP, the `seasonWins` counter, a medal and a notification. |
| 🗨️ **Comments** | Comments on any kerNEl story, with @mentions, the swear filter, reports (3 → hidden), mutes and comment counts in `/api/news`. |
| 👯 **Friends** | Follow people; their rank-ups, achievements, quiz/tournament scores, trophies and streak milestones go to a friends feed, and the big ones to followers' phones. |
| ✉️ **Messages** | Private chats between two people, with message requests for people you don't follow (3 messages until accepted), read receipts, reactions, day streaks, shared stories, blocking and reports (3 reports in a day mute someone for 24 hours). Messages are kept for a year. |
| 👥 **Group chats** | Up to 32 members, with stories, voice notes, reactions, "Seen by", mute, rename, add/remove and leave (the oldest member takes over from a creator who leaves). New members only see messages after they joined. One push per member until they catch up, so busy groups don't buzz nonstop. Three reports hide a message. |
| 🎙️ **Voice notes** | Up to 30 seconds and 240 KB, in private and group chats. Only real audio (WebM, Ogg, MP4, MP3, AAC) is accepted, checked by its first bytes, and each clip is fetched by an unguessable key. |
| ✍️ **Typing** | "typing…" lasts 6 seconds after the last keystroke ping, and clears when the message is sent. |
| 🫧 **Pops** | 24-hour posts (text on a background, a photo up to 450 KB, or a kerNEl story) for your followers, with views, emoji reactions, replies into Messages and reports (3 hide a pop). Expired pops and their photos are deleted by the cleanup cron. |
| 🔔 **Followed topics** | Up to 20 companies or topics per person, matched as whole words in headlines. The notification cron sends at most 3 alerts a day, never twice for one story. "Trending now" suggestions come from names that keep appearing in the last day and a half of headlines. |
| ☀️ **Morning Drop** | Five stories a day: up to two about your topics, then the biggest stories (at most two per section). Sent at the hour each person picks, in their time zone, once a day. |
| 🕰️ **Timelines** | For a story, the server picks the words that name what it's about and asks Hacker News search for older stories, newest first, one per month further back. Cached until the story leaves kerNEl. |
| 📈 **Story Stocks** | Every hour the cron turns each company's "buzz" (how many recent stories mention it, weighted by upvotes) into a smoothed price. Wallets start at 1,000 🪙 each week, trades are checked on the server (no overdrafts, at most 40 trades a day), and on Monday the top 3 portfolios get XP. |
| 🎯 **Tech Bingo** | 40 headline patterns; each person gets 24 of them (seeded by week and user). This week's first matching headline marks a square. Prizes for a line, three lines and a full card are paid once each. |
| 🔤 🌫️ **Guessing games** | Five rounds a day, the same for everyone. The server keeps the answers, starts the clock, and won't count answer times faster than the real time that passed. |
| 🃏 **Cards** | Packs are dealt on the server with rarity weights. Only doubles can be gifted or traded; trades are claimed atomically so a card can't be spent twice. |
| 👥 **Squads** | Up to 5 people. Each person's XP for the week is counted on `users.week_xp`, so the squad total is a cheap sum. The first time the total reaches the goal that week, everyone gets the bonus once. Joining creates (or grows) the squad's group chat. |
| 🎉 **Watch Parties** | Moderators create them with `POST /api/mod/parties`. The phase (soon, lobby 15 minutes before, live, over) comes from the clock. Hype taps are counted in 2-second buckets so a busy room writes few rows; viewers are counted from a seen-time written at most every 20 seconds. Going people get a push when it starts. |
| ⚖️ **Debates** | One automatic debate a day on the top story, plus up to 3 a day per person from the reader. 48 hours long; the cron settles closed ones, pays the best-liked argument on the winning side and writes nothing for a tie. 3 reports hide an argument. |
| 🧈 **Butter Shop** | `users.butter` grows by the XP each save adds above `users.butter_mark` (the highest XP already paid out), so XP that drops and comes back can't print butter. A purchase pays and delivers in one `UPDATE … WHERE butter >= price AND shop = (what was read)`, so two quick taps can't spend the same butter. Owned items and streak freezes live in `users.shop`; the daily check-in uses a freeze for each missed day it can cover. Looks you switch on (bubble, background, name effect, codme personality, shop hats) are checked against what you own on every profile save. |
| 🐣 **Kernel Pet** | `users.pet` holds the kind, name, growth and the day it was last fed. Feeding is once per UTC day, adds 1 growth (2 with a 7-day streak) and 5 XP. Mood comes from the last meal: today happy, yesterday hungry, longer sad. |
| 🎭 **codme personalities** | For signed-in people the server uses the personality saved on their profile (so it must be owned); guests can only use the free ones. It goes in a second system block after codme's normal instructions. |
| 📊 **Chat polls** | A poll is stored as JSON on the message itself (`dm_messages.poll`, `group_messages.poll`), with votes in `chat_poll_votes`. Only people in that chat can vote. |
| 🔍 **People search** | Find kernels by username or nickname, with suggestions. People who blocked you don't see you. |
| 🎟️ **Invites & rewards** | Sign-ups with an invite give both people +50 XP (at most 20 rewarded invites per person per day). Server-given XP waits in `pending_xp` until the browser collects it once with `POST /api/me/claim`, and counters in `users.stats` unlock special hats and frames. |
| 🛡️ **Moderators** | Usernames in the `ADMINS` setting get `/api/mod/*`: an overview, every report, hide/restore/dismiss, photo removal, mute and ban, user lookup and an action log. Banned accounts are signed out and can't sign in. |
| 📷 **Profile photos** | Small JPEG/PNG/WebP photos (checked by their first bytes, max 300 KB, never SVG), served with long caching. Three reports from different people remove a photo. |
| 🎩 **Looks** | Hats and frames unlocked by XP (and trophies), checked on the server so nobody can fake a crown. |
| 🌐 **Languages** | Notifications and codme's chat replies in English, Egyptian Arabic, German or Tagalog, following each person's chosen language. |
| 🧸 **Kid news** | Three upbeat stories from the week, picked with a strict filter (no crime, politics, money talk or scary words). |
| 📼 **Time Machine** | The top Hacker News story on today's date for every year since 2007, cached for the day. |

The website keeps working without the backend. If the backend is down, it fetches news directly like before.

**Cost:** Cloudflare's free Workers plan covers a hobby site (100k requests a day, plus free SQLite storage). The free plan also allows about **100,000 database row writes a day**; if that runs out, the server answers with errors until midnight UTC. To stay well under it, everyday rate limits live in memory, presence is written at most once a minute, stories are only rewritten when they really change, and the clean-up runs hourly. The Workers Paid plan ($5/month) raises the limit a lot. The only paid part is codme AI, billed by Anthropic per use. Turn it off by not setting the key.

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
- **codme AI + explainers (optional):** `npx wrangler secret put ANTHROPIC_API_KEY` (key from <https://console.anthropic.com>). Without it, codme uses its built-in offline brain and the 🧠 button uses the quick explainer.
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
| `PUT /api/me/profile` | Bearer | `{ nickname, avatar, topics, leaderboard, hat, frame, lang, bio, dms }` (hats/frames are checked against XP and trophies; `dms` is `everyone`, `following` or `nobody`) |
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
| `POST /api/explain` | optional | `{ key, mode: "eli10"\|"tldr", lang }` → `{ text }` (503 `{ offline: true }` without an AI key) |
| `GET` / `POST /api/quiz` | optional | Today's questions (no answers) · `{ answers: [n…] }` → score, right answers, board |
| `GET /api/quiz/board` | – | Today's quiz board |
| `GET` / `POST /api/battle` | – / Bearer | Today's battle + yesterday's Story of the Day · `{ pick: "a"\|"b" }` |
| `GET` / `POST /api/tournament` | optional / Bearer | This week's 8 headlines, board, last week's winners · `{ answers: { id: "real"\|"fake" } }` |
| `GET /api/comments?key=` · `POST /api/comments` | – / Bearer | A story's comments · `{ key, text }` |
| `POST /api/comments/report` · `DELETE /api/comments/:id` | Bearer | `{ id }` · delete your own |
| `POST /api/comments/react` | Bearer | `{ id, emoji }` (❤️ 😂 🔥 👍 🤯 😮, or `null` to take it back) → `{ reactions, myReaction }`. Comments come back with `reactions` and your `myReaction`. |
| `POST /api/follow` | Bearer | `{ username, follow: true\|false }` |
| `GET /api/users/search?q=` | optional | People matching a name (empty = suggestions), with follow/active/blocked info |
| `POST /api/me/claim` · `GET /api/me/invites` | Bearer | Collect waiting XP once → `{ claimed }` · people you invited |
| `GET /api/mod/overview` · `/reports` · `/log` · `/user?username=` | moderator | Numbers, reports, action log, one person |
| `POST /api/mod/content` · `/dm` · `/photo` · `/user` | moderator | `{ kind: chat\|comment, id, action: hide\|restore\|dismiss }` · `{ reporterId, userId }` · `{ username, action: remove\|dismiss }` · `{ username, action: mute\|unmute\|ban\|unban, hours }` |
| `POST /api/block` · `GET /api/me/blocked` | Bearer | `{ username, block: true\|false }` · people you blocked |
| `GET /api/dm` · `GET /api/dm?count=1` | Bearer | Your conversations (with unread counts and requests) · just the counts |
| `POST /api/dm` | Bearer | `{ to: username \| thread: id, text?, storyKey? }` → message, `pending`, `streak` |
| `GET /api/dm/:id?since=` | Bearer | A conversation's messages (+ changes since a time), `theirRead` for "Seen" |
| `POST /api/dm/accept` · `/hide` · `/react` · `/report` · `DELETE /api/dm/messages/:id` | Bearer | Accept a request · delete the chat for you · `{ id, emoji }` · report + block · delete your message |
| `PUT` / `DELETE /api/me/photo` · `GET /api/photo/:username` · `POST /api/photo/report` | Bearer / – | `{ data: "data:image/jpeg;base64,…" }` · the image · `{ username }` |
| `GET /api/duels` · `POST /api/duels` | Bearer | Your duels + record · `{ to: username }` → a new duel (also posted as a card in your chat) |
| `GET /api/duels/:id` · `POST /api/duels/:id/start` · `/answer` | Bearer | A duel (questions only after you start) · start your clock · `{ answers: [n…] }` → score, and the result once both played |
| `GET /api/live` · `POST /api/live/join` · `/answer` | optional / Bearer | The show's phase, current question, reveal, survivors and the next show times · join in the lobby · `{ q, choice }` |
| `GET /api/predictions` · `POST /api/predictions/vote` | optional / Bearer | Open and recently settled predictions with your record · `{ id, choice }` |
| `POST /api/mod/predictions` · `/resolve` | moderator | `{ question, options: [2–4], hours }` · `{ id, answer }` |
| `GET /api/leaderboard?season=1` | optional | This month's season board, your place and last season's winners |
| `POST /api/dm` (also) | Bearer | `voice: "data:audio/…"`, `voiceMs`, `voicePeaks` for a voice note · `pop: id` to reply to someone's pop |
| `POST /api/dm/typing` | Bearer | `{ thread, stop? }` |
| `POST /api/groups` | Bearer | `{ name, emoji, members: [usernames] }` → `{ group, skipped }` |
| `GET /api/groups/:id?since=` · `POST /api/groups/:id/messages` | Bearer | Messages, members (with what each has read), who's typing · `{ text?, storyKey?, voice? }` |
| `POST /api/groups/react` · `/report` · `/update` · `/add` · `/remove` · `/mute` · `/typing` | Bearer | `{ id, emoji }` · `{ id }` · `{ group, name?, emoji? }` · `{ group, usernames }` · `{ group, username? }` (none = leave) · `{ group, muted }` · `{ group, stop? }` |
| `DELETE /api/groups/messages/:id` | Bearer | Delete your own group message |
| `GET /api/voice/:key` | – | A voice note's audio |
| `GET /api/pops?user=` · `POST /api/pops` | Bearer | Rings of pops from you and the people you follow (or one person) · `{ kind: text\|photo\|story, text, bg, photo?, storyKey? }` |
| `POST /api/pops/view` · `/report` · `GET /api/pops/:id/viewers` · `DELETE /api/pops/:id` | Bearer | `{ id, react? }` · `{ id }` · who saw your pop · delete it |
| `GET /api/pops/photo/:key` | – | A pop's photo (only while the pop is live) |
| `GET /api/topics` · `POST /api/topics` | Bearer | Your topics (with today's story count), trending and popular suggestions · `{ topic, follow: true\|false }` |
| `GET /api/drop` | optional | Today's Morning Drop (personal when signed in) and your drop hour |
| `PUT /api/notify/prefs` (also) | Bearer | `topics: true\|false` in `prefs` for topic alerts · `dropHour: 0–23 \| null` for the Morning Drop |
| `GET /api/timeline?key=` | – | Earlier stories about the same thing |
| `GET /api/stocks` · `POST /api/stocks/trade` | optional / Bearer | Prices with 24-hour sparklines, your wallet, the board · `{ sym, shares }` (negative to sell) |
| `GET /api/bingo` · `POST /api/bingo/claim` | optional / Bearer | Your card for the week and the first bingos · collect prizes |
| `GET /api/guess/emoji\|blur` · `POST …/start` · `POST …/answer` | optional / Bearer | Today's rounds (no answers) · start the clock · `{ answers: [{ pick, ms }] }` |
| `GET /api/cards` (`?user=`) · `POST /api/cards/open` | Bearer | Your collection, packs and open trades (or someone's collection) · open a pack |
| `POST /api/cards/offer` · `/answer` | Bearer | `{ to, give, want? }` (no `want` = gift) · `{ id, accept }` |
| `GET /api/squad` · `POST /api/squad/create` · `/invite` · `/answer` · `/leave` | optional / Bearer | Your squad, invites and the week's top squads · `{ name, emoji }` · `{ username }` · `{ squad, accept }` |
| `GET /api/parties` · `GET /api/parties/:id?since=&hype=` | optional | Upcoming parties · the room: new chat, hype taps since then, viewers |
| `POST /api/parties/:id/chat` · `/hype` · `/rsvp` · `POST /api/parties/report` | Bearer | `{ text, since }` · `{ emoji, n }` · `{ going }` · `{ id }` |
| `POST /api/mod/parties` · `/delete` | moderator | `{ title, emoji, starts, minutes, storyKey? }` · `{ id }` |
| `GET /api/debates` (`?story=`) · `GET /api/debates/:id` · `POST /api/debates` | optional / Bearer | Open and recent debates · one debate with its arguments · `{ storyKey, question, sideA, sideB }` |
| `POST /api/debates/vote` · `/argue` · `/like` · `/report` | Bearer | `{ id, side }` · `{ id, text }` · `{ id, like }` · `{ id }` |
| `POST /api/dm` · `/api/groups/:id/messages` (also) | Bearer | `poll: { question, options: [2–4] }` sends a poll |
| `GET /api/shop` · `POST /api/shop/buy` | Bearer | Your 🧈, owned items and streak freezes (the first visit adds the welcome gift) · `{ id }` |
| `PUT /api/me/profile` (also) | Bearer | `bubble`, `bg`, `fx`, `persona` (`none` to switch off) and shop hats in `hat` |
| `GET /api/pet` · `POST /api/pet/adopt` · `/name` · `/feed` · `/treat` | Bearer | Your pet (or `null`) and streak · `{ species: chick\|dino\|kitty\|bot, name }` · `{ name }` · feed once a day · give a treat |
| `POST /api/codme` (also) | optional | `persona` for guests (free personalities only) |
| `POST /api/chatpoll` | Bearer | `{ scope: d\|g, id: messageId, option }` (the same option again takes the vote back) |
| `GET /api/me/friends` | Bearer | People you follow (with live streaks) + their activity |
| `GET /api/kids/news` | – | This week's three kid-friendly stories |
| `GET /api/timemachine?date=MM-DD` | – | Top story on that date, every year since 2007 |

**Testing kerNEl Live:** set `LIVE_TEST_PERIOD_MS` (for example `90000`) and `LIVE_TEST_STEP_MS` (`4000`) to run a quick show every 90 seconds instead of twice a day. Don't set them on the real site.

Limits you can change in `wrangler.toml`: `CODME_PER_IP_HOUR` (20), `CODME_PER_USER_DAY` (100), `CODME_GLOBAL_DAY` (2000), `EXPLAIN_PER_IP_HOUR` (40), `EXPLAIN_GLOBAL_DAY` (1500, counts only new explanations), `SIGNUPS_PER_IP_HOUR` (5).

**Using your own domain?** Add it to `ALLOWED_ORIGINS` (comma-separated) and redeploy, or browsers on the new address can't talk to the server.

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
src/news.js    collector, RSS/Atom parser, thumbnails + publisher descriptions, story queries (reuses ../js/news.js for categories)
src/auth.js    accounts: password hashing, recovery codes, sessions, streaks, cleaning what browsers send
src/codme.js   Claude-powered codme replies grounded in kerNEl's stories
src/community.js  chat rooms, @codme in chat, moderation, daily poll, profile cards
src/push.js    notifications: inbox, Web Push encryption + VAPID, mention / big-news / streak triggers
src/features.js  routes for the games and social features
src/play.js    Daily Quiz, Popcorn Battles, weekly tournament + trophies
src/arena.js   Quiz Duels, kerNEl Live, Predictions, Seasons
src/social.js  comments, follows, friends' activity, avatar looks
src/people.js  messages, people search, profile photos, blocking
src/groups.js  group chats
src/pops.js    24-hour pops
src/media.js   voice notes and typing
src/discover.js  followed topics, Morning Drop, timelines
src/market.js  Story Stocks
src/bingo.js   Tech Bingo
src/guess.js   Emoji Headlines + Blur Reveal
src/cards.js   kerNEl Cards
src/squads.js  Squads
src/parties.js Watch Parties
src/debates.js Debate Rooms
src/chatpolls.js polls in private and group chats
src/shop.js    Butter Shop (butter, purchases, streak freezes, shop looks)
src/pet.js     Kernel Pet
src/rewards.js server-given XP, special counters, invites
src/admin.js   moderator tools
src/extras.js  Explain/TL;DR (Claude), kid news, Time Machine
src/i18n.js    notification + chat-reply texts in English, Egyptian Arabic, German, Tagalog
schema.sql     database tables
test/          end-to-end test
```
