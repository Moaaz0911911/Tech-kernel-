# 🍿 kerNEl — tech news, freshly popped

**kerNEl** is a loud, funny, IGN-style tech news site that runs on **GitHub Pages**. No build step is needed; it's plain HTML, CSS and JavaScript, plus a small free server for accounts and the social stuff.

## 🌐 Four languages

English · **العربي المصري** (Egyptian Arabic, right-to-left) · **Deutsch** · **Tagalog**. Pick one from the 🌐 button in the header (or the footer). Everything switches: menus, codme, games, notifications, the daily poll, and every kerNEl Kids lesson. Your choice is saved to your account, so your other devices switch too.

- kerNEl picks your language automatically the first time, based on your browser.
- codme understands questions in all four languages ("عايز اخبار عن ابل النهارده", "Neueste KI News", "Ano ang API?").
- Headlines stay in their original language (English). For the article itself, open a story and tap **Read the article in my language** for a translated copy.
- Push notifications arrive in each person's own language.
- Translations live in [`js/i18n-main.js`](js/i18n-main.js) (news site) and [`js/i18n-kids.js`](js/i18n-kids.js) (kids corner). Each row reads `[English, Arabic, German, Tagalog]`, so fixing a word means editing one line. `node tools/i18n-check.mjs main` (or `kids`) lists anything still missing.

## The look

kerNEl is black and white, with Liquid Glass inspired by iOS and macOS. Glass bars blur and bend whatever scrolls underneath them, a soft shine follows your finger or mouse, and things move with springy, bouncy animations.

- **Tab bar at the bottom**: a rounded glass bar with 📰 News · 🎮 Play · 💬 Chat · 🧸 Kids · 👤 Me. The highlight stretches like a drop of liquid when you switch tabs, and the bar shrinks to icons while you scroll. codme sits in its own glass bubble next to it. kerNEl remembers the last tab you used.
  - **Play**: Daily Quiz, Popcorn Battle, Real or Fake?, the weekly tournament, Hot Take of the Day and the Time Machine.
  - **Me**: your profile, friends, achievements, the leaderboard and settings (theme, sound, chaos mode, notifications, language, account).
