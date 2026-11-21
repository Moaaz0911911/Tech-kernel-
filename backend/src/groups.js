// 👥 Group chats: up to 32 kernels, with stories, 🎙️ voice notes, reactions, "Seen by" and ✍️ typing.
import { HttpError } from './util.js';
import { cleanText } from './community.js';
import { rowToStory } from './news.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';
import { person, lastSeen, activeFields, DM_REACTS } from './people.js';
import { saveVoice, dropVoice, typingIn, setTypingIn } from './media.js';

export const GROUP = { maxMembers: 32, nameMax: 40, perDay: 10, reportsToHide: 3 };
export const GROUP_EMOJIS = ['👥', '🍿', '🎮', '🚀', '💻', '🤖', '📱', '🎧', '⚽', '📚', '🔥', '💡'];
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const marks = (list) => list.map(() => '?').join(',');
const USER_COLS = 'id, username, profile, xp, streak, last_day';

async function usersById(env, ids) {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id IN (${marks(ids)})`).bind(...ids).all();
  return Object.fromEntries(results.map((u) => [u.id, u]));
}

async function membership(env, user, groupId) {
  const m = await env.DB.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').bind(Number(groupId), user.id).first();
  if (!m) throw new HttpError(404, 'Group not found');
  const g = await env.DB.prepare('SELECT * FROM chat_groups WHERE id = ?').bind(m.group_id).first();
  if (!g) throw new HttpError(404, 'Group not found');
  return { m, g };
}

const cleanName = (s) => cleanText(String(s || '').replace(/\s+/g, ' ')).slice(0, GROUP.nameMax).trim();
const cleanEmoji = (e) => (GROUP_EMOJIS.includes(e) ? e : '👥');

/** Who `user` may add: people who exist, aren't blocked either way and take messages from them. */
async function addable(env, user, usernames) {
  const names = [...new Set((Array.isArray(usernames) ? usernames : []).map((n) => String(n || '').replace(/^@/, '').toLowerCase()).filter(Boolean))].slice(0, GROUP.maxMembers);
  if (!names.length) return { ok: [], skipped: [] };
  const { results } = await env.DB.prepare(`SELECT id, username, profile FROM users WHERE username_lc IN (${marks(names)})`).bind(...names).all();
  const ids = results.map((r) => r.id);
  const { results: blocks } = ids.length ? await env.DB.prepare(`SELECT blocker_id, blocked_id FROM blocks WHERE (blocker_id = ? AND blocked_id IN (${marks(ids)})) OR (blocked_id = ? AND blocker_id IN (${marks(ids)}))`).bind(user.id, ...ids, user.id, ...ids).all() : { results: [] };
  const { results: fol } = ids.length ? await env.DB.prepare(`SELECT follower_id FROM follows WHERE followee_id = ? AND follower_id IN (${marks(ids)})`).bind(user.id, ...ids).all() : { results: [] };
  const blocked = new Set(blocks.flatMap((b) => [b.blocker_id, b.blocked_id]));
  const followsMe = new Set(fol.map((f) => f.follower_id));
  const ok = [];
  const skipped = names.filter((n) => !results.some((r) => r.username.toLowerCase() === n));
  for (const r of results) {
    const setting = parse(r.profile, {}).dms || 'everyone';
    const allowed = r.id !== user.id && !blocked.has(r.id) && (setting === 'everyone' || (setting === 'following' && followsMe.has(r.id)));
    if (allowed) ok.push(r); else if (r.id !== user.id) skipped.push(r.username);
  }
  return { ok, skipped };
}

async function systemMessage(env, g, user, data, now = Date.now()) {
  const row = await env.DB.prepare("INSERT INTO group_messages (group_id, user_id, kind, text, reacts, created, updated) VALUES (?, ?, 'system', ?, '{}', ?, ?) RETURNING id")
    .bind(g.id, user.id, JSON.stringify(data), now, now).first();
  await env.DB.prepare('UPDATE chat_groups SET last_id = ?, last_at = ? WHERE id = ?').bind(row.id, now, g.id).run();
  return row.id;
}

async function tellAdded(env, g, user, people, ctx) {
  const job = (async () => {
    const budget = { left: 12 };
    for (const p of people) {
      const lang = langOfProfile(p.profile);
      await notify(env, p.id, { kind: 'dms', title: tr(lang, 'groupAdded', { who: user.username, name: g.name }), body: tr(lang, 'groupAddedBody'), url: `./#group=${g.id}`, tag: `grp-${g.id}`, icon: g.emoji }, budget);
    }
  })().catch((e) => console.error('group push', e));
  if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
}

