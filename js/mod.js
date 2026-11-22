// 🛡️ Moderator tools (for the owner and the moderators they chose): reports, people, the team, and a log.
// 👑 Only the owner (OWNER on the server) can make someone a moderator or stop them being one.
import { $, esc, timeAgo, toast } from './utils.js';
import { auth } from './auth.js';
import { t, tn, tServer, fmtDate } from './i18n.js';
import { lookHTML, photoUrl } from './look.js';

const TABS = [['overview', '📊', 'Overview'], ['reports', '🚩', 'Reports'], ['people', '👤', 'People'], ['predict', '🔮', 'Predictions'], ['parties', '🎉', 'Parties'], ['team', '👑', 'Moderators'], ['log', '📜', 'Log']];

export function initMod() {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal mod-dialog';
  dlg.innerHTML = `<form method="dialog" class="modal-x-form"><button class="modal-x" aria-label="${esc(t('Close'))}">✕</button></form>
    <div class="modal-body mod-body">
      <h2>🛡️ ${t('Moderator tools')}</h2>
      <div class="seg mod-tabs" role="tablist">${TABS.map(([id, e, label]) => `<button type="button" role="tab" data-modtab="${id}" aria-selected="${id === 'overview'}">${e} ${t(label)}</button>`).join('')}</div>
      <div class="mod-pane" id="modPane"></div>
    </div>`;
  document.body.append(dlg);
  const pane = dlg.querySelector('#modPane');
  let tab = 'overview';
  let lookedUp = '';

  const api = (path, body) => auth.api(path, body ? { method: 'POST', body } : {});
  const when = (ts) => `${fmtDate(ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  const person = (u) => `<button type="button" class="mod-who" data-lookup="${esc(u.username)}">${lookHTML(u)}<span><b dir="auto">${esc(u.nickname || u.username)}</b><small>@${esc(u.username)}</small></span></button>`;
  const loading = () => { pane.innerHTML = '<div class="chat-empty"><span class="spin">🛡️</span></div>'; };
  const fail = (e) => { pane.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; };

  async function overview() {
    loading();
    try {
      const o = await api('/api/mod/overview');
      const tile = (n, label, hot = false) => `<div class="mod-tile${hot && n ? ' hot' : ''}"><b>${n}</b><small>${t(label)}</small></div>`;
      pane.innerHTML = `<div class="mod-tiles">
          ${tile(o.users, 'kernels')}${tile(o.newUsers, 'new today')}${tile(o.activeNow, 'active now')}
          ${tile(o.chat, 'chat messages today')}${tile(o.comments, 'comments today')}${tile(o.dms, 'private messages today')}
          ${tile(o.groupMsgs || 0, 'group messages today')}${tile(o.pops || 0, 'pops today')}${tile((o.groupReports || 0) + (o.popReports || 0), 'reported group messages and pops', true)}
          ${tile(o.chatReports, 'reported chat messages', true)}${tile(o.commentReports, 'reported comments', true)}${tile(o.dmReports, 'reported people', true)}
          ${tile(o.photoReports, 'reported photos', true)}${tile(o.muted, 'muted')}${tile(o.banned, 'banned')}
        </div>
        <p class="muted small">${t('Updated {when}', { when: timeAgo(o.at) })} · <button type="button" class="linkish" data-modtab="reports">${t('Go to reports →')}</button></p>`;
    } catch (e) { fail(e); }
  }

  async function reports() {
    loading();
    try {
      const r = await api('/api/mod/reports');
      const contentRow = (kind, x) => `<div class="mod-item${x.hidden ? ' is-hidden' : ''}">
          <div class="mod-item-head">${person(x.user)}<span class="muted small">${kind === 'chat' ? `#${esc(x.room)}` : kind === 'group' ? `👥 ${esc(x.group)}` : kind === 'pop' ? `🫧 ${t('Pop')}` : kind === 'debate' || kind === 'party' ? `${kind === 'debate' ? '⚖️' : '🎉'} ${esc(String(x.where || '').slice(0, 60))}` : `🗨️ ${esc(String(x.story || '').slice(0, 60))}`} · ${when(x.created)}</span></div>
          ${kind === 'pop' && x.photo ? `<img class="mod-pop-photo" src="${esc(auth.apiBase)}/api/pops/photo/${esc(x.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          <p class="mod-text" dir="auto">${kind === 'pop' && x.story ? `📰 ${esc(x.story)}<br>` : ''}${esc(x.text) || (kind === 'pop' ? '' : `<i>${t('(deleted by its author)')}</i>`)}</p>
          <div class="mod-actions"><span class="chip">🚩 ${x.reports}</span>${x.hidden ? `<span class="chip">${t('hidden')}</span>` : ''}
            ${x.hidden ? `<button type="button" class="btn btn-sm btn-ghost" data-content="${kind}:${x.id}:restore">${t('Bring back')}</button>` : `<button type="button" class="btn btn-sm btn-primary" data-content="${kind}:${x.id}:hide">${t('Hide')}</button>`}
            <button type="button" class="btn btn-sm btn-ghost" data-content="${kind}:${x.id}:dismiss">${t('Looks fine')}</button></div>
        </div>`;
      const dmRow = (d) => `<div class="mod-item">
          <div class="mod-item-head">${person(d.user)}<span class="muted small">${t('reported by @{name}', { name: esc(d.reporter) })} · ${when(d.at)}</span></div>
          <ul class="mod-evidence">${(d.evidence || []).map((e) => `<li dir="auto">${e.story ? `📰 ${esc(e.story)} ` : ''}${esc(e.text)}<time>${timeAgo(e.at)}</time></li>`).join('') || `<li class="muted">${t('No messages left')}</li>`}</ul>
          <div class="mod-actions"><button type="button" class="btn btn-sm btn-ghost" data-lookup="${esc(d.user.username)}">${t('Look up')}</button>
            <button type="button" class="btn btn-sm btn-ghost" data-dmdismiss="${esc(d.reporterId)}|${esc(d.userId)}">${t('Dismiss')}</button></div>
        </div>`;
      const photoRow = (p) => `<div class="mod-item mod-photo">
          ${photoUrl(p.user) ? `<img src="${esc(photoUrl(p.user))}" alt="" referrerpolicy="no-referrer">` : `<span class="mod-nophoto">${t('Photo already gone')}</span>`}
          <div>${person(p.user)}<p class="muted small">🚩 ${p.count} · ${when(p.at)}</p>
            <div class="mod-actions"><button type="button" class="btn btn-sm btn-primary" data-photo="${esc(p.user.username)}:remove">${t('Remove photo')}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-photo="${esc(p.user.username)}:dismiss">${t('Looks fine')}</button></div></div>
        </div>`;
      const section = (title, items, row) => `<h3 class="mini-title">${title} <small>${items.length}</small></h3>${items.length ? items.map(row).join('') : `<p class="muted small">${t('Nothing here 🎉')}</p>`}`;
      pane.innerHTML = section(`💬 ${t('Chat messages')}`, r.chat, (x) => contentRow('chat', x))
        + section(`🗨️ ${t('Comments')}`, r.comments, (x) => contentRow('comment', x))
        + section(`👥 ${t('Group messages')}`, r.groups || [], (x) => contentRow('group', x))
        + section(`🫧 ${t('Pops')}`, r.pops || [], (x) => contentRow('pop', x))
        + section(`⚖️ ${t('Debate arguments')}`, r.debates || [], (x) => contentRow('debate', x))
        + section(`🎉 ${t('Watch party chat')}`, r.parties || [], (x) => contentRow('party', x))
        + section(`✉️ ${t('Reported in private messages')}`, r.dms, dmRow)
        + section(`📷 ${t('Profile photos')}`, r.photos, photoRow);
    } catch (e) { fail(e); }
  }

  async function people(name = lookedUp) {
    lookedUp = name;
    pane.innerHTML = `<form class="mod-search" data-modsearch><input name="u" placeholder="${esc(t('Username, e.g. azzy'))}" value="${esc(name)}" autocomplete="off" autocapitalize="off"><button class="btn btn-primary btn-sm">${t('Look up')}</button></form><div id="modUser"></div>`;
    if (name) await showUser(name);
  }

  async function showUser(name) {
    const box = pane.querySelector('#modUser');
    box.innerHTML = '<div class="chat-empty"><span class="spin">👤</span></div>';
    try { paintUser(await api(`/api/mod/user?username=${encodeURIComponent(name)}`)); } catch (e) { box.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  function paintUser(r) {
    const box = pane.querySelector('#modUser');
    if (!box) return;
    const u = r.user;
    const c = r.counts;
    const status = [u.owner ? `👑 ${t('Owner')}` : u.mod ? `🛡️ ${t('Moderator')}` : '', u.bannedUntil ? `⛔ ${t('banned until {when}', { when: when(u.bannedUntil) })}` : '', u.mutedUntil ? `🔇 ${t('muted until {when}', { when: when(u.mutedUntil) })}` : ''].filter(Boolean).join(' · ');
    const teamBtn = r.canManage && !u.owner ? `<button type="button" class="btn btn-sm btn-ghost${u.mod ? ' danger' : ''}" data-team="${esc(u.username)}:${u.mod ? 'remove' : 'add'}">🛡️ ${t(u.mod ? 'Remove moderator' : 'Make moderator')}</button>` : '';
    const list = (items, kind) => items.map((m) => `<li class="${m.hidden ? 'is-hidden' : ''}"><span dir="auto">${esc(m.text) || '…'}</span><small>${kind === 'chat' ? `#${esc(m.room)} · ` : ''}${timeAgo(m.created)}${m.reports ? ` · 🚩${m.reports}` : ''}</small>
        ${m.hidden ? `<button type="button" class="linkish" data-content="${kind}:${m.id}:restore">${t('Bring back')}</button>` : `<button type="button" class="linkish" data-content="${kind}:${m.id}:hide">${t('Hide')}</button>`}</li>`).join('');
    box.innerHTML = `<div class="mod-user">
        <div class="mod-user-head">${lookHTML(u, { cls: 'avatar-lg' })}<div><b dir="auto">${esc(u.nickname)}</b> <span class="muted">@${esc(u.username)}</span>
          <p class="muted small">${t('joined {when}', { when: fmtDate(u.created, { month: 'short', year: 'numeric' }) })} · ${u.xp} XP${u.bio ? ` · <span dir="auto">${esc(u.bio)}</span>` : ''}</p>
          ${status ? `<p class="mod-status">${status}</p>` : ''}</div></div>
        <div class="mod-tiles small">
          <div class="mod-tile"><b>${c.chat}</b><small>${t('chat messages')}</small></div><div class="mod-tile"><b>${c.comments}</b><small>${t('comments')}</small></div><div class="mod-tile"><b>${c.dms}</b><small>${t('private messages')}</small></div>
          <div class="mod-tile${c.chatReports + c.commentReports ? ' hot' : ''}"><b>${c.chatReports + c.commentReports}</b><small>${t('reports on posts')}</small></div><div class="mod-tile${c.dmReports ? ' hot' : ''}"><b>${c.dmReports}</b><small>${t('reports from chats')}</small></div><div class="mod-tile${c.photoReports ? ' hot' : ''}"><b>${c.photoReports}</b><small>${t('photo reports')}</small></div>
        </div>
        <div class="mod-actions wrap">
          ${u.owner ? '' : u.mutedUntil ? `<button type="button" class="btn btn-sm btn-ghost" data-user-act="unmute">🔈 ${t('Unmute')}</button>` : `<button type="button" class="btn btn-sm btn-ghost" data-user-act="mute:24">🔇 ${t('Mute 1 day')}</button><button type="button" class="btn btn-sm btn-ghost" data-user-act="mute:168">🔇 ${t('Mute 1 week')}</button>`}
          ${u.owner ? '' : u.bannedUntil ? `<button type="button" class="btn btn-sm btn-ghost" data-user-act="unban">✅ ${t('Unban')}</button>` : `<button type="button" class="btn btn-sm btn-ghost danger" data-user-act="ban:168">⛔ ${t('Ban 1 week')}</button><button type="button" class="btn btn-sm btn-ghost danger" data-user-act="ban:8760">⛔ ${t('Ban 1 year')}</button>`}
          ${teamBtn}
          ${u.photo ? `<button type="button" class="btn btn-sm btn-ghost" data-photo="${esc(u.username)}:remove">📷 ${t('Remove photo')}</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-user="${esc(u.username)}">👤 ${t('Profile card')}</button>
        </div>
        <h3 class="mini-title">💬 ${t('Recent chat messages')}</h3><ul class="mod-recent">${list(r.recentChat, 'chat') || `<li class="muted">—</li>`}</ul>
        <h3 class="mini-title">🗨️ ${t('Recent comments')}</h3><ul class="mod-recent">${list(r.recentComments, 'comment') || `<li class="muted">—</li>`}</ul>
      </div>`;
    box.dataset.username = u.username;
  }

  async function parties() {
    loading();
    try {
      const r = await api('/api/parties');
      const soon = new Date(Date.now() + 3600_000);
      soon.setMinutes(0, 0, 0);
      const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      pane.innerHTML = `<form class="mod-predict" data-modparty>
          <label class="field"><span>${t('Title')}</span><input name="title" maxlength="80" required placeholder="${esc(t('e.g. Big phone launch event'))}"></label>
          <label class="field"><span>${t('Emoji')}</span><input name="emoji" maxlength="4" value="🎉"></label>
          <label class="field"><span>${t('Starts (your time)')}</span><input name="starts" type="datetime-local" value="${local}" required></label>
          <label class="field"><span>${t('Length')}</span><select name="minutes"><option value="30">30 min</option><option value="60">1 h</option><option value="90" selected>1 h 30</option><option value="120">2 h</option><option value="180">3 h</option></select></label>
          <button class="btn btn-primary">🎉 ${t('Schedule party')}</button>
        </form>
        <h3 class="mini-title">${t('Coming up')} <small>${r.parties.length}</small></h3>
        ${r.parties.length ? r.parties.map((p) => `<div class="mod-item"><p class="mod-text" dir="auto">${esc(p.emoji)} ${esc(p.title)}</p>
          <p class="muted small">${when(p.starts)} · ${t('{n} going', { n: p.rsvps })}</p>
          <div class="mod-actions"><button type="button" class="btn btn-sm btn-ghost" data-partydel="${p.id}">${t('Cancel party')}</button></div></div>`).join('') : `<p class="muted small">${t('Nothing here 🎉')}</p>`}`;
    } catch (e) { fail(e); }
  }

  async function predict() {
    loading();
    try {
      const r = await api('/api/predictions');
      const mine = r.open.filter((p) => p.kind === 'mod');
      pane.innerHTML = `<form class="mod-predict" data-modpredict>
          <label class="field"><span>${t('Question')}</span><input name="q" maxlength="160" placeholder="${esc(t('e.g. Which phone sells best this month?'))}" required></label>
          <label class="field"><span>${t('Answers (one per line, 2 to 4)')}</span><textarea name="o" rows="3" required>Yes\nNo</textarea></label>
          <label class="field"><span>${t('Voting closes in')}</span><select name="h"><option value="24">${t('1 day')}</option><option value="72" selected>${t('3 days')}</option><option value="168">${t('1 week')}</option><option value="720">${t('1 month')}</option></select></label>
          <button class="btn btn-primary">🔮 ${t('Post prediction')}</button>
        </form>
        <h3 class="mini-title">${t('Your open predictions')} <small>${mine.length}</small></h3>
        ${mine.length ? mine.map((p) => `<div class="mod-item"><p class="mod-text" dir="auto">${esc(p.question)}</p>
          <p class="muted small">${tn(p.total, '{n} vote', '{n} votes')} · ${t('closes {when}', { when: when(p.closes) })}</p>
          <div class="mod-actions">${t('The answer was:')} ${p.options.map((o, i) => `<button type="button" class="btn btn-sm btn-ghost" data-resolve="${p.id}:${i}">${esc(o)} <small>(${p.counts[i]})</small></button>`).join('')}</div></div>`).join('') : `<p class="muted small">${t('Nothing here 🎉')}</p>`}
        <p class="muted small">${t('Automatic “will it reach N upvotes?” predictions settle themselves.')}</p>`;
    } catch (e) { fail(e); }
  }

  /** 👑 Who the moderators are. Only the owner can add or remove them. */
  async function teamPane() {
    loading();
    try { paintTeam(await api('/api/mod/team')); } catch (e) { fail(e); }
  }
  function paintTeam(r) {
    const since = (ts) => fmtDate(ts, { day: 'numeric', month: 'short', year: 'numeric' });
    const row = (u, isOwner) => `<div class="mod-item"><div class="mod-item-head">${person(u)}<span class="muted small">${isOwner ? `👑 ${t('Owner')}` : `🛡️ ${t('moderator since {when}', { when: since(u.since) })}`}</span></div>
        ${r.canManage && !isOwner ? `<div class="mod-actions"><button type="button" class="btn btn-sm btn-ghost danger" data-team="${esc(u.username)}:remove">${t('Remove moderator')}</button></div>` : ''}</div>`;
    pane.innerHTML = `${r.canManage
      ? `<form class="mod-search" data-teamadd><input name="u" placeholder="${esc(t('Username to make a moderator'))}" autocomplete="off" autocapitalize="off" required><button class="btn btn-primary btn-sm">🛡️ ${t('Make moderator')}</button></form>`
      : `<p class="muted small">👑 ${t('Only the owner can add or remove moderators.')}</p>`}
      ${r.owner ? row(r.owner, true) : ''}
      <h3 class="mini-title">🛡️ ${t('Moderators')} <small>${r.mods.length}</small></h3>
      ${r.mods.length ? r.mods.map((u) => row(u, false)).join('') : `<p class="muted small">${t('No other moderators yet.')}</p>`}`;
  }
  /** The owner makes someone a moderator ('add') or stops them being one ('remove'). */
  async function setTeam(username, action) {
    const ask = action === 'add'
      ? t('Make @{name} a moderator? They’ll be able to hide posts, mute and ban people, and they get every look unlocked.', { name: username })
      : t('Remove @{name} as a moderator?', { name: username });
    if (!confirm(ask)) return;
    try {
      const r = await api('/api/mod/team', { username, action });
      toast(action === 'add' ? t('@{name} is now a moderator 🛡️', { name: username }) : t('@{name} is no longer a moderator.', { name: username }), { emoji: '🛡️' });
      if (tab === 'team') paintTeam(r); else showUser(username);
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }

  async function log() {
    loading();
    try {
      const r = await api('/api/mod/log');
      pane.innerHTML = r.items.length
        ? `<ul class="mod-log">${r.items.map((x) => `<li><b>@${esc(x.admin)}</b> <code>${esc(x.action)}</code> ${esc(x.target || '')} ${x.note ? `<small>(${esc(x.note)})</small>` : ''}<time>${timeAgo(x.at)}</time></li>`).join('')}</ul>`
        : `<p class="muted small">${t('Nothing here 🎉')}</p>`;
    } catch (e) { fail(e); }
  }

  const show = (name) => {
    tab = name;
    dlg.querySelectorAll('[data-modtab][role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modtab === name)));
    ({ overview, reports, people, predict, parties, team: teamPane, log })[name]();
  };

  dlg.addEventListener('submit', async (e) => {
    const party = e.target.closest('[data-modparty]');
    if (party) {
      e.preventDefault();
      try {
        await api('/api/mod/parties', { title: party.elements.title.value, emoji: party.elements.emoji.value || '🎉', starts: new Date(party.elements.starts.value).getTime(), minutes: Number(party.elements.minutes.value) });
        toast(t('Party scheduled! 🎉'), { emoji: '🎉' });
        parties();
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const pf = e.target.closest('[data-modpredict]');
    if (pf) {
      e.preventDefault();
      const options = pf.elements.o.value.split('\n').map((s) => s.trim()).filter(Boolean);
      try {
        await api('/api/mod/predictions', { question: pf.elements.q.value, options, hours: Number(pf.elements.h.value) });
        toast(t('Prediction posted! 🔮'), { emoji: '🔮' });
        predict();
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const ta = e.target.closest('[data-teamadd]');
    if (ta) {
      e.preventDefault();
      const name = ta.elements.u.value.trim().replace(/^@/, '');
      if (name) setTeam(name, 'add');
      return;
    }
    const f = e.target.closest('[data-modsearch]');
    if (!f) return;
    e.preventDefault();
    const name = f.elements.u.value.trim().replace(/^@/, '');
    if (name) { lookedUp = name; showUser(name); }
  });
  dlg.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (e.target === dlg) { dlg.close(); return; }
    const tb = el.closest('[data-modtab]');
    if (tb) return show(tb.dataset.modtab);
    const lk = el.closest('[data-lookup]');
    if (lk) { show('people'); lookedUp = lk.dataset.lookup; return people(lookedUp); }
    const refresh = () => (tab === 'people' ? showUser(lookedUp) : show(tab));
    const tm = el.closest('[data-team]');
    if (tm) { const [username, action] = tm.dataset.team.split(':'); return setTeam(username, action); }
    const pd = el.closest('[data-partydel]');
    if (pd) {
      if (!confirm(t('Cancel this party?'))) return;
      try { await api('/api/mod/parties/delete', { id: Number(pd.dataset.partydel) }); parties(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const rs = el.closest('[data-resolve]');
    if (rs) {
      const [id, answer] = rs.dataset.resolve.split(':').map(Number);
      if (!confirm(t('Settle this prediction? Everyone who picked that answer gets XP.'))) return;
      try { const r = await api('/api/mod/predictions/resolve', { id, answer }); toast(tn(r.winners, '{n} kernel called it!', '{n} kernels called it!'), { emoji: '🔮' }); predict(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    try {
      const c = el.closest('[data-content]');
      if (c) {
        const [kind, id, action] = c.dataset.content.split(':');
        await api('/api/mod/content', { kind, id: Number(id), action });
        toast(action === 'hide' ? t('Hidden.') : action === 'restore' ? t('Brought back.') : t('Reports cleared.'), { emoji: '🛡️' });
        return refresh();
      }
      const d = el.closest('[data-dmdismiss]');
      if (d) { const [reporterId, userId] = d.dataset.dmdismiss.split('|'); await api('/api/mod/dm', { reporterId, userId }); toast(t('Reports cleared.'), { emoji: '🛡️' }); return refresh(); }
      const p = el.closest('[data-photo]');
      if (p) {
        const [username, action] = p.dataset.photo.split(':');
        if (action === 'remove' && !confirm(t('Remove @{name}’s profile photo?', { name: username }))) return;
        await api('/api/mod/photo', { username, action });
        toast(action === 'remove' ? t('Photo removed.') : t('Reports cleared.'), { emoji: '🛡️' });
        return refresh();
      }
      const ua = el.closest('[data-user-act]');
      if (ua) {
        const [action, hours] = ua.dataset.userAct.split(':');
        const name = pane.querySelector('#modUser')?.dataset.username;
        if (!name) return;
        if (action === 'ban' && !confirm(t('Ban @{name}? They’re signed out everywhere and can’t sign in until it ends.', { name }))) return;
        paintUser(await api('/api/mod/user', { username: name, action, hours: Number(hours) || undefined }));
        toast(t('Done.'), { emoji: '🛡️' });
      }
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  });

  return {
    open(name = 'overview') { if (!dlg.open) dlg.showModal(); show(name); },
  };
}
