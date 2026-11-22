// Line icons for kerNEl's controls (24×24, drawn with the current text colour).
const P = {
  news: '<path d="M4 5h12v14a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2z"/><path d="M16 9h4v9a2 2 0 0 1-2 2"/><path d="M7.5 9h5M7.5 12.5h5M7.5 16h3"/>',
  play: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M15.5 11.5h.01M17.5 13.5h.01" stroke-width="2.6"/>',
  chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
  kids: '<path d="m12 3.2 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.5l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
  moon: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  sparkle: '<path d="M11 3.5 12.6 8l4.4 1.6-4.4 1.6L11 15.7l-1.6-4.5L5 9.6 9.4 8z"/><path d="m18 14 .8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/>',
  share: '<path d="M12 3.5v11M8 7.2l4-3.7 4 3.7"/><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16"/>',
  comment: '<path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.4A7.5 7.5 0 1 1 20.5 11.5z"/><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" stroke-width="2.4"/>',
  react: '<circle cx="12" cy="12" r="8.5"/><path d="M8.8 14.2a4 4 0 0 0 6.4 0"/><path d="M9.3 9.8h.01M14.7 9.8h.01" stroke-width="2.4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  external: '<path d="M8 16 16.5 7.5M10 7.5h6.5V14"/>',
  send: '<path d="M20.5 3.5 10.5 13.5"/><path d="m20.5 3.5-6.5 17-3.5-7-7-3.5z"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 5 1.5V6a2.6 2.6 0 0 0-2-1.5z"/><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-5 1.5V6a2.6 2.6 0 0 1 2-1.5z"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9a4.2 4.2 0 0 1 0 6"/>',
  translate: '<path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8.5M6.5 10c1 2 3 3.5 5 4"/><path d="m12.5 20 3.5-8 3.5 8M13.6 17.5h4.8"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  swipe: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M10.5 18h3"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.4l2.1 1.2M17.7 15.4l2.1 1.2M4.2 16.6l2.1-1.2M17.7 8.6l2.1-1.2"/>',
};

/** An icon as an HTML string. */
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

/** Put icons into every [data-icon] element on the page (keeps any text already inside). */
export function applyIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.querySelector(':scope > svg.i')?.remove();
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  }
}

/** Swap the icon inside one element. */
export function setIcon(el, name) {
  if (!el) return;
  el.dataset.icon = name;
  el.querySelector(':scope > svg.i')?.remove();
  el.insertAdjacentHTML('afterbegin', icon(name));
}
