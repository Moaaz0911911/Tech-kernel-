// Shared by ✉️ messages and 👥 groups: 🎙️ voice notes and ✍️ "typing…".
import { HttpError } from './util.js';

export const VOICE = { maxBytes: 240_000, maxMs: 30_500, peaks: 32 };
const TYPING_MS = 6000;

/** A random key that's hard to guess (for voice notes and pop photos, which are fetched without a sign-in). */
export function randomKey() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Check a recorded clip: only real audio containers, by their first bytes, and not too big. */
function voiceBytes(dataUrl) {
  const m = /^data:audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)(?:;[^,;]*)*;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'That voice note didn’t work — try recording again');
  const bin = atob(m[2]);
  if (bin.length > VOICE.maxBytes) throw new HttpError(413, 'That voice note is too long');
  if (bin.length < 200) throw new HttpError(400, 'That voice note didn’t work — try recording again');
  const b = [...bin.slice(0, 12)].map((c) => c.charCodeAt(0));
  let type = null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) type = 'audio/webm';
  else if (bin.slice(0, 4) === 'OggS') type = 'audio/ogg';
  else if (bin.slice(4, 8) === 'ftyp') type = 'audio/mp4';
  else if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) type = 'audio/aac'; // ADTS
  else if (bin.slice(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) type = 'audio/mpeg';
  if (!type) throw new HttpError(400, 'That voice note didn’t work — try recording again');
  return { type, b64: m[2] };
}

/** Store a voice note sent with a message. Returns what the message keeps: { key, ms, peaks }. */
export async function saveVoice(env, user, scope, body) {
  const { type, b64 } = voiceBytes(body.voice);
  const ms = Math.round(Math.max(300, Math.min(VOICE.maxMs, Number(body.voiceMs) || 0)));
  const peaks = (Array.isArray(body.voicePeaks) ? body.voicePeaks : []).slice(0, VOICE.peaks).map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))));
  const key = randomKey();
  await env.DB.prepare('INSERT INTO voice_notes (key, user_id, scope, data, type, created) VALUES (?, ?, ?, ?, ?, ?)').bind(key, user.id, scope, b64, type, Date.now()).run();
  return { key, ms, peaks };
}

export async function dropVoice(env, voiceJson) {
  let v = null;
  try { v = JSON.parse(voiceJson || 'null'); } catch { /* nothing to drop */ }
  if (v?.key) await env.DB.prepare('DELETE FROM voice_notes WHERE key = ?').bind(v.key).run();
}

export async function voiceResponse(env, key) {
  const r = await env.DB.prepare('SELECT data, type FROM voice_notes WHERE key = ?').bind(String(key)).first();
  if (!r) throw new HttpError(404, 'This voice note is gone');
  const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': r.type, 'Cache-Control': 'private, max-age=31536000, immutable', 'Accept-Ranges': 'none',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Content-Security-Policy': "default-src 'none'",
    },
  });
}

// ---------------- ✍️ typing ----------------
export async function setTypingIn(env, user, scope, on) {
  if (on) await env.DB.prepare('INSERT OR REPLACE INTO typing (scope, user_id, at) VALUES (?, ?, ?)').bind(scope, user.id, Date.now()).run();
  else await env.DB.prepare('DELETE FROM typing WHERE scope = ? AND user_id = ?').bind(scope, user.id).run();
}

/** Who (besides me) is typing in this chat right now. */
export async function typingIn(env, scope, meId) {
  const { results } = await env.DB.prepare('SELECT user_id FROM typing WHERE scope = ? AND user_id != ? AND at > ?').bind(scope, meId, Date.now() - TYPING_MS).all();
  return results.map((r) => r.user_id);
}
