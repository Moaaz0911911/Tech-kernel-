// 📈 Story Stocks on the website: a weekly pretend market where prices follow the news buzz.
import { $, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { lookHTML } from './look.js';
import { makeDialog, inWords } from './arena.js';

const money = (n) => `${Math.round(n).toLocaleString(document.documentElement.lang || undefined)} 🪙`;
const price = (n) => Number(n).toFixed(2);
const pct = (n) => `${n > 0 ? '▲' : n < 0 ? '▼' : '•'} ${Math.abs(n).toFixed(1)}%`;

function spark(list = []) {
  if (list.length < 2) return '<svg class="spark" viewBox="0 0 80 24" aria-hidden="true"></svg>';
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  const pts = list.map((v, i) => `${((i / (list.length - 1)) * 80).toFixed(1)},${(22 - ((v - lo) / (hi - lo || 1)) * 20).toFixed(1)}`).join(' ');
  const up = list[list.length - 1] >= list[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 80 24" aria-hidden="true"><polyline points="${pts}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function initStocks({ openAuth }) {
  if (!auth.ready) { $('#stocksWidget')?.remove(); return null; }
  const box = $('#stocksWidget');
  const body = $('#stocksBody');
  const M = makeDialog('stocks-dialog', `📈 ${t('Story Stocks')}`);
  let data = null;
  let qty = 1;
  let timer = 0;

  function paintWidget() {
    box.hidden = false;
    if (!data) { body.innerHTML = '<div class="chat-empty"><span class="spin">📈</span></div>'; return; }
    const movers = [...data.tickers].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
    body.innerHTML = `<p class="small">${t('A pretend market for the news: prices follow how much everyone’s talking about each company. You get 1,000 🪙 every week.')}</p>
      ${data.me ? `<p class="st-me"><b>${money(data.me.value)}</b>${data.me.place ? ` · #${data.me.place}` : ''} <small>${pct(((data.me.value - data.start) / data.start) * 100)}</small></p>` : ''}
      <ul class="st-movers">${movers.map((m) => `<li><span>${m.emoji} ${esc(m.name)}</span>${spark(m.spark)}<b class="${m.change >= 0 ? 'up' : 'down'}">${pct(m.change)}</b></li>`).join('')}</ul>
      <button type="button" class="btn btn-primary btn-block" data-stocks-open>📈 ${t('Open the market')}</button>
      <p class="muted small">${t('Week ends in {time} · top 3 win XP and the 📈 hat', { time: inWords(data.endsAt - Date.now()) })}</p>`;
  }

  function row(tk) {
    const h = data.me?.holdings.find((x) => x.sym === tk.sym);
    const canBuy = data.me && data.me.cash >= tk.price;
    return `<div class="st-row" data-sym="${tk.sym}">
      <span class="st-name"><span class="st-emoji" aria-hidden="true">${tk.emoji}</span><span><b>${esc(tk.name)}</b><small>${h ? tn(h.shares, '{n} share', '{n} shares') : '&nbsp;'}</small></span></span>
      ${spark(tk.spark)}
      <span class="st-price"><b>${price(tk.price)}</b><small class="${tk.change >= 0 ? 'up' : 'down'}">${pct(tk.change)}</small></span>
      <span class="st-btns">${data.me ? `<button type="button" class="btn btn-sm btn-ghost" data-trade="-1" ${h ? '' : 'disabled'} aria-label="${esc(t('Sell {name}', { name: tk.name }))}">${t('Sell')}</button><button type="button" class="btn btn-sm btn-primary" data-trade="1" ${canBuy ? '' : 'disabled'} aria-label="${esc(t('Buy {name}', { name: tk.name }))}">${t('Buy')}</button>` : ''}</span>
    </div>`;
  }

  function paintMarket() {
    if (!data) return;
    const me = data.me;
    M.body.innerHTML = `
      ${me ? `<div class="st-wallet"><span><small>${t('Portfolio')}</small><b>${money(me.value)}</b></span><span><small>${t('Cash')}</small><b>${money(me.cash)}</b></span><span><small>${t('Rank')}</small><b>${me.place ? `#${me.place}` : '—'}</b></span></div>`
        : `<p><button type="button" class="btn btn-primary" data-action="signup">${t('Sign up to trade')}</button></p>`}
      ${me ? `<div class="seg st-qty" role="radiogroup" aria-label="${esc(t('Shares per trade'))}">${[1, 5, 10, 25].map((n) => `<button type="button" role="radio" data-qty="${n}" aria-checked="${qty === n}">×${n}</button>`).join('')}</div>` : ''}
      <div class="st-list">${data.tickers.map(row).join('')}</div>
      <p class="muted small">${t('Just a game: prices follow how much kerNEl’s news mentions each company (updated every hour), not real stock prices.')}</p>
      <h3 class="mini-title">🏆 ${t('This week')}</h3>
      <ol class="board-list">${data.board.length ? data.board.map((b) => `<li><span class="bp">${b.place}</span>${lookHTML(b)}<b dir="auto">${esc(b.nickname)}</b><span>${money(b.value)}</span></li>`).join('') : `<li class="muted small">${t('Nobody has traded yet — be the first! 🍿')}</li>`}</ol>
      ${data.lastWinners.length ? `<p class="muted small">${t('Last week’s winners:')} ${data.lastWinners.map((w) => `${['🥇', '🥈', '🥉'][w.place - 1]} @${esc(w.username)}`).join(' ')}</p>` : ''}`;
  }

  async function load() {
    try { data = await auth.api('/api/stocks'); } catch { /* keep */ }
    paintWidget();
    if (M.dlg.open) paintMarket();
  }

  async function doTrade(sym, dir, btn) {
    if (!auth.user) { openAuth('signin'); return; }
    btn.disabled = true;
    const tk = data.tickers.find((x) => x.sym === sym);
    const have = data.me.holdings.find((x) => x.sym === sym)?.shares || 0;
    let n = qty;
    if (dir > 0) n = Math.min(qty, Math.floor(data.me.cash / tk.price));
    else n = Math.min(qty, have);
    if (n <= 0) { btn.disabled = false; return; }
    try {
      data = await auth.api('/api/stocks/trade', { method: 'POST', body: { sym, shares: dir * n } });
      sfx.pop();
      burstFrom(btn, { emojis: dir > 0 ? ['📈', '🪙', '✨'] : ['💰', '🪙'], count: 8, spread: 50 });
      toast(dir > 0 ? t('Bought {n} × {name}', { n, name: tk.name }) : t('Sold {n} × {name}', { n, name: tk.name }), { emoji: tk.emoji });
      paintMarket();
      paintWidget();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); btn.disabled = false; }
  }

  async function open() {
    if (!M.dlg.open) M.dlg.showModal();
    if (!data) M.body.innerHTML = '<div class="chat-empty"><span class="spin">📈</span></div>';
    await load();
    paintMarket();
    clearInterval(timer);
    timer = setInterval(() => { if (M.dlg.open && !document.hidden) load(); else clearInterval(timer); }, 60_000);
  }

  box.addEventListener('click', (e) => { if (e.target.closest?.('[data-stocks-open]')) open(); });
  M.dlg.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const q = el?.closest('[data-qty]');
    if (q) { qty = Number(q.dataset.qty); paintMarket(); return; }
    const b = el?.closest('[data-trade]');
    if (b) doTrade(b.closest('[data-sym]').dataset.sym, Number(b.dataset.trade), b);
  });
  auth.addEventListener('signin', load);
  auth.addEventListener('signout', load);
  load();
  return { open, refresh: load };
}
