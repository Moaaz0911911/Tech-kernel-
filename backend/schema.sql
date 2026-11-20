-- kerNEl backend database (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS stories (
  key           TEXT PRIMARY KEY,         -- normalised URL (same key the website uses)
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  comments_url  TEXT,
  source        TEXT,
  source_id     TEXT,
  source_emoji  TEXT,
  author        TEXT,
  time          INTEGER NOT NULL,         -- published, ms since epoch
  points        INTEGER NOT NULL DEFAULT 0,
  comments      INTEGER NOT NULL DEFAULT 0,
  image         TEXT,
  image_checked INTEGER NOT NULL DEFAULT 0,
  summary       TEXT,
  cat           TEXT,
  domain        TEXT,
  first_seen    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_time ON stories (time DESC);
CREATE INDEX IF NOT EXISTS stories_needs_image ON stories (image_checked, time DESC);

CREATE TABLE IF NOT EXISTS source_status (
  id      TEXT PRIMARY KEY,
  name    TEXT,
  emoji   TEXT,
  ok      INTEGER NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL,
  error   TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,             -- random id, e.g. "u_3f9a…"
  username      TEXT NOT NULL,                -- as the person typed it (shown on the leaderboard)
  username_lc   TEXT NOT NULL UNIQUE,         -- lower-case, for unique look-ups
  pass_hash     TEXT NOT NULL,                -- "pbkdf2-sha256$<iterations>$<salt>$<hash>" — never the password itself
  recovery_hash TEXT,                         -- SHA-256 of the one-time recovery code
  profile       TEXT NOT NULL DEFAULT '{}',   -- JSON: nickname, avatar, topics, leaderboard
  data          TEXT NOT NULL DEFAULT '{}',   -- JSON: xp, read, saved, reactions, badges, settings, kids …
  xp            INTEGER NOT NULL DEFAULT 0,   -- copy of data.xp for the leaderboard
  on_board      INTEGER NOT NULL DEFAULT 1,   -- 1 = show on the leaderboard
  streak        INTEGER NOT NULL DEFAULT 0,
  best_streak   INTEGER NOT NULL DEFAULT 0,
  last_day      TEXT,                         -- last check-in day (UTC, YYYY-MM-DD)
  created       INTEGER NOT NULL,
  updated       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_board ON users (on_board, xp DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,              -- SHA-256 of the bearer token (the token itself is never stored)
  user_id    TEXT NOT NULL,
  created    INTEGER NOT NULL,
  expires    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS reactions (
  story_key TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  emoji     TEXT NOT NULL,                  -- fire | lol | mind | meh
  at        INTEGER NOT NULL,
  PRIMARY KEY (story_key, user_id)
);
CREATE INDEX IF NOT EXISTS reactions_story ON reactions (story_key);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count  INTEGER NOT NULL,
  reset  INTEGER NOT NULL
);
