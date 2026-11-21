// kerNEl people: ✉️ direct messages (with message requests), 🔍 finding people, 📷 profile photos and 🚫 blocking.
import { HttpError, throttle } from './util.js';
import { cleanText, assertNotMuted } from './community.js';
import { look, liveStreak, RANKS, rankIndex } from './social.js';
import { rowToStory } from './news.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';
import { saveVoice, dropVoice, typingIn, setTypingIn } from './media.js';
import { tradesByIds } from './cards.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const ACTIVE_MS = 5 * 60_000;
export const DM_REACTS = ['❤️', '😂', '🔥', '👍', '😮', '😢'];
const MAX_REQUEST_MESSAGES = 3;   // what you can send before they accept your request
const day = (offset = 0) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const pairOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const marks = (list) => list.map(() => '?').join(',');

// ---------------- people ----------------
/** A person as other people see them. */
export function person(r, extra = {}) {
  const p = parse(r.profile, {});
  return {
    username: r.username, nickname: p.nickname || r.username, ...look(p), bio: p.bio || '',
    xp: r.xp || 0, rank: RANKS[rankIndex(r.xp || 0)][1], streak: liveStreak(r), ...extra,
  };
}

/** When people were last around (any page that polls: chat, messages). */
export async function lastSeen(env, ids) {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT user_id, at FROM presence WHERE user_id IN (${marks(ids)})`).bind(...ids).all();
  return Object.fromEntries(results.map((r) => [r.user_id, r.at]));
}
export const activeFields = (at) => ({ active: !!at && Date.now() - at < ACTIVE_MS, lastActive: at && Date.now() - at < 864e5 ? at : null });

export async function touch(env, user) {
  if (!throttle(`presence:${user.id}:dm`, 60_000)) return;
  await env.DB.prepare('INSERT OR REPLACE INTO presence (user_id, room, at) VALUES (?, ?, ?)').bind(user.id, 'dm', Date.now()).run();
}

async function blockState(env, me, otherId) {
  if (!me) return { iBlocked: false, blockedMe: false };
  const { results } = await env.DB.prepare('SELECT blocker_id FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').bind(me.id, otherId, otherId, me.id).all();
  return { iBlocked: results.some((r) => r.blocker_id === me.id), blockedMe: results.some((r) => r.blocker_id === otherId) };
}

const follows = async (env, from, to) => !!(await env.DB.prepare('SELECT 1 AS y FROM follows WHERE follower_id = ? AND followee_id = ?').bind(from, to).first());

/** Extra profile-card facts for the viewer: bio, active, follows you, blocked, can you message them. */
export async function relation(env, viewer, r) {
  const p = parse(r.profile, {});
  const seen = (await lastSeen(env, [r.id]))[r.id];
  const base = { bio: p.bio || '', ...activeFields(seen) };
  if (!viewer || viewer.id === r.id) return { ...base, followsYou: false, blocked: false, canMessage: false };
  const b = await blockState(env, viewer, r.id);
  const followsYou = await follows(env, r.id, viewer.id);
  const thread = await env.DB.prepare('SELECT id FROM dm_threads WHERE pair = ?').bind(pairOf(viewer.id, r.id)).first();
  const setting = p.dms || 'everyone';
  const canMessage = !b.iBlocked && !b.blockedMe && (!!thread || setting === 'everyone' || (setting === 'following' && followsYou));
  return { ...base, followsYou, blocked: b.iBlocked, canMessage };
}

// ---------------- 🔍 search ----------------
export async function searchPeople(env, viewer, q) {
  const query = String(q || '').trim().replace(/^@+/, '').toLowerCase().slice(0, 24);
  const hiddenFrom = viewer
    ? (await env.DB.prepare('SELECT blocker_id FROM blocks WHERE blocked_id = ?').bind(viewer.id).all()).results.map((r) => r.blocker_id)
    : [];
  let rows;
  if (!query) { // suggestions: people who follow you that you don't follow back, then the most active kernels
    const back = viewer ? (await env.DB.prepare(`SELECT u.id, u.username, u.profile, u.xp, u.streak, u.last_day FROM follows f JOIN users u ON u.id = f.follower_id
      WHERE f.followee_id = ? AND f.follower_id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?) ORDER BY f.created DESC LIMIT 6`).bind(viewer.id, viewer.id).all()).results : [];
    const { results: top } = await env.DB.prepare(`SELECT id, username, profile, xp, streak, last_day FROM users WHERE on_board = 1 ORDER BY xp DESC LIMIT 20`).all();
    const seen = new Set();
    rows = [...back, ...top].filter((r) => !seen.has(r.id) && seen.add(r.id)).filter((r) => !viewer || r.id !== viewer.id);
    if (viewer) {
      const { results: mine } = await env.DB.prepare('SELECT followee_id FROM follows WHERE follower_id = ?').bind(viewer.id).all();
      const following = new Set(mine.map((m) => m.followee_id));
      rows = rows.filter((r) => !following.has(r.id) || back.includes(r));
    }
    rows = rows.slice(0, 12);
  } else {
    const esc = query.replace(/[\\%_]/g, '\\$&');
    ({ results: rows } = await env.DB.prepare(`SELECT id, username, profile, xp, streak, last_day FROM users
      WHERE username_lc LIKE ? ESCAPE '\\' OR lower(json_extract(profile, '$.nickname')) LIKE ? ESCAPE '\\'
      ORDER BY CASE WHEN username_lc = ? THEN 0 WHEN username_lc LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, xp DESC LIMIT 25`)
      .bind(`%${esc}%`, `%${esc}%`, query, `${esc}%`).all());
  }
  rows = rows.filter((r) => !hiddenFrom.includes(r.id)).slice(0, 20);
  const ids = rows.map((r) => r.id);
  const seen = await lastSeen(env, ids);
  let following = new Set(), followers = new Set(), blocked = new Set();
  if (viewer && ids.length) {
    following = new Set((await env.DB.prepare(`SELECT followee_id AS id FROM follows WHERE follower_id = ? AND followee_id IN (${marks(ids)})`).bind(viewer.id, ...ids).all()).results.map((r) => r.id));
    followers = new Set((await env.DB.prepare(`SELECT follower_id AS id FROM follows WHERE followee_id = ? AND follower_id IN (${marks(ids)})`).bind(viewer.id, ...ids).all()).results.map((r) => r.id));
    blocked = new Set((await env.DB.prepare(`SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? AND blocked_id IN (${marks(ids)})`).bind(viewer.id, ...ids).all()).results.map((r) => r.id));
  }
  return {
    q: query,
    people: rows.map((r) => person(r, {
      me: !!viewer && r.id === viewer.id, isFollowing: following.has(r.id), followsYou: followers.has(r.id), blocked: blocked.has(r.id), ...activeFields(seen[r.id]),
    })),
  };
}

// ---------------- 🚫 blocking ----------------
export async function setBlock(env, user, body) {
  const target = await env.DB.prepare('SELECT id, username FROM users WHERE username_lc = ?').bind(String(body.username || '').toLowerCase()).first();
  if (!target) throw new HttpError(404, 'No kernel by that name');
  if (target.id === user.id) throw new HttpError(400, 'You can’t block yourself');
  if (body.block === false) {
    await env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').bind(user.id, target.id).run();
    return { username: target.username, blocked: false };
  }
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, at) VALUES (?, ?, ?)').bind(user.id, target.id, Date.now()),
    env.DB.prepare('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)').bind(user.id, target.id, target.id, user.id),
    env.DB.prepare('UPDATE dm_members SET hidden = 1 WHERE user_id = ? AND other_id = ?').bind(user.id, target.id),
  ]);
  return { username: target.username, blocked: true };
}

export async function listBlocked(env, user) {
  const { results } = await env.DB.prepare('SELECT u.id, u.username, u.profile, u.xp, u.streak, u.last_day FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.at DESC LIMIT 200').bind(user.id).all();
  return { people: results.map((r) => person(r, { blocked: true })) };
}

// ---------------- ✉️ direct messages ----------------
function toDM(r, me) {
  const reacts = parse(r.reacts, {});
  const story = r.deleted ? null : parse(r.story, null);
  return {
    id: r.id, mine: r.user_id === me.id, text: r.deleted ? '' : r.text, story, deleted: !!r.deleted, duel: r.deleted ? null : r.duel || null,
    voice: r.deleted ? null : parse(r.voice, null), pop: r.deleted ? null : parse(r.pop, null), trade: r.deleted ? null : r.trade || null,
    myReact: reacts[me.id] || null, theirReact: Object.entries(reacts).find(([k]) => k !== me.id)?.[1] || null,
    created: r.created, updated: r.updated,
  };
}
const threadStreak = (t) => (t.streak_day && t.streak_day >= day(1) ? t.streak : 0);

export async function memberOf(env, user, threadId) {
  const m = await env.DB.prepare('SELECT * FROM dm_members WHERE thread_id = ? AND user_id = ?').bind(Number(threadId), user.id).first();
  if (!m) throw new HttpError(404, 'Conversation not found');
  return m;
}

export async function listThreads(env, user) {
  await touch(env, user);
  const { results: rows } = await env.DB.prepare(`SELECT t.*, m.accepted, m.read_id, o.accepted AS their_accepted, o.user_id AS other FROM dm_members m
    JOIN dm_threads t ON t.id = m.thread_id JOIN dm_members o ON o.thread_id = m.thread_id AND o.user_id = m.other_id
    WHERE m.user_id = ? AND m.hidden = 0 ORDER BY t.last_at DESC LIMIT 100`).bind(user.id).all();
  if (!rows.length) return { threads: [], unread: 0, requests: 0 };
  const otherIds = [...new Set(rows.map((r) => r.other))];
  const { results: people } = await env.DB.prepare(`SELECT id, username, profile, xp, streak, last_day FROM users WHERE id IN (${marks(otherIds)})`).bind(...otherIds).all();
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const seen = await lastSeen(env, otherIds);
  const lastIds = rows.map((r) => r.last_id);
  const { results: lasts } = await env.DB.prepare(`SELECT * FROM dm_messages WHERE id IN (${marks(lastIds)})`).bind(...lastIds).all();
  const lastBy = Object.fromEntries(lasts.map((l) => [l.thread_id, l]));
  const { results: unreadRows } = await env.DB.prepare(`SELECT d.thread_id, COUNT(*) AS n FROM dm_messages d JOIN dm_members m ON m.thread_id = d.thread_id AND m.user_id = ?
    WHERE d.user_id != ? AND d.id > m.read_id AND d.deleted = 0 GROUP BY d.thread_id`).bind(user.id, user.id).all();
  const unreadBy = Object.fromEntries(unreadRows.map((u) => [u.thread_id, u.n]));
  const threads = rows.filter((r) => byId[r.other]).map((r) => {
    const last = lastBy[r.id];
    return {
      id: r.id, other: person(byId[r.other], activeFields(seen[r.other])), streak: threadStreak(r), lastAt: r.last_at,
      last: last ? { text: last.deleted ? '' : last.text.slice(0, 120), story: !!last.story && !last.deleted, duel: !!last.duel && !last.deleted, trade: !!last.trade && !last.deleted, voice: !!last.voice && !last.deleted, pop: !!last.pop && !last.deleted, mine: last.user_id === user.id, deleted: !!last.deleted } : null,
      unread: unreadBy[r.id] || 0, request: !r.accepted, pending: !r.their_accepted,
    };
  });
  return {
    threads,
    unread: threads.filter((t) => !t.request).reduce((a, t) => a + t.unread, 0),
    requests: threads.filter((t) => t.request).length,
  };
}

/** Just the counts (for the dot on the Chat tab). */
export async function dmCounts(env, user) {
  const r = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM dm_messages d JOIN dm_members m ON m.thread_id = d.thread_id AND m.user_id = ?
        WHERE m.accepted = 1 AND m.hidden = 0 AND d.user_id != ? AND d.id > m.read_id AND d.deleted = 0) AS unread,
      (SELECT COUNT(*) FROM dm_members WHERE user_id = ? AND accepted = 0 AND hidden = 0) AS requests`).bind(user.id, user.id, user.id).first();
  return { unread: r?.unread || 0, requests: r?.requests || 0 };
}

