// kerNEl social: story comments, following friends, the friends' activity feed, avatar looks.
import { HttpError } from './util.js';
import { cleanText } from './community.js';
import { notify } from './push.js';
import { tr, langOfProfile, RANK_NAMES } from './i18n.js';
import { HATS, FRAMES, hatById, frameById, unlocked } from '../../js/cosmetics.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
export const RANKS = [[0, '🌽'], [50, '♨️'], [150, '🔥'], [300, '🍿'], [600, '🧈'], [1000, '👑'], [2000, '🌌']];
export const rankIndex = (xp) => { let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++; return i; };
const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
/** A streak only counts while it's alive (visited today or yesterday). */
export const liveStreak = (u) => (u.last_day && u.last_day >= yesterday() ? u.streak || 0 : 0);

/** The public look of a person: avatar, hat and frame. */
export function look(profileJson) {
  const p = typeof profileJson === 'string' ? parse(profileJson, {}) : profileJson || {};
  return { avatar: p.avatar || '🍿', hat: hatById(p.hat).emoji || '', frame: frameById(p.frame).id, photo: p.photo || '' };
}

/** Check a requested hat/frame against what the person has unlocked. */
export function cleanLook(p, prev, stats) {
  const pickOk = (list, id, fallback) => {
    const item = list.find((x) => x.id === id);
    return item && unlocked(item, stats) ? item.id : fallback;
  };
  const prevHat = pickOk(HATS, prev.hat, 'none');
  const prevFrame = pickOk(FRAMES, prev.frame, 'none');
  return {
    hat: p && 'hat' in p ? pickOk(HATS, p.hat, prevHat) : prevHat,
    frame: p && 'frame' in p ? pickOk(FRAMES, p.frame, prevFrame) : prevFrame,
  };
}

export async function trophyCount(env, userId) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM trophies WHERE user_id = ?').bind(userId).first();
  return r?.n || 0;
}

const personRow = (r) => {
  const p = parse(r.profile, {});
  return { username: r.username, nickname: p.nickname || r.username, ...look(p), xp: r.xp || 0, rank: RANKS[rankIndex(r.xp || 0)][1], streak: liveStreak(r) };
};

// ---------------- story comments ----------------
export const COMMENT_REACTS = ['❤️', '😂', '🔥', '👍', '🤯', '😮'];

/** Reaction counts (and the viewer's own reaction) for a list of comments. */
async function commentReactions(env, ids, me) {
  const counts = {};
  const mine = {};
  if (!ids.length) return { counts, mine };
  const marks = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT comment_id, emoji, COUNT(*) AS n FROM comment_reacts WHERE comment_id IN (${marks}) GROUP BY comment_id, emoji`).bind(...ids).all();
  for (const r of results) (counts[r.comment_id] ||= {})[r.emoji] = r.n;
  if (me) {
    const { results: own } = await env.DB.prepare(`SELECT comment_id, emoji FROM comment_reacts WHERE user_id = ? AND comment_id IN (${marks})`).bind(me.id, ...ids).all();
    for (const r of own) mine[r.comment_id] = r.emoji;
  }
  return { counts, mine };
}

function toComment(r, me, reacts = { counts: {}, mine: {} }) {
  const l = look(r.u_profile || '{}');
  return {
    id: r.id, key: r.story_key, text: r.hidden ? '' : r.text, hidden: !!r.hidden, created: r.created, mine: !!me && r.user_id === me.id,
    reactions: reacts.counts[r.id] || {}, myReaction: reacts.mine[r.id] || null,
    user: { username: r.username, nickname: r.nickname || r.username, avatar: l.avatar || r.avatar, hat: l.hat, frame: l.frame, photo: l.photo, streak: r.u_last ? liveStreak({ streak: r.u_streak, last_day: r.u_last }) : 0 },
  };
}

export async function listComments(env, user, key) {
  const k = String(key || '').slice(0, 300);
  if (!k) throw new HttpError(400, 'Missing story');
  const { results } = await env.DB.prepare(`SELECT c.*, u.profile AS u_profile, u.streak AS u_streak, u.last_day AS u_last FROM comments c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.story_key = ? AND c.hidden = 0 ORDER BY c.id DESC LIMIT 100`).bind(k).all();
  const reacts = await commentReactions(env, results.map((r) => r.id), user);
  return { key: k, items: results.reverse().map((r) => toComment(r, user, reacts)), count: results.length };
}

export async function postComment(env, user, body, ctx) {
  const key = String(body.key || '').slice(0, 300);
  const story = key && await env.DB.prepare('SELECT key, title FROM stories WHERE key = ?').bind(key).first();
  if (!story) throw new HttpError(404, 'That story isn’t on kerNEl any more');
  const text = cleanText(body.text).slice(0, 400);
  if (!text) throw new HttpError(400, 'Say something first!');
  const p = parse(user.profile, {});
  const row = await env.DB.prepare(`INSERT INTO comments (story_key, user_id, username, nickname, avatar, text, reports, hidden, created)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?) RETURNING *`).bind(key, user.id, user.username, (p.nickname || user.username).slice(0, 24), p.avatar || '🍿', text, Date.now()).first();
  const job = notifyCommentMentions(env, user, text, story).catch((e) => console.error('comment mentions', e));
  if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
  return { comment: toComment({ ...row, u_profile: user.profile, u_streak: user.streak, u_last: user.last_day }, user) };
}

async function notifyCommentMentions(env, author, text, story) {
  const names = [...new Set((text.match(/(?:^|\s)@([A-Za-z0-9_]{3,20})\b/g) || []).map((m) => m.trim().slice(1).toLowerCase()))]
    .filter((n) => n !== author.username.toLowerCase()).slice(0, 5);
  if (!names.length) return 0;
  const { results } = await env.DB.prepare(`SELECT id, profile FROM users WHERE username_lc IN (${names.map(() => '?').join(',')})`).bind(...names).all();
  const budget = { left: 15 };
  for (const u of results) {
    await notify(env, u.id, { kind: 'mentions', title: tr(langOfProfile(u.profile), 'commentMention', { who: author.username }), body: `${story.title.slice(0, 80)} — ${text.slice(0, 120)}`, url: `./#story=${encodeURIComponent(story.key)}`, tag: 'comment', icon: '🗨️' }, budget);
  }
  return results.length;
}

