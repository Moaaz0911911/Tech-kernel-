// 🛡️ Moderator tools. Moderators are the usernames listed in the ADMINS setting (wrangler.toml).
// They see what people reported, can hide or bring back messages and comments, take down photos,
// mute or ban accounts, and look up a person. Every action is written to mod_log.
import { HttpError } from './util.js';
import { requireUser } from './auth.js';
import { look } from './social.js';
import { removePhoto } from './people.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const DAY = 864e5;

export const isAdmin = (env, user) => !!user && String(env.ADMINS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(String(user.username_lc || user.username || '').toLowerCase());

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!isAdmin(env, user)) throw new HttpError(403, 'Moderators only');
  return user;
}

async function log(env, admin, action, target, note = '') {
  await env.DB.prepare('INSERT INTO mod_log (admin, action, target, note, at) VALUES (?, ?, ?, ?, ?)').bind(admin.username, action, String(target ?? ''), String(note || '').slice(0, 200), Date.now()).run();
}
const userByName = async (env, name) => {
  const u = await env.DB.prepare('SELECT * FROM users WHERE username_lc = ?').bind(String(name || '').replace(/^@/, '').toLowerCase()).first();
  if (!u) throw new HttpError(404, 'No kernel by that name');
  return u;
};
const who = (r) => { const p = parse(r.profile, {}); return { username: r.username, nickname: p.nickname || r.username, ...look(p) }; };