export async function createGroup(env, user, body, ctx) {
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, 'Give your group a name');
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_groups WHERE owner_id = ? AND created > ?').bind(user.id, Date.now() - 864e5).first();
  if ((today?.n || 0) >= GROUP.perDay) throw new HttpError(429, 'That’s a lot of new groups today — try again tomorrow');
  const { ok, skipped } = await addable(env, user, body.members);
  if (!ok.length) throw new HttpError(400, 'Add at least one person who takes messages from you');
  const now = Date.now();
  const members = ok.slice(0, GROUP.maxMembers - 1);
  const g = await env.DB.prepare('INSERT INTO chat_groups (name, emoji, owner_id, created, last_id, last_at) VALUES (?, ?, ?, ?, 0, ?) RETURNING *').bind(name, cleanEmoji(body.emoji), user.id, now, now).first();
  await env.DB.batch([user, ...members].map((p) => env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined, since_id, read_id) VALUES (?, ?, ?, 0, 0)').bind(g.id, p.id, now)));
  const last = await systemMessage(env, g, user, { t: 'created', by: user.username, name, who: members.map((p) => p.username) }, now);
  await env.DB.prepare('UPDATE group_members SET read_id = ? WHERE group_id = ? AND user_id = ?').bind(last, g.id, user.id).run();
  await tellAdded(env, g, user, members, ctx);
  return { group: g.id, skipped: [...skipped, ...ok.slice(GROUP.maxMembers - 1).map((p) => p.username)] };
}

function toGM(r, me) {
  const reacts = parse(r.reacts, {});
  const counts = {};
  for (const e of Object.values(reacts)) counts[e] = (counts[e] || 0) + 1;
  const gone = !!r.deleted || !!r.hidden;
  return {
    id: r.id, kind: r.kind, from: r.username || null, mine: r.user_id === me.id, created: r.created, updated: r.updated,
    deleted: !!r.deleted, hidden: !!r.hidden && !r.deleted,
    system: r.kind === 'system' ? parse(r.text, {}) : null,
    text: gone || r.kind === 'system' ? '' : r.text, story: gone ? null : parse(r.story, null), voice: gone ? null : parse(r.voice, null),
    reacts: counts, myReact: reacts[me.id] || null,
  };
}

/** For the inbox: every group I'm in, with the last message and my unread count. */
export async function listGroups(env, user) {
  const { results: rows } = await env.DB.prepare(`SELECT g.*, m.read_id, m.muted, m.since_id, (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS n
    FROM group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY g.last_at DESC LIMIT 60`).bind(user.id).all();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const lastIds = rows.map((r) => r.last_id).filter(Boolean);
  const { results: lasts } = lastIds.length ? await env.DB.prepare(`SELECT gm.*, u.username FROM group_messages gm LEFT JOIN users u ON u.id = gm.user_id WHERE gm.id IN (${marks(lastIds)})`).bind(...lastIds).all() : { results: [] };
  const lastBy = Object.fromEntries(lasts.map((l) => [l.group_id, l]));
  const { results: unread } = await env.DB.prepare(`SELECT gm.group_id, COUNT(*) AS n FROM group_messages gm JOIN group_members m ON m.group_id = gm.group_id AND m.user_id = ?
    WHERE gm.group_id IN (${marks(ids)}) AND gm.user_id != ? AND gm.id > m.read_id AND gm.id > m.since_id AND gm.deleted = 0 AND gm.kind = 'msg' GROUP BY gm.group_id`).bind(user.id, ...ids, user.id).all();
  const unreadBy = Object.fromEntries(unread.map((u) => [u.group_id, u.n]));
  // a few faces for the group's picture
  const { results: faces } = await env.DB.prepare(`SELECT m.group_id, u.username, u.profile FROM group_members m JOIN users u ON u.id = m.user_id
    WHERE m.group_id IN (${marks(ids)}) AND m.user_id != ? ORDER BY m.joined ASC`).bind(...ids, user.id).all();
  return rows.map((r) => {
    const l = lastBy[r.id];
    const visible = l && l.id > r.since_id;
    return {
      id: r.id, group: true, name: r.name, emoji: r.emoji, members: r.n, muted: !!r.muted, lastAt: r.last_at, unread: unreadBy[r.id] || 0,
      faces: faces.filter((f) => f.group_id === r.id).slice(0, 2).map((f) => person({ ...f, xp: 0 })),
      last: visible ? {
        kind: l.kind, from: l.username, mine: l.user_id === user.id, deleted: !!l.deleted || !!l.hidden,
        text: l.deleted || l.hidden ? '' : l.kind === 'system' ? parse(l.text, {}) : l.text.slice(0, 120), story: !!l.story, voice: !!l.voice,
      } : null,
    };
  });
}

