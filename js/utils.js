// Small helpers used everywhere.
import { timeAgoI18n } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape any value for safe use inside HTML text or attribute values. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Only allow http(s) links — anything else becomes "#". */
export function safeUrl(u) {
  try {
    const url = new URL(u, location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch {
    return '#';
  }
}

export function domainOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** "5m ago", in the reader's language. */
export function timeAgo(ms) {
  return timeAgoI18n(ms);
}

export function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

/** Fast, stable string hash (djb2). */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Turn HTML into plain text without executing or loading anything. */
export function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- localStorage, wrapped so private mode / blocked storage never breaks the page ----------
const PREFIX = 'kerNEl:';
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
  del(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};

// ---------- toasts ----------
export function toast(msg, { emoji = '🍿', type = 'info', ms = 3800 } = {}) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-emoji" aria-hidden="true">${esc(emoji)}</span><span>${esc(msg)}</span>`;
  host.append(t);
  while (host.children.length > 4) host.firstElementChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

// ---------- auth helpers ----------
/** Decode (not verify) a JWT payload. */
export function decodeJwt(token) {
  const part = String(token || '').split('.')[1];
  if (!part) throw new Error('Malformed token');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function randomString(len = 32) {
  const a = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, len);
}

const scriptCache = new Map();
export function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptCache.delete(src);
      s.remove();
      reject(new Error(`Couldn't load ${new URL(src).hostname} (offline or blocked by an extension?)`));
    };
    document.head.append(s);
  });
  scriptCache.set(src, p);
  return p;
}
