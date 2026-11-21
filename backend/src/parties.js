// 🎉 Watch Parties: live rooms for big tech events (moderators schedule them). A countdown, live chat,
// and a hype meter: every emoji someone taps rains down on everyone's screen a moment later.
import { HttpError, throttle } from './util.js';
import { cleanText, assertNotMuted } from './community.js';
import { people } from './play.js';
import { rowToStory } from './news.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';
import { log } from './admin.js';

export const PARTY = { hype: ['🔥', '😂', '😮', '👏', '🍿', '❤️'], bucketMs: 2000, maxMinutes: 300, earlyMin: 15 };
const now = () => Date.now();
const view = (p) => ({ id: p.id, title: p.title, emoji: p.emoji, starts: p.starts, ends: p.ends, story: p.story ? JSON.parse(p.story) : null, phase: phase(p) });
const phase = (p) => (now() < p.starts - PARTY.earlyMin * 60_000 ? 'soon' : now() < p.starts ? 'lobby' : now() < p.ends ? 'live' : 'over');

export async function listParties(env, user) {
  const { results } = await env.DB.prepare('SELECT * FROM parties WHERE ends > ? ORDER BY starts ASC LIMIT 10').bind(now() - 3600_000).all();
  const mine = user && results.length ? (await env.DB.prepare(`SELECT party_id FROM party_rsvps WHERE user_id = ? AND party_id IN (${results.map(() => '?').join(',')})`).bind(user.id, ...results.map((p) => p.id)).all()).results.map((r) => r.party_id) : [];
  const { results: counts } = results.length ? await env.DB.prepare(`SELECT party_id, COUNT(*) AS n FROM party_rsvps WHERE party_id IN (${results.map(() => '?').join(',')}) GROUP BY party_id`).bind(...results.map((p) => p.id)).all() : { results: [] };
  return { parties: results.map((p) => ({ ...view(p), going: mine.includes(p.id), rsvps: counts.find((c) => c.party_id === p.id)?.n || 0 })), hype: PARTY.hype, now: now() };
}

async function partyById(env, id) {
  const p = await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(Number(id)).first();
  if (!p) throw new HttpError(404, 'That party is over');
  return p;
}

/** The live room: messages since a time, hype since a time, and who's here. */
export async function getParty(env, user, id, since = 0, hypeSince = 0) {
  const p = await partyById(env, id);
  const t = now();
  if (user && throttle(`party:${p.id}:${user.id}`, 20_000)) await env.DB.prepare('INSERT OR REPLACE INTO party_viewers (party_id, user_id, at) VALUES (?, ?, ?)').bind(p.id, user.id, t).run();
  const { results: msgs } = await env.DB.prepare(`SELECT id, user_id, text, created FROM party_messages WHERE party_id = ? AND created > ? AND hidden = 0 ORDER BY id DESC LIMIT 60`).bind(p.id, Number(since) || 0).all();
  msgs.reverse();
  const who = await people(env, [...new Set(msgs.map((m) => m.user_id))]);
  const fromBucket = Math.max(Math.floor((Number(hypeSince) || t - 6000) / PARTY.bucketMs), Math.floor((t - 20_000) / PARTY.bucketMs));
  const { results: hype } = await env.DB.prepare('SELECT bucket, emoji, n FROM party_hype WHERE party_id = ? AND bucket > ?').bind(p.id, fromBucket).all();
  const viewers = await env.DB.prepare('SELECT COUNT(*) AS n FROM party_viewers WHERE party_id = ? AND at > ?').bind(p.id, t - 30_000).first();
  const total = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM party_hype WHERE party_id = ? AND bucket > ?').bind(p.id, Math.floor((t - 60_000) / PARTY.bucketMs)).first();
  return {
    party: view(p), viewers: viewers?.n || 0, hypeMinute: total?.n || 0, now: t,
    messages: msgs.filter((m) => who[m.user_id]).map((m) => ({ id: m.id, user: who[m.user_id], text: m.text, created: m.created, mine: !!user && m.user_id === user.id })),
    hype: hype.map((h) => ({ bucket: h.bucket, emoji: h.emoji, n: h.n })),
  };
}

export async function partyChat(env, user, id, body) {
  const p = await partyById(env, id);
  if (phase(p) === 'over' || phase(p) === 'soon') throw new HttpError(409, 'The chat opens 15 minutes before the party');
  await assertNotMuted(env, user);
  const text = cleanText(String(body.text || '')).slice(0, 280);
  if (!text) throw new HttpError(400, 'Say something first!');
  await env.DB.prepare('INSERT INTO party_messages (party_id, user_id, text, created, hidden) VALUES (?, ?, ?, ?, 0)').bind(p.id, user.id, text, now()).run();
  return getParty(env, user, id, Number(body.since) || 0, Number(body.hypeSince) || 0);
}

