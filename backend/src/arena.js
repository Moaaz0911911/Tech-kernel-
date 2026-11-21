// kerNEl arena: ⚔️ Quiz Duels, 📺 kerNEl Live (daily elimination trivia), 🔮 Predictions and 🏅 monthly Seasons.
// Questions and answers stay on the server; the browser only ever sees a question while it's being asked.
import { HttpError, fetchWithTimeout } from './util.js';
import { recentStories, makeQuestions, publicQuestion, kvGet, kvOnce, people } from './play.js';
import { sendDM } from './people.js';
import { notify } from './push.js';
import { reward } from './rewards.js';
import { givePacks } from './cards.js';
import { tr, langOfProfile } from './i18n.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const marks = (list) => list.map(() => '?').join(',');
const day = (offset = 0) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);

async function questionsFor(env, seed, n) {
  const stories = await recentStories(env);
  if (stories.length < 10) throw new HttpError(503, 'The questions are still popping — try again in a minute!');
  const qs = makeQuestions(stories, seed, n);
  if (qs.length < Math.min(3, n)) throw new HttpError(503, 'The questions are still popping — try again in a minute!');
  return qs;
}
async function pingUser(env, userId, key, vars, url, icon, kind = 'games') {
  const u = await env.DB.prepare('SELECT profile FROM users WHERE id = ?').bind(userId).first();
  if (!u) return;
  const lang = langOfProfile(u.profile);
  await notify(env, userId, { kind, title: tr(lang, key, vars), body: tr(lang, `${key}Body`, vars), url, tag: key, icon }, { left: 3 }).catch(() => 0);
}

// ====================================================================================
// ⚔️ Quiz Duels: same 5 questions for both, 15 seconds each, best score wins (time breaks ties)
// ====================================================================================
export const DUEL = { questions: 5, secondsEach: 15, ttl: 48 * 3600_000, win: 30, lose: 10, draw: 15, forfeit: 20 };

function duelView(d, me, ppl) {
  const side = d.a === me.id ? 'a' : 'b';
  const other = side === 'a' ? 'b' : 'a';
  const quiz = parse(d.quiz, []);
  const mine = d[`${side}_score`] != null;
  const theirs = d[`${other}_score`] != null;
  const finished = d.status !== 'open';
  return {
    id: d.id, status: d.status, created: d.created, expires: d.created + DUEL.ttl, challenger: side === 'a',
    opponent: ppl[d[other]] || { username: '?', nickname: '?', avatar: '🍿' },
    total: quiz.length, secondsEach: DUEL.secondsEach,
    my: mine ? { score: d[`${side}_score`], ms: d[`${side}_ms`], answers: parse(d[`${side}_answers`], []) } : null,
    their: theirs ? (mine || finished ? { score: d[`${other}_score`], ms: d[`${other}_ms`] } : { done: true }) : null,
    winner: d.winner ? (d.winner === 'draw' ? 'draw' : d.winner === me.id ? 'me' : 'them') : null,
    correct: mine ? quiz.map((q) => q.answer) : null,
    questions: !mine && !finished && d[`${side}_started`] ? quiz.map(publicQuestion) : null,
    started: !!d[`${side}_started`],
  };
}

async function loadDuel(env, user, id) {
  const d = await env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(Number(id)).first();
  if (!d || (d.a !== user.id && d.b !== user.id)) throw new HttpError(404, 'Duel not found');
  return settleExpired(env, d);
}

/** A duel nobody finished in 48 hours ends: whoever played wins by forfeit. */
async function settleExpired(env, d) {
  if (d.status !== 'open' || Date.now() - d.created < DUEL.ttl) return d;
  const aDone = d.a_score != null;
  const bDone = d.b_score != null;
  const winner = aDone && !bDone ? d.a : bDone && !aDone ? d.b : null;
  const row = await env.DB.prepare("UPDATE duels SET status = 'expired', winner = ? WHERE id = ? AND status = 'open' RETURNING *").bind(winner, d.id).first();
  if (row && winner) await reward(env, winner, DUEL.forfeit);
  return row || d;
}

