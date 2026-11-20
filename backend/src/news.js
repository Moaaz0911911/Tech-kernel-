// Server-side news collector: runs on a cron, stores stories in D1, finds thumbnails.
// Categories and story keys come from the website's own js/news.js so both sides always agree.
import { classify, normalizeUrl, catById } from '../../js/news.js';
import { fetchWithTimeout, stripTags, decodeEntities, domainOf, isHttpUrl } from './util.js';

const HN_FRONT = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50';
const HN_FRESH = 'https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E3&hitsPerPage=50';

export const SOURCES = [
  { id: 'hn-front', name: 'Hacker News', emoji: '🟧', kind: 'hn', url: HN_FRONT },
  { id: 'hn-fresh', name: 'HN Newest', emoji: '🆕', kind: 'hn', url: HN_FRESH },
  { id: 'devto', name: 'DEV Community', emoji: '👩‍💻', kind: 'devto', url: 'https://dev.to/api/articles?per_page=30&top=1' },
  { id: 'rss-theverge', name: 'The Verge', emoji: '🟪', kind: 'rss', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'rss-techcrunch', name: 'TechCrunch', emoji: '🟩', kind: 'rss', url: 'https://techcrunch.com/feed/' },
  { id: 'rss-arstechnica', name: 'Ars Technica', emoji: '🟠', kind: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'rss-engadget', name: 'Engadget', emoji: '⬛', kind: 'rss', url: 'https://www.engadget.com/rss.xml' },
  { id: 'rss-wired', name: 'Wired', emoji: '⬜', kind: 'rss', url: 'https://www.wired.com/feed/rss' },
];

// ---------------- parsers ----------------
function parseHN(data) {
  return (data.hits || []).map((h) => {
    const title = h.title || h.story_title;
    if (!title) return null;
    const hnUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
    return {
      title, url: h.url || hnUrl, commentsUrl: hnUrl, source: 'Hacker News', author: h.author,
      time: (h.created_at_i || 0) * 1000 || Date.parse(h.created_at) || Date.now(),
      points: h.points || 0, comments: h.num_comments || 0, image: null,
      summary: h.story_text ? stripTags(h.story_text).slice(0, 240) : '', tags: [],
    };
  });
}

