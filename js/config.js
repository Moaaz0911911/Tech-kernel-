/**
 * kerNEl configuration.
 *
 * To switch on REAL "Sign in with Google" and "Sign in with Apple",
 * paste your IDs below. Step-by-step guide: README.md → "Turn on Google & Apple sign-in".
 * These IDs are public identifiers (not secrets), so it is safe to commit them.
 */
export const CONFIG = {
  // How often the news refreshes, in seconds.
  refreshSeconds: 30,

  // Your kerNEl backend (Cloudflare Worker) — see backend/README.md.
  // e.g. "https://kernel-api.YOUR-NAME.workers.dev". Leave empty to run without a backend.
  // With it: synced accounts, shared reactions, real thumbnails, more reliable news and codme AI.
  apiBase: '',

  auth: {
    google: {
      // Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)
      // Looks like: "1234567890-abc123def456.apps.googleusercontent.com"
      clientId: '',
    },
    apple: {
      // developer.apple.com → Identifiers → Services IDs. Looks like: "com.yourname.kernel.web"
      clientId: '',
      // Must EXACTLY match a "Return URL" registered on that Services ID,
      // e.g. "https://YOUR-USERNAME.github.io/YOUR-REPO/".
      // Leave empty to use this page's own address automatically.
      redirectURI: '',
    },
  },

  // Turn news sources on/off.
  sources: {
    hackerNewsFront: true, // Hacker News front page (via the Algolia HN API)
    hackerNewsFresh: true, // Brand-new HN stories that already have a few upvotes
    devTo: true,           // Top DEV Community posts of the day
    rssFeeds: true,        // The Verge, TechCrunch, Ars Technica, Engadget (via rss2json.com, refreshed every 5 min)
  },
};
