// How a kernel looks: avatar emoji + XP-unlocked hat and frame + a 🔥 streak flame.
import { esc } from './utils.js';
import { t } from './i18n.js';
import { HATS, FRAMES } from './cosmetics.js';

const hatEmoji = (hat) => HATS.find((h) => h.id === hat)?.emoji ?? (typeof hat === 'string' ? hat : '');
const frameId = (frame) => (FRAMES.some((f) => f.id === frame) ? frame : 'none');

/** Avatar with hat, frame and (optionally) a live streak flame. `p` can be a profile or a person from the server. */
export function lookHTML(p = {}, { cls = '', streak = 0 } = {}) {
  const hat = hatEmoji(p.hat);
  const flame = streak >= 2 ? `<span class="ava-flame" title="${esc(t('{n}-day streak', { n: streak }))}">🔥${streak > 99 ? '99+' : streak}</span>` : '';
  return `<span class="ava ${cls}" data-frame="${frameId(p.frame)}" aria-hidden="true"><span class="ava-face">${esc(p.avatar || '🍿')}</span>${hat ? `<span class="ava-hat">${esc(hat)}</span>` : ''}${flame}</span>`;
}