export async function overview(env) {
  const now = Date.now();
  const r = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE created > ?) AS newUsers,
      (SELECT COUNT(*) FROM presence WHERE at > ?) AS activeNow,
      (SELECT COUNT(*) FROM chat_messages WHERE created > ?) AS chat,
      (SELECT COUNT(*) FROM comments WHERE created > ?) AS comments,
      (SELECT COUNT(*) FROM dm_messages WHERE created > ?) AS dms,
      (SELECT COUNT(*) FROM group_messages WHERE created > ? AND kind = 'msg') AS groupMsgs,
      (SELECT COUNT(*) FROM pops WHERE created > ?) AS pops,
      (SELECT COUNT(*) FROM group_messages WHERE reports > 0) AS groupReports,
      (SELECT COUNT(*) FROM pops WHERE reports > 0 AND expires > ?) AS popReports,
      (SELECT COUNT(*) FROM chat_messages WHERE reports > 0) AS chatReports,
      (SELECT COUNT(*) FROM comments WHERE reports > 0) AS commentReports,
      (SELECT COUNT(*) FROM dm_reports) AS dmReports,
      (SELECT COUNT(DISTINCT owner_id) FROM photo_reports) AS photoReports,
      (SELECT COUNT(*) FROM mutes WHERE until > ?) AS muted,
      (SELECT COUNT(*) FROM users WHERE banned_until > ?) AS banned`)
    .bind(now - DAY, now - 5 * 60_000, now - DAY, now - DAY, now - DAY, now - DAY, now - DAY, now, now, now).first();
  return { ...r, at: now };
}

export async function reports(env) {
  const { results: chat } = await env.DB.prepare(`SELECT m.id, m.room, m.text, m.reports, m.hidden, m.created, m.username, u.profile FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.reports > 0 ORDER BY m.id DESC LIMIT 50`).all();
  const { results: comments } = await env.DB.prepare(`SELECT c.id, c.text, c.reports, c.hidden, c.created, c.username, c.story_key, s.title, u.profile FROM comments c
    LEFT JOIN users u ON u.id = c.user_id LEFT JOIN stories s ON s.key = c.story_key WHERE c.reports > 0 ORDER BY c.id DESC LIMIT 50`).all();
  const { results: dms } = await env.DB.prepare(`SELECT r.reporter_id, r.user_id, r.at, r.evidence, a.username AS reporter, b.username, b.profile FROM dm_reports r
    JOIN users a ON a.id = r.reporter_id JOIN users b ON b.id = r.user_id ORDER BY r.at DESC LIMIT 50`).all();
  const { results: photos } = await env.DB.prepare(`SELECT u.username, u.profile, COUNT(*) AS n, MAX(pr.at) AS at FROM photo_reports pr JOIN users u ON u.id = pr.owner_id
    GROUP BY pr.owner_id ORDER BY n DESC, at DESC LIMIT 50`).all();
  const { results: groups } = await env.DB.prepare(`SELECT gm.id, gm.text, gm.voice, gm.reports, gm.hidden, gm.deleted, gm.created, g.name AS grp, u.username, u.profile FROM group_messages gm
    JOIN users u ON u.id = gm.user_id LEFT JOIN chat_groups g ON g.id = gm.group_id WHERE gm.reports > 0 ORDER BY gm.id DESC LIMIT 50`).all();
  const { results: pops } = await env.DB.prepare(`SELECT p.id, p.kind, p.text, p.bg, p.photo_key, p.story, p.reports, p.hidden, p.created, p.expires, u.username, u.profile FROM pops p
    JOIN users u ON u.id = p.user_id WHERE p.reports > 0 AND p.expires > ? ORDER BY p.id DESC LIMIT 50`).bind(Date.now()).all();
  return {
    groups: groups.map((m) => ({ id: m.id, group: m.grp || '?', text: m.deleted ? '' : m.text || (m.voice ? '🎙️' : ''), reports: m.reports, hidden: !!m.hidden, created: m.created, user: who(m) })),
    pops: pops.map((p) => ({ id: p.id, kind: p.kind, text: p.text, photo: p.photo_key || null, story: parse(p.story, null)?.title || null, reports: p.reports, hidden: !!p.hidden, created: p.created, expires: p.expires, user: who(p) })),
    chat: chat.map((m) => ({ id: m.id, room: m.room, text: m.text, reports: m.reports, hidden: !!m.hidden, created: m.created, user: m.profile ? who({ ...m }) : { username: m.username, nickname: m.username, avatar: '🍿' } })),
    comments: comments.map((c) => ({ id: c.id, text: c.text, reports: c.reports, hidden: !!c.hidden, created: c.created, story: c.title || c.story_key, user: c.profile ? who(c) : { username: c.username, nickname: c.username, avatar: '🍿' } })),
    dms: dms.map((d) => ({ reporter: d.reporter, reporterId: d.reporter_id, userId: d.user_id, at: d.at, evidence: parse(d.evidence, []), user: who(d) })),
    photos: photos.map((p) => ({ count: p.n, at: p.at, user: who(p) })),
  };
}

/** Hide, bring back or dismiss a reported chat message / comment. */
export async function moderateContent(env, admin, body) {
  const id = Number(body.id);
  // what each kind is stored in; tables with an "updated" time get it bumped so open chats pick up the change
  const KINDS = {
    chat: ['chat_messages', 'chat_reports', 'msg_id', true],
    comment: ['comments', 'comment_reports', 'comment_id', false],
    group: ['group_messages', 'group_reports', 'msg_id', true],
    pop: ['pops', 'pop_reports', 'pop_id', false],
  };
  const [table, reportsTable, idCol, hasUpdated] = KINDS[body.kind] || [];
  if (!table || !id) throw new HttpError(400, 'Pick a message or comment');
  const now = Date.now();
  const update = (set) => (hasUpdated
    ? env.DB.prepare(`UPDATE ${table} SET ${set}, updated = ? WHERE id = ?`).bind(now, id)
    : env.DB.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).bind(id));
  if (body.action === 'hide') await update('hidden = 1').run();
  else if (body.action === 'restore') await env.DB.batch([update('reports = 0, hidden = 0'), env.DB.prepare(`DELETE FROM ${reportsTable} WHERE ${idCol} = ?`).bind(id)]);
  else if (body.action === 'dismiss') await env.DB.batch([update('reports = 0'), env.DB.prepare(`DELETE FROM ${reportsTable} WHERE ${idCol} = ?`).bind(id)]);
  else throw new HttpError(400, 'Unknown action');
  await log(env, admin, `${body.kind}:${body.action}`, id);
  return { ok: true };
}

export async function moderateDmReport(env, admin, body) {
  await env.DB.prepare('DELETE FROM dm_reports WHERE reporter_id = ? AND user_id = ?').bind(String(body.reporterId || ''), String(body.userId || '')).run();
  await log(env, admin, 'dm:dismiss', body.userId);
  return { ok: true };
}

export async function moderatePhoto(env, admin, body) {
  const owner = await userByName(env, body.username);
  if (body.action === 'remove') await removePhoto(env, owner);
  else if (body.action !== 'dismiss') throw new HttpError(400, 'Unknown action');
  await env.DB.prepare('DELETE FROM photo_reports WHERE owner_id = ?').bind(owner.id).run();
  await log(env, admin, `photo:${body.action}`, owner.username);
  return { ok: true };
}

/** Mute (can't post for a while), ban (signed out, can't sign in), or undo either. */
export async function moderateUser(env, admin, body) {
  const u = await userByName(env, body.username);
  if (u.id === admin.id) throw new HttpError(400, 'You can’t do that to yourself');
  const now = Date.now();
  const hours = Math.max(1, Math.min(24 * 365, Number(body.hours) || 24));
  if (body.action === 'mute') await env.DB.prepare('INSERT OR REPLACE INTO mutes (user_id, until) VALUES (?, ?)').bind(u.id, now + hours * 3600_000).run();
  else if (body.action === 'unmute') await env.DB.prepare('DELETE FROM mutes WHERE user_id = ?').bind(u.id).run();
  else if (body.action === 'ban') {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET banned_until = ? WHERE id = ?').bind(now + hours * 3600_000, u.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
      env.DB.prepare('UPDATE chat_messages SET hidden = 1, updated = ? WHERE user_id = ? AND created > ?').bind(now, u.id, now - DAY),
    ]);
  } else if (body.action === 'unban') await env.DB.prepare('UPDATE users SET banned_until = NULL WHERE id = ?').bind(u.id).run();
  else throw new HttpError(400, 'Unknown action');
  await log(env, admin, `user:${body.action}`, u.username, body.action === 'mute' || body.action === 'ban' ? `${hours}h` : '');
  return lookupUser(env, u.username);
}

export async function lookupUser(env, name) {
  const u = await userByName(env, name);
  const now = Date.now();
  const c = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM chat_messages WHERE user_id = ?) AS chat,
      (SELECT COUNT(*) FROM comments WHERE user_id = ?) AS comments,
      (SELECT COUNT(*) FROM dm_messages WHERE user_id = ?) AS dms,
      (SELECT COALESCE(SUM(reports), 0) FROM chat_messages WHERE user_id = ?) AS chatReports,
      (SELECT COALESCE(SUM(reports), 0) FROM comments WHERE user_id = ?) AS commentReports,
      (SELECT COUNT(*) FROM dm_reports WHERE user_id = ?) AS dmReports,
      (SELECT COUNT(*) FROM photo_reports WHERE owner_id = ?) AS photoReports,
      (SELECT until FROM mutes WHERE user_id = ? AND until > ?) AS mutedUntil`)
    .bind(u.id, u.id, u.id, u.id, u.id, u.id, u.id, u.id, now).first();
  const { results: recentChat } = await env.DB.prepare('SELECT id, room, text, hidden, reports, created FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 10').bind(u.id).all();
  const { results: recentComments } = await env.DB.prepare('SELECT id, text, hidden, reports, created FROM comments WHERE user_id = ? ORDER BY id DESC LIMIT 10').bind(u.id).all();
  const p = parse(u.profile, {});
  return {
    user: { ...who(u), bio: p.bio || '', xp: u.xp, created: u.created, bannedUntil: u.banned_until && u.banned_until > now ? u.banned_until : null, mutedUntil: c?.mutedUntil || null, stats: parse(u.stats, {}) },
    counts: { chat: c.chat, comments: c.comments, dms: c.dms, chatReports: c.chatReports, commentReports: c.commentReports, dmReports: c.dmReports, photoReports: c.photoReports },
    recentChat: recentChat.map((m) => ({ ...m, hidden: !!m.hidden })),
    recentComments: recentComments.map((m) => ({ ...m, hidden: !!m.hidden })),
  };
}

export async function modLog(env) {
  const { results } = await env.DB.prepare('SELECT * FROM mod_log ORDER BY id DESC LIMIT 60').all();
  return { items: results };
}
