// 🫧 Pops: 24-hour posts — a text card, a photo or a kerNEl story — for the people who follow you.
// Viewers are recorded (the author sees who looked), you can react, and replies go to Messages.
import { HttpError } from './util.js';
import { cleanText } from './community.js';
import { rowToStory } from './news.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';
import { person } from './people.js';
import { randomKey } from './media.js';

export const POP = { ttlMs: 24 * 3600_000, perDay: 15, textMax: 200, photoMax: 450_000, backgrounds: 8, reportsToHide: 3 };
export const POP_REACTS = ['🔥', '😂', '😮', '❤️', '👏', '🍿'];
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const marks = (list) => list.map(() => '?').join(',');

function photoBytes(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'That photo didn’t work — try a JPG or PNG');
  const bin = atob(m[2]);
  if (bin.length > POP.photoMax) throw new HttpError(413, 'That photo is too big');
  const head = [...bin.slice(0, 12)].map((c) => c.charCodeAt(0));
  const ok = bin.length > 100 && ((m[1] === 'jpeg' && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    || (m[1] === 'png' && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    || (m[1] === 'webp' && bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WEBP'));
  if (!ok) throw new HttpError(400, 'That photo didn’t work — try a JPG or PNG');
  return { type: `image/${m[1]}`, b64: m[2] };
}

/** Pops are for you and the people who follow you (and never across a block). */
async function canSee(env, viewer, ownerId) {
  if (!viewer) return false;
  if (viewer.id === ownerId) return true;
  const r = await env.DB.prepare(`SELECT
      EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS f,
      EXISTS(SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)) AS b`).bind(viewer.id, ownerId, viewer.id, ownerId, ownerId, viewer.id).first();
  return !!r?.f && !r?.b;
}

async function popFor(env, user, id) {
  const p = await env.DB.prepare('SELECT * FROM pops WHERE id = ? AND expires > ?').bind(Number(id), Date.now()).first();
  if (!p || (p.hidden && p.user_id !== user.id) || !(await canSee(env, user, p.user_id))) throw new HttpError(404, 'That pop is gone');
  return p;
}

export async function createPop(env, user, body) {
  const now = Date.now();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM pops WHERE user_id = ? AND created > ?').bind(user.id, now - 864e5).first();
  if ((n?.n || 0) >= POP.perDay) throw new HttpError(429, 'That’s plenty of pops for today — come back tomorrow!');
  const kind = ['text', 'photo', 'story'].includes(body.kind) ? body.kind : null;
  if (!kind) throw new HttpError(400, 'Pick what to pop');
  const text = cleanText(String(body.text ?? '').slice(0, POP.textMax)).slice(0, POP.textMax);
  const bg = Math.max(0, Math.min(POP.backgrounds - 1, Number(body.bg) || 0));
  let story = null;
  let photo = null;
  if (kind === 'text' && !text) throw new HttpError(400, 'Write something first!');
  if (kind === 'story') {
    const s = typeof body.storyKey === 'string' && (await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(body.storyKey.slice(0, 300)).first());
    if (!s) throw new HttpError(404, 'That story isn’t on kerNEl anymore');
    const x = rowToStory(s);
    story = { key: x.key, title: x.title, url: x.url, source: x.source, cat: x.cat, image: x.image, domain: x.domain, time: x.time };
  }
  if (kind === 'photo') photo = photoBytes(body.photo);
  const key = photo ? randomKey() : null;
  if (photo) await env.DB.prepare('INSERT INTO pop_photos (key, data, type, created) VALUES (?, ?, ?, ?)').bind(key, photo.b64, photo.type, now).run();
  const row = await env.DB.prepare('INSERT INTO pops (user_id, kind, text, bg, photo_key, story, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(user.id, kind, text, bg, key, story ? JSON.stringify(story) : null, now, now + POP.ttlMs).first();
  return { pop: popView(row, { mine: true, views: 0 }) };
}

function popView(p, { mine = false, seen = false, react = null, views = 0 } = {}) {
  return {
    id: p.id, kind: p.kind, text: p.text, bg: p.bg, photo: p.photo_key || null, story: parse(p.story, null),
    created: p.created, expires: p.expires, seen: mine || seen, myReact: react, ...(mine ? { views, hidden: !!p.hidden } : {}),
  };
}

/** The pops row: me first, then people with pops I haven't seen, newest first. `only` = one username. */
export async function listPops(env, user, only = null) {
  const now = Date.now();
  const extra = only ? ' AND u.username_lc = ?' : '';
  const binds = [now, user.id, user.id, user.id, user.id, user.id, ...(only ? [String(only).replace(/^@/, '').toLowerCase()] : [])];
  const { results: rows } = await env.DB.prepare(`SELECT p.*, u.username, u.profile, u.xp, u.streak, u.last_day FROM pops p JOIN users u ON u.id = p.user_id
    WHERE p.expires > ? AND (p.hidden = 0 OR p.user_id = ?)
      AND (p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))
      AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?) AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)${extra}
    ORDER BY p.id ASC LIMIT 400`).bind(...binds).all();
  const ids = rows.map((r) => r.id);
  const views = ids.length ? (await env.DB.prepare(`SELECT pop_id, react FROM pop_views WHERE user_id = ? AND pop_id IN (${marks(ids)})`).bind(user.id, ...ids).all()).results : [];
  const myIds = rows.filter((r) => r.user_id === user.id).map((r) => r.id);
  const counts = myIds.length ? (await env.DB.prepare(`SELECT pop_id, COUNT(*) AS n FROM pop_views WHERE pop_id IN (${marks(myIds)}) GROUP BY pop_id`).bind(...myIds).all()).results : [];
  const viewBy = Object.fromEntries(views.map((v) => [v.pop_id, v]));
  const countBy = Object.fromEntries(counts.map((c) => [c.pop_id, c.n]));
  const rings = new Map();
  for (const r of rows) {
    const mine = r.user_id === user.id;
    if (!rings.has(r.user_id)) rings.set(r.user_id, { user: person(r), me: mine, pops: [] });
    rings.get(r.user_id).pops.push(popView(r, { mine, seen: !!viewBy[r.id], react: viewBy[r.id]?.react || null, views: countBy[r.id] || 0 }));
  }
  const list = [...rings.values()].map((x) => ({ ...x, unseen: x.pops.filter((p) => !p.seen).length, latest: x.pops[x.pops.length - 1].created }));
  list.sort((a, b) => (b.me - a.me) || ((b.unseen > 0) - (a.unseen > 0)) || (b.latest - a.latest));
  return { rings: list, reacts: POP_REACTS, now };
}

/** Mark a pop as seen (and maybe react to it). */
export async function viewPop(env, user, body, ctx) {
  const p = await popFor(env, user, body.id);
  if (p.user_id === user.id) return { ok: true };
  const now = Date.now();
  const react = body.react === undefined ? undefined : body.react === null ? null : String(body.react);
  if (react && !POP_REACTS.includes(react)) throw new HttpError(400, 'Unknown reaction');
  const before = await env.DB.prepare('SELECT react FROM pop_views WHERE pop_id = ? AND user_id = ?').bind(p.id, user.id).first();
  if (react === undefined) await env.DB.prepare('INSERT OR IGNORE INTO pop_views (pop_id, user_id, at, react) VALUES (?, ?, ?, NULL)').bind(p.id, user.id, now).run();
  else await env.DB.prepare('INSERT INTO pop_views (pop_id, user_id, at, react) VALUES (?, ?, ?, ?) ON CONFLICT(pop_id, user_id) DO UPDATE SET react = excluded.react').bind(p.id, user.id, now, react).run();
  if (react && before?.react !== react) {
    const owner = await env.DB.prepare('SELECT id, profile FROM users WHERE id = ?').bind(p.user_id).first();
    const job = owner ? notify(env, owner.id, { kind: 'friends', title: tr(langOfProfile(owner.profile), 'popReact', { who: user.username, emoji: react }), body: p.text.slice(0, 120), url: './#pops', tag: 'pop-reacts', icon: react }, { left: 2 }).catch((e) => console.error('pop push', e)) : null;
    if (job) { if (ctx?.waitUntil) ctx.waitUntil(job); else await job; }
  }
  return { ok: true, react: react === undefined ? before?.react || null : react };
}

/** Only the author: who saw a pop, and how they reacted. */
export async function popViewers(env, user, id) {
  const p = await env.DB.prepare('SELECT * FROM pops WHERE id = ?').bind(Number(id)).first();
  if (!p || p.user_id !== user.id) throw new HttpError(404, 'That pop is gone');
  const { results } = await env.DB.prepare(`SELECT v.at, v.react, u.username, u.profile, u.xp, u.streak, u.last_day FROM pop_views v JOIN users u ON u.id = v.user_id
    WHERE v.pop_id = ? ORDER BY (v.react IS NULL), v.at DESC LIMIT 300`).bind(p.id).all();
  return { viewers: results.map((r) => ({ ...person(r), at: r.at, react: r.react || null })), total: results.length };
}

export async function deletePop(env, user, id) {
  const p = await env.DB.prepare('SELECT * FROM pops WHERE id = ?').bind(Number(id)).first();
  if (!p || p.user_id !== user.id) throw new HttpError(404, 'That pop is gone');
  await env.DB.batch(dropPopStatements(env, 'id = ?', p.id));
  return { ok: true };
}

/** Three different people reporting a pop hides it; moderators see every report. */
export async function reportPop(env, user, body) {
  const p = await popFor(env, user, body.id);
  if (p.user_id === user.id) throw new HttpError(400, 'You can’t report yourself');
  const added = await env.DB.prepare('INSERT OR IGNORE INTO pop_reports (pop_id, reporter_id, at) VALUES (?, ?, ?) RETURNING pop_id').bind(p.id, user.id, Date.now()).first();
  if (added) {
    const row = await env.DB.prepare('UPDATE pops SET reports = reports + 1 WHERE id = ? RETURNING reports').bind(p.id).first();
    if ((row?.reports || 0) >= POP.reportsToHide) await env.DB.prepare('UPDATE pops SET hidden = 1 WHERE id = ?').bind(p.id).run();
  }
  return { ok: true };
}

export async function popPhotoResponse(env, key) {
  const r = await env.DB.prepare('SELECT ph.data, ph.type FROM pop_photos ph JOIN pops p ON p.photo_key = ph.key WHERE ph.key = ? AND p.hidden = 0 AND p.expires > ?').bind(String(key), Date.now()).first();
  if (!r) throw new HttpError(404, 'That pop is gone');
  const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': r.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin', 'Content-Security-Policy': "default-src 'none'",
    },
  });
}

/** For profile cards: does this person have pops the viewer can see (and are any new)? */
export async function popStatus(env, viewer, ownerId) {
  if (!viewer || !(await canSee(env, viewer, ownerId))) return { pops: 0, popsUnseen: 0 };
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(NOT EXISTS(SELECT 1 FROM pop_views v WHERE v.pop_id = p.id AND v.user_id = ?)) AS unseen
    FROM pops p WHERE p.user_id = ? AND p.expires > ? AND p.hidden = 0`).bind(viewer.id, ownerId, Date.now()).first();
  return { pops: r?.n || 0, popsUnseen: viewer.id === ownerId ? 0 : r?.unseen || 0 };
}

/** Statements that remove pops (and their photos, views and reports) matching a condition on `pops`. */
export function dropPopStatements(env, where, ...binds) {
  return [
    env.DB.prepare(`DELETE FROM pop_photos WHERE key IN (SELECT photo_key FROM pops WHERE ${where})`).bind(...binds),
    env.DB.prepare(`DELETE FROM pop_views WHERE pop_id IN (SELECT id FROM pops WHERE ${where})`).bind(...binds),
    env.DB.prepare(`DELETE FROM pop_reports WHERE pop_id IN (SELECT id FROM pops WHERE ${where})`).bind(...binds),
    env.DB.prepare(`DELETE FROM pops WHERE ${where}`).bind(...binds),
  ];
}
