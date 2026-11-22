// 🃏 How a kerNEl card looks (in packs, the collection and gift/trade messages).
import { esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx } from './fun.js';
import { t } from './i18n.js';
import { CARD_SETS, RARITIES, cardById } from './cards-data.js';

const rarityLabel = (id) => t(RARITIES.find((r) => r.id === id)?.label || 'Common');

/** One card's face. `count` shows a ×2 badge; `small` for lists and messages. */
export function cardHTML(c, { count = 0, isNew = false, small = false, hidden = false } = {}) {
  if (!c) return '';
  if (hidden) return `<span class="kcard kc-missing${small ? ' kc-small' : ''}" aria-label="${esc(t('Not collected yet'))}"><span class="kc-emoji">?</span></span>`;
  const set = CARD_SETS.find((s) => s.id === c.set);
  return `<span class="kcard kc-${c.rarity}${small ? ' kc-small' : ''}" data-card="${c.id}">
    ${isNew ? `<span class="kc-new">${t('NEW')}</span>` : ''}${count > 1 ? `<span class="kc-count">×${count}</span>` : ''}
    <span class="kc-emoji" aria-hidden="true">${c.emoji}</span><b class="kc-name">${esc(t(c.name))}</b>
    <small class="kc-meta">${set?.emoji || ''} ${esc(rarityLabel(c.rarity))}</small></span>`;
}

/** A gift or trade card inside a private chat. */
export function tradeMessageHTML(m, tr) {
  if (!tr) return '';
  const give = cardById(tr.give);
  const want = tr.want ? cardById(tr.want) : null;
  const label = !want ? (m.mine ? t('You sent a card 🎁') : t('A gift for you! 🎁'))
    : m.mine ? t('Your trade offer') : t('Trade offer 🔁');
  const status = { done: `✅ ${t('Traded!')}`, declined: `🙅 ${t('Declined')}`, cancelled: t('Cancelled'), failed: t('This trade didn’t work out'), gift: '' }[tr.status] || '';
  const actions = want && tr.status === 'open'
    ? (m.mine ? `<button type="button" class="btn btn-sm btn-ghost" data-ktrade="${tr.id}:cancel">${t('Cancel')}</button>`
      : `<button type="button" class="btn btn-sm btn-primary" data-ktrade="${tr.id}:accept">${t('Accept')}</button><button type="button" class="btn btn-sm btn-ghost" data-ktrade="${tr.id}:decline">${t('No thanks')}</button>`) : '';
  return `<div class="dm-kcards"><b>🃏 ${esc(label)}</b>
    <div class="dm-kcards-row">${cardHTML(give, { small: true })}${want ? `<span class="dm-kswap" aria-hidden="true">⇄</span>${cardHTML(want, { small: true })}` : ''}</div>
    ${want && !m.mine && tr.status === 'open' ? `<small>${t('You give your {card}', { card: esc(t(want.name)) })}</small>` : ''}
    ${status ? `<small class="dm-kstatus">${status}</small>` : ''}${actions ? `<div class="dm-kactions">${actions}</div>` : ''}</div>`;
}

export async function answerTrade(id, what) {
  const r = await auth.api('/api/cards/answer', { method: 'POST', body: { id, accept: what === 'accept' } });
  if (r.status === 'done') { sfx.ding(); toast(t('Traded! Check your collection 🃏'), { emoji: '🃏' }); }
  return r;
}

