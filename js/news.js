// Fetching, normalising, classifying and searching tech news — all in the browser.
import { CONFIG } from './config.js';
import { store, stripHtml, domainOf, hash } from './utils.js';

// ---------- categories ----------
export const CATEGORIES = [
  { id: 'ai', label: 'AI', emoji: '🤖', hue: 275, query: 'AI', words: ['ai', 'a\\.i\\.', 'artificial intelligence', 'gpt\\S*', 'chatgpt', 'llms?', 'openai', 'anthropic', 'claude', 'gemini', 'deepmind', 'mistral', 'llama', 'machine learning', 'neural', 'transformers?', 'chatbots?', 'copilot', 'agi', 'diffusion', 'ai agents?', 'agentic', 'prompts?', 'inference', 'nvidia', 'deepseek', 'grok'] },
  { id: 'gadgets', label: 'Gadgets', emoji: '📱', hue: 200, query: 'smartphone OR laptop', words: ['iphone', 'ipad', 'android', 'pixel', 'samsung', 'galaxy', 'smartphones?', 'phones?', 'laptops?', 'macbook', 'mac', 'apple', 'smartwatch', 'apple watch', 'wearables?', 'headphones', 'earbuds', 'airpods', 'gadgets?', 'cameras?', 'tablets?', 'vision pro', 'kindle', 'tvs?', 'oled', 'snapdragon', 'vr', 'headset', 'quest', 'm[1-6] (pro|max|ultra|chip)', 'drones?', 'e-?readers?'] },
  { id: 'gaming', label: 'Gaming', emoji: '🎮', hue: 140, query: 'gaming', words: ['games?', 'gaming', 'gamers?', 'nintendo', 'switch 2', 'xbox', 'playstation', 'ps5', 'ps6', 'steam', 'valve', 'esports', 'unreal', 'unity', 'godot', 'consoles?', 'minecraft', 'fortnite', 'roblox', 'gta', 'zelda', 'pok[eé]mon', 'twitch', 'speedrun\\w*', 'emulators?', 'retro'] },
  { id: 'security', label: 'Security', emoji: '🔐', hue: 355, query: 'security vulnerability', words: ['security', 'hack(ed|ers?|ing)?', 'breach(es|ed)?', 'vulnerabilit(y|ies)', 'exploits?', 'malware', 'ransomware', 'cve-?\\d*', 'passwords?', 'privacy', 'encrypt(ion|ed)?', 'phishing', 'zero-day', 'backdoors?', 'spyware', 'leak(ed|s)?', 'surveillance', 'botnets?', 'ddos', 'scams?', 'stalkerware', 'passkeys?', '2fa', 'cyber\\w*'] },
  { id: 'space', label: 'Space', emoji: '🚀', hue: 230, query: 'space', words: ['space', 'nasa', 'spacex', 'rockets?', 'satellites?', 'mars', 'moon', 'lunar', 'orbit(al)?', 'starship', 'starlink', 'telescopes?', 'jwst', 'webb', 'asteroids?', 'astronauts?', 'esa', 'planets?', 'iss', 'blue origin', 'comets?', 'cosmic', 'galaxies'] },
  { id: 'dev', label: 'Dev', emoji: '💻', hue: 45, query: 'programming', words: ['javascript', 'typescript', 'python', 'rust', 'golang', 'java', 'kotlin', 'swift', 'programming', 'programmers?', 'code', 'coding', 'developers?', 'github', 'gitlab', 'git', 'apis?', 'frameworks?', 'databases?', 'sql', 'postgres(ql)?', 'sqlite', 'linux', 'kernel', 'open[- ]source', 'compilers?', 'react', 'vue', 'svelte', 'css', 'html', 'wasm', 'webassembly', 'docker', 'kubernetes', 'npm', 'show hn', 'emacs', 'vim', 'bash', 'unix', 'algorithms?', 'zig', 'haskell', 'lisp', 'dotnet', 'terminal', 'cli', 'refactor\\w*', 'debugg\\w*'] },
  { id: 'science', label: 'Science', emoji: '🔬', hue: 170, query: 'science research', words: ['science', 'scientists?', 'research(ers)?', 'physics', 'quantum', 'biology', 'chemistry', 'climate', 'energy', 'batter(y|ies)', 'fusion', 'solar', 'nuclear', 'study', 'brain', 'dna', 'medic(al|ine)', 'health', 'robots?', 'robotics', 'math(ematics)?', 'genes?', 'cells?', 'species', 'fossils?'] },
  { id: 'money', label: 'Money', emoji: '💰', hue: 95, query: 'startup funding', words: ['startups?', 'funding', 'raises?', 'ipo', 'acquir(es|ed|ing)', 'acquisitions?', 'layoffs?', 'billions?', 'millions?', 'revenue', 'markets?', 'crypto', 'bitcoin', 'ethereum', 'stocks?', 'ceo', 'antitrust', 'lawsuits?', 'sues?', 'sued', 'ftc', 'doj', 'regulat(ion|ors?)', 'tariffs?', 'valuation', 'profits?', 'earnings', 'investors?', 'shares'] },
];
export const DEFAULT_CAT = { id: 'tech', label: 'Tech', emoji: '⚡', hue: 15, query: 'technology' };
const CAT_RE = CATEGORIES.map((c) => [c, new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${c.words.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu')]);

export const catById = (id) => CATEGORIES.find((c) => c.id === id) || DEFAULT_CAT;

export function classify(title, extra = '') {
  let best = DEFAULT_CAT;
  let bestScore = 0;
  for (const [cat, re] of CAT_RE) {
    const score = (String(title).match(re)?.length || 0) * 2 + (String(extra).match(re)?.length || 0);
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

// ---------- sources ----------
async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('timed out') : e;
  } finally {
    clearTimeout(timer);
  }
}

function parseHN(hit) {
  const title = hit.title || hit.story_title;
  if (!title) return null;
  const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  return {
    title,
    url: hit.url || hnUrl,
    commentsUrl: hnUrl,
    source: 'Hacker News',
    author: hit.author,
    time: (hit.created_at_i || 0) * 1000 || Date.parse(hit.created_at),
    points: hit.points || 0,
    comments: hit.num_comments || 0,
    image: null,
    summary: hit.story_text ? stripHtml(hit.story_text).slice(0, 220) : '',
    tags: [],
  };
}

function parseDev(a) {
  if (!a || !a.title) return null;
  return {
    title: a.title,
    url: a.url,
    commentsUrl: `${a.url}#comments`,
    source: 'DEV',
    author: a.user?.name,
    time: Date.parse(a.published_at) || Date.now(),
    points: a.public_reactions_count ?? a.positive_reactions_count ?? 0,
    comments: a.comments_count || 0,
    image: a.cover_image || a.social_image || null,
    summary: a.description || '',
    tags: Array.isArray(a.tag_list) ? a.tag_list : String(a.tag_list || '').split(/,\s*/),
  };
}

function parseRssDate(s) {
  if (!s) return Date.now();
  // rss2json returns "2026-11-20 10:15:00" in UTC
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
  return Date.parse(iso) || Date.now();
}

function parseRss(data, sourceName) {
  if (!data || data.status !== 'ok' || !Array.isArray(data.items)) throw new Error(data?.message || 'feed error');
  return data.items.map((it) => {
    const title = stripHtml(it.title);
    if (!title || !it.link) return null;
    const html = `${it.description || ''} ${it.content || ''}`;
    const img = it.thumbnail || (it.enclosure && /image/.test(it.enclosure.type || '') ? it.enclosure.link : '') || (html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || null;
    return {
      title,
      url: it.link,
      commentsUrl: null,
      source: sourceName,
      author: it.author,
      time: parseRssDate(it.pubDate),
      points: 0,
      comments: 0,
      image: img,
      summary: stripHtml(it.description).slice(0, 240),
      tags: Array.isArray(it.categories) ? it.categories : [],
    };
  });
}

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const rss = (name, feed, emoji) => ({
  id: `rss-${name.toLowerCase().replace(/\W+/g, '')}`, name, emoji, every: 10, flag: 'rssFeeds',
  url: () => RSS2JSON + encodeURIComponent(feed),
  parse: (d) => parseRss(d, name),
});

export const SOURCES = [
  { id: 'hn-front', name: 'Hacker News', emoji: '🟧', every: 1, flag: 'hackerNewsFront',
    url: () => 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40',
    parse: (d) => (d.hits || []).map(parseHN) },
  { id: 'hn-fresh', name: 'HN Newest', emoji: '🆕', every: 1, flag: 'hackerNewsFresh',
    url: () => 'https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E3&hitsPerPage=40',
    parse: (d) => (d.hits || []).map(parseHN) },
  { id: 'devto', name: 'DEV Community', emoji: '👩‍💻', every: 2, flag: 'devTo',
    url: () => 'https://dev.to/api/articles?per_page=30&top=1',
    parse: (d) => (Array.isArray(d) ? d : []).map(parseDev) },
  rss('The Verge', 'https://www.theverge.com/rss/index.xml', '🟪'),
  rss('TechCrunch', 'https://techcrunch.com/feed/', '🟩'),
  rss('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', '🟠'),
  rss('Engadget', 'https://www.engadget.com/rss.xml', '⬛'),
];

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    [...u.searchParams.keys()].forEach((k) => { if (/^(utm_|ref$|source$|fbclid|gclid)/i.test(k)) u.searchParams.delete(k); });
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch {
    return null;
  }
}

function finalize(raw, source) {
  const extra = [...(raw.tags || []), raw.summary || ''].join(' ');
  const cat = classify(raw.title, extra);
  const time = Number.isFinite(raw.time) ? Math.min(raw.time, Date.now()) : Date.now();
  return {
    ...raw,
    key: normalizeUrl(raw.url) || `t:${raw.title.toLowerCase().slice(0, 80)}`,
    sourceId: source.id,
    sourceEmoji: source.emoji,
    cat: cat.id,
    domain: domainOf(raw.url),
    time,
    tags: (raw.tags || []).filter(Boolean).slice(0, 6),
  };
}

/** How "hot" a story is right now: engagement decayed by age. */
export function hotness(it) {
  const ageH = Math.max(0, (Date.now() - it.time) / 36e5);
  const base = it.sourceId === 'devto' ? (it.points || 0) * 1.5 : it.sourceId?.startsWith('rss') ? 40 : it.points || 0;
  return (base + (it.comments || 0) * 0.5 + 1) / Math.pow(ageH + 2, 1.4);
}

// ---------- the live feed ----------
const MAX_ITEMS = 260;

export class NewsFeed extends EventTarget {
  constructor() {
    super();
    this.items = new Map();
    this.status = {};
    this.loading = false;
    this.lastRefresh = 0;
    this.sessionBaseline = false; // becomes true after the first successful fetch of this visit
    const cached = store.get('cache', null);
    this.hadCache = !!cached?.items?.length;
    if (this.hadCache) {
      for (const it of cached.items) if (it && it.key && it.title) this.items.set(it.key, { ...it, popped: 0 });
      this.cacheTime = cached.at;
    }
  }

  get size() { return this.items.size; }
  get(key) { return this.items.get(key); }
  all() { return [...this.items.values()]; }
  sources() { return SOURCES.filter((s) => CONFIG.sources?.[s.flag] !== false); }

  async refresh(force = false) {
    if (this.loading) return;
    this.loading = true;
    this.dispatchEvent(new CustomEvent('loading'));
    const period = (CONFIG.refreshSeconds || 30) * 1000;
    const now = Date.now();
    const due = this.sources().filter((s) => {
      const st = this.status[s.id];
      return !st || now - st.at >= s.every * period - 2000 || (force && s.every <= 2);
    });

    const results = await Promise.allSettled(due.map(async (s) => s.parse(await fetchJSON(s.url())).filter(Boolean)));
    const fresh = [];
    const firstOfSession = !this.sessionBaseline;
    results.forEach((r, i) => {
      const s = due[i];
      const prev = this.status[s.id] || {};
      if (r.status === 'fulfilled') {
        this.status[s.id] = { ok: true, count: r.value.length, at: Date.now(), lastOk: Date.now() };
        for (const raw of r.value) {
          const item = finalize(raw, s);
          const existing = this.items.get(item.key);
          if (existing) {
            existing.points = Math.max(existing.points || 0, item.points || 0);
            existing.comments = Math.max(existing.comments || 0, item.comments || 0);
            if (!existing.image && item.image) existing.image = item.image;
            if (!existing.summary && item.summary) existing.summary = item.summary;
          } else {
            item.firstSeen = Date.now();
            item.popped = this.sessionBaseline ? Date.now() : 0;
            this.items.set(item.key, item);
            fresh.push(item);
          }
        }
      } else {
        this.status[s.id] = { ok: false, count: 0, at: Date.now(), lastOk: prev.lastOk, error: String(r.reason?.message || r.reason || 'failed') };
      }
    });

    const anyOk = results.some((r) => r.status === 'fulfilled');
    if (anyOk) { this.sessionBaseline = true; this.lastSuccess = Date.now(); }
    this.prune();
    this.save();
    this.lastRefresh = Date.now();
    this.loading = false;
    this.dispatchEvent(new CustomEvent('update', { detail: { fresh, anyOk, firstOfSession, fetched: due.length } }));
  }

  prune() {
    if (this.items.size <= MAX_ITEMS) return;
    const keep = this.all().sort((a, b) => b.time - a.time).slice(0, MAX_ITEMS);
    this.items = new Map(keep.map((i) => [i.key, i]));
  }

  save() {
    const items = this.all().sort((a, b) => b.time - a.time).slice(0, 180)
      .map(({ popped, ...rest }) => rest);
    store.set('cache', { at: Date.now(), items });
  }
}

// ---------- search ----------
const STOP = new Set('a an the and or of to for in on at by with about from into over under is are was were be been do does did have has had i me my you your we our it its this that these those please pls can could would should will show find search look get give tell any some news article articles story stories headline headlines post posts thing things stuff related regarding there what whats who how when where why which hey hi yo codme bot just up out more anything everything'.split(' '));

export function tokenize(q) {
  return (String(q).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu) || [])
    .map((t) => t.replace(/[.-]+$/, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function editDistance1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Score items against a free-text query. Returns matches, best first. */
export function searchLocal(items, query, { since, until } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const need = Math.max(1, Math.ceil(terms.length * 0.6));
  const out = [];
  for (const it of items) {
    if (since && it.time < since) continue;
    if (until && it.time >= until) continue;
    const title = it.title.toLowerCase();
    const titleWords = title.match(/[\p{L}\p{N}+#]+/gu) || [];
    const restWords = `${it.summary || ''} ${(it.tags || []).join(' ')} ${it.domain || ''} ${it.source || ''} ${catById(it.cat).label}`
      .toLowerCase().match(/[\p{L}\p{N}+#]+/gu) || [];
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let s = 0;
      if (titleWords.includes(t)) s = 6;
      else if (t.length >= 3 && titleWords.some((w) => w.startsWith(t))) s = 4;
      else if (t.length >= 5 && titleWords.some((w) => editDistance1(w, t))) s = 2.5;
      else if (restWords.some((w) => w === t || (t.length >= 4 && w.startsWith(t)))) s = 1.5;
      if (s) { matched++; score += s; }
    }
    if (matched < need) continue;
    const ageH = (Date.now() - it.time) / 36e5;
    score += Math.max(0, 3 - ageH / 12) + Math.min(2, (it.points || 0) / 200);
    out.push([score, it]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, it]) => it);
}

/** Dig through the whole Hacker News archive (Algolia) for older or rarer stories. */
export async function searchArchive(query, { since, until, hits = 10, byDate = false } = {}) {
  const filters = [];
  if (since) filters.push(`created_at_i>${Math.floor(since / 1000)}`);
  if (until) filters.push(`created_at_i<${Math.floor(until / 1000)}`);
  const endpoint = byDate ? 'search_by_date' : 'search';
  const url = `https://hn.algolia.com/api/v1/${endpoint}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${hits}`
    + (filters.length ? `&numericFilters=${encodeURIComponent(filters.join(','))}` : '');
  const data = await fetchJSON(url, 10000);
  return (data.hits || []).map(parseHN).filter(Boolean).map((r) => finalize(r, SOURCES[0]));
}

/** Most-mentioned words across headlines, for the Hype-o-meter. */
const TREND_STOP = new Set('new now how why what when your you our out its it\'s the and for with from that this are was will can not but all has have than into about after over more most just get got show ask tell hn via using use used make makes made one two first last year years day days week time way like back off still dont don\'t i\'m we\'re they them their his her own any big top best why\'s here there launches launch says said open source part today'.split(' '));
export function trends(items, n = 14) {
  const counts = new Map();
  for (const it of items) {
    const seen = new Set();
    for (const w of it.title.toLowerCase().match(/[\p{L}][\p{L}\p{N}+#.-]{2,}/gu) || []) {
      const word = w.replace(/[.-]+$/, '');
      if (word.length < 3 || TREND_STOP.has(word) || STOP.has(word) || seen.has(word)) continue;
      seen.add(word);
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/** Stable pseudo-random value per key (used for tilts, art). */
export const keyNoise = (key, mod) => hash(key) % mod;
