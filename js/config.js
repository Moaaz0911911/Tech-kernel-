/**
 * kerNEl configuration.
 */
export const CONFIG = {
  // How often the news refreshes, in seconds.
  refreshSeconds: 30,

  // Your kerNEl server (the Cloudflare Worker in backend/ — see backend/README.md),
  // e.g. "https://kernel-api.YOUR-NAME.workers.dev".
  // Needed for accounts (username + password) and saving progress, shared reactions,
  // real thumbnails, the leaderboard and AI codme. Without it, the site still shows news.
  apiBase: 'https://kernel-api.tech-kernel.workers.dev',

  // Turn news sources on/off (used when the server isn't set or is down).
  sources: {
    hackerNewsFront: true, // Hacker News front page (via the Algolia HN API)
    hackerNewsFresh: true, // Brand-new HN stories that already have a few upvotes
    devTo: true,           // Top DEV Community posts of the day
    rssFeeds: true,        // The Verge, TechCrunch, Ars Technica, Engadget (via rss2json.com, refreshed every 5 min)
  },
};
