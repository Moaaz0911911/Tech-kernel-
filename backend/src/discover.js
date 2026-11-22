// ☀️ Morning Drop, 🔔 followed topics and companies, 🕰️ story timelines.
import { HttpError, fetchWithTimeout } from './util.js';
import { rowToStory } from './news.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';
import { kvGet, snap } from './play.js';

const kvSet = (env, k, v) => env.DB.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').bind(k, JSON.stringify(v)).run();

export const TOPIC = { max: 20, minLen: 2, maxLen: 30, alertsPerDay: 3 };
export const DROP = { size: 5, windowMin: 30 };
export const SUGGESTED_TOPICS = ['OpenAI', 'Apple', 'Nvidia', 'SpaceX', 'Nintendo', 'Rust', 'Linux', 'Google', 'Microsoft', 'Tesla', 'iPhone', 'Android',
  'PlayStation', 'Xbox', 'Samsung', 'NASA', 'Python', 'Bitcoin', 'Starship', 'Steam', 'Meta', 'Amazon', 'AMD', 'Intel'];
const STOP = new Set(('a an and are as at be but by can could did do does for from had has have how i if in into is it its just like more most new '
  + 'no not now of on one or our out over says show ask hn so than that the their them then there these they this to too up us was we what when where '
  + 'which who why will with you your after about all also any back been before being both first get got here his her him just made make many may '
  + 'much my off only other own same she should some still such take than through under very via way well were while would year years day days today '
  + 'week launches launch released release announces announced unveils introduces report reports update updates big top best now finally never again '
  + 'without always really every ever still yet discover discovers find finds found build builds built shows makes using used gets says').split(' '));

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "Apple" matches "Apple's new…" and "…by Apple." but not "Pineapple". */
export const topicRe = (topic) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(topic)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
const cleanTopic = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, TOPIC.maxLen);
const localDay = (now, tz) => new Date(now + (tz || 0) * 60_000).toISOString().slice(0, 10);

// ---------------- 🔔 topics ----------------
async function myTopics(env, user) {
  const { results } = await env.DB.prepare('SELECT topic FROM topic_follows WHERE user_id = ? ORDER BY created ASC').bind(user.id).all();
  return results.map((r) => r.topic);
}

