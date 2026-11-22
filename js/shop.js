// 🧈 The Butter Shop on the website (Me tab). You earn 1 🧈 butter for every XP, and spend it on power-ups,
// codme personalities, hats, name effects, chat bubble colours and profile backgrounds. XP and rank never go down.
import { $, esc, toast, store } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { SHOP, SHOP_KINDS, BUTTER } from './shop-data.js';
import { lookHTML, nameHTML } from './look.js';
import { makeDialog } from './arena.js';

export function initShop({ openAuth }) {
  if (!auth.ready) { $('#shopWidget')?.remove(); return null; }
  const box = $('#shopWidget');
  const body = $('#shopBody');
  const D = makeDialog('shop-dialog', `🧈 ${t('Butter Shop')}`);
  let data = null;
  let busy = false;

  const me = () => ({ ...auth.getProfile(), username: auth.user?.username });
  const owns = (item) => item.price === 0 || data?.owned.includes(item.id);
  const wearing = (item) => (me()[item.kind] || 'none') === item.value;
  const butterHTML = (n) => `<span class="butter-n">🧈 <b>${n}</b></span>`;

  function paintWidget() {
    box.hidden = false;
    if (!auth.user) {
      body.innerHTML = `<p class="small">${t('Earn 🧈 butter with every XP and spend it on hats, name effects, chat bubbles, codme personalities and streak freezes.')}</p><button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to shop')}</button>`;
      return;
    }
    if (!data) { body.innerHTML = '<div class="chat-empty"><span class="spin">🧈</span></div>'; return; }
    const on = SHOP.filter((i) => i.kind !== 'use' && i.price > 0 && owns(i) && wearing(i));
    body.innerHTML = `<div class="shop-top">${butterHTML(data.butter)}<small class="muted">${t('1 🧈 for every XP you earn')}</small></div>
      ${data.freezes ? `<p class="small">🧊 ${tn(data.freezes, '{n} streak freeze ready', '{n} streak freezes ready')}</p>` : ''}
      ${on.length ? `<p class="small">${t('Wearing:')} ${on.map((i) => `<span title="${esc(t(i.name))}">${i.emoji}</span>`).join(' ')}</p>` : ''}
      <button type="button" class="btn btn-primary btn-block" data-shop-open>🛍️ ${t('Open the shop')}</button>`;
  }

  function preview(item) {
    const m = me();
    if (item.kind === 'hat') return lookHTML({ ...m, hat: item.value });
    if (item.kind === 'fx') return nameHTML({ ...m, fx: item.value }, { cls: 'shop-name' });
    if (item.kind === 'bubble') return `<span class="shop-bubble" data-bubble="${item.value}">${t('Hi! 👋')}</span>`;
    if (item.kind === 'bg') return `<span class="uc-cover shop-cover" data-bg="${item.value}"></span>`;
    return `<span class="shop-emoji" aria-hidden="true">${item.emoji}</span>`;
  }

  function button(item) {
    if (item.kind === 'use') {
      const full = item.id === 'freeze' && data.freezes >= BUTTER.maxFreezes;
      return `<button type="button" class="btn btn-sm btn-primary" data-shop-buy="${item.id}" ${full || data.butter < item.price ? 'disabled' : ''}>${full ? t('Full') : `${t('Buy')} · 🧈 ${item.price}`}</button>`;
    }
    if (!owns(item)) return `<button type="button" class="btn btn-sm btn-primary" data-shop-buy="${item.id}" ${data.butter < item.price ? 'disabled' : ''}>${t('Buy')} · 🧈 ${item.price}</button>`;
    return wearing(item)
      ? `<button type="button" class="btn btn-sm btn-ghost" data-shop-off="${item.id}" aria-pressed="true">✓ ${t('On')}</button>`
      : `<button type="button" class="btn btn-sm btn-ghost" data-shop-use="${item.id}">${t('Use')}</button>`;
  }

  function paintShop() {
    if (!data) return;
    D.body.innerHTML = `<div class="shop-top">${butterHTML(data.butter)}<small class="muted">${t('You get 1 🧈 for every XP you earn. Spending it never lowers your XP or rank.')}</small></div>
      ${SHOP_KINDS.map(([kind, title]) => `<section class="shop-sec" data-shop-sec="${kind}"><h3 class="tp-label">${t(title)}</h3><div class="shop-grid">
        ${SHOP.filter((i) => i.kind === kind).map((i) => `<div class="shop-item${owns(i) && i.kind !== 'use' ? ' owned' : ''}">
          <div class="shop-prev">${preview(i)}</div>
          <b>${i.kind === 'use' || i.kind === 'persona' ? '' : `${i.emoji} `}${esc(t(i.name))}</b>
          ${i.desc ? `<small class="muted">${esc(t(i.desc))}</small>` : ''}
          ${i.id === 'freeze' ? `<small class="muted">${t('You have {n}', { n: data.freezes })}</small>` : ''}
          ${i.price === 0 ? `<small class="muted">${t('Free')}</small>` : ''}
          ${button(i)}</div>`).join('')}</div></section>`).join('')}`;
  }

  async function load() {
    if (!auth.user) { data = null; paintWidget(); return; }
    try {
      data = await auth.api('/api/shop');
      store.set(`shop:${auth.profileKey()}`, { owned: data.owned });
      if (data.welcomeGift) toast(t('Welcome to the Butter Shop! Here’s {n} 🧈 to start.', { n: data.welcomeGift }), { emoji: '🧈', ms: 5000 });
    } catch { /* keep the last one */ }
    paintWidget();
    if (D.dlg.open) paintShop();
  }

  async function open(kind) {
    if (!auth.user) { openAuth('signup'); return; }
    if (!D.dlg.open) D.dlg.showModal();
    if (!data) D.body.innerHTML = '<div class="chat-empty"><span class="spin">🧈</span></div>';
    await load();
    if (kind) D.body.querySelector(`[data-shop-sec="${kind}"]`)?.scrollIntoView({ block: 'start' });
  }

  /** Switch a look on or off. Hats live with the other avatar looks; the rest are shop looks. */
  function wear(item, on) {
    const p = auth.getProfile();
    const value = on ? item.value : 'none'; // 'none' = no hat, plain look, the classic codme
    auth.saveProfile({ ...p, [item.kind]: value });
    document.dispatchEvent(new CustomEvent('kernel:look', { detail: { kind: item.kind, value } }));
    paintShop();
    paintWidget();
  }

  D.dlg.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el || busy) return;
    const b = el.closest('[data-shop-buy]');
    if (b) {
      const item = SHOP.find((i) => i.id === b.dataset.shopBuy);
      busy = true;
      try {
        const r = await auth.api('/api/shop/buy', { method: 'POST', body: { id: item.id } });
        data = { ...data, ...r };
        store.set(`shop:${auth.profileKey()}`, { owned: data.owned });
        sfx.ding();
        burstFrom(b, { emojis: [item.emoji, '🧈', '✨'], count: 10, spread: 50 });
        if (item.kind !== 'use') { wear(item, true); toast(t('{item} is yours — and switched on!', { item: t(item.name) }), { emoji: item.emoji }); }
        else {
          if (item.id === 'pack') document.dispatchEvent(new CustomEvent('kernel:rewards'));
          if (item.id === 'treat') document.dispatchEvent(new CustomEvent('kernel:pet'));
          toast(item.id === 'freeze' ? t('Streak freeze ready! It kicks in by itself if you miss a day. 🧊') : item.id === 'pack' ? t('A card pack is waiting in kerNEl Cards! 🃏') : t('Treat bought! Give it to your pet on the Me tab. 🍪'), { emoji: item.emoji });
          paintShop();
          paintWidget();
        }
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); } finally { busy = false; }
      return;
    }
    const u = el.closest('[data-shop-use]');
    if (u) { const item = SHOP.find((i) => i.id === u.dataset.shopUse); wear(item, true); sfx.pop(); if (item.kind === 'persona') rain([item.emoji], 14); return; }
    const off = el.closest('[data-shop-off]');
    if (off) { wear(SHOP.find((i) => i.id === off.dataset.shopOff), false); sfx.blip(); }
  });
  box.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('[data-shop-open]')) open(); });
  auth.addEventListener('signin', load);
  auth.addEventListener('signout', load);
  document.addEventListener('kernel:look', () => { if (!D.dlg.open) paintWidget(); });
  setInterval(() => { if (!document.hidden && box.offsetParent && auth.user) load(); }, 3 * 60_000);
  load();
  return { open, refresh: load };
}