export async function createDuel(env, user, body, ctx) {
  const other = await env.DB.prepare('SELECT id, username, profile FROM users WHERE username_lc = ?').bind(String(body.to || '').replace(/^@/, '').toLowerCase()).first();
  if (!other) throw new HttpError(404, 'No kernel by that name');
  if (other.id === user.id) throw new HttpError(400, 'You can’t duel yourself (you’d win and lose at the same time)');
  const open = await env.DB.prepare("SELECT * FROM duels WHERE status = 'open' AND created > ? AND ((a = ? AND b = ?) OR (a = ? AND b = ?)) ORDER BY id DESC LIMIT 1")
    .bind(Date.now() - DUEL.ttl, user.id, other.id, other.id, user.id).first();
  if (open) return { duel: duelView(open, user, await people(env, [open.a, open.b])), existing: true };
  const quiz = await questionsFor(env, `duel:${user.id}:${other.id}:${Date.now()}`, DUEL.questions);
  const d = await env.DB.prepare("INSERT INTO duels (a, b, quiz, status, created) VALUES (?, ?, ?, 'open', ?) RETURNING *").bind(user.id, other.id, JSON.stringify(quiz), Date.now()).first();
  try { // the challenge arrives as a card in their messages (so blocks and "who can message me" apply)
    const sent = await sendDM(env, user, { to: other.username, duel: d.id }, ctx);
    await env.DB.prepare('UPDATE duels SET thread_id = ? WHERE id = ?').bind(sent.thread, d.id).run();
  } catch (e) {
    await env.DB.prepare('DELETE FROM duels WHERE id = ?').bind(d.id).run();
    throw e;
  }
  return { duel: duelView(d, user, await people(env, [d.a, d.b])) };
}

export async function getDuel(env, user, id) {
  const d = await loadDuel(env, user, id);
  return { duel: duelView(d, user, await people(env, [d.a, d.b])) };
}

export async function listDuels(env, user) {
  const { results } = await env.DB.prepare('SELECT * FROM duels WHERE a = ? OR b = ? ORDER BY id DESC LIMIT 20').bind(user.id, user.id).all();
  const rows = await Promise.all(results.map((d) => settleExpired(env, d)));
  const ppl = await people(env, [...new Set(rows.flatMap((d) => [d.a, d.b]))]);
  const record = await env.DB.prepare(`SELECT SUM(winner = ?) AS won, SUM(winner IS NOT NULL AND winner != ? AND winner != 'draw') AS lost, SUM(winner = 'draw') AS draws
    FROM duels WHERE (a = ? OR b = ?) AND status != 'open'`).bind(user.id, user.id, user.id, user.id).first();
  return { duels: rows.map((d) => duelView(d, user, ppl)), record: { won: record?.won || 0, lost: record?.lost || 0, draws: record?.draws || 0 } };
}

export async function startDuel(env, user, id) {
  const d = await loadDuel(env, user, id);
  const side = d.a === user.id ? 'a' : 'b';
  if (d.status !== 'open') throw new HttpError(409, 'This duel is over');
  if (d[`${side}_score`] != null) throw new HttpError(409, 'You already played this duel');
  const row = d[`${side}_started`] ? d : await env.DB.prepare(`UPDATE duels SET ${side}_started = ? WHERE id = ? RETURNING *`).bind(Date.now(), d.id).first();
  return { duel: duelView(row, user, await people(env, [d.a, d.b])) };
}