export async function getThread(env, user, threadId, since = 0) {
  const me = await memberOf(env, user, threadId);
  await touch(env, user);
  const t = await env.DB.prepare('SELECT * FROM dm_threads WHERE id = ?').bind(me.thread_id).first();
  const them = await env.DB.prepare('SELECT * FROM dm_members WHERE thread_id = ? AND user_id = ?').bind(me.thread_id, me.other_id).first();
  const other = await env.DB.prepare('SELECT id, username, profile, xp, streak, last_day FROM users WHERE id = ?').bind(me.other_id).first();
  if (!other) throw new HttpError(404, 'Conversation not found');
  const now = Date.now();
  let rows;
  if (since > 0) ({ results: rows } = await env.DB.prepare('SELECT * FROM dm_messages WHERE thread_id = ? AND updated > ? ORDER BY id ASC LIMIT 200').bind(t.id, since).all());
  else { ({ results: rows } = await env.DB.prepare('SELECT * FROM dm_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 80').bind(t.id).all()); rows.reverse(); }
  if (me.accepted && t.last_id > me.read_id) await env.DB.prepare('UPDATE dm_members SET read_id = ? WHERE thread_id = ? AND user_id = ?').bind(t.last_id, t.id, user.id).run();
  const b = await blockState(env, user, other.id);
  const seen = await lastSeen(env, [other.id]);
  const typing = (await typingIn(env, `d:${t.id}`, user.id)).length > 0;
  const trades = await tradesByIds(env, rows.map((r) => r.trade));
  return {
    typing,
    trades,
    thread: {
      id: t.id, other: person(other, activeFields(seen[other.id])), streak: threadStreak(t),
      request: !me.accepted, pending: !them.accepted, blocked: b.iBlocked, blockedMe: b.blockedMe,
    },
    messages: rows.map((r) => toDM(r, user)),
    theirRead: them.read_id,
    now,
  };
}

