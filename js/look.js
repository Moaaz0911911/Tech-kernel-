// How a kernel looks: avatar emoji or 📷 photo + XP-unlocked hat and frame + a 🔥 streak flame (+ an "active now" dot).
import { esc } from './utils.js';
import { t } from './i18n.js';
import { HATS, FRAMES } from './cosmetics.js';
import { CONFIG } from './config.js';

const hatEmoji = (hat) => HATS.find((h) => h.id === hat)?.emoji ?? (typeof hat === 'string' ? hat : '');
const frameId = (frame) => (FRAMES.some((f) => f.id === frame) ? frame : 'none');

/** Address of someone's profile photo (photos live on the kerNEl server; the version busts caches). */
export function photoUrl(p) {
  const base = String(CONFIG.apiBase || '').replace(/\/+$/, '');
  if (!p?.photo || !p.username || !base) return '';
  return `${base}/api/photo/${encodeURIComponent(p.username)}?v=${encodeURIComponent(p.photo)}`;
}

/** Avatar with hat, frame and (optionally) a live streak flame. `p` can be a profile or a person from the server. */
export function lookHTML(p = {}, { cls = '', streak = 0, active = false } = {}) {
  const hat = hatEmoji(p.hat);
  const flame = streak >= 2 ? `<span class="ava-flame" title="${esc(t('{n}-day streak', { n: streak }))}">🔥${streak > 99 ? '99+' : streak}</span>` : '';
  const url = photoUrl(p);
  const face = url
    ? `<span class="ava-face ava-photo" data-emoji="${esc(p.avatar || '🍿')}"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('ava-broken');this.remove()"></span>`
    : `<span class="ava-face">${esc(p.avatar || '🍿')}</span>`;
  const dot = active ? `<span class="ava-active" title="${esc(t('Active now'))}"></span>` : '';
  return `<span class="ava ${cls}${url ? ' has-photo' : ''}" data-frame="${frameId(p.frame)}" aria-hidden="true">${face}${hat ? `<span class="ava-hat">${esc(hat)}</span>` : ''}${flame}${dot}</span>`;
}

// ---------- 🧈 Butter Shop looks: name effects and chat bubble colours ----------
const FX = new Set(['shimmer', 'neon', 'rainbow', 'glitch']);
const BUBBLES = new Set(['mint', 'sky', 'peach', 'grape', 'gold']);
/** Extra classes for a name with a shop effect (✨ shimmer, 💡 neon, 🌈 rainbow, 📺 glitch). */
export const fxClass = (p) => (FX.has(p?.fx) ? ` nm-fx fx-${p.fx}` : '');
/** A person's name, wearing their name effect. */
export function nameHTML(p = {}, { tag = 'b', cls = '' } = {}) {
  const name = p.nickname || p.username || '';
  const fx = fxClass(p);
  return `<${tag} class="${`${cls}${fx}`.trim()}" dir="auto"${fx ? ` data-text="${esc(name)}"` : ''}>${esc(name)}</${tag}>`;
}
/** ` data-bubble="…"` for a chat message from someone with a bubble colour (or nothing). */
export const bubbleAttr = (p) => (BUBBLES.has(p?.bubble) ? ` data-bubble="${p.bubble}"` : '');
