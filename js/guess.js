// 🔤 Emoji Headlines and 🌫️ Blur Reveal: guess today's stories from emojis or a slowly un-blurring photo.
import { $, esc, toast, safeUrl } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tServer } from './i18n.js';
import { lookHTML } from './look.js';
import { makeDialog } from './arena.js';

const GAMES = {
  emoji: { emoji: '🔤', title: 'Emoji Headlines', intro: 'Each round shows a headline as emojis. Pick the real story — the faster you are, the more points you get.' },
  blur: { emoji: '🌫️', title: 'Blur Reveal', intro: 'A story’s photo starts blurry and slowly gets sharper. Guess the headline before it’s clear — sooner means more points.' },
};

export function initGuess({ openAuth, openStory, onDone }) {
  if (!auth.ready) { $('#guessWidget')?.remove(); return null; }
  const box = $('#guessWidget');
  const body = $('#guessBody');
  const G = makeDialog('guess-dialog', '');
  const title = G.dlg.querySelector('h2');
  const state = { emoji: null, blur: null };
  let kind = 'emoji';
  let round = 0;
  let answers = [];
  let shownAt = 0;
  let tick = 0;
  let locked = false;

  function paintWidget() {
    box.hidden = false;
    body.innerHTML = Object.entries(GAMES).map(([k, g]) => {
      const s = state[k];
      const status = !s ? '…' : s.played ? `✅ ${t('{score} points', { score: s.played.score })}` : t('Play today’s 5 rounds');
      return `<button type="button" class="gs-card" data-guess="${k}"><span class="gs-emoji" aria-hidden="true">${g.emoji}</span><span><b>${t(g.title)}</b><small>${status}</small></span><span aria-hidden="true">›</span></button>`;
    }).join('') + `<p class="muted small">${t('New rounds every day. A perfect game earns a 🃏 card pack.')}</p>`;
  }

  async function load(k) {
    try { state[k] = await auth.api(`/api/guess/${k}`); } catch { /* not ready yet */ }
  }
  async function loadAll() { await Promise.all(Object.keys(GAMES).map(load)); paintWidget(); }

  const boardHTML = (b) => `<h3 class="mini-title">🏆 ${t('Today’s best')}</h3><ol class="board-list">${b.length ? b.map((x) => `<li><span class="bp">${x.place}</span>${lookHTML(x)}<b dir="auto">${esc(x.nickname)}</b><span>${x.score}</span></li>`).join('') : `<li class="muted small">${t('Nobody yet — be the first! 🍿')}</li>`}</ol>`;

  function intro() {
    const s = state[kind];
    const g = GAMES[kind];
    title.textContent = `${g.emoji} ${t(g.title)}`;
    if (!s) { G.body.innerHTML = `<p>😵 ${t('Today’s game is still popping — try again in a minute!')}</p>`; return; }
    if (s.played) return results(s.played);
    G.body.innerHTML = `<p>${t(g.intro)}</p>
      <p class="muted small">${t('{n} rounds · {s} seconds each', { n: s.rounds.length, s: s.seconds })}</p>
      ${auth.user ? `<button type="button" class="btn btn-primary btn-big" data-g="start">${t('Start')} ▶</button>` : `<button type="button" class="btn btn-primary btn-big" data-action="signup">${t('Sign up to play')}</button>`}
      ${boardHTML(s.board)}`;
  }

  function showRound() {
    const s = state[kind];
    const r = s.rounds[round];
    locked = false;
    const clue = kind === 'emoji'
      ? `<div class="gs-clue gs-emojis" aria-label="${esc(t('Emoji clue'))}">${esc(r.clue)}</div>`
      : `<div class="gs-clue gs-photo"><img src="${esc(safeUrl(r.clue))}" alt="" referrerpolicy="no-referrer" draggable="false" onerror="this.parentNode.classList.add('gone')"><span>📷 ${t('Photo unavailable — trust your gut!')}</span></div>`;
    G.body.innerHTML = `<div class="gs-top"><span>${t('Round {i} of {n}', { i: round + 1, n: s.rounds.length })}</span><span class="gs-time" id="gsTime">${s.seconds}</span></div>
      <div class="duel-timer"><i style="animation-duration:${s.seconds}s"></i></div>
      ${clue}
      <div class="quiz-opts">${r.options.map((o, i) => `<button type="button" class="quiz-opt" data-pick="${i}" dir="auto">${esc(o)}</button>`).join('')}</div>`;
    shownAt = performance.now();
    if (kind === 'blur') requestAnimationFrame(() => requestAnimationFrame(() => {
      const img = G.body.querySelector('.gs-photo img');
      if (img) { img.style.transitionDuration = `${s.seconds}s`; img.classList.add('clearing'); }
    }));
    clearInterval(tick);
    tick = setInterval(() => {
      const left = Math.max(0, s.seconds - (performance.now() - shownAt) / 1000);
      const el = $('#gsTime');
      if (el) el.textContent = String(Math.ceil(left));
      if (left <= 0) pick(-1);
    }, 200);
  }

  function pick(i, btn = null) {
    if (locked) return;
    locked = true;
    clearInterval(tick);
    const ms = Math.round(performance.now() - shownAt);
    answers.push({ pick: i, ms });
    G.body.querySelectorAll('[data-pick]').forEach((b) => { b.disabled = true; });
    if (btn) { btn.classList.add('picked'); sfx.pop(); }
    const img = G.body.querySelector('.gs-photo img');
    if (img) { img.style.transitionDuration = '.4s'; img.classList.add('clearing'); }
    setTimeout(() => {
      round++;
      if (round < state[kind].rounds.length) showRound(); else finish();
    }, 550);
  }

  async function start() {
    try { await auth.api(`/api/guess/${kind}/start`, { method: 'POST' }); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); return; }
    round = 0;
    answers = [];
    showRound();
  }

  async function finish() {
    G.body.innerHTML = '<div class="chat-empty"><span class="spin">🧮</span></div>';
    try {
      const r = await auth.api(`/api/guess/${kind}/answer`, { method: 'POST', body: { answers } });
      if (r.already) { state[kind] = r; return intro(); }
      state[kind] = { ...state[kind], played: { score: r.score, right: r.right, answers: r.answers, correct: r.correct, stories: r.stories, perRound: r.perRound }, board: r.board };
      if (r.right >= 4) { rain([GAMES[kind].emoji, '🍿', '✨'], 40); sfx.win(); } else sfx.ding();
      if (r.pack) toast(t('Perfect game! A bonus 🃏 card pack is waiting for you.'), { emoji: '🃏', ms: 5000 });
      onDone?.(kind, r.right);
      results(state[kind].played);
      paintWidget();
    } catch (err) { G.body.innerHTML = `<p>😵 ${esc(tServer(err.message))}</p>`; }
  }

  function results(p) {
    const s = state[kind];
    G.body.innerHTML = `<div class="game-end"><span class="game-big">${p.right >= 5 ? '🏆' : p.right >= 3 ? '🎉' : '🍿'}</span>
      <h3>${t('{score} points', { score: p.score })} · ${t('{r} of {n} right', { r: p.right ?? 0, n: s.rounds.length })}</h3></div>
      <ol class="gs-review">${s.rounds.map((r, i) => {
        const ok = p.answers?.[i] === p.correct?.[i];
        const st = p.stories?.[i];
        return `<li class="${ok ? 'ok' : 'no'}"><span class="gs-mini">${kind === 'emoji' ? esc(r.clue) : '🌫️'}</span><button type="button" class="linkish" data-gstory="${i}" dir="auto">${ok ? '✅' : '❌'} ${esc(st?.title || r.options[p.correct?.[i]] || '')}</button></li>`;
      }).join('')}</ol>
      ${boardHTML(s.board || [])}
      <p class="muted small">${t('Come back tomorrow for new rounds!')}</p>`;
  }

  box.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-guess]');
    if (!b) return;
    kind = b.dataset.guess;
    if (!G.dlg.open) G.dlg.showModal();
    intro();
  });
  G.dlg.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('[data-g="start"]')) { if (!auth.user) openAuth('signin'); else start(); return; }
    const p = el.closest('[data-pick]');
    if (p) { pick(Number(p.dataset.pick), p); burstFrom(p, { emojis: ['✨'], count: 4, spread: 30 }); return; }
    const st = el.closest('[data-gstory]');
    if (st) { const story = state[kind].played?.stories?.[Number(st.dataset.gstory)]; if (story) { G.dlg.close(); openStory?.(story); } }
  });
  G.dlg.addEventListener('close', () => { clearInterval(tick); if (answers.length && round < (state[kind]?.rounds.length || 0) && !state[kind]?.played) { answers = []; round = 0; } });
  auth.addEventListener('signin', loadAll);
  auth.addEventListener('signout', loadAll);
  paintWidget();
  loadAll();
  return { open: (k) => { kind = k; if (!G.dlg.open) G.dlg.showModal(); intro(); }, refresh: loadAll };
}