/** Send a message (or share a story) — to a thread, or to a username (starts a conversation). */
export async function sendDM(env, user, body, ctx) {
  await assertNotMuted(env, user);
  let other;
  let t = null;
  if (body.thread) {
    const me = await memberOf(env, user, body.thread);
    other = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(me.other_id).first();
    t = await env.DB.prepare('SELECT * FROM dm_threads WHERE id = ?').bind(me.thread_id).first();
  } else {
    other = await env.DB.prepare('SELECT * FROM users WHERE username_lc = ?').bind(String(body.to || '').replace(/^@/, '').toLowerCase()).first();
    if (!other) throw new HttpError(404, 'No kernel by that name');
    if (other.id === user.id) throw new HttpError(400, 'You can’t message yourself (try your notes app 😉)');
    t = await env.DB.prepare('SELECT * FROM dm_threads WHERE pair = ?').bind(pairOf(user.id, other.id)).first();
  }
  if (!other) throw new HttpError(404, 'No kernel by that name');
  const b = await blockState(env, user, other.id);
  if (b.iBlocked) throw new HttpError(403, 'Unblock this kernel to message them');
  if (b.blockedMe) throw new HttpError(403, 'You can’t message this kernel');

  const text = cleanText(String(body.text ?? '').slice(0, 1000));
  let story = null;
  if (typeof body.storyKey === 'string' && body.storyKey) {
    const s = await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(body.storyKey.slice(0, 300)).first();
    if (s) { const x = rowToStory(s); story = { key: x.key, title: x.title, url: x.url, source: x.source, cat: x.cat, image: x.image, domain: x.domain, time: x.time }; }
  }
  let pop = null; // replying to one of their 🫧 pops
  if (body.pop) {
    const p = await env.DB.prepare('SELECT * FROM pops WHERE id = ? AND user_id = ? AND hidden = 0 AND expires > ?').bind(Number(body.pop), other.id, Date.now()).first();
    if (!p) throw new HttpError(404, 'That pop is gone');
    pop = { id: p.id, kind: p.kind, text: p.text.slice(0, 100), bg: p.bg, photo: p.photo_key || null, story: p.story ? parse(p.story, {})?.title || null : null, by: other.username };
  }
  const duel = Number(body.duel) || null; // a ⚔️ Quiz Duel challenge (created by arena.js for these two people)
  if (duel && !(await env.DB.prepare('SELECT 1 AS y FROM duels WHERE id = ? AND a = ? AND b = ?').bind(duel, user.id, other.id).first())) throw new HttpError(400, 'Unknown duel');
  const trade = Number(body.trade) || null; // a 🃏 card gift or trade (created by cards.js for these two people)
  if (trade && !(await env.DB.prepare('SELECT 1 AS y FROM card_trades WHERE id = ? AND from_id = ? AND to_id = ?').bind(trade, user.id, other.id).first())) throw new HttpError(400, 'Unknown trade');
  if (!text && !story && !duel && !trade && !body.voice) throw new HttpError(400, 'Say something first!');

  const theyFollowMe = await follows(env, other.id, user.id);
  const now = Date.now();
  let theirs;
  let first = false;
  if (!t) {
    const setting = parse(other.profile, {}).dms || 'everyone';
    if (setting === 'nobody') throw new HttpError(403, 'This kernel isn’t taking messages right now');
    if (setting === 'following' && !theyFollowMe) throw new HttpError(403, 'This kernel only takes messages from people they follow');
    t = await env.DB.prepare('INSERT INTO dm_threads (pair, created, last_id, last_at) VALUES (?, ?, 0, ?) ON CONFLICT(pair) DO UPDATE SET pair = pair RETURNING *').bind(pairOf(user.id, other.id), now, now).first();
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO dm_members (thread_id, user_id, other_id, accepted) VALUES (?, ?, ?, 1)').bind(t.id, user.id, other.id),
      env.DB.prepare('INSERT OR IGNORE INTO dm_members (thread_id, user_id, other_id, accepted) VALUES (?, ?, ?, ?)').bind(t.id, other.id, user.id, theyFollowMe ? 1 : 0),
    ]);
    first = true;
  }
  const mine = await env.DB.prepare('SELECT * FROM dm_members WHERE thread_id = ? AND user_id = ?').bind(t.id, user.id).first();
  theirs = await env.DB.prepare('SELECT * FROM dm_members WHERE thread_id = ? AND user_id = ?').bind(t.id, other.id).first();
  if (!theirs.accepted) { // still a request: a few messages, then wait
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM dm_messages WHERE thread_id = ? AND user_id = ? AND deleted = 0').bind(t.id, user.id).first();
    if ((n?.n || 0) >= MAX_REQUEST_MESSAGES) throw new HttpError(429, 'Wait until they accept your message request');
  }
  const voice = body.voice ? await saveVoice(env, user, `d:${t.id}`, body) : null;
  const msg = await env.DB.prepare('INSERT INTO dm_messages (thread_id, user_id, text, story, reacts, deleted, created, updated, duel, voice, pop, trade) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(t.id, user.id, text, story ? JSON.stringify(story) : null, '{}', now, now, duel, voice ? JSON.stringify(voice) : null, pop ? JSON.stringify(pop) : null, trade).first();

  // 🔥 streak: both people sent something today
  const today = day();
  let streak = t.streak;
  let streakDay = t.streak_day;
  if (theirs.sent_day === today && t.streak_day !== today) {
    streak = t.streak_day === day(1) ? t.streak + 1 : 1;
    streakDay = today;
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE dm_threads SET last_id = ?, last_at = ?, streak = ?, streak_day = ? WHERE id = ?').bind(msg.id, now, streak, streakDay, t.id),
    // replying to a request accepts it; sending marks everything as read; a "deleted" chat comes back
    env.DB.prepare('UPDATE dm_members SET accepted = 1, hidden = 0, read_id = ?, sent_day = ? WHERE thread_id = ? AND user_id = ?').bind(msg.id, today, t.id, user.id),
    env.DB.prepare('UPDATE dm_members SET hidden = 0 WHERE thread_id = ? AND user_id = ?').bind(t.id, other.id),
    env.DB.prepare('DELETE FROM typing WHERE scope = ? AND user_id = ?').bind(`d:${t.id}`, user.id),
  ]);

  const job = (async () => {
    const lang = langOfProfile(other.profile);
    const preview = text || (story ? `📰 ${story.title}` : voice ? '🎙️' : '');
    if (trade) {
      const tr0 = await env.DB.prepare('SELECT want FROM card_trades WHERE id = ?').bind(trade).first();
      const k = tr0?.want ? 'cardTrade' : 'cardGift';
      await notify(env, other.id, { kind: 'games', title: tr(lang, k, { who: user.username }), body: tr(lang, `${k}Body`), url: `./#dm=${user.username}`, tag: `cards-${user.username}`, icon: '🃏' }, { left: 4 });
    } else if (duel) {
      await notify(env, other.id, { kind: 'games', title: tr(lang, 'duelChallenge', { who: user.username }), body: tr(lang, 'duelChallengeBody', { who: user.username }), url: `./#duel=${duel}`, tag: `duel-${duel}`, icon: '⚔️' }, { left: 4 });
    } else if (theirs.accepted) {
      await notify(env, other.id, { kind: 'dms', title: tr(lang, 'dmTitle', { who: user.username }), body: preview.slice(0, 160), url: `./#dm=${user.username}`, tag: `dm-${user.username}`, icon: '✉️' }, { left: 4 });
    } else if (first || !mine.sent_day) {
      await notify(env, other.id, { kind: 'dms', title: tr(lang, 'dmRequest', { who: user.username }), body: tr(lang, 'dmRequestBody'), url: `./#dm=${user.username}`, tag: `dmreq-${user.username}`, icon: '📨' }, { left: 4 });
    }
  })().catch((e) => console.error('dm push', e));
  if (ctx?.waitUntil) ctx.waitUntil(job); else await job;

  return { thread: t.id, message: toDM(msg, user), streak: threadStreak({ streak, streak_day: streakDay }), pending: !theirs.accepted };
}

