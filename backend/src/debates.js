// ⚖️ Debate Rooms: pick a side on a story, post your best argument, ❤️ the good ones.
// Every day the biggest story gets a debate automatically; anyone can start one from the reader.
// After two days the side with more votes wins, and the best argument on that side earns XP.
import { HttpError } from './util.js';
import { cleanText } from './community.js';
import { people, snap, recentStories } from './play.js';
import { rowToStory } from './news.js';
import { reward } from './rewards.js';

export const DEBATE = { hours: 48, perDay: 3, argMax: 280, winXp: 30, autoSides: ['🔥 Big deal', '🥱 Overhyped'] };
const day = () => new Date().toISOString().slice(0, 10);
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const marks = (list) => list.map(() => '?').join(',');

async function storySnap(env, key) {
  const s = key && (await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(String(key).slice(0, 300)).first());
  return s ? snap(rowToStory(s)) : null;
}

/** Cron: today's automatic debate on the hottest story. */
export async function makeDailyDebate(env) {
  const key = `debate:auto:${day()}`;
  if (await env.DB.prepare('SELECT 1 AS y FROM kv WHERE k = ?').bind(key).first()) return 0;
  const top = (await recentStories(env, 24, 40)).sort((a, b) => (b.points || 0) - (a.points || 0))[0];
  if (!top) return 0;
  if (!(await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(key, '1').first())) return 0;
  await env.DB.prepare('INSERT INTO debates (story_key, story, question, side_a, side_b, created_by, created, closes, auto) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 1)')
    .bind(top.key, JSON.stringify(snap(top)), 'Is this a big deal?', DEBATE.autoSides[0], DEBATE.autoSides[1], Date.now(), Date.now() + DEBATE.hours * 3600_000).run();
  return 1;
}

export async function startDebate(env, user, body) {
  const story = await storySnap(env, body.storyKey);
  if (!story) throw new HttpError(404, 'That story isn’t on kerNEl anymore');
  const question = cleanText(String(body.question || '')).replace(/\s+/g, ' ').slice(0, 120).trim();
  if (question.length < 5) throw new HttpError(400, 'Ask a question to debate');
  const a = cleanText(String(body.sideA || 'Yes')).slice(0, 30).trim() || 'Yes';
  const b = cleanText(String(body.sideB || 'No')).slice(0, 30).trim() || 'No';
  if (a.toLowerCase() === b.toLowerCase()) throw new HttpError(400, 'The two sides need different names');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM debates WHERE created_by = ? AND created > ?').bind(user.id, Date.now() - 864e5).first();
  if ((n?.n || 0) >= DEBATE.perDay) throw new HttpError(429, 'That’s 3 debates today — let these ones heat up first!');
  const d = await env.DB.prepare('INSERT INTO debates (story_key, story, question, side_a, side_b, created_by, created, closes, auto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id')
    .bind(story.key, JSON.stringify(story), question, a, b, user.id, Date.now(), Date.now() + DEBATE.hours * 3600_000).first();
  return getDebate(env, user, d.id);
}

