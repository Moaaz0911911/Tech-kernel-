// The bottom tab bar (News · Play · Chat · Kids · Me) and the Liquid Glass effects.
import { $, $$, store } from './utils.js';
import { applyIcons } from './icons.js';

const VIEWS = ['news', 'play', 'me'];
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

export function initTabs({ onChat, onView, chatEnabled }) {
  const bar = $('#tabbar');
  const dock = $('#dock');
  const blob = $('.tab-blob', bar);
  const main = $('#main');
  applyIcons(document);
  if (!chatEnabled) $('[data-tab="chat"]', bar)?.remove();

  const tabFor = (name) => $(`.tab[data-tab="${name}"]`, bar);
  const rectOf = (tab) => {
    const b = bar.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    return { x: r.left - b.left, w: r.width };
  };
  let current = VIEWS.includes(store.get('view', 'news')) ? store.get('view', 'news') : 'news';

  /** Move the glass drop to a tab. It stretches toward the new tab first, then settles (like iOS). */
  function moveBlob(tab, animate = true) {
    if (!tab) return;
    const to = rectOf(tab);
    const from = { x: parseFloat(blob.style.left) || to.x, w: parseFloat(blob.style.width) || to.w };
    blob.style.left = `${to.x}px`;
    blob.style.width = `${to.w}px`;
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(from.x - to.x) < 1) return;
    const left = Math.min(from.x, to.x);
    const right = Math.max(from.x + from.w, to.x + to.w);
    blob.animate([
      { left: `${from.x}px`, width: `${from.w}px`, transform: 'scale(1, 1)' },
      { left: `${left}px`, width: `${right - left}px`, transform: 'scale(1, .8)', offset: 0.42 },
      { left: `${to.x}px`, width: `${to.w}px`, transform: 'scale(1, 1)' },
    ], { duration: 620, easing: SPRING });
  }

  function show(name, { scroll = true, animate = true } = {}) {
    if (!VIEWS.includes(name)) name = 'news';
    const changed = name !== current;
    current = name;
    store.set('view', name);
    main.dataset.view = name;
    $$('[data-pane]', main).forEach((p) => { p.hidden = p.dataset.pane !== name; });
    $$('.tab[data-tab]', bar).forEach((t) => (t.dataset.tab === name ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
    moveBlob(tabFor(name), animate);
    if (scroll && changed) window.scrollTo({ top: 0, behavior: 'smooth' });
    onView?.(name, changed);
  }

  bar.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab[data-tab]');
    if (!tab) return;
    if (tab.dataset.tab === 'chat') { pulse(tab); onChat?.(); return; }
    show(tab.dataset.tab);
  });
  // press-and-hold makes the drop swell, like squeezing glass
  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('.tab[aria-current]')) bar.classList.add('pressing'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => bar.addEventListener(ev, () => bar.classList.remove('pressing')));

  function pulse(tab) {
    tab.querySelector('.i')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 500, easing: SPRING });
  }

  // the bar shrinks while you read (scrolling down) and grows back when you scroll up
  let lastY = window.scrollY;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const mini = y > 140 && y > lastY + 2 ? true : y < lastY - 6 || y < 140 ? false : bar.classList.contains('mini');
      if (mini !== bar.classList.contains('mini')) {
        bar.classList.toggle('mini', mini);
        dock.classList.toggle('mini', mini);
        setTimeout(() => moveBlob(tabFor(current), false), 520);
        requestAnimationFrame(() => moveBlob(tabFor(current), false));
      }
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
  window.addEventListener('resize', () => moveBlob(tabFor(current), false));
  document.fonts?.ready.then(() => moveBlob(tabFor(current), false));

  show(current, { scroll: false, animate: false });
  requestAnimationFrame(() => moveBlob(tabFor(current), false));
  return { show, current: () => current };
}

/** Light on glass follows the pointer, and Chromium gets the real lens effect. */
export function initGlass() {
  const ua = navigator.userAgentData?.brands?.map((b) => b.brand).join(' ') || '';
  if (/Chromium|Google Chrome|Microsoft Edge/.test(ua) && !matchMedia('(prefers-reduced-transparency: reduce)').matches) document.documentElement.classList.add('lg-lens');
  let raf = 0;
  let last = null;
  document.addEventListener('pointermove', (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = last.target instanceof Element && last.target.closest('.glass');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${last.clientX - r.left}px`);
      el.style.setProperty('--my', `${last.clientY - r.top}px`);
    });
  }, { passive: true });
}