function parseDev(data) {
  return (Array.isArray(data) ? data : []).map((a) => (a && a.title ? {
    title: a.title, url: a.url, commentsUrl: `${a.url}#comments`, source: 'DEV', author: a.user?.name,
    time: Date.parse(a.published_at) || Date.now(), points: a.public_reactions_count ?? a.positive_reactions_count ?? 0,
    comments: a.comments_count || 0, image: a.cover_image || a.social_image || null, summary: a.description || '',
    tags: Array.isArray(a.tag_list) ? a.tag_list : String(a.tag_list || '').split(/,\s*/),
  } : null));
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim() : '';
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["'][^>]*>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
};

/** Minimal RSS 2.0 + Atom parser (enough for news feeds; no DOM needed). */
export function parseFeed(xml, sourceName) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 40).map((b) => {
    const title = stripTags(tag(b, 'title'));
    let link = stripTags(tag(b, 'link'));
    if (!isHttpUrl(link)) link = attr(b, 'link[^>]*rel=["\']alternate["\']', 'href') || attr(b, 'link', 'href');
    if (!title || !isHttpUrl(link)) return null;
    const html = `${tag(b, 'description')} ${tag(b, 'content:encoded')} ${tag(b, 'content')} ${tag(b, 'summary')}`;
    const image = attr(b, 'media:thumbnail', 'url') || attr(b, 'media:content', 'url')
      || (/<enclosure[^>]+type=["']image/i.test(b) ? attr(b, 'enclosure', 'url') : '')
      || ((decodeEntities(html).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '');
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    return {
      title, url: link, commentsUrl: null, source: sourceName, author: stripTags(tag(b, 'dc:creator') || tag(b, 'author')).slice(0, 80),
      time: Date.parse(date) || Date.now(), points: 0, comments: 0, image: isHttpUrl(image) ? image : null,
      summary: stripTags(tag(b, 'description') || tag(b, 'summary')).slice(0, 240),
      tags: (b.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || []).map((c) => stripTags(c)).slice(0, 6),
    };
  });
}

function finalize(raw, src) {
  const cat = classify(raw.title, [...(raw.tags || []), raw.summary || ''].join(' '));
  return {
    key: normalizeUrl(raw.url) || `t:${raw.title.toLowerCase().slice(0, 80)}`,
    title: raw.title.slice(0, 300), url: raw.url, commentsUrl: raw.commentsUrl, source: raw.source, sourceId: src.id,
    sourceEmoji: src.emoji, author: raw.author || null, time: Math.min(raw.time, Date.now()), points: raw.points || 0,
    comments: raw.comments || 0, image: raw.image && isHttpUrl(raw.image) ? raw.image : null,
    summary: (raw.summary || '').slice(0, 300), cat: cat.id, domain: domainOf(raw.url),
  };
}

async function fetchSource(src) {
  const res = await fetchWithTimeout(src.url, 12000, { headers: { Accept: src.kind === 'rss' ? 'application/rss+xml, application/atom+xml, text/xml' : 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (src.kind === 'rss') return parseFeed(await res.text(), src.name);
  const data = await res.json();
  return src.kind === 'hn' ? parseHN(data) : parseDev(data);
}

// ---------------- storing ----------------
const UPSERT = `INSERT INTO stories (key, title, url, comments_url, source, source_id, source_emoji, author, time, points, comments, image, image_checked, summary, cat, domain, first_seen)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
  ON CONFLICT(key) DO UPDATE SET
    points = MAX(stories.points, excluded.points),
    comments = MAX(stories.comments, excluded.comments),
    image = COALESCE(stories.image, excluded.image),
    image_checked = MAX(stories.image_checked, excluded.image_checked),
    summary = CASE WHEN stories.summary IS NULL OR stories.summary = '' THEN excluded.summary ELSE stories.summary END`;

/** Fetch every source, store new/updated stories, record source health. */
export async function collectNews(env) {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const now = Date.now();
  const stmts = [];
  const seen = new Set();
  results.forEach((r, i) => {
    const src = SOURCES[i];
    if (r.status === 'fulfilled') {
      const items = r.value.filter(Boolean).map((x) => finalize(x, src)).filter((x) => !seen.has(x.key) && seen.add(x.key));
      for (const s of items) {
        stmts.push(env.DB.prepare(UPSERT).bind(s.key, s.title, s.url, s.commentsUrl, s.source, s.sourceId, s.sourceEmoji, s.author, s.time,
          s.points, s.comments, s.image, s.image ? 1 : 0, s.summary, s.cat, s.domain, now));
      }
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO source_status (id, name, emoji, ok, count, at, error) VALUES (?, ?, ?, 1, ?, ?, NULL)').bind(src.id, src.name, src.emoji, items.length, now));
    } else {
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO source_status (id, name, emoji, ok, count, at, error) VALUES (?, ?, ?, 0, 0, ?, ?)').bind(src.id, src.name, src.emoji, now, String(r.reason?.message || r.reason).slice(0, 200)));
    }
  });
  // keep the table small: drop stories older than 10 days
  stmts.push(env.DB.prepare('DELETE FROM stories WHERE time < ?').bind(now - 10 * 864e5));
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return { stored: stmts.length, ok: results.filter((r) => r.status === 'fulfilled').length, total: SOURCES.length };
}

/** Find a real thumbnail (og:image / twitter:image) for stories that don't have one yet. */
export async function findThumbnails(env, max = 12) {
  const { results } = await env.DB.prepare('SELECT key, url FROM stories WHERE image IS NULL AND image_checked = 0 ORDER BY time DESC LIMIT ?').bind(max).all();
  await Promise.allSettled(results.map(async (row) => {
    let image = null;
    let description = null;
    try {
      if (!/news\.ycombinator\.com/.test(row.url)) {
        const res = await fetchWithTimeout(row.url, 6000, { headers: { Accept: 'text/html' } });
        if (res.ok && /html/i.test(res.headers.get('content-type') || '')) {
          const html = await readHead(res, 250_000);
          image = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
          if (image) image = new URL(decodeEntities(image), row.url).href;
          if (image && !isHttpUrl(image)) image = null;
          // the publisher's own short description, so the in-app reader has something to show
          description = metaContent(html, ['og:description', 'twitter:description', 'description']);
          if (description) description = stripTags(decodeEntities(description)).slice(0, 400) || null;
        }
      }
    } catch { /* unreachable site: leave it without a picture */ }
    await env.DB.prepare("UPDATE stories SET image = COALESCE(image, ?), summary = CASE WHEN summary IS NULL OR summary = '' THEN COALESCE(?, summary) ELSE summary END, image_checked = 1 WHERE key = ?").bind(image, description, row.key).run();
  }));
  return results.length;
}

async function readHead(res, limit) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let html = '';
  while (html.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    html += dec.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  reader.cancel().catch(() => {});
  return html;
}

function metaContent(html, names) {
  for (const n of names) {
    const esc = n.replace(/[.:]/g, '\\$&');
    // content="…" may contain the other kind of quote (like an apostrophe), so match the same quote at both ends
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=(["'])(.*?)\\1`, 'is'))
      || html.match(new RegExp(`<meta[^>]+content=(["'])(.*?)\\1[^>]+(?:property|name)=["']${esc}["']`, 'is'));
    if (m && m[2].trim()) return m[2];
  }
  return null;
}

// ---------------- reading ----------------
export function rowToStory(r) {
  return {
    key: r.key, title: r.title, url: r.url, commentsUrl: r.comments_url, source: r.source, sourceId: r.source_id,
    sourceEmoji: r.source_emoji, author: r.author, time: r.time, points: r.points, comments: r.comments,
    image: r.image, summary: r.summary || '', cat: r.cat, domain: r.domain, tags: [],
  };
}

export async function latestStories(env, limit = 200) {
  const { results } = await env.DB.prepare('SELECT * FROM stories ORDER BY time DESC LIMIT ?').bind(limit).all();
  const stories = results.map(rowToStory);
  if (stories.length) {
    const counts = await reactionCounts(env, stories.map((s) => s.key));
    for (const s of stories) s.reactions = counts[s.key] || {};
  }
  return stories;
}

export async function reactionCounts(env, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT story_key, emoji, COUNT(*) AS n FROM reactions WHERE story_key IN (${chunk.map(() => '?').join(',')}) GROUP BY story_key, emoji`).bind(...chunk).all();
    for (const r of results) (out[r.story_key] ||= {})[r.emoji] = r.n;
  }
  return out;
}

export async function sourceStatus(env) {
  const { results } = await env.DB.prepare('SELECT * FROM source_status').all();
  return results.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, ok: !!r.ok, count: r.count, at: r.at, error: r.error }));
}

/** Simple keyword retrieval used to give codme relevant stories. */
export async function searchStories(env, words, limit = 25) {
  const terms = words.filter((w) => w.length >= 2).slice(0, 6);
  if (!terms.length) return [];
  const where = terms.map(() => '(LOWER(title) LIKE ? OR LOWER(summary) LIKE ?)').join(' OR ');
  const binds = terms.flatMap((t) => [`%${t.toLowerCase()}%`, `%${t.toLowerCase()}%`]);
  const { results } = await env.DB.prepare(`SELECT * FROM stories WHERE ${where} ORDER BY time DESC LIMIT ?`).bind(...binds, limit).all();
  return results.map(rowToStory);
}

export { catById };