export async function acceptThread(env, user, body) {
  const m = await memberOf(env, user, body.thread);
  const t = await env.DB.prepare('SELECT last_id FROM dm_threads WHERE id = ?').bind(m.thread_id).first();
  await env.DB.prepare('UPDATE dm_members SET accepted = 1, hidden = 0, read_id = ? WHERE thread_id = ? AND user_id = ?').bind(t.last_id, m.thread_id, user.id).run();
  return { ok: true };
}

export async function hideThread(env, user, body) {
  const m = await memberOf(env, user, body.thread);
  const t = await env.DB.prepare('SELECT last_id FROM dm_threads WHERE id = ?').bind(m.thread_id).first();
  await env.DB.prepare('UPDATE dm_members SET hidden = 1, read_id = ? WHERE thread_id = ? AND user_id = ?').bind(t.last_id, m.thread_id, user.id).run();
  return { ok: true };
}

export async function reactDM(env, user, body) {
  const msg = await env.DB.prepare('SELECT * FROM dm_messages WHERE id = ?').bind(Number(body.id)).first();
  if (!msg || msg.deleted) throw new HttpError(404, 'Message not found');
  await memberOf(env, user, msg.thread_id);
  const emoji = body.emoji == null ? null : String(body.emoji);
  if (emoji && !DM_REACTS.includes(emoji)) throw new HttpError(400, 'Unknown reaction');
  const reacts = parse(msg.reacts, {});
  if (emoji) reacts[user.id] = emoji; else delete reacts[user.id];
  const row = await env.DB.prepare('UPDATE dm_messages SET reacts = ?, updated = ? WHERE id = ? RETURNING *').bind(JSON.stringify(reacts), Date.now(), msg.id).first();
  return { message: toDM(row, user) };
}

