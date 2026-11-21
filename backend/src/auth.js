// kerNEl accounts: username + password.
// Passwords are hashed with PBKDF2-SHA256 (random salt per user, many iterations); only the hash is stored.
// Session tokens and recovery codes are stored as SHA-256 hashes, never as-is.
import { HttpError, sha256Hex, randomToken } from './util.js';

const SESSION_DAYS = 30;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'codme', 'kernel', 'root', 'support', 'moderator', 'mod', 'system', 'staff', 'official', 'search', 'blocked']);
const COMMON = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'letmein1', 'abcdefgh', 'abc12345', '11111111', '00000000', 'football', 'baseball', 'sunshine', 'princess', 'welcome1', 'kernel123', 'popcorn1']);
const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------------- validation ----------------
export function validateUsername(u) {
  const name = String(u || '').trim();
  if (!USERNAME_RE.test(name)) throw new HttpError(400, 'Usernames are 3–20 letters, numbers or underscores');
  if (RESERVED.has(name.toLowerCase())) throw new HttpError(400, 'That username is reserved — pick another one');
  return name;
}

export function validatePassword(p, username = '') {
  const pw = String(p ?? '');
  if (pw.length < 8) throw new HttpError(400, 'Passwords need at least 8 characters');
  if (pw.length > 128) throw new HttpError(400, 'Passwords can be at most 128 characters');
  if (COMMON.has(pw.toLowerCase())) throw new HttpError(400, 'That password is too common — hackers try it first');
  if (username && pw.toLowerCase().includes(username.toLowerCase())) throw new HttpError(400, 'Your password shouldn’t contain your username');
  return pw;
}

// ---------------- hashing ----------------
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// 20,000 rounds ≈ 4 ms of CPU: fits Cloudflare's free plan (10 ms per request).
// On the paid plan set PBKDF2_ITERATIONS=100000 (the Workers maximum); old hashes upgrade at next sign-in.
const targetIterations = (env) => Math.min(100_000, Math.max(10_000, Number(env.PBKDF2_ITERATIONS) || 20_000));

export async function hashPassword(password, env) {
  const iterations = targetIterations(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2-sha256' || !iter || !salt || !hash) return false;
  return sameBytes(await pbkdf2(password, unb64(salt), Number(iter)), unb64(hash));
}

// A stand-in hash so unknown usernames take as long to reject as wrong passwords.
let dummyHash = null;
async function burnTime(env) {
  dummyHash ||= await hashPassword('not-a-real-password', env);
  await verifyPassword('still-not-real', dummyHash);
}

// ---------------- recovery codes ----------------
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I to avoid mix-ups
export function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % 32]).join(''); // 20 chars × 5 bits = 100 bits
  return chars.match(/.{5}/g).join('-');
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (c) => sha256Hex(`kernel-recovery:${normCode(c)}`);

// ---------------- sessions ----------------
export async function createSession(env, userId) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires < ?').bind(userId, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * 864e5),
  ]);
  return token;
}

const bearer = (request) => (request.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1] || null;

export async function currentUser(request, env) {
  const token = bearer(request);
  if (!token) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?')
    .bind(await sha256Hex(token), Date.now()).first();
}

export async function requireUser(request, env) {
  const row = await currentUser(request, env);
  if (!row) throw new HttpError(401, 'Please sign in again');
  return row;
}

export async function signOut(request, env) {
  const token = bearer(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
export function publicUser(row) {
  return {
    id: row.id, username: row.username, profile: parse(row.profile, {}), data: parse(row.data, {}),
    streak: row.streak || 0, bestStreak: row.best_streak || 0, created: row.created,
  };
}
const findByName = (env, username) => env.DB.prepare('SELECT * FROM users WHERE username_lc = ?').bind(String(username || '').trim().toLowerCase()).first();
const byId = (env, id) => env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();

// ---------------- account actions ----------------
export async function usernameAvailable(env, username) {
  try { validateUsername(username); } catch (e) { return { available: false, reason: e.message }; }
  return (await findByName(env, username)) ? { available: false, reason: 'Already taken' } : { available: true };
}

export async function register(env, body) {
  const username = validateUsername(body.username);
  const password = validatePassword(body.password, username);
  if (await findByName(env, username)) throw new HttpError(409, 'That username is already taken');
  const id = `u_${randomToken(12)}`;
  const now = Date.now();
  const recoveryCode = newRecoveryCode();
  const onBoard = body.leaderboard === false ? 0 : 1;
  const profile = { nickname: username.slice(0, 24), avatar: '🍿', topics: [], leaderboard: !!onBoard, created: now };
  try {
    await env.DB.prepare(`INSERT INTO users (id, username, username_lc, pass_hash, recovery_hash, profile, data, xp, on_board, streak, best_streak, last_day, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, '{}', 0, ?, 0, 0, NULL, ?, ?)`)
      .bind(id, username, username.toLowerCase(), await hashPassword(password, env), await hashCode(recoveryCode), JSON.stringify(profile), onBoard, now, now).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) throw new HttpError(409, 'That username is already taken');
    throw e;
  }
  const token = await createSession(env, id);
  return { token, isNew: true, recoveryCode, user: publicUser(await byId(env, id)) };
}

export async function login(env, body) {
  const row = await findByName(env, body.username);
  const password = String(body.password ?? '');
  if (!row) { await burnTime(env); throw new HttpError(401, 'Wrong username or password'); }
  if (!(await verifyPassword(password, row.pass_hash))) throw new HttpError(401, 'Wrong username or password');
  if (Number(row.pass_hash.split('$')[1]) < targetIterations(env)) { // strength setting was raised: upgrade this hash
    await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPassword(password, env), row.id).run();
  }
  const token = await createSession(env, row.id);
  return { token, isNew: false, user: publicUser(row) };
}