export async function reactComment(env, user, body) {
  const id = Number(body.id);
  const emoji = body.emoji == null ? null : String(body.emoji);
  if (emoji && !COMMENT_REACTS.includes(emoji)) throw new HttpError(400, 'Unknown reaction');
  const c = await env.DB.prepare('SELECT id FROM comments WHERE id = ? AND hidden = 0').bind(id).first();
  if (!c) throw new HttpError(404, 'Comment not found');
  if (emoji) await env.DB.prepare('INSERT OR REPLACE INTO comment_reacts (comment_id, user_id, emoji) VALUES (?, ?, ?)').bind(id, user.id, emoji).run();
  else await env.DB.prepare('DELETE FROM comment_reacts WHERE comment_id = ? AND user_id = ?').bind(id, user.id).run();
  const r = await commentReactions(env, [id], user);
  return { id, reactions: r.counts[id] || {}, myReaction: r.mine[id] || null };
}

export async function deleteComment(env, user, id) {
  const c = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(Number(id)).first();
  if (!c) throw new HttpError(404, 'Comment not found');
  if (c.user_id !== user.id) throw new HttpError(403, 'You can only delete your own comments');
  await env.DB.prepare("UPDATE comments SET hidden = 1, text = '' WHERE id = ?").bind(Number(id)).run();
  return { ok: true };
}

export async function reportComment(env, user, body) {
  const id = Number(body.id);
  const c = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
  if (!c) throw new HttpError(404, 'Comment not found');
  if (c.user_id === user.id) throw new HttpError(400, 'You can delete your own comment instead');
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO comment_reports (comment_id, user_id, at) VALUES (?, ?, ?) RETURNING comment_id').bind(id, user.id, Date.now()).first();
  if (!fresh) return { ok: true, already: true };
  const reports = c.reports + 1;
  const hidden = reports >= 3 ? 1 : c.hidden;
  await env.DB.prepare('UPDATE comments SET reports = ?, hidden = ? WHERE id = ?').bind(reports, hidden, id).run();
  return { ok: true, hidden: !!hidden };
}

