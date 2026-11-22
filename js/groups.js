// 👥 Group chats: the "new group" and "group settings" dialogs, plus small helpers the Messages view uses.
import { $$, esc, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { lookHTML } from './look.js';

export const GROUP_EMOJIS = ['👥', '🍿', '🎮', '🚀', '💻', '🤖', '📱', '🎧', '⚽', '📚', '🔥', '💡'];
const MAX_MEMBERS = 32;

/** The group's picture: its emoji, with two members' faces peeking in. */
export function groupAvatarHTML(g, { cls = '' } = {}) {
  const faces = (g.faces || []).slice(0, 2).map((f, i) => lookHTML(f, { cls: `gav-face gav-f${i + 1}` })).join('');
  return `<span class="gav ${cls}" aria-hidden="true"><span class="gav-emoji">${esc(g.emoji || '👥')}</span>${faces}</span>`;
}

const names = (list) => (list || []).map((n) => `@${n}`).join(', ');

/** "@azzy added @kei" and friends. */
export function systemText(s = {}) {
  const by = `@${s.by || '?'}`;
  if (s.t === 'created') return t('{by} created “{name}”', { by, name: s.name || '' });
  if (s.t === 'added') return t('{by} added {names}', { by, names: names(s.who) });
  if (s.t === 'removed') return t('{by} removed {names}', { by, names: names(s.who) });
  if (s.t === 'left') return t('{by} left', { by });
  if (s.t === 'renamed') return t('{by} renamed the group to “{name}”', { by, name: s.name || '' });
  if (s.t === 'emoji') return t('{by} changed the group picture to {emoji}', { by, emoji: s.emoji || '👥' });
  return '';
}

export function initGroupTools({ openProfile, findPeople } = {}) {
  const D = document.createElement('dialog');
  D.className = 'modal group-dialog';
  document.body.append(D);

  let mode = 'create';         // create | settings | add
  let state = null;            // { group, members } in settings
  let hooks = {};
  let picked = new Map();      // username → person
  let results = [];
  let q = '';
  let seq = 0;
  let timer = 0;
  let form = { name: '', emoji: '👥' };

  const emojiPicker = () => `<div class="gd-emojis" role="radiogroup" aria-label="${esc(t('Group picture'))}">${GROUP_EMOJIS.map((e) => `<button type="button" role="radio" data-gd-emoji="${e}" aria-checked="${form.emoji === e}">${e}</button>`).join('')}</div>`;
  const pickerHTML = (already = new Set()) => `
    <div class="gd-picked">${[...picked.values()].map((p) => `<button type="button" class="chip gd-chip" data-gd-unpick="${esc(p.username)}">${lookHTML(p)}<span dir="auto">${esc(p.nickname)}</span> ✕</button>`).join('') || `<span class="muted small">${t('Pick people to add')}</span>`}</div>
    <label class="people-search"><span class="search-icon" aria-hidden="true">🔍</span><input data-gd-search type="search" placeholder="${esc(t('Search people…'))}" autocomplete="off" value="${esc(q)}"></label>
    <div class="gd-results">${results.filter((p) => !p.me && !already.has(p.username)).map((p) => `<button type="button" class="gd-person" data-gd-pick="${esc(p.username)}" aria-pressed="${picked.has(p.username)}">
        ${lookHTML(p, { active: p.active })}<span class="person-text"><b dir="auto">${esc(p.nickname)}</b><small>@${esc(p.username)}${p.followsYou ? ` · ${esc(t('follows you'))}` : ''}</small></span><span class="gd-check" aria-hidden="true">${picked.has(p.username) ? '✓' : ''}</span></button>`).join('')
      || `<p class="muted small">${q ? t('No kernels found for “{q}”', { q: esc(q) }) : t('Looking…')}</p>`}</div>`;

  function paint() {
    if (mode === 'create') {
      D.innerHTML = `<button type="button" class="modal-x" data-gd="close" aria-label="${esc(t('Close'))}">✕</button>
        <h2>👥 ${t('New group')}</h2>
        <label class="field"><span>${t('Group name')}</span><input data-gd-name maxlength="40" dir="auto" placeholder="${esc(t('e.g. Gaming squad'))}" value="${esc(form.name)}"></label>
        ${emojiPicker()}
        ${pickerHTML()}
        <button type="button" class="btn btn-primary btn-block" data-gd="create" ${form.name.trim() && picked.size ? '' : 'disabled'}>👥 ${t('Create group')} ${picked.size ? `(${picked.size + 1})` : ''}</button>`;
    } else if (mode === 'add') {
      const already = new Set(state.members.map((m) => m.username));
      D.innerHTML = `<button type="button" class="modal-x" data-gd="back" aria-label="${esc(t('Back'))}">‹</button>
        <h2>➕ ${t('Add people')}</h2>
        <p class="muted small">${t('{n} of {max} spots taken', { n: state.members.length, max: MAX_MEMBERS })}</p>
        ${pickerHTML(already)}
        <button type="button" class="btn btn-primary btn-block" data-gd="add" ${picked.size ? '' : 'disabled'}>➕ ${t('Add to group')}</button>`;
    } else {
      const g = state.group;
      D.innerHTML = `<button type="button" class="modal-x" data-gd="close" aria-label="${esc(t('Close'))}">✕</button>
        <div class="gd-top"><span class="gav gav-lg"><span class="gav-emoji">${esc(g.emoji)}</span></span><h2 dir="auto">${esc(g.name)}</h2><p class="muted small">${tn(state.members.length, '{n} member', '{n} members')}</p></div>
        <details class="gd-edit"><summary>✏️ ${t('Name and picture')}</summary>
          <label class="field"><span>${t('Group name')}</span><input data-gd-name maxlength="40" dir="auto" value="${esc(form.name)}"></label>
          ${emojiPicker()}
          <button type="button" class="btn btn-sm btn-primary" data-gd="save">${t('Save')}</button></details>
        <label class="check gd-mute"><input type="checkbox" data-gd-mute ${g.muted ? 'checked' : ''}> 🔕 ${t('Mute notifications')}</label>
        <h3 class="mini-title">${t('Members')} <small>${state.members.length}</small></h3>
        <div class="gd-members">${state.members.map((m) => `<div class="person">
            <button type="button" class="person-main" data-gd-user="${esc(m.username)}">${lookHTML(m, { active: m.active })}<span class="person-text"><b dir="auto">${esc(m.me ? t('You') : m.nickname)}</b><small>@${esc(m.username)}${m.owner ? ` · 👑 ${esc(t('Creator'))}` : ''}</small></span></button>
            ${g.owner && !m.me ? `<button type="button" class="btn btn-sm btn-ghost" data-gd-remove="${esc(m.username)}">${t('Remove')}</button>` : ''}</div>`).join('')}</div>
        ${state.members.length < MAX_MEMBERS ? `<button type="button" class="btn btn-ghost btn-block" data-gd="to-add">➕ ${t('Add people')}</button>` : ''}
        <button type="button" class="btn btn-ghost btn-block gd-leave" data-gd="leave">🚪 ${t('Leave group')}</button>`;
    }
  }

  async function search() {
    const my = ++seq;
    try { const found = await findPeople(q); if (my === seq) { results = found; paintKeepFocus(); } } catch { if (my === seq) { results = []; paintKeepFocus(); } }
  }
  function paintKeepFocus() {
    const had = document.activeElement?.matches?.('[data-gd-search]');
    const pos = had ? document.activeElement.selectionStart : null;
    paint();
    if (had) { const s = D.querySelector('[data-gd-search]'); s?.focus(); if (pos != null) s?.setSelectionRange(pos, pos); }
  }

  D.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-gd-search]')) { q = el.value.trim().replace(/^@+/, ''); clearTimeout(timer); timer = setTimeout(search, 220); }
    if (el.matches('[data-gd-name]')) {
      form.name = el.value;
      const b = D.querySelector('[data-gd="create"]');
      if (b) b.disabled = !(form.name.trim() && picked.size);
    }
  });
  D.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-gd-mute]')) return;
    const muted = e.target.checked;
    try { await auth.api('/api/groups/mute', { method: 'POST', body: { group: state.group.id, muted } }); state.group.muted = muted; hooks.onChanged?.(); toast(muted ? t('Group muted 🔕') : t('Group unmuted 🔔'), { emoji: muted ? '🔕' : '🔔' }); } catch (err) { e.target.checked = !muted; toast(tServer(err.message), { emoji: '😵' }); }
  });

  D.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const em = el.closest('[data-gd-emoji]');
    if (em) { form.emoji = em.dataset.gdEmoji; $$('[data-gd-emoji]', D).forEach((b) => b.setAttribute('aria-checked', String(b === em))); return; }
    const pk = el.closest('[data-gd-pick]');
    if (pk) {
      const p = results.find((x) => x.username === pk.dataset.gdPick);
      if (picked.has(p.username)) picked.delete(p.username);
      else if (picked.size + (state?.members.length || 1) >= MAX_MEMBERS) toast(t('This group is full (32 kernels)'), { emoji: '👥' });
      else picked.set(p.username, p);
      paintKeepFocus();
      return;
    }
    const up = el.closest('[data-gd-unpick]');
    if (up) { picked.delete(up.dataset.gdUnpick); paintKeepFocus(); return; }
    const u = el.closest('[data-gd-user]');
    if (u) { D.close(); openProfile?.(u.dataset.gdUser); return; }
    const rm = el.closest('[data-gd-remove]');
    if (rm) {
      if (!confirm(t('Remove @{name} from the group?', { name: rm.dataset.gdRemove }))) return;
      try { await auth.api('/api/groups/remove', { method: 'POST', body: { group: state.group.id, username: rm.dataset.gdRemove } }); state.members = state.members.filter((m) => m.username !== rm.dataset.gdRemove); paint(); hooks.onChanged?.(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const b = el.closest('[data-gd]');
    if (!b) return;
    const what = b.dataset.gd;
    if (what === 'close') { D.close(); return; }
    if (what === 'back') { mode = 'settings'; picked = new Map(); paint(); return; }
    if (what === 'to-add') { mode = 'add'; picked = new Map(); q = ''; results = []; paint(); search(); return; }
    b.disabled = true;
    try {
      if (what === 'create') {
        const r = await auth.api('/api/groups', { method: 'POST', body: { name: form.name.trim(), emoji: form.emoji, members: [...picked.keys()] } });
        D.close();
        sfx.ding();
        burstFrom(document.body, { emojis: ['👥', '🎉', '✨'], count: 16 });
        if (r.skipped?.length) toast(t('Couldn’t add {names} (they don’t take messages from you).', { names: names(r.skipped) }), { emoji: '👥', ms: 6000 });
        else toast(t('Group created! Say hi 👋'), { emoji: '👥' });
        hooks.onCreated?.(r.group);
      } else if (what === 'add') {
        const r = await auth.api('/api/groups/add', { method: 'POST', body: { group: state.group.id, usernames: [...picked.keys()] } });
        if (r.added?.length) toast(tn(r.added.length, 'Added {n} kernel', 'Added {n} kernels'), { emoji: '➕' });
        if (r.skipped?.length) toast(t('Couldn’t add {names} (they don’t take messages from you).', { names: names(r.skipped) }), { emoji: '👥', ms: 6000 });
        D.close();
        hooks.onChanged?.();
      } else if (what === 'save') {
        await auth.api('/api/groups/update', { method: 'POST', body: { group: state.group.id, name: form.name.trim(), emoji: form.emoji } });
        state.group.name = form.name.trim();
        state.group.emoji = form.emoji;
        paint();
        hooks.onChanged?.();
        toast(t('Saved!'), { emoji: '✅' });
      } else if (what === 'leave') {
        if (!confirm(t('Leave “{name}”? You won’t get its messages anymore.', { name: state.group.name }))) { b.disabled = false; return; }
        await auth.api('/api/groups/remove', { method: 'POST', body: { group: state.group.id } });
        D.close();
        toast(t('You left the group.'), { emoji: '🚪' });
        hooks.onLeft?.();
      }
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    if (b.isConnected) b.disabled = false;
  });

  return {
    create(onCreated) {
      if (!auth.user) return;
      mode = 'create';
      hooks = { onCreated };
      picked = new Map();
      q = '';
      results = [];
      form = { name: '', emoji: '👥' };
      paint();
      D.showModal();
      search();
      setTimeout(() => D.querySelector('[data-gd-name]')?.focus(), 80);
    },
    settings(s, h) {
      mode = 'settings';
      state = { group: { ...s.group }, members: [...s.members] };
      hooks = h || {};
      form = { name: s.group.name, emoji: s.group.emoji };
      picked = new Map();
      paint();
      D.showModal();
    },
    addPeople(s, h) { this.settings(s, h); mode = 'add'; q = ''; results = []; paint(); search(); },
  };
}