export async function deleteDM(env, user, id) {
  const msg = await env.DB.prepare('SELECT * FROM dm_messages WHERE id = ?').bind(Number(id)).first();
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.user_id !== user.id) throw new HttpError(403, 'You can only delete your own messages');
  await env.DB.prepare("UPDATE dm_messages SET deleted = 1, text = '', story = NULL, voice = NULL, pop = NULL, reacts = '{}', updated = ? WHERE id = ?").bind(Date.now(), msg.id).run();
  await dropVoice(env, msg.voice);
  return { ok: true };
}

/** Report someone from a conversation: they're blocked for you, and three reports in a day mute them. */
export async function reportDM(env, user, body) {
  const m = await memberOf(env, user, body.thread);
  const now = Date.now();
  // moderators see what was reported: the reported person's last few messages in this chat
  const { results: last } = await env.DB.prepare('SELECT text, story, voice, created FROM dm_messages WHERE thread_id = ? AND user_id = ? AND deleted = 0 ORDER BY id DESC LIMIT 5').bind(m.thread_id, m.other_id).all();
  const evidence = last.reverse().map((x) => ({ text: x.text.slice(0, 300) || (x.voice ? '🎙️' : ''), story: x.story ? parse(x.story, {})?.title || null : null, at: x.created }));
  await env.DB.prepare('INSERT OR REPLACE INTO dm_reports (reporter_id, user_id, msg_id, at, evidence) VALUES (?, ?, ?, ?, ?)').bind(user.id, m.other_id, Number(body.id) || null, now, JSON.stringify(evidence)).run();
  const other = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(m.other_id).first();
  if (other) await setBlock(env, user, { username: other.username, block: true });
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM dm_reports WHERE user_id = ? AND at > ?').bind(m.other_id, now - 864e5).first();
  if ((n?.n || 0) >= 3) await env.DB.prepare('INSERT OR REPLACE INTO mutes (user_id, until) VALUES (?, ?)').bind(m.other_id, now + 864e5).run();
  return { ok: true, blocked: true };
}

