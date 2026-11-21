// Games that everyone plays together (questions and answers live on the kerNEl server):
// 🧠 the Daily Kernel Quiz, 🍿 Popcorn Battles and the 🏆 weekly Real or Fake? tournament.
import { $, esc, safeUrl, store, toast } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { lookHTML } from './look.js';

const today = () => new Date().toISOString().slice(0, 10);
const headline = (text) => `<span dir="ltr" lang="en">${esc(text)}</span>`;
const until = (ts) => {
  const h = Math.max(0, Math.floor((ts - Date.now()) / 36e5));
  return h >= 24 ? tn(Math.floor(h / 24), '{n} day', '{n} days') : tn(h, '{n} hour', '{n} hours');
};
const boardHTML = (rows, score) => (rows?.length
  ? `<ol class="mini-board">${rows.slice(0, 5).map((r) => `<li data-user="${esc(r.username)}">${['🥇', '🥈', '🥉'][r.place - 1] || r.place} ${lookHTML(r)} <span dir="auto">${esc(r.nickname)}</span><b>${score(r)}</b></li>`).join('')}</ol>`
  : `<p class="muted small">${t('Nobody on the board yet — be the first!')}</p>`);

/** How a quiz question reads (shared by the Daily Quiz, ⚔️ duels and 📺 kerNEl Live). */
export function questionView(q) {
  if (q.type === 'missing') return { ask: t('Fill in the missing word:'), lead: q.headline, opts: q.options.map((o) => headline(o)) };
  if (q.type === 'category') return { ask: t('Which kerNEl section is this story in?'), lead: q.headline, opts: q.options.map((id) => `${catById(id).emoji} ${esc(t(catById(id).label))}`) };
  if (q.type === 'source') return { ask: t('Who published this headline?'), lead: q.headline, opts: q.options.map((o) => esc(o)) };
  if (q.type === 'hotter') return { ask: t('Which story got more upvotes?'), lead: null, opts: q.options.map((o) => headline(o)) };
  return { ask: t('Three are real headlines from today. Which one did codme make up? 🤡'), lead: null, opts: q.options.map((o) => headline(o)) };
}
export const headlineHTML = headline;

