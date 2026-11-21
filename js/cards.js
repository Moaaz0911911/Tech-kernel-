// 🃏 kerNEl Cards on the website: open packs, browse your collection, gift or trade doubles with friends.
import { $, $$, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { CARDS, CARD_SETS, cardById } from './cards-data.js';
import { cardHTML, answerTrade } from './cards-ui.js';
import { makeDialog } from './arena.js';
import { findPeople, personHTML } from './dm.js';

export function initCards({ openAuth }) {
  if (!auth.ready) { $('#cardsWidget')?.remove(); return null; }
  const box = $('#cardsWidget');
  const body = $('#cardsBody');
  const P = makeDialog('pack-dialog', `🃏 ${t('Card pack')}`);
  const C = makeDialog('cards-dialog', `🃏 ${t('Your collection')}`);
  let data = null;
  let setTab = CARD_SETS[0].id;
  let detail = null;     // card id being looked at
  let offer = null;      // { card, step: 'who'|'what', to, theirs }

  const count = () => Object.keys(data?.cards || {}).length;

  function paintWidget() {
    box.hidden = false;
    if (!auth.user) {
      body.innerHTML = `<p class="small">${t('Collect 36 cards of tech legends, gadgets and space gear. A free pack every day!')}</p><button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to collect')}</button>`;
      return;
    }
    if (!data) { body.innerHTML = '<div class="chat-empty"><span class="spin">🃏</span></div>'; return; }
    const p = data.packs;
    const packBtn = p.free ? `✨ ${t('Open today’s free pack')}` : p.bonus ? `🎁 ${t('Open a bonus pack ({n} left)', { n: p.bonus })}` : '';
    const incoming = data.trades.filter((x) => !x.mine).length;
    body.innerHTML = `<div class="kc-progress"><b>${count()} / ${data.total}</b><span><i style="width:${(count() / data.total) * 100}%"></i></span></div>
      <div class="kc-sets">${data.sets.map((s) => `<span class="${s.complete ? 'done' : ''}">${CARD_SETS.find((x) => x.id === s.id).emoji} ${s.have}/${s.total}</span>`).join('')}</div>
      ${packBtn ? `<button type="button" class="btn btn-primary btn-block" data-cards="open">${packBtn}</button>` : `<p class="muted small">⏳ ${t('Your next free pack arrives tomorrow. Win bingo lines, duels and predictions for bonus packs!')}</p>`}
      <button type="button" class="btn btn-ghost btn-block" data-cards="collection">📚 ${t('View collection')}${incoming ? ` · ${tn(incoming, '{n} trade offer', '{n} trade offers')}` : ''}</button>`;
  }

  async function load() {
    if (!auth.user) { data = null; paintWidget(); return; }
    try { data = await auth.api('/api/cards'); } catch { /* keep */ }
    paintWidget();
    if (C.dlg.open) paintCollection();
  }

  // ---------- opening a pack ----------
  async function openPack() {
    if (!P.dlg.open) P.dlg.showModal();
    P.body.innerHTML = '<div class="kc-pack-shake">🎁</div>';
    try {
      const r = await auth.api('/api/cards/open', { method: 'POST' });
      data = r;
      sfx.pop();
      P.body.innerHTML = `<p class="muted small">${t('Tap each card to flip it!')}</p>
        <div class="kc-reveal">${r.pulled.map((x, i) => `<button type="button" class="kc-flip" data-flip="${i}" style="--d:${i * 0.12}s"><span class="kc-back">🍿</span><span class="kc-front">${cardHTML(cardById(x.id), { isNew: x.isNew })}</span></button>`).join('')}</div>
        ${r.newSet ? `<p class="kc-setdone">🏆 ${t('Set complete! You unlocked a new look.')}</p>` : ''}
        <button type="button" class="btn btn-ghost btn-block" data-cards="flip-all">${t('Flip them all')}</button>`;
      if (r.newSet) setTimeout(() => { rain(['🃏', '🏆', '✨'], 60); sfx.win(); }, 900);
      paintWidget();
    } catch (err) { P.body.innerHTML = `<p>😵 ${esc(tServer(err.message))}</p>`; }
  }
  function flip(btn) {
    if (btn.classList.contains('flipped')) return;
    btn.classList.add('flipped');
    const c = btn.querySelector('.kcard');
    const rare = c && /kc-(epic|legendary)/.test(c.className);
    if (rare) { burstFrom(btn, { emojis: ['✨', '⭐', '💎'], count: 14 }); sfx.win(); } else sfx.blip();
  }

  // ---------- the collection ----------
  function paintCollection() {
    if (!data) return;
    if (detail) return paintDetail();
    const set = CARDS.filter((c) => c.set === setTab);
    C.body.innerHTML = `<div class="seg kc-tabs" role="tablist">${CARD_SETS.map((s) => {
      const st = data.sets.find((x) => x.id === s.id);
      return `<button type="button" role="tab" data-ctab="${s.id}" aria-selected="${s.id === setTab}">${s.emoji} <span>${st.have}/${st.total}</span></button>`;
    }).join('')}</div>
      <h3 class="mini-title">${CARD_SETS.find((s) => s.id === setTab).emoji} ${esc(t(CARD_SETS.find((s) => s.id === setTab).name))}</h3>
      <div class="kc-grid">${set.map((c) => (data.cards[c.id] ? `<button type="button" class="kc-btn" data-cdetail="${c.id}">${cardHTML(c, { count: data.cards[c.id] })}</button>` : cardHTML(c, { hidden: true }))).join('')}</div>
      ${data.trades.length ? `<h3 class="mini-title">🔁 ${t('Open trades')}</h3><div class="kc-trades">${data.trades.map((x) => `<div class="kc-trade">${cardHTML(cardById(x.give), { small: true })}<span>⇄</span>${cardHTML(cardById(x.want), { small: true })}<small>${x.mine ? t('to @{name}', { name: esc(x.to) }) : t('from @{name}', { name: esc(x.from) })}</small>
        ${x.mine ? `<button type="button" class="btn btn-sm btn-ghost" data-ktrade="${x.id}:cancel">${t('Cancel')}</button>` : `<button type="button" class="btn btn-sm btn-primary" data-ktrade="${x.id}:accept">${t('Accept')}</button><button type="button" class="btn btn-sm btn-ghost" data-ktrade="${x.id}:decline">${t('No thanks')}</button>`}</div>`).join('')}</div>` : ''}
      <p class="muted small">${t('Complete a set for the 🃏 Card shark hat, and all four for the Master collector frame.')}</p>`;
  }

  function paintDetail() {
    const c = cardById(detail);
    const n = data.cards[c.id] || 0;
    let extra = '';
    if (offer?.step === 'who') {
      extra = `<div class="kc-offer"><b>${offer.trade ? t('Who do you want to trade with?') : t('Who gets this card?')}</b>
        <label class="people-search"><span class="search-icon" aria-hidden="true">🔍</span><input data-kc-search placeholder="${esc(t('Search people…'))}" autocomplete="off"></label>
        <div class="kc-people" id="kcPeople"></div></div>`;
    } else if (offer?.step === 'what') {
      const theirs = CARDS.filter((x) => offer.theirs[x.id] && !data.cards[x.id]);
      extra = `<div class="kc-offer"><b>${t('Pick a card @{name} has that you’re missing', { name: esc(offer.to) })}</b>
        <div class="kc-grid kc-pick">${theirs.length ? theirs.map((x) => `<button type="button" class="kc-btn" data-kwant="${x.id}">${cardHTML(x, { small: true })}</button>`).join('') : `<p class="muted small">${t('They don’t have any cards you’re missing yet.')}</p>`}</div></div>`;
    }
    C.body.innerHTML = `<button type="button" class="linkish" data-cards="back">‹ ${t('Back')}</button>
      <div class="kc-big">${cardHTML(c, { count: n })}</div>
      <p class="kc-fact" dir="auto">💡 ${esc(t(c.fact))}</p>
      ${n >= 2 && !offer ? `<div class="kc-actions"><button type="button" class="btn btn-ghost" data-cards="gift">🎁 ${t('Gift a double')}</button><button type="button" class="btn btn-primary" data-cards="trade">🔁 ${t('Trade a double')}</button></div>`
        : n < 2 ? `<p class="muted small">${t('Get a double of this card to gift or trade it.')}</p>` : ''}
      ${extra}`;
    if (offer?.step === 'who') { searchPeople(''); setTimeout(() => C.body.querySelector('[data-kc-search]')?.focus(), 60); }
  }

  let seq = 0;
  async function searchPeople(q) {
    const my = ++seq;
    const list = $('#kcPeople');
    try {
      const found = (await findPeople(q)).filter((p) => !p.me && !p.blocked).slice(0, 8);
      if (my !== seq || !list) return;
      list.innerHTML = found.length ? found.map((p) => personHTML(p, { pick: 'data-kto' })).join('') : `<p class="muted small">${t('No kernels found for “{q}”', { q: esc(q) })}</p>`;
    } catch { /* offline */ }
  }

  async function send(to, want = null) {
    try {
      const r = await auth.api('/api/cards/offer', { method: 'POST', body: { to, give: detail, want } });
      sfx.ding();
      toast(r.gift ? t('Card sent to @{name}! 🎁', { name: to }) : t('Trade offer sent to @{name}! 🔁', { name: to }), { emoji: '🃏' });
      offer = null;
      await load();
      paintCollection();
    } catch (err) { toast(tServer(err.message), { emoji: '😵', ms: 5000 }); }
  }

  box.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-cards]');
    if (!b) return;
    if (!auth.user) { openAuth('signin'); return; }
    if (b.dataset.cards === 'open') openPack();
    if (b.dataset.cards === 'collection') { detail = null; offer = null; if (!C.dlg.open) C.dlg.showModal(); paintCollection(); load(); }
  });
  P.dlg.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const f = el?.closest('[data-flip]');
    if (f) return flip(f);
    if (el?.closest('[data-cards="flip-all"]')) $$('.kc-flip', P.body).forEach((x, i) => setTimeout(() => flip(x), i * 220));
  });
  C.dlg.addEventListener('input', (e) => {
    if (e.target.matches?.('[data-kc-search]')) { clearTimeout(C.timer); const q = e.target.value.trim(); C.timer = setTimeout(() => searchPeople(q), 220); }
  });
  C.dlg.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const tab = el.closest('[data-ctab]');
    if (tab) { setTab = tab.dataset.ctab; return paintCollection(); }
    const d = el.closest('[data-cdetail]');
    if (d) { detail = d.dataset.cdetail; offer = null; sfx.blip(); return paintCollection(); }
    const who = el.closest('[data-kto]');
    if (who) {
      const to = who.dataset.kto;
      if (!offer.trade) { if (confirm(t('Give your double {card} to @{name}?', { card: t(cardById(detail).name), name: to }))) send(to); return; }
      try { const r = await auth.api(`/api/cards?user=${encodeURIComponent(to)}`); offer = { ...offer, step: 'what', to, theirs: r.cards }; paintDetail(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const want = el.closest('[data-kwant]');
    if (want) return send(offer.to, want.dataset.kwant);
    const kt = el.closest('[data-ktrade]');
    if (kt) {
      const [id, what] = kt.dataset.ktrade.split(':');
      try { await answerTrade(Number(id), what); await load(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const b = el.closest('[data-cards]');
    if (!b) return;
    if (b.dataset.cards === 'back') { if (offer) offer = null; else detail = null; return paintCollection(); }
    if (b.dataset.cards === 'gift' || b.dataset.cards === 'trade') { offer = { step: 'who', trade: b.dataset.cards === 'trade' }; paintDetail(); }
  });
  auth.addEventListener('signin', load);
  auth.addEventListener('signout', load);
  document.addEventListener('kernel:rewards', load);
  load();
  return { refresh: load, openPack };
}
