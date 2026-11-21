// 🎯 Tech Bingo: a weekly 5×5 card of things that might happen in tech news. Squares fill in by themselves
// when a matching headline shows up; lines and a full card win XP (and bonus card packs).
import { weekOf, people, kvGet } from './play.js';
import { seeded, shuffle } from '../../js/fakes.js';
import { reward } from './rewards.js';
import { givePacks } from './cards.js';

// [id, label, …patterns that must all match the headline]
export const BINGO_EVENTS = [
  ['ai-launch', '🤖 A new AI model launches', [/\b(model|LLM|GPT|Gemini|Claude|Llama)\b/i, /\b(launch|releas|unveil|introduc|announc|ships?\b)/i]],
  ['breach', '🔓 A hack or data leak', [/\b(breach|hack(ed|ers?)?|leak(ed|s)?|ransomware)\b/i]],
  ['delay', '⏳ Something gets delayed', [/\b(delay(ed|s)?|postpone[ds]?)\b/i]],
  ['layoffs', '📦 Layoffs at a tech company', [/\b(layoffs?|lays? off|job cuts)\b/i]],
  ['crypto', '🪙 Crypto news', [/\b(bitcoin|crypto|ethereum|blockchain)\b/i]],
  ['rocket', '🚀 A rocket launch', [/\b(rocket|starship|falcon|launch(es|ed)?)\b/i, /\b(space|rocket|orbit|nasa|spacex|moon|mars|starship)\b/i]],
  ['apple', '🍎 Apple news', [/\b(Apple|iPhone|iPad|MacBook|iOS|macOS)\b/]],
  ['google', '🔍 Google news', [/\b(Google|Android|Gemini|Chrome|YouTube)\b/]],
  ['microsoft', '🪟 Microsoft news', [/\b(Microsoft|Windows|Xbox|Azure|GitHub)\b/]],
  ['opensource', '🔓 An open-source release', [/\bopen[ -]source\b/i]],
  ['lawsuit', '⚖️ A lawsuit or a fine', [/\b(sues?|sued|lawsuit|fined?|antitrust|court)\b/i]],
  ['billion', '💰 A billion-dollar story', [/\bbillions?\b/i]],
  ['funding', '💸 A startup raises money', [/\b(raises?|funding|series [a-d])\b/i]],
  ['gaming', '🎮 Big gaming news', [/\b(game|gaming|console|nintendo|playstation|xbox|steam)\b/i]],
  ['ev', '🚗 Electric car news', [/\b(electric (car|vehicle|truck)s?|EVs?|Tesla)\b/]],
  ['phone', '📱 A new phone', [/\b(phone|smartphone|iPhone|Pixel|Galaxy)\b/i]],
  ['chips', '🍟 Computer chip news', [/\b(chips?|semiconductors?|GPUs?|CPUs?|processors?)\b/i]],
  ['robot', '🦾 Robots!', [/\b(robots?|robotics|humanoid)\b/i]],
  ['quantum', '⚛️ Quantum computing', [/\bquantum\b/i]],
  ['privacy', '🙈 A privacy fight', [/\b(privacy|tracking|surveillance)\b/i]],
  ['outage', '💥 Something goes down', [/\b(outage|goes down|went down|crash(es|ed)?|offline)\b/i]],
  ['rust', '🦀 Rust news', [/\bRust\b/]],
  ['linux', '🐧 Linux news', [/\bLinux\b/i]],
  ['python', '🐍 Python news', [/\bPython\b/i]],
  ['vr', '🥽 VR or AR headsets', [/\b(VR|AR|headset|Vision Pro|Quest)\b/]],
  ['climate', '🌡️ Climate tech', [/\b(climate|solar|wind power|carbon|nuclear|fusion)\b/i]],
  ['science', '🔬 A science discovery', [/\b(scientists?|researchers?|discover(s|ed|y)?|study)\b/i]],
  ['health', '🩺 Health tech', [/\b(health|medical|doctors?|cancer|disease|brain)\b/i]],
  ['ban', '🚫 Something gets banned', [/\b(bans?|banned|blocks|blocked)\b/i]],
  ['record', '🏅 A new record', [/\brecords?\b/i]],
  ['first', '🥇 A world first', [/\b(first[- ]ever|world'?s first|for the first time)\b/i]],
  ['ceo', '👔 A CEO in the news', [/\bCEO\b/]],
  ['deal', '🤝 One company buys another', [/\b(acquires?|acquired|acquisition|buys|to buy)\b/i]],
  ['update', '🔄 A big software update', [/\b(update|version \d|v\d+(\.\d+)?|\d+\.\d+ (is )?released)\b/i]],
  ['askhn', '❓ An “Ask HN” question', [/^Ask HN\b/]],
  ['showhn', '🛠️ A “Show HN” project', [/^Show HN\b/]],
  ['browser', '🧭 Web browser news', [/\b(browsers?|Chrome|Firefox|Safari|Edge)\b/]],
  ['moon', '🌙 The Moon or Mars', [/\b(moon|lunar|mars)\b/i]],
  ['social', '🗣️ Social media drama', [/\b(Twitter|TikTok|Reddit|Bluesky|Instagram|Threads|Mastodon)\b/]],
  ['password', '🔑 Passwords and logins', [/\b(passwords?|passkeys?|logins?|2FA)\b/i]],
].map(([id, label, tests]) => ({ id, label, tests }));

export const BINGO = { prizes: { line: 50, triple: 100, full: 300 }, packs: { line: 1, triple: 1, full: 3 } };
const LINES = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];

/** Everyone gets their own card each week (the middle square is free). */
export function cardFor(userId, week) {
  const picks = shuffle(BINGO_EVENTS, seeded(`bingo:${week}:${userId}`)).slice(0, 24);
  return [...picks.slice(0, 12), null, ...picks.slice(12)];
}

/** Which events have happened this week (the first headline for each). Cached for a few minutes. */
export async function weekHits(env, w = weekOf()) {
  const key = `bingo:hits:${w.week}`;
  const cached = await kvGet(env, key);
  if (cached && cached.at > Date.now() - 5 * 60_000) return cached.hits;
  const { results } = await env.DB.prepare('SELECT key, title FROM stories WHERE first_seen >= ? AND first_seen < ? ORDER BY first_seen ASC LIMIT 3000').bind(w.starts, w.ends).all();
  const hits = { ...(cached?.hits || {}) };
  for (const ev of BINGO_EVENTS) {
    if (hits[ev.id]) continue;
    const s = results.find((x) => ev.tests.every((re) => re.test(x.title)));
    if (s) hits[ev.id] = { key: s.key, title: s.title };
  }
  await env.DB.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').bind(key, JSON.stringify({ at: Date.now(), hits })).run();
  return hits;
}

const linesDone = (marked) => LINES.filter((line) => line.every((n) => marked[n])).length;

async function winners(env, week) {
  const { results } = await env.DB.prepare("SELECT user_id, at FROM bingo_claims WHERE week = ? AND tier = 'line' ORDER BY at ASC LIMIT 10").bind(week).all();
  const who = await people(env, results.map((r) => r.user_id));
  return results.filter((r) => who[r.user_id]).map((r, n) => ({ place: n + 1, ...who[r.user_id], at: r.at }));
}

export async function getBingo(env, user) {
  const w = weekOf();
  const hits = await weekHits(env, w);
  const out = { week: w.week, endsAt: w.ends, prizes: BINGO.prizes, winners: await winners(env, w.week), card: null };
  if (!user) return out;
  const card = cardFor(user.id, w.week);
  const marked = card.map((ev) => !ev || !!hits[ev.id]);
  const { results } = await env.DB.prepare('SELECT tier FROM bingo_claims WHERE week = ? AND user_id = ?').bind(w.week, user.id).all();
  return {
    ...out,
    card: card.map((ev, n) => (ev ? { id: ev.id, label: ev.label, hit: hits[ev.id] || null } : { free: true, n })),
    lines: linesDone(marked), full: marked.every(Boolean), claimed: results.map((r) => r.tier),
  };
}

/** Collect the prizes for lines you've completed (each prize once a week). */
export async function claimBingo(env, user) {
  const w = weekOf();
  const hits = await weekHits(env, w);
  const marked = cardFor(user.id, w.week).map((ev) => !ev || !!hits[ev.id]);
  const lines = linesDone(marked);
  const tiers = [lines >= 1 && 'line', lines >= 3 && 'triple', marked.every(Boolean) && 'full'].filter(Boolean);
  const won = [];
  for (const tier of tiers) {
    const fresh = await env.DB.prepare('INSERT OR IGNORE INTO bingo_claims (week, user_id, tier, at) VALUES (?, ?, ?, ?) RETURNING tier').bind(w.week, user.id, tier, Date.now()).first();
    if (!fresh) continue;
    await reward(env, user.id, BINGO.prizes[tier], tier === 'line' ? 'bingos' : null);
    await givePacks(env, user.id, BINGO.packs[tier]);
    won.push(tier);
  }
  return { won, xp: won.reduce((a, t) => a + BINGO.prizes[t], 0), packs: won.reduce((a, t) => a + BINGO.packs[t], 0), ...(await getBingo(env, user)) };
}
