// kerNEl speaks: English, Egyptian Arabic (مصري), German (Deutsch) and Tagalog.
// Text is written in English in the code; t('English text') looks up the translation.
// Translations live in i18n-main.js (news site) and i18n-kids.js (kids corner) as rows: [English, Arabic, German, Tagalog].
export const LANGS = [
  { id: 'en', name: 'English', flag: '🇬🇧', html: 'en', speech: 'en-US' },
  { id: 'ar', name: 'العربي المصري', flag: '🇪🇬', html: 'ar-EG', speech: 'ar-EG', rtl: true },
  { id: 'de', name: 'Deutsch', flag: '🇩🇪', html: 'de', speech: 'de-DE' },
  { id: 'tl', name: 'Tagalog', flag: '🇵🇭', html: 'tl', speech: 'fil-PH' },
];
const COL = { en: 0, ar: 1, de: 2, tl: 3 };
const KEY = 'kerNEl:lang';

function detect() {
  if (typeof window === 'undefined') return 'en'; // the kerNEl server reuses some site modules
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && COL[saved] !== undefined) return saved;
  } catch { /* private mode */ }
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked && COL[asked] !== undefined) return asked;
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const base = String(l).toLowerCase().split('-')[0];
    if (base === 'ar') return 'ar';
    if (base === 'de') return 'de';
    if (base === 'tl' || base === 'fil') return 'tl';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export const lang = detect();
export const langInfo = LANGS.find((l) => l.id === lang);
export const isRTL = !!langInfo.rtl;
const col = COL[lang];
const dict = new Map();
const missing = new Set();
if (typeof window !== 'undefined') window.__i18nMissing = missing; // for kerNEl's translation checker

/** Add translation rows: [English, Arabic, German, Tagalog]. */
export function addStrings(rows) {
  if (!col) return;
  for (const r of rows) if (r[col]) dict.set(norm(r[0]), r[col]);
}
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Translate. Use {name} placeholders for things that change: t('Hi {name}!', { name }). */
export function t(text, vars) {
  if (!col || text == null || text === '') return fill(String(text ?? ''), vars);
  const hit = dict.get(norm(text));
  if (hit === undefined) missing.add(norm(text));
  return fill(hit ?? String(text), vars);
}
/** Count-aware: English picks the form; translations use one number-friendly form (the "many" one). */
export const tn = (n, one, many, vars = {}) => (col ? t(many, { n, ...vars }) : fill(n === 1 ? one : many, { n, ...vars }));
/** Is there a translation for this exact text? */
export const has = (text) => !col || dict.has(norm(text));

/** Messages from the kerNEl server arrive in English: translate the ones we know. */
export function tServer(msg) {
  const s = String(msg || '');
  const slow = s.match(/^Slow down! Try again in (\d+) minutes?\.$/);
  if (slow) return tn(Number(slow[1]), 'Slow down! Try again in {n} minute.', 'Slow down! Try again in {n} minutes.');
  const muted = s.match(/^You’re muted until (.+) UTC because several of your messages were reported\.$/);
  if (muted) return t('You’re muted until {when} UTC because several of your messages were reported.', { when: muted[1] });
  const brain = s.match(/^codme’s brain hiccuped \((.+)\)\. Try again!$/);
  if (brain) return t('codme’s brain hiccuped ({code}). Try again!', { code: brain[1] });
  return t(s);
}

/** Translate the page's fixed text: text nodes, [data-i18n] blocks (inner HTML) and common attributes. */
export function translatePage(root = document.body) {
  document.documentElement.lang = langInfo.html;
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  if (!col) return;
  document.title = t(document.title);
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = t(desc.content);
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = norm(el.innerHTML);
    if (dict.has(key)) el.innerHTML = dict.get(key); else missing.add(key);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script, style, [data-i18n], [data-no-i18n], code, kbd') || !/\p{L}/u.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const key = norm(n.nodeValue);
    const hit = dict.get(key);
    if (hit === undefined) { missing.add(key); continue; }
    const lead = n.nodeValue.match(/^\s*/)[0];
    const tail = n.nodeValue.match(/\s*$/)[0];
    n.nodeValue = lead + hit + tail;
  }
  for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      if (el.closest('[data-no-i18n]')) continue;
      const v = el.getAttribute(attr);
      if (!/\p{L}/u.test(v)) continue;
      const hit = dict.get(norm(v));
      if (hit !== undefined) el.setAttribute(attr, hit); else missing.add(norm(v));
    }
  }
}

/** Switch language (the page reloads so everything is drawn fresh in the new language). */
export function setLang(id, { reload = true } = {}) {
  if (COL[id] === undefined) return;
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch { /* private mode */ }
  if (reload && id !== lang) location.reload();
}
export const chosenLang = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

/** "5 min ago" in the current language. */
export function timeAgoI18n(ts) {
  const s = Math.max(0, Math.round((Date.now() - Number(ts)) / 1000));
  if (s < 45) return t('just now');
  const m = Math.round(s / 60);
  if (m < 60) return t('{n}m ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('{n}h ago', { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return t('{n}d ago', { n: d });
  return new Date(Number(ts)).toLocaleDateString(langInfo.html === 'ar-EG' ? 'ar-EG-u-nu-latn' : langInfo.html, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A date in the current language, e.g. "20 Nov". */
export const fmtDate = (ts, opts = { day: 'numeric', month: 'short' }) => new Date(ts).toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : langInfo.html, opts);
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(lang === 'ar' ? 'ar-EG-u-nu-latn' : langInfo.html, { hour: '2-digit', minute: '2-digit' });

/** Arabic needs fonts with Arabic letters: load them only for Arabic readers. */
export function loadLangFonts(families = 'IBM+Plex+Sans+Arabic:wght@400;500;600;700') {
  if (lang !== 'ar' || document.getElementById('arFonts')) return;
  const link = document.createElement('link');
  link.id = 'arFonts';
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  document.head.append(link);
}

/** The 🌐 language picker. */
export function langMenuHTML() {
  return LANGS.map((l) => `<button type="button" role="menuitemradio" aria-checked="${l.id === lang}" data-lang="${l.id}" lang="${l.html}" dir="${l.rtl ? 'rtl' : 'ltr'}"><span aria-hidden="true">${l.flag}</span> ${l.name}</button>`).join('');
}
