// 🔤 Reading comfort: text size, an easy-to-read font (Atkinson Hyperlegible, made for low vision),
// roomy lines, warm paper, a distraction-free focus mode and a reading ruler. Saved on this device.
import { $, esc, store } from './utils.js';
import { t } from './i18n.js';
import { sfx } from './fun.js';
import { makeDialog } from './arena.js';

const SIZES = [0.9, 1, 1.15, 1.3, 1.5];
const FONTS = [['default', 'Standard'], ['easy', 'Easy-read'], ['serif', 'Book']];
const TOGGLES = [
  ['roomy', '↕️', 'Roomy lines'],
  ['paper', '📜', 'Warm paper'],
  ['focus', '🎯', 'Focus mode', 'Just the words: hides pictures, reactions and comments'],
  ['ruler', '📏', 'Reading ruler', 'A band that follows your finger or mouse'],
  ['words', '📖', 'Explain tricky words', 'Tap underlined tech words for a quick explanation'],
  ['everywhere', '🌍', 'Use size and font everywhere', 'Not just in stories'],
];
const DEF = { size: 1, font: 'default', roomy: false, paper: false, focus: false, ruler: false, words: true, everywhere: false };
export const comfort = { ...DEF, ...store.get('comfort', {}) };

export function applyComfort() {
  const root = document.documentElement;
  root.style.setProperty('--r-scale', String(SIZES[comfort.size] ?? 1));
  root.dataset.rfont = comfort.font;
  root.classList.toggle('r-roomy', comfort.roomy);
  root.classList.toggle('comfort-all', comfort.everywhere);
  const r = $('#readerDialog');
  if (r) for (const k of ['paper', 'focus', 'ruler']) r.classList.toggle(`r-${k}`, comfort[k]);
}

function panelHTML() {
  return `<div class="cf-row"><span class="cf-label">${t('Text size')}</span>
      <div class="cf-size"><button type="button" class="cf-btn" data-cf-size="-1" aria-label="${esc(t('Smaller text'))}" ${comfort.size <= 0 ? 'disabled' : ''}>A−</button>
        <span class="cf-dots" aria-hidden="true">${SIZES.map((_, i) => `<i class="${i === comfort.size ? 'on' : ''}"></i>`).join('')}</span>
        <button type="button" class="cf-btn big" data-cf-size="1" aria-label="${esc(t('Bigger text'))}" ${comfort.size >= SIZES.length - 1 ? 'disabled' : ''}>A+</button></div></div>
    <div class="cf-row"><span class="cf-label">${t('Font')}</span>
      <div class="cf-fonts" role="radiogroup" aria-label="${esc(t('Font'))}">${FONTS.map(([id, name]) => `<button type="button" role="radio" class="cf-font f-${id}" data-cf-font="${id}" aria-checked="${comfort.font === id}"><b>Aa</b><small>${t(name)}</small></button>`).join('')}</div></div>
    <div class="cf-toggles">${TOGGLES.map(([k, emoji, name, hint]) => `<label class="cf-toggle"><span>${emoji}</span><span class="cf-tt"><b>${t(name)}</b>${hint ? `<small>${t(hint)}</small>` : ''}</span>
      <input type="checkbox" class="switch" data-cf="${k}" ${comfort[k] ? 'checked' : ''}></label>`).join('')}</div>
    <button type="button" class="linkish cf-reset" data-cf-reset>${t('Back to normal')}</button>`;
}

/** The "Aa" button in the reader and the "Reading comfort" settings row. */
export function initComfort({ onChange } = {}) {
  applyComfort();
  const reader = $('#readerDialog');
  const pop = document.createElement('div');
  pop.className = 'comfort-pop glass';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', t('Reading comfort'));
  reader?.append(pop);
  const D = makeDialog('comfort-dialog', `🔤 ${t('Reading comfort')}`);
  const paint = () => { pop.innerHTML = `<p class="tp-label">🔤 ${t('Reading comfort')}</p>${panelHTML()}`; D.body.innerHTML = `<p class="muted small">${t('Make stories easier on your eyes. Saved on this device.')}</p>${panelHTML()}`; };

  function set(patch) {
    Object.assign(comfort, patch);
    store.set('comfort', { ...comfort });
    applyComfort();
    paint();
    onChange?.(comfort);
    sfx.blip();
  }
  const onClick = (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const s = el.closest('[data-cf-size]');
    if (s) { set({ size: Math.max(0, Math.min(SIZES.length - 1, comfort.size + Number(s.dataset.cfSize))) }); return; }
    const f = el.closest('[data-cf-font]');
    if (f) { set({ font: f.dataset.cfFont }); return; }
    if (el.closest('[data-cf-reset]')) set({ ...DEF });
  };
  const onToggle = (e) => { const k = e.target.dataset?.cf; if (k) set({ [k]: e.target.checked }); };
  for (const box of [pop, D.body]) { box.addEventListener('click', onClick); box.addEventListener('change', onToggle); }

  $('#readerComfort')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.hidden) paint();
    pop.hidden = !pop.hidden;
  });
  // tapping outside closes the panel (the path is checked as it was when tapped, since the panel redraws itself)
  reader?.addEventListener('click', (e) => { const path = e.composedPath(); if (!pop.hidden && !path.includes(pop) && !path.includes($('#readerComfort'))) pop.hidden = true; });
  reader?.addEventListener('close', () => { pop.hidden = true; });

  // 📏 the reading ruler follows the pointer (or finger) inside the reader
  const ruler = document.createElement('div');
  ruler.className = 'read-ruler';
  ruler.setAttribute('aria-hidden', 'true');
  reader?.append(ruler);
  let lastY = null;
  const place = (y) => { if (y == null || !reader) return; const top = y - reader.getBoundingClientRect().top; ruler.style.transform = `translateY(${Math.round(top)}px)`; };
  reader?.addEventListener('pointermove', (e) => { if (comfort.ruler) { lastY = e.clientY; place(lastY); } }, { passive: true });
  reader?.addEventListener('pointerdown', (e) => { if (comfort.ruler) { lastY = e.clientY; place(lastY); } }, { passive: true });
  reader?.addEventListener('toggle', () => { if (comfort.ruler) place(lastY ?? window.innerHeight * 0.45); });

  return {
    open() { paint(); if (!D.dlg.open) D.dlg.showModal(); },
    summary: () => [comfort.size !== 1 ? `${Math.round((SIZES[comfort.size]) * 100)}%` : '', comfort.font !== 'default' ? t(FONTS.find(([id]) => id === comfort.font)[1]) : '', comfort.focus ? t('Focus mode') : ''].filter(Boolean).join(' · ') || t('Standard'),
    wordsOn: () => comfort.words,
  };
}