/** Unread group messages (not counting muted groups), for the dot on the Chat tab. */
export async function groupCounts(env, user) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM group_messages gm JOIN group_members m ON m.group_id = gm.group_id AND m.user_id = ?
    WHERE m.muted = 0 AND gm.user_id != ? AND gm.id > m.read_id AND gm.id > m.since_id AND gm.deleted = 0 AND gm.kind = 'msg'`).bind(user.id, user.id).first();
  return r?.n || 0;
}

export async function getGroup(env, user, groupId, since = 0) {
  const { m, g } = await membership(env, user, groupId);
  const now = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO presence (user_id, room, at) VALUES (?, ?, ?)').bind(user.id, 'dm', now).run();
  const q = 'SELECT gm.*, u.username FROM group_messages gm LEFT JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND gm.id > ?';
  let rows;
  if (since > 0) ({ results: rows } = await env.DB.prepare(`${q} AND gm.updated > ? ORDER BY gm.id ASC LIMIT 200`).bind(g.id, m.since_id, since).all());
  else { ({ results: rows } = await env.DB.prepare(`${q} ORDER BY gm.id DESC LIMIT 80`).bind(g.id, m.since_id).all()); rows.reverse(); }
  if (g.last_id > m.read_id) await env.DB.prepare('UPDATE group_members SET read_id = ? WHERE group_id = ? AND user_id = ?').bind(g.last_id, g.id, user.id).run();
  const { results: mem } = await env.DB.prepare('SELECT user_id, read_id, joined FROM group_members WHERE group_id = ? ORDER BY joined ASC').bind(g.id).all();
  const authorIds = [...new Set(rows.filter((r) => r.kind === 'msg').map((r) => r.user_id))];
  const byId = await usersById(env, [...new Set([...mem.map((x) => x.user_id), ...authorIds])]);
  const seen = await lastSeen(env, mem.map((x) => x.user_id));
  const typingIds = await typingIn(env, `g:${g.id}`, user.id);
  const members = mem.filter((x) => byId[x.user_id]).map((x) => ({ ...person(byId[x.user_id], activeFields(seen[x.user_id])), owner: x.user_id === g.owner_id, me: x.user_id === user.id, readId: x.read_id }));
  return {
    group: { id: g.id, name: g.name, emoji: g.emoji, owner: g.owner_id === user.id, muted: !!m.muted, created: g.created },
    members,
    authors: Object.fromEntries(authorIds.filter((id) => byId[id]).map((id) => [byId[id].username, person(byId[id])])),
    messages: rows.map((r) => toGM(r, user)),
    typing: typingIds.map((id) => byId[id]).filter(Boolean).map((u) => person(u)),
    now,
  };
}

export async function sendGroup(env, user, groupId, body, ctx) {
  const { g } = await membership(env, user, groupId);
  const text = cleanText(String(body.text ?? '').slice(0, 1000));
  let story = null;
  if (typeof body.storyKey === 'string' && body.storyKey) {
    const s = await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(body.storyKey.slice(0, 300)).first();
    if (s) { const x = rowToStory(s); story = { key: x.key, title: x.title, url: x.url, source: x.source, cat: x.cat, image: x.image, domain: x.domain, time: x.time }; }
  }
  const voice = body.voice ? await saveVoice(env, user, `g:${g.id}`, body) : null;
  if (!text && !story && !voice) throw new HttpError(400, 'Say something first!');
  const now = Date.now();
  const msg = await env.DB.prepare("INSERT INTO group_messages (group_id, user_id, kind, text, story, voice, reacts, created, updated) VALUES (?, ?, 'msg', ?, ?, ?, '{}', ?, ?) RETURNING *")
    .bind(g.id, user.id, text, story ? JSON.stringify(story) : null, voice ? JSON.stringify(voice) : null, now, now).first();
  // the chat message before this one ("added", "renamed" and other notes don't count)
  const prev = await env.DB.prepare("SELECT MAX(id) AS id FROM group_messages WHERE group_id = ? AND kind = 'msg' AND id < ?").bind(g.id, msg.id).first();
  const prevLast = prev?.id || 0;
  await env.DB.batch([
    env.DB.prepare('UPDATE chat_groups SET last_id = ?, last_at = ? WHERE id = ?').bind(msg.id, now, g.id),
    env.DB.prepare('UPDATE group_members SET read_id = ? WHERE group_id = ? AND user_id = ?').bind(msg.id, g.id, user.id),
    env.DB.prepare('DELETE FROM typing WHERE scope = ? AND user_id = ?').bind(`g:${g.id}`, user.id),
  ]);
  // A push only for the first message someone hasn't read yet, so a busy group doesn't buzz every few seconds.
  const job = (async () => {
    const { results } = await env.DB.prepare(`SELECT u.id, u.profile FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? AND m.user_id != ? AND m.muted = 0 AND m.read_id >= ? LIMIT 40`).bind(g.id, user.id, prevLast).all();
    const preview = text || (story ? `📰 ${story.title}` : voice ? '🎙️' : '');
    const budget = { left: 16 };
    for (const p of results) {
      await notify(env, p.id, { kind: 'dms', title: tr(langOfProfile(p.profile), 'groupMessage', { who: user.username, name: g.name }), body: preview.slice(0, 160), url: `./#group=${g.id}`, tag: `grp-${g.id}`, icon: g.emoji }, budget);
    }
  })().catch((e) => console.error('group push', e));
  if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
  return { message: toGM({ ...msg, username: user.username }, user) };
}