export async function dmTyping(env, user, body) {
  const m = await memberOf(env, user, body.thread);
  await setTypingIn(env, user, `d:${m.thread_id}`, body.stop !== true);
  return { ok: true };
}

// ---------------- 📷 profile photos ----------------
const PHOTO_MAX = 300_000;
function photoBytes(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'That photo didn’t work — try a JPG or PNG');
  const bin = atob(m[2]);
  if (bin.length > PHOTO_MAX) throw new HttpError(413, 'That photo is too big');
  if (bin.length < 100) throw new HttpError(400, 'That photo didn’t work — try a JPG or PNG');
  const head = [...bin.slice(0, 12)].map((c) => c.charCodeAt(0));
  const ok = (m[1] === 'jpeg' && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    || (m[1] === 'png' && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    || (m[1] === 'webp' && bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WEBP');
  if (!ok) throw new HttpError(400, 'That photo didn’t work — try a JPG or PNG');
  return { type: `image/${m[1]}`, b64: m[2] };
}

async function saveProfile(env, user, profile) {
  await env.DB.prepare('UPDATE users SET profile = ?, updated = ? WHERE id = ?').bind(JSON.stringify(profile), Date.now(), user.id).run();
}

export async function setPhoto(env, user, body) {
  const { type, b64 } = photoBytes(body.data);
  const version = Date.now().toString(36);
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO photos (user_id, data, type, updated) VALUES (?, ?, ?, ?)').bind(user.id, b64, type, Date.now()),
    env.DB.prepare('DELETE FROM photo_reports WHERE owner_id = ?').bind(user.id),
  ]);
  const profile = { ...parse(user.profile, {}), photo: version };
  await saveProfile(env, user, profile);
  return { photo: version, profile };
}