export async function commentCounts(env, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT story_key, COUNT(*) AS n FROM comments WHERE hidden = 0 AND story_key IN (${chunk.map(() => '?').join(',')}) GROUP BY story_key`).bind(...chunk).all();
    for (const r of results) out[r.story_key] = r.n;
  }
  return out;
}

// ---------------- following ----------------
export async function follow(env, user, body) {
  const name = String(body.username || '').toLowerCase();
  const target = await env.DB.prepare('SELECT id, username, profile FROM users WHERE username_lc = ?').bind(name).first();
  if (!target) throw new HttpError(404, 'No kernel by that name');
  if (target.id === user.id) throw new HttpError(400, 'You can’t follow yourself (but we love the confidence)');
  if (body.follow === false) {
    await env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').bind(user.id, target.id).run();
  } else {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?').bind(user.id).first();
    if ((n?.n || 0) >= 500) throw new HttpError(400, 'You already follow 500 kernels — that’s the limit');
    const fresh = await env.DB.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created) VALUES (?, ?, ?) RETURNING follower_id').bind(user.id, target.id, Date.now()).first();
    if (fresh) {
      const lang = langOfProfile(target.profile);
      await notify(env, target.id, { kind: 'friends', title: tr(lang, 'followTitle', { who: user.username }), body: tr(lang, 'followBody'), url: `./#user=${user.username}`, tag: 'follow', icon: '👋' }, { left: 5 });
    }
  }
  return { username: target.username, ...(await followCounts(env, target.id)), isFollowing: body.follow !== false };
}

export async function followCounts(env, userId) {
  const r = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers, (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following').bind(userId, userId).first();
  return { followers: r?.followers || 0, following: r?.following || 0 };
}

export async function isFollowing(env, viewer, userId) {
  if (!viewer) return false;
  return !!(await env.DB.prepare('SELECT 1 AS y FROM follows WHERE follower_id = ? AND followee_id = ?').bind(viewer.id, userId).first());
}

/** People I follow (with live streaks) and what they've been up to. */
export async function friends(env, user) {
  const { results: people } = await env.DB.prepare(`SELECT u.id, u.username, u.profile, u.xp, u.streak, u.last_day FROM follows f JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id = ? ORDER BY u.xp DESC LIMIT 200`).bind(user.id).all();
  const ids = people.map((p) => p.id);
  let activity = [];
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT a.id, a.kind, a.data, a.created, u.username, u.profile, u.xp, u.streak, u.last_day FROM activity a JOIN users u ON u.id = a.user_id
      WHERE a.user_id IN (${ids.slice(0, 90).map(() => '?').join(',')}) AND a.created > ? ORDER BY a.id DESC LIMIT 40`).bind(...ids.slice(0, 90), Date.now() - 14 * 864e5).all();
    activity = results.map((r) => ({ id: r.id, kind: r.kind, data: parse(r.data, {}), created: r.created, user: personRow(r) }));
  }
  const counts = await followCounts(env, user.id);
  return { followers: counts.followers, following: people.map(personRow), activity };
}

// ---------------- activity (what friends see) ----------------
/** Record things worth cheering for, and ping followers about the big ones. */
export async function recordActivity(env, user, events) {
  if (!events.length) return 0;
  const now = Date.now();
  await env.DB.batch(events.map((e) => env.DB.prepare('INSERT INTO activity (user_id, kind, data, created) VALUES (?, ?, ?, ?)').bind(user.id, e.kind, JSON.stringify(e.data || {}), now)));
  const loud = events.filter((e) => e.push);
  if (!loud.length) return 0;
  const { results: fans } = await env.DB.prepare(`SELECT u.id, u.profile FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? LIMIT 40`).bind(user.id).all();
  const budget = { left: 15 };
  let sent = 0;
  for (const fan of fans) {
    const lang = langOfProfile(fan.profile);
    for (const e of loud) {
      const n = e.kind === 'rank'
        ? { title: tr(lang, 'friendRank', { who: user.username, emoji: RANKS[e.data.rank][1], rank: RANK_NAMES[lang][e.data.rank] }), body: tr(lang, 'friendRankBody') }
        : { title: tr(lang, 'friendStreak', { who: user.username, n: e.data.n }), body: tr(lang, 'friendStreakBody') };
      sent += await notify(env, fan.id, { kind: 'friends', ...n, url: `./#user=${user.username}`, tag: `friend-${user.username}`, icon: '👯' }, budget);
    }
  }
  return sent;
}

/** Compare a person's data before and after a save, and describe what changed. */
export function activityFromData(prev, next) {
  const events = [];
  const before = rankIndex(prev.xp || 0);
  const after = rankIndex(next.xp || 0);
  if (after > before) events.push({ kind: 'rank', data: { rank: after }, push: true });
  const had = prev.badges || {};
  for (const id of Object.keys(next.badges || {})) if (!had[id]) events.push({ kind: 'badge', data: { id } });
  return events.slice(0, 10);
}

export const STREAK_MILESTONES = new Set([3, 7, 14, 30, 50, 100, 365]);
