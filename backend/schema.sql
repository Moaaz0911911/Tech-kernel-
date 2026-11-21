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
  updated       INTEGER NOT NULL,
  pending_xp    INTEGER NOT NULL DEFAULT 0,   -- XP the server gave (invites, duels, live shows…) waiting for the browser to collect
  stats         TEXT NOT NULL DEFAULT '{}',   -- JSON counters that unlock hats/frames: invites, liveWins, prophet, duelsWon, seasonWins
  banned_until  INTEGER,                      -- set by a moderator
  invited_by    TEXT,
  season        TEXT,                         -- the month their season_xp belongs to (YYYY-MM)
  season_xp     INTEGER NOT NULL DEFAULT 0
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

-- ---------- community ----------
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room       TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  nickname   TEXT,
  avatar     TEXT,
  rank_emoji TEXT,
  text       TEXT NOT NULL,
  stories    TEXT NOT NULL DEFAULT '[]',  -- JSON: shared story cards
  bot        INTEGER NOT NULL DEFAULT 0,
  reactions  TEXT NOT NULL DEFAULT '{}',  -- JSON: emoji -> count
  reports    INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,  -- deleted by its author, or hidden after 3 reports
  created    INTEGER NOT NULL,
  updated    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_room_updated ON chat_messages (room, updated);
CREATE INDEX IF NOT EXISTS chat_user ON chat_messages (user_id, created);