/** Names that keep popping up in today's headlines (for "Trending" suggestions). */
async function trendingTopics(env) {
  const cached = await kvGet(env, 'topics:trending');
  if (cached && cached.at > Date.now() - 30 * 60_000) return cached.list;
  const { results } = await env.DB.prepare('SELECT title FROM stories WHERE time > ? ORDER BY points DESC LIMIT 300').bind(Date.now() - 36 * 3600_000).all();
  const count = new Map();
  for (const { title } of results) {
    const seen = new Set();
    const words = title.split(/[\s,:;!?()"“”]+/);
    words.forEach((w, i) => {
      const word = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '').replace(/['’]s$/, '');
      if (word.length < 3 || i === 0 && !/[A-Z].*[A-Z]|\d/.test(word)) return; // a capital at the start of a headline is not a name
      if (!/^[A-Z][\p{L}\p{N}+#.-]*$/u.test(word) || STOP.has(word.toLowerCase()) || seen.has(word)) return;
      seen.add(word);
      count.set(word, (count.get(word) || 0) + 1);
    });
  }
  const list = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
  await kvSet(env, 'topics:trending', { at: Date.now(), list });
  return list;
}

export async function listTopics(env, user) {
  const mine = await myTopics(env, user);
  const { results } = await env.DB.prepare('SELECT title FROM stories WHERE time > ?').bind(Date.now() - 24 * 3600_000).all();
  const counts = Object.fromEntries(mine.map((tp) => { const re = topicRe(tp); return [tp, results.filter((r) => re.test(r.title)).length]; }));
  const lower = new Set(mine.map((x) => x.toLowerCase()));
  const trending = (await trendingTopics(env)).filter((x) => !lower.has(x.toLowerCase()));
  const suggested = SUGGESTED_TOPICS.filter((x) => !lower.has(x.toLowerCase()) && !trending.some((y) => y.toLowerCase() === x.toLowerCase()));
  return { topics: mine.map((tp) => ({ topic: tp, today: counts[tp] || 0 })), trending, suggested, max: TOPIC.max };
}

export async function followTopic(env, user, body) {
  const topic = cleanTopic(body.topic);
  if (topic.length < TOPIC.minLen) throw new HttpError(400, 'Type a company or topic to follow');
  if (body.follow === false) {
    await env.DB.prepare('DELETE FROM topic_follows WHERE user_id = ? AND topic_lc = ?').bind(user.id, topic.toLowerCase()).run();
  } else {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM topic_follows WHERE user_id = ?').bind(user.id).first();
    if ((n?.n || 0) >= TOPIC.max) throw new HttpError(400, 'You can follow up to 20 topics — unfollow one first');
    await env.DB.prepare('INSERT OR IGNORE INTO topic_follows (user_id, topic, topic_lc, created) VALUES (?, ?, ?, ?)').bind(user.id, topic, topic.toLowerCase(), Date.now()).run();
  }
  return listTopics(env, user);
}

/** Cron: a push when a topic you follow shows up in a fresh story (at most 3 a day, never twice for one story). */
export async function notifyTopics(env, budget) {
  const now = Date.now();
  const { results: fresh } = await env.DB.prepare('SELECT key, title, cat FROM stories WHERE first_seen > ? AND time > ? ORDER BY points DESC LIMIT 60')
    .bind(now - 12 * 60_000, now - 12 * 3600_000).all();
  if (!fresh.length) return 0;
  const { results: follows } = await env.DB.prepare(`SELECT f.user_id, f.topic, u.profile FROM topic_follows f JOIN users u ON u.id = f.user_id
    LEFT JOIN notify_prefs p ON p.user_id = f.user_id WHERE p.topics IS NULL OR p.topics != 0`).all();
  if (!follows.length) return 0;
  const byTopic = new Map();
  for (const f of follows) {
    const k = f.topic.toLowerCase();
    if (!byTopic.has(k)) byTopic.set(k, { topic: f.topic, re: topicRe(f.topic), users: [] });
    byTopic.get(k).users.push(f);
  }
  let sent = 0;
  const done = new Set();
  for (const s of fresh) {
    for (const t of byTopic.values()) {
      if (!t.re.test(s.title)) continue;
      for (const f of t.users) {
        if (budget.left <= 0) return sent;
        if (done.has(`${f.user_id}|${s.key}`)) continue;
        done.add(`${f.user_id}|${s.key}`);
        const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM topic_alerts WHERE user_id = ? AND at > ?').bind(f.user_id, now - 864e5).first();
        if ((today?.n || 0) >= TOPIC.alertsPerDay) continue;
        const fresh1 = await env.DB.prepare('INSERT OR IGNORE INTO topic_alerts (user_id, story_key, at) VALUES (?, ?, ?) RETURNING at').bind(f.user_id, s.key, now).first();
        if (!fresh1) continue;
        sent += await notify(env, f.user_id, { kind: 'topics', title: tr(langOfProfile(f.profile), 'topicAlert', { topic: t.topic }), body: s.title.slice(0, 160), url: `./#story=${encodeURIComponent(s.key)}`, tag: `topic-${t.topic.toLowerCase()}`, icon: '🔔' }, budget);
      }
    }
  }
  return sent;
}

// ---------------- ☀️ Morning Drop ----------------
/** The day's top stories for someone: the big ones, nudged towards their topics and favourite sections. */
export async function dropFor(env, user) {
  const { results } = await env.DB.prepare('SELECT * FROM stories WHERE time > ? ORDER BY points DESC LIMIT 120').bind(Date.now() - 26 * 3600_000).all();
  let pool = results.map(rowToStory);
  if (pool.length < DROP.size) pool = (await env.DB.prepare('SELECT * FROM stories ORDER BY time DESC LIMIT 60').all()).results.map(rowToStory);
  const topics = user ? await myTopics(env, user) : [];
  const res = topics.map(topicRe);
  const cats = user ? parse(user.profile, {}).topics || [] : [];
  const topicOf = (s) => topics.find((tp, i) => res[i].test(s.title)) || null;
  const score = (s) => (s.points || 0) + (s.comments || 0) * 0.5 + (cats.includes(s.cat) ? 120 : 0)
    + (s.points ? 0 : 60); // stories from news sites have no upvotes, give them a chance
  const ranked = pool.sort((a, b) => score(b) - score(a));
  // up to two spots for the topics you follow (they go first), then the day's biggest stories
  const mine = [];
  const usedTopics = new Set();
  for (const s of ranked) {
    const tp = topicOf(s);
    if (mine.length >= 2) break;
    if (tp && !usedTopics.has(tp)) { usedTopics.add(tp); mine.push(s); }
  }
  for (const s of ranked) { if (mine.length >= 2) break; if (topicOf(s) && !mine.includes(s)) mine.push(s); }
  const picked = [...mine];
  const perCat = {};
  for (const s of picked) perCat[s.cat] = (perCat[s.cat] || 0) + 1;
  for (const s of ranked) {
    if (picked.length >= DROP.size) break;
    if (picked.includes(s) || (perCat[s.cat] || 0) >= 2) continue; // keep it varied
    perCat[s.cat] = (perCat[s.cat] || 0) + 1;
    picked.push(s);
  }
  return picked.map((s) => ({ ...snap(s), summary: (s.summary || '').slice(0, 200), topic: topicOf(s) }));
}

export async function getDrop(env, user) {
  const p = user ? await env.DB.prepare('SELECT drop_hour, tz FROM notify_prefs WHERE user_id = ?').bind(user.id).first() : null;
  return { stories: await dropFor(env, user), hour: p?.drop_hour ?? null, day: localDay(Date.now(), p?.tz) };
}

/** Cron: send each person's Morning Drop at the hour they picked (their own time). */
export async function sendMorningDrops(env, budget) {
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT p.user_id, p.tz, p.drop_hour, p.last_drop_day, u.id, u.profile FROM notify_prefs p JOIN users u ON u.id = p.user_id
    WHERE p.drop_hour IS NOT NULL LIMIT 500`).all();
  let sent = 0;
  for (const r of results) {
    if (budget.left <= 0) break;
    const local = new Date(now + (r.tz || 0) * 60_000);
    if (local.getUTCHours() !== r.drop_hour || local.getUTCMinutes() >= DROP.windowMin) continue;
    const day = local.toISOString().slice(0, 10);
    if (r.last_drop_day === day) continue;
    const claimed = await env.DB.prepare('UPDATE notify_prefs SET last_drop_day = ? WHERE user_id = ? AND (last_drop_day IS NULL OR last_drop_day != ?) RETURNING user_id').bind(day, r.user_id, day).first();
    if (!claimed) continue;
    const stories = await dropFor(env, r);
    if (!stories.length) continue;
    const lang = langOfProfile(r.profile);
    sent += await notify(env, r.user_id, {
      kind: 'drop', title: tr(lang, 'dropTitle'), body: stories.slice(0, 3).map((s, i) => `${i + 1}. ${s.title}`).join('\n').slice(0, 230),
      url: './#drop', tag: 'morning-drop', icon: '☀️',
    }, budget);
  }
  return sent;
}

// ---------------- 🕰️ timelines ----------------
/** The words that name what a headline is about: names first, then the longest words. */
export function keywords(title) {
  const words = String(title || '').replace(/[“”"()[\]{}|:;,!?]/g, ' ').split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '').replace(/['’]s$/i, '')).filter(Boolean);
  const out = [];
  const add = (w) => { if (out.length < 3 && !out.some((x) => x.toLowerCase() === w.toLowerCase())) out.push(w); };
  const useful = (w) => w.length >= 2 && /\p{L}/u.test(w) && !STOP.has(w.toLowerCase()) && !/['’](ll|m|ve|re|d|t|s)$/i.test(w); // not "I'll"
  const cand = words.filter(useful);
  const strong = (w) => /[A-Z].*[A-Z]|\d|^[a-z]+[A-Z]/.test(w); // OpenAI, GPT-4, iPhone
  // In A Title Case Headline every word is capitalised, so capitals only tell us something in normal headlines.
  const titleCase = words.length >= 4 && words.filter((w) => /^[A-Z]/.test(w)).length / words.length >= 0.7;
  cand.filter(strong).forEach(add);
  if (titleCase) { if (cand[0] === words[0]) add(cand[0]); } // the first word is usually who it's about
  else words.forEach((w, i) => { if (cand.includes(w) && /^[A-Z]/.test(w) && (i > 0 || !/[a-z]s$/.test(w))) add(w); }); // names (not plurals like "Researchers")
  const plural = (w) => w === words[0] && /^[A-Z][a-z]+s$/.test(w); // "Researchers build…": too vague to search for
  [...cand].filter((w) => w.length >= 5 && !plural(w)).sort((a, b) => b.length - a.length).forEach(add);
  return out;
}

export async function storyTimeline(env, key) {
  const k = String(key || '').slice(0, 300);
  const cacheKey = `tl:${k}`;
  const cached = await kvGet(env, cacheKey);
  if (cached) return cached;
  const s = await env.DB.prepare('SELECT title, url, time FROM stories WHERE key = ?').bind(k).first();
  if (!s) throw new HttpError(404, 'That story isn’t on kerNEl anymore');
  const words = keywords(s.title);
  if (!words.length) return { query: '', items: [] };
  const before = Math.floor((s.time - 12 * 3600_000) / 1000);
  let hits = [];
  try {
    // only the strongest word (names come first) is required; the others just rank stories higher
    const optional = words.length > 1 ? `&optionalWords=${encodeURIComponent(words.slice(1).join(' '))}` : '';
    const res = await fetchWithTimeout(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(words.join(' '))}${optional}&tags=story&hitsPerPage=40&numericFilters=points>=15,created_at_i<${before}`, 8000);
    if (res.ok) hits = (await res.json()).hits || [];
  } catch { /* no timeline today */ }
  const seen = new Set([s.title.toLowerCase()]);
  const items = hits.filter((h) => h.title && h.created_at_i && !seen.has(h.title.toLowerCase()) && seen.add(h.title.toLowerCase()) && h.url !== s.url)
    .map((h) => ({ title: h.title.slice(0, 200), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`, time: h.created_at_i * 1000, points: h.points || 0 }))
    .sort((a, b) => b.time - a.time);
  // keep it short: the newest few, then one per month further back
  const out = [];
  const months = new Set();
  for (const it of items) {
    const m = new Date(it.time).toISOString().slice(0, 7);
    if (out.length < 3 || !months.has(m)) { out.push(it); months.add(m); }
    if (out.length >= 8) break;
  }
  const result = { query: words.join(' '), items: out };
  if (hits.length || out.length) await kvSet(env, cacheKey, result);
  return result;
}
