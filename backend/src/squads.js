// 👥 Squads: teams of up to 5 friends. Squad XP is everyone's XP this week added up; reach the weekly goal
// together and everyone gets a bonus. Each squad gets its own group chat once a second person joins.
import { HttpError } from './util.js';
import { weekOf } from './play.js';
import { reward } from './rewards.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';
import { cleanText } from './community.js';
import { createGroup, addToGroup, removeFromGroup, GROUP_EMOJIS } from './groups.js';

export const SQUAD = { max: 5, goalPerMember: 150, bonus: 40 };
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };

/** Called when someone's XP goes up (with the season update): count it for this week too. */
export function weekUpdate(env, user, gained) {
  const w = weekOf().week;
  return env.DB.prepare('UPDATE users SET week_xp = CASE WHEN week = ? THEN week_xp + ? ELSE ? END, week = ? WHERE id = ?').bind(w, gained, gained, w, user.id);
}

async function squadOf(env, userId) {
  return env.DB.prepare('SELECT s.* FROM squad_members m JOIN squads s ON s.id = m.squad_id WHERE m.user_id = ?').bind(userId).first();
}

async function members(env, squad) {
  const w = weekOf().week;
  const { results } = await env.DB.prepare(`SELECT u.id, u.username, u.profile, u.xp, u.streak, u.last_day, CASE WHEN u.week = ? THEN u.week_xp ELSE 0 END AS wxp, m.joined
    FROM squad_members m JOIN users u ON u.id = m.user_id WHERE m.squad_id = ? ORDER BY m.joined ASC`).bind(w, squad.id).all();
  return results;
}

/** Pay the weekly bonus once, the moment the squad reaches its goal. */
async function checkGoal(env, squad, list) {
  const w = weekOf().week;
  const total = list.reduce((a, m) => a + m.wxp, 0);
  const goal = SQUAD.goalPerMember * list.length;
  if (list.length < 2 || total < goal) return false;
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO squad_goals (squad_id, week, at) VALUES (?, ?, ?) RETURNING squad_id').bind(squad.id, w, Date.now()).first();
  if (!fresh) return false;
  for (const m of list) {
    await reward(env, m.id, SQUAD.bonus, 'squadGoals');
    await notify(env, m.id, { kind: 'friends', title: tr(langOfProfile(m.profile), 'squadGoal', { name: squad.name }), body: tr(langOfProfile(m.profile), 'squadGoalBody', { xp: SQUAD.bonus }), url: './#squad', tag: 'squad', icon: squad.emoji }, { left: 6 });
  }
  return true;
}

async function board(env, limit = 10) {
  const w = weekOf().week;
  const { results } = await env.DB.prepare(`SELECT s.id, s.name, s.emoji, COUNT(m.user_id) AS n, SUM(CASE WHEN u.week = ? THEN u.week_xp ELSE 0 END) AS xp
    FROM squads s JOIN squad_members m ON m.squad_id = s.id JOIN users u ON u.id = m.user_id GROUP BY s.id ORDER BY xp DESC LIMIT ?`).bind(w, limit).all();
  return results.map((r, i) => ({ place: i + 1, id: r.id, name: r.name, emoji: r.emoji, members: r.n, xp: r.xp || 0 }));
}

export async function getSquad(env, user) {
  const w = weekOf();
  const out = { board: await board(env), endsAt: w.ends, max: SQUAD.max, goalPerMember: SQUAD.goalPerMember, bonus: SQUAD.bonus, squad: null, invites: [] };
  if (!user) return out;
  const s = await squadOf(env, user.id);
  if (s) {
    const list = await members(env, s);
    const goalHit = await checkGoal(env, s, list) || !!(await env.DB.prepare('SELECT 1 AS y FROM squad_goals WHERE squad_id = ? AND week = ?').bind(s.id, w.week).first());
    const { results: pending } = await env.DB.prepare('SELECT u.username, u.profile FROM squad_invites i JOIN users u ON u.id = i.user_id WHERE i.squad_id = ?').bind(s.id).all();
    out.squad = {
      id: s.id, name: s.name, emoji: s.emoji, group: s.group_id || null, owner: s.owner_id === user.id,
      members: list.map((m) => ({ username: m.username, nickname: parse(m.profile, {}).nickname || m.username, ...lookOf(m), xp: m.wxp, owner: m.id === s.owner_id, me: m.id === user.id })),
      xp: list.reduce((a, m) => a + m.wxp, 0), goal: SQUAD.goalPerMember * Math.max(2, list.length), goalHit,
      place: out.board.find((b) => b.id === s.id)?.place || null,
      pending: pending.map((p) => p.username),
    };
  } else {
    const { results } = await env.DB.prepare(`SELECT i.squad_id, s.name, s.emoji, u.username AS by_name, (SELECT COUNT(*) FROM squad_members x WHERE x.squad_id = s.id) AS n
      FROM squad_invites i JOIN squads s ON s.id = i.squad_id LEFT JOIN users u ON u.id = i.by_id WHERE i.user_id = ? ORDER BY i.at DESC LIMIT 10`).bind(user.id).all();
    out.invites = results.map((r) => ({ squad: r.squad_id, name: r.name, emoji: r.emoji, by: r.by_name, members: r.n }));
  }
  return out;
}

function lookOf(m) {
  const p = parse(m.profile, {});
  return { avatar: p.avatar || '🍿', hat: p.hat || '', frame: p.frame || 'none', photo: p.photo || '' };
}