export async function answerDuel(env, user, id, body) {
  const d = await loadDuel(env, user, id);
  const side = d.a === user.id ? 'a' : 'b';
  const other = side === 'a' ? 'b' : 'a';
  if (d.status !== 'open') throw new HttpError(409, 'This duel is over');
  if (!d[`${side}_started`]) throw new HttpError(409, 'Start the duel first');
  if (d[`${side}_score`] != null) return getDuel(env, user, id);
  const quiz = parse(d.quiz, []);
  const answers = (Array.isArray(body.answers) ? body.answers : []).slice(0, quiz.length).map((n) => (Number.isInteger(n) ? n : -1));
  const score = quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
  const ms = Math.max(2000, Math.min(quiz.length * DUEL.secondsEach * 1000 + 15_000, Date.now() - d[`${side}_started`]));
  let row = await env.DB.prepare(`UPDATE duels SET ${side}_answers = ?, ${side}_score = ?, ${side}_ms = ? WHERE id = ? AND ${side}_score IS NULL RETURNING *`)
    .bind(JSON.stringify(answers), score, ms, d.id).first();
  if (!row) return getDuel(env, user, id);
  const opponentId = row[other];
  if (row[`${other}_score`] != null) { // both played: who won?
    const a = { s: row.a_score, ms: row.a_ms };
    const b = { s: row.b_score, ms: row.b_ms };
    const winner = a.s !== b.s ? (a.s > b.s ? row.a : row.b) : a.ms !== b.ms ? (a.ms < b.ms ? row.a : row.b) : 'draw';
    row = await env.DB.prepare("UPDATE duels SET status = 'done', winner = ? WHERE id = ? AND status = 'open' RETURNING *").bind(winner, row.id).first() || row;
    if (row.status === 'done') {
      if (winner === 'draw') { await reward(env, row.a, DUEL.draw); await reward(env, row.b, DUEL.draw); }
      else { await reward(env, winner, DUEL.win, 'duelsWon'); await givePacks(env, winner, 1); await reward(env, winner === row.a ? row.b : row.a, DUEL.lose); }
      await pingUser(env, opponentId, 'duelResult', { who: user.username }, `./#duel=${row.id}`, '⚔️');
    }
  } else {
    await pingUser(env, opponentId, 'duelTurn', { who: user.username }, `./#duel=${row.id}`, '⚔️');
  }
  return { duel: duelView(row, user, await people(env, [row.a, row.b])) };
}

// ====================================================================================
// 📺 kerNEl Live: every day at 12:00 and 18:00 UTC. 10 questions, 12 seconds each; one wrong answer and you're out.
// ====================================================================================
export const LIVE = { slotsUtc: [12, 18], questions: 10, lobbyMs: 10 * 60_000, openMs: 12_000, revealMs: 5_000, resultsMs: 15 * 60_000, winXp: 60, triedXp: 15 };

/** Show timings. Tests set LIVE_TEST_PERIOD_MS to run a quick show every minute instead of twice a day. */
function liveCfg(env) {
  const period = Number(env?.LIVE_TEST_PERIOD_MS) || 0;
  if (!period) return { ...LIVE, period: 0 };
  const step = Number(env.LIVE_TEST_STEP_MS) || 2000;
  const openMs = Math.floor(step * 0.75);
  return { ...LIVE, period, lobbyMs: Math.floor(period * 0.4), openMs, revealMs: step - openMs, resultsMs: Math.floor(period * 0.15) };
}
const stepOf = (cfg) => cfg.openMs + cfg.revealMs;
const slotId = (start, cfg) => new Date(start).toISOString().slice(0, cfg.period ? 19 : 13);

export function liveSchedule(env, now = Date.now()) {
  const cfg = liveCfg(env);
  let starts;
  if (cfg.period) {
    const base = Math.floor(now / cfg.period) * cfg.period;
    starts = [-1, 0, 1, 2].map((k) => base + k * cfg.period);
  } else {
    const d = new Date(now);
    const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    starts = [-1, 0, 1].flatMap((k) => cfg.slotsUtc.map((h) => day0 + k * 864e5 + h * 3600_000)).sort((a, b) => a - b);
  }
  const showMs = cfg.questions * stepOf(cfg);
  const current = starts.find((s) => now >= s - cfg.lobbyMs && now < s + showMs + cfg.resultsMs) ?? null;
  const next = starts.find((s) => s - cfg.lobbyMs > now) ?? null;
  return { current, next, cfg };
}

function phaseAt(cfg, start, n, now) {
  const step = stepOf(cfg);
  const t = now - start;
  if (t < 0) return { phase: 'lobby', q: -1, deadline: start };
  if (t >= n * step) return { phase: 'done', q: n - 1, deadline: null };
  const q = Math.floor(t / step);
  const open = t - q * step < cfg.openMs;
  return { phase: open ? 'question' : 'reveal', q, deadline: start + q * step + (open ? cfg.openMs : step) };
}

async function liveQuiz(env, slot) {
  return (await kvGet(env, `live:${slot}`)) || kvOnce(env, `live:${slot}`, { questions: await questionsFor(env, `live:${slot}`, LIVE.questions) });
}

