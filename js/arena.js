// kerNEl arena on the website: ⚔️ Quiz Duels, 📺 kerNEl Live, 🔮 Predictions and the 🏅 season board.
import { $, esc, store, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tn, tServer, fmtDate } from './i18n.js';
import { lookHTML } from './look.js';
import { questionView, headlineHTML } from './play.js';
import { findPeople, personHTML } from './dm.js';

const fmtTime = (ts) => new Date(ts).toLocaleTimeString(document.documentElement.lang?.startsWith('ar') ? 'ar-EG-u-nu-latn' : document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' });
function inWords(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return tn(m, '{n} minute', '{n} minutes');
  const h = Math.floor(m / 60);
  return h < 24 ? tn(h, '{n} hour', '{n} hours') : tn(Math.round(h / 24), '{n} day', '{n} days');
}
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function makeDialog(cls, title) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal game-modal ${cls}`;
  dlg.innerHTML = `<form method="dialog" class="modal-x-form"><button class="modal-x" aria-label="${esc(t('Close'))}">✕</button></form><div class="modal-body"><h2>${title}</h2><div class="arena-body"></div></div>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return { dlg, body: dlg.querySelector('.arena-body') };
}

export function initArena({ openAuth, openStory, onWin }) {
  if (!auth.ready) { ['#liveWidget', '#duelWidget', '#predictWidget'].forEach((s) => $(s)?.remove()); return null; }
  const meLook = () => ({ ...auth.getProfile(), username: auth.user?.username });

  // ====================================================================================
  // ⚔️ Quiz Duels
  // ====================================================================================
  const D = makeDialog('duel-dialog', `⚔️ ${t('Quiz Duel')}`);
  let duel = null;
  let step = 0;
  let answers = [];
  let qTimer = 0;

  async function openDuel(id) {
    if (!auth.user) { openAuth('signin'); return; }
    if (!D.dlg.open) D.dlg.showModal();
    D.body.innerHTML = '<div class="auth-mascot spin">⚔️</div>';
    try { duel = (await auth.api(`/api/duels/${id}`)).duel; paintDuel(); } catch (e) { D.body.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  async function challenge(username, person) {
    if (!auth.user) { toast(t('Sign in to duel your friends ⚔️'), { emoji: '⚔️' }); openAuth('signin'); return; }
    if (!D.dlg.open) D.dlg.showModal();
    D.body.innerHTML = '<div class="auth-mascot spin">⚔️</div>';
    try {
      const r = await auth.api('/api/duels', { method: 'POST', body: { to: username } });
      duel = r.duel;
      if (!r.existing) toast(t('Challenge sent to @{name}! Now play your turn ⚔️', { name: username }), { emoji: '⚔️' });
      paintDuel();
      loadDuels();
    } catch (e) { D.body.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  function paintDuel() {
    const o = duel.opponent;
    if (duel.my || duel.status !== 'open') { paintDuelResult(); return; }
    if (duel.questions) { answers = []; step = 0; showDuelQuestion(); return; }
    D.body.innerHTML = `<div class="game-end">
      <div class="duel-vs">${lookHTML(meLook(), { cls: 'avatar-lg' })}<b>VS</b>${lookHTML(o, { cls: 'avatar-lg' })}</div>
      <h3>${t('You vs @{name}', { name: esc(o.username) })}</h3>
      <p>${t('{n} questions from today’s news, {s} seconds each. Best score wins — the faster player wins a tie.', { n: duel.total, s: duel.secondsEach })}</p>
      ${duel.their?.done ? `<p class="duel-note">🔥 ${t('@{name} already played. Your turn!', { name: esc(o.username) })}</p>` : ''}
      <button type="button" class="btn btn-primary btn-big" data-duel="go">${t('Start the duel ⚔️')}</button>
      <p class="muted small">${t('The duel ends in {time}.', { time: inWords(duel.expires - Date.now()) })}</p></div>`;
  }

  function showDuelQuestion() {
    const q = duel.questions[step];
    const v = questionView(q);
    D.body.innerHTML = `
      <div class="quiz-progress">${duel.questions.map((_, i) => `<i class="${i < step ? 'done' : ''}"></i>`).join('')}</div>
      <div class="duel-timer"><i style="animation-duration:${duel.secondsEach}s"></i></div>
      <p class="quiz-q">${t('Question {i} of {n}', { i: step + 1, n: duel.questions.length })} · ${v.ask}</p>
      ${v.lead ? `<p class="quiz-headline">${headlineHTML(v.lead)}</p>` : ''}
      <div class="quiz-opts">${v.opts.map((o, i) => `<button type="button" class="quiz-opt" data-da="${i}">${o}</button>`).join('')}</div>`;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => pickDuel(-1), duel.secondsEach * 1000);
  }

  function pickDuel(i, btn) {
    clearTimeout(qTimer);
    answers[step] = i;
    D.body.querySelectorAll('.quiz-opt').forEach((b) => { b.disabled = true; });
    if (btn) { btn.classList.add('picked'); burstFrom(btn, { emojis: ['⚔️', '✨'], count: 6, spread: 50 }); sfx.blip(); } else sfx.buzz();
    setTimeout(() => { step++; if (step < duel.questions.length) showDuelQuestion(); else finishDuel(); }, 300);
  }

  async function finishDuel() {
    D.body.innerHTML = `<div class="auth-mascot spin">⚔️</div><p class="muted">${t('Checking your answers…')}</p>`;
    try { duel = (await auth.api(`/api/duels/${duel.id}/answer`, { method: 'POST', body: { answers } })).duel; paintDuelResult(true); loadDuels(); } catch (e) { D.body.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  function paintDuelResult(fresh = false) {
    const o = duel.opponent;
    const name = esc(o.username);
    const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)}s` : '');
    let html;
    if (!duel.my && duel.status !== 'open') {
      html = `<span class="game-big">⌛</span><h3>${t('This duel ran out of time.')}</h3>`;
    } else if (!duel.winner) {
      html = `<span class="game-big">🍿</span><h3>${t('{s} / {n}! Now it’s @{name}’s turn.', { s: duel.my.score, n: duel.total, name })}</h3><p class="muted">${t('We’ll let you know who won.')}</p>`;
    } else {
      const big = duel.winner === 'me' ? '🏆' : duel.winner === 'draw' ? '🤝' : '😤';
      const head = duel.winner === 'me' ? t('You won the duel!') : duel.winner === 'draw' ? t('It’s a draw!') : t('@{name} won this time.', { name });
      html = `<span class="game-big">${big}</span><h3>${head}</h3>
        <div class="duel-score">
          <span>${lookHTML(meLook())}<b>${duel.my ? duel.my.score : '–'}</b><small>${t('You')} ${secs(duel.my?.ms)}</small></span>
          <i>—</i>
          <span>${lookHTML(o)}<b>${duel.their ? duel.their.score : '–'}</b><small>@${name} ${secs(duel.their?.ms)}</small></span>
        </div>`;
      if (fresh && duel.winner === 'me') { rain(['🏆', '⚔️', '✨'], 36); sfx.win(); onWin?.('duel'); }
    }
    D.body.innerHTML = `<div class="game-end">${html}<button type="button" class="btn btn-ghost" data-rematch="${name}">⚔️ ${t('Rematch')}</button></div>`;
  }

  D.body.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('[data-duel="go"]')) {
      auth.api(`/api/duels/${duel.id}/start`, { method: 'POST' }).then((r) => { duel = r.duel; answers = []; step = 0; showDuelQuestion(); sfx.pop(); })
        .catch((err) => { D.body.innerHTML = `<p>😵 ${esc(tServer(err.message))}</p>`; });
      return;
    }
    const a = el.closest('[data-da]');
    if (a && !a.disabled) { pickDuel(Number(a.dataset.da), a); return; }
    const rm = el.closest('[data-rematch]');
    if (rm) challenge(rm.dataset.rematch);
  });
  D.dlg.addEventListener('close', () => clearTimeout(qTimer));

  // the duels card on the Play tab
  async function loadDuels() {
    const box = $('#duelBody');
    if (!box) return;
    if (!auth.user) {
      box.innerHTML = `<p class="small">${t('Challenge a friend to 5 questions from today’s news. Winner takes the XP!')}</p><button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to duel')}</button>`;
      return;
    }
    try {
      const r = await auth.api('/api/duels');
      const label = (d) => {
        if (d.status === 'open') return !d.my ? `<b class="duel-tag hot">${t('Your turn!')}</b>` : `<span class="duel-tag">${t('Waiting…')}</span>`;
        if (d.winner === 'me') return `<b class="duel-tag win">🏆 ${d.my?.score ?? '–'}–${d.their?.score ?? '–'}</b>`;
        if (d.winner === 'draw') return `<span class="duel-tag">🤝 ${d.my?.score}–${d.their?.score}</span>`;
        if (d.winner === 'them') return `<span class="duel-tag">${d.my?.score ?? '–'}–${d.their?.score ?? '–'}</span>`;
        return `<span class="duel-tag">⌛</span>`;
      };
      box.innerHTML = `
        <p class="small">${t('Challenge a friend to 5 questions from today’s news. Winner takes the XP!')}</p>
        <button type="button" class="btn btn-primary btn-block" data-duel-pick>⚔️ ${t('Challenge someone')}</button>
        ${r.duels.length ? `<ul class="duel-list">${r.duels.slice(0, 6).map((d) => `<li><button type="button" data-open-duel="${d.id}">${lookHTML(d.opponent)}<span dir="auto">@${esc(d.opponent.username)}</span>${label(d)}</button></li>`).join('')}</ul>` : ''}
        <p class="muted small">${t('Wins {w} · Losses {l} · Draws {d}', { w: r.record.won, l: r.record.lost, d: r.record.draws })}</p>`;
    } catch { box.innerHTML = `<p class="muted small">${t('Duels are napping — back soon. 😴')}</p>`; }
  }

  // pick who to challenge
  const P = makeDialog('pick-dialog', `⚔️ ${t('Who do you want to duel?')}`);
  P.body.innerHTML = `<label class="people-search"><span class="sr-only">${t('Search people')}</span><span class="search-icon" aria-hidden="true">🔍</span><input type="search" placeholder="${esc(t('Search by name or @username'))}" autocomplete="off"></label><div class="pick-list"></div>`;
  const pickInput = P.body.querySelector('input');
  const pickList = P.body.querySelector('.pick-list');
  let pickTimer = 0;
  async function fillPick() {
    try {
      const people = (await findPeople(pickInput.value.trim())).filter((p) => !p.me && !p.blocked);
      pickList.innerHTML = people.length ? people.map((p) => personHTML(p, { pick: 'data-challenge' })).join('') : `<p class="muted small">${t('No kernels found for “{q}”', { q: esc(pickInput.value.trim()) })}</p>`;
    } catch (e) { pickList.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }
  pickInput.addEventListener('input', () => { clearTimeout(pickTimer); pickTimer = setTimeout(fillPick, 220); });
  P.body.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-challenge]') : null;
    if (!b) return;
    P.dlg.close();
    challenge(b.dataset.challenge);
  });
  function openPicker() {
    if (!auth.user) { openAuth('signin'); return; }
    pickInput.value = '';
    pickList.innerHTML = '<div class="chat-empty"><span class="spin">⚔️</span></div>';
    P.dlg.showModal();
    fillPick();
  }

  // ====================================================================================
  // 📺 kerNEl Live
  // ====================================================================================
  const L = makeDialog('live-dialog', '📺 kerNEl Live');
  let live = null;
  let skew = 0;
  let liveTimer = 0;
  let tick = 0;
  let lastQ = -2;
  let lastPhase = '';
  const serverNow = () => Date.now() + skew;

  async function fetchLive() {
    const r = await auth.api('/api/live');
    skew = r.now - Date.now();
    live = r;
    return r;
  }

  function nextShowText(r) {
    if (!r.next) return '';
    return t('Next show: {time} (in {wait})', { time: `${fmtDate(r.next, { weekday: 'short' })} ${fmtTime(r.next)}`, wait: inWords(r.next - serverNow()) });
  }

  function paintLiveWidget() {
    const box = $('#liveBody');
    if (!box || !live) return;
    const rules = `<p class="small">${t('{n} questions, 12 seconds each. One wrong answer and you’re out. Last kernels standing win 60 XP and the 🎤 mic hat!', { n: live.total || 10 })}</p>`;
    if (live.phase === 'idle') {
      box.innerHTML = `${rules}<p class="live-next">⏰ ${esc(nextShowText(live))}</p>
        <p class="muted small">${t('Every day at {a} and {b} (your time).', { a: fmtTime(Date.UTC(2026, 0, 1, live.slotsUtc[0])), b: fmtTime(Date.UTC(2026, 0, 1, live.slotsUtc[1])) })}</p>
        <button type="button" class="btn btn-ghost btn-block" data-action="notify">🔔 ${t('Remind me before shows')}</button>`;
      return;
    }
    const label = live.phase === 'lobby' ? t('Lobby open — starts in {t}', { t: mmss(live.startsAt - serverNow()) }) : live.phase === 'done' ? t('The show just ended — see who won!') : t('🔴 LIVE NOW — question {i} of {n}', { i: live.q + 1, n: live.total });
    box.innerHTML = `${rules}<p class="live-next live-on">${esc(label)}</p><p class="muted small">👥 ${tn(live.players, '{n} player', '{n} players')}</p>
      <button type="button" class="btn btn-primary btn-block" data-live-open>${live.phase === 'lobby' ? t('Join the lobby 📺') : t('Watch the show 📺')}</button>`;
  }

  function scheduleWidget() {
    clearTimeout(tick);
    const soon = live && (live.phase !== 'idle' || (live.next && live.next - serverNow() < 15 * 60_000));
    tick = setTimeout(async () => { if (!document.hidden && !L.dlg.open) { try { await fetchLive(); paintLiveWidget(); } catch { /* offline */ } } scheduleWidget(); }, soon ? 4000 : 60_000);
  }

  function paintLive() {
    const r = live;
    const me = r.me || {};
    const head = `<div class="live-head"><span>👥 ${tn(r.players || 0, '{n} player', '{n} players')}</span>${r.q >= 0 ? `<span>🔥 ${tn(r.alive || 0, '{n} still in', '{n} still in')}</span>` : ''}</div>`;
    let html = '';
    if (r.phase === 'idle') {
      html = `<div class="game-end"><span class="game-big">📺</span><h3>${t('No show right now')}</h3><p>${esc(nextShowText(r))}</p></div>`;
    } else if (r.phase === 'lobby') {
      html = `<div class="game-end"><span class="live-count" data-countdown="${r.startsAt}">${mmss(r.startsAt - serverNow())}</span>
        <h3>${t('The show starts soon!')}</h3>
        ${me.joined ? `<p class="live-in">✅ ${t('You’re in! Get ready… 🍿')}</p>` : auth.user ? `<button type="button" class="btn btn-primary btn-big" data-live-join>${t('Join the show')}</button>` : `<button type="button" class="btn btn-primary btn-big" data-action="signin">${t('Sign in to play')}</button>`}
        <p class="muted small">${t('{n} questions, 12 seconds each. One wrong answer and you’re out. Last kernels standing win 60 XP and the 🎤 mic hat!', { n: r.total })}</p></div>`;
    } else if (r.phase === 'question' || r.phase === 'reveal') {
      const v = questionView(r.question);
      const reveal = r.phase === 'reveal' ? r.reveal : null;
      const total = reveal ? reveal.counts.reduce((a, b) => a + b, 0) || 1 : 1;
      const canAnswer = r.phase === 'question' && me.joined && me.alive && me.choice == null;
      const status = !me.joined ? `👀 ${t('You’re watching — join the next show!')}`
        : r.phase === 'reveal' ? (me.alive ? `✅ ${t('Still in! {n} left', { n: r.alive })}` : `💀 ${t('You’re out — watch and cheer!')}`)
          : !me.alive ? `💀 ${t('You’re out — watch and cheer!')}` : me.choice != null ? `🔒 ${t('Answer locked in…')}` : `⏱️ ${t('Pick fast!')}`;
      html = `<div class="live-q">
        <div class="live-timer"><b data-countdown="${r.deadline}">${Math.max(0, Math.ceil((r.deadline - serverNow()) / 1000))}</b><small>${r.phase === 'question' ? t('seconds') : t('next question')}</small></div>
        <p class="quiz-q">${t('Question {i} of {n}', { i: r.q + 1, n: r.total })} · ${v.ask}</p>
        ${v.lead ? `<p class="quiz-headline">${headlineHTML(v.lead)}</p>` : ''}
        <div class="quiz-opts">${v.opts.map((o, i) => {
          const pct = reveal ? Math.round((reveal.counts[i] / total) * 100) : 0;
          const cls = [reveal && i === reveal.answer ? 'right' : '', reveal && me.choice === i && i !== reveal.answer ? 'wrong' : '', me.choice === i ? 'picked' : ''].filter(Boolean).join(' ');
          return `<button type="button" class="quiz-opt ${cls}" data-la="${i}" ${canAnswer ? '' : 'disabled'}>${o}${reveal ? `<span class="live-pct"><i style="width:${pct}%"></i><small>${pct}%</small></span>` : ''}</button>`;
        }).join('')}</div>
        <p class="live-status">${status}</p></div>`;
    } else { // done
      const won = auth.user && (r.winners || []).some((w) => w.username === auth.user.username);
      html = `<div class="game-end"><span class="game-big">${won ? '🏆' : r.winnerCount ? '🎉' : '😱'}</span>
        <h3>${won ? t('You won kerNEl Live! +60 XP and the 🎤 mic hat') : r.winnerCount ? tn(r.winnerCount, '{n} kernel survived every question!', '{n} kernels survived every question!') : t('Nobody survived all {n} questions!', { n: r.total })}</h3>
        ${(r.winners || []).length ? `<div class="live-winners">${r.winners.slice(0, 24).map((w) => `<button type="button" class="friend" data-user="${esc(w.username)}" title="@${esc(w.username)}">${lookHTML(w)}</button>`).join('')}</div>` : ''}
        <p class="muted">${esc(nextShowText(r))}</p></div>`;
      if (won && lastPhase !== 'done') { rain(['🏆', '🎤', '✨'], 50); sfx.win(); onWin?.('live'); }
    }
    if (r.phase !== lastPhase || r.q !== lastQ) {
      if (r.phase === 'question') sfx.pop();
      if (r.phase === 'reveal' && me.joined && me.choice === r.reveal.answer) sfx.ding();
      if (r.phase === 'reveal' && me.joined && me.alive === false && lastPhase === 'question') sfx.buzz();
    }
    lastPhase = r.phase;
    lastQ = r.q;
    L.body.innerHTML = head + html;
  }

  function liveLoop() {
    clearTimeout(liveTimer);
    if (!L.dlg.open) return;
    // tick the countdowns every 250 ms; ask the server again when a deadline passes (or every few seconds in the lobby)
    L.body.querySelectorAll('[data-countdown]').forEach((el) => {
      const left = Number(el.dataset.countdown) - serverNow();
      el.textContent = el.classList.contains('live-count') ? mmss(left) : String(Math.max(0, Math.ceil(left / 1000)));
    });
    const due = live && live.deadline && serverNow() > live.deadline + 120;
    const age = Date.now() - (live?._at || 0);
    const lobbyRefresh = live && live.phase === 'lobby' && age > 3000;
    // between shows, look again now and then so an open dialog moves on to the next lobby by itself
    const quietRefresh = live && (live.phase === 'idle' || live.phase === 'done') && age > 15_000;
    if (due || lobbyRefresh || quietRefresh || (live && live.phase === 'done' && !live.winners)) {
      fetchLive().then((r) => { r._at = Date.now(); paintLive(); }).catch(() => {}).finally(() => { liveTimer = setTimeout(liveLoop, 250); });
      return;
    }
    liveTimer = setTimeout(liveLoop, 250);
  }

  async function openLive() {
    if (!L.dlg.open) L.dlg.showModal();
    L.body.innerHTML = '<div class="auth-mascot spin">📺</div>';
    try { const r = await fetchLive(); r._at = Date.now(); paintLive(); liveLoop(); } catch (e) { L.body.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  L.body.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('[data-live-join]')) {
      try { const r = await auth.api('/api/live/join', { method: 'POST' }); skew = r.now - Date.now(); live = r; live._at = Date.now(); paintLive(); burstFrom(el, { emojis: ['📺', '🍿', '✨'], count: 10 }); sfx.ding(); } catch (err) { toast(tServer(err.message), { emoji: '📺' }); }
      return;
    }
    const a = el.closest('[data-la]');
    if (a && !a.disabled && live?.phase === 'question') {
      const choice = Number(a.dataset.la);
      L.body.querySelectorAll('[data-la]').forEach((b) => { b.disabled = true; });
      a.classList.add('picked');
      burstFrom(a, { emojis: ['🍿', '✨'], count: 6, spread: 40 });
      try { await auth.api('/api/live/answer', { method: 'POST', body: { q: live.q, choice } }); live.me = { ...live.me, choice }; paintLive(); } catch (err) { toast(tServer(err.message), { emoji: '⏱️' }); }
    }
  });
  L.dlg.addEventListener('close', () => { clearTimeout(liveTimer); fetchLive().then(paintLiveWidget).catch(() => {}); });

  // ====================================================================================
  // 🔮 Predictions
  // ====================================================================================
  let preds = null;
  function predHTML(p, done = false) {
    const total = p.total || 0;
    const voted = p.mine != null;
    const closed = done || Date.now() > p.closes;
    const showBars = voted || closed;
    const ask = p.kind === 'upvotes'
      ? `<p class="pred-q">${t('Will this story reach {n} upvotes by tomorrow?', { n: p.data.threshold })}</p><button type="button" class="pred-story" data-pstory="${p.id}">${headlineHTML(p.question)}</button>`
      : `<p class="pred-q" dir="auto">${esc(p.question)}</p>`;
    const opts = p.options.map((o, i) => {
      const pct = total ? Math.round((p.counts[i] / total) * 100) : 0;
      const label = p.kind === 'upvotes' ? t(o) : o;
      const cls = [p.mine === i ? 'mine' : '', done && p.answer === i ? 'right' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="pred-opt ${cls}" data-pvote="${p.id}:${i}" ${closed || !auth.user ? 'disabled' : ''}><span dir="auto">${esc(label)}${p.mine === i ? ' ✓' : ''}</span>${showBars ? `<span class="poll-bar"><i style="width:${pct}%"></i></span><b>${pct}%</b>` : ''}</button>`;
    }).join('');
    const foot = done
      ? (p.mine == null ? t('You didn’t vote on this one.') : p.mine === p.answer ? `🔮 ${t('You called it! +{xp} XP', { xp: preds.xp })}` : `🙈 ${t('Missed this one.')}`)
      : closed ? t('Voting closed — results soon.') : `${tn(total, '{n} vote', '{n} votes')} · ${t('closes in {time}', { time: inWords(p.closes - Date.now()) })}`;
    return `<div class="pred${done ? ' done' : ''}">${ask}<div class="pred-opts">${opts}</div><p class="muted small">${foot}</p></div>`;
  }
  async function loadPredictions() {
    const box = $('#predictBody');
    if (!box) return;
    try {
      preds = await auth.api('/api/predictions');
      box.innerHTML = `
        <p class="small">${t('Call it before it happens. Right calls earn +{xp} XP, and 5 unlock the 🔮 crystal ball hat.', { xp: preds.xp })}</p>
        ${preds.record ? `<p class="muted small">${t('Your calls: {r} right out of {n}', { r: preds.record.right, n: preds.record.total })}</p>` : ''}
        ${preds.open.length ? preds.open.map((p) => predHTML(p)).join('') : `<p class="muted small">${t('No open predictions right now — new ones pop daily.')}</p>`}
        ${preds.resolved.length ? `<h4 class="mini-title">${t('Recently settled')}</h4>${preds.resolved.slice(0, 4).map((p) => predHTML(p, true)).join('')}` : ''}
        ${!auth.user ? `<button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to make predictions')}</button>` : ''}`;
    } catch { box.innerHTML = `<p class="muted small">${t('Predictions are napping — back soon. 😴')}</p>`; }
  }
  $('#predictWidget')?.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const s = el?.closest('[data-pstory]');
    if (s) {
      const p = [...(preds?.open || []), ...(preds?.resolved || [])].find((x) => String(x.id) === s.dataset.pstory);
      if (p?.storyKey) openStory?.({ key: p.storyKey, title: p.question, url: p.data.url, source: 'Hacker News' });
      return;
    }
    const v = el?.closest('[data-pvote]');
    if (!v || v.disabled) return;
    const [id, choice] = v.dataset.pvote.split(':').map(Number);
    try {
      preds = await auth.api('/api/predictions/vote', { method: 'POST', body: { id, choice } });
      burstFrom(v, { emojis: ['🔮', '✨'], count: 8 });
      sfx.blip();
      loadPredictions();
    } catch (err) { toast(tServer(err.message), { emoji: '🔮' }); }
  });

  // ---------------- Play tab cards ----------------
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('[data-duel-pick]')) openPicker();
    const od = el.closest('[data-open-duel]');
    if (od) openDuel(Number(od.dataset.openDuel));
    if (el.closest('[data-live-open]')) openLive();
  });

  ['#liveWidget', '#duelWidget', '#predictWidget'].forEach((s) => { const w = $(s); if (w) w.hidden = false; });
  fetchLive().then(paintLiveWidget).catch(() => { $('#liveBody').innerHTML = `<p class="muted small">${t('kerNEl Live is napping — back soon. 😴')}</p>`; }).finally(scheduleWidget);
  loadDuels();
  loadPredictions();
  const refresh = () => { loadDuels(); loadPredictions(); fetchLive().then(paintLiveWidget).catch(() => {}); };
  auth.addEventListener('signin', refresh);
  auth.addEventListener('signout', refresh);
  setInterval(() => { if (!document.hidden) { loadDuels(); loadPredictions(); } }, 2 * 60_000);

  return { openDuel, challenge, openLive, openPicker, refresh };
}

// ====================================================================================
// 🏅 the season board (used by the leaderboard card on the Me tab)
// ====================================================================================
export async function seasonBoardHTML() {
  const r = await auth.api('/api/leaderboard?season=1');
  const medal = ['🥇', '🥈', '🥉'];
  const month = fmtDate(Date.parse(`${r.season}-01T12:00:00Z`), { month: 'long', year: 'numeric' });
  const rows = r.top.length
    ? r.top.slice(0, 10).map((u) => `<li class="${auth.user && u.username === auth.user.username ? 'me' : ''}" data-user="${esc(u.username)}">
        <span class="b-place">${medal[u.place - 1] || u.place}</span><span class="b-ava">${lookHTML(u)}</span>
        <span class="b-name"><b dir="auto">${esc(u.nickname)}</b><small>@${esc(u.username)}${u.streak > 1 ? ` · 🔥${u.streak}` : ''}</small></span>
        <span class="b-xp">${u.xp}<small>XP</small></span></li>`).join('')
    : `<li class="muted small">${t('Nobody yet this season — your chance to grab #1! 🍿')}</li>`;
  const me = !auth.user ? '' : r.me?.place ? t('You’re <b>#{place}</b> this season with {xp} XP.', { place: r.me.place, xp: r.me.xp }) : t('Earn XP this month to join the season.');
  return {
    rows,
    me: `${me} <span class="season-note">${t('Season {month} · ends in {time} · prizes: 🥇{a} 🥈{b} 🥉{c} XP', { month, time: inWords(r.endsAt - Date.now()), a: r.prizes[0], b: r.prizes[1], c: r.prizes[2] })}</span>`,
  };
}

/** Season medals on a profile card. */
export const seasonMedalsHTML = (list) => (list?.length ? `<p class="uc-seasons">${list.slice(0, 6).map((s) => `<span title="${esc(fmtDate(Date.parse(`${s.season}-01T12:00:00Z`), { month: 'long', year: 'numeric' }))}">${['🥇', '🥈', '🥉'][s.place - 1] || '🏅'} ${esc(fmtDate(Date.parse(`${s.season}-01T12:00:00Z`), { month: 'short', year: 'numeric' }))}</span>`).join('')}</p>` : '');
