// 📖 Tap-to-explain: tricky tech words in a story get a dotted underline. Tap one for a short,
// kid-friendly explanation (from codme's glossary, in your language) and a button to ask codme more.
import { esc, store } from './utils.js';
import { t, tn } from './i18n.js';
import { GLOSSARY, GLOSSARY_ALIASES } from './content.js';
import { sfx } from './fun.js';

// Words so common that underlining them would just be noise
const SKIP = new Set(['app', 'apps', 'web', 'internet', 'the internet', 'memory', 'the cloud', 'a kernel', 'a.i']);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERMS = [...Object.keys(GLOSSARY), ...Object.keys(GLOSSARY_ALIASES)].filter((k) => !SKIP.has(k)).sort((a, b) => b.length - a.length);
const RX = new RegExp(`(?<![\\p{L}\\p{N}])(${TERMS.map(escRe).join('|')})(s?)(?![\\p{L}\\p{N}])`, 'giu');
const NAMES = { wifi: 'Wi-Fi', github: 'GitHub', linux: 'Linux', '5g': '5G', iot: 'IoT', ipo: 'IPO', crypto: 'Crypto' };
export const LEARN_XP = 2;

const keyOf = (word) => {
  const w = word.toLowerCase();
  for (const x of [w, w.replace(/s$/, '')]) {
    if (GLOSSARY[x] && !SKIP.has(x)) return x;
    if (GLOSSARY_ALIASES[x] && !SKIP.has(x)) return GLOSSARY_ALIASES[x];
  }
  return null;
};
/** How a glossary word is written as a title: API, GPU, Wi-Fi, Machine learning… */
export const wordLabel = (k) => NAMES[k] || (k.length <= 4 && !['bug', 'chip', 'ram'].includes(k) ? k.toUpperCase() : k === 'ram' ? 'RAM' : k[0].toUpperCase() + k.slice(1));

/** Escape `text` for HTML and turn the first few glossary words into tappable buttons. */
export function markWords(text, { max = 6 } = {}) {
  const s = String(text || '');
  const seen = new Set();
  let out = '';
  let last = 0;
  for (const m of s.matchAll(RX)) {
    const key = keyOf(m[1]);
    if (!key || seen.has(key) || seen.size >= max) continue;
    seen.add(key);
    out += `${esc(s.slice(last, m.index))}<button type="button" class="gl-word" data-gl="${esc(key)}">${esc(m[0])}</button>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

/** The pop-up that explains a word. `host` is the element it lives in (the reader). */
export function initWords({ host, onAsk, onLearn }) {
  const pop = document.createElement('div');
  pop.className = 'gl-pop glass';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  host.append(pop);
  let key = null;

  function show(btn) {
    key = btn.dataset.gl;
    const learned = store.get('glLearned', []);
    const isNew = !learned.includes(key);
    if (isNew) { learned.push(key); store.set('glLearned', learned.slice(-500)); onLearn?.(key); }
    pop.setAttribute('aria-label', wordLabel(key));
    pop.innerHTML = `<div class="gl-head"><b>📖 ${esc(wordLabel(key))}</b><button type="button" class="gl-x" data-gl-close aria-label="${esc(t('Close'))}">✕</button></div>
      <p dir="auto">${esc(t(GLOSSARY[key]))}</p>
      <div class="gl-foot"><button type="button" class="btn btn-sm btn-ghost" data-gl-ask>🤖 ${t('Ask codme more')}</button>
        <small class="muted">${isNew ? t('New word! +{xp} XP 🧠', { xp: LEARN_XP }) : tn(learned.length, '{n} word learned', '{n} words learned')}</small></div>`;
    pop.hidden = false;
    // under the word, kept inside the reader; on phones it sits at the bottom like a little sheet
    const hb = host.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const narrow = hb.width < 560;
    pop.classList.toggle('as-sheet', narrow);
    if (!narrow) {
      const w = pop.offsetWidth;
      const left = Math.min(Math.max(12, b.left - hb.left + b.width / 2 - w / 2), hb.width - w - 12);
      const below = b.bottom - hb.top + 8;
      const top = below + pop.offsetHeight > hb.height - 12 ? b.top - hb.top - pop.offsetHeight - 8 : below;
      pop.style.left = `${left}px`;
      pop.style.top = `${Math.max(12, top)}px`;
    } else { pop.style.left = ''; pop.style.top = ''; }
    host.querySelectorAll('.gl-word.on').forEach((x) => x.classList.remove('on'));
    btn.classList.add('on');
    sfx.blip();
  }
  function hide() {
    if (pop.hidden) return;
    pop.hidden = true;
    host.querySelectorAll('.gl-word.on').forEach((x) => x.classList.remove('on'));
  }

  host.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const w = el.closest('[data-gl]');
    if (w) { e.preventDefault(); e.stopPropagation(); show(w); return; }
    if (el.closest('[data-gl-close]')) { hide(); return; }
    if (el.closest('[data-gl-ask]')) { const k = key; hide(); onAsk?.(k); return; }
    if (!e.composedPath().includes(pop)) hide();
  }, true);
  host.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); e.stopPropagation(); hide(); } }, true);
  host.querySelector('.reader-scroll')?.addEventListener('scroll', hide, { passive: true });
  host.addEventListener('close', hide);
  return { hide };
}
