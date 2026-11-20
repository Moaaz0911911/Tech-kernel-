# 🍿 kerNEl — tech news, freshly popped

**kerNEl** is a loud, funny, IGN-style tech news site that runs entirely on **GitHub Pages**. No server or build step is needed; it's plain HTML, CSS and JavaScript.

- 🔴 **Live news that refreshes every 30 seconds.** Hacker News, DEV Community, The Verge, TechCrunch, Ars Technica and Engadget, merged and de-duplicated. A popcorn-kernel countdown in the header "pops" on every refresh, and new stories get a 🍿 *JUST POPPED* sticker.
- 🤖 **codme**, a chat robot with googly eyes that follow your cursor. It finds specific news ("OpenAI this week", "SpaceX in 2023", "what's hot in gaming?"), explains tech words ("what is an API?"), summarises the day, tells jokes, and accepts voice input in Chrome and Edge. It searches the live feed **and** the full Hacker News archive.
- 🔐 **Sign in / sign up with Google or Apple** using the official Google Identity Services and Sign in with Apple JS libraries. New users get an onboarding "name tag" (nickname, avatar, favourite topics), which powers a ⭐ *For You* feed.
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

[`dist/index.html`](dist/index.html) is the **whole site in one HTML file**, with every stylesheet and script inlined and the kids corner built in at `#kids`. You can double-click it, or upload just that file to a repository as `index.html`. In that version, sign-in IDs go in the `CONFIG` block near the top of its `<script>`. Rebuild it after editing the source files with `node tools/build-single-file.mjs`.

---

## 2. Turn on Google & Apple sign-in

The site uses the official libraries, but **Google and Apple only allow sign-in from apps you have registered with them**. Registering gives you a public ID (not a secret) that you paste into [`js/config.js`](js/config.js). Until you do that, the buttons show a friendly "setup needed" note.

### Google (free, about 5 minutes)

1. Go to <https://console.cloud.google.com/> and create a project, for example "kerNEl".
2. Open **Google Auth Platform** (called *APIs & Services → OAuth consent screen* in older consoles):
   - **Branding:** app name `kerNEl`, your support email.
   - **Audience:** *External*. Click **Publish app** so anyone can sign in, not just test users. The basic scopes kerNEl uses (name, email, photo) don't need Google's review.
3. Go to **Clients → Create client** (or *Credentials → Create credentials → OAuth client ID*):
   - **Application type:** *Web application*
   - **Authorized JavaScript origins:** `https://moaaz0911911.github.io`
     (for local testing, also add `http://localhost` and `http://localhost:8000`)
   - You do **not** need a redirect URI.
4. Copy the **Client ID**. It looks like `1234567890-abc123.apps.googleusercontent.com`.
5. Paste it into `js/config.js`:
   ```js
   google: { clientId: '1234567890-abc123.apps.googleusercontent.com' },
   ```
6. Commit and push. Google can take a few minutes to recognise a new origin.

### Apple (needs a paid Apple Developer Program membership)

Sign in with Apple on the web is only available to members of the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).

1. At <https://developer.apple.com/account/resources/identifiers/list>, click **➕ → App IDs → App**. Give it a description and a bundle ID such as `com.yourname.kernel`, tick **Sign In with Apple**, then **Register**.
2. Click **➕ → Services IDs**, description `kerNEl Web`, identifier `com.yourname.kernel.web`, then **Register**.
3. Open that Services ID, tick **Sign In with Apple**, then click **Configure**:
   - **Primary App ID:** the App ID from step 1
   - **Domains and Subdomains:** `moaaz0911911.github.io`
   - **Return URLs:** `https://moaaz0911911.github.io/Tech-kernel-/` (the trailing slash matters)
   - Click **Save → Continue → Save**.
4. Paste the Services ID into `js/config.js`:
   ```js
   apple: { clientId: 'com.yourname.kernel.web', redirectURI: '' },
   ```
   Leave `redirectURI` empty and the site uses its own address automatically. If you set it, it must **exactly** match the Return URL from step 3.
5. Commit and push, then test on the live `https://` site. Apple doesn't accept `localhost`.

> If Apple's portal asks you to *verify* the domain with a file, that file has to be served from `https://moaaz0911911.github.io/.well-known/…`. That means it goes in a separate repository named `moaaz0911911.github.io`, or you can use a custom domain for this site.

### How sign-in works (and what it doesn't do)

- **Google:** Google renders its own official button. After you pick an account, Google hands the page a signed **ID token** (a JWT).
- **Apple:** a popup opens on apple.com. After you approve, Apple hands the page a signed ID token too. Apple only sends your name the **first** time, so kerNEl saves it then. Users can choose "Hide my email", in which case you'll see a `@privaterelay.appleid.com` address.
- kerNEl checks each token's **issuer, audience (your ID), expiry and anti-replay nonce/state**, then creates a profile. *Sign up* and *sign in* are the same tap: the first sign-in creates the account, opens the name-tag onboarding, and carries over any guest XP and saved stories.
- GitHub Pages has no server, so profiles, XP and saved stories live in **that browser's localStorage**. They don't sync between devices. If you add a backend later, send the ID token to it and **verify the token's signature there** before trusting it.

---

## 2½. Optional backend: synced accounts, shared reactions, real thumbnails, codme AI

The [`backend/`](backend/) folder is a free Cloudflare Worker that adds cross-device accounts, public reaction counts, real article thumbnails, a more reliable news feed, and an AI-powered codme. Setup steps are in [`backend/README.md`](backend/README.md). When it's running, put its URL in `apiBase` in the config. Without it, the site works exactly as described below.

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
js/config.js      ← your settings: refresh time, Google/Apple IDs, sources
js/app.js         main page: rendering, refresh loop, saving, XP, dialogs
js/news.js        fetching, categorising, de-duplicating, searching
js/auth.js        Google Identity Services + Sign in with Apple JS
js/codme.js       the codme chat robot
js/kids.js        the nine kids adventures
js/fun.js         sound effects, confetti, popcorn rain, Konami code
js/content.js     jokes, fun facts, glossary, emoji dictionary
js/utils.js       helpers (escaping, storage, toasts, JWT decoding)
assets/favicon.svg
.nojekyll         tells GitHub Pages to serve files as-is
```

Made with 🍿 and way too many puns.
