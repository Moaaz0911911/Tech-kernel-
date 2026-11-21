// 🎉 Watch Parties on the website: a countdown, then a live room with chat and a hype meter.
// Every emoji anyone taps floats up on everyone's screen a moment later.
import { $, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tServer, fmtDate, fmtTime } from './i18n.js';
import { lookHTML } from './look.js';
import { makeDialog, inWords } from './arena.js';

const POLL_MS = 2000;
const clockLeft = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function initParties({ openAuth, openStory }) {
  if (!auth.ready) { $('#partyWidget')?.remove(); return null; }
  const box = $('#partyWidget');
  const body = $('#partyBody');
  const P = makeDialog('party-dialog', '🎉');
  const title = P.dlg.querySelector('h2');
  let list = null;
  let hypeEmojis = ['🔥', '😂', '😮', '👏', '🍿', '❤️'];
  let party = null;
  let since = 0;
  let hypeSince = 0;
  let msgs = [];
  let timer = 0;
  let tick = 0;
  let pending = {}; // taps waiting to be sent
  let sendTimer = 0;

  function paintWidget() {
    if (!list) { box.hidden = true; return; }
    const now = Date.now();
    const phaseOf = (p) => (now < p.starts - 15 * 60_000 ? 'soon' : now < p.starts ? 'lobby' : now < p.ends ? 'live' : 'over'); // works out the phase as time passes
    const ps = list.parties.map((p) => ({ ...p, phase: phaseOf(p) })).filter((p) => p.phase !== 'over');
    box.hidden = !ps.length;
    if (!ps.length) return;
    body.innerHTML = ps.slice(0, 3).map((p) => {
      const when = p.phase === 'live' ? `🔴 ${t('LIVE NOW')}` : p.phase === 'lobby' ? t('Starts in {time}', { time: clockLeft(p.starts - Date.now()) }) : `${fmtDate(p.starts, { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(p.starts)} · ${t('in {time}', { time: inWords(p.starts - Date.now()) })}`;
      return `<div class="pt-item"><span class="pt-emoji" aria-hidden="true">${esc(p.emoji)}</span><span class="pt-text"><b dir="auto">${esc(p.title)}</b><small>${when}${p.rsvps ? ` · ${t('{n} going', { n: p.rsvps })}` : ''}</small></span>
        ${p.phase === 'soon' ? `<button type="button" class="btn btn-sm ${p.going ? 'btn-ghost' : 'btn-primary'}" data-pt-rsvp="${p.id}" data-on="${p.going ? 1 : 0}">${p.going ? `✓ ${t('Going')}` : `🔔 ${t('Remind me')}`}</button>`
          : `<button type="button" class="btn btn-sm btn-primary" data-pt-open="${p.id}">${t('Join the party')}</button>`}</div>`;
    }).join('');
  }

  async function loadList() {
    try { list = await auth.api('/api/parties'); hypeEmojis = list.hype || hypeEmojis; } catch { /* keep */ }
    paintWidget();
  }

  // ---------- the live room ----------
  function roomHTML() {
    const p = party;
    const left = p.phase === 'live' ? p.ends - Date.now() : p.starts - Date.now();
    return `<div class="pt-top"><span class="pt-phase ${p.phase}">${p.phase === 'live' ? `🔴 ${t('LIVE')}` : p.phase === 'over' ? t('Party’s over') : t('Starting soon')}</span>
        <span class="pt-clock" id="ptClock">${p.phase === 'over' ? '' : clockLeft(left)}</span><span class="pt-viewers" id="ptViewers">👀 0</span></div>
      ${p.story ? `<button type="button" class="pt-story" data-pt-story>📰 <span dir="auto">${esc(p.story.title)}</span></button>` : ''}
      <div class="pt-stage" id="ptStage" aria-hidden="true"></div>
      <div class="pt-meter"><span><i id="ptMeter"></i></span><small id="ptMeterLabel"></small></div>
      <div class="pt-hype">${hypeEmojis.map((e) => `<button type="button" data-pt-hype="${e}" aria-label="${esc(t('Send {emoji}', { emoji: e }))}">${e}</button>`).join('')}</div>
      <div class="pt-log" id="ptLog" aria-live="polite"></div>
      ${auth.user ? `<form class="chat-form pt-form" id="ptForm"><input maxlength="280" autocomplete="off" placeholder="${esc(t('Say something…'))}" aria-label="${esc(t('Message'))}"><button type="submit" class="send-btn" aria-label="${esc(t('Send'))}">➤</button></form>`
        : `<button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to chat and hype')}</button>`}`;
  }

  function paintLog() {
    const log = $('#ptLog');
    if (!log) return;
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = msgs.slice(-80).map((m) => `<div class="pt-msg${m.mine ? ' mine' : ''}" data-ptmsg="${m.id}">${lookHTML(m.user)}<span><b dir="auto">${esc(m.user.nickname)}</b> <span dir="auto">${esc(m.text)}</span></span>${m.mine ? '' : `<button type="button" class="pt-flag" data-pt-report="${m.id}" aria-label="${esc(t('Report message'))}">🚩</button>`}</div>`).join('')
      || `<p class="muted small">${t('Be the first to say hi! 👋')}</p>`;
    if (near) log.scrollTop = log.scrollHeight;
  }

  function float(emoji) {
    const stage = $('#ptStage');
    if (!stage || stage.childElementCount > 60) return;
    const el = document.createElement('span');
    el.className = 'pt-float';
    el.textContent = emoji;
    el.style.left = `${5 + Math.random() * 90}%`;
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
    el.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    stage.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  async function poll() {
    if (!party || !P.dlg.open) return;
    try {
      const r = await auth.api(`/api/parties/${party.id}?since=${since}&hype=${hypeSince}`);
      party = r.party;
      since = r.messages.length ? r.messages[r.messages.length - 1].created : since;
      for (const m of r.messages) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
      if (r.messages.length) paintLog();
      // everyone's taps (but not the ones we already floated for ourselves)
      const latest = Math.max(hypeSince, ...r.hype.map((h) => (h.bucket + 1) * 2000));
      if (hypeSince) for (const h of r.hype) for (let i = 0; i < Math.min(h.n, 8); i++) setTimeout(() => float(h.emoji), Math.random() * POLL_MS);
      hypeSince = latest || r.now;
      $('#ptViewers').textContent = `👀 ${r.viewers}`;
      const level = Math.min(100, Math.round((r.hypeMinute / 60) * 100));
      $('#ptMeter').style.width = `${level}%`;
      $('#ptMeterLabel').textContent = level >= 80 ? t('🔥 The hype is unreal!') : level >= 40 ? t('🍿 Things are heating up') : t('Tap the emojis to hype it up!');
    } catch (err) { if (err.status === 404) { P.dlg.close(); toast(t('That party is over'), { emoji: '🎉' }); } }
  }

  async function openParty(id) {
    try {
      const r = await auth.api(`/api/parties/${id}?since=0&hype=0`);
      party = r.party;
      msgs = r.messages;
      since = msgs.length ? msgs[msgs.length - 1].created : 0;
      hypeSince = r.now;
      title.textContent = `${party.emoji} ${party.title}`;
      P.body.innerHTML = roomHTML();
      paintLog();
      if (!P.dlg.open) P.dlg.showModal();
      sfx.ding();
      clearInterval(timer);
      timer = setInterval(() => { if (P.dlg.open && !document.hidden) poll(); }, POLL_MS);
      clearInterval(tick);
      tick = setInterval(() => {
        if (!P.dlg.open || !party) return clearInterval(tick);
        const c = $('#ptClock');
        if (c && party.phase !== 'over') c.textContent = clockLeft(party.phase === 'live' ? party.ends - Date.now() : party.starts - Date.now());
      }, 1000);
      poll();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }

  function flushHype() {
    const batch = pending;
    pending = {};
    for (const [emoji, n] of Object.entries(batch)) auth.api(`/api/parties/${party.id}/hype`, { method: 'POST', body: { emoji, n } }).catch((err) => toast(tServer(err.message), { emoji: '😵' }));
  }

  P.dlg.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const h = el.closest('[data-pt-hype]');
    if (h) {
      if (!auth.user) { openAuth('signin'); return; }
      const emoji = h.dataset.ptHype;
      float(emoji);
      burstFrom(h, { emojis: [emoji], count: 3, spread: 30 });
      pending[emoji] = Math.min(5, (pending[emoji] || 0) + 1);
      clearTimeout(sendTimer);
      sendTimer = setTimeout(flushHype, 600);
      return;
    }
    if (el.closest('[data-pt-story]') && party?.story) { P.dlg.close(); openStory?.(party.story); return; }
    const rep = el.closest('[data-pt-report]');
    if (rep && confirm(t('Report this message for being mean, unsafe or spammy?'))) {
      try { await auth.api('/api/parties/report', { method: 'POST', body: { id: Number(rep.dataset.ptReport) } }); toast(t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' }); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  P.dlg.addEventListener('submit', async (e) => {
    if (e.target.id !== 'ptForm') return;
    e.preventDefault();
    const input = e.target.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const r = await auth.api(`/api/parties/${party.id}/chat`, { method: 'POST', body: { text, since } });
      for (const m of r.messages) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
      since = msgs.length ? msgs[msgs.length - 1].created : since;
      paintLog();
      sfx.pop();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); input.value = text; }
  });
  P.dlg.addEventListener('close', () => { clearInterval(timer); clearInterval(tick); if (Object.keys(pending).length) flushHype(); });

  box.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const o = el?.closest('[data-pt-open]');
    if (o) return openParty(Number(o.dataset.ptOpen));
    const r = el?.closest('[data-pt-rsvp]');
    if (r) {
      if (!auth.user) { openAuth('signin'); return; }
      const going = r.dataset.on !== '1';
      try { list = await auth.api(`/api/parties/${r.dataset.ptRsvp}/rsvp`, { method: 'POST', body: { going } }); paintWidget(); if (going) { sfx.ding(); toast(t('We’ll remind you when it starts 🔔'), { emoji: '🎉' }); } } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  auth.addEventListener('signin', loadList);
  auth.addEventListener('signout', loadList);
  setInterval(() => { if (!document.hidden) { if (list?.parties.some((p) => Date.now() > p.starts - 16 * 60_000 && Date.now() < p.ends)) paintWidget(); } }, 1000);
  setInterval(() => { if (!document.hidden) loadList(); }, 5 * 60_000);
  loadList();
  return { open: openParty, refresh: loadList };
}
