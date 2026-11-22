// 👥 Squads on the website (Me tab): your team of up to 5, this week's XP, the shared goal and the squad board.
import { $, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { lookHTML } from './look.js';
import { findPeople, personHTML } from './dm.js';
import { GROUP_EMOJIS } from './groups.js';
import { inWords } from './arena.js';

export function initSquads({ openAuth, openGroup }) {
  if (!auth.ready) { $('#squadWidget')?.remove(); return null; }
  const box = $('#squadWidget');
  const body = $('#squadBody');
  let data = null;
  let inviting = false;
  let emoji = '🚀';
  let hadGoal = null;
  let seq = 0;

  const boardHTML = () => (data.board.length ? `<p class="tp-label">🏆 ${t('Top squads this week')}</p><ol class="board-list">${data.board.slice(0, 5).map((b) => `<li><span class="bp">${b.place}</span><span aria-hidden="true">${esc(b.emoji)}</span><b dir="auto">${esc(b.name)}</b><span>${b.xp} XP</span></li>`).join('')}</ol>` : '');

  function paint() {
    box.hidden = false;
    if (!auth.user) {
      body.innerHTML = `<p class="small">${t('Team up with up to 4 friends. Earn XP together every week and everyone gets a bonus when you hit the goal!')}</p><button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to join a squad')}</button>`;
      return;
    }
    if (!data) { body.innerHTML = '<div class="chat-empty"><span class="spin">👥</span></div>'; return; }
    const s = data.squad;
    if (!s) {
      body.innerHTML = `${data.invites.length ? `<p class="tp-label">📨 ${t('Invites')}</p>${data.invites.map((i) => `<div class="sq-invite"><span>${esc(i.emoji)} <b dir="auto">${esc(i.name)}</b><small>${t('from @{name}', { name: esc(i.by || '?') })} · ${tn(i.members, '{n} member', '{n} members')}</small></span>
          <button type="button" class="btn btn-sm btn-primary" data-sq-join="${i.squad}">${t('Join')}</button><button type="button" class="btn btn-sm btn-ghost" data-sq-no="${i.squad}">${t('No thanks')}</button></div>`).join('')}` : ''}
        <p class="small">${t('Team up with up to 4 friends. Earn XP together every week and everyone gets a bonus when you hit the goal!')}</p>
        <form class="sq-new" data-sq-create><input name="name" maxlength="30" dir="auto" placeholder="${esc(t('Squad name'))}" required>
          <div class="gd-emojis">${GROUP_EMOJIS.slice(1, 9).map((e) => `<button type="button" data-sq-emoji="${e}" aria-checked="${emoji === e}">${e}</button>`).join('')}</div>
          <button class="btn btn-primary btn-block">👥 ${t('Start a squad')}</button></form>
        ${boardHTML()}`;
      return;
    }
    const pct = Math.min(100, Math.round((s.xp / s.goal) * 100));
    body.innerHTML = `<div class="sq-head"><span class="sq-emoji" aria-hidden="true">${esc(s.emoji)}</span><span><b dir="auto">${esc(s.name)}</b><small>${s.place ? `#${s.place} · ` : ''}${t('ends in {time}', { time: inWords(data.endsAt - Date.now()) })}</small></span></div>
      <div class="sq-goal"><span><i style="width:${pct}%"></i></span><small>${s.goalHit ? `🎉 ${t('Goal reached! Everyone got +{xp} XP', { xp: data.bonus })}` : t('{xp} / {goal} XP this week — reach it for +{bonus} XP each', { xp: s.xp, goal: s.goal, bonus: data.bonus })}</small></div>
      <ul class="sq-members">${s.members.map((m) => `<li><button type="button" class="person-main" data-user="${esc(m.username)}">${lookHTML(m)}<span class="person-text"><b dir="auto">${esc(m.me ? t('You') : m.nickname)}</b><small>${m.owner ? '👑 ' : ''}@${esc(m.username)}</small></span></button><b>${m.xp} XP</b></li>`).join('')}
        ${s.pending.map((n) => `<li class="muted small">⏳ @${esc(n)} ${t('(invited)')}</li>`).join('')}</ul>
      ${inviting ? `<div class="kc-offer"><label class="people-search"><span class="search-icon" aria-hidden="true">🔍</span><input data-sq-search placeholder="${esc(t('Search people…'))}" autocomplete="off"></label><div id="sqPeople"></div></div>` : ''}
      <div class="sq-actions">
        ${s.members.length + s.pending.length < data.max && !inviting ? `<button type="button" class="btn btn-sm btn-primary" data-sq="invite">➕ ${t('Invite')}</button>` : ''}
        ${s.group ? `<button type="button" class="btn btn-sm btn-ghost" data-sq="chat">💬 ${t('Squad chat')}</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-sq="leave">🚪 ${t('Leave')}</button></div>
      ${boardHTML()}`;
    if (inviting) { search(''); setTimeout(() => body.querySelector('[data-sq-search]')?.focus(), 50); }
  }

  async function load() {
    try { data = await auth.api('/api/squad'); } catch { /* keep */ }
    const hit = !!data?.squad?.goalHit;
    if (hadGoal === false && hit) { rain(['🎉', '👥', '✨'], 50); sfx.win(); document.dispatchEvent(new CustomEvent('kernel:rewards')); }
    hadGoal = data?.squad ? hit : null;
    paint();
  }

  async function search(q) {
    const my = ++seq;
    try {
      const found = (await findPeople(q)).filter((p) => !p.me && !p.blocked).slice(0, 6);
      const el = $('#sqPeople');
      if (my !== seq || !el) return;
      el.innerHTML = found.map((p) => personHTML(p, { pick: 'data-sq-invite' })).join('') || `<p class="muted small">${t('No kernels found for “{q}”', { q: esc(q) })}</p>`;
    } catch { /* offline */ }
  }

  async function act(path, payload, okMsg) {
    try {
      data = await auth.api(`/api/squad/${path}`, { method: 'POST', body: payload });
      if (okMsg) toast(okMsg, { emoji: '👥' });
      hadGoal = data.squad ? !!data.squad.goalHit : null;
      paint();
      return true;
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); return false; }
  }

  box.addEventListener('input', (e) => {
    if (e.target.matches?.('[data-sq-search]')) { clearTimeout(box.timer); const q = e.target.value.trim(); box.timer = setTimeout(() => search(q), 220); }
  });
  box.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-sq-create]');
    if (!f) return;
    e.preventDefault();
    if (await act('create', { name: f.elements.name.value.trim(), emoji }, t('Squad started! Now invite your friends 👥'))) { sfx.ding(); burstFrom(box, { emojis: ['👥', emoji, '✨'], count: 12 }); }
  });
  box.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (!auth.user && el.closest('[data-sq]')) { openAuth('signin'); return; }
    const em = el.closest('[data-sq-emoji]');
    if (em) { emoji = em.dataset.sqEmoji; box.querySelectorAll('[data-sq-emoji]').forEach((b) => b.setAttribute('aria-checked', String(b === em))); return; }
    const j = el.closest('[data-sq-join]');
    if (j) { if (await act('answer', { squad: Number(j.dataset.sqJoin), accept: true }, t('Welcome to the squad! 🎉'))) sfx.win(); return; }
    const no = el.closest('[data-sq-no]');
    if (no) { act('answer', { squad: Number(no.dataset.sqNo), accept: false }); return; }
    const inv = el.closest('[data-sq-invite]');
    if (inv) { inviting = false; act('invite', { username: inv.dataset.sqInvite }, t('Invite sent to @{name}!', { name: inv.dataset.sqInvite })); return; }
    const b = el.closest('[data-sq]');
    if (!b) return;
    if (b.dataset.sq === 'invite') { inviting = true; paint(); }
    if (b.dataset.sq === 'chat' && data.squad?.group) openGroup?.(data.squad.group);
    if (b.dataset.sq === 'leave' && confirm(t('Leave your squad?'))) act('leave', {}, t('You left the squad.'));
  });
  auth.addEventListener('signin', load);
  auth.addEventListener('signout', () => { data = null; load(); });
  setInterval(() => { if (!document.hidden && box.offsetParent) load(); }, 5 * 60_000);
  load();
  return { refresh: load };
}