export async function removePhoto(env, user) {
  await env.DB.prepare('DELETE FROM photos WHERE user_id = ?').bind(user.id).run();
  const profile = { ...parse(user.profile, {}) };
  delete profile.photo;
  await saveProfile(env, user, profile);
  return { photo: null, profile };
}

export async function photoResponse(env, username) {
  const r = await env.DB.prepare('SELECT p.data, p.type FROM photos p JOIN users u ON u.id = p.user_id WHERE u.username_lc = ?').bind(String(username).toLowerCase()).first();
  if (!r) throw new HttpError(404, 'No photo');
  const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': r.type, 'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Content-Security-Policy': "default-src 'none'",
    },
  });
}

/** Three different people reporting a photo takes it down. */
export async function reportPhoto(env, user, body) {
  const owner = await env.DB.prepare('SELECT * FROM users WHERE username_lc = ?').bind(String(body.username || '').toLowerCase()).first();
  if (!owner) throw new HttpError(404, 'No kernel by that name');
  if (owner.id === user.id) throw new HttpError(400, 'You can change your own photo instead');
  if (!parse(owner.profile, {}).photo) return { ok: true, removed: true };
  await env.DB.prepare('INSERT OR IGNORE INTO photo_reports (owner_id, reporter_id, at) VALUES (?, ?, ?)').bind(owner.id, user.id, Date.now()).run();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reports WHERE owner_id = ?').bind(owner.id).first();
  if ((n?.n || 0) >= 3) {
    await removePhoto(env, owner);
    await env.DB.prepare('DELETE FROM photo_reports WHERE owner_id = ?').bind(owner.id).run();
    return { ok: true, removed: true };
  }
  return { ok: true, removed: false };
}
