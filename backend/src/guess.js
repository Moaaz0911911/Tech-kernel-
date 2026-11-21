// 🔤 Emoji Headlines and 🌫️ Blur Reveal: two daily guessing games, the same rounds for everyone, one go a day.
// Faster right answers score more. Answers stay on the server until you've played.
import { HttpError } from './util.js';
import { recentStories, snap, kvGet, kvOnce, people, today } from './play.js';
import { seeded, shuffle } from '../../js/fakes.js';
import { emojify } from '../../js/emoji.js';
import { givePacks } from './cards.js';

export const GUESS = { rounds: 5, seconds: 15, kinds: ['emoji', 'blur'] };
const emojiCount = (s) => s.split(' ').filter((e) => e && e !== '🤷').length;

function makeRounds(kind, stories, d) {
  const rand = seeded(`guess:${kind}:${d}`);
  const pool = shuffle(stories, rand);
  const fit = kind === 'emoji'
    ? pool.filter((s) => emojiCount(emojify(s.title)) >= 2).sort((a, b) => emojiCount(emojify(b.title)) - emojiCount(emojify(a.title))) // the most telling first
    : pool.filter((s) => /^https:\/\//.test(s.image || ''));
  const answers = fit.slice(0, GUESS.rounds);
  if (answers.length < GUESS.rounds) return null;
  const used = new Set(answers.map((s) => s.key));
  const decoys = pool.filter((s) => !used.has(s.key));
  if (decoys.length < 3) return null;
  return answers.map((s) => {
    const wrong = shuffle(decoys.filter((d) => d.title !== s.title), rand).slice(0, 3); // wrong answers may repeat between rounds
    const options = shuffle([s, ...wrong], rand);
    return {
      clue: kind === 'emoji' ? emojify(s.title) : s.image,
      options: options.map((o) => o.title), answer: options.indexOf(s), story: snap(s),
    };
  });
}

async function roundsFor(env, kind, d) {
  const key = `guess:${kind}:${d}`;
  const have = await kvGet(env, key);
  if (have) return have;
  const stories = await recentStories(env);
  const rounds = makeRounds(kind, stories, d);
  if (!rounds) throw new HttpError(503, 'Today’s game is still popping — try again in a minute!');
  return kvOnce(env, key, { kind, day: d, rounds });
}

const points = (right, ms) => (right ? 20 + Math.round(80 * (1 - Math.min(ms, GUESS.seconds * 1000) / (GUESS.seconds * 1000))) : 0);
const publicRound = ({ answer, story, ...r }) => r;
const reveal = (g) => ({ correct: g.rounds.map((r) => r.answer), stories: g.rounds.map((r) => r.story) });

export async function guessBoard(env, kind, d = today()) {
  const { results } = await env.DB.prepare('SELECT user_id, score, correct FROM guess_scores WHERE kind = ? AND day = ? AND score IS NOT NULL ORDER BY score DESC, at ASC LIMIT 10').bind(kind, d).all();
  const who = await people(env, results.map((r) => r.user_id));
  return results.filter((r) => who[r.user_id]).map((r, n) => ({ place: n + 1, ...who[r.user_id], score: r.score, right: r.correct }));
}

export async function getGuess(env, user, kind) {
  if (!GUESS.kinds.includes(kind)) throw new HttpError(404, 'Unknown game');
  const d = today();
  const g = await roundsFor(env, kind, d);
  let played = null;
  if (user) {
    const row = await env.DB.prepare('SELECT score, correct, answers FROM guess_scores WHERE kind = ? AND day = ? AND user_id = ?').bind(kind, d, user.id).first();
    if (row?.score != null) played = { score: row.score, right: row.correct, answers: JSON.parse(row.answers || '[]'), ...reveal(g) };
  }
  return { kind, day: d, seconds: GUESS.seconds, rounds: g.rounds.map(publicRound), played, board: await guessBoard(env, kind, d) };
}

/** Start the clock (so the times you send can be checked). */
export async function startGuess(env, user, kind) {
  if (!GUESS.kinds.includes(kind)) throw new HttpError(404, 'Unknown game');
  await env.DB.prepare('INSERT OR IGNORE INTO guess_scores (kind, day, user_id, started) VALUES (?, ?, ?, ?)').bind(kind, today(), user.id, Date.now()).run();
  return { ok: true };
}

/** body.answers: [{ pick, ms }] for each round. */
export async function answerGuess(env, user, kind, body) {
  if (!GUESS.kinds.includes(kind)) throw new HttpError(404, 'Unknown game');
  const d = today();
  const g = await kvGet(env, `guess:${kind}:${d}`);
  if (!g) throw new HttpError(409, 'Open the game first');
  const row = await env.DB.prepare('SELECT started, score FROM guess_scores WHERE kind = ? AND day = ? AND user_id = ?').bind(kind, d, user.id).first();
  if (!row) throw new HttpError(409, 'Start the game first');
  if (row.score != null) return { already: true, ...(await getGuess(env, user, kind)) };
  const raw = (Array.isArray(body.answers) ? body.answers : []).slice(0, g.rounds.length);
  // times can't add up to more than the time that really passed since you pressed start
  let budget = Date.now() - row.started + 1500;
  const answers = g.rounds.map((r, n) => {
    const a = raw[n] || {};
    const pick = Number.isInteger(a.pick) ? a.pick : -1;
    const ms = Math.min(GUESS.seconds * 1000, Math.max(700, Math.round(Number(a.ms) || GUESS.seconds * 1000)));
    budget -= ms;
    return { pick, ms };
  });
  const honest = budget >= 0;
  const scored = answers.map((a, n) => points(a.pick === g.rounds[n].answer, honest ? a.ms : GUESS.seconds * 1000));
  const score = scored.reduce((x, y) => x + y, 0);
  const correct = answers.filter((a, n) => a.pick === g.rounds[n].answer).length;
  const saved = await env.DB.prepare('UPDATE guess_scores SET score = ?, correct = ?, answers = ?, at = ? WHERE kind = ? AND day = ? AND user_id = ? AND score IS NULL RETURNING score')
    .bind(score, correct, JSON.stringify(answers.map((a) => a.pick)), Date.now(), kind, d, user.id).first();
  if (saved && correct === g.rounds.length) await givePacks(env, user.id, 1); // a perfect game earns a card pack
  return { score, right: correct, total: g.rounds.length, perRound: scored, answers: answers.map((a) => a.pick), ...reveal(g), board: await guessBoard(env, kind, d), pack: !!saved && correct === g.rounds.length };
}
