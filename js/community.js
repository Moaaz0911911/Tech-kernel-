// kerNEl community on the website: chat rooms, the daily Hot Take poll and profile cards.
import { $, $$, esc, safeUrl, timeAgo, toast, store } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';

const REACTS = ['🔥', '😂', '🤯', '👍', '❤️'];
const OPEN_MS = 3000;    // refresh while the chat is open
const CLOSED_MS = 45000; // light check for new messages while it's closed

export function initCommunity({ openAuth, onSent, onVote, badgeInfo, rankTitle }) {
  const drawer = $('#chatDrawer');
  if (!auth.ready) { // community features need the kerNEl server
    drawer.remove();
    $('#pollWidget')?.remove();
    return null;
  }
  const log = $('#chatLog');
  const form = $('#chatForm');
  const input = $('#chatInput');
  let room = store.get('chat:room', 'lobby');
  let rooms = [];
  let msgs = new Map();
  let since = 0;
  let timer = 0;
  let busy = false;
  let share = null; // story waiting to be shared
  let unread = 0;
  let lastSeen = store.get('chat:seen', 0);

  // ---------------- chat ----------------
  const isOpen = () => !drawer.hidden;
  const myName = () => auth.user?.username?.toLowerCase();

  function formatText(t) {
    return esc(t)
      .replace(/(^|\s)@([A-Za-z0-9_]{2,20})\b/g, (m, sp, name) => `${sp}<b class="at${name.toLowerCase() === myName() ? ' me' : ''}" data-user="${name}">@${name}</b>`)
      .replace(/\n/g, '<br>');
  }

  function storyCard(s) {
    const c = catById(s.cat);
    return `<a class="cm-story" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">
      <span class="cm-story-emoji" aria-hidden="true">${c.emoji}</span>
      <span><b>${esc(s.title)}</b><small>${esc(s.source || s.domain || '')}${s.time ? ` · ${timeAgo(s.time)}` : ''}</small></span></a>`;
  }

  function messageHTML(m) {
    const mine = auth.user && m.user.username.toLowerCase() === myName() && !m.user.bot;
    const mentionsMe = auth.user && !mine && new RegExp(`@${myName()}\\b`, 'i').test(m.text);
    const reacts = Object.entries(m.reactions || {}).filter(([, n]) => n > 0);
    const who = m.user.bot ? `<span class="cm-ava bot" aria-hidden="true">${esc(m.user.avatar)}</span>` : `<button type="button" class="cm-ava" data-user="${esc(m.user.username)}" aria-label="${esc(m.user.nickname)}'s profile">${esc(m.user.avatar)}</button>`;
    return `<div class="cmsg${mine ? ' me' : ''}${mentionsMe ? ' mention' : ''}${m.user.bot ? ' bot' : ''}" data-id="${m.id}">
      ${who}
      <div class="cm-body">
        <div class="cm-head">${m.user.bot ? `<b class="cm-name">${esc(m.user.nickname)}</b><span class="cm-handle">bot</span>` : `<button type="button" class="cm-name" data-user="${esc(m.user.username)}">${esc(m.user.nickname)}</button><span class="cm-handle">@${esc(m.user.username)} ${esc(m.user.rank)}</span>`}<time data-time="${m.created}">${timeAgo(m.created)}</time></div>
        ${m.text ? `<div class="cm-text">${formatText(m.text)}</div>` : ''}
        ${(m.stories || []).map(storyCard).join('')}
        <div class="cm-actions">
          ${reacts.map(([e, n]) => `<button type="button" class="cm-react${m.mine === e ? ' on' : ''}" data-react="${e}">${e} ${n}</button>`).join('')}
          ${auth.user ? `<button type="button" class="cm-more" data-cm="pick" aria-label="Add a reaction">☺︎＋</button>` : ''}
          ${mine ? '<button type="button" class="cm-more" data-cm="delete" aria-label="Delete my message">🗑️</button>'
            : auth.user && !m.user.bot ? '<button type="button" class="cm-more" data-cm="report" aria-label="Report message">🚩</button>' : ''}
        </div>
        <div class="cm-picker" hidden>${REACTS.map((e) => `<button type="button" data-react="${e}">${e}</button>`).join('')}</div>
      </div>
    </div>`;
  }

  function render(scrollToEnd) {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const list = [...msgs.values()].filter((m) => !m.hidden).sort((a, b) => a.id - b.id);
    log.innerHTML = list.length
      ? list.map(messageHTML).join('')
      : `<div class="chat-empty"><span>${rooms.find((r) => r.id === room)?.emoji || '🍿'}</span><p>It’s quiet in here… say hi and pop the first kernel!</p></div>`;
    if (scrollToEnd || nearBottom) log.scrollTop = log.scrollHeight;
  }

  function paintRooms() {
    $('#chatRooms').innerHTML = (rooms.length ? rooms : [{ id: 'lobby', name: 'Lobby', emoji: '🍿', online: 0 }]).map((r) =>
      `<button type="button" class="chat-room" data-room="${r.id}" aria-pressed="${r.id === room}">${r.emoji} ${esc(r.name)}${r.online ? ` <small>${r.online}</small>` : ''}</button>`).join('');
    const total = rooms.reduce((a, r) => a + r.online, 0);
    $('#chatOnline').textContent = total ? `🟢 ${total} kernel${total === 1 ? '' : 's'} online` : '🟢 online';
  }

  function paintComposer(mutedUntil) {
    const signedIn = !!auth.user;
    form.hidden = !signedIn;
    $('#chatGuest').hidden = signedIn;
    $('#chatMuted').hidden = !mutedUntil;
    if (mutedUntil) $('#chatMuted').textContent = `🔇 You’re muted until ${new Date(mutedUntil).toLocaleString()} because several of your messages were reported.`;
    const prev = $('#chatShare');
    prev.hidden = !share;
    if (share) prev.innerHTML = `${storyCard(share)}<button type="button" class="icon-btn" data-cm="unshare" aria-label="Don’t share this story">✕</button>`;
  }

  async function poll({ fresh = false } = {}) {
    if (busy) return;
    busy = true;
    try {
      const r = await auth.api(`/api/chat?room=${room}&since=${fresh ? 0 : since}`, { auth: true });
      if (fresh) msgs = new Map();
      let incoming = 0;
      for (const m of r.messages) {
        if (!msgs.has(m.id) && !fresh && m.user.username.toLowerCase() !== myName()) incoming++;
        msgs.set(m.id, m);
        lastSeen = Math.max(lastSeen, m.created);
      }
      since = r.now;
      rooms = r.rooms;
      if (isOpen()) {
        store.set('chat:seen', lastSeen);
        paintRooms();
        render(fresh);
        paintComposer(r.mutedUntil);
        if (incoming) sfx.blip();
      } else if (incoming) {
        unread += incoming;
        paintDot();
      }
    } catch (e) {
      if (isOpen() && e.status !== 429) $('#chatOnline').textContent = '📡 reconnecting…';
    } finally {
      busy = false;
      schedule();
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!document.hidden) poll(); else schedule(); }, ms ?? (isOpen() ? OPEN_MS : CLOSED_MS));
  }

  function paintDot() {
    $$('.chat-dot').forEach((d) => { d.hidden = !unread; d.textContent = unread > 9 ? '9+' : String(unread); });
  }

  function open(shareItem) {
    if (shareItem) share = { key: shareItem.key, title: shareItem.title, url: shareItem.url, source: shareItem.source, cat: shareItem.cat, time: shareItem.time };
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    unread = 0;
    paintDot();
    paintRooms();
    paintComposer();
    if (!msgs.size) log.innerHTML = '<div class="chat-empty"><span class="spin">🍿</span><p>Popping the chat…</p></div>';
    poll({ fresh: !msgs.size });
    if (auth.user) setTimeout(() => input.focus(), 150);
    sfx.pop();
  }
  function close() {
    drawer.classList.remove('open');
    setTimeout(() => { if (!drawer.classList.contains('open')) drawer.hidden = true; }, 250);
    schedule(CLOSED_MS);
  }
  function switchRoom(id) {
    if (id === room) return;
    room = id;
    store.set('chat:room', id);
    msgs = new Map();
    since = 0;
    paintRooms();
    log.innerHTML = '<div class="chat-empty"><span class="spin">🍿</span><p>Switching rooms…</p></div>';
    poll({ fresh: true });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !share) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const r = await auth.api('/api/chat', { method: 'POST', body: { room, text, storyKey: share?.key } });
      msgs.set(r.message.id, r.message);
      input.value = '';
      share = null;
      paintComposer();
      render(true);
      sfx.pop();
      burstFrom(btn, { emojis: ['💬', '🍿', '✨'], count: 6, spread: 50 });
      onSent?.();
      if (/^@codme\b/i.test(text)) setTimeout(() => poll(), 1500); // codme answers in a moment
    } catch (err) {
      toast(err.message, { emoji: err.status === 403 ? '🔇' : '😵', type: 'error', ms: 6000 });
      sfx.buzz();
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  drawer.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const roomBtn = t.closest('[data-room]');
    if (roomBtn) return switchRoom(roomBtn.dataset.room);
    if (t.closest('[data-cm="close"]')) return close();
    if (t.closest('[data-cm="unshare"]')) { share = null; return paintComposer(); }
    if (t.closest('[data-cm="codme"]')) { input.value = `@codme ${input.value.replace(/^@codme\s*/i, '')}`; return input.focus(); }
    if (t.closest('[data-cm="signin"]')) return openAuth('signin');
    if (t.closest('[data-cm="signup"]')) return openAuth('signup');
    const row = t.closest('.cmsg');
    if (!row) return;
    const id = Number(row.dataset.id);
    const m = msgs.get(id);
    if (t.closest('[data-cm="pick"]')) { const p = row.querySelector('.cm-picker'); p.hidden = !p.hidden; return; }
    const react = t.closest('[data-react]');
    if (react && auth.user) {
      const emoji = react.dataset.react === m.mine ? null : react.dataset.react;
      try {
        const r = await auth.api('/api/chat/react', { method: 'POST', body: { id, emoji } });
        msgs.set(id, { ...m, reactions: r.reactions, mine: r.mine });
        render();
        if (emoji) { burstFrom(react, { emojis: [emoji], count: 6, spread: 40 }); sfx.pop(); }
      } catch (err) { toast(err.message, { emoji: '😵' }); }
      return;
    }
    if (t.closest('[data-cm="delete"]')) {
      if (!confirm('Delete this message?')) return;
      try { await auth.api(`/api/chat/${id}`, { method: 'DELETE' }); msgs.delete(id); render(); } catch (err) { toast(err.message, { emoji: '😵' }); }
      return;
    }
    if (t.closest('[data-cm="report"]')) {
      if (!confirm('Report this message as mean, unsafe or spam? Messages with 3 reports are hidden.')) return;
      try {
        const r = await auth.api('/api/chat/report', { method: 'POST', body: { id } });
        toast(r.hidden ? 'Thanks — that message is now hidden.' : 'Thanks for reporting. We’ve got it from here. 🛡️', { emoji: '🚩' });
        if (r.hidden) { msgs.delete(id); render(); }
      } catch (err) { toast(err.message, { emoji: '😵' }); }
    }
  });
  drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // ---------------- daily Hot Take poll ----------------
  async function loadPoll() {
    const box = $('#pollWidget');
    try {
      const p = await auth.api('/api/poll');
      box.hidden = false;
      const voted = p.mine !== null && p.mine !== undefined;
      const showResults = voted || !auth.user;
      $('#pollQ').textContent = p.question;
      $('#pollBody').innerHTML = p.options.map((o, i) => {
        const pct = p.total ? Math.round((p.counts[i] / p.total) * 100) : 0;
        return showResults
          ? `<div class="poll-row${p.mine === i ? ' mine' : ''}"><span class="poll-label">${esc(o)}${p.mine === i ? ' ✓' : ''}</span><span class="poll-bar"><i style="width:${pct}%"></i></span><b>${pct}%</b></div>`
          : `<button type="button" class="poll-opt" data-vote="${i}">${esc(o)}</button>`;
      }).join('');
      $('#pollFoot').innerHTML = !auth.user
        ? `${p.total} vote${p.total === 1 ? '' : 's'} · <button type="button" class="linkish" data-action="signin">Sign in</button> to vote`
        : voted ? `${p.total} vote${p.total === 1 ? '' : 's'} today · new question tomorrow 🗳️` : 'Tap your hot take!';
    } catch { box.hidden = true; }
  }
  $('#pollWidget').addEventListener('click', async (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-vote]');
    if (!b) return;
    try {
      const r = await auth.api('/api/poll', { method: 'POST', body: { option: Number(b.dataset.vote) } });
      burstFrom(b, { emojis: ['🗳️', '✨', '🔥'], count: 10 });
      sfx.ding();
      if (r.firstVote) onVote?.();
      loadPoll();
    } catch (err) { toast(err.message, { emoji: '😵' }); }
  });

  // ---------------- profile cards ----------------
  async function showProfile(username) {
    const dlg = $('#userCard');
    const body = $('#userCardBody');
    body.innerHTML = '<div class="auth-mascot spin">🍿</div><p class="muted">Loading…</p>';
    if (!dlg.open) dlg.showModal();
    try {
      const u = await auth.api(`/api/users/${encodeURIComponent(username)}`);
      const badges = u.badges.map(badgeInfo).filter(Boolean);
      body.innerHTML = `
        <div class="uc-ava">${esc(u.avatar)}</div>
        <h2>${esc(u.nickname)}</h2>
        <p class="muted">@${esc(u.username)} · joined ${new Date(u.joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
        <p class="uc-rank">${esc(u.rank)} ${esc(rankTitle(u.xp))}</p>
        <div class="uc-stats">
          <span><b>${u.xp}</b>XP</span>
          <span><b>${u.place ? `#${u.place}` : '—'}</b>rank</span>
          <span><b>🔥${u.streak}</b>streak</span>
          <span><b>${u.messages}</b>chats</span>
        </div>
        ${badges.length ? `<p class="uc-badges" aria-label="Achievements">${badges.map((b) => `<span title="${esc(b.name)}">${b.emoji}</span>`).join('')}</p>` : '<p class="muted small">No achievements yet — still warming up 🌽</p>'}
        ${u.topics.length ? `<p class="uc-topics">${u.topics.map((t) => `<span class="chip chip-cat" style="--cat-h:${catById(t).hue}">${catById(t).emoji} ${esc(catById(t).label)}</span>`).join(' ')}</p>` : ''}
        ${u.kidsStars ? `<p class="muted small">🧸 ${u.kidsStars} kerNEl Kids stars</p>` : ''}
        ${auth.user && u.username.toLowerCase() !== myName() ? `<button type="button" class="btn btn-primary" data-mention="${esc(u.username)}">💬 Mention in chat</button>` : ''}`;
    } catch (err) {
      body.innerHTML = `<div class="auth-mascot">🤷</div><p>${esc(err.message)}</p>`;
    }
  }
  $('#userCard').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
    const b = e.target instanceof Element && e.target.closest('[data-mention]');
    if (b) {
      $('#userCard').close();
      open();
      input.value = `@${b.dataset.mention} ${input.value}`;
      input.focus();
    }
  });
  document.addEventListener('click', (e) => {
    const u = e.target instanceof Element && e.target.closest('[data-user]');
    if (u && !u.closest('#userCard')) { e.preventDefault(); showProfile(u.dataset.user); }
  });

  // start: light background check + poll
  schedule(4000);
  loadPoll();
  auth.addEventListener('signin', () => { loadPoll(); if (isOpen()) poll({ fresh: true }); });
  auth.addEventListener('signout', () => { loadPoll(); share = null; if (isOpen()) { paintComposer(); render(); } });

  return {
    open,
    close,
    toggle: () => (isOpen() ? close() : open()),
    share: (item) => (auth.user ? open(item) : (toast('Sign in to share stories in kerNEl Chat!', { emoji: '💬' }), openAuth('signin'))),
    refreshPoll: loadPoll,
    showProfile,
  };
}
