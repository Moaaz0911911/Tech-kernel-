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
- 🍿 **Popcorn Battle**: two of today's hottest stories go head to head. Yesterday's winner becomes the 🏆 **Story of the Day**.
- 🕵️ **Real or Fake?** plus a **weekly tournament**: the same 8 headlines for everyone, one go, and the top 3 win 🏆 trophies on Monday (shown on their profile card).
- 🗨️ **Story comments** in the reader, with reactions, @mentions, a swear filter, reporting (3 reports hide a comment) and mutes.
- 👯 **Friends**: follow people from their profile card, see their streak flames and a feed of their rank-ups, achievements, quiz scores and trophies. They get a notification when you follow them.
- 🎩 **Hats and frames** for your avatar, unlocked with XP (and a Champion look for trophy winners). They show in chat, comments, the leaderboard and on profile cards, next to a 🔥 streak flame.
- 🎁 **kerNEl Wrapped**: a shareable picture of your stats, your "news vibe" and favourite section.
- 🎧 **Daily audio briefing**: the top 5 stories read aloud, with pause and skip.
- 📱 **Swipe mode**: one story at a time. Swipe up for the next one, right to save, left to skip, double-tap for 🔥.
- 📼 **Tech Time Machine**: the biggest tech story on this day, every year back to 2007.
- 💬 **kerNEl Chat** rooms, 🗳️ **Hot Take of the Day**, 🔔 **notifications** (also when kerNEl is closed), 📲 **installable app**, 🏆 **leaderboard**, 🔥 **streaks** and 🏅 **26 achievements**.
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
js/social.js      story comments (+ reactions on comments), friends + activity feed
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