async function messageFor(env, user, id) {
  const msg = await env.DB.prepare('SELECT gm.*, u.username FROM group_messages gm LEFT JOIN users u ON u.id = gm.user_id WHERE gm.id = ?').bind(Number(id)).first();
  if (!msg || msg.kind !== 'msg') throw new HttpError(404, 'Message not found');
  const { m } = await membership(env, user, msg.group_id);
  if (msg.id <= m.since_id) throw new HttpError(404, 'Message not found');
  return msg;
}

export async function reactGroup(env, user, body) {
  const msg = await messageFor(env, user, body.id);
  if (msg.deleted || msg.hidden) throw new HttpError(404, 'Message not found');
  const emoji = body.emoji == null ? null : String(body.emoji);
  if (emoji && !DM_REACTS.includes(emoji)) throw new HttpError(400, 'Unknown reaction');
  const reacts = parse(msg.reacts, {});
  if (emoji) reacts[user.id] = emoji; else delete reacts[user.id];
  const row = await env.DB.prepare('UPDATE group_messages SET reacts = ?, updated = ? WHERE id = ? RETURNING *').bind(JSON.stringify(reacts), Date.now(), msg.id).first();
  return { message: toGM({ ...row, username: msg.username }, user) };
}

export async function deleteGroupMessage(env, user, id) {
  const msg = await messageFor(env, user, id);
  if (msg.user_id !== user.id) throw new HttpError(403, 'You can only delete your own messages');
  await env.DB.prepare("UPDATE group_messages SET deleted = 1, text = '', story = NULL, voice = NULL, reacts = '{}', updated = ? WHERE id = ?").bind(Date.now(), msg.id).run();
  await dropVoice(env, msg.voice);
  return { ok: true };
}

/** Reports go to the moderators; three different people hide the message for everyone. */
export async function reportGroupMessage(env, user, body) {
  const msg = await messageFor(env, user, body.id);
  if (msg.user_id === user.id) throw new HttpError(400, 'You can’t report yourself');
  const added = await env.DB.prepare('INSERT OR IGNORE INTO group_reports (msg_id, reporter_id, at) VALUES (?, ?, ?) RETURNING msg_id').bind(msg.id, user.id, Date.now()).first();
  if (added) {
    const row = await env.DB.prepare('UPDATE group_messages SET reports = reports + 1, updated = ? WHERE id = ? RETURNING reports').bind(Date.now(), msg.id).first();
    if ((row?.reports || 0) >= GROUP.reportsToHide) await env.DB.prepare('UPDATE group_messages SET hidden = 1, updated = ? WHERE id = ?').bind(Date.now(), msg.id).run();
  }
  return { ok: true };
}

export async function updateGroup(env, user, body) {
  const { g } = await membership(env, user, body.group);
  const name = body.name != null ? cleanName(body.name) : g.name;
  if (!name) throw new HttpError(400, 'Give your group a name');
  const emoji = body.emoji != null ? cleanEmoji(body.emoji) : g.emoji;
  if (name === g.name && emoji === g.emoji) return { ok: true };
  await env.DB.prepare('UPDATE chat_groups SET name = ?, emoji = ? WHERE id = ?').bind(name, emoji, g.id).run();
  await systemMessage(env, g, user, { t: name !== g.name ? 'renamed' : 'emoji', by: user.username, name, emoji });
  return { ok: true };
}

