// 🎁 Rewards the server hands out (invites, duels, live shows, predictions, seasons).
// The XP waits in users.pending_xp until the browser collects it, so it never fights with the progress
// the browser keeps itself. Counters in users.stats unlock special hats and frames.
import { HttpError } from './util.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
export const STAT_KEYS = ['invites', 'invited', 'liveWins', 'prophet', 'duelsWon', 'seasonWins', 'stockWins', 'bingos', 'cardSets', 'squadGoals', 'debateWins'];
export const statsOf = (row) => parse(row?.stats, {});

/** Give someone XP (collected on their next visit) and/or bump one of their counters. */
export async function reward(env, userId, xp = 0, stat = null, by = 1) {
  if (stat && !STAT_KEYS.includes(stat)) throw new Error(`unknown stat ${stat}`);
  if (stat) {
    await env.DB.prepare(`UPDATE users SET pending_xp = pending_xp + ?, stats = json_set(CASE WHEN json_valid(stats) THEN stats ELSE '{}' END, '$.${stat}', COALESCE(json_extract(CASE WHEN json_valid(stats) THEN stats ELSE '{}' END, '$.${stat}'), 0) + ?) WHERE id = ?`)
      .bind(Math.max(0, xp | 0), by, userId).run();
  } else if (xp > 0) {
    await env.DB.prepare('UPDATE users SET pending_xp = pending_xp + ? WHERE id = ?').bind(xp | 0, userId).run();
  }
}

/** The browser collects its XP: read and reset in one go, so two open tabs can't both collect the same reward. */
export async function claimXp(env, user) {
  const [read] = await env.DB.batch([
    env.DB.prepare('SELECT pending_xp FROM users WHERE id = ?').bind(user.id),
    env.DB.prepare('UPDATE users SET pending_xp = 0 WHERE id = ?').bind(user.id),
  ]);
  return { claimed: read?.results?.[0]?.pending_xp || 0 };
}

// ---------------- 🎟️ invites ----------------
export const INVITE_XP = 50;
const INVITES_PER_DAY = 20; // rewards per inviter per day (so nobody farms XP with throwaway accounts)

/** Called right after someone signs up with an invite link. */
export async function applyInvite(env, newUserId, inviterName) {
  const name = String(inviterName || '').replace(/^@/, '').toLowerCase().slice(0, 20);
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return null;
  const inviter = await env.DB.prepare('SELECT id, username, profile FROM users WHERE username_lc = ?').bind(name).first();
  if (!inviter || inviter.id === newUserId) return null;
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO invites (invitee_id, inviter_id, at) VALUES (?, ?, ?) RETURNING invitee_id').bind(newUserId, inviter.id, Date.now()).first();
  if (!fresh) return null;
  await env.DB.prepare('UPDATE users SET invited_by = ? WHERE id = ?').bind(inviter.id, newUserId).run();
  await reward(env, newUserId, INVITE_XP, 'invited');
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND at > ?').bind(inviter.id, Date.now() - 864e5).first();
  if ((today?.n || 0) <= INVITES_PER_DAY) {
    await reward(env, inviter.id, INVITE_XP, 'invites');
    const newbie = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(newUserId).first();
    const lang = langOfProfile(inviter.profile);
    await notify(env, inviter.id, { kind: 'friends', title: tr(lang, 'inviteJoined', { who: newbie?.username || '?' }), body: tr(lang, 'inviteJoinedBody', { xp: INVITE_XP }), url: `./#user=${newbie?.username || ''}`, tag: 'invite', icon: '🎟️' }, { left: 3 }).catch(() => 0);
  }
  return inviter.username;
}

export async function myInvites(env, user) {
  const { results } = await env.DB.prepare(`SELECT u.username, u.profile FROM invites i JOIN users u ON u.id = i.invitee_id WHERE i.inviter_id = ? ORDER BY i.at DESC LIMIT 50`).bind(user.id).all();
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ?').bind(user.id).first();
  return {
    count: count?.n || 0,
    people: results.map((r) => { const p = parse(r.profile, {}); return { username: r.username, nickname: p.nickname || r.username, avatar: p.avatar || '🍿', photo: p.photo || '' }; }),
    xpEach: INVITE_XP,
  };
}

export function assertStat(stat) { if (!STAT_KEYS.includes(stat)) throw new HttpError(400, 'Unknown stat'); }