export async function createSquad(env, user, body) {
  if (await squadOf(env, user.id)) throw new HttpError(409, 'You’re already in a squad — leave it first');
  const name = cleanText(String(body.name || '').replace(/\s+/g, ' ')).slice(0, 30).trim();
  if (!name) throw new HttpError(400, 'Give your squad a name');
  const emoji = GROUP_EMOJIS.includes(body.emoji) ? body.emoji : '🍿';
  const now = Date.now();
  const s = await env.DB.prepare('INSERT INTO squads (name, emoji, owner_id, created) VALUES (?, ?, ?, ?) RETURNING *').bind(name, emoji, user.id, now).first();
  await env.DB.prepare('INSERT INTO squad_members (user_id, squad_id, joined) VALUES (?, ?, ?)').bind(user.id, s.id, now).run();
  return getSquad(env, user);
}

export async function inviteToSquad(env, user, body) {
  const s = await squadOf(env, user.id);
  if (!s) throw new HttpError(404, 'You’re not in a squad');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM squad_members WHERE squad_id = ?').bind(s.id).first();
  if ((n?.n || 0) >= SQUAD.max) throw new HttpError(400, 'Your squad is full (5 kernels)');
  const other = await env.DB.prepare('SELECT id, username, profile FROM users WHERE username_lc = ?').bind(String(body.username || '').replace(/^@/, '').toLowerCase()).first();
  if (!other) throw new HttpError(404, 'No kernel by that name');
  if (other.id === user.id) throw new HttpError(400, 'You’re already in your squad 😄');
  const blocked = await env.DB.prepare('SELECT 1 AS y FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').bind(user.id, other.id, other.id, user.id).first();
  if (blocked) throw new HttpError(403, 'You can’t invite this kernel');
  if (await squadOf(env, other.id)) throw new HttpError(409, 'They’re already in a squad');
  await env.DB.prepare('INSERT OR REPLACE INTO squad_invites (squad_id, user_id, by_id, at) VALUES (?, ?, ?, ?)').bind(s.id, other.id, user.id, Date.now()).run();
  const lang = langOfProfile(other.profile);
  await notify(env, other.id, { kind: 'friends', title: tr(lang, 'squadInvite', { who: user.username, name: s.name }), body: tr(lang, 'squadInviteBody'), url: './#squad', tag: 'squad-invite', icon: s.emoji }, { left: 3 });
  return getSquad(env, user);
}

/** Accept or turn down an invite. Joining makes (or grows) the squad's group chat. */
export async function answerInvite(env, user, body, ctx) {
  const id = Number(body.squad);
  const inv = await env.DB.prepare('SELECT * FROM squad_invites WHERE squad_id = ? AND user_id = ?').bind(id, user.id).first();
  if (!inv) throw new HttpError(404, 'That invite is gone');
  await env.DB.prepare('DELETE FROM squad_invites WHERE squad_id = ? AND user_id = ?').bind(id, user.id).run();
  if (!body.accept) return getSquad(env, user);
  if (await squadOf(env, user.id)) throw new HttpError(409, 'You’re already in a squad — leave it first');
  const s = await env.DB.prepare('SELECT * FROM squads WHERE id = ?').bind(id).first();
  if (!s) throw new HttpError(404, 'That squad is gone');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM squad_members WHERE squad_id = ?').bind(s.id).first();
  if ((n?.n || 0) >= SQUAD.max) throw new HttpError(400, 'That squad is full');
  await env.DB.prepare('INSERT INTO squad_members (user_id, squad_id, joined) VALUES (?, ?, ?)').bind(user.id, s.id, Date.now()).run();
  // the squad chat: made by the owner when the second person joins, then new members are added to it
  const owner = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.owner_id).first();
  try {
    if (owner && !s.group_id) {
      const g = await createGroup(env, owner, { name: s.name, emoji: s.emoji, members: [user.username] }, ctx);
      await env.DB.prepare('UPDATE squads SET group_id = ? WHERE id = ?').bind(g.group, s.id).run();
    } else if (owner && s.group_id) {
      const inGroup = await env.DB.prepare('SELECT 1 AS y FROM group_members WHERE group_id = ? AND user_id = ?').bind(s.group_id, owner.id).first();
      if (inGroup) await addToGroup(env, owner, { group: s.group_id, usernames: [user.username] }, ctx);
    }
  } catch (e) { console.error('squad chat', e); } // the squad still works without a chat
  return getSquad(env, user);
}

export async function leaveSquad(env, user) {
  const s = await squadOf(env, user.id);
  if (!s) throw new HttpError(404, 'You’re not in a squad');
  await env.DB.prepare('DELETE FROM squad_members WHERE user_id = ?').bind(user.id).run();
  if (s.group_id) await removeFromGroup(env, user, { group: s.group_id }).catch(() => {});
  const next = await env.DB.prepare('SELECT user_id FROM squad_members WHERE squad_id = ? ORDER BY joined ASC LIMIT 1').bind(s.id).first();
  if (!next) await env.DB.batch([
    env.DB.prepare('DELETE FROM squad_invites WHERE squad_id = ?').bind(s.id),
    env.DB.prepare('DELETE FROM squad_goals WHERE squad_id = ?').bind(s.id),
    env.DB.prepare('DELETE FROM squads WHERE id = ?').bind(s.id),
  ]);
  else if (s.owner_id === user.id) await env.DB.prepare('UPDATE squads SET owner_id = ? WHERE id = ?').bind(next.user_id, s.id).run();
  return getSquad(env, user);
}

/** Account deletion. */
export async function forgetSquadOf(env, user) {
  if (await squadOf(env, user.id)) await leaveSquad(env, user);
  await env.DB.prepare('DELETE FROM squad_invites WHERE user_id = ? OR by_id = ?').bind(user.id, user.id).run();
}
