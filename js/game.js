// 🕵️ Real or Fake? — guess which headlines are real kerNEl stories and which were invented by codme.
// Fakes are always revealed, and they never name real companies, products or people.
import { $, esc, safeUrl, pick, toast } from './utils.js';
import { catById } from './news.js';
import { sfx, burstFrom, rain } from './fun.js';
import { fakeHeadlines, GIVEAWAY } from './fakes.js';
import { t } from './i18n.js';


export function initGame({ getItems, onDone }) {
  const dlg = $('#gameDialog');
  const body = $('#gameBody');
  let rounds = [];
  let i = 0;
  let score = 0;

  function build() {
    const real = getItems()
      .filter((it) => it.title.length >= 30 && it.title.length <= 110 && !GIVEAWAY.test(it.title))
      .sort(() => Math.random() - 0.5).slice(0, 3)
      .map((it) => ({ real: true, title: it.title, item: it }));
    const fakes = fakeHeadlines(5 - real.length);
    return [...real, ...fakes.map((title) => ({ real: false, title }))].sort(() => Math.random() - 0.5);
  }

  function show() {
    if (i >= rounds.length) return finish();
    const r = rounds[i];
    body.innerHTML = `
      <p class="game-progress">${t('Headline {i} of {n} · score {s}', { i: i + 1, n: rounds.length, s: score })}</p>
      <div class="game-card" dir="ltr" lang="en"><span class="game-quote">“</span>${esc(r.title)}<span class="game-quote">”</span></div>
      <div class="game-btns">
        <button type="button" class="btn btn-big game-real" data-guess="real">✅ ${t('Real')}</button>
        <button type="button" class="btn btn-big game-fake" data-guess="fake">🤡 ${t('Fake')}</button>
      </div>
      <p class="game-reveal" aria-live="polite"></p>`;
  }

  function guess(choice, btn) {
    const r = rounds[i];
    const right = (choice === 'real') === r.real;
    if (right) { score++; sfx.ding(); burstFrom(btn, { emojis: ['✅', '🍿', '✨'], count: 10 }); } else { sfx.buzz(); }
    body.querySelectorAll('[data-guess]').forEach((b) => { b.disabled = true; });
    const c = r.item ? catById(r.item.cat) : null;
    body.querySelector('.game-reveal').innerHTML = `${right ? `🎉 <b>${t('Correct!')}</b>` : `😅 <b>${t('Nope!')}</b>`} ${r.real
      ? `${t('It’s <b>real</b> — {emoji} from {source}.', { emoji: c.emoji, source: esc(r.item.source) })} <a href="${esc(safeUrl(r.item.url))}" target="_blank" rel="noopener noreferrer">${t('Read it')}</a>`
      : t('It’s <b>fake</b> — codme made it up. 🤡')}
      <button type="button" class="btn btn-primary btn-sm" data-next>${i + 1 < rounds.length ? t('Next ➡️') : t('See my score 🏁')}</button>`;
    body.querySelector('[data-next]').focus();
  }

  function finish() {
    const perfect = score === rounds.length;
    const fakes = rounds.filter((r) => !r.real).map((r) => `<li>🤡 ${esc(r.title)}</li>`).join('');
    body.innerHTML = `
      <div class="game-end"><span class="game-big">${perfect ? '🕵️' : score >= 3 ? '🍿' : '🌽'}</span>
      <h3>${score} / ${rounds.length} ${perfect ? t('— master fact-checker!') : score >= 3 ? t('— sharp eyes!') : t('— the fakes got you!')}</h3>
      <p class="muted">+${score * 3} XP</p>
      <p class="small"><b>${t('Reminder: these were made up by codme')}</b> 👇</p><ul class="game-fakes" dir="ltr" lang="en">${fakes}</ul>
      <button type="button" class="btn btn-primary btn-big" data-again>${t('Play again 🔄')}</button></div>`;
    if (perfect) rain(['🕵️', '✅', '🍿'], 40);
    onDone(score, rounds.length);
  }

  body.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const g = t.closest('[data-guess]');
    if (g) return guess(g.dataset.guess, g);
    if (t.closest('[data-next]')) { i++; return show(); }
    if (t.closest('[data-again]')) return start();
  });
  dlg.addEventListener('click', (e) => { if (e.target === e.currentTarget) dlg.close(); });

  function start() {
    if (getItems().length < 5) { toast(t('The news is still popping — try again in a few seconds!'), { emoji: '🍿' }); return; }
    rounds = build();
    i = 0;
    score = 0;
    if (!dlg.open) dlg.showModal();
    show();
    sfx.pop();
  }
  return { start };
}