/** Forgot password: username + recovery code → new password (and a fresh recovery code). */
export async function recover(env, body) {
  const row = await findByName(env, body.username);
  const ok = row?.recovery_hash && (await hashCode(body.recoveryCode)) === row.recovery_hash;
  if (!ok) throw new HttpError(401, 'That username and recovery code don’t match');
  const password = validatePassword(body.newPassword, row.username);
  const recoveryCode = newRecoveryCode();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, recovery_hash = ?, updated = ? WHERE id = ?').bind(await hashPassword(password, env), await hashCode(recoveryCode), Date.now(), row.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.id), // sign out every other device
  ]);
  const token = await createSession(env, row.id);
  return { token, isNew: false, recoveryCode, user: publicUser(await byId(env, row.id)) };
}

export async function changePassword(env, request, user, body) {
  if (!(await verifyPassword(String(body.currentPassword ?? ''), user.pass_hash))) throw new HttpError(401, 'Your current password is wrong');
  const password = validatePassword(body.newPassword, user.username);
  const keep = await sha256Hex(bearer(request));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, updated = ? WHERE id = ?').bind(await hashPassword(password, env), Date.now(), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, keep), // other devices sign out
  ]);
  return { ok: true };
}

export async function newCodeFor(env, user, body) {
  if (!(await verifyPassword(String(body.password ?? ''), user.pass_hash))) throw new HttpError(401, 'Your password is wrong');
  const recoveryCode = newRecoveryCode();
  await env.DB.prepare('UPDATE users SET recovery_hash = ?, updated = ? WHERE id = ?').bind(await hashCode(recoveryCode), Date.now(), user.id).run();
  return { recoveryCode };
}

/** Daily streak: one check-in per UTC day. */
export async function checkin(env, user) {
  const today = new Date().toISOString().slice(0, 10);
  if (user.last_day === today) return { streak: user.streak, bestStreak: user.best_streak, bonusXp: 0, already: true };
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const streak = user.last_day === yesterday ? (user.streak || 0) + 1 : 1;
  const best = Math.max(streak, user.best_streak || 0);
  await env.DB.prepare('UPDATE users SET streak = ?, best_streak = ?, last_day = ? WHERE id = ?').bind(streak, best, today, user.id).run();
  return { streak, bestStreak: best, bonusXp: Math.min(streak, 7) * 5, already: false };
}

// ---------------- cleaning what the browser sends ----------------
const AVATAR_RE = /^[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]{1,8}$/u;
const CAT_IDS = new Set(['ai', 'gadgets', 'gaming', 'security', 'space', 'dev', 'science', 'money']);
export const REACTS = new Set(['fire', 'lol', 'mind', 'meh']);
const KID_LESSONS = new Set(['computer', 'binary', 'robot', 'pixels', 'internet', 'passwords', 'safety', 'words', 'quiz']);

export function cleanProfile(p, prev = {}) {
  const nickname = String(p?.nickname ?? prev.nickname ?? 'Kernel').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Kernel';
  const avatar = AVATAR_RE.test(String(p?.avatar || '')) ? p.avatar : prev.avatar || '🍿';
  const topics = Array.isArray(p?.topics) ? [...new Set(p.topics.filter((t) => CAT_IDS.has(t)))] : prev.topics || [];
  const leaderboard = typeof p?.leaderboard === 'boolean' ? p.leaderboard : prev.leaderboard !== false;
  const lang = ['en', 'ar', 'de', 'tl'].includes(p?.lang) ? p.lang : prev.lang || 'en';
  return { ...prev, nickname, avatar, topics, leaderboard, lang };
}

