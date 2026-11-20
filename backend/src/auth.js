// Verifies Google / Apple ID tokens (RS256 signatures against their published keys),
// then creates kerNEl sessions. Only a SHA-256 hash of each session token is stored.
import { HttpError, b64urlToBytes, b64urlJson, sha256Hex, randomToken } from './util.js';

const PROVIDERS = {
  google: {
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    audience: (env) => env.GOOGLE_CLIENT_ID,
  },
  apple: {
    jwks: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audience: (env) => env.APPLE_CLIENT_ID,
  },
};
const SESSION_DAYS = 30;
const jwksCache = new Map(); // url -> { keys, at }

async function getJwks(url, fetchImpl) {
  const hit = jwksCache.get(url);
  if (hit && Date.now() - hit.at < 3600_000) return hit.keys;
  const res = await fetchImpl(url);
  if (!res.ok) throw new HttpError(502, 'Could not reach the sign-in provider’s key server');
  const { keys } = await res.json();
  jwksCache.set(url, { keys, at: Date.now() });
  return keys;
}

/** Verify a provider ID token. Returns its payload, or throws HttpError(401). */
export async function verifyIdToken(provider, token, env, { nonce, fetchImpl = fetch } = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new HttpError(400, 'Unknown provider');
  const aud = cfg.audience(env);
  if (!aud) throw new HttpError(503, `${provider} sign-in is not configured on the server`);
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Malformed token');
  let header;
  let payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    throw new HttpError(401, 'Malformed token');
  }
  if (header.alg !== 'RS256') throw new HttpError(401, 'Unexpected token algorithm');
  let keys = await getJwks(cfg.jwks, fetchImpl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { jwksCache.delete(cfg.jwks); keys = await getJwks(cfg.jwks, fetchImpl); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk) throw new HttpError(401, 'Unknown signing key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, 'Invalid token signature');
  if (!cfg.issuers.includes(payload.iss)) throw new HttpError(401, 'Wrong token issuer');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new HttpError(401, 'Token was issued for a different app');
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 60) throw new HttpError(401, 'Token expired');
  if (payload.iat && payload.iat > now + 300) throw new HttpError(401, 'Token issued in the future');
  if (nonce && payload.nonce && payload.nonce !== nonce) throw new HttpError(401, 'Nonce mismatch');
  if (!payload.sub) throw new HttpError(401, 'Token has no subject');
  return payload;
}

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };

export function publicUser(row) {
  return {
    id: row.id, provider: row.provider, email: row.email, name: row.name, picture: row.picture,
    profile: parse(row.profile, {}), data: parse(row.data, {}),
  };
}

/** Find-or-create the user for a verified token and open a session. */
export async function signIn(env, provider, payload, extra = {}) {
  const id = `${provider}:${payload.sub}`;
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  const name = extra.name || payload.name || null; // Apple sends the name only once, from the client
  const email = payload.email || null;
  const picture = payload.picture || null;
  if (existing) {
    await env.DB.prepare('UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), picture = COALESCE(?, picture), updated = ? WHERE id = ?')
      .bind(email, name, picture, now, id).run();
  } else {
    const nickname = (payload.given_name || extra.givenName || name || (email || '').split('@')[0] || 'New Kernel').slice(0, 24);
    const profile = { nickname, avatar: picture ? 'photo' : '🍿', topics: [], created: now };
    await env.DB.prepare('INSERT INTO users (id, provider, email, name, picture, profile, data, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, provider, email, name, picture, JSON.stringify(profile), '{}', now, now).run();
  }
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires < ?').bind(id, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), id, now, now + SESSION_DAYS * 864e5),
  ]);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return { token, isNew: !existing, user: publicUser(row) };
}

/** Resolve the Bearer token on a request. Returns the user row or null. */
export async function currentUser(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const row = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?').bind(hash, Date.now()).first();
  return row || null;
}

export async function requireUser(request, env) {
  const row = await currentUser(request, env);
  if (!row) throw new HttpError(401, 'Please sign in again');
  return row;
}

export async function signOut(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(m[1])).run();
}

// ---------- validation of what the browser sends ----------
const AVATAR_RE = /^(photo|[\p{Extended_Pictographic}‍️]{1,8})$/u;
const CAT_IDS = new Set(['ai', 'gadgets', 'gaming', 'security', 'space', 'dev', 'science', 'money']);
const REACTS = new Set(['fire', 'lol', 'mind', 'meh']);

export function cleanProfile(p, prev = {}) {
  const nickname = String(p?.nickname ?? prev.nickname ?? 'Kernel').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Kernel';
  const avatar = AVATAR_RE.test(String(p?.avatar || '')) ? p.avatar : prev.avatar || '🍿';
  const topics = Array.isArray(p?.topics) ? [...new Set(p.topics.filter((t) => CAT_IDS.has(t)))] : prev.topics || [];
  return { ...prev, nickname, avatar, topics };
}

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
export function cleanData(d) {
  const saved = (Array.isArray(d?.saved) ? d.saved : []).slice(0, 200).map((s) => ({
    key: str(s?.key, 300), title: str(s?.title, 300), url: str(s?.url, 1000), commentsUrl: str(s?.commentsUrl, 1000),
    source: str(s?.source, 60), sourceId: str(s?.sourceId, 40), sourceEmoji: str(s?.sourceEmoji, 16), time: Number(s?.time) || 0,
    cat: str(s?.cat, 20), image: str(s?.image, 1000), domain: str(s?.domain, 200), points: Number(s?.points) || 0,
    comments: Number(s?.comments) || 0, summary: str(s?.summary, 300),
  })).filter((s) => s.key && s.title && s.url);
  const reactions = {};
  for (const [k, v] of Object.entries(d?.reactions || {}).slice(0, 1000)) if (REACTS.has(v)) reactions[String(k).slice(0, 300)] = v;
  return {
    xp: Math.max(0, Math.min(1e7, Math.floor(Number(d?.xp) || 0))),
    read: (Array.isArray(d?.read) ? d.read : []).filter((k) => typeof k === 'string').slice(-600).map((k) => k.slice(0, 300)),
    saved,
    reactions,
    konami: !!d?.konami,
  };
}

export { REACTS };