async function tallies(env, ids) {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT debate_id, side, COUNT(*) AS n FROM debate_votes WHERE debate_id IN (${marks(ids)}) GROUP BY debate_id, side`).bind(...ids).all();
  const { results: args } = await env.DB.prepare(`SELECT debate_id, COUNT(*) AS n FROM debate_args WHERE debate_id IN (${marks(ids)}) AND hidden = 0 GROUP BY debate_id`).bind(...ids).all();
  const out = {};
  for (const id of ids) out[id] = { a: 0, b: 0, args: 0 };
  for (const r of results) out[r.debate_id][r.side] = r.n;
  for (const r of args) out[r.debate_id].args = r.n;
  return out;
}

const brief = (d, tl, mine) => ({
  id: d.id, question: d.question, sides: [d.side_a, d.side_b], auto: !!d.auto, story: parse(d.story, null), closes: d.closes, closed: d.closes <= Date.now(),
  votes: [tl?.a || 0, tl?.b || 0], args: tl?.args || 0, mine: mine ?? null, winner: d.winner ?? null,
});

export async function listDebates(env, user, storyKey = null) {
  const { results } = storyKey
    ? await env.DB.prepare('SELECT * FROM debates WHERE story_key = ? ORDER BY id DESC LIMIT 10').bind(String(storyKey).slice(0, 300)).all()
    : await env.DB.prepare('SELECT * FROM debates WHERE closes > ? ORDER BY auto DESC, id DESC LIMIT 12').bind(Date.now() - 864e5).all();
  const ids = results.map((d) => d.id);
  const tl = await tallies(env, ids);
  const mine = user && ids.length ? Object.fromEntries((await env.DB.prepare(`SELECT debate_id, side FROM debate_votes WHERE user_id = ? AND debate_id IN (${marks(ids)})`).bind(user.id, ...ids).all()).results.map((r) => [r.debate_id, r.side])) : {};
  return { debates: results.map((d) => brief(d, tl[d.id], mine[d.id])) };
}

export async function getDebate(env, user, id) {
  const d = await env.DB.prepare('SELECT * FROM debates WHERE id = ?').bind(Number(id)).first();
  if (!d) throw new HttpError(404, 'Debate not found');
  await settle(env, d);
  const tl = (await tallies(env, [d.id]))[d.id];
  const mine = user ? (await env.DB.prepare('SELECT side FROM debate_votes WHERE debate_id = ? AND user_id = ?').bind(d.id, user.id).first())?.side : null;
  const { results: args } = await env.DB.prepare('SELECT * FROM debate_args WHERE debate_id = ? AND hidden = 0 ORDER BY likes DESC, id ASC LIMIT 100').bind(d.id).all();
  const liked = user && args.length ? new Set((await env.DB.prepare(`SELECT arg_id FROM debate_likes WHERE user_id = ? AND arg_id IN (${marks(args.map((x) => x.id))})`).bind(user.id, ...args.map((x) => x.id)).all()).results.map((r) => r.arg_id)) : new Set();
  const who = await people(env, [...new Set(args.map((x) => x.user_id))]);
  const fresh = await env.DB.prepare('SELECT winner, best_arg FROM debates WHERE id = ?').bind(d.id).first();
  return {
    debate: { ...brief({ ...d, winner: fresh?.winner }, tl, mine), best: fresh?.best_arg || null },
    arguments: args.filter((x) => who[x.user_id]).map((x) => ({ id: x.id, side: x.side, text: x.text, likes: x.likes, liked: liked.has(x.id), user: who[x.user_id], mine: !!user && x.user_id === user.id, created: x.created })),
  };
}

export async function voteDebate(env, user, body) {
  const d = await env.DB.prepare('SELECT * FROM debates WHERE id = ?').bind(Number(body.id)).first();
  if (!d) throw new HttpError(404, 'Debate not found');
  if (d.closes <= Date.now()) throw new HttpError(409, 'This debate is closed');
  const side = body.side === 'a' || body.side === 'b' ? body.side : null;
  if (!side) throw new HttpError(400, 'Pick a side');
  await env.DB.prepare('INSERT INTO debate_votes (debate_id, user_id, side, at) VALUES (?, ?, ?, ?) ON CONFLICT(debate_id, user_id) DO UPDATE SET side = excluded.side, at = excluded.at').bind(d.id, user.id, side, Date.now()).run();
  return getDebate(env, user, d.id);
}

export async function argue(env, user, body) {
  const d = await env.DB.prepare('SELECT * FROM debates WHERE id = ?').bind(Number(body.id)).first();
  if (!d) throw new HttpError(404, 'Debate not found');
  if (d.closes <= Date.now()) throw new HttpError(409, 'This debate is closed');
  const vote = await env.DB.prepare('SELECT side FROM debate_votes WHERE debate_id = ? AND user_id = ?').bind(d.id, user.id).first();
  if (!vote) throw new HttpError(409, 'Pick a side first');
  const text = cleanText(String(body.text || '')).slice(0, DEBATE.argMax).trim();
  if (text.length < 3) throw new HttpError(400, 'Make your point first!');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM debate_args WHERE debate_id = ? AND user_id = ?').bind(d.id, user.id).first();
  if ((n?.n || 0) >= 3) throw new HttpError(429, 'Three arguments per debate — let others have a go!');
  await env.DB.prepare('INSERT INTO debate_args (debate_id, user_id, side, text, likes, created, hidden, reports) VALUES (?, ?, ?, ?, 0, ?, 0, 0)').bind(d.id, user.id, vote.side, text, Date.now()).run();
  return getDebate(env, user, d.id);
}

export async function likeArgument(env, user, body) {
  const a = await env.DB.prepare('SELECT * FROM debate_args WHERE id = ? AND hidden = 0').bind(Number(body.id)).first();
  if (!a) throw new HttpError(404, 'Argument not found');
  if (a.user_id === user.id) throw new HttpError(400, 'No liking your own argument 😄');
  if (body.like === false) {
    const gone = await env.DB.prepare('DELETE FROM debate_likes WHERE arg_id = ? AND user_id = ? RETURNING arg_id').bind(a.id, user.id).first();
    if (gone) await env.DB.prepare('UPDATE debate_args SET likes = MAX(0, likes - 1) WHERE id = ?').bind(a.id).run();
  } else {
    const added = await env.DB.prepare('INSERT OR IGNORE INTO debate_likes (arg_id, user_id) VALUES (?, ?) RETURNING arg_id').bind(a.id, user.id).first();
    if (added) await env.DB.prepare('UPDATE debate_args SET likes = likes + 1 WHERE id = ?').bind(a.id).run();
  }
  return getDebate(env, user, a.debate_id);
}

export async function reportArgument(env, user, body) {
  const a = await env.DB.prepare('SELECT * FROM debate_args WHERE id = ?').bind(Number(body.id)).first();
  if (!a) throw new HttpError(404, 'Argument not found');
  if (a.user_id === user.id) throw new HttpError(400, 'You can’t report yourself');
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO debate_reports (arg_id, reporter_id, at) VALUES (?, ?, ?) RETURNING arg_id').bind(a.id, user.id, Date.now()).first();
  if (fresh) {
    const r = await env.DB.prepare('UPDATE debate_args SET reports = reports + 1 WHERE id = ? RETURNING reports').bind(a.id).first();
    if ((r?.reports || 0) >= 3) await env.DB.prepare('UPDATE debate_args SET hidden = 1 WHERE id = ?').bind(a.id).run();
  }
  return { ok: true };
}

/** When a debate closes: decide the winning side and reward the best argument on it (once). */
async function settle(env, d) {
  if (d.closes > Date.now() || d.winner) return;
  const tl = (await tallies(env, [d.id]))[d.id];
  const winner = tl.a === tl.b ? 'tie' : tl.a > tl.b ? 'a' : 'b';
  const best = winner === 'tie' ? null : await env.DB.prepare('SELECT id, user_id FROM debate_args WHERE debate_id = ? AND side = ? AND hidden = 0 AND likes > 0 ORDER BY likes DESC, id ASC LIMIT 1').bind(d.id, winner).first();
  const done = await env.DB.prepare('UPDATE debates SET winner = ?, best_arg = ? WHERE id = ? AND winner IS NULL RETURNING id').bind(winner, best?.id || null, d.id).first();
  if (done && best) await reward(env, best.user_id, DEBATE.winXp, 'debateWins');
}

/** Cron: settle debates that closed. */
export async function settleDebates(env) {
  const { results } = await env.DB.prepare('SELECT * FROM debates WHERE closes <= ? AND winner IS NULL LIMIT 20').bind(Date.now()).all();
  for (const d of results) await settle(env, d);
  return results.length;
}