/** Who is still in after question q closed (worked out once, then remembered). */
async function survivors(env, slot, quiz, q) {
  const key = `live:${slot}:alive:${q}`;
  const cached = await kvGet(env, key);
  if (cached) return cached;
  const before = q === 0
    ? (await env.DB.prepare('SELECT user_id FROM live_players WHERE slot = ?').bind(slot).all()).results.map((r) => r.user_id)
    : await survivors(env, slot, quiz, q - 1);
  const { results } = await env.DB.prepare('SELECT user_id FROM live_answers WHERE slot = ? AND q = ? AND choice = ?').bind(slot, q, quiz.questions[q].answer).all();
  const right = new Set(results.map((r) => r.user_id));
  return kvOnce(env, key, before.filter((id) => right.has(id)));
}

async function currentShow(env, now) {
  const { current, next, cfg } = liveSchedule(env, now);
  if (current == null) return { cfg, next, current: null };
  const slot = slotId(current, cfg);
  const quiz = await liveQuiz(env, slot);
  return { cfg, next, current, slot, quiz, ...phaseAt(cfg, current, quiz.questions.length, now) };
}

export async function getLive(env, user) {
  const now = Date.now();
  const show = await currentShow(env, now);
  const { cfg } = show;
  const base = { now, next: show.next, slotsUtc: cfg.slotsUtc, total: LIVE.questions, openMs: cfg.openMs, revealMs: cfg.revealMs };
  if (show.current == null) return { ...base, phase: 'idle' };
  const { slot, quiz, phase, q, deadline } = show;
  const joined = (await env.DB.prepare('SELECT COUNT(*) AS n FROM live_players WHERE slot = ?').bind(slot).first())?.n || 0;
  const lastClosed = phase === 'question' ? q - 1 : q;
  const alive = lastClosed >= 0 ? await survivors(env, slot, quiz, lastClosed) : null;
  const out = { ...base, phase, slot, startsAt: show.current, q, deadline, total: quiz.questions.length, players: joined, alive: alive ? alive.length : joined };
  if (phase === 'question' || phase === 'reveal') out.question = publicQuestion(quiz.questions[q]);
  if (phase === 'reveal') {
    const { results } = await env.DB.prepare('SELECT choice, COUNT(*) AS n FROM live_answers WHERE slot = ? AND q = ? GROUP BY choice').bind(slot, q).all();
    const counts = (quiz.questions[q].options || []).map((_, i) => results.find((r) => r.choice === i)?.n || 0);
    out.reveal = { answer: quiz.questions[q].answer, counts };
  }
  if (user) {
    const inGame = !!(await env.DB.prepare('SELECT 1 AS y FROM live_players WHERE slot = ? AND user_id = ?').bind(slot, user.id).first());
    const mine = q >= 0 ? await env.DB.prepare('SELECT choice FROM live_answers WHERE slot = ? AND q = ? AND user_id = ?').bind(slot, q, user.id).first() : null;
    out.me = { joined: inGame, alive: inGame && (alive ? alive.includes(user.id) : true), choice: mine ? mine.choice : null };
  }
  if (phase === 'done') {
    const winners = alive || [];
    out.winners = Object.values(await people(env, winners.slice(0, 50)));
    out.winnerCount = winners.length;
    await payLive(env, slot, winners);
  }
  return out;
}

async function payLive(env, slot, winners) {
  const flag = await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(`live:${slot}:paid`, '1').first();
  if (!flag) return; // already paid
  for (const id of winners) await reward(env, id, LIVE.winXp, 'liveWins');
  // everyone else who played gets a little something for showing up
  const { results } = await env.DB.prepare('SELECT user_id FROM live_players WHERE slot = ?').bind(slot).all();
  const won = new Set(winners);
  for (const r of results) if (!won.has(r.user_id)) await reward(env, r.user_id, LIVE.triedXp);
}

export async function joinLive(env, user) {
  const now = Date.now();
  const show = await currentShow(env, now);
  if (show.current == null) throw new HttpError(409, 'There’s no show right now — come back for the next one!');
  if (!(show.phase === 'lobby' || (show.phase === 'question' && show.q === 0))) throw new HttpError(409, 'The show already started — join the next one!');
  await env.DB.prepare('INSERT OR IGNORE INTO live_players (slot, user_id, at) VALUES (?, ?, ?)').bind(show.slot, user.id, now).run();
  return getLive(env, user);
}

