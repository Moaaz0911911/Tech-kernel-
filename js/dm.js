// ✉️ kerNEl Messages: private chats with message requests, "Seen", reactions, 🔥 streaks and shared stories.
// Also 🔍 people search (in Messages and on the Me tab).
import { $, $$, esc, timeAgo, toast, safeUrl } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer, fmtDate } from './i18n.js';
import { lookHTML } from './look.js';

const REACTS = ['❤️', '😂', '🔥', '👍', '😮', '😢'];
const INBOX_MS = 8000;    // refresh the inbox while it's open
const CONVO_MS = 2500;    // refresh a conversation while it's open
const BADGE_MS = 40000;   // light check for new messages

export const activeText = (p) => (p.active ? t('Active now') : p.lastActive ? t('Active {when}', { when: timeAgo(p.lastActive) }) : '');
export const findPeople = async (q) => (await auth.api(`/api/users/search?q=${encodeURIComponent(q || '')}`)).people;

/** A person in a list. `pick` makes the whole row a button with that data attribute (e.g. data-dmto). */
export function personHTML(p, { actions = '', pick = 'data-user' } = {}) {
  const sub = [`@${esc(p.username)}`, p.followsYou ? esc(t('follows you')) : '', p.blocked ? `🚫 ${esc(t('blocked'))}` : '', p.active ? `🟢 ${esc(t('Active now'))}` : ''].filter(Boolean).join(' · ');
  return `<div class="person">
    <button type="button" class="person-main" ${pick}="${esc(p.username)}">${lookHTML(p, { active: p.active })}
      <span class="person-text"><b dir="auto">${esc(p.nickname)}</b><small>${sub}</small>${p.bio ? `<span class="person-bio" dir="auto">${esc(p.bio)}</span>` : ''}</span></button>
    ${actions}</div>`;
}

/** 🔍 The "Find people" box on the Me tab. */
export function mountPeopleSearch({ input, results, onMessage, onFollow }) {
  let timer = 0;
  let seq = 0;
  const actions = (p) => {
    if (p.me) return `<span class="muted small">${t('That’s you!')}</span>`;
    if (!auth.user) return '';
    return `<span class="person-actions">
      <button type="button" class="btn btn-sm ${p.isFollowing ? 'btn-ghost' : 'btn-primary'}" data-pfollow="${esc(p.username)}" data-on="${p.isFollowing ? 1 : 0}">${p.isFollowing ? t('Following') : p.followsYou ? t('Follow back') : t('Follow')}</button>
      <button type="button" class="icon-btn" data-pmsg="${esc(p.username)}" title="${esc(t('Message'))}" aria-label="${esc(t('Message {name}', { name: p.nickname }))}">✉️</button></span>`;
  };
  let people = [];
  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (!results.innerHTML) results.innerHTML = `<p class="muted small">${t('Looking…')}</p>`;
    try {
      const found = await findPeople(q);
      if (my !== seq) return;
      people = found;
      results.innerHTML = found.length
        ? `${q ? '' : `<p class="muted small people-hint">${t('Suggested for you')}</p>`}${found.map((p) => personHTML(p, { actions: actions(p) })).join('')}`
        : `<p class="muted small">${q ? t('No kernels found for “{q}”', { q: esc(q) }) : t('Nobody to suggest yet — invite your friends! 🍿')}</p>`;
    } catch (e) { if (my === seq) results.innerHTML = `<p class="muted small">😵 ${esc(tServer(e.message))}</p>`; }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  results.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const m = el?.closest('[data-pmsg]');
    if (m) return onMessage(m.dataset.pmsg, people.find((p) => p.username === m.dataset.pmsg));
    const f = el?.closest('[data-pfollow]');
    if (!f) return;
    const on = f.dataset.on !== '1';
    f.disabled = true;
    try {
      await auth.api('/api/follow', { method: 'POST', body: { username: f.dataset.pfollow, follow: on } });
      const p = people.find((x) => x.username === f.dataset.pfollow);
      if (p) p.isFollowing = on;
      f.outerHTML = actions(p).match(/<button[^>]*data-pfollow[\s\S]*?<\/button>/)[0];
      if (on) { burstFrom(results, { emojis: ['👯', '💛', '🍿'], count: 8, spread: 60 }); sfx.ding(); }
      onFollow?.(on);
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); f.disabled = false; }
  });
  return { refresh: run };
}

