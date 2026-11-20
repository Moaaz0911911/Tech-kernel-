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
  id        TEXT PRIMARY KEY,               -- "google:<sub>" or "apple:<sub>"
  provider  TEXT NOT NULL,
  email     TEXT,
  name      TEXT,
  picture   TEXT,
  profile   TEXT NOT NULL DEFAULT '{}',     -- JSON: nickname, avatar, topics
  data      TEXT NOT NULL DEFAULT '{}',     -- JSON: xp, read, saved, reactions, konami
  created   INTEGER NOT NULL,
  updated   INTEGER NOT NULL
);

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