export function initPlay({ openAuth, onQuiz, onBattle, onTourney }) {
  if (!auth.ready) { ['#quizWidget', '#battleWidget', '#tourneyPromo'].forEach((s) => $(s)?.remove()); return null; }

  // ====================================================================================
  // 🧠 Daily Kernel Quiz
  // ====================================================================================
  const qDlg = $('#quizDialog');
  const qBody = $('#quizBody');
  let quiz = null;
  let answers = [];
  let step = 0;

  const questionHTML = questionView;

  function showQuestion() {
    const q = quiz.questions[step];
    const v = questionHTML(q);
    qBody.innerHTML = `
      <div class="quiz-progress">${quiz.questions.map((_, i) => `<i class="${i < step ? 'done' : ''}"></i>`).join('')}</div>
      <p class="quiz-q">${t('Question {i} of {n}', { i: step + 1, n: quiz.questions.length })} · ${v.ask}</p>
      ${v.lead ? `<p class="quiz-headline">${headline(v.lead)}</p>` : ''}
      <div class="quiz-opts">${v.opts.map((o, i) => `<button type="button" class="quiz-opt" data-a="${i}">${o}</button>`).join('')}</div>`;
    qBody.querySelector('.quiz-opt')?.focus();
  }

  function resultHTML(r) {
    const perfect = r.score === r.total;
    const review = quiz.questions.map((q, i) => {
      const right = r.answers?.[i] === r.correct[i];
      const v = questionHTML(q);
      return `<li>${right ? '✅' : '❌'} ${v.ask} <b>${v.opts[r.correct[i]]}</b></li>`;
    }).join('');
    return `<div class="game-end"><span class="game-big">${perfect ? '🧠' : r.score >= 3 ? '🍿' : '🌽'}</span>
      <h3>${r.score} / ${r.total} ${perfect ? t('— big brain!') : r.score >= 3 ? t('— nice popping!') : t('— the news got you today!')}</h3>
      ${r.already ? `<p class="muted small">${t('You already played today — here’s your score.')}</p>` : ''}
      ${!auth.user ? `<p class="small"><button type="button" class="linkish" data-action="signup">${t('Sign up')}</button> ${t('to get on the daily board.')}</p>` : ''}
      <ul class="quiz-review">${review}</ul>
      <h4>${t('Today’s quiz board')}</h4>${boardHTML(r.board, (b) => `${b.score}/${r.total}`)}
      <p class="muted small">${t('A new quiz pops every day at midnight (UTC).')}</p></div>`;
  }

  async function finish() {
    qBody.innerHTML = `<div class="auth-mascot spin">🍿</div><p class="muted">${t('Checking your answers…')}</p>`;
    try {
      const r = await auth.api('/api/quiz', { method: 'POST', body: { answers } });
      qBody.innerHTML = resultHTML(r);
      if (r.score === r.total) { rain(['🧠', '🍿', '✨'], 40); sfx.win(); } else sfx.ding();
      const guestDone = !auth.user && store.get('quiz:guestDay', '') === today();
      if (!r.already && !guestDone) { store.set('quiz:guestDay', today()); onQuiz?.(r.score, r.total); }
      renderSide({ ...r, played: true });
    } catch (e) { qBody.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  async function openQuiz() {
    if (!qDlg.open) qDlg.showModal();
    qBody.innerHTML = `<div class="auth-mascot spin">🍿</div><p class="muted">${t('Popping today’s questions…')}</p>`;
    try {
      quiz = await auth.api('/api/quiz');
      answers = [];
      step = 0;
      if (quiz.played) { qBody.innerHTML = resultHTML({ ...quiz.played, total: quiz.total, already: true, board: quiz.board }); return; }
      qBody.innerHTML = `<div class="game-end"><span class="game-big">🧠</span>
        <h3>${t('{n} questions from today’s headlines', { n: quiz.questions.length })}</h3>
        <p>${t('One go per day — no peeking at the feed! 👀 Fast answers win ties on the board.')}</p>
        <button type="button" class="btn btn-primary btn-big" data-quiz="go">${t('Let’s go! 🚀')}</button></div>`;
      sfx.pop();
    } catch (e) { qBody.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  qBody.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('[data-quiz="go"]')) { showQuestion(); return; }
    const a = el.closest('[data-a]');
    if (!a || a.disabled) return;
    answers[step] = Number(a.dataset.a);
    qBody.querySelectorAll('.quiz-opt').forEach((b) => { b.disabled = true; });
    a.classList.add('picked');
    burstFrom(a, { emojis: ['🍿', '✨'], count: 6, spread: 50 });
    sfx.blip();
    setTimeout(() => { step++; if (step < quiz.questions.length) showQuestion(); else finish(); }, 350);
  });
  qDlg.addEventListener('click', (e) => { if (e.target === e.currentTarget) qDlg.close(); });

  function renderSide(state) {
    const box = $('#quizSide');
    const played = state?.played;
    box.innerHTML = `
      <p class="small">${played ? t('You scored <b>{s}/{n}</b> today. Come back tomorrow for a fresh one!', { s: played.score ?? state.score, n: state.total }) : t('5 quick questions made from today’s headlines. How closely were you reading? 🤔')}</p>
      <button type="button" class="btn ${played ? 'btn-ghost' : 'btn-primary'} btn-block" data-action="quiz">${played ? t('See my answers') : t('Play today’s quiz (+XP)')}</button>
      ${boardHTML(state?.board, (b) => `${b.score}/${state.total}`)}`;
  }
  async function loadSide() {
    try {
      const q = await auth.api('/api/quiz');
      $('#quizWidget').hidden = false;
      renderSide({ played: q.played, total: q.total, board: q.board });
    } catch { $('#quizWidget').hidden = true; }
  }

  // ====================================================================================
  // 🍿 Popcorn Battle
  // ====================================================================================
  async function loadBattle() {
    const box = $('#battleBody');
    try {
      const b = await auth.api('/api/battle');
      $('#battleWidget').hidden = false;
      const total = b.votes.a + b.votes.b;
      const voted = !!b.mine;
      const side = (k) => {
        const s = b[k];
        const pct = total ? Math.round((b.votes[k] / total) * 100) : 0;
        const leading = total && b.votes[k] > b.votes[k === 'a' ? 'b' : 'a'];
        return `<div class="battle-side${b.mine === k ? ' mine' : ''}${voted && leading ? ' win' : ''}">
          <small>${catById(s.cat).emoji} ${esc(s.source || '')}</small>
          <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer" dir="ltr" lang="en">${esc(s.title)}</a>
          ${voted || !auth.user ? `<div class="battle-bar"><i style="width:${pct}%"></i></div><small>${pct}% · ${tn(b.votes[k], '{n} vote', '{n} votes')}</small>` : ''}
          ${auth.user && !voted ? `<button type="button" class="btn btn-primary btn-sm" data-battle="${k}">${t('This one! 🍿')}</button>` : ''}
          ${b.mine === k ? `<small>✓ ${t('your pick')}</small>` : ''}
        </div>`;
      };
      box.innerHTML = `<p class="muted small">${t('Two of today’s hottest stories. Which one matters more? Winner becomes tomorrow’s Story of the Day.')}</p>
        <div class="battle">${side('a')}<span class="battle-vs">VS</span>${side('b')}</div>
        <p class="muted small">⏳ ${t('Voting closes in {time}', { time: until(b.endsAt) })}${!auth.user ? ` · <button type="button" class="linkish" data-action="signin">${t('Sign in')}</button> ${t('to vote')}` : ''}</p>
        ${b.champion ? `<div class="champion">🏆 <b>${t('Story of the Day')}</b> <small>(${t('{n}% of {total} votes yesterday', { n: Math.round((b.champion.votes / b.champion.total) * 100), total: b.champion.total })})</small><br><a href="${esc(safeUrl(b.champion.story.url))}" target="_blank" rel="noopener noreferrer" dir="ltr" lang="en">${esc(b.champion.story.title)}</a></div>` : ''}`;
    } catch { $('#battleWidget').hidden = true; }
  }
  $('#battleBody').addEventListener('click', async (e) => {
    const btn = e.target instanceof Element && e.target.closest('[data-battle]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const r = await auth.api('/api/battle', { method: 'POST', body: { pick: btn.dataset.battle } });
      burstFrom(btn, { emojis: ['🍿', '🔥', '🥊'], count: 14 });
      sfx.ding();
      if (r.firstVote) onBattle?.();
      loadBattle();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); btn.disabled = false; }
  });

  // ====================================================================================
  // 🏆 Weekly Real or Fake? tournament
  // ====================================================================================
  const tDlg = $('#tourneyDialog');
  const tBody = $('#tourneyBody');
  let tour = null;
  let picks = {};

  const podium = (list) => (list?.length ? `<div class="podium">${list.map((w) => `<span data-user="${esc(w.username)}">${['🥇', '🥈', '🥉'][w.place - 1]}${lookHTML(w)}<small dir="auto">${esc(w.nickname)}</small></span>`).join('')}</div>` : '');

  function tourneyResult(r) {
    const reveal = new Map(r.reveal.map((x) => [x.id, x]));
    return `<div class="game-end"><span class="game-big">${r.score === r.total ? '🏆' : '🕵️'}</span>
      <h3>${r.score} / ${r.total}</h3>
      ${r.already ? `<p class="muted small">${t('You already played this week’s tournament.')}</p>` : `<p class="muted small">${t('Locked in! The top 3 on Monday win trophies. 🏆')}</p>`}
      <ul class="tourney-list">${tour.items.map((it) => {
        const x = reveal.get(it.id);
        const mine = r.answers?.[it.id];
        const right = mine && (mine === 'real') === x.real;
        return `<li class="${right ? 'right' : 'wrong'}"><span class="t-title" dir="ltr" lang="en">${esc(it.title)}</span><span>${x.real ? (x.story ? `<a href="${esc(safeUrl(x.story.url))}" target="_blank" rel="noopener noreferrer">✅ ${t('Real')}</a>` : `✅ ${t('Real')}`) : `🤡 ${t('Fake')}`}</span></li>`;
      }).join('')}</ul>
      <h4>${t('This week’s board')}</h4>${boardHTML(r.board, (b) => `${b.score}/${r.total}`)}</div>`;
  }

  function tourneyForm() {
    const done = tour.items.every((it) => picks[it.id]);
    tBody.innerHTML = `<p>${t('{n} headlines. Some are real stories from this week, some are fakes invented by codme. One go only — choose wisely!', { n: tour.items.length })}</p>
      <p class="muted small">⏳ ${t('Ends in {time}', { time: until(tour.endsAt) })}</p>
      <ul class="tourney-list">${tour.items.map((it) => `<li><span class="t-title" dir="ltr" lang="en">${esc(it.title)}</span><span class="t-pick">
        <button type="button" data-pick="${it.id}:real" aria-pressed="${picks[it.id] === 'real'}" title="${t('Real')}">✅</button>
        <button type="button" data-pick="${it.id}:fake" aria-pressed="${picks[it.id] === 'fake'}" title="${t('Fake')}">🤡</button></span></li>`).join('')}</ul>
      <button type="button" class="btn btn-primary btn-big btn-block" data-tourney="submit" ${done ? '' : 'disabled'}>${done ? t('Lock in my answers 🔒') : t('Pick ✅ or 🤡 for every headline')}</button>`;
  }

  async function openTourney() {
    if (!auth.user) { toast(t('Sign in to enter the tournament and win trophies! 🏆'), { emoji: '🏆' }); openAuth('signin'); return; }
    if (!tDlg.open) tDlg.showModal();
    tBody.innerHTML = `<div class="auth-mascot spin">🍿</div>`;
    try {
      tour = await auth.api('/api/tournament');
      picks = {};
      const last = tour.lastWinners?.length ? `<p class="small"><b>${t('Last week’s champions')}</b></p>${podium(tour.lastWinners)}` : '';
      if (tour.played) { tBody.innerHTML = last + tourneyResult({ ...tour.played, total: tour.total, already: true, board: tour.board }); return; }
      tourneyForm();
      tBody.insertAdjacentHTML('afterbegin', last);
    } catch (e) { tBody.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  tBody.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const p = el?.closest('[data-pick]');
    if (p) {
      const [id, v] = p.dataset.pick.split(':');
      picks[id] = v;
      const keep = tBody.querySelector('.podium')?.outerHTML || '';
      tourneyForm();
      if (keep) tBody.insertAdjacentHTML('afterbegin', keep);
      sfx.blip();
      return;
    }
    if (el?.closest('[data-tourney="submit"]')) {
      try {
        const r = await auth.api('/api/tournament', { method: 'POST', body: { answers: picks } });
        tBody.innerHTML = tourneyResult(r);
        if (r.score === r.total) rain(['🏆', '🕵️', '✨'], 40);
        sfx.win();
        if (!r.already) onTourney?.(r.score, r.total);
        loadPromo();
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  tDlg.addEventListener('click', (e) => { if (e.target === e.currentTarget) tDlg.close(); });

  async function loadPromo() {
    const promo = $('#tourneyPromo');
    promo.hidden = false;
    if (!auth.user) { $('#tourneyLine').textContent = t('8 headlines, one go each. The top 3 win trophies!'); return; }
    try {
      const r = await auth.api('/api/tournament');
      $('#tourneyLine').textContent = r.played ? t('You scored {s}/{n} this week. Results on Monday! 🏆', { s: r.played.score, n: r.total }) : t('This week’s 8 headlines are waiting. Ends in {time}.', { time: until(r.endsAt) });
    } catch { /* keep the default line */ }
  }

  const refresh = () => { loadSide(); loadBattle(); loadPromo(); };
  refresh();
  auth.addEventListener('signin', refresh);
  auth.addEventListener('signout', refresh);
  setInterval(() => { if (!document.hidden) loadBattle(); }, 5 * 60_000);
  return { openQuiz, openTourney, refresh };
}
