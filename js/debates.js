// ⚖️ Debate Rooms on the website: pick a side, post your best argument, ❤️ the good ones.
import { $, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { lookHTML } from './look.js';
import { makeDialog, inWords } from './arena.js';

export function initDebates({ openAuth, openStory }) {
  if (!auth.ready) { $('#debateWidget')?.remove(); return null; }
  const box = $('#debateWidget');
  const body = $('#debateBody');
  const D = makeDialog('debate-dialog', `⚖️ ${t('Debate')}`);
  let list = null;
  let cur = null;          // { debate, arguments }
  let draft = null;        // a new debate for a story

  // only the daily debate's wording is ours to translate; people's own questions stay as written
  const tx = (d, text) => (d.auto ? t(text) : text);
  const sideLabel = (d, s) => tx(d, d.sides[s === 'a' ? 0 : 1]);
  const bar = (d) => {
    const total = d.votes[0] + d.votes[1];
    const a = total ? Math.round((d.votes[0] / total) * 100) : 50;
    return `<div class="db-bar" role="img" aria-label="${esc(`${sideLabel(d, 'a')} ${d.votes[0]} · ${sideLabel(d, 'b')} ${d.votes[1]}`)}"><i style="width:${a}%"></i></div>
      <div class="db-bar-labels"><span dir="auto">${esc(sideLabel(d, 'a'))} <b>${d.votes[0]}</b></span><span dir="auto"><b>${d.votes[1]}</b> ${esc(sideLabel(d, 'b'))}</span></div>`;
  };

  function paintWidget() {
    if (!list) { box.hidden = true; return; }
    box.hidden = false;
    const open = list.debates.filter((d) => !d.closed);
    body.innerHTML = open.length ? open.slice(0, 4).map((d) => `<button type="button" class="db-item" data-db="${d.id}">
        <small>${d.auto ? `🔥 ${t('Today’s big debate')}` : t('Open debate')} · ${tn(d.args, '{n} argument', '{n} arguments')}</small>
        <b dir="auto">${esc(tx(d, d.question))}</b>${d.story ? `<span class="db-story" dir="auto">📰 ${esc(d.story.title)}</span>` : ''}${bar(d)}</button>`).join('')
      : `<p class="muted small">${t('No open debates yet — start one from any story ⚖️')}</p>`;
    body.innerHTML += `<p class="muted small">${t('Open a story and tap ⚖️ to start your own debate.')}</p>`;
  }

  async function loadList() {
    try { list = await auth.api('/api/debates'); } catch { /* keep */ }
    paintWidget();
  }

  function paintDebate() {
    const { debate: d, arguments: args } = cur;
    const side = (s) => {
      const mine = d.mine === s;
      const items = args.filter((a) => a.side === s);
      return `<div class="db-side db-${s}${mine ? ' mine' : ''}"><h3 dir="auto">${esc(sideLabel(d, s))} <small>${d.votes[s === 'a' ? 0 : 1]}</small></h3>
        ${!d.closed ? `<button type="button" class="btn btn-sm ${mine ? 'btn-primary' : 'btn-ghost'} btn-block" data-db-vote="${s}">${mine ? `✓ ${t('Your side')}` : t('Pick this side')}</button>` : ''}
        <div class="db-args">${items.length ? items.map((a) => `<div class="db-arg${d.best === a.id ? ' best' : ''}">${d.best === a.id ? `<span class="db-best">🏆 ${t('Best argument')}</span>` : ''}
            <p dir="auto">${esc(a.text)}</p><div class="db-arg-foot"><button type="button" class="db-who" data-user="${esc(a.user.username)}">${lookHTML(a.user)}<small>@${esc(a.user.username)}</small></button>
            <button type="button" class="db-like${a.liked ? ' on' : ''}" data-db-like="${a.id}" ${a.mine || d.closed ? 'disabled' : ''} aria-label="${esc(t('Like this argument'))}">❤️ ${a.likes}</button>
            ${a.mine ? '' : `<button type="button" class="pt-flag" data-db-report="${a.id}" aria-label="${esc(t('Report'))}">🚩</button>`}</div></div>`).join('') : `<p class="muted small">${t('No arguments yet.')}</p>`}</div></div>`;
    };
    D.body.innerHTML = `<p class="db-q" dir="auto">${esc(tx(d, d.question))}</p>
      ${d.story ? `<button type="button" class="pt-story" data-db-story>📰 <span dir="auto">${esc(d.story.title)}</span></button>` : ''}
      ${bar(d)}
      <p class="muted small">${d.closed ? (d.winner === 'tie' ? t('It’s a tie!') : t('Closed — “{side}” won!', { side: esc(sideLabel(d, d.winner)) })) : t('Closes in {time}', { time: inWords(d.closes - Date.now()) })}</p>
      ${!d.closed && d.mine ? `<form class="db-form" data-db-argue><textarea maxlength="280" rows="2" dir="auto" placeholder="${esc(t('Your best argument for “{side}”…', { side: sideLabel(d, d.mine) }))}"></textarea><button class="btn btn-primary btn-sm">${t('Post')}</button></form>`
        : !d.closed && auth.user ? `<p class="small">👆 ${t('Pick a side to post an argument.')}</p>` : !auth.user ? `<button type="button" class="btn btn-primary" data-action="signup">${t('Sign up to join the debate')}</button>` : ''}
      <div class="db-sides">${side('a')}${side('b')}</div>
      <p class="muted small">${t('The side with more votes wins, and the best-liked argument on it earns XP.')}</p>`;
  }

  async function open(id) {
    if (!D.dlg.open) D.dlg.showModal();
    D.body.innerHTML = '<div class="chat-empty"><span class="spin">⚖️</span></div>';
    try { cur = await auth.api(`/api/debates/${id}`); paintDebate(); } catch (err) { D.body.innerHTML = `<p>😵 ${esc(tServer(err.message))}</p>`; }
  }

  /** From the reader: this story's debates, or a form to start one. */
  async function forStory(story) {
    if (!auth.user) { toast(t('Sign in to start a debate ⚖️'), { emoji: '⚖️' }); openAuth('signin'); return; }
    draft = story;
    if (!D.dlg.open) D.dlg.showModal();
    let existing = [];
    try { existing = (await auth.api(`/api/debates?story=${encodeURIComponent(story.key)}`)).debates; } catch { /* fine */ }
    D.body.innerHTML = `${existing.length ? `<p class="tp-label">${t('Debates on this story')}</p>${existing.map((d) => `<button type="button" class="db-item" data-db="${d.id}"><b dir="auto">${esc(tx(d, d.question))}</b>${bar(d)}</button>`).join('')}` : ''}
      <form class="db-new" data-db-new><p class="tp-label">${t('Start a debate')}</p>
        <p class="pt-story">📰 <span dir="auto">${esc(story.title)}</span></p>
        <label class="field"><span>${t('Question')}</span><input name="q" maxlength="120" dir="auto" required placeholder="${esc(t('e.g. Is this good news for gamers?'))}"></label>
        <div class="db-new-sides"><label class="field"><span>${t('Side 1')}</span><input name="a" maxlength="30" dir="auto" value="${esc(t('Yes'))}"></label><label class="field"><span>${t('Side 2')}</span><input name="b" maxlength="30" dir="auto" value="${esc(t('No'))}"></label></div>
        <button class="btn btn-primary btn-block">⚖️ ${t('Start the debate')}</button></form>`;
  }

  D.dlg.addEventListener('submit', async (e) => {
    const f = e.target;
    if (!f.matches('[data-db-argue], [data-db-new]')) return; // let the ✕ button close the dialog
    e.preventDefault();
    try {
      if (f.matches('[data-db-argue]')) {
        const text = f.querySelector('textarea').value.trim();
        if (!text) return;
        cur = await auth.api('/api/debates/argue', { method: 'POST', body: { id: cur.debate.id, text } });
        sfx.pop();
        paintDebate();
      } else if (f.matches('[data-db-new]')) {
        cur = await auth.api('/api/debates', { method: 'POST', body: { storyKey: draft.key, question: f.elements.q.value, sideA: f.elements.a.value, sideB: f.elements.b.value } });
        sfx.ding();
        rain(['⚖️', '🍿'], 24);
        paintDebate();
        loadList();
      }
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  });
  D.dlg.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const item = el.closest('[data-db]');
    if (item) return open(Number(item.dataset.db));
    if (el.closest('[data-db-story]') && cur?.debate.story) { D.dlg.close(); openStory?.(cur.debate.story); return; }
    const v = el.closest('[data-db-vote]');
    if (v) {
      if (!auth.user) { openAuth('signin'); return; }
      try { cur = await auth.api('/api/debates/vote', { method: 'POST', body: { id: cur.debate.id, side: v.dataset.dbVote } }); sfx.blip(); burstFrom(v, { emojis: ['⚖️', '✨'], count: 6, spread: 40 }); paintDebate(); loadList(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const like = el.closest('[data-db-like]');
    if (like) {
      if (!auth.user) { openAuth('signin'); return; }
      const on = !like.classList.contains('on');
      try { cur = await auth.api('/api/debates/like', { method: 'POST', body: { id: Number(like.dataset.dbLike), like: on } }); if (on) { burstFrom(like, { emojis: ['❤️'], count: 6, spread: 30 }); sfx.pop(); } paintDebate(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const rep = el.closest('[data-db-report]');
    if (rep && confirm(t('Report this argument for being mean, unsafe or spammy?'))) {
      try { await auth.api('/api/debates/report', { method: 'POST', body: { id: Number(rep.dataset.dbReport) } }); toast(t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' }); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  box.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('[data-db]'); if (b) open(Number(b.dataset.db)); });
  auth.addEventListener('signin', loadList);
  auth.addEventListener('signout', loadList);
  setInterval(() => { if (!document.hidden && box.offsetParent) loadList(); }, 5 * 60_000);
  loadList();
  return { open, forStory, refresh: loadList };
}
