// kerNEl community on the website: chat rooms, the daily Hot Take poll and profile cards.
import { $, $$, esc, safeUrl, timeAgo, toast, store } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer, fmtDate } from './i18n.js';
import { lookHTML } from './look.js';
import { initDM, mountPeopleSearch, activeText } from './dm.js';
import { seasonMedalsHTML } from './arena.js';

const REACTS = ['🔥', '😂', '🤯', '👍', '❤️'];
const DEFAULT_ROOMS = [ // shown instantly, before the server answers
  { id: 'lobby', name: 'Lobby', emoji: '🍿', online: 0 }, { id: 'ai', name: 'AI', emoji: '🤖', online: 0 },
  { id: 'gaming', name: 'Gaming', emoji: '🎮', online: 0 }, { id: 'dev', name: 'Dev', emoji: '💻', online: 0 },
  { id: 'offtopic', name: 'Off-topic', emoji: '🎲', online: 0 },
];
const OPEN_MS = 3000;    // refresh while the chat is open
const CLOSED_MS = 45000; // light check for new messages while it's closed

export function initCommunity({ openAuth, onSent, onVote, onFollow, badgeInfo, rankTitle, openStory, onDM, openDuel, challenge }) {
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
  let dmCount = 0;
  let mode = store.get('chat:mode', 'rooms') === 'dms' ? 'dms' : 'rooms';
  let lastSeen = store.get('chat:seen', 0);
  const dm = initDM({ pane: $('#dmPane'), openAuth, openStory, onSent: onDM, openDuel, challenge, onBadge: (n) => { dmCount = n; paintDot(); } });

  function setMode(m) {
    mode = m;
    store.set('chat:mode', m);
    $$('[data-chatmode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.chatmode === m)));
    $('#roomsPane').hidden = m !== 'rooms';
    $('#dmPane').hidden = m !== 'dms';
    if (m === 'dms' && isOpen()) dm.show(); else dm.hide();
    if (m === 'rooms' && isOpen()) { paintRooms(); paintComposer(); poll({ fresh: !msgs.size }); }
  }

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
      <span><b dir="auto">${esc(s.title)}</b><small>${esc(s.source || s.domain || '')}${s.time ? ` · ${timeAgo(s.time)}` : ''}</small></span></a>`;
  }

  function messageHTML(m) {
    const mine = auth.user && m.user.username.toLowerCase() === myName() && !m.user.bot;
    const mentionsMe = auth.user && !mine && new RegExp(`@${myName()}\\b`, 'i').test(m.text);
    const reacts = Object.entries(m.reactions || {}).filter(([, n]) => n > 0);
    const who = m.user.bot ? `<span class="cm-ava bot" aria-hidden="true">${esc(m.user.avatar)}</span>` : `<button type="button" class="cm-ava" data-user="${esc(m.user.username)}" aria-label="${esc(t('{name}’s profile', { name: m.user.nickname }))}">${lookHTML(m.user, { streak: m.user.streak })}</button>`;
    return `<div class="cmsg${mine ? ' me' : ''}${mentionsMe ? ' mention' : ''}${m.user.bot ? ' bot' : ''}" data-id="${m.id}">
      ${who}
      <div class="cm-body">
        <div class="cm-head">${m.user.bot ? `<b class="cm-name">${esc(m.user.nickname)}</b><span class="cm-handle">${t('bot')}</span>` : `<button type="button" class="cm-name" data-user="${esc(m.user.username)}">${esc(m.user.nickname)}</button><span class="cm-handle">@${esc(m.user.username)} ${esc(m.user.rank)}</span>`}<time data-time="${m.created}">${timeAgo(m.created)}</time></div>
        ${m.text ? `<div class="cm-text" dir="auto">${formatText(m.text)}</div>` : ''}
        ${(m.stories || []).map(storyCard).join('')}
        <div class="cm-actions">
          ${reacts.map(([e, n]) => `<button type="button" class="cm-react${m.mine === e ? ' on' : ''}" data-react="${e}">${e} ${n}</button>`).join('')}
          ${auth.user ? `<button type="button" class="cm-more" data-cm="pick" aria-label="${t('Add a reaction')}">☺︎＋</button>` : ''}
          ${mine ? `<button type="button" class="cm-more" data-cm="delete" aria-label="${t('Delete my message')}">🗑️</button>`
            : auth.user && !m.user.bot ? `<button type="button" class="cm-more" data-cm="report" aria-label="${t('Report message')}">🚩</button>` : ''}
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
      : `<div class="chat-empty"><span>${rooms.find((r) => r.id === room)?.emoji || '🍿'}</span><p>${t('It’s quiet in here… say hi and pop the first kernel!')}</p></div>`;
    if (scrollToEnd || nearBottom) log.scrollTop = log.scrollHeight;
  }

  function paintRooms() {
    $('#chatRooms').innerHTML = (rooms.length ? rooms : DEFAULT_ROOMS).map((r) =>
      `<button type="button" class="chat-room" data-room="${r.id}" aria-pressed="${r.id === room}">${r.emoji} ${esc(t(r.name))}${r.online ? ` <small>${r.online}</small>` : ''}</button>`).join('');
    const total = rooms.reduce((a, r) => a + r.online, 0);
    $('#chatOnline').textContent = total ? `🟢 ${tn(total, '{n} kernel online', '{n} kernels online')}` : `🟢 ${t('online')}`;
  }

  function paintComposer(mutedUntil) {
    const signedIn = !!auth.user;
    form.hidden = !signedIn;
    $('#chatGuest').hidden = signedIn;
    $('#chatMuted').hidden = !mutedUntil;
    if (mutedUntil) $('#chatMuted').textContent = `🔇 ${t('You’re muted until {when} because several of your messages were reported.', { when: fmtDate(mutedUntil, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}`;
    const prev = $('#chatShare');
    prev.hidden = !share;
    if (share) prev.innerHTML = `${storyCard(share)}<button type="button" class="icon-btn" data-cm="unshare" aria-label="${t('Don’t share this story')}">✕</button>`;
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
      if (isOpen() && e.status !== 429) $('#chatOnline').textContent = `📡 ${t('reconnecting…')}`;
    } finally {
      busy = false;
      schedule();
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!document.hidden) poll(); else schedule(); }, ms ?? (isOpen() && mode === 'rooms' ? OPEN_MS : CLOSED_MS));
  }

  function paintDot() {
    const n = unread + dmCount;
    $$('.chat-dot').forEach((d) => { d.hidden = !n; d.textContent = n > 9 ? '9+' : String(n); });
  }

  function open(shareItem, { as = null } = {}) {
    if (shareItem) share = { key: shareItem.key, title: shareItem.title, url: shareItem.url, source: shareItem.source, cat: shareItem.cat, time: shareItem.time };
    const wasOpen = isOpen();
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    unread = 0;
    paintDot();
    if (shareItem) mode = 'rooms';
    if (as) mode = as;
    setMode(mode);
    if (mode === 'rooms') {
      if (!msgs.size) log.innerHTML = `<div class="chat-empty"><span class="spin">🍿</span><p>${t('Popping the chat…')}</p></div>`;
      if (auth.user) setTimeout(() => input.focus(), 150);
    }
    if (!wasOpen) sfx.pop();
  }
  function close() {
    dm.hide();
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
    log.innerHTML = `<div class="chat-empty"><span class="spin">🍿</span><p>${t('Switching rooms…')}</p></div>`;
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
      toast(tServer(err.message), { emoji: err.status === 403 ? '🔇' : '😵', type: 'error', ms: 6000 });
      sfx.buzz();
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  drawer.addEventListener('click', async (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const modeBtn = el.closest('[data-chatmode]');
    if (modeBtn) return setMode(modeBtn.dataset.chatmode);
    const roomBtn = el.closest('[data-room]');
    if (roomBtn) return switchRoom(roomBtn.dataset.room);
    if (el.closest('[data-cm="close"]')) return close();
    if (el.closest('[data-cm="unshare"]')) { share = null; return paintComposer(); }
    if (el.closest('[data-cm="codme"]')) { input.value = `@codme ${input.value.replace(/^@codme\s*/i, '')}`; return input.focus(); }
    if (el.closest('[data-cm="signin"]')) return openAuth('signin');
    if (el.closest('[data-cm="signup"]')) return openAuth('signup');
    const row = el.closest('.cmsg');
    if (!row) return;
    const id = Number(row.dataset.id);
    const m = msgs.get(id);
    if (el.closest('[data-cm="pick"]')) { const p = row.querySelector('.cm-picker'); p.hidden = !p.hidden; return; }
    const react = el.closest('[data-react]');
    if (react && auth.user) {
      const emoji = react.dataset.react === m.mine ? null : react.dataset.react;
      try {
        const r = await auth.api('/api/chat/react', { method: 'POST', body: { id, emoji } });
        msgs.set(id, { ...m, reactions: r.reactions, mine: r.mine });
        render();
        if (emoji) { burstFrom(react, { emojis: [emoji], count: 6, spread: 40 }); sfx.pop(); }
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    if (el.closest('[data-cm="delete"]')) {
      if (!confirm(t('Delete this message?'))) return;
      try { await auth.api(`/api/chat/${id}`, { method: 'DELETE' }); msgs.delete(id); render(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    if (el.closest('[data-cm="report"]')) {
      if (!confirm(t('Report this message as mean, unsafe or spam? Messages with 3 reports are hidden.'))) return;
      try {
        const r = await auth.api('/api/chat/report', { method: 'POST', body: { id } });
        toast(r.hidden ? t('Thanks — that message is now hidden.') : t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' });
        if (r.hidden) { msgs.delete(id); render(); }
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) close(); });

  // ---------------- daily Hot Take poll ----------------
  async function loadPoll() {
    const box = $('#pollWidget');
    try {
      const p = await auth.api('/api/poll');
      box.hidden = false;
      const voted = p.mine !== null && p.mine !== undefined;
      const showResults = voted || !auth.user;
      $('#pollQ').textContent = t(p.question);
      $('#pollBody').innerHTML = p.options.map((o, i) => {
        const pct = p.total ? Math.round((p.counts[i] / p.total) * 100) : 0;
        return showResults
          ? `<div class="poll-row${p.mine === i ? ' mine' : ''}"><span class="poll-label">${esc(t(o))}${p.mine === i ? ' ✓' : ''}</span><span class="poll-bar"><i style="width:${pct}%"></i></span><b>${pct}%</b></div>`
          : `<button type="button" class="poll-opt" data-vote="${i}">${esc(t(o))}</button>`;
      }).join('');
      const votes = tn(p.total, '{n} vote', '{n} votes');
      $('#pollFoot').innerHTML = !auth.user
        ? `${votes} · <button type="button" class="linkish" data-action="signin">${t('Sign in')}</button> ${t('to vote')}`
        : voted ? `${votes} · ${t('new question tomorrow 🗳️')}` : t('Tap your hot take!');
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
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  });

  // ---------------- profile cards ----------------
  const PLACE = ['🥇', '🥈', '🥉'];
  async function showProfile(username) {
    const dlg = $('#userCard');
    const body = $('#userCardBody');
    body.innerHTML = `<div class="auth-mascot spin">🍿</div><p class="muted">${t('Loading…')}</p>`;
    if (!dlg.open) dlg.showModal();
    try {
      const u = await auth.api(`/api/users/${encodeURIComponent(username)}`, { auth: true });
      const badges = u.badges.map(badgeInfo).filter(Boolean);
      const trophies = u.trophies || [];
      body.innerHTML = `
        <div class="uc-ava">${lookHTML(u, { streak: u.streak, active: u.active })}</div>
        <h2 dir="auto">${esc(u.nickname)}</h2>
        <p class="muted">@${esc(u.username)} · ${t('joined {when}', { when: fmtDate(u.joined, { month: 'short', year: 'numeric' }) })}</p>
        ${u.bio ? `<p class="uc-bio" dir="auto">${esc(u.bio)}</p>` : ''}
        ${activeText(u) || u.followsYou ? `<p class="uc-status">${activeText(u) ? `<span>${u.active ? '🟢' : '⚪'} ${esc(activeText(u))}</span>` : ''}${u.followsYou ? `<span class="chip">${t('Follows you')}</span>` : ''}</p>` : ''}
        <p class="uc-rank">${esc(u.rank)} ${esc(t(rankTitle(u.xp)))}</p>
        <div class="uc-stats">
          <span><b>${u.xp}</b>XP</span>
          <span><b>${u.place ? `#${u.place}` : '—'}</b>${t('rank')}</span>
          <span><b>🔥${u.streak}</b>${t('streak')}</span>
          <span><b>${u.followers ?? 0}</b>${t('followers')}</span>
          <span><b>${u.following ?? 0}</b>${t('following')}</span>
          <span><b>${u.messages}</b>${t('chats')}</span>
        </div>
        ${seasonMedalsHTML(u.seasons)}
        ${trophies.length ? `<p class="uc-trophies" title="${esc(t('Real or Fake? tournament trophies'))}">${trophies.slice(0, 12).map((x) => `<span title="${esc(t('Week of {date}', { date: fmtDate(Date.parse(x.week)) }))}">${PLACE[x.place - 1] || '🏆'}</span>`).join('')} <small>${tn(trophies.length, '{n} trophy', '{n} trophies')}</small></p>` : ''}
        ${badges.length ? `<p class="uc-badges" aria-label="${t('Achievements')}">${badges.map((b) => `<span title="${esc(t(b.name))}">${b.emoji}</span>`).join('')}</p>` : `<p class="muted small">${t('No achievements yet — still warming up 🌽')}</p>`}
        ${u.topics.length ? `<p class="uc-topics">${u.topics.map((x) => `<span class="chip chip-cat" style="--cat-h:${catById(x).hue}">${catById(x).emoji} ${esc(t(catById(x).label))}</span>`).join(' ')}</p>` : ''}
        ${u.kidsStars ? `<p class="muted small">🧸 ${t('{n} kerNEl Kids stars', { n: u.kidsStars })}</p>` : ''}
        ${u.blocked ? `<p class="uc-blocked">🚫 ${t('You blocked @{name}.', { name: esc(u.username) })}</p>` : ''}
        <div class="uc-actions">
          ${auth.user && !u.me && !u.blocked ? `<button type="button" class="btn ${u.isFollowing ? 'btn-ghost' : 'btn-primary'}" data-follow="${esc(u.username)}" data-on="${u.isFollowing ? 1 : 0}">${u.isFollowing ? t('✓ Following') : u.followsYou ? t('➕ Follow back') : t('➕ Follow')}</button>` : ''}
          ${auth.user && !u.me && u.canMessage ? `<button type="button" class="btn btn-ghost" data-message="${esc(u.username)}">✉️ ${t('Message')}</button><button type="button" class="btn btn-ghost" data-duel-user="${esc(u.username)}">⚔️ ${t('Duel')}</button>` : ''}
          ${!auth.user ? `<button type="button" class="btn btn-primary" data-action="signup">${t('➕ Sign up to follow')}</button>` : ''}
          ${auth.user && !u.me && !u.blocked ? `<button type="button" class="btn btn-ghost" data-mention="${esc(u.username)}">💬 ${t('Mention in chat')}</button>` : ''}
          ${u.me ? `<button type="button" class="btn btn-ghost" data-action="edit-profile">✏️ ${t('Edit profile')}</button>` : ''}
        </div>
        <div class="uc-more">
          <button type="button" class="linkish" data-share-profile="${esc(u.username)}">🔗 ${t('Share profile')}</button>
          ${auth.user && !u.me ? `<button type="button" class="linkish" data-block="${esc(u.username)}" data-on="${u.blocked ? 1 : 0}">${u.blocked ? `✅ ${t('Unblock')}` : `🚫 ${t('Block')}`}</button>` : ''}
          ${auth.user && !u.me && u.photo ? `<button type="button" class="linkish" data-report-photo="${esc(u.username)}">🚩 ${t('Report photo')}</button>` : ''}
        </div>`;
    } catch (err) {
      body.innerHTML = `<div class="auth-mascot">🤷</div><p>${esc(tServer(err.message))}</p>`;
    }
  }
  $('#userCard').addEventListener('click', async (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
    const el = e.target instanceof Element ? e.target : null;
    const b = el?.closest('[data-mention]');
    if (b) {
      $('#userCard').close();
      open();
      input.value = `@${b.dataset.mention} ${input.value}`;
      input.focus();
      return;
    }
    const duelBtn = el?.closest('[data-duel-user]');
    if (duelBtn) { $('#userCard').close(); challenge?.(duelBtn.dataset.duelUser); return; }
    const msgBtn = el?.closest('[data-message]');
    if (msgBtn) { $('#userCard').close(); openDM(msgBtn.dataset.message); return; }
    if (el?.closest('[data-action="edit-profile"]')) { $('#userCard').close(); return; }
    const shareBtn = el?.closest('[data-share-profile]');
    if (shareBtn) {
      const link = `${location.origin}${location.pathname}#@${shareBtn.dataset.shareProfile}`;
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `@${shareBtn.dataset.shareProfile} on kerNEl`, url: link });
        else { await navigator.clipboard.writeText(link); toast(t('Profile link copied! 🔗'), { emoji: '🔗' }); }
      } catch { /* cancelled */ }
      return;
    }
    const blockBtn = el?.closest('[data-block]');
    if (blockBtn) {
      const name = blockBtn.dataset.block;
      const on = blockBtn.dataset.on !== '1';
      if (on && !confirm(t('Block @{name}? They won’t be able to message you or find you, and you’ll stop following each other.', { name }))) return;
      try {
        await auth.api('/api/block', { method: 'POST', body: { username: name, block: on } });
        toast(on ? t('@{name} is blocked.', { name }) : t('@{name} is unblocked.', { name }), { emoji: on ? '🚫' : '✅' });
        showProfile(name);
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const rp = el?.closest('[data-report-photo]');
    if (rp) {
      if (!confirm(t('Report this profile photo as inappropriate? Photos reported by 3 people are removed.'))) return;
      try {
        const r = await auth.api('/api/photo/report', { method: 'POST', body: { username: rp.dataset.reportPhoto } });
        toast(r.removed ? t('Thanks — that photo has been removed.') : t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' });
        showProfile(rp.dataset.reportPhoto);
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const f = el?.closest('[data-follow]');
    if (f) {
      const on = f.dataset.on !== '1';
      f.disabled = true;
      try {
        await auth.api('/api/follow', { method: 'POST', body: { username: f.dataset.follow, follow: on } });
        if (on) { burstFrom(f, { emojis: ['👯', '💛', '🍿'], count: 10 }); sfx.ding(); toast(t('You’re following @{name}! You’ll see their wins in 👯 Friends.', { name: f.dataset.follow }), { emoji: '👯' }); }
        onFollow?.(on);
        showProfile(f.dataset.follow);
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); f.disabled = false; }
    }
  });
  document.addEventListener('click', (e) => {
    const u = e.target instanceof Element && e.target.closest('[data-user]');
    if (u && !u.closest('#userCard')) { e.preventDefault(); showProfile(u.dataset.user); }
  });

  // ---------------- ✉️ messages + 🔍 people ----------------
  function openDM(username, person) {
    if (!auth.user) { toast(t('Sign in to message people privately ✉️'), { emoji: '✉️' }); openAuth('signin'); return; }
    open(null, { as: 'dms' });
    dm.openWith(username, person);
  }
  const people = mountPeopleSearch({ input: $('#peopleSearch'), results: $('#peopleResults'), onMessage: openDM, onFollow });
  $('#peopleWidget').hidden = false;
  people.refresh();

  // start: light background check + poll
  schedule(4000);
  loadPoll();
  auth.addEventListener('signin', () => { loadPoll(); people.refresh(); if (isOpen()) { poll({ fresh: true }); setMode(mode); } });
  auth.addEventListener('signout', () => { loadPoll(); people.refresh(); share = null; dmCount = 0; paintDot(); if (isOpen()) { paintComposer(); render(); setMode(mode); } });

  return {
    open,
    openRoom: (id) => {
      if (!DEFAULT_ROOMS.some((r) => r.id === id)) return open();
      if (id !== room) { room = id; store.set('chat:room', id); msgs = new Map(); since = 0; }
      open();
    },
    close,
    toggle: () => (isOpen() ? close() : open()),
    share: (item) => (auth.user ? open(item) : (toast(t('Sign in to share stories in kerNEl Chat!'), { emoji: '💬' }), openAuth('signin'))),
    sendToFriend: (item) => {
      if (!auth.user) { toast(t('Sign in to send stories to your friends ✉️'), { emoji: '✉️' }); openAuth('signin'); return; }
      open(null, { as: 'dms' });
      dm.shareStory(item);
    },
    openDM,
    openMessages: () => { open(null, { as: 'dms' }); dm.inbox(); },
    refreshPoll: loadPoll,
    showProfile,
  };
}
