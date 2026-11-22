// Shared helpers for the kerNEl API worker.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const nameOf = (user) => String(user?.username_lc || user?.username || '').toLowerCase();
/** 👑 The owner: the username in the OWNER setting (wrangler.toml). Always a moderator, and the only one who can add or remove moderators. */
export const ownerName = (env) => String(env.OWNER || '').trim().replace(/^@/, '').toLowerCase();
export const isOwner = (env, user) => !!user && !!ownerName(env) && nameOf(user) === ownerName(env);
/** 🛡️ Is this person a moderator? The owner, and everyone the owner made one (users.mod_since). */
export const isAdmin = (env, user) => !!user && (isOwner(env, user) || (user.mod_since || 0) > 0);

export function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*') || list.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin; // local development
  return null;
}

export function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export async function readJson(request, maxBytes = 200_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

/** Fixed-window rate limit stored in D1. Throws 429 when exceeded. */
// Cloudflare's free plan allows about 100,000 database row writes a day, so everyday limits live in memory
// (per Worker instance: good enough against spam) and only sign-ups, logins, password recovery and the paid
// AI features keep their counters in the database, where every instance sees them.
const DURABLE_BUCKETS = /^(register|login|recover|pw|codme|explain)/;
const MEM_LIMITS = new Map();
const LAST_WRITE = new Map();

/** True at most once per `ms` for a key (per Worker instance): for writes that don't need to happen on every request. */
export function throttle(key, ms) {
  const now = Date.now();
  if (now - (LAST_WRITE.get(key) || 0) < ms) return false;
  if (LAST_WRITE.size > 20_000) LAST_WRITE.clear();
  LAST_WRITE.set(key, now);
  return true;
}

export async function rateLimit(env, bucket, limit, windowMs) {
  if (!DURABLE_BUCKETS.test(bucket) && env.DURABLE_LIMITS !== '1') { // (tests keep every limit in the database so they can reset them)
    const now = Date.now();
    let r = MEM_LIMITS.get(bucket);
    if (!r || r.reset <= now) {
      if (MEM_LIMITS.size > 20_000) for (const [k, v] of MEM_LIMITS) if (v.reset <= now) MEM_LIMITS.delete(k);
      r = { count: 0, reset: now + windowMs };
      MEM_LIMITS.set(bucket, r);
    }
    if (r.count >= limit) {
      const mins = Math.ceil((r.reset - now) / 60000);
      throw new HttpError(429, `Slow down! Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    r.count++;
    return;
  }
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, reset FROM rate_limits WHERE bucket = ?').bind(bucket).first();
  if (!row || row.reset <= now) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (bucket, count, reset) VALUES (?, 1, ?)').bind(bucket, now + windowMs).run();
    return;
  }
  if (row.count >= limit) {
    const mins = Math.ceil((row.reset - now) / 60000);
    throw new HttpError(429, `Slow down! Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket = ?').bind(bucket).run();
}

export async function fetchWithTimeout(url, ms = 10000, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': 'kerNEl-news-bot/1.0', ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function domainOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function isHttpUrl(u) {
  try { const p = new URL(u).protocol; return p === 'https:' || p === 'http:'; } catch { return false; }
}