export async function answerLive(env, user, body) {
  const now = Date.now();
  const show = await currentShow(env, now);
  if (show.current == null) throw new HttpError(409, 'There’s no show right now — come back for the next one!');
  const { slot, quiz, phase, q } = show;
  if (phase !== 'question' || Number(body.q) !== q) throw new HttpError(409, 'Too late for that question!');
  const choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= quiz.questions[q].options.length) throw new HttpError(400, 'Pick one of the options');
  if (!(await env.DB.prepare('SELECT 1 AS y FROM live_players WHERE slot = ? AND user_id = ?').bind(slot, user.id).first())) throw new HttpError(403, 'Join the show first');
  if (q > 0 && !(await survivors(env, slot, quiz, q - 1)).includes(user.id)) throw new HttpError(403, 'You’re out of this show — watch and cheer!');
  await env.DB.prepare('INSERT OR IGNORE INTO live_answers (slot, q, user_id, choice, at) VALUES (?, ?, ?, ?, ?)').bind(slot, q, user.id, choice, now).run();
  return { ok: true, q, choice };
}

/** Cron: a reminder a few minutes before each show. */
export async function remindLive(env, budget) {
  const now = Date.now();
  const { next, current, cfg } = liveSchedule(env, now);
  if (cfg.period) return 0; // no reminders for test shows
  const start = [current, next].find((s) => s && s > now && s - now <= 6 * 60_000);
  if (!start) return 0;
  const flag = await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(`live:${slotId(start, cfg)}:reminded`, '1').first();
  if (!flag) return 0;
  const { results } = await env.DB.prepare(`SELECT DISTINCT u.id, u.profile FROM push_subs s JOIN users u ON u.id = s.user_id
    LEFT JOIN notify_prefs p ON p.user_id = u.id WHERE s.fails < 5 AND (p.games IS NULL OR p.games != 0) LIMIT 200`).all();
  let sent = 0;
  for (const u of results) {
    if (budget.left <= 0) break;
    const lang = langOfProfile(u.profile);
    sent += await notify(env, u.id, { kind: 'games', title: tr(lang, 'liveSoon'), body: tr(lang, 'liveSoonBody'), url: './#live', tag: 'live', icon: '📺' }, budget).catch(() => 0);
  }
  return sent;
}

// ====================================================================================
// 🔮 Predictions: call it before it happens. Automatic ones come from the news; moderators add their own.
// ====================================================================================
export const PREDICT = { xp: 15, autoPerDay: 2 };

function predictionView(p, votes, mine) {
  const options = parse(p.options, []);
  const counts = options.map((_, i) => votes.find((v) => v.choice === i)?.n || 0);
  return {
    id: p.id, kind: p.kind, question: p.question, options, data: parse(p.data, {}), storyKey: p.story_key || null, closes: p.closes, resolves: p.resolves,
    answer: p.answer, resolved: p.resolved, counts, total: counts.reduce((a, b) => a + b, 0), mine: mine ?? null,
  };
}

export async function listPredictions(env, user) {
  const now = Date.now();
  const { results: open } = await env.DB.prepare('SELECT * FROM predictions WHERE answer IS NULL ORDER BY closes ASC LIMIT 20').all();
  const { results: done } = await env.DB.prepare('SELECT * FROM predictions WHERE answer IS NOT NULL AND resolved > ? ORDER BY resolved DESC LIMIT 10').bind(now - 7 * 864e5).all();
  const all = [...open, ...done];
  const ids = all.map((p) => p.id);
  let counts = [];
  let mine = [];
  if (ids.length) {
    counts = (await env.DB.prepare(`SELECT pred_id, choice, COUNT(*) AS n FROM prediction_votes WHERE pred_id IN (${marks(ids)}) GROUP BY pred_id, choice`).bind(...ids).all()).results;
    if (user) mine = (await env.DB.prepare(`SELECT pred_id, choice FROM prediction_votes WHERE user_id = ? AND pred_id IN (${marks(ids)})`).bind(user.id, ...ids).all()).results;
  }
  const view = (p) => predictionView(p, counts.filter((c) => c.pred_id === p.id), mine.find((m) => m.pred_id === p.id)?.choice);
  let record = null;
  if (user) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS total, SUM(v.choice = p.answer) AS right FROM prediction_votes v JOIN predictions p ON p.id = v.pred_id WHERE v.user_id = ? AND p.answer IS NOT NULL').bind(user.id).first();
    record = { total: r?.total || 0, right: r?.right || 0 };
  }
  return { open: open.map(view), resolved: done.map(view), record, xp: PREDICT.xp, now };
}