CREATE TABLE IF NOT EXISTS chat_reacts (
  msg_id  INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  emoji   TEXT NOT NULL,
  PRIMARY KEY (msg_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_reports (
  msg_id  INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (msg_id, user_id)
);

CREATE TABLE IF NOT EXISTS mutes (
  user_id TEXT PRIMARY KEY,
  until   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY,
  room    TEXT NOT NULL,
  at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  day     TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option  INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
);

-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL                          -- e.g. the VAPID key pair, made on first use
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,               -- one row per browser/device
  user_id  TEXT NOT NULL,
  p256dh   TEXT NOT NULL,
  auth     TEXT NOT NULL,
  created  INTEGER NOT NULL,
  fails    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_user ON push_subs (user_id);

CREATE TABLE IF NOT EXISTS notify_prefs (
  user_id         TEXT PRIMARY KEY,
  mentions        INTEGER NOT NULL DEFAULT 1,
  news            INTEGER NOT NULL DEFAULT 1,
  streak          INTEGER NOT NULL DEFAULT 1,
  friends         INTEGER NOT NULL DEFAULT 1, -- follows, friends' rank-ups, trophies
  dms             INTEGER NOT NULL DEFAULT 1, -- direct messages
  games           INTEGER NOT NULL DEFAULT 1, -- kerNEl Live reminders, duel challenges
  tz              INTEGER NOT NULL DEFAULT 0, -- minutes east of UTC
  news_day        TEXT,
  news_today      INTEGER NOT NULL DEFAULT 0,
  last_streak_day TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind    TEXT NOT NULL,                   -- mentions | news | streak
  title   TEXT NOT NULL,
  body    TEXT,
  url     TEXT,
  icon    TEXT,
  created INTEGER NOT NULL,
  read    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications (user_id, id);

CREATE TABLE IF NOT EXISTS alerted_stories (
  key TEXT PRIMARY KEY,
  at  INTEGER NOT NULL
);

-- ---------------- story comments ----------------
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  story_key  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  nickname   TEXT,
  avatar     TEXT,
  text       TEXT NOT NULL,
  reports    INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_story ON comments (story_key, id);
CREATE INDEX IF NOT EXISTS comments_user ON comments (user_id);
CREATE TABLE IF NOT EXISTS comment_reports (
  comment_id INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

-- ---------------- friends ----------------
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  followee_id TEXT NOT NULL,
  created     INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee_id);
CREATE TABLE IF NOT EXISTS activity (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  TEXT NOT NULL,
  kind     TEXT NOT NULL,                 -- rank | badge | quiz | tourney | trophy | streak
  data     TEXT,
  created  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_user ON activity (user_id, id);

-- ---------------- games ----------------
CREATE TABLE IF NOT EXISTS quiz_scores (
  day      TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  started  INTEGER,
  score    INTEGER,                       -- NULL until answered (one go per day)
  ms       INTEGER,
  answers  TEXT,
  at       INTEGER,
  PRIMARY KEY (day, user_id)
);
CREATE TABLE IF NOT EXISTS battle_votes (
  day      TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  pick     TEXT NOT NULL,                 -- 'a' | 'b'
  at       INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
);
CREATE TABLE IF NOT EXISTS tourney_scores (
  week     TEXT NOT NULL,                 -- Monday's date
  user_id  TEXT NOT NULL,
  score    INTEGER NOT NULL,
  answers  TEXT,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, user_id)
);
CREATE TABLE IF NOT EXISTS trophies (
  user_id  TEXT NOT NULL,
  week     TEXT NOT NULL,
  place    INTEGER NOT NULL,
  score    INTEGER,
  PRIMARY KEY (user_id, week)
);
CREATE TABLE IF NOT EXISTS comment_reacts (
  comment_id INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

-- ✉️ direct messages: one thread per pair of people, a member row each (accepted = 0 means it's still a message request)
CREATE TABLE IF NOT EXISTS dm_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pair        TEXT NOT NULL UNIQUE,          -- "<smaller id>|<bigger id>"
  created     INTEGER NOT NULL,
  last_id     INTEGER NOT NULL DEFAULT 0,
  last_at     INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,    -- days in a row both people messaged
  streak_day  TEXT
);
CREATE TABLE IF NOT EXISTS dm_members (
  thread_id   INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  other_id    TEXT NOT NULL,
  accepted    INTEGER NOT NULL DEFAULT 1,
  read_id     INTEGER NOT NULL DEFAULT 0,    -- last message this person has seen
  hidden      INTEGER NOT NULL DEFAULT 0,    -- "delete chat" (comes back if a new message arrives)
  sent_day    TEXT,                          -- last day this person sent something (for the streak)
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS dm_members_user ON dm_members (user_id);
CREATE TABLE IF NOT EXISTS dm_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  story       TEXT,                          -- JSON of a shared kerNEl story
  reacts      TEXT NOT NULL DEFAULT '{}',    -- JSON: { user id: emoji }
  duel        INTEGER,                       -- a ⚔️ Quiz Duel challenge card
  deleted     INTEGER NOT NULL DEFAULT 0,
  created     INTEGER NOT NULL,
  updated     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dm_messages_thread ON dm_messages (thread_id, id);
CREATE INDEX IF NOT EXISTS dm_messages_updated ON dm_messages (thread_id, updated);
CREATE TABLE IF NOT EXISTS dm_reports (
  reporter_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,                 -- who was reported
  msg_id      INTEGER,
  at          INTEGER NOT NULL,
  evidence    TEXT,                          -- the reported person's last few messages, for moderators
  PRIMARY KEY (reporter_id, user_id)
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  TEXT NOT NULL,
  blocked_id  TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked ON blocks (blocked_id);

-- 📷 profile photos (small JPEG/PNG/WebP, resized in the browser), stored as base64
CREATE TABLE IF NOT EXISTS photos (
  user_id     TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  type        TEXT NOT NULL,
  updated     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS photo_reports (
  owner_id    TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (owner_id, reporter_id)
);

-- 🎟️ invites: who brought whom
CREATE TABLE IF NOT EXISTS invites (
  invitee_id  TEXT PRIMARY KEY,
  inviter_id  TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invites_inviter ON invites (inviter_id, at);

-- 🛡️ what moderators did, and when
CREATE TABLE IF NOT EXISTS mod_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  note        TEXT,
  at          INTEGER NOT NULL
);

-- ⚔️ Quiz Duels
CREATE TABLE IF NOT EXISTS duels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  a           TEXT NOT NULL,                 -- challenger
  b           TEXT NOT NULL,                 -- opponent
  quiz        TEXT NOT NULL,                 -- JSON questions (with answers)
  a_started INTEGER, a_answers TEXT, a_score INTEGER, a_ms INTEGER,
  b_started INTEGER, b_answers TEXT, b_score INTEGER, b_ms INTEGER,
  status      TEXT NOT NULL DEFAULT 'open',  -- open | done | expired
  winner      TEXT,                          -- user id or 'draw'
  thread_id   INTEGER,
  created     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS duels_a ON duels (a, id);
CREATE INDEX IF NOT EXISTS duels_b ON duels (b, id);

-- 📺 kerNEl Live
CREATE TABLE IF NOT EXISTS live_players (
  slot        TEXT NOT NULL,                 -- e.g. 2026-11-21T18
  user_id     TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (slot, user_id)
);
CREATE TABLE IF NOT EXISTS live_answers (
  slot        TEXT NOT NULL,
  q           INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  choice      INTEGER NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (slot, q, user_id)
);

-- 🔮 Predictions
CREATE TABLE IF NOT EXISTS predictions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question    TEXT NOT NULL,
  options     TEXT NOT NULL,                 -- JSON array
  kind        TEXT NOT NULL,                 -- 'upvotes' (automatic) | 'mod'
  story_key   TEXT,
  data        TEXT NOT NULL DEFAULT '{}',
  closes      INTEGER NOT NULL,
  resolves    INTEGER NOT NULL,
  answer      INTEGER,
  resolved    INTEGER,
  created_by  TEXT,
  created     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prediction_votes (
  pred_id     INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  choice      INTEGER NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (pred_id, user_id)
);

-- 🏅 Seasons
CREATE TABLE IF NOT EXISTS season_winners (
  season      TEXT NOT NULL,
  place       INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  xp          INTEGER,
  PRIMARY KEY (season, place)
);
