// 🎙️ Voice notes: record up to 30 seconds (with a live level meter), and play them back in chats.
import { esc } from './utils.js';
import { auth } from './auth.js';
import { t } from './i18n.js';

export const VOICE_MAX_MS = 30_000;
const MAX_BYTES = 240_000;
const PEAKS = 32;

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function resample(list, n) {
  if (!list.length) return Array(n).fill(0);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * list.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * list.length) / n));
    return Math.max(...list.slice(a, b));
  });
}

const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/**
 * Start recording. Returns { stop(), cancel() }; stop() resolves to { voice, voiceMs, voicePeaks } (ready to send) or null if too short.
 * onLevel(0..1) runs about 10 times a second, onTick(ms) too; onMax() when 30 seconds are up (recording stops by itself).
 */
export async function recordVoice({ onLevel, onTick, onMax } = {}) {
  if (!canRecord()) throw new Error(t('Voice notes don’t work in this browser'));
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    throw new Error(t('Allow the microphone to record voice notes 🎙️'));
  }
  const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported?.(x)) || '';
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  let ctx = null;
  let analyser = null;
  let buf = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
  } catch { /* no meter, still records */ }
  const levels = [];
  const t0 = performance.now();
  let ended = 0;
  rec.start(250);
  const stopped = new Promise((res) => { rec.onstop = res; });
  const cleanup = () => {
    clearInterval(timer);
    stream.getTracks().forEach((tr) => tr.stop());
    ctx?.close().catch(() => {});
  };
  const finish = () => {
    if (ended) return;
    ended = performance.now();
    if (rec.state !== 'inactive') rec.stop();
  };
  const timer = setInterval(() => {
    let lvl = 0;
    if (analyser) {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5);
    }
    levels.push(lvl);
    onLevel?.(lvl);
    const ms = performance.now() - t0;
    onTick?.(Math.min(ms, VOICE_MAX_MS));
    if (ms >= VOICE_MAX_MS && !ended) { finish(); onMax?.(); }
  }, 100);

  return {
    get ms() { return Math.min(VOICE_MAX_MS, (ended || performance.now()) - t0); },
    async stop() {
      finish();
      await stopped;
      cleanup();
      const ms = Math.min(VOICE_MAX_MS + 400, ended - t0);
      if (ms < 700) return null;
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
      if (blob.size > MAX_BYTES) throw new Error(t('That voice note is too long'));
      const peaks = resample(levels, PEAKS).map((x) => Math.round(Math.min(1, x) * 100));
      return { voice: await blobToDataUrl(blob), voiceMs: Math.round(ms), voicePeaks: peaks };
    },
    cancel() { finish(); stopped.then(cleanup); },
  };
}

// ---------------- playback ----------------
let audio = null;
let playing = '';      // key of the voice note that's playing
let speed = 1;
let frame = 0;

/** A voice note bubble. */
export function voiceHTML(v) {
  if (!v?.key) return '';
  const peaks = resample(v.peaks?.length ? v.peaks : Array.from({ length: 16 }, (_, i) => 25 + ((i * 37) % 55)), 28);
  const bars = peaks.map((p) => `<i style="--h:${Math.max(14, p)}%"></i>`).join('');
  return `<div class="vn${playing === v.key ? ' playing' : ''}" data-vkey="${esc(v.key)}" data-ms="${Number(v.ms) || 0}">
    <button type="button" class="vn-play" data-vplay aria-label="${esc(t('Play voice note'))}"><span aria-hidden="true">${playing === v.key && audio && !audio.paused ? '❚❚' : '▶'}</span></button>
    <span class="vn-wave" data-vseek aria-hidden="true">${bars}</span>
    <span class="vn-time">${clock(v.ms)}</span>
    <button type="button" class="vn-speed" data-vspeed aria-label="${esc(t('Playback speed'))}">${speed}×</button>
  </div>`;
}

function paint() {
  cancelAnimationFrame(frame);
  document.querySelectorAll('.vn').forEach((el) => {
    const on = el.dataset.vkey === playing && audio;
    el.classList.toggle('playing', !!on);
    const btn = el.querySelector('.vn-play span');
    if (btn) btn.textContent = on && !audio.paused ? '❚❚' : '▶';
    const total = Number(el.dataset.ms) || 0;
    const dur = on && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : total;
    const pos = on ? audio.currentTime * 1000 : 0;
    const bars = el.querySelectorAll('.vn-wave i');
    const lit = on ? Math.round(Math.min(1, pos / (dur || 1)) * bars.length) : 0;
    bars.forEach((b, i) => b.classList.toggle('on', i < lit));
    const time = el.querySelector('.vn-time');
    if (time) time.textContent = on && pos > 0 ? clock(pos) : clock(total);
    const sp = el.querySelector('.vn-speed');
    if (sp) sp.textContent = `${speed}×`;
  });
  if (audio && !audio.paused) frame = requestAnimationFrame(paint);
}

function play(key, at = null) {
  if (playing !== key || !audio) {
    audio?.pause();
    audio = new Audio(`${auth.apiBase}/api/voice/${encodeURIComponent(key)}`);
    audio.preload = 'auto';
    playing = key;
    audio.addEventListener('ended', () => { playing = ''; audio = null; paint(); });
    audio.addEventListener('error', () => { playing = ''; audio = null; paint(); });
    audio.addEventListener('pause', paint);
    audio.addEventListener('play', paint);
  }
  audio.playbackRate = speed;
  if (at != null) {
    const seek = () => { if (Number.isFinite(audio.duration)) audio.currentTime = at * audio.duration; };
    if (audio.readyState >= 1) seek(); else audio.addEventListener('loadedmetadata', seek, { once: true });
  }
  audio.play().catch(() => {});
  paint();
}

/** Stop whatever is playing (e.g. when a chat closes). */
export function stopVoice() { audio?.pause(); audio = null; playing = ''; paint(); }

let wired = false;
export function initVoicePlayer() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const vn = el?.closest('.vn');
    if (!vn) return;
    e.stopPropagation();
    const key = vn.dataset.vkey;
    if (el.closest('[data-vspeed]')) {
      speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
      if (audio) audio.playbackRate = speed;
      paint();
      return;
    }
    const wave = el.closest('[data-vseek]');
    if (wave) {
      const r = wave.getBoundingClientRect();
      const rtl = getComputedStyle(wave).direction === 'rtl';
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
      play(key, rtl ? 1 - x : x);
      return;
    }
    if (el.closest('[data-vplay]')) {
      if (playing === key && audio && !audio.paused) audio.pause(); else play(key);
    }
  }, true);
}
