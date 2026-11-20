# 🍿 kerNEl — tech news, freshly popped

**kerNEl** is a loud, funny, IGN-style tech news site that runs entirely on **GitHub Pages**. No server or build step is needed; it's plain HTML, CSS and JavaScript.

- 🔴 **Live news that refreshes every 30 seconds.** Hacker News, DEV Community, The Verge, TechCrunch, Ars Technica and Engadget, merged and de-duplicated. A popcorn-kernel countdown in the header "pops" on every refresh, and new stories get a 🍿 *JUST POPPED* sticker.
- 🤖 **codme**, a chat robot with googly eyes that follow your cursor. It finds specific news ("OpenAI this week", "SpaceX in 2023", "what's hot in gaming?"), explains tech words ("what is an API?"), summarises the day, tells jokes, and accepts voice input in Chrome and Edge. It searches the live feed **and** the full Hacker News archive.
- 🔐 **Accounts with a username and password**, no email or Google/Apple needed. Everything is saved to the account and follows you to every device: XP and rank, saved stories, reactions, achievements, daily streak, theme and sound settings, and the kids' stars. Forgot your password? The **recovery code** you got at sign-up resets it.
- 💬 **kerNEl Chat:** live chat rooms (Lobby, AI, Gaming, Dev, Off-topic) for signed-in users, with an online count, @mentions, emoji reactions and sharing news stories as cards. Ask **@codme** in a room and the bot answers everyone. Built-in safety: a swear filter, flood limits, a report button (3 reports hides a message; repeat offenders are muted for 24 hours), and deleting your own messages. Chat history is kept for 30 days.
- 🔔 **Notifications, even when kerNEl is closed** (Web Push): someone @mentions you in chat, big breaking news in your favourite topics (max 3 a day), or a 7 pm reminder before your streak breaks. Everything also lands in the 🔔 inbox. On iPhone/iPad, add kerNEl to the Home Screen first (Share → Add to Home Screen); that's Apple's rule for web notifications.
- 📲 **Installable app:** add kerNEl to your home screen and it opens like a real app with its own icon. It even loads offline with the last news it saw.
- 🕵️ **Real or Fake?:** a game with five headlines, some real stories from today's feed and some absurd fakes invented by codme. Fakes are always revealed and never name real companies or people.
- 🗳️ **Hot Take of the Day:** a daily tech poll with live results.
- 👤 **Profile cards:** tap any name in the chat or on the leaderboard.
- 🏆 **Leaderboard, 🔥 daily streaks and 🏅 16 achievements** (you can hide yourself from the leaderboard).
- 🧸 **kerNEl Kids**: nine mini-games that teach kids how tech works, with stars, badges and a printable certificate:
  inside a computer · binary light bulbs · program-the-robot maze · pixel painter · how internet packets travel · password monster · online-safety superhero quiz · tech word flip cards · big tech quiz. It also has a 🔊 "Read to me" option.
- 🎉 **Funny extras:** category filters, hot/newest/🎲 chaos sorting, emoji reactions, *Emoji TL;DR* 🪄, saved "popcorn bucket", XP and ranks (Unpopped Kernel → Popcorn Overlord), Hype-o-meter trending words, a source-health panel, a doomscroll meter ("you've scrolled 3.2 giraffes"), 🌀 chaos mode, dark/light themes, sound effects, keyboard shortcuts (`/` search, `r` refresh, `c` codme) and a Konami-code easter egg.

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

- Everything is fetched by the visitor's browser. Polling pauses while the tab is hidden and catches up as soon as you come back.
- Stories are de-duplicated by URL, auto-sorted into categories (AI, Gadgets, Gaming, Security, Space, Dev, Science, Money), and cached so the page loads instantly next time.
- If a source is down, the **Source health** panel shows it "napping" 🔴 and the rest keep working. You can switch sources on or off in `js/config.js`.
- Every headline links to the original publisher.

**codme** isn't a cloud LLM; it runs entirely in your browser. It works out what you're asking (topic, time range like "today" or "in 2023", "hot" vs "latest"), searches the live feed with typo-tolerant matching, and searches the Hacker News archive through Algolia for anything older or rarer. Because nothing is sent to an AI service, there's no API key to leak and nothing to pay for.

---

## 4. Files

```
index.html        main news site
kids.html         kerNEl Kids
404.html          "this kernel never popped"
css/main.css      main styles (dark/light, chaos mode, responsive)
css/kids.css      kids styles (+ print styles for the certificate)
js/config.js      ← your settings: refresh time, server address (apiBase), sources
js/app.js         main page: rendering, refresh loop, saving, XP, dialogs
js/news.js        fetching, categorising, de-duplicating, searching
js/auth.js        accounts: sign up / in, recovery codes, password changes, sessions
js/codme.js       the codme chat robot
js/kids.js        the nine kids adventures
js/fun.js         sound effects, confetti, popcorn rain, Konami code
js/content.js     jokes, fun facts, glossary, emoji dictionary
js/utils.js       helpers (escaping, storage, toasts, JWT decoding)
assets/favicon.svg
.nojekyll         tells GitHub Pages to serve files as-is
```

Made with 🍿 and way too many puns.