export async function addToGroup(env, user, body, ctx) {
  const { g } = await membership(env, user, body.group);
  const { results: cur } = await env.DB.prepare('SELECT user_id FROM group_members WHERE group_id = ?').bind(g.id).all();
  const inGroup = new Set(cur.map((c) => c.user_id));
  const { ok, skipped } = await addable(env, user, body.usernames);
  const fresh = ok.filter((p) => !inGroup.has(p.id));
  const room = GROUP.maxMembers - inGroup.size;
  if (fresh.length && room <= 0) throw new HttpError(400, 'This group is full (32 kernels)');
  const adding = fresh.slice(0, room);
  if (!adding.length) return { added: [], skipped };
  const now = Date.now();
  await env.DB.batch(adding.map((p) => env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined, since_id, read_id) VALUES (?, ?, ?, ?, ?)').bind(g.id, p.id, now, g.last_id, g.last_id)));
  await systemMessage(env, g, user, { t: 'added', by: user.username, who: adding.map((p) => p.username) }, now);
  await tellAdded(env, g, user, adding, ctx);
  return { added: adding.map((p) => p.username), skipped: [...skipped, ...fresh.slice(room).map((p) => p.username)] };
}

/** Leave (or, for the owner, remove someone). The oldest member takes over when the owner leaves. */
export async function removeFromGroup(env, user, body) {
  const { g } = await membership(env, user, body.group);
  let target = user;
  if (body.username && String(body.username).toLowerCase() !== user.username.toLowerCase()) {
    if (g.owner_id !== user.id) throw new HttpError(403, 'Only the group’s creator can remove people');
    target = await env.DB.prepare('SELECT id, username FROM users WHERE username_lc = ?').bind(String(body.username).replace(/^@/, '').toLowerCase()).first();
    if (!target || !(await env.DB.prepare('SELECT 1 AS y FROM group_members WHERE group_id = ? AND user_id = ?').bind(g.id, target.id).first())) throw new HttpError(404, 'They’re not in this group');
  }
  await leaveQuietly(env, g, target);
  const still = await env.DB.prepare('SELECT 1 AS y FROM chat_groups WHERE id = ?').bind(g.id).first();
  if (still) await systemMessage(env, g, user, target.id === user.id ? { t: 'left', by: user.username } : { t: 'removed', by: user.username, who: [target.username] });
  return { ok: true };
}

async function leaveQuietly(env, g, target) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(g.id, target.id),
    env.DB.prepare('DELETE FROM typing WHERE scope = ? AND user_id = ?').bind(`g:${g.id}`, target.id),
  ]);
  const next = await env.DB.prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined ASC LIMIT 1').bind(g.id).first();
  if (!next) { await deleteGroup(env, g.id); return; }
  if (g.owner_id === target.id) await env.DB.prepare('UPDATE chat_groups SET owner_id = ? WHERE id = ?').bind(next.user_id, g.id).run();
}

async function deleteGroup(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_reports WHERE msg_id IN (SELECT id FROM group_messages WHERE group_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM group_messages WHERE group_id = ?').bind(id),
    env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(id),
    env.DB.prepare('DELETE FROM voice_notes WHERE scope = ?').bind(`g:${id}`),
    env.DB.prepare('DELETE FROM chat_groups WHERE id = ?').bind(id),
  ]);
}

/** Account deletion: leave every group (handing over groups they started) and remove their messages. */
export async function forgetGroupsOf(env, user) {
  const { results } = await env.DB.prepare('SELECT g.* FROM group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.user_id = ?').bind(user.id).all();
  for (const g of results) await leaveQuietly(env, g, user);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_reports WHERE reporter_id = ? OR msg_id IN (SELECT id FROM group_messages WHERE user_id = ?)').bind(user.id, user.id),
    env.DB.prepare("DELETE FROM group_messages WHERE user_id = ? AND kind = 'msg'").bind(user.id),
  ]);
}

export async function muteGroup(env, user, body) {
  const { g } = await membership(env, user, body.group);
  await env.DB.prepare('UPDATE group_members SET muted = ? WHERE group_id = ? AND user_id = ?').bind(body.muted ? 1 : 0, g.id, user.id).run();
  return { ok: true, muted: !!body.muted };
}

export async function groupTyping(env, user, body) {
  const { g } = await membership(env, user, body.group);
  await setTypingIn(env, user, `g:${g.id}`, body.stop !== true);
  return { ok: true };
}