export async function votePrediction(env, user, body) {
  const p = await env.DB.prepare('SELECT * FROM predictions WHERE id = ?').bind(Number(body.id)).first();
  if (!p) throw new HttpError(404, 'Prediction not found');
  if (p.answer != null || Date.now() > p.closes) throw new HttpError(409, 'Voting closed for this one');
  const choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= parse(p.options, []).length) throw new HttpError(400, 'Pick one of the options');
  await env.DB.prepare('INSERT OR REPLACE INTO prediction_votes (pred_id, user_id, choice, at) VALUES (?, ?, ?, ?)').bind(p.id, user.id, choice, Date.now()).run();
  return listPredictions(env, user);
}

async function payPrediction(env, p, answer) {
  const row = await env.DB.prepare('UPDATE predictions SET answer = ?, resolved = ? WHERE id = ? AND answer IS NULL RETURNING id').bind(answer, Date.now(), p.id).first();
  if (!row) return 0;
  const { results } = await env.DB.prepare('SELECT user_id FROM prediction_votes WHERE pred_id = ? AND choice = ?').bind(p.id, answer).all();
  for (const v of results) { await reward(env, v.user_id, PREDICT.xp, 'prophet'); await givePacks(env, v.user_id, 1); }
  return results.length;
}

/** Cron: once a day, ask "will this story hit N upvotes by tomorrow?" about two fresh Hacker News stories. */
export async function makeAutoPredictions(env) {
  const key = `pred:auto:${day()}`;
  if (await env.DB.prepare('SELECT 1 AS y FROM kv WHERE k = ?').bind(key).first()) return 0;
  const { results } = await env.DB.prepare(`SELECT key, title, url, points, comments_url FROM stories WHERE comments_url LIKE '%news.ycombinator.com/item?id=%'
    AND time > ? AND points BETWEEN 15 AND 200 ORDER BY points DESC LIMIT 30`).bind(Date.now() - 8 * 3600_000).all();
  const picks = results.filter((s) => s.title.length >= 20 && s.title.length <= 120).slice(0, PREDICT.autoPerDay);
  if (!picks.length) return 0; // try again on the next run
  if (!(await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(key, '1').first())) return 0;
  const now = Date.now();
  for (const s of picks) {
    const threshold = Math.max(100, Math.ceil((s.points * 2.5) / 50) * 50);
    await env.DB.prepare(`INSERT INTO predictions (question, options, kind, story_key, data, closes, resolves, created_by, created) VALUES (?, ?, 'upvotes', ?, ?, ?, ?, 'kerNEl', ?)`)
      .bind(s.title, JSON.stringify(['Yes', 'No']), s.key, JSON.stringify({ threshold, start: s.points, url: s.url, hn: s.comments_url }), now + 12 * 3600_000, now + 24 * 3600_000, now).run();
  }
  return picks.length;
}

/** Cron: settle automatic predictions that are due (checks the real upvote count on Hacker News). */
export async function resolveAutoPredictions(env) {
  const { results } = await env.DB.prepare("SELECT * FROM predictions WHERE kind = 'upvotes' AND answer IS NULL AND resolves <= ? LIMIT 10").bind(Date.now()).all();
  let n = 0;
  for (const p of results) {
    const data = parse(p.data, {});
    let points = (await env.DB.prepare('SELECT points FROM stories WHERE key = ?').bind(p.story_key).first())?.points || 0;
    const id = String(data.hn || '').match(/id=(\d+)/)?.[1];
    if (id) {
      try { const r = await fetchWithTimeout(`https://hn.algolia.com/api/v1/items/${id}`, 8000); if (r.ok) points = Math.max(points, Number((await r.json()).points) || 0); } catch { /* use what we have */ }
    }
    await payPrediction(env, p, points >= data.threshold ? 0 : 1);
    await env.DB.prepare('UPDATE predictions SET data = ? WHERE id = ?').bind(JSON.stringify({ ...data, final: points }), p.id).run();
    n++;
  }
  return n;
}

