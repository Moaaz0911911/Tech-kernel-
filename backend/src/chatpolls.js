// 📊 Polls inside private and group chats: a question with 2–4 answers; everyone in the chat can vote (and change their vote).
import { HttpError } from './util.js';
import { cleanText } from './community.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const marks = (list) => list.map(() => '?').join(',');

/** Check and tidy a poll someone is sending. Returns JSON text for the message row, or null. */
export function cleanPoll(poll) {
  if (!poll) return null;
  const q = cleanText(String(poll.q || '')).replace(/\s+/g, ' ').slice(0, 120).trim();
  const options = (Array.isArray(poll.options) ? poll.options : []).map((o) => cleanText(String(o || '')).replace(/\s+/g, ' ').slice(0, 40).trim()).filter(Boolean).slice(0, 4);
  if (!q) throw new HttpError(400, 'Ask a question for your poll');
  if (options.length < 2) throw new HttpError(400, 'Give at least two answers');
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new HttpError(400, 'Each answer needs to be different');
  return JSON.stringify({ q, options });
}

/** Add live counts (and my vote) to the polls in a list of messages. scope: 'd' for private chats, 'g' for groups. */
export async function attachPolls(env, scope, messages, user) {
  const withPoll = messages.filter((m) => m.poll);
  if (!withPoll.length) return messages;
  const ids = withPoll.map((m) => m.id);
  const { results } = await env.DB.prepare(`SELECT msg_id, option, user_id FROM chat_poll_votes WHERE scope = ? AND msg_id IN (${marks(ids)})`).bind(scope, ...ids).all();
  for (const m of withPoll) {
    const votes = results.filter((v) => v.msg_id === m.id);
    m.poll = { ...m.poll, counts: m.poll.options.map((_, i) => votes.filter((v) => v.option === i).length), mine: votes.find((v) => v.user_id === user.id)?.option ?? null, total: votes.length };
  }
  return messages;
}

export const pollOf = (row) => (row.deleted || row.hidden ? null : parse(row.poll, null));

/** Vote (or change your vote; the same answer again takes it back). */
export async function voteChatPoll(env, user, body) {
  const scope = body.scope === 'g' ? 'g' : 'd';
  const id = Number(body.id);
  const table = scope === 'g' ? 'group_messages' : 'dm_messages';
  const msg = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  const poll = msg && pollOf(msg);
  if (!poll) throw new HttpError(404, 'Poll not found');
  const member = scope === 'g'
    ? await env.DB.prepare('SELECT 1 AS y FROM group_members WHERE group_id = ? AND user_id = ? AND since_id < ?').bind(msg.group_id, user.id, msg.id).first()
    : await env.DB.prepare('SELECT 1 AS y FROM dm_members WHERE thread_id = ? AND user_id = ?').bind(msg.thread_id, user.id).first();
  if (!member) throw new HttpError(404, 'Poll not found');
  const option = Number(body.option);
  if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) throw new HttpError(400, 'Pick an answer');
  const had = await env.DB.prepare('SELECT option FROM chat_poll_votes WHERE scope = ? AND msg_id = ? AND user_id = ?').bind(scope, id, user.id).first();
  if (had?.option === option) await env.DB.prepare('DELETE FROM chat_poll_votes WHERE scope = ? AND msg_id = ? AND user_id = ?').bind(scope, id, user.id).run();
  else await env.DB.prepare('INSERT INTO chat_poll_votes (scope, msg_id, user_id, option, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, msg_id, user_id) DO UPDATE SET option = excluded.option, at = excluded.at').bind(scope, id, user.id, option, Date.now()).run();
  await env.DB.prepare(`UPDATE ${table} SET updated = ? WHERE id = ?`).bind(Date.now(), id).run(); // so the others see the new counts on their next refresh
  const [m] = await attachPolls(env, scope, [{ id, poll }], user);
  return { poll: m.poll };
}
