// kerNEl notifications: an inbox per user + Web Push (RFC 8291 encryption, RFC 8292 VAPID).
// The VAPID key pair is created inside the Worker on first use and stored in the database,
// so the private key never leaves Cloudflare.
import { HttpError } from './util.js';
import { tr, langOfProfile } from './i18n.js';

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(s).length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const KINDS = ['mentions', 'news', 'streak', 'friends'];
const MAX_PUSHES_PER_RUN = 20; // stays inside the free plan's subrequest limit

// ---------------- VAPID keys ----------------
let vapidCache = null;
async function vapid(env) {
  if (vapidCache) return vapidCache;
  let row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first();
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const value = JSON.stringify({ privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)) });
    await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)").bind(value).run();
    row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first(); // whoever won the race
  }
  const { privateJwk, publicKey } = JSON.parse(row.v);
  vapidCache = { publicKey, key: await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return vapidCache;
}
export async function vapidPublicKey(env) { return (await vapid(env)).publicKey; }

async function vapidHeader(env, endpoint) {
  const { key, publicKey } = await vapid(env);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.PUSH_CONTACT || 'https://moaaz0911911.github.io/Tech-kernel-/',
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

// ---------------- RFC 8291 payload encryption (aes128gcm) ----------------
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export async function encryptPayload(p256dh, authSecret, plaintext) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(enc.encode(plaintext), new Uint8Array([2])); // 0x02 = last (only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

async function sendPush(env, sub, payload) {
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: payload.urgency || 'normal',
    },
    body,
  });
  if (res.status === 404 || res.status === 410) { // the browser unsubscribed: forget it
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
  } else if (!res.ok) {
    await env.DB.prepare('UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?').bind(sub.endpoint).run();
  }
  return res.status;
}

// ---------------- subscriptions & preferences ----------------
const ALLOWED_PUSH_HOSTS = /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)$/; // real browser push services only

export async function subscribe(env, user, body) {
  const s = body.subscription || {};
  let host = '';
  try { host = new URL(s.endpoint).hostname; } catch { /* invalid */ }
  if (!s.endpoint || !/^https:/.test(s.endpoint) || !ALLOWED_PUSH_HOSTS.test(host)) throw new HttpError(400, 'That doesn’t look like a browser push subscription');
  if (!s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Subscription keys missing');
  await env.DB.prepare('INSERT OR REPLACE INTO push_subs (endpoint, user_id, p256dh, auth, created, fails) VALUES (?, ?, ?, ?, ?, 0)')
    .bind(s.endpoint.slice(0, 1000), user.id, String(s.keys.p256dh).slice(0, 200), String(s.keys.auth).slice(0, 100), Date.now()).run();
  if (body.prefs || body.tz !== undefined) await savePrefs(env, user, body);
  return { ok: true };
}

export async function unsubscribe(env, user, body) {
  await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint || ''), user.id).run();
  return { ok: true };
}

export async function getPrefs(env, user) {
  const r = await env.DB.prepare('SELECT * FROM notify_prefs WHERE user_id = ?').bind(user.id).first();
  const devices = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(user.id).first();
  return {
    mentions: r ? !!r.mentions : true, news: r ? !!r.news : true, streak: r ? !!r.streak : true, friends: r ? r.friends !== 0 : true, dms: r ? r.dms !== 0 : true,
    games: r ? r.games !== 0 : true, topics: r ? r.topics !== 0 : true, dropHour: r?.drop_hour ?? null, tz: r?.tz ?? 0, devices: devices?.n || 0,
  };
}

export async function savePrefs(env, user, body) {
  const prev = await getPrefs(env, user);
  const p = { ...prev, ...(body.prefs || {}) };
  const tz = Number.isFinite(Number(body.tz)) ? Math.max(-840, Math.min(840, Math.round(Number(body.tz)))) : prev.tz;
  // ☀️ Morning Drop: an hour 0–23 in their own time, or null for off
  const h = 'dropHour' in body ? (body.dropHour === null || body.dropHour === '' ? null : Number(body.dropHour)) : prev.dropHour;
  const dropHour = Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
  await env.DB.prepare(`INSERT INTO notify_prefs (user_id, mentions, news, streak, friends, dms, games, topics, drop_hour, tz) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET mentions = excluded.mentions, news = excluded.news, streak = excluded.streak, friends = excluded.friends, dms = excluded.dms,
      games = excluded.games, topics = excluded.topics, drop_hour = excluded.drop_hour, tz = excluded.tz`)
    .bind(user.id, p.mentions ? 1 : 0, p.news ? 1 : 0, p.streak ? 1 : 0, p.friends ? 1 : 0, p.dms ? 1 : 0, p.games ? 1 : 0, p.topics ? 1 : 0, dropHour, tz).run();
  return getPrefs(env, user);
}