export async function modCreatePrediction(env, admin, body) {
  const question = String(body.question || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const options = (Array.isArray(body.options) ? body.options : []).map((o) => String(o || '').trim().slice(0, 50)).filter(Boolean).slice(0, 4);
  if (question.length < 8) throw new HttpError(400, 'Write a question first');
  if (options.length < 2) throw new HttpError(400, 'Give at least two answers');
  const hours = Math.max(1, Math.min(24 * 60, Number(body.hours) || 48));
  const now = Date.now();
  const row = await env.DB.prepare(`INSERT INTO predictions (question, options, kind, data, closes, resolves, created_by, created) VALUES (?, ?, 'mod', '{}', ?, ?, ?, ?) RETURNING *`)
    .bind(question, JSON.stringify(options), now + hours * 3600_000, now + hours * 3600_000, admin.username, now).first();
  return { prediction: predictionView(row, [], null) };
}

export async function modResolvePrediction(env, admin, body) {
  const p = await env.DB.prepare('SELECT * FROM predictions WHERE id = ?').bind(Number(body.id)).first();
  if (!p) throw new HttpError(404, 'Prediction not found');
  const answer = Number(body.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= parse(p.options, []).length) throw new HttpError(400, 'Pick one of the options');
  const winners = await payPrediction(env, p, answer);
  return { ok: true, winners };
}

// ====================================================================================
// 🏅 Seasons: a fresh race every month. XP earned this month counts; the top 3 get prizes on the 1st.
// ====================================================================================
export const SEASON = { prizes: [200, 100, 50] };
export const currentSeason = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);
export const seasonEnds = (now = Date.now()) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
const previousSeason = (now = Date.now()) => { const d = new Date(now); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); };

/** Called whenever someone's XP goes up. */
export function seasonUpdate(env, user, gained) {
  const s = currentSeason();
  return env.DB.prepare('UPDATE users SET season_xp = CASE WHEN season = ? THEN season_xp + ? ELSE ? END, season = ? WHERE id = ?').bind(s, gained, gained, s, user.id);
}

export async function seasonBoard(env, user) {
  const s = currentSeason();
  const { results } = await env.DB.prepare('SELECT id, username, profile, season_xp, streak, last_day FROM users WHERE on_board = 1 AND season = ? AND season_xp > 0 ORDER BY season_xp DESC, updated ASC LIMIT 20').bind(s).all();
  const ppl = await people(env, results.map((r) => r.id));
  const top = results.map((r, i) => ({ place: i + 1, ...ppl[r.id], xp: r.season_xp, streak: r.last_day >= day(1) ? r.streak : 0 }));
  let me = null;
  if (user) {
    const mine = user.season === s ? user.season_xp || 0 : 0;
    const ahead = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE on_board = 1 AND season = ? AND season_xp > ?').bind(s, mine).first();
    me = { xp: mine, place: user.on_board && mine > 0 ? (ahead?.n || 0) + 1 : null, onBoard: !!user.on_board };
  }
  return { season: s, endsAt: seasonEnds(), prizes: SEASON.prizes, top, me };
}

/** Cron: on the 1st, crown last month's top 3. */
export async function awardSeason(env) {
  const prev = previousSeason();
  const key = `season:${prev}:awarded`;
  if (await env.DB.prepare('SELECT 1 AS y FROM kv WHERE k = ?').bind(key).first()) return 0;
  const { results } = await env.DB.prepare('SELECT id, profile, season_xp FROM users WHERE season = ? AND season_xp > 0 AND on_board = 1 ORDER BY season_xp DESC, updated ASC LIMIT 3').bind(prev).all();
  if (!results.length) return 0;
  if (!(await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(key, '1').first())) return 0;
  for (const [i, u] of results.entries()) {
    await env.DB.prepare('INSERT OR REPLACE INTO season_winners (season, place, user_id, xp) VALUES (?, ?, ?, ?)').bind(prev, i + 1, u.id, u.season_xp).run();
    await reward(env, u.id, SEASON.prizes[i], 'seasonWins');
    const lang = langOfProfile(u.profile);
    await notify(env, u.id, { kind: 'friends', title: tr(lang, 'seasonWin', { place: i + 1 }), body: tr(lang, 'seasonWinBody', { xp: SEASON.prizes[i] }), url: './#season', tag: 'season', icon: '🏅' }, { left: 3 }).catch(() => 0);
  }
  return results.length;
}

export async function seasonMedals(env, userId) {
  const { results } = await env.DB.prepare('SELECT season, place FROM season_winners WHERE user_id = ? ORDER BY season DESC LIMIT 24').bind(userId).all();
  return results;
}