const SKELETON = () => `
  <div class="dm-view" data-view="inbox">
    <label class="people-search dm-search"><span class="sr-only">${t('Search people')}</span><span class="search-icon" aria-hidden="true">🔍</span><input id="dmSearch" type="search" placeholder="${esc(t('Search people to message…'))}" autocomplete="off" enterkeyhint="search"></label>
    <div class="dm-share-hint" id="dmShareHint" hidden></div>
    <div class="dm-list" id="dmList"></div>
  </div>
  <div class="dm-view" data-view="convo" hidden>
    <header class="dm-top">
      <button type="button" class="icon-btn" data-dm="back" aria-label="${esc(t('Back to messages'))}"><span class="dm-back" aria-hidden="true">‹</span></button>
      <button type="button" class="dm-who" id="dmWho"></button>
      <span class="dm-streak" id="dmStreak" hidden></span>
      <button type="button" class="icon-btn" data-dm="duel" id="dmDuelBtn" title="${esc(t('Challenge to a Quiz Duel'))}" aria-label="${esc(t('Challenge to a Quiz Duel'))}">⚔️</button>
      <button type="button" class="icon-btn" data-dm="menu" aria-label="${esc(t('More options'))}" aria-haspopup="menu">⋯</button>
      <div class="dm-menu glass" id="dmMenu" role="menu" hidden></div>
    </header>
    <div class="dm-log" id="dmLog" aria-live="polite"></div>
    <div class="dm-banner" id="dmBanner" hidden></div>
    <div class="chat-share" id="dmShare" hidden></div>
    <form class="chat-form dm-form" id="dmForm">
      <label class="sr-only" for="dmInput">${t('Message')}</label>
      <input id="dmInput" maxlength="1000" autocomplete="off" placeholder="${esc(t('Message…'))}" enterkeyhint="send">
      <button type="submit" class="send-btn" aria-label="${esc(t('Send'))}">➤</button>
    </form>
  </div>
  <div class="chat-guest" data-view="guest" hidden>
    <p>${t('Sign in to message people privately ✉️')}</p>
    <button type="button" class="btn btn-primary" data-cm="signup">${t('Sign up free')}</button>
    <button type="button" class="btn btn-ghost" data-cm="signin">${t('Sign in')}</button>
  </div>`;