// ---------------- the inbox + sending ----------------
/** Save a notification to the user's inbox and push it to their devices (if they allow this kind). */
export async function notify(env, userId, n, budget = { left: MAX_PUSHES_PER_RUN }) {
  await env.DB.prepare('INSERT INTO notifications (user_id, kind, title, body, url, icon, created, read) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(userId, n.kind, n.title.slice(0, 120), (n.body || '').slice(0, 240), n.url || './', n.icon || '🍿', Date.now()).run();
  const prefs = await env.DB.prepare('SELECT * FROM notify_prefs WHERE user_id = ?').bind(userId).first();
  const allowed = !prefs || prefs[n.kind] !== 0;
  if (!allowed) return 0;
  const { results: subs } = await env.DB.prepare('SELECT * FROM push_subs WHERE user_id = ? AND fails < 5').bind(userId).all();
  let sent = 0;
  for (const sub of subs) {
    if (budget.left <= 0) break;
    budget.left--;
    try {
      const status = await sendPush(env, sub, { title: n.title, body: n.body || '', url: n.url || './', tag: n.tag || n.kind, icon: n.icon || '🍿', kind: n.kind });
      if (status >= 200 && status < 300) sent++;
    } catch (e) { console.error('push', e); }
  }
  return sent;
}

export async function listNotifications(env, user) {
  const { results } = await env.DB.prepare('SELECT id, kind, title, body, url, icon, created, read FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30').bind(user.id).all();
  const unread = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').bind(user.id).first();
  return { items: results.map((r) => ({ ...r, read: !!r.read })), unread: unread?.n || 0 };
}

export async function markRead(env, user, body) {
  if (body.id) await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?').bind(user.id, Number(body.id)).run();
  else await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(user.id).run();
  return { ok: true };
}

export async function testPush(env, user) {
  const lang = langOfProfile(user.profile);
  const sent = await notify(env, user.id, { kind: 'mentions', title: tr(lang, 'testTitle'), body: tr(lang, 'testBody'), url: './', tag: 'test' });
  return { sent };
}

// ---------------- triggers ----------------
/** @mentions in chat → notify the mentioned users. */
export async function notifyMentions(env, author, msg) {
  const names = [...new Set((msg.text.match(/(?:^|\s)@([A-Za-z0-9_]{3,20})\b/g) || []).map((m) => m.trim().slice(1).toLowerCase()))]
    .filter((n) => n !== author.username.toLowerCase() && n !== 'codme').slice(0, 5);
  if (!names.length) return 0;
  const { results } = await env.DB.prepare(`SELECT id, username, profile FROM users WHERE username_lc IN (${names.map(() => '?').join(',')})`).bind(...names).all();
  const budget = { left: 15 };
  let n = 0;
  for (const u of results) {
    n += await notify(env, u.id, {
      kind: 'mentions', title: tr(langOfProfile(u.profile), 'mention', { who: author.username, room: msg.room }), body: msg.text.slice(0, 160), url: `./#chat=${msg.room}`, tag: `chat-${msg.room}`, icon: '💬',
    }, budget);
  }
  return n;
}

/** Cron: big new stories → users who follow that topic (max 3 a day each). */
export async function notifyBigNews(env, budget) {
  const story = await env.DB.prepare(`SELECT s.* FROM stories s LEFT JOIN alerted_stories a ON a.key = s.key
    WHERE a.key IS NULL AND s.time > ? AND (s.points >= 300 OR s.comments >= 250) ORDER BY s.points DESC LIMIT 1`).bind(Date.now() - 6 * 3600_000).first();
  if (!story) return 0;
  await env.DB.prepare('INSERT OR IGNORE INTO alerted_stories (key, at) VALUES (?, ?)').bind(story.key, Date.now()).run();
  const mega = story.points >= 600;
  const today = new Date().toISOString().slice(0, 10);
  const { results: users } = await env.DB.prepare(`SELECT u.id, u.profile, p.news_day, p.news_today FROM notify_prefs p JOIN users u ON u.id = p.user_id
    WHERE p.news = 1 AND u.id IN (SELECT DISTINCT user_id FROM push_subs)`).all();
  let n = 0;
  for (const u of users) {
    if (budget.left <= 0) break;
    const topics = JSON.parse(u.profile || '{}').topics || [];
    if (!(topics.includes(story.cat) || (mega && !topics.length))) continue;
    const count = u.news_day === today ? u.news_today : 0;
    if (count >= 3) continue;
    await env.DB.prepare('UPDATE notify_prefs SET news_day = ?, news_today = ? WHERE user_id = ?').bind(today, count + 1, u.id).run();
    n += await notify(env, u.id, { kind: 'news', title: tr(langOfProfile(u.profile), mega && !topics.includes(story.cat) ? 'bigNews' : 'bigNewsTopics'), body: story.title, url: story.url, tag: 'news', icon: '🔥' }, budget);
  }
  return n;
}

/** Cron: at about 7 pm local time, remind people who haven't popped in today to keep their streak. */
export async function notifyStreaks(env, budget) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const { results: users } = await env.DB.prepare(`SELECT u.id, u.profile, u.streak, u.last_day, p.tz, p.last_streak_day FROM notify_prefs p JOIN users u ON u.id = p.user_id
    WHERE p.streak = 1 AND u.streak >= 1 AND (u.last_day IS NULL OR u.last_day != ?) AND (p.last_streak_day IS NULL OR p.last_streak_day != ?)
      AND u.id IN (SELECT DISTINCT user_id FROM push_subs)`).bind(today, today).all();
  let n = 0;
  for (const u of users) {
    if (budget.left <= 0) break;
    const local = new Date(now + (u.tz || 0) * 60_000);
    if (local.getUTCHours() !== 19 || local.getUTCMinutes() >= 10) continue;
    await env.DB.prepare('UPDATE notify_prefs SET last_streak_day = ? WHERE user_id = ?').bind(today, u.id).run();
    n += await notify(env, u.id, { kind: 'streak', title: tr(langOfProfile(u.profile), 'streakTitle', { n: u.streak }), body: tr(langOfProfile(u.profile), 'streakBody'), url: './', tag: 'streak', icon: '🔥' }, budget);
  }
  return n;
}

export { KINDS, MAX_PUSHES_PER_RUN };
