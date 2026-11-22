// 🎯 Tech Bingo on the website: your weekly card fills itself from the headlines.
import { $, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, rain } from './fun.js';
import { t, tServer } from './i18n.js';
import { lookHTML } from './look.js';
import { inWords } from './arena.js';

const splitLabel = (label) => { const m = String(label).match(/^(\S+)\s+(.*)$/u); return m ? [m[1], m[2]] : ['•', label]; };

export function initBingo({ openStory }) {
  if (!auth.ready) { $('#bingoWidget')?.remove(); return null; }
  const box = $('#bingoWidget');
  const body = $('#bingoBody');
  let data = null;
  let lastLines = null;
  let picked = null;

  function claimable() {
    if (!data?.card) return [];
    return [data.lines >= 1 && 'line', data.lines >= 3 && 'triple', data.full && 'full'].filter((x) => x && !data.claimed.includes(x));
  }

  function paint() {
    box.hidden = false;
    if (!data) { body.innerHTML = '<div class="chat-empty"><span class="spin">🎯</span></div>'; return; }
    if (!data.card) {
      body.innerHTML = `<p class="small">${t('A new bingo card every week. Squares fill in by themselves when the news matches them!')}</p>
        <button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to get your card')}</button>`;
      return;
    }
    const cells = data.card.map((c, n) => {
      if (c.free) return `<button type="button" class="bg-cell free on" data-cell="${n}"><span class="bg-emoji">🍿</span><span class="bg-text">${t('Free')}</span></button>`;
      const [emoji, text] = splitLabel(t(c.label));
      return `<button type="button" class="bg-cell${c.hit ? ' on' : ''}${picked === n ? ' picked' : ''}" data-cell="${n}" aria-pressed="${!!c.hit}" title="${esc(t(c.label))}"><span class="bg-emoji">${emoji}</span><span class="bg-text">${esc(text)}</span></button>`;
    }).join('');
    const sel = picked != null ? data.card[picked] : null;
    const detail = sel && !sel.free
      ? `<div class="bg-detail">${sel.hit ? `✅ <button type="button" class="linkish" data-bingo-story dir="auto">${esc(sel.hit.title)}</button>` : `⏳ ${t('Not in the news yet this week — keep watching!')}`}</div>` : '';
    const todo = claimable();
    const prize = { line: t('1 line'), triple: t('3 lines'), full: t('Full card!') };
    body.innerHTML = `<div class="bg-grid">${cells}</div>${detail}
      <p class="bg-status"><b>${t('Lines: {n}', { n: data.lines })}</b> · ${t('ends in {time}', { time: inWords(data.endsAt - Date.now()) })}</p>
      ${todo.length ? `<button type="button" class="btn btn-primary btn-block bg-claim" data-bingo-claim>🎉 BINGO! ${t('Collect: {what}', { what: todo.map((x) => prize[x]).join(' + ') })}</button>` : ''}
      <p class="muted small">${t('1 line: +{a} XP · 3 lines: +{b} XP · full card: +{c} XP, plus 🃏 card packs', { a: data.prizes.line, b: data.prizes.triple, c: data.prizes.full })}</p>
      ${data.winners.length ? `<p class="muted small">🏁 ${t('First bingos this week:')}</p><div class="bg-winners">${data.winners.slice(0, 8).map((w) => `<button type="button" class="friend" data-user="${esc(w.username)}" title="@${esc(w.username)}">${lookHTML(w)}</button>`).join('')}</div>` : ''}`;
  }

  async function load() {
    try { data = await auth.api('/api/bingo'); } catch { /* keep */ }
    if (data?.card && lastLines != null && data.lines > lastLines) { sfx.ding(); toast(t('A new line on your bingo card! 🎯'), { emoji: '🎯' }); }
    lastLines = data?.lines ?? null;
    paint();
  }

  async function claim(btn) {
    btn.disabled = true;
    try {
      const r = await auth.api('/api/bingo/claim', { method: 'POST' });
      data = r;
      if (r.won.length) {
        rain(['🎯', '🎉', '🍿', '🃏'], 60);
        sfx.win();
        toast(t('BINGO! +{xp} XP and {n} card packs', { xp: r.xp, n: r.packs }), { emoji: '🎯', ms: 5000 });
        document.dispatchEvent(new CustomEvent('kernel:rewards'));
      }
      paint();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); btn.disabled = false; }
  }

  box.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const c = el.closest('[data-cell]');
    if (c) { picked = picked === Number(c.dataset.cell) ? null : Number(c.dataset.cell); paint(); return; }
    if (el.closest('[data-bingo-claim]')) { claim(el.closest('[data-bingo-claim]')); return; }
    if (el.closest('[data-bingo-story]') && picked != null) {
      const h = data.card[picked].hit;
      if (h?.key && h.key !== 'x') openStory?.({ key: h.key, title: h.title });
    }
  });
  auth.addEventListener('signin', load);
  auth.addEventListener('signout', () => { data = null; lastLines = null; load(); });
  setInterval(() => { if (!document.hidden && box.offsetParent) load(); }, 10 * 60_000);
  load();
  return { refresh: load };
}