export function initDM({ pane, onBadge, openAuth, openStory, onSent, openDuel, challenge }) {
  pane.innerHTML = SKELETON();
  const inbox = pane.querySelector('[data-view="inbox"]');
  const convo = pane.querySelector('[data-view="convo"]');
  const guest = pane.querySelector('[data-view="guest"]');
  const list = $('#dmList');
  const search = $('#dmSearch');
  const log = $('#dmLog');
  const form = $('#dmForm');
  const input = $('#dmInput');

  let visible = false;
  let threads = [];
  let loaded = false;
  let counts = { unread: 0, requests: 0 };
  let showRequests = false;
  let cur = null;             // the open conversation
  let msgs = new Map();
  let since = 0;
  let theirRead = 0;
  let selected = 0;           // message showing its reaction bar
  let share = null;           // a story waiting to be sent
  let query = '';
  let results = null;
  let suggestions = null;
  let timer = 0;
  let busy = false;
  let searchTimer = 0;

  const view = (name) => { inbox.hidden = name !== 'inbox'; convo.hidden = name !== 'convo'; guest.hidden = name !== 'guest'; };
  const storyOf = (s) => ({ key: s.key, title: s.title, url: s.url, source: s.source, cat: s.cat, image: s.image, domain: s.domain, time: s.time });

  function paintBadge() {
    const n = counts.unread + counts.requests;
    const dot = $('#dmDot');
    if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? '9+' : String(n); }
    onBadge?.(n);
  }

  // ---------------- inbox ----------------
  const lastText = (th) => {
    if (!th.last) return '';
    const body = th.last.deleted ? t('Message deleted') : th.last.duel ? `⚔️ ${t('Quiz Duel challenge')}` : th.last.story && !th.last.text ? `📰 ${t('Shared a story')}` : th.last.text;
    return th.last.mine ? `${t('You')}: ${body}` : body;
  };
  const threadRow = (th) => `<button type="button" class="dm-row${th.unread ? ' unread' : ''}" data-thread="${th.id}">
    ${lookHTML(th.other, { active: th.other.active })}
    <span class="dm-row-text"><b dir="auto">${esc(th.other.nickname)}</b><span class="dm-last" dir="auto">${esc(lastText(th))}</span></span>
    <span class="dm-meta"><time>${timeAgo(th.lastAt)}</time>${th.unread ? `<span class="dm-unread">${th.unread > 9 ? '9+' : th.unread}</span>` : th.streak >= 2 ? `<span class="dm-streak">🔥${th.streak}</span>` : th.pending && th.last?.mine ? `<small>${t('Request sent')}</small>` : ''}</span>
  </button>`;

  function renderInbox() {
    if (!auth.user) return view('guest');
    view('inbox');
    const hint = $('#dmShareHint');
    hint.hidden = !share;
    if (share) hint.innerHTML = `<span>📰 ${t('Pick who to send “{title}” to', { title: esc(share.title.slice(0, 70)) })}</span><button type="button" class="icon-btn" data-dm="unshare" aria-label="${esc(t('Don’t share this story'))}">✕</button>`;
    if (query) {
      list.innerHTML = results === null
        ? `<p class="muted small dm-note">${t('Looking…')}</p>`
        : results.length ? results.map((p) => personHTML(p, { pick: 'data-dmto' })).join('') : `<p class="muted small dm-note">${t('No kernels found for “{q}”', { q: esc(query) })}</p>`;
      return;
    }
    if (!loaded) { list.innerHTML = '<div class="chat-empty"><span class="spin">✉️</span></div>'; return; }
    const reqs = threads.filter((x) => x.request);
    const main = threads.filter((x) => !x.request);
    let html = '';
    if (showRequests) {
      html += `<button type="button" class="dm-reqbar" data-dm="requests-close">‹ ${t('Message requests')}</button>
        <p class="muted small dm-note">${t('Requests are from people you don’t follow. They won’t know you’ve seen them until you accept.')}</p>`;
      html += reqs.length ? reqs.map(threadRow).join('') : `<p class="muted small dm-note">${t('No requests right now.')}</p>`;
    } else {
      if (reqs.length) html += `<button type="button" class="dm-reqbar" data-dm="requests">📨 ${tn(reqs.length, '{n} message request', '{n} message requests')} <span aria-hidden="true">›</span></button>`;
      if (main.length) html += main.map(threadRow).join('');
      else {
        html += `<div class="chat-empty dm-empty"><span>✉️</span><p>${t('No messages yet. Search for someone to say hi 👋')}</p></div>`;
        if (suggestions?.length) html += `<p class="muted small dm-note">${t('Suggested for you')}</p>${suggestions.map((p) => personHTML(p, { pick: 'data-dmto' })).join('')}`;
        else if (suggestions === null) loadSuggestions();
      }
    }
    list.innerHTML = html;
  }

  async function loadSuggestions() {
    suggestions = [];
    try { suggestions = (await findPeople('')).filter((p) => !p.me && !p.blocked).slice(0, 6); } catch { /* fine */ }
    if (!query && !cur) renderInbox();
  }

  async function loadThreads() {
    if (!auth.user) return;
    try {
      const r = await auth.api('/api/dm');
      threads = r.threads;
      counts = { unread: r.unread, requests: r.requests };
      loaded = true;
      paintBadge();
      if (visible && !cur && !query) renderInbox();
    } catch { /* offline: try again soon */ }
  }

  search.addEventListener('input', () => {
    query = search.value.trim().replace(/^@+/, '');
    results = null;
    clearTimeout(searchTimer);
    renderInbox();
    if (!query) return;
    const q = query;
    searchTimer = setTimeout(async () => {
      try { const found = await findPeople(q); if (q === query) { results = found.filter((p) => !p.me); renderInbox(); } } catch { if (q === query) { results = []; renderInbox(); } }
    }, 220);
  });

  // ---------------- a conversation ----------------
  const fmtWhen = (ts) => {
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    const html = document.documentElement.lang || undefined;
    return today ? d.toLocaleTimeString(html?.startsWith('ar') ? 'ar-EG-u-nu-latn' : html, { hour: '2-digit', minute: '2-digit' }) : fmtDate(ts, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const storyHTML = (s, id) => {
    const c = catById(s.cat);
    const pic = s.image && safeUrl(s.image) !== '#' ? `<img src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="dm-story-emoji" aria-hidden="true">${c.emoji}</span>`;
    return `<button type="button" class="dm-story" data-dstory="${id}">${pic}<span><b dir="auto">${esc(s.title)}</b><small>${esc(s.source || s.domain || '')}</small></span></button>`;
  };
  const duelCardHTML = (m) => `<button type="button" class="dm-duel" data-dduel="${m.duel}"><span class="dm-duel-icon" aria-hidden="true">⚔️</span><span><b>${m.mine ? t('You sent a Quiz Duel challenge') : t('Quiz Duel challenge!')}</b><small>${t('5 questions from today’s news · tap to play')}</small></span></button>`;
  const msgHTML = (m) => `<div class="dmsg${m.mine ? ' mine' : ''}${m.id === selected ? ' sel' : ''}" data-mid="${m.id}">
      <div class="dm-bubble${m.deleted ? ' deleted' : ''}${(m.story || m.duel) && !m.text ? ' only-story' : ''}" dir="auto">${m.deleted ? `<i>${t('Message deleted')}</i>` : `${m.text ? `<span>${esc(m.text).replace(/\n/g, '<br>')}</span>` : ''}${m.story ? storyHTML(m.story, m.id) : ''}${m.duel ? duelCardHTML(m) : ''}`}</div>
      ${m.myReact || m.theirReact ? `<span class="dm-reacts">${esc([m.theirReact, m.myReact].filter(Boolean).join(''))}</span>` : ''}
      ${m.deleted ? '' : `<div class="dm-actions glass">${REACTS.map((e) => `<button type="button" data-dreact="${e}" aria-pressed="${m.myReact === e}">${e}</button>`).join('')}${m.mine ? `<button type="button" data-dm="del-msg" aria-label="${esc(t('Delete message'))}">🗑️</button>` : ''}</div>`}
    </div>`;

  function renderConvo(scrollToEnd = false) {
    if (!cur) return;
    const o = cur.other;
    const who = $('#dmWho');
    who.dataset.user = o.username;
    who.innerHTML = `${lookHTML(o, { active: o.active })}<span><b dir="auto">${esc(o.nickname)}</b><small>${esc(activeText(o) || `@${o.username}`)}</small></span>`;
    $('#dmDuelBtn').hidden = !!(cur.blocked || cur.blockedMe || cur.request || (!cur.id && cur.canMessage === false));
    const st = $('#dmStreak');
    st.hidden = !(cur.streak >= 1);
    st.textContent = `🔥${cur.streak}`;
    st.title = t('{n}-day message streak — message each other every day to keep it going!', { n: cur.streak });
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    const sorted = [...msgs.values()].sort((a, b) => a.id - b.id);
    const lastMine = [...sorted].reverse().find((m) => m.mine && !m.deleted);
    let html = '';
    let prev = null;
    for (const m of sorted) {
      if (!prev || new Date(prev.created).toDateString() !== new Date(m.created).toDateString() || m.created - prev.created > 3600e3) html += `<div class="dm-time">${esc(fmtWhen(m.created))}</div>`;
      html += msgHTML(m);
      if (m === lastMine && cur.id) html += `<div class="dm-status">${m.id <= theirRead ? `${t('Seen')} ✓✓` : t('Sent')}</div>`;
      prev = m;
    }
    if (!sorted.length) {
      html = `<div class="dm-hello">${lookHTML(o, { cls: 'avatar-lg' })}<b dir="auto">${esc(o.nickname)}</b><small>@${esc(o.username)}</small>${o.bio ? `<p dir="auto">${esc(o.bio)}</p>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-user="${esc(o.username)}">${t('View profile')}</button></div>`;
    }
    log.innerHTML = html;
    if (scrollToEnd || near) log.scrollTop = log.scrollHeight;
    paintComposer();
  }

  function paintComposer() {
    const b = $('#dmBanner');
    const name = esc(cur.other.username);
    let html = '';
    let canType = true;
    if (cur.blocked) { html = `<p>${t('You blocked @{name}.', { name })}</p><div class="dm-banner-btns"><button type="button" class="btn btn-sm btn-ghost" data-dm="unblock">${t('Unblock')}</button></div>`; canType = false; }
    else if (cur.blockedMe) { html = `<p>${t('You can’t reply to this conversation.')}</p>`; canType = false; }
    else if (cur.request) {
      html = `<p>${t('@{name} wants to message you. They won’t know you’ve seen it until you accept.', { name })}</p>
        <div class="dm-banner-btns"><button type="button" class="btn btn-sm btn-primary" data-dm="accept">${t('Accept')}</button><button type="button" class="btn btn-sm btn-ghost" data-dm="delete-chat">${t('Delete')}</button><button type="button" class="btn btn-sm btn-ghost" data-dm="block">${t('Block')}</button></div>`;
      canType = false;
    } else if (!cur.id && cur.canMessage === false) { html = `<p>${t('@{name} isn’t taking messages from you right now.', { name })}</p>`; canType = false; }
    else if (cur.id && cur.pending) html = `<p class="small">${t('Message request sent. You can send up to 3 messages until @{name} accepts.', { name })}</p>`;
    b.innerHTML = html;
    b.hidden = !html;
    form.hidden = !canType;
    const sh = $('#dmShare');
    sh.hidden = !(share && canType);
    if (share && canType) sh.innerHTML = `${storyHTML(share, 'pending')}<button type="button" class="icon-btn" data-dm="unshare" aria-label="${esc(t('Don’t share this story'))}">✕</button>`;
  }

  function paintMenu() {
    const o = cur.other;
    $('#dmMenu').innerHTML = `
      <button type="button" role="menuitem" data-user="${esc(o.username)}">👤 ${t('View profile')}</button>
      ${cur.blocked ? `<button type="button" role="menuitem" data-dm="unblock">✅ ${t('Unblock')}</button>` : `<button type="button" role="menuitem" data-dm="block">🚫 ${t('Block')}</button>`}
      ${cur.id ? `<button type="button" role="menuitem" data-dm="report">🚩 ${t('Report')}</button><button type="button" role="menuitem" data-dm="delete-chat">🗑️ ${t('Delete chat')}</button>` : ''}`;
  }

  async function pollConvo({ fresh = false } = {}) {
    if (!cur?.id || busy) return;
    busy = true;
    const id = cur.id;
    try {
      const r = await auth.api(`/api/dm/${id}?since=${fresh ? 0 : since}`);
      if (!cur || cur.id !== id) return;
      if (fresh) msgs = new Map();
      let incoming = 0;
      for (const m of r.messages) { if (!fresh && !msgs.has(m.id) && !m.mine) incoming++; msgs.set(m.id, m); }
      since = r.now;
      theirRead = r.theirRead;
      cur = { ...cur, ...r.thread };
      renderConvo(fresh);
      if (incoming) sfx.blip();
      if (r.messages.length && !cur.request) { // reading clears the badge
        const th = threads.find((x) => x.id === id);
        if (th?.unread) { counts.unread = Math.max(0, counts.unread - th.unread); th.unread = 0; paintBadge(); }
      }
    } catch (e) {
      if (e.status === 404) { cur = null; renderInbox(); loadThreads(); }
    } finally { busy = false; }
  }

  function openThread(id, other = null) {
    const th = threads.find((x) => x.id === id);
    cur = { id, other: other || th?.other, streak: th?.streak || 0, request: !!th?.request, pending: !!th?.pending, blocked: false, blockedMe: false };
    msgs = new Map();
    since = 0;
    theirRead = 0;
    selected = 0;
    view('convo');
    log.innerHTML = '<div class="chat-empty"><span class="spin">✉️</span></div>';
    paintComposer();
    pollConvo({ fresh: true });
    schedule();
    if (!cur.request) setTimeout(() => input.focus({ preventScroll: true }), 120);
  }

  async function openWith(username, person = null) {
    if (!auth.user) { openAuth('signin'); return; }
    if (!loaded) await loadThreads();
    const th = threads.find((x) => x.other.username.toLowerCase() === String(username).toLowerCase());
    query = '';
    search.value = '';
    if (th) { openThread(th.id, th.other); return; }
    let other = person;
    if (!other || other.canMessage === undefined) {
      try { other = { ...(other || {}), ...(await auth.api(`/api/users/${encodeURIComponent(username)}`)) }; } catch (e) { toast(tServer(e.message), { emoji: '🤷' }); return; }
    }
    if (other.me) return;
    cur = { id: null, other, streak: 0, request: false, pending: false, blocked: !!other.blocked, blockedMe: false, canMessage: other.canMessage !== false };
    msgs = new Map();
    since = 0;
    theirRead = 0;
    view('convo');
    renderConvo(true);
    if (cur.canMessage) setTimeout(() => input.focus({ preventScroll: true }), 120);
  }

  function back() {
    cur = null;
    $('#dmMenu').hidden = true;
    renderInbox();
    loadThreads();
    schedule();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if ((!text && !share) || !cur) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const before = cur.streak || 0;
    try {
      const body = cur.id ? { thread: cur.id, text, storyKey: share?.key } : { to: cur.other.username, text, storyKey: share?.key };
      const r = await auth.api('/api/dm', { method: 'POST', body });
      if (!cur.id) cur.id = r.thread;
      msgs.set(r.message.id, r.message);
      cur.streak = r.streak;
      cur.pending = r.pending;
      input.value = '';
      share = null;
      renderConvo(true);
      sfx.pop();
      burstFrom(btn, { emojis: ['✉️', '💬', '✨'], count: 6, spread: 50 });
      if (r.streak >= 2 && r.streak > before) {
        toast(t('🔥 {n}-day streak with @{name}! Keep it going tomorrow.', { n: r.streak, name: cur.other.username }), { emoji: '🔥' });
        burstFrom($('#dmStreak'), { emojis: ['🔥'], count: 12 });
      }
      onSent?.();
      loadThreads();
      schedule();
    } catch (err) {
      toast(tServer(err.message), { emoji: err.status === 403 ? '🚫' : '😵', type: 'error', ms: 6000 });
      sfx.buzz();
    } finally {
      btn.disabled = false;
      input.focus({ preventScroll: true });
    }
  });

  async function act(what) {
    const o = cur?.other;
    if (!o) return;
    try {
      if (what === 'accept') {
        await auth.api('/api/dm/accept', { method: 'POST', body: { thread: cur.id } });
        cur.request = false;
        renderConvo(true);
        loadThreads();
        toast(t('Request accepted — say hi! 👋'), { emoji: '✉️' });
        input.focus();
      } else if (what === 'delete-chat') {
        if (!confirm(t('Delete this chat? It disappears from your messages (it comes back if they message you again).'))) return;
        await auth.api('/api/dm/hide', { method: 'POST', body: { thread: cur.id } });
        threads = threads.filter((x) => x.id !== cur.id);
        back();
      } else if (what === 'block') {
        if (!confirm(t('Block @{name}? They won’t be able to message you or find you, and you’ll stop following each other.', { name: o.username }))) return;
        await auth.api('/api/block', { method: 'POST', body: { username: o.username, block: true } });
        cur.blocked = true;
        cur.request = false;
        renderConvo();
        toast(t('@{name} is blocked.', { name: o.username }), { emoji: '🚫' });
      } else if (what === 'unblock') {
        await auth.api('/api/block', { method: 'POST', body: { username: o.username, block: false } });
        cur.blocked = false;
        if (!cur.id) cur.canMessage = true;
        renderConvo();
        toast(t('@{name} is unblocked.', { name: o.username }), { emoji: '✅' });
      } else if (what === 'report') {
        if (!confirm(t('Report @{name} for being mean, unsafe or spammy? They’ll be blocked too.', { name: o.username }))) return;
        await auth.api('/api/dm/report', { method: 'POST', body: { thread: cur.id } });
        cur.blocked = true;
        renderConvo();
        toast(t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' });
      }
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }

  async function react(id, emoji) {
    const m = msgs.get(id);
    if (!m) return;
    const next = m.myReact === emoji ? null : emoji;
    msgs.set(id, { ...m, myReact: next });
    selected = 0;
    renderConvo();
    try {
      const r = await auth.api('/api/dm/react', { method: 'POST', body: { id, emoji: next } });
      msgs.set(id, r.message);
      renderConvo();
      if (next) { const el = log.querySelector(`[data-mid="${id}"] .dm-reacts`); if (el) burstFrom(el, { emojis: [next], count: 6, spread: 34 }); sfx.pop(); }
    } catch (err) { msgs.set(id, m); renderConvo(); toast(tServer(err.message), { emoji: '😵' }); }
  }

  pane.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const menu = $('#dmMenu');
    if (!el.closest('[data-dm="menu"]') && !menu.hidden && !el.closest('#dmMenu')) menu.hidden = true;
    const th = el.closest('[data-thread]');
    if (th) return openThread(Number(th.dataset.thread));
    const to = el.closest('[data-dmto]');
    if (to) return openWith(to.dataset.dmto, (results || suggestions || []).find((p) => p.username === to.dataset.dmto));
    const dd = el.closest('[data-dduel]');
    if (dd) return openDuel?.(Number(dd.dataset.dduel));
    const story = el.closest('[data-dstory]');
    if (story) {
      const s = story.dataset.dstory === 'pending' ? share : msgs.get(Number(story.dataset.dstory))?.story;
      if (s) openStory?.(storyOf(s));
      return;
    }
    const r = el.closest('[data-dreact]');
    if (r) return react(Number(r.closest('[data-mid]').dataset.mid), r.dataset.dreact);
    const d = el.closest('[data-dm]');
    if (d) {
      const what = d.dataset.dm;
      if (what === 'back') return back();
      if (what === 'duel') return challenge?.(cur.other.username, cur.other);
      if (what === 'menu') { paintMenu(); menu.hidden = !menu.hidden; return; }
      if (what === 'requests' || what === 'requests-close') { showRequests = what === 'requests'; return renderInbox(); }
      if (what === 'unshare') { share = null; return cur ? paintComposer() : renderInbox(); }
      if (what === 'del-msg') {
        const id = Number(d.closest('[data-mid]').dataset.mid);
        if (!confirm(t('Delete this message for everyone?'))) return;
        try { await auth.api(`/api/dm/messages/${id}`, { method: 'DELETE' }); msgs.set(id, { ...msgs.get(id), deleted: true, text: '', story: null }); selected = 0; renderConvo(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
        return;
      }
      menu.hidden = true;
      return act(what);
    }
    const bubble = el.closest('.dmsg');
    if (bubble && !el.closest('.dm-actions')) {
      const id = Number(bubble.dataset.mid);
      if (msgs.get(id)?.deleted) return;
      selected = selected === id ? 0 : id;
      $$('.dmsg.sel', log).forEach((x) => x.classList.remove('sel'));
      if (selected) bubble.classList.add('sel');
    }
  });
  log.addEventListener('dblclick', (e) => { // double-tap a message to ❤️ it
    const bubble = e.target instanceof Element && e.target.closest('.dmsg');
    if (bubble && !bubble.querySelector('.deleted')) { e.preventDefault(); react(Number(bubble.dataset.mid), '❤️'); }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) { e.stopPropagation(); back(); } });

  // ---------------- polling ----------------
  function schedule() {
    clearTimeout(timer);
    if (!visible || !auth.user) return;
    const inConvo = !!cur?.id && !convo.hidden;
    timer = setTimeout(async () => {
      if (!document.hidden && visible) {
        if (cur?.id && !convo.hidden) await pollConvo();
        else if (!cur && !query) await loadThreads();
      }
      schedule();
    }, inConvo ? CONVO_MS : INBOX_MS);
  }
  async function pollBadge() {
    if (!auth.user || document.hidden || visible) return;
    try { counts = await auth.api('/api/dm?count=1'); paintBadge(); } catch { /* try later */ }
  }
  setInterval(pollBadge, BADGE_MS);
  setTimeout(pollBadge, 3500);

  function reset() {
    threads = []; loaded = false; counts = { unread: 0, requests: 0 }; cur = null; msgs = new Map(); share = null; suggestions = null; query = ''; search.value = '';
    paintBadge();
    if (visible) renderInbox();
  }
  auth.addEventListener('signin', () => { reset(); pollBadge(); });
  auth.addEventListener('signout', reset);

  return {
    show() {
      visible = true;
      if (!auth.user) { view('guest'); return; }
      if (cur) { view('convo'); if (cur.id) pollConvo({ fresh: !msgs.size }); else renderConvo(true); } else { renderInbox(); loadThreads(); }
      schedule();
    },
    hide() { visible = false; clearTimeout(timer); $('#dmMenu').hidden = true; },
    openWith,
    shareStory(item) {
      share = storyOf(item);
      if (cur && !cur.blocked && !cur.request) { view('convo'); paintComposer(); return; }
      cur = null;
      renderInbox();
      setTimeout(() => search.focus({ preventScroll: true }), 150);
    },
    inbox() { cur = null; showRequests = false; renderInbox(); loadThreads(); },
    refreshBadge: pollBadge,
  };
}
