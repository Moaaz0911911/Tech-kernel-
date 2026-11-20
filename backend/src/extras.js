// kerNEl extras: 🧠 "Explain like I'm 10" + TL;DR (Claude), 🧸 kids' good-news picks, 📼 the tech Time Machine.
import Anthropic from '@anthropic-ai/sdk';
import { HttpError, fetchWithTimeout, rateLimit } from './util.js';
import { rowToStory } from './news.js';
import { cleanLang } from './i18n.js';

const MODEL = 'claude-opus-5-5';
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
async function kvGet(env, k) { const r = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first(); return r ? parse(r.v, null) : null; }
const kvSet = (env, k, v) => env.DB.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').bind(k, JSON.stringify(v)).run();

// ====================================================================================
// 🧠 Explain like I'm 10 / TL;DR
// ====================================================================================
const LANG_NAMES = { en: 'English', ar: 'Egyptian Arabic (natural colloquial Masri, written in Arabic script, the way Egyptians actually talk online)', de: 'German (casual, using "du")', tl: 'Tagalog (natural, everyday Filipino; common English tech words are fine)' };
const EXPLAIN_SYSTEM = `You are codme, the friendly robot on kerNEl, a playful tech news site.
You get one news headline (and sometimes a short summary from the publisher). Rules:
- Only use what the headline and summary say, plus well-known general knowledge. Never invent facts, numbers, names, quotes or outcomes. If details aren't given, say what the headline suggests and explain the tech idea behind it.
- Plain text only: no markdown headings, tables or links. Emojis are welcome but keep it readable.
- Be warm and a little funny, never mean.`;
const MODES = {
  eli10: 'Explain this story to a curious 10-year-old in 3 or 4 short sentences. Explain any tech word in kid language, and end with one fun "why it matters" line.',
  tldr: 'Give a TL;DR: exactly 3 short bullet points starting with "• " (what happened, why it matters, what to watch next). Keep each bullet under 20 words.',
};

export async function explainStory(env, body) {
  const mode = MODES[body.mode] ? body.mode : 'eli10';
  const lang = cleanLang(body.lang);
  const key = String(body.key || '').slice(0, 300);
  const row = key && await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(key).first();
  if (!row) throw new HttpError(404, 'That story isn’t on kerNEl any more');
  const cacheKey = `x:${key}`; // every explanation of one story lives together, and goes when the story does
  const all = (await kvGet(env, cacheKey)) || {};
  const cached = all[`${mode}:${lang}`];
  if (cached) return { ...cached, cached: true };
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'codme AI is not switched on (no API key on the server)');
  await rateLimit(env, 'explain:global', Number(env.EXPLAIN_GLOBAL_DAY) || 1500, 864e5); // protects the bill
  const s = rowToStory(row);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: EXPLAIN_SYSTEM,
      messages: [{ role: 'user', content: `Headline: ${s.title}\nPublisher: ${s.source}${s.summary ? `\nSummary: ${s.summary.slice(0, 600)}` : ''}\n\n${MODES[mode]}\nWrite the answer in ${LANG_NAMES[lang]}.` }],
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new HttpError(429, 'codme is very popular right now — try again in a minute!');
    if (error instanceof Anthropic.APIError) throw new HttpError(502, `codme’s brain hiccuped (${error.status ?? 'network'}). Try again!`);
    throw error;
  }
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'codme can’t explain this one — try another story!');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new HttpError(502, 'codme’s brain came back empty — try again!');
  const out = { key, mode, lang, text: text.slice(0, 1500), ai: true };
  await kvSet(env, cacheKey, { ...((await kvGet(env, cacheKey)) || {}), [`${mode}:${lang}`]: out });
  return out;
}