- **Light and dark mode**: white and black. It follows your device until you pick one.
- **The reader**: tapping a headline opens the story inside kerNEl in a clean sheet (on phones it slides up from the bottom):
  - the picture, the headline and the publisher's own description;
  - a quick summary (**TL;DR** or **Explain like I'm 10**) that can be read aloud;
  - your reaction (🔥 😂 🤯 🥱);
  - the comments.

  **Continue reading** opens the original article.
- **Reactions**: tap ☺ on any story for the iMessage-style reaction bubble. Comments get reactions too (❤️ 😂 🔥 👍 🤯 😮), and everyone sees the counts.
- The glass "lens" effect (the bending) needs Chrome, Edge or another Chromium browser. Safari and Firefox get frosted glass.
- **kerNEl Kids keeps its bright colours** on purpose, because it's for kids.

## What's on the news site

- 🔴 **Live news that refreshes every 30 seconds** from Hacker News, DEV, The Verge, TechCrunch, Ars Technica, Engadget and Wired, with real thumbnails.
- 🤖 **codme**, the news-sniffing robot: finds any story ("SpaceX in 2023"), explains tech words, summarises the day, tells jokes, takes voice input.
- 🧠 **Explain like I'm 10 / ⚡ TL;DR** on every story, right in the reader. With an AI key on the server it's written by Claude in your language; without one, codme's quick explainer uses the headline, the publisher's summary and the glossary.
- 🧠 **Daily Kernel Quiz**: 5 questions made from today's headlines (fill the missing word, which section, who published it, which got more upvotes, spot codme's fake). One go per day, with a daily board.
- ⚔️ **Quiz Duels**: challenge a friend (from the Play tab, their profile card or the ⚔️ button in a chat) to 5 questions from today's news, 15 seconds each. You each play your turn when you like; the best score wins and the faster player wins a tie. The challenge arrives as a card in Messages. Winner +30 XP, loser +10, draw +15. After 48 hours, whoever played wins. Three wins unlock the ⚔️ Duel blade hat.
- 📺 **kerNEl Live**: a trivia show every day at 12:00 and 18:00 UTC (shown in your own time). The lobby opens 10 minutes before. Then 10 questions, 12 seconds each, everyone at the same time; one wrong answer and you're out. After each question you see how many picked each answer. The last kernels standing win +60 XP and the 🎤 mic hat, and everyone who joined gets +15. With notifications on, kerNEl reminds you before the show.
- 🔮 **Predictions**: every day kerNEl asks "Will this story reach N upvotes by tomorrow?" about two rising Hacker News stories, and checks the answer itself. Moderators can post their own questions (2 to 4 answers) and settle them. Right calls earn +15 XP; five unlock the 🔮 crystal ball hat.
- 🏅 **Seasons**: every month is a season with its own leaderboard (the 🏆 board has an "All time / This season" switch). When the month ends, the top 3 get +200, +100 and +50 XP, a season medal on their profile card and the Season legend frame.
- 🔔 **Follow companies and topics** (Apple, SpaceX, Rust… or anything you type) on the Me tab, from "Trending now" and "Popular" suggestions, or with one tap in the reader. Followed topics fill your ⭐ For You feed, get spots in your Morning Drop, and send up to 3 alerts a day when they show up in fresh stories.
- ☀️ **Morning Drop**: the 5 stories to know today, picked for you (your topics first, then the day's biggest stories, never more than 2 from one section). Open it from the News tab any time, or pick an hour on the Me tab to get it every day as a notification, in your own time.
- 🕰️ **"How we got here"** in the reader: earlier Hacker News stories about the same thing, newest first, so you can see how a story developed.
- 📈 **Story Stocks**: a pretend weekly market. Everyone gets 1,000 🪙 each week to buy and sell 16 companies whose prices follow how much the news talks about them (updated hourly). The top 3 portfolios win XP and the 📈 hat. Just a game, not real stock prices.
- 🎯 **Tech Bingo**: a new 5×5 card every week, different for everyone, with squares like "a rocket launch" or "a hack or data leak". Squares fill in by themselves when a matching headline appears; a line, three lines and a full card pay XP and 🃏 card packs.
- 🔤 **Emoji Headlines** and 🌫️ **Blur Reveal**: daily guessing games — pick the story from emojis, or from a photo that slowly un-blurs. Faster right answers score more, with a daily board; a perfect game earns a card pack.
- 🃏 **kerNEl Cards**: 36 collectible cards in 4 sets (Retro Gadgets, Space Tech, AI & Robots, Code Legends), each with a fun fact. A free pack of 3 every day, bonus packs for bingo lines, duel wins, right predictions and perfect guessing games. Gift or trade your doubles — offers arrive as cards in Messages. One full set unlocks the 🃏 Card shark hat, all four the Master collector frame.
- 🍿 **Popcorn Battle**: two of today's hottest stories go head to head. Yesterday's winner becomes the 🏆 **Story of the Day**.
- 🕵️ **Real or Fake?** plus a **weekly tournament**: the same 8 headlines for everyone, one go, and the top 3 win 🏆 trophies on Monday (shown on their profile card).
- 🗨️ **Story comments** in the reader, with reactions, @mentions, a swear filter, reporting (3 reports hide a comment) and mutes.
- 👯 **Friends**: follow people from their profile card, see their streak flames and a feed of their rank-ups, achievements, quiz scores and trophies. They get a notification when you follow them.
- ✉️ **Messages**: private one-to-one chats, in the Chat tab next to the rooms.
  - People you don't follow land in **Message requests**. They can send up to 3 messages until you accept, and they can't see that you've read anything until then.
  - **Seen ✓✓**, reactions (double-tap a message for ❤️), delete your own messages, and **🔥 message streaks** when you both write every day.
  - **Send a story to a friend** from the reader. It arrives as a card that opens in their reader.
  - Block, report (which also blocks) and "delete chat". Settings has **Who can message me**: everyone, only people I follow, or nobody.
  - New messages can send a push notification, with their own on/off switch.
  - ✍️ **"typing…"** shows in the chat header and as bouncing dots, in private chats and groups.
  - 🎙️ **Voice notes** up to 30 seconds: tap the mic, watch the level meter, send. They play in the chat with a waveform, seeking and 1× / 1.5× / 2× speed.
- 👥 **Group chats** for up to 32 kernels: pick a name and an emoji, add people (only people who take messages from you), react, share stories and voice notes, see "Seen by". Anyone can add people or rename the group; the creator can remove people, and the oldest member takes over if they leave. Mute a group to keep it off your badge. New members only see what's sent after they join. Three reports hide a message, and moderators see every report.
- 🫧 **Pops**: 24-hour posts for the people who follow you, in a row of rings at the top of Messages (and on profile cards). Pop some text on a colourful background, a photo (shrunk in the browser), or a kerNEl story straight from the reader (🫧 button). The full-screen viewer has tap-to-skip, hold-to-pause, emoji reactions and replies that land in Messages. You see who viewed your pops. Three reports hide a pop.
- 🔍 **Find people**: search by name or @username on the Me tab or in Messages, with suggestions (people who follow you, the most active kernels). Follow or message right from the results.
- 📷 **Profile photos**: pick a photo from your gallery or camera, then drag and zoom to crop it to a circle. It's shrunk to a small JPEG in the browser before upload and shows everywhere your avatar does: chat, comments, leaderboard, profile cards. Photos are public, and 3 reports from different people take one down.
- 🎟️ **Invite links**: on the Me tab, copy or share your link (`…/#join=yourname`). When a friend signs up with it, you both get +50 XP. One invite unlocks the 🎟️ VIP ticket hat, five unlock the Ambassador frame, and new kernels get the 🥳 Party hat.
- 🛡️ **Moderator tools** (only for the usernames in `ADMINS`, see below), under Me → Settings:
  - Today's numbers.
  - Every report: chat messages, comments, conversations (with the reported person's last few messages) and photos.
  - Hide or bring back posts, remove photos, mute (1 day or 1 week) or ban (1 week or 1 year) someone, look anyone up.
  - A log of every action.
- 🔒 **Privacy page** ([`privacy.html`](privacy.html)) in all four languages, linked from the footer, Settings and sign-up.
- 🪪 **Profile cards** now show a short **bio**, 🟢 **Active now** (or when someone was last around) and "Follows you". They have Message, **Share profile** (a link like `#@username`), Block and Report photo buttons.
- 🎩 **Hats and frames** for your avatar, unlocked with XP (and a Champion look for trophy winners). They show in chat, comments, the leaderboard and on profile cards, next to a 🔥 streak flame.
- 🎁 **kerNEl Wrapped**: a shareable picture of your stats, your "news vibe" and favourite section.
- 🎧 **Daily audio briefing**: the top 5 stories read aloud, with pause and skip.
- 📱 **Swipe mode**: one story at a time. Swipe up for the next one, right to save, left to skip, double-tap for 🔥.
- 📼 **Tech Time Machine**: the biggest tech story on this day, every year back to 2007.
- 💬 **kerNEl Chat** rooms, 🗳️ **Hot Take of the Day**, 🔔 **notifications** (also when kerNEl is closed), 📲 **installable app**, 🏆 **leaderboard**, 🔥 **streaks** and 🏅 **29 achievements**.
- 🔐 **Accounts with a username and password** (no email). Everything is saved to the account: XP, saved stories, reactions, achievements, streak, theme, language, kids' stars.
- 🎉 The fun extras are still there: chaos mode, popcorn rain, the doomscroll meter, keyboard shortcuts (`/` search, `r` refresh, `c` codme, `t` chat, `q` quiz, `s` swipe) and the Konami code.

## 🧸 kerNEl Kids

Nine mini-games that teach how tech works: inside a computer · binary light bulbs · program-the-robot · pixel painter · internet packets · password monster · online-safety superhero · tech word cards · the big quiz. Plus:

- 🔁 **Robot loops**: levels 4–6 add a *Repeat* block and a "repeat my whole program" loop, with a limit on how many blocks you may use.
- 📰 **Kid News**: three upbeat tech stories from this week, picked by the server with a strict filter (no crime, politics, money talk or scary words), explained in kid language.
- 👪 **Grown-ups dashboard** (behind a little times-table question): stars per adventure, robot level, minutes played this week, what to try next, conversation starters, and a print button.
- Stars, badges, a printable certificate and 🔊 read-aloud in the chosen language.

---

## 1. Publish it on GitHub Pages

1. Push this code to GitHub (it's already in this repository).
2. On GitHub, open the repository's **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Pick the branch that has these files (for example `main` after you merge, or the current branch) and the **`/ (root)`** folder, then click **Save**.
5. After a minute or two the site is live at:
   **`https://moaaz0911911.github.io/Tech-kernel-/`**

The news, codme and kids section work right away. Sign-in needs the one-time setup below.

> Running locally: `python3 -m http.server 8000`, then open <http://localhost:8000>. Opening `index.html` by double-clicking won't work, because browsers block modules and sign-in on `file://` pages.

### Prefer a single file?

[`dist/index.html`](dist/index.html) is the **whole site in one HTML file**, with every stylesheet and script inlined and the kids corner built in at `#kids`. You can double-click it, or upload just that file to a repository as `index.html`. In that version, the server address (`apiBase`) goes in the `CONFIG` block near the top of its `<script>`. Rebuild it after editing the source files with `node tools/build-single-file.mjs`.

---

## 2. Accounts and the kerNEl server

Accounts (username + password), synced progress, the leaderboard, streaks, shared reactions, real thumbnails and AI codme all run on the small free server in [`backend/`](backend/), a Cloudflare Worker. **It's live at https://kernel-api.tech-kernel.workers.dev** and the site is already connected to it:

```js
apiBase: 'https://kernel-api.tech-kernel.workers.dev',
```

That's `js/config.js` for the multi-file site, or the `CONFIG` block in the single-file `index.html`. Until `apiBase` is set, the site still shows the news and kids corner; the sign-in window explains that accounts aren't switched on yet, and progress is kept in the visitor's browser.

**How accounts work**
- **Sign up:** pick a username (checked live), a password with a strength meter, and choose whether to appear on the leaderboard. No email.
- **Recovery code:** right after sign-up you get a one-time code like `K7QX2-9MZPA-…` to copy or download. It's the only way to reset a forgotten password, so the "Continue" button stays locked until you tick "I saved it".
- **Your progress follows you:** sign in on another phone or laptop and everything is there. Anything you did as a guest before signing up is carried into the new account.
- **Account & security** (in your avatar menu): change password (other devices get signed out), make a new recovery code, or delete the account and all its data.

**Security**
- Passwords are hashed on the server with PBKDF2-SHA256 and a random salt. Only the hash is stored, never the password.
- Session tokens and recovery codes are stored as hashes too.
- Login attempts are rate-limited per visitor and per username, and so are sign-ups.
- Wrong usernames and wrong passwords get the same message, so nobody can probe which usernames exist.
- The site must be served over **https** (GitHub Pages is) so passwords are encrypted on the way.

**Moderators**
- Put your kerNEl username(s) in `ADMINS` in [`backend/wrangler.toml`](backend/wrangler.toml), for example `ADMINS = "yourname"` (comma-separated for more than one), then deploy the server again.
- After that, **🛡️ Moderator tools** shows up under Me → Settings and in your avatar menu.

## 3. How the news works

| Source | How | How often |
|---|---|---|
| Hacker News front page and newest stories | [HN Algolia API](https://hn.algolia.com/api) | every 30 s |
| DEV Community top posts of the day | [DEV API](https://developers.forem.com/api) | every 60 s |
| The Verge, TechCrunch, Ars Technica, Engadget | RSS through [rss2json.com](https://rss2json.com) | every 5 min |

- With the kerNEl server switched on (it is), the server collects all eight sources (including Wired) every 5 minutes, adds real thumbnails, and the site asks it for news every 30 seconds. If the server is ever down, the browser falls back to fetching the sources in this table itself.
- Polling pauses while the tab is hidden and catches up as soon as you come back.
- Stories are de-duplicated by URL, auto-sorted into categories (AI, Gadgets, Gaming, Security, Space, Dev, Science, Money), and cached so the page loads instantly next time.
- If a source is down, the **Source health** panel shows it "napping" 🔴 and the rest keep working. You can switch sources on or off in `js/config.js`.
- Every headline links to the original publisher.

**codme** has two brains. Its built-in brain runs in your browser: it works out what you're asking (topic, time range like "today" or "in 2023", "hot" vs "latest", in any of the four languages), searches the live feed with typo-tolerant matching, and searches the Hacker News archive through Algolia for anything older or rarer. If the site owner adds an Anthropic API key to the server (see [`backend/README.md`](backend/README.md)), codme and the 🧠 explainers also use Claude, which answers in your language and cites kerNEl's stories. The key stays on the server, never in the website.

---

## 4. Use your own domain (like kernel.news)

GitHub Pages works with a domain you own. The domain itself costs money (usually $10–15 a year from a registrar such as Cloudflare, Namecheap or Porkbun); everything else is free.

1. **Buy the domain** at a registrar.
2. **Point it at GitHub:** in the registrar's DNS settings, add
   - for a subdomain like `www.your-domain.com`: a **CNAME** record `www` → `moaaz0911911.github.io`
   - for the bare domain `your-domain.com`: four **A** records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. **Tell GitHub:** repository **Settings → Pages → Custom domain**, type the domain, click **Save**. GitHub adds a `CNAME` file to the branch for you. Wait for the DNS check to turn green (minutes to a few hours), then tick **Enforce HTTPS**.
4. **Tell the kerNEl server it's allowed:** in [`backend/wrangler.toml`](backend/wrangler.toml), add the new address to `ALLOWED_ORIGINS`, separated by a comma, and redeploy:
   ```toml
   ALLOWED_ORIGINS = "https://moaaz0911911.github.io,https://www.your-domain.com"
   ```
   Without this step the site loads, but sign-in, chat and the games can't reach the server.

Accounts are tied to the server, not the address, so everyone keeps their progress after the move. Things saved only in a browser (a guest's XP, the language choice) stay with the old address.

## 5. Files

```
index.html        main news site
privacy.html      what kerNEl stores and how to delete it (4 languages)
kids.html         kerNEl Kids
404.html          "this kernel never popped"
css/main.css      main styles (black/white Liquid Glass, dark/light, chaos mode, phones, right-to-left)
css/kids.css      kids styles (+ print styles for the certificate)
js/config.js      ← your settings: refresh time, server address (apiBase), sources
js/app.js         main page: rendering, refresh loop, saving, XP, dialogs
js/tabs.js        the glass tab bar (News · Play · Chat · Kids · Me) and the Liquid Glass shine
js/reader.js      the in-app reader: description, summary, reactions, comments
js/icons.js       the line icons
js/i18n.js        languages: picking one, t() lookups, right-to-left, translated dates
js/i18n-main.js   ← translations for the news site [English, Arabic, German, Tagalog]
js/i18n-kids.js   ← translations for kerNEl Kids
js/play.js        Daily Quiz, Popcorn Battle, weekly tournament
js/arena.js       ⚔️ Quiz Duels, 📺 kerNEl Live, 🔮 Predictions, 🏅 season board
js/social.js      story comments (+ reactions on comments), friends + activity feed
js/mod.js         🛡️ moderator tools
js/invite.js      🎟️ invite links and the invite widget
js/dm.js          ✉️ Messages (requests, Seen, reactions, streaks, shared stories, groups, typing, voice notes) + 🔍 people search
js/groups.js      👥 new-group and group-settings dialogs
js/pops.js        🫧 the pops row, full-screen viewer and composer
js/voice.js       🎙️ voice note recorder and player
js/discover.js    🔔 followed topics, ☀️ Morning Drop, 🕰️ reader timelines
js/stocks.js      📈 Story Stocks
js/bingo.js       🎯 Tech Bingo
js/guess.js       🔤 Emoji Headlines + 🌫️ Blur Reveal
js/cards.js       🃏 packs, collection, gifts and trades (cards-ui.js draws a card, cards-data.js lists them)
js/emoji.js       the emoji dictionary (shared with the server)
js/photo.js       📷 profile photo picker and circle cropper
js/extras.js      Explain/TL;DR, audio briefing, Time Machine, swipe mode, Wrapped
js/look.js        avatars with hats, frames and streak flames
js/cosmetics.js   the hats and frames (shared with the server)
js/fakes.js       codme's made-up headlines (shared with the server)
js/community.js   chat, Hot Take poll, profile cards
js/notify.js      notifications + installable app
js/game.js        Real or Fake?
js/news.js        fetching, categorising, de-duplicating, searching
js/auth.js        accounts: sign up / in, recovery codes, password changes, sessions
js/codme.js       the codme chat robot
js/kids.js        the nine kids adventures, kid news, grown-ups dashboard
js/fun.js         sound effects, confetti, popcorn rain, Konami code
js/content.js     jokes, fun facts, glossary, emoji dictionary
js/utils.js       helpers (escaping, storage, toasts, JWT decoding)
assets/           icons
sw.js             offline cache + push notifications
tools/            single-file builder, translation checker
backend/          the kerNEl server (Cloudflare Worker)
.nojekyll         tells GitHub Pages to serve files as-is
```

Made with 🍿 and way too many puns.
