// kerNEl games on the server: the Daily Kernel Quiz, Popcorn Battles and the weekly Real or Fake? tournament.
// Questions and answers live here, so nobody can peek at the answers in the browser.
import { HttpError } from './util.js';
import { rowToStory } from './news.js';
import { notify } from './push.js';
import { look, recordActivity } from './social.js';
import { tr, langOfProfile } from './i18n.js';
import { fakeHeadlines, seeded, shuffle, GIVEAWAY } from '../../js/fakes.js';
import { CATEGORIES } from '../../js/news.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
export const today = () => new Date().toISOString().slice(0, 10);
const dayBefore = (day) => new Date(Date.parse(`${day}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
const SOURCE_NAMES = ['Hacker News', 'DEV Community', 'The Verge', 'TechCrunch', 'Ars Technica', 'Engadget', 'Wired'];
const STOP = new Set('the and for with from that this your how why what new are was will you into over about after just more than have has its their they them our out can get now all one two use using via'.split(' '));

async function kvGet(env, k) { const r = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first(); return r ? parse(r.v, null) : null; }
/** Store once: if someone else made it first, theirs wins (so everyone sees the same game). */
async function kvOnce(env, k, value) {
  await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?)').bind(k, JSON.stringify(value)).run();
  return kvGet(env, k);
}
async function recentStories(env, hours = 36, limit = 300) {
  let { results } = await env.DB.prepare('SELECT * FROM stories WHERE time > ? ORDER BY points DESC LIMIT ?').bind(Date.now() - hours * 3600_000, limit).all();
  if (results.length < 12) ({ results } = await env.DB.prepare('SELECT * FROM stories ORDER BY time DESC LIMIT ?').bind(limit).all());
  return results.map(rowToStory).filter((s) => s.title && s.title.length >= 20 && s.title.length <= 140 && !GIVEAWAY.test(s.title));
}
const snap = (s) => ({ key: s.key, title: s.title, url: s.url, source: s.source, cat: s.cat, image: s.image || null, domain: s.domain, points: s.points || 0, comments: s.comments || 0, time: s.time });
const people = async (env, ids) => {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT id, username, profile FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  return Object.fromEntries(results.map((r) => { const p = parse(r.profile, {}); return [r.id, { username: r.username, nickname: p.nickname || r.username, ...look(p) }]; }));
};

// ====================================================================================
// 🧠 Daily Kernel Quiz: 5 questions made from today's headlines
// ====================================================================================
function makeQuiz(stories, day) {
  const rand = seeded(`quiz:${day}`);
  const pool = shuffle(stories, rand);
  const used = new Set();
  const take = (ok) => { const s = pool.find((x) => !used.has(x.key) && ok(x)); if (s) used.add(s.key); return s; };
  const questions = [];

  // 1. fill in the missing word
  const words = (t) => (t.match(/[A-Za-z][A-Za-z0-9+#.-]{4,14}/g) || []).filter((w) => !STOP.has(w.toLowerCase()) && !/\.$/.test(w));
  const m = take((s) => words(s.title).length >= 1);
  if (m) {
    const answer = words(m.title).sort((a, b) => b.length - a.length)[0];
    const others = shuffle([...new Set(pool.filter((s) => s.key !== m.key).flatMap((s) => words(s.title)))].filter((w) => w.toLowerCase() !== answer.toLowerCase()), rand).slice(0, 3);
    if (others.length === 3) {
      const options = shuffle([answer, ...others], rand);
      questions.push({ type: 'missing', headline: m.title.replace(answer, '_____'), options, answer: options.indexOf(answer), story: snap(m) });
    }
  }
  // 2. which category?
  const c = take((s) => !!s.cat && s.cat !== 'dev');
  if (c) {
    const options = shuffle([c.cat, ...shuffle(CATEGORIES.map((x) => x.id).filter((id) => id !== c.cat), rand).slice(0, 3)], rand);
    questions.push({ type: 'category', headline: c.title, options, answer: options.indexOf(c.cat), story: snap(c) });
  }
  // 3. who published it?
  const s3 = take((s) => SOURCE_NAMES.includes(s.source));
  if (s3) {
    const options = shuffle([s3.source, ...shuffle(SOURCE_NAMES.filter((n) => n !== s3.source), rand).slice(0, 3)], rand);
    questions.push({ type: 'source', headline: s3.title, options, answer: options.indexOf(s3.source), story: snap(s3) });
  }
  // 4. which got more upvotes?
  const a = take((s) => s.points >= 20);
  const b = a && take((s) => s.points >= 5 && Math.abs(s.points - a.points) >= Math.max(15, a.points * 0.25));
  if (a && b) {
    const options = shuffle([a, b], rand);
    questions.push({ type: 'hotter', options: options.map((s) => s.title), answer: options[0].points > options[1].points ? 0 : 1, stories: options.map(snap) });
  }
  // 5. spot the fake
  const real = [take(() => true), take(() => true), take(() => true)].filter(Boolean);
  if (real.length === 3) {
    const fake = fakeHeadlines(1, rand)[0];
    const options = shuffle([...real.map((s) => s.title), fake], rand);
    questions.push({ type: 'fake', options, answer: options.indexOf(fake), stories: real.map(snap) });
  }
  return { day, questions: questions.slice(0, 5) };
}

const publicQuestion = ({ answer, story, stories, ...q }) => q;

export async function getQuiz(env, user) {
  const day = today();
  let quiz = await kvGet(env, `quiz:${day}`);
  if (!quiz) {
    const stories = await recentStories(env);
    if (stories.length < 8) throw new HttpError(503, 'The quiz is still popping — try again in a minute!');
    quiz = await kvOnce(env, `quiz:${day}`, makeQuiz(stories, day));
  }
  let played = null;
  if (user) {
    await env.DB.prepare('INSERT OR IGNORE INTO quiz_scores (day, user_id, started) VALUES (?, ?, ?)').bind(day, user.id, Date.now()).run();
    const row = await env.DB.prepare('SELECT score, ms, answers FROM quiz_scores WHERE day = ? AND user_id = ?').bind(day, user.id).first();
    if (row?.score != null) played = { score: row.score, ms: row.ms, answers: parse(row.answers, []), ...reveal(quiz) };
  }
  return { day, total: quiz.questions.length, questions: quiz.questions.map(publicQuestion), played, board: await quizBoard(env, day) };
}

const reveal = (quiz) => ({ correct: quiz.questions.map((q) => q.answer), stories: quiz.questions.map((q) => q.story || q.stories || null) });

export async function answerQuiz(env, user, body) {
  const day = today();
  const quiz = await kvGet(env, `quiz:${day}`);
  if (!quiz) throw new HttpError(409, 'Open the quiz first');
  const answers = (Array.isArray(body.answers) ? body.answers : []).slice(0, quiz.questions.length).map((n) => (Number.isInteger(n) ? n : -1));
  const score = quiz.questions.reduce((sum, q, i) => sum + (answers[i] === q.answer ? 1 : 0), 0);
  if (!user) return { score, total: quiz.questions.length, answers, ...reveal(quiz), saved: false };
  const row = await env.DB.prepare('SELECT started, score FROM quiz_scores WHERE day = ? AND user_id = ?').bind(day, user.id).first();
  if (row?.score != null) { // one go per day
    const prev = await env.DB.prepare('SELECT score, ms, answers FROM quiz_scores WHERE day = ? AND user_id = ?').bind(day, user.id).first();
    return { score: prev.score, ms: prev.ms, total: quiz.questions.length, answers: parse(prev.answers, []), ...reveal(quiz), already: true, board: await quizBoard(env, day) };
  }
  const ms = Math.max(3000, Date.now() - (row?.started || Date.now() - 120_000));
  await env.DB.prepare(`INSERT INTO quiz_scores (day, user_id, started, score, ms, answers, at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day, user_id) DO UPDATE SET score = excluded.score, ms = excluded.ms, answers = excluded.answers, at = excluded.at`)
    .bind(day, user.id, row?.started || Date.now(), score, ms, JSON.stringify(answers), Date.now()).run();
  await recordActivity(env, user, [{ kind: 'quiz', data: { score, total: quiz.questions.length } }]);
  return { score, ms, total: quiz.questions.length, answers, ...reveal(quiz), saved: true, board: await quizBoard(env, day) };
}

export async function quizBoard(env, day = today()) {
  const { results } = await env.DB.prepare('SELECT user_id, score, ms FROM quiz_scores WHERE day = ? AND score IS NOT NULL ORDER BY score DESC, ms ASC, at ASC LIMIT 10').bind(day).all();
  const who = await people(env, results.map((r) => r.user_id));
  return results.filter((r) => who[r.user_id]).map((r, i) => ({ place: i + 1, ...who[r.user_id], score: r.score, ms: r.ms }));
}

// ====================================================================================
// 🍿 Popcorn Battles: two stories, one winner a day → yesterday's winner is Story of the Day
// ====================================================================================
async function battleFor(env, day, create) {
  const have = await kvGet(env, `battle:${day}`);
  if (have || !create) return have;
  const stories = (await recentStories(env, 30)).sort((a, b) => (b.points + b.comments) - (a.points + a.comments));
  const a = stories[0];
  const b = stories.find((s) => s.key !== a?.key && s.cat !== a?.cat) || stories[1];
  if (!a || !b) return null;
  return kvOnce(env, `battle:${day}`, { day, a: snap(a), b: snap(b) });
}

async function battleVotes(env, day) {
  const { results } = await env.DB.prepare('SELECT pick, COUNT(*) AS n FROM battle_votes WHERE day = ? GROUP BY pick').bind(day).all();
  return { a: results.find((r) => r.pick === 'a')?.n || 0, b: results.find((r) => r.pick === 'b')?.n || 0 };
}

export async function getBattle(env, user) {
  const day = today();
  const battle = await battleFor(env, day, true);
  if (!battle) throw new HttpError(503, 'The battle arena is still being built — try again in a minute!');
  const votes = await battleVotes(env, day);
  const mine = user ? (await env.DB.prepare('SELECT pick FROM battle_votes WHERE day = ? AND user_id = ?').bind(day, user.id).first())?.pick || null : null;
  const prev = await battleFor(env, dayBefore(day), false);
  let champion = null;
  if (prev) {
    const v = await battleVotes(env, prev.day);
    if (v.a + v.b > 0) champion = { day: prev.day, story: v.a >= v.b ? prev.a : prev.b, votes: Math.max(v.a, v.b), total: v.a + v.b };
  }
  return { day, a: battle.a, b: battle.b, votes, mine, champion, endsAt: Date.parse(`${day}T00:00:00Z`) + 864e5 };
}

export async function voteBattle(env, user, body) {
  const pick = body.pick === 'a' || body.pick === 'b' ? body.pick : null;
  if (!pick) throw new HttpError(400, 'Pick one of the options');
  await getBattle(env, user); // makes sure today's battle exists
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO battle_votes (day, user_id, pick, at) VALUES (?, ?, ?, ?) RETURNING pick').bind(today(), user.id, pick, Date.now()).first();
  return { ...(await getBattle(env, user)), firstVote: !!fresh };
}

// ====================================================================================
// 🏆 Weekly Real or Fake? tournament: same 8 headlines for everyone, one go each, trophies for the top 3
// ====================================================================================
export function weekOf(t = Date.now()) {
  const d = new Date(t);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 864e5;
  return { week: new Date(monday).toISOString().slice(0, 10), starts: monday, ends: monday + 7 * 864e5 };
}

async function tourneyFor(env, week, create) {
  const have = await kvGet(env, `tourney:${week.week}`);
  if (have || !create) return have;
  const rand = seeded(`tourney:${week.week}`);
  const pool = (await recentStories(env, 24 * 7)).filter((s) => s.title.length >= 30 && s.title.length <= 110);
  if (pool.length < 5) return null;
  const real = shuffle(pool, rand).slice(0, 5).map((s) => ({ title: s.title, real: true, story: snap(s) }));
  const fakes = fakeHeadlines(3, rand).map((title) => ({ title, real: false }));
  const items = shuffle([...real, ...fakes], rand).map((x, i) => ({ id: i + 1, ...x }));
  return kvOnce(env, `tourney:${week.week}`, { week: week.week, items });
}

async function tourneyBoard(env, week) {
  const { results } = await env.DB.prepare('SELECT user_id, score FROM tourney_scores WHERE week = ? ORDER BY score DESC, at ASC LIMIT 10').bind(week).all();
  const who = await people(env, results.map((r) => r.user_id));
  return results.filter((r) => who[r.user_id]).map((r, i) => ({ place: i + 1, ...who[r.user_id], score: r.score }));
}

const tourneyReveal = (t) => t.items.map(({ id, real, story }) => ({ id, real, story: story || null }));

export async function getTournament(env, user) {
  const w = weekOf();
  await awardTrophies(env).catch((e) => console.error('trophies', e));
  const t = await tourneyFor(env, w, true);
  if (!t) throw new HttpError(503, 'This week’s tournament is still popping — try again in a minute!');
  let played = null;
  if (user) {
    const row = await env.DB.prepare('SELECT score, answers FROM tourney_scores WHERE week = ? AND user_id = ?').bind(w.week, user.id).first();
    if (row) played = { score: row.score, answers: parse(row.answers, {}), reveal: tourneyReveal(t) };
  }
  const last = await kvGet(env, `trophies:${weekOf(w.starts - 1).week}`);
  return {
    week: w.week, endsAt: w.ends, total: t.items.length, items: t.items.map(({ id, title }) => ({ id, title })), played,
    board: await tourneyBoard(env, w.week),
    lastWinners: last?.winners || [],
  };
}

export async function playTournament(env, user, body) {
  const w = weekOf();
  const t = await tourneyFor(env, w, false);
  if (!t) throw new HttpError(409, 'Open the tournament first');
  const answers = {};
  for (const it of t.items) { const a = body.answers?.[it.id]; answers[it.id] = a === 'real' || a === 'fake' ? a : null; }
  const score = t.items.reduce((s, it) => s + ((answers[it.id] === 'real') === it.real && answers[it.id] ? 1 : 0), 0);
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO tourney_scores (week, user_id, score, answers, at) VALUES (?, ?, ?, ?, ?) RETURNING score')
    .bind(w.week, user.id, score, JSON.stringify(answers), Date.now()).first();
  if (!fresh) {
    const row = await env.DB.prepare('SELECT score, answers FROM tourney_scores WHERE week = ? AND user_id = ?').bind(w.week, user.id).first();
    return { already: true, score: row.score, total: t.items.length, answers: parse(row.answers, {}), reveal: tourneyReveal(t), board: await tourneyBoard(env, w.week) };
  }
  await recordActivity(env, user, [{ kind: 'tourney', data: { score, total: t.items.length } }]);
  return { score, total: t.items.length, answers, reveal: tourneyReveal(t), board: await tourneyBoard(env, w.week) };
}

/** Once a week ends, its top 3 get trophies (and a notification). Safe to call often. */
export async function awardTrophies(env) {
  const last = weekOf(weekOf().starts - 1);
  if (await kvGet(env, `trophies:${last.week}`)) return 0;
  const { results } = await env.DB.prepare('SELECT user_id, score FROM tourney_scores WHERE week = ? AND score > 0 ORDER BY score DESC, at ASC LIMIT 3').bind(last.week).all();
  const who = await people(env, results.map((r) => r.user_id));
  const winners = results.filter((r) => who[r.user_id]).map((r, i) => ({ place: i + 1, ...who[r.user_id], score: r.score, id: r.user_id }));
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(`trophies:${last.week}`, JSON.stringify({ week: last.week, winners: winners.map(({ id, ...w }) => w) })).first();
  if (!fresh) return 0; // someone else is handing them out
  for (const w of winners) {
    await env.DB.prepare('INSERT OR IGNORE INTO trophies (user_id, week, place, score) VALUES (?, ?, ?, ?)').bind(w.id, last.week, w.place, w.score).run();
    const u = await env.DB.prepare('SELECT id, username, profile FROM users WHERE id = ?').bind(w.id).first();
    if (!u) continue;
    const lang = langOfProfile(u.profile);
    await recordActivity(env, u, [{ kind: 'trophy', data: { place: w.place, week: last.week } }]);
    await notify(env, u.id, { kind: 'friends', title: tr(lang, 'trophyTitle', { place: w.place }), body: tr(lang, 'trophyBody'), url: `./#user=${u.username}`, tag: 'trophy', icon: '🏆' }, { left: 5 });
  }
  return winners.length;
}

export async function trophiesOf(env, userId) {
  const { results } = await env.DB.prepare('SELECT week, place FROM trophies WHERE user_id = ? ORDER BY week DESC LIMIT 50').bind(userId).all();
  return results;
}