export async function partyHype(env, user, id, body) {
  const p = await partyById(env, id);
  if (phase(p) !== 'live' && phase(p) !== 'lobby') throw new HttpError(409, 'Save the hype for when the party is on!');
  const emoji = String(body.emoji || '');
  if (!PARTY.hype.includes(emoji)) throw new HttpError(400, 'Unknown reaction');
  const n = Math.max(1, Math.min(5, Number(body.n) || 1)); // a few taps are sent together
  const bucket = Math.floor(now() / PARTY.bucketMs);
  await env.DB.prepare('INSERT INTO party_hype (party_id, bucket, emoji, n) VALUES (?, ?, ?, ?) ON CONFLICT(party_id, bucket, emoji) DO UPDATE SET n = n + excluded.n').bind(p.id, bucket, emoji, n).run();
  return { ok: true };
}

export async function rsvpParty(env, user, id, body) {
  const p = await partyById(env, id);
  if (body.going === false) await env.DB.prepare('DELETE FROM party_rsvps WHERE party_id = ? AND user_id = ?').bind(p.id, user.id).run();
  else await env.DB.prepare('INSERT OR IGNORE INTO party_rsvps (party_id, user_id, reminded) VALUES (?, ?, 0)').bind(p.id, user.id).run();
  return listParties(env, user);
}

export async function reportPartyMessage(env, user, body) {
  const m = await env.DB.prepare('SELECT * FROM party_messages WHERE id = ?').bind(Number(body.id)).first();
  if (!m) throw new HttpError(404, 'Message not found');
  if (m.user_id === user.id) throw new HttpError(400, 'You can’t report yourself');
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO party_reports (msg_id, reporter_id, at) VALUES (?, ?, ?) RETURNING msg_id').bind(m.id, user.id, now()).first();
  if (fresh) {
    const r = await env.DB.prepare('UPDATE party_messages SET reports = reports + 1 WHERE id = ? RETURNING reports').bind(m.id).first();
    if ((r?.reports || 0) >= 3) await env.DB.prepare('UPDATE party_messages SET hidden = 1 WHERE id = ?').bind(m.id).run();
  }
  return { ok: true };
}

/** Moderators schedule parties. */
export async function createParty(env, admin, body) {
  const title = cleanText(String(body.title || '')).slice(0, 80).trim();
  if (!title) throw new HttpError(400, 'Give the party a title');
  const starts = Number(body.starts);
  if (!Number.isFinite(starts) || starts < now() - 3600_000 || starts > now() + 60 * 864e5) throw new HttpError(400, 'Pick a start time in the next 60 days');
  const minutes = Math.max(15, Math.min(PARTY.maxMinutes, Number(body.minutes) || 90));
  let story = null;
  if (typeof body.storyKey === 'string' && body.storyKey) {
    const s = await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(body.storyKey.slice(0, 300)).first();
    if (s) { const x = rowToStory(s); story = JSON.stringify({ key: x.key, title: x.title, url: x.url, source: x.source, cat: x.cat, image: x.image, domain: x.domain }); }
  }
  const emoji = String(body.emoji || '🎉').slice(0, 8);
  const p = await env.DB.prepare('INSERT INTO parties (title, emoji, starts, ends, story, created_by, created) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(title, emoji, starts, starts + minutes * 60_000, story, admin.id, now()).first();
  await log(env, admin, 'party:create', p.id, title);
  return view(p);
}

export async function deleteParty(env, admin, id) {
  await log(env, admin, 'party:delete', id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM party_messages WHERE party_id = ?').bind(Number(id)),
    env.DB.prepare('DELETE FROM party_hype WHERE party_id = ?').bind(Number(id)),
    env.DB.prepare('DELETE FROM party_rsvps WHERE party_id = ?').bind(Number(id)),
    env.DB.prepare('DELETE FROM party_viewers WHERE party_id = ?').bind(Number(id)),
    env.DB.prepare('DELETE FROM parties WHERE id = ?').bind(Number(id)),
  ]);
  return { ok: true };
}

/** Cron: a reminder to everyone who said "remind me", a few minutes before the start. */
export async function remindParties(env, budget) {
  const { results } = await env.DB.prepare(`SELECT r.party_id, r.user_id, p.title, p.emoji, u.profile FROM party_rsvps r JOIN parties p ON p.id = r.party_id JOIN users u ON u.id = r.user_id
    WHERE r.reminded = 0 AND p.starts BETWEEN ? AND ? LIMIT 40`).bind(now() - 5 * 60_000, now() + 10 * 60_000).all();
  let sent = 0;
  for (const r of results) {
    if (budget.left <= 0) break;
    await env.DB.prepare('UPDATE party_rsvps SET reminded = 1 WHERE party_id = ? AND user_id = ?').bind(r.party_id, r.user_id).run();
    sent += await notify(env, r.user_id, { kind: 'games', title: tr(langOfProfile(r.profile), 'partySoon', { title: r.title }), body: tr(langOfProfile(r.profile), 'partySoonBody'), url: `./#party=${r.party_id}`, tag: `party-${r.party_id}`, icon: r.emoji }, budget);
  }
  return sent;
}