const COUNTERS = new Set(['quizPlayed', 'quizPerfect', 'battleVotes', 'comments', 'explains', 'briefings', 'swipes', 'timeTravels', 'tourneys', 'wrapped', 'follows', 'langs', 'dms']);
/** Kids' minutes per day (for the grown-ups' dashboard): keep the bigger number for each day, last 30 days. */
function mergeMinutes(prev = {}, next = {}) {
  const out = { ...prev };
  for (const [day, n] of Object.entries(next || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) out[day] = Math.max(out[day] || 0, int(n, 0, 1440));
  return Object.fromEntries(Object.entries(out).sort().slice(-30));
}
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

/** Clean a partial data update and merge it into what the server already has. */
export function mergeDataPatch(prev, patch) {
  const out = { ...prev };
  if ('xp' in patch) out.xp = Math.min(int(patch.xp, 0, 1e7), (prev.xp || 0) + 500); // keeps the leaderboard honest-ish
  if ('read' in patch) out.read = (Array.isArray(patch.read) ? patch.read : []).filter((k) => typeof k === 'string').slice(-600).map((k) => k.slice(0, 300));
  if ('saved' in patch) {
    out.saved = (Array.isArray(patch.saved) ? patch.saved : []).slice(0, 200).map((s) => ({
      key: str(s?.key, 300), title: str(s?.title, 300), url: str(s?.url, 1000), commentsUrl: str(s?.commentsUrl, 1000),
      source: str(s?.source, 60), sourceId: str(s?.sourceId, 40), sourceEmoji: str(s?.sourceEmoji, 16), time: Number(s?.time) || 0,
      cat: str(s?.cat, 20), image: str(s?.image, 1000), domain: str(s?.domain, 200), points: Number(s?.points) || 0,
      comments: Number(s?.comments) || 0, summary: str(s?.summary, 300),
    })).filter((s) => s.key && s.title && s.url);
  }
  if ('reactions' in patch) {
    out.reactions = {};
    for (const [k, v] of Object.entries(patch.reactions || {}).slice(0, 1000)) if (REACTS.has(v)) out.reactions[String(k).slice(0, 300)] = v;
  }
  if ('konami' in patch) out.konami = !!(patch.konami || prev.konami);
  if ('codmeAsks' in patch) out.codmeAsks = Math.max(prev.codmeAsks || 0, int(patch.codmeAsks, 0, 1e6));
  if ('chatSent' in patch) out.chatSent = Math.max(prev.chatSent || 0, int(patch.chatSent, 0, 1e7));
  if ('pollVotes' in patch) out.pollVotes = Math.max(prev.pollVotes || 0, int(patch.pollVotes, 0, 1e5));
  if ('gamesPlayed' in patch) out.gamesPlayed = Math.max(prev.gamesPlayed || 0, int(patch.gamesPlayed, 0, 1e6));
  if ('factPerfect' in patch) out.factPerfect = !!(patch.factPerfect || prev.factPerfect);
  if ('catReads' in patch) { // stories read per topic (for kerNEl Wrapped); counts only go up
    out.catReads = { ...(prev.catReads || {}) };
    for (const [c, n] of Object.entries(patch.catReads || {})) if (CAT_IDS.has(c)) out.catReads[c] = Math.max(out.catReads[c] || 0, int(n, 0, 1e6));
  }
  if ('counts' in patch) { // other little counters (quizzes played, battles voted, …); only go up
    out.counts = { ...(prev.counts || {}) };
    for (const [c, n] of Object.entries(patch.counts || {})) if (COUNTERS.has(c)) out.counts[c] = Math.max(out.counts[c] || 0, int(n, 0, 1e7));
  }
  if ('badges' in patch) { // achievements only ever get added
    out.badges = { ...(prev.badges || {}) };
    for (const [id, at] of Object.entries(patch.badges || {}).slice(0, 60)) if (/^[a-z0-9_]{1,30}$/.test(id) && !out.badges[id]) out.badges[id] = Number(at) || Date.now();
  }
  if ('settings' in patch) {
    const s = patch.settings || {};
    out.settings = {
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : prev.settings?.theme || null,
      sound: typeof s.sound === 'boolean' ? s.sound : !!prev.settings?.sound,
      kidsRead: typeof s.kidsRead === 'boolean' ? s.kidsRead : !!prev.settings?.kidsRead,
    };
  }
  if ('kids' in patch) { // stars only ever go up, so two devices never undo each other
    const k = patch.kids || {};
    const stars = { ...(prev.kids?.stars || {}) };
    for (const [id, n] of Object.entries(k.stars || {})) if (KID_LESSONS.has(id)) stars[id] = Math.max(stars[id] || 0, int(n, 0, 3));
    out.kids = {
      stars,
      robotLevel: Math.max(prev.kids?.robotLevel || 0, int(k.robotLevel, 0, 5)),
      name: typeof k.name === 'string' ? k.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 30) : prev.kids?.name || '',
      minutes: mergeMinutes(prev.kids?.minutes, k.minutes),
      last: Math.max(Number(prev.kids?.last) || 0, Math.min(Date.now() + 60_000, Number(k.last) || 0)),
    };
  }
  return out;
}