// ====================================================================================
// 🧸 Kid news: three upbeat stories from the last week
// ====================================================================================
const KID_CATS = new Set(['space', 'science', 'gadgets', 'gaming', 'ai', 'dev']);
const NOPE = /\b(death|dead|dies|died|kill|killed|killing|murder|war|weapon|gun|guns|shoot|shooting|bomb|attack|attacks|terror|abuse|assault|sex|sexual|porn|nude|drug|drugs|cocaine|suicide|lawsuit|sued|sues|court|crime|criminal|arrest|arrested|prison|jail|police|scam|fraud|hack|hacked|hackers|breach|leak|leaked|ransomware|malware|layoff|layoffs|fired|bankrupt|crash|crashes|crashed|injur\w*|victim|victims|blood|violence|violent|gambling|casino|bet|betting|alcohol|beer|vape|tobacco|nazi|racist|hate|ban|banned|outage|lawsuit|deepfake|surveillance|spy|spying|military|missile|army|election|politic\w*|trump|biden|crypto|bitcoin|nsfw|onlyfans|dating)\b/i;
const YAY = /\b(launch\w*|discover\w*|record|first|new|robot\w*|rocket|moon|mars|planet\w*|star|stars|telescope|space|science|scientists|dinosaur\w*|fossil|ocean|animal\w*|game|games|gaming|nintendo|lego|minecraft|kids|students|school|learn\w*|museum|solar|energy|battery|electric|clean|recycl\w*|invent\w*|build\w*|tiny|smallest|biggest|fastest|art|music|open.source|volunteer\w*|help\w*|saves?|cure|healthy)\b/gi;

export async function kidsNews(env) {
  const day = new Date().toISOString().slice(0, 10);
  const cached = await kvGet(env, `kidsnews:${day}`);
  if (cached) return cached;
  const { results } = await env.DB.prepare('SELECT * FROM stories WHERE time > ? ORDER BY points DESC LIMIT 400').bind(Date.now() - 7 * 864e5).all();
  const scored = results.map(rowToStory)
    .filter((s) => KID_CATS.has(s.cat) && !NOPE.test(`${s.title} ${s.summary}`) && s.title.length <= 120 && !/^(show|ask|tell) hn\b/i.test(s.title))
    .map((s) => ({ s, score: (s.title.match(YAY) || []).length * 60 + Math.min(300, s.points || 0) + (['space', 'science'].includes(s.cat) ? 80 : 0) }))
    .filter((x) => x.score >= 60)
    .sort((a, b) => b.score - a.score);
  const picks = [];
  const cats = new Set();
  for (const { s } of scored) { if (picks.length < 3 && !cats.has(s.cat)) { picks.push(s); cats.add(s.cat); } }
  for (const { s } of scored) { if (picks.length < 3 && !picks.includes(s)) picks.push(s); }
  const out = { day, items: picks.map((s) => ({ key: s.key, title: s.title, url: s.url, source: s.source, cat: s.cat, image: s.image || null, time: s.time })) };
  if (out.items.length) await kvSet(env, `kidsnews:${day}`, out);
  return out;
}

// ====================================================================================
// 📼 Time Machine: the biggest Hacker News story on this day, every year since 2007
// ====================================================================================
export async function timeMachine(env, dateParam) {
  const now = new Date();
  const m = String(dateParam || '').match(/^(\d{2})-(\d{2})$/);
  const month = m ? Number(m[1]) : now.getUTCMonth() + 1;
  const dayN = m ? Number(m[2]) : now.getUTCDate();
  if (month < 1 || month > 12 || dayN < 1 || dayN > 31) throw new HttpError(400, 'That date doesn’t exist');
  const mmdd = `${String(month).padStart(2, '0')}-${String(dayN).padStart(2, '0')}`;
  const cacheKey = `tm:${now.getUTCFullYear()}:${mmdd}`;
  const cached = await kvGet(env, cacheKey);
  if (cached) return cached;
  const years = [];
  for (let y = now.getUTCFullYear() - 1; y >= 2007; y--) years.push(y);
  const found = await Promise.all(years.map(async (y) => {
    const start = Date.UTC(y, month - 1, dayN) / 1000;
    if (new Date(start * 1000).getUTCDate() !== dayN) return null; // 29 February
    try {
      const res = await fetchWithTimeout(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&numericFilters=created_at_i>=${start},created_at_i<${start + 86400}`, 8000);
      if (!res.ok) return null;
      const hit = ((await res.json()).hits || []).filter((h) => h.title).sort((a, b) => (b.points || 0) - (a.points || 0))[0];
      if (!hit) return null;
      return { year: y, title: hit.title, url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`, hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`, points: hit.points || 0, comments: hit.num_comments || 0 };
    } catch { return null; }
  }));
  const out = { date: mmdd, years: found.filter(Boolean) };
  if (out.years.length >= Math.min(5, years.length)) await kvSet(env, cacheKey, out);
  return out;
}
