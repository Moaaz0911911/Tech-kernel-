// ✉️ kerNEl Messages: private chats with message requests, "Seen", reactions, 🔥 streaks and shared stories,
// 👥 group chats, ✍️ "typing…", 🎙️ voice notes and 🫧 pops at the top. Also 🔍 people search (in Messages and on the Me tab).
import { $, $$, esc, timeAgo, toast, safeUrl } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer, fmtDate } from './i18n.js';
import { lookHTML, nameHTML, bubbleAttr } from './look.js';
import { canRecord, recordVoice, voiceHTML, initVoicePlayer, stopVoice, clock, VOICE_MAX_MS } from './voice.js';
import { groupAvatarHTML, systemText, initGroupTools } from './groups.js';
import { tradeMessageHTML, answerTrade } from './cards-ui.js';

const REACTS = ['❤️', '😂', '🔥', '👍', '😮', '😢'];
const INBOX_MS = 8000;    // refresh the inbox while it's open
const CONVO_MS = 2500;    // refresh a conversation while it's open
const BADGE_MS = 40000;   // light check for new messages
const TYPING_PING_MS = 3000;

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
    <div class="dm-pops" id="dmPops"><div id="popsRow"></div></div>
    <div class="dm-searchbar">
      <label class="people-search dm-search"><span class="sr-only">${t('Search people')}</span><span class="search-icon" aria-hidden="true">🔍</span><input id="dmSearch" type="search" placeholder="${esc(t('Search people to message…'))}" autocomplete="off" enterkeyhint="search"></label>
      <button type="button" class="icon-btn dm-newgroup" data-dm="new-group" title="${esc(t('New group'))}" aria-label="${esc(t('New group'))}">👥<small>+</small></button>
    </div>
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
    <form class="dm-pollform" id="dmPoll" hidden>
      <input name="q" maxlength="120" dir="auto" placeholder="${esc(t('Ask a question…'))}" aria-label="${esc(t('Poll question'))}">
      <div class="dm-pollopts">${[1, 2, 3, 4].map((n) => `<input name="o${n}" maxlength="40" dir="auto" placeholder="${esc(t('Answer {n}', { n }))}${n > 2 ? ` (${esc(t('optional'))})` : ''}">`).join('')}</div>
      <div class="dm-pollbtns"><button type="button" class="btn btn-sm btn-ghost" data-dm="poll-cancel">${t('Cancel')}</button><button class="btn btn-sm btn-primary">📊 ${t('Send poll')}</button></div>
    </form>
    <form class="chat-form dm-form" id="dmForm">
      <label class="sr-only" for="dmInput">${t('Message')}</label>
      <input id="dmInput" maxlength="1000" autocomplete="off" placeholder="${esc(t('Message…'))}" enterkeyhint="send">
      <button type="button" class="icon-btn dm-pollbtn" data-dm="poll" title="${esc(t('Make a poll'))}" aria-label="${esc(t('Make a poll'))}">📊</button>
      <button type="button" class="icon-btn dm-mic" data-dm="mic" title="${esc(t('Record a voice note'))}" aria-label="${esc(t('Record a voice note'))}">🎙️</button>
      <button type="submit" class="send-btn" aria-label="${esc(t('Send'))}">➤</button>
    </form>
    <div class="dm-rec" id="dmRec" hidden>
      <button type="button" class="icon-btn" data-dm="rec-cancel" aria-label="${esc(t('Delete recording'))}">🗑️</button>
      <span class="rec-dot" aria-hidden="true"></span>
      <span class="rec-time" id="dmRecTime">0:00</span>
      <span class="rec-meter" id="dmRecMeter" aria-hidden="true"></span>
      <button type="button" class="send-btn" data-dm="rec-send" aria-label="${esc(t('Send voice note'))}">➤</button>
    </div>
  </div>
  <div class="chat-guest" data-view="guest" hidden>
    <p>${t('Sign in to message people privately ✉️')}</p>
    <button type="button" class="btn btn-primary" data-cm="signup">${t('Sign up free')}</button>
    <button type="button" class="btn btn-ghost" data-cm="signin">${t('Sign in')}</button>
  </div>`;

export function initDM({ pane, onBadge, openAuth, openStory, onSent, openDuel, challenge, pops, openProfile }) {
  pane.innerHTML = SKELETON();
  initVoicePlayer();
  const inbox = pane.querySelector('[data-view="inbox"]');
  const convo = pane.querySelector('[data-view="convo"]');
  const guest = pane.querySelector('[data-view="guest"]');
  const list = $('#dmList');
  const search = $('#dmSearch');
  const log = $('#dmLog');
  const form = $('#dmForm');
  const input = $('#dmInput');
  const recBar = $('#dmRec');
  pops?.mountRow($('#popsRow'));
  const groupTools = initGroupTools({ openProfile, findPeople });

  let visible = false;
  let threads = [];
  let groups = [];
  let loaded = false;
  let counts = { unread: 0, requests: 0 };
  let showRequests = false;
  let cur = null;             // the open conversation: { kind: 'dm' | 'group', id, … }
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
  let typingSent = 0;         // when we last told the server we're typing
  let recording = null;       // an active voice recording

  const isGroup = () => cur?.kind === 'group';
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
    const l = th.last;
    const body = l.deleted ? t('Message deleted') : l.duel ? `⚔️ ${t('Quiz Duel challenge')}` : l.trade ? `🃏 ${t('Card trade')}` : l.poll ? `📊 ${t('Poll')}` : l.voice ? `🎙️ ${t('Voice note')}` : l.story && !l.text ? `📰 ${t('Shared a story')}` : l.text;
    return l.mine ? `${t('You')}: ${body}` : body;
  };
  const groupLast = (g) => {
    const l = g.last;
    if (!l) return tn(g.members, '{n} member', '{n} members');
    if (l.kind === 'system') return systemText(l.text);
    const body = l.deleted ? t('Message deleted') : l.poll ? `📊 ${t('Poll')}` : l.voice ? `🎙️ ${t('Voice note')}` : l.story && !l.text ? `📰 ${t('Shared a story')}` : l.text;
    return `${l.mine ? t('You') : `@${l.from}`}: ${body}`;
  };
  const threadRow = (th) => `<button type="button" class="dm-row${th.unread ? ' unread' : ''}" data-thread="${th.id}">
    ${lookHTML(th.other, { active: th.other.active })}
    <span class="dm-row-text"><b dir="auto">${esc(th.other.nickname)}</b><span class="dm-last" dir="auto">${esc(lastText(th))}</span></span>
    <span class="dm-meta"><time>${timeAgo(th.lastAt)}</time>${th.unread ? `<span class="dm-unread">${th.unread > 9 ? '9+' : th.unread}</span>` : th.streak >= 2 ? `<span class="dm-streak">🔥${th.streak}</span>` : th.pending && th.last?.mine ? `<small>${t('Request sent')}</small>` : ''}</span>
  </button>`;
  const groupRow = (g) => `<button type="button" class="dm-row${g.unread && !g.muted ? ' unread' : ''}" data-group="${g.id}">
    ${groupAvatarHTML(g)}
    <span class="dm-row-text"><b dir="auto">${esc(g.name)}</b><span class="dm-last" dir="auto">${esc(groupLast(g))}</span></span>
    <span class="dm-meta"><time>${timeAgo(g.lastAt)}</time>${g.unread ? `<span class="dm-unread${g.muted ? ' muted' : ''}">${g.unread > 9 ? '9+' : g.unread}</span>` : g.muted ? `<small title="${esc(t('Muted'))}">🔕</small>` : ''}</span>
  </button>`;

  function renderInbox() {
    if (!auth.user) return view('guest');
    view('inbox');
    $('#dmPops').hidden = !!query || showRequests || !pops;
    const hint = $('#dmShareHint');
    hint.hidden = !share;
    if (share) hint.innerHTML = `<span>📰 ${t('Pick who to send “{title}” to', { title: esc(share.title.slice(0, 70)) })}</span><button type="button" class="icon-btn" data-dm="unshare" aria-label="${esc(t('Don’t share this story'))}">✕</button>`;
    if (query) {
      const q = query.toLowerCase();
      const gs = groups.filter((g) => g.name.toLowerCase().includes(q));
      list.innerHTML = (gs.length ? gs.map(groupRow).join('') : '') + (results === null
        ? `<p class="muted small dm-note">${t('Looking…')}</p>`
        : results.length ? results.map((p) => personHTML(p, { pick: 'data-dmto' })).join('') : gs.length ? '' : `<p class="muted small dm-note">${t('No kernels found for “{q}”', { q: esc(query) })}</p>`);
      return;
    }
    if (!loaded) { list.innerHTML = '<div class="chat-empty"><span class="spin">✉️</span></div>'; return; }
    const reqs = threads.filter((x) => x.request);
    const main = [...threads.filter((x) => !x.request).map((x) => ({ at: x.lastAt, html: threadRow(x) })), ...groups.map((g) => ({ at: g.lastAt, html: groupRow(g) }))].sort((a, b) => b.at - a.at);
    let html = '';
    if (showRequests) {
      html += `<button type="button" class="dm-reqbar" data-dm="requests-close">‹ ${t('Message requests')}</button>
        <p class="muted small dm-note">${t('Requests are from people you don’t follow. They won’t know you’ve seen them until you accept.')}</p>`;
      html += reqs.length ? reqs.map(threadRow).join('') : `<p class="muted small dm-note">${t('No requests right now.')}</p>`;
    } else {
      if (reqs.length) html += `<button type="button" class="dm-reqbar" data-dm="requests">📨 ${tn(reqs.length, '{n} message request', '{n} message requests')} <span aria-hidden="true">›</span></button>`;
      if (main.length) html += main.map((x) => x.html).join('');
      else {
        html += `<div class="chat-empty dm-empty"><span>✉️</span><p>${t('No messages yet. Search for someone to say hi 👋')}</p><button type="button" class="btn btn-ghost btn-sm" data-dm="new-group">👥 ${t('Start a group')}</button></div>`;
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
      groups = r.groups || [];
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
  const popReplyHTML = (p, mine) => {
    const thumb = p.kind === 'photo' && p.photo
      ? `<img src="${esc(`${auth.apiBase}/api/pops/photo/${encodeURIComponent(p.photo)}`)}" alt="" loading="lazy" onerror="this.remove()">`
      : p.kind === 'story' ? '<span aria-hidden="true">📰</span>' : `<span dir="auto">${esc(p.text.slice(0, 24))}</span>`;
    return `<span class="dm-popreply"><span class="dm-popthumb pop-bg-${(Number(p.bg) || 0) % 8}">${thumb}</span><small>🫧 ${mine ? t('You replied to their pop') : t('Replied to your pop')}${p.story ? `<br><span dir="auto">${esc(p.story.slice(0, 60))}</span>` : ''}</small></span>`;
  };
  const pollHTML = (m) => {
    const p = m.poll;
    const total = p.total || 0;
    return `<div class="dm-poll"><b dir="auto">📊 ${esc(p.q)}</b>${p.options.map((o, i) => {
      const n = p.counts?.[i] || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<button type="button" class="dm-pollopt${p.mine === i ? ' on' : ''}" data-dpoll="${m.id}:${i}" aria-pressed="${p.mine === i}"><i style="width:${pct}%"></i><span dir="auto">${esc(o)}</span><small>${n}</small></button>`;
    }).join('')}<small>${tn(total, '{n} vote', '{n} votes')}${p.mine == null ? ` · ${t('tap to vote')}` : ''}</small></div>`;
  };
  const bubbleInner = (m) => {
    if (m.deleted) return `<i>${t('Message deleted')}</i>`;
    if (m.hidden) return `<i>🚩 ${t('Hidden after reports')}</i>`;
    return `${m.pop ? popReplyHTML(m.pop, m.mine) : ''}${m.text ? `<span>${esc(m.text).replace(/\n/g, '<br>')}</span>` : ''}${m.voice ? voiceHTML(m.voice) : ''}${m.story ? storyHTML(m.story, m.id) : ''}${m.duel ? duelCardHTML(m) : ''}${m.trade ? tradeMessageHTML(m, cur.trades?.[m.trade]) : ''}${m.poll ? pollHTML(m) : ''}`;
  };
  const reactsHTML = (m) => {
    if (isGroup()) {
      const e = Object.entries(m.reacts || {});
      return e.length ? `<span class="dm-reacts">${e.map(([k, n]) => `${esc(k)}${n > 1 ? `<small>${n}</small>` : ''}`).join('')}</span>` : '';
    }
    return m.myReact || m.theirReact ? `<span class="dm-reacts">${esc([m.theirReact, m.myReact].filter(Boolean).join(''))}</span>` : '';
  };
  const msgHTML = (m, from = '') => {
    if (m.kind === 'system') return `<div class="dm-sys" dir="auto">${esc(systemText(m.system))}</div>`;
    const gone = m.deleted || m.hidden;
    const card = (m.story || m.duel || m.trade || m.poll) && !m.text && !m.voice;
    const actions = m.mine
      ? `<button type="button" data-dm="del-msg" aria-label="${esc(t('Delete message'))}">🗑️</button>`
      : isGroup() ? `<button type="button" data-dm="report-msg" aria-label="${esc(t('Report message'))}">🚩</button>` : '';
    const sender = m.mine ? auth.getProfile() : isGroup() ? cur.authors?.[m.from] : cur.other;
    return `<div class="dmsg${m.mine ? ' mine' : ''}${m.id === selected ? ' sel' : ''}" data-mid="${m.id}"${bubbleAttr(sender)}>${from}
      <div class="dm-bubble${gone ? ' deleted' : ''}${card ? ' only-story' : ''}${m.voice && !m.text && !gone ? ' only-voice' : ''}" dir="auto">${bubbleInner(m)}</div>
      ${reactsHTML(m)}
      ${gone ? '' : `<div class="dm-actions glass">${REACTS.map((e) => `<button type="button" data-dreact="${e}" aria-pressed="${m.myReact === e}">${e}</button>`).join('')}${actions}</div>`}
    </div>`;
  };

  function headerHTML() {
    if (isGroup()) {
      const g = cur.group;
      const faces = cur.members.filter((m) => !m.me).slice(0, 2);
      const typing = cur.typing?.length
        ? (cur.typing.length === 1 ? t('{name} is typing…', { name: cur.typing[0].nickname }) : t('{n} people are typing…', { n: cur.typing.length }))
        : cur.members.length ? tn(cur.members.length, '{n} member', '{n} members') : '';
      return `${groupAvatarHTML({ ...g, faces })}<span><b dir="auto">${esc(g.name)}${g.muted ? ' 🔕' : ''}</b><small class="${cur.typing?.length ? 'is-typing' : ''}">${esc(typing)}</small></span>`;
    }
    const o = cur.other;
    return `${lookHTML(o, { active: o.active })}<span><b dir="auto">${esc(o.nickname)}</b><small class="${cur.typing ? 'is-typing' : ''}">${esc(cur.typing ? t('typing…') : activeText(o) || `@${o.username}`)}</small></span>`;
  }

  function renderConvo(scrollToEnd = false) {
    if (!cur) return;
    const who = $('#dmWho');
    who.innerHTML = headerHTML();
    if (isGroup()) { delete who.dataset.user; who.dataset.dm = 'group-info'; who.title = t('Group info'); } else { who.dataset.user = cur.other.username; delete who.dataset.dm; who.title = ''; }
    $('#dmDuelBtn').hidden = isGroup() || !!(cur.blocked || cur.blockedMe || cur.request || (!cur.id && cur.canMessage === false));
    const st = $('#dmStreak');
    st.hidden = isGroup() || !(cur.streak >= 1);
    st.textContent = `🔥${cur.streak || 0}`;
    st.title = t('{n}-day message streak — message each other every day to keep it going!', { n: cur.streak || 0 });
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    const sorted = [...msgs.values()].sort((a, b) => a.id - b.id);
    const lastMine = [...sorted].reverse().find((m) => m.mine && !m.deleted && m.kind !== 'system');
    let html = '';
    let prev = null;
    for (const m of sorted) {
      if (!prev || new Date(prev.created).toDateString() !== new Date(m.created).toDateString() || m.created - prev.created > 3600e3) html += `<div class="dm-time">${esc(fmtWhen(m.created))}</div>`;
      let from = '';
      if (isGroup() && !m.mine && m.kind !== 'system' && (prev?.from !== m.from || prev?.kind === 'system' || m.created - prev.created > 3600e3)) {
        const a = cur.authors[m.from] || cur.members.find((x) => x.username === m.from) || { username: m.from, nickname: m.from };
        from = `<button type="button" class="dm-from" data-user="${esc(m.from || '')}">${lookHTML(a)}${nameHTML(a)}</button>`;
      }
      html += msgHTML(m, from);
      if (m === lastMine && cur.id) html += `<div class="dm-status">${seenText(m)}</div>`;
      prev = m;
    }
    if (!sorted.length) {
      if (isGroup()) html = `<div class="dm-hello">${groupAvatarHTML({ ...cur.group, faces: [] }, { cls: 'gav-lg' })}<b dir="auto">${esc(cur.group.name)}</b><p>${t('Say hi to the group 👋')}</p></div>`;
      else {
        const o = cur.other;
        html = `<div class="dm-hello">${lookHTML(o, { cls: 'avatar-lg' })}<b dir="auto">${esc(o.nickname)}</b><small>@${esc(o.username)}</small>${o.bio ? `<p dir="auto">${esc(o.bio)}</p>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-user="${esc(o.username)}">${t('View profile')}</button></div>`;
      }
    }
    const typers = isGroup() ? cur.typing || [] : cur.typing ? [cur.other] : [];
    if (typers.length) html += `<div class="dmsg dm-typing-row" aria-label="${esc(t('typing…'))}">${isGroup() ? lookHTML(typers[0]) : ''}<div class="dm-bubble dm-typing"><i></i><i></i><i></i></div></div>`;
    log.innerHTML = html;
    if (scrollToEnd || near) log.scrollTop = log.scrollHeight;
    paintComposer();
  }

  function seenText(m) {
    if (!isGroup()) return m.id <= theirRead ? `${t('Seen')} ✓✓` : t('Sent');
    const others = cur.members.filter((x) => !x.me);
    const seen = others.filter((x) => x.readId >= m.id);
    if (!seen.length) return t('Sent');
    if (seen.length === others.length) return `${t('Seen by everyone')} ✓✓`;
    return `${t('Seen by {names}', { names: seen.slice(0, 3).map((x) => x.nickname).join(', ') + (seen.length > 3 ? ` +${seen.length - 3}` : '') })} ✓✓`;
  }

  function paintComposer() {
    const b = $('#dmBanner');
    let html = '';
    let canType = true;
    if (!isGroup()) {
      const name = esc(cur.other.username);
      if (cur.blocked) { html = `<p>${t('You blocked @{name}.', { name })}</p><div class="dm-banner-btns"><button type="button" class="btn btn-sm btn-ghost" data-dm="unblock">${t('Unblock')}</button></div>`; canType = false; }
      else if (cur.blockedMe) { html = `<p>${t('You can’t reply to this conversation.')}</p>`; canType = false; }
      else if (cur.request) {
        html = `<p>${t('@{name} wants to message you. They won’t know you’ve seen it until you accept.', { name })}</p>
          <div class="dm-banner-btns"><button type="button" class="btn btn-sm btn-primary" data-dm="accept">${t('Accept')}</button><button type="button" class="btn btn-sm btn-ghost" data-dm="delete-chat">${t('Delete')}</button><button type="button" class="btn btn-sm btn-ghost" data-dm="block">${t('Block')}</button></div>`;
        canType = false;
      } else if (!cur.id && cur.canMessage === false) { html = `<p>${t('@{name} isn’t taking messages from you right now.', { name })}</p>`; canType = false; }
      else if (cur.id && cur.pending) html = `<p class="small">${t('Message request sent. You can send up to 3 messages until @{name} accepts.', { name })}</p>`;
    }
    b.innerHTML = html;
    b.hidden = !html;
    form.hidden = !canType || !!recording;
    recBar.hidden = !recording || !canType;
    form.classList.toggle('has-text', !!input.value.trim() || !!share);
    $('.dm-mic', form).hidden = !canRecord();
    const sh = $('#dmShare');
    sh.hidden = !(share && canType);
    if (share && canType) sh.innerHTML = `${storyHTML(share, 'pending')}<button type="button" class="icon-btn" data-dm="unshare" aria-label="${esc(t('Don’t share this story'))}">✕</button>`;
  }

  function paintMenu() {
    if (isGroup()) {
      $('#dmMenu').innerHTML = `
        <button type="button" role="menuitem" data-dm="group-info">👥 ${t('Group info')}</button>
        <button type="button" role="menuitem" data-dm="group-add">➕ ${t('Add people')}</button>
        <button type="button" role="menuitem" data-dm="${cur.group.muted ? 'group-unmute' : 'group-mute'}">${cur.group.muted ? `🔔 ${t('Unmute')}` : `🔕 ${t('Mute notifications')}`}</button>
        <button type="button" role="menuitem" data-dm="group-leave">🚪 ${t('Leave group')}</button>`;
      return;
    }
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
    const kind = cur.kind;
    try {
      const r = await auth.api(`${kind === 'group' ? '/api/groups' : '/api/dm'}/${id}?since=${fresh ? 0 : since}`);
      if (!cur || cur.id !== id || cur.kind !== kind) return;
      if (fresh) msgs = new Map();
      let incoming = 0;
      for (const m of r.messages) { if (!fresh && !msgs.has(m.id) && !m.mine && m.kind !== 'system') incoming++; msgs.set(m.id, m); }
      since = r.now;
      if (kind === 'group') cur = { ...cur, group: { ...cur.group, ...r.group }, members: r.members, authors: { ...cur.authors, ...r.authors }, typing: r.typing };
      else { theirRead = r.theirRead; cur = { ...cur, ...r.thread, typing: !!r.typing, trades: { ...(cur.trades || {}), ...(r.trades || {}) } }; }
      renderConvo(fresh);
      if (incoming) sfx.blip();
      if (r.messages.length && !cur.request) { // reading clears the badge
        const row = kind === 'group' ? groups.find((x) => x.id === id) : threads.find((x) => x.id === id);
        if (row?.unread) { if (!row.muted) counts.unread = Math.max(0, counts.unread - row.unread); row.unread = 0; paintBadge(); }
      }
    } catch (e) {
      if (e.status === 404) { cur = null; renderInbox(); loadThreads(); }
    } finally { busy = false; }
  }

  function startConvo(next) {
    $('#dmPoll').hidden = true;
    cancelRecording();
    stopVoice();
    cur = next;
    msgs = new Map();
    since = 0;
    theirRead = 0;
    selected = 0;
    typingSent = 0;
    view('convo');
  }

  function openThread(id, other = null) {
    const th = threads.find((x) => x.id === id);
    startConvo({ kind: 'dm', id, other: other || th?.other, streak: th?.streak || 0, request: !!th?.request, pending: !!th?.pending, blocked: false, blockedMe: false, typing: false });
    log.innerHTML = '<div class="chat-empty"><span class="spin">✉️</span></div>';
    paintComposer();
    pollConvo({ fresh: true });
    schedule();
    if (!cur.request) setTimeout(() => input.focus({ preventScroll: true }), 120);
  }

  function openGroup(id) {
    const g = groups.find((x) => x.id === id);
    startConvo({ kind: 'group', id, group: g ? { id, name: g.name, emoji: g.emoji, muted: g.muted } : { id, name: '…', emoji: '👥', muted: false }, members: [], authors: {}, typing: [] });
    log.innerHTML = '<div class="chat-empty"><span class="spin">👥</span></div>';
    renderConvo(true);
    log.innerHTML = '<div class="chat-empty"><span class="spin">👥</span></div>';
    pollConvo({ fresh: true });
    schedule();
    setTimeout(() => input.focus({ preventScroll: true }), 120);
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
    startConvo({ kind: 'dm', id: null, other, streak: 0, request: false, pending: false, blocked: !!other.blocked, blockedMe: false, canMessage: other.canMessage !== false, typing: false });
    renderConvo(true);
    if (cur.canMessage) setTimeout(() => input.focus({ preventScroll: true }), 120);
  }

  function back() {
    cancelRecording();
    stopVoice();
    if (cur?.id && typingSent) sendTyping(false);
    cur = null;
    $('#dmMenu').hidden = true;
    renderInbox();
    loadThreads();
    schedule();
  }

  /** Send a message (text and/or a shared story, or a voice note) to the open chat. */
  async function send(extra = {}) {
    const special = !!(extra.voice || extra.poll); // a voice note or a poll goes on its own
    const text = special ? '' : input.value.trim();
    const story = special ? null : share;
    const before = cur.streak || 0;
    const target = cur;
    const payload = { text, storyKey: story?.key, ...extra };
    let r;
    if (isGroup()) r = await auth.api(`/api/groups/${cur.id}/messages`, { method: 'POST', body: payload });
    else r = await auth.api('/api/dm', { method: 'POST', body: cur.id ? { thread: cur.id, ...payload } : { to: cur.other.username, ...payload } });
    if (cur !== target) return;
    if (!isGroup()) {
      if (!cur.id) cur.id = r.thread;
      cur.streak = r.streak;
      cur.pending = r.pending;
    }
    msgs.set(r.message.id, r.message);
    typingSent = 0;
    if (!special) { input.value = ''; share = null; }
    renderConvo(true);
    sfx.pop();
    if (!isGroup() && r.streak >= 2 && r.streak > before) {
      toast(t('🔥 {n}-day streak with @{name}! Keep it going tomorrow.', { n: r.streak, name: cur.other.username }), { emoji: '🔥' });
      burstFrom($('#dmStreak'), { emojis: ['🔥'], count: 12 });
    }
    onSent?.();
    loadThreads();
    schedule();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if ((!text && !share) || !cur) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await send();
      burstFrom(btn, { emojis: ['✉️', '💬', '✨'], count: 6, spread: 50 });
    } catch (err) {
      toast(tServer(err.message), { emoji: err.status === 403 ? '🚫' : '😵', type: 'error', ms: 6000 });
      sfx.buzz();
    } finally {
      btn.disabled = false;
      input.focus({ preventScroll: true });
    }
  });

  $('#dmPoll').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const q = f.elements.q.value.trim();
    const options = [1, 2, 3, 4].map((n) => f.elements[`o${n}`].value.trim()).filter(Boolean);
    if (!q || options.length < 2) { toast(t('Write a question and at least two answers'), { emoji: '📊' }); return; }
    try {
      await send({ poll: { q, options } });
      f.reset();
      f.hidden = true;
      burstFrom($('.dm-pollbtn', form), { emojis: ['📊', '✨'], count: 8, spread: 40 });
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  });

  // ---------------- ✍️ typing ----------------
  function sendTyping(on) {
    if (!cur?.id) return;
    typingSent = on ? Date.now() : 0;
    const body = isGroup() ? { group: cur.id, stop: !on } : { thread: cur.id, stop: !on };
    auth.api(isGroup() ? '/api/groups/typing' : '/api/dm/typing', { method: 'POST', body }).catch(() => {});
  }
  input.addEventListener('input', () => {
    form.classList.toggle('has-text', !!input.value.trim() || !!share);
    if (!cur?.id) return;
    if (input.value.trim()) { if (Date.now() - typingSent > TYPING_PING_MS) sendTyping(true); } else if (typingSent) sendTyping(false);
  });
  input.addEventListener('blur', () => { if (typingSent && Date.now() - typingSent < 6000 && !input.value.trim()) sendTyping(false); });

  // ---------------- 🎙️ voice notes ----------------
  const meter = $('#dmRecMeter');
  async function startRecording() {
    if (recording || !cur) return;
    stopVoice();
    meter.innerHTML = '';
    $('#dmRecTime').textContent = `0:00 / ${clock(VOICE_MAX_MS)}`;
    try {
      recording = 'starting';
      const r = await recordVoice({
        onLevel: (lvl) => {
          const bar = document.createElement('i');
          bar.style.setProperty('--h', `${Math.max(10, Math.round(lvl * 100))}%`);
          meter.append(bar);
          while (meter.children.length > 40) meter.firstChild.remove();
        },
        onTick: (ms) => { $('#dmRecTime').textContent = `${clock(ms)} / ${clock(VOICE_MAX_MS)}`; },
        onMax: () => finishRecording(true),
      });
      if (recording !== 'starting') { r.cancel(); return; } // cancelled while asking for the mic
      recording = r;
      sfx.blip();
      paintComposer();
    } catch (err) {
      recording = null;
      paintComposer();
      toast(err.message, { emoji: '🎙️', ms: 5000 });
    }
  }
  async function finishRecording(auto = false) {
    const r = recording;
    if (!r || r === 'starting') return;
    recording = null;
    paintComposer();
    try {
      const clip = await r.stop();
      if (!clip) { toast(t('Hold on — say a bit more 🎙️'), { emoji: '🎙️' }); return; }
      if (auto) toast(t('30 seconds max — sending it now 🎙️'), { emoji: '🎙️' });
      await send(clip);
    } catch (err) { toast(tServer(err.message), { emoji: '😵', type: 'error' }); sfx.buzz(); }
  }
  function cancelRecording() {
    if (!recording) return;
    if (recording !== 'starting') recording.cancel();
    recording = null;
    if (cur) paintComposer();
  }

  async function act(what) {
    if (isGroup()) return groupAct(what);
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

  async function groupAct(what) {
    const g = cur.group;
    const hooks = { onChanged: () => pollConvo({ fresh: true }), onLeft: () => { groups = groups.filter((x) => x.id !== g.id); back(); } };
    try {
      if (what === 'group-info') groupTools.settings({ group: g, members: cur.members }, hooks);
      else if (what === 'group-add') groupTools.addPeople({ group: g, members: cur.members }, hooks);
      else if (what === 'group-mute' || what === 'group-unmute') {
        const muted = what === 'group-mute';
        await auth.api('/api/groups/mute', { method: 'POST', body: { group: g.id, muted } });
        cur.group.muted = muted;
        const row = groups.find((x) => x.id === g.id);
        if (row) row.muted = muted;
        renderConvo();
        toast(muted ? t('Group muted 🔕') : t('Group unmuted 🔔'), { emoji: muted ? '🔕' : '🔔' });
      } else if (what === 'group-leave') {
        if (!confirm(t('Leave “{name}”? You won’t get its messages anymore.', { name: g.name }))) return;
        await auth.api('/api/groups/remove', { method: 'POST', body: { group: g.id } });
        toast(t('You left the group.'), { emoji: '🚪' });
        hooks.onLeft();
      }
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }

  async function react(id, emoji) {
    const m = msgs.get(id);
    if (!m || m.hidden) return;
    const next = m.myReact === emoji ? null : emoji;
    const optimistic = { ...m, myReact: next };
    if (isGroup()) {
      const reacts = { ...(m.reacts || {}) };
      if (m.myReact) { reacts[m.myReact] = (reacts[m.myReact] || 1) - 1; if (!reacts[m.myReact]) delete reacts[m.myReact]; }
      if (next) reacts[next] = (reacts[next] || 0) + 1;
      optimistic.reacts = reacts;
    }
    msgs.set(id, optimistic);
    selected = 0;
    renderConvo();
    try {
      const r = await auth.api(isGroup() ? '/api/groups/react' : '/api/dm/react', { method: 'POST', body: { id, emoji: next } });
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
    const gr = el.closest('[data-group]');
    if (gr) return openGroup(Number(gr.dataset.group));
    const to = el.closest('[data-dmto]');
    if (to) return openWith(to.dataset.dmto, (results || suggestions || []).find((p) => p.username === to.dataset.dmto));
    const pv = el.closest('[data-dpoll]');
    if (pv) {
      const [id, option] = pv.dataset.dpoll.split(':').map(Number);
      try {
        const r = await auth.api('/api/chatpoll', { method: 'POST', body: { scope: isGroup() ? 'g' : 'd', id, option } });
        const m = msgs.get(id);
        if (m) msgs.set(id, { ...m, poll: r.poll });
        renderConvo();
        sfx.pop();
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    const kt = el.closest('[data-ktrade]');
    if (kt) {
      const [id, what] = kt.dataset.ktrade.split(':');
      kt.disabled = true;
      try { const r = await answerTrade(Number(id), what); if (cur?.trades?.[id]) cur.trades[id] = { ...cur.trades[id], status: r.status }; renderConvo(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); kt.disabled = false; }
      return;
    }
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
      if (what === 'new-group') return groupTools.create(async (id) => { query = ''; search.value = ''; await loadThreads(); openGroup(id); });
      if (what === 'duel') return challenge?.(cur.other.username, cur.other);
      if (what === 'menu') { paintMenu(); menu.hidden = !menu.hidden; return; }
      if (what === 'requests' || what === 'requests-close') { showRequests = what === 'requests'; return renderInbox(); }
      if (what === 'unshare') { share = null; return cur ? paintComposer() : renderInbox(); }
      if (what === 'mic') return startRecording();
      if (what === 'poll' || what === 'poll-cancel') { const f = $('#dmPoll'); f.hidden = what === 'poll-cancel' || !f.hidden; if (!f.hidden) f.elements.q.focus(); return; }
      if (what === 'rec-cancel') return cancelRecording();
      if (what === 'rec-send') return finishRecording();
      if (what === 'del-msg') {
        const id = Number(d.closest('[data-mid]').dataset.mid);
        if (!confirm(t('Delete this message for everyone?'))) return;
        try {
          await auth.api(isGroup() ? `/api/groups/messages/${id}` : `/api/dm/messages/${id}`, { method: 'DELETE' });
          msgs.set(id, { ...msgs.get(id), deleted: true, text: '', story: null, voice: null, pop: null });
          selected = 0;
          renderConvo();
        } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
        return;
      }
      if (what === 'report-msg') {
        const id = Number(d.closest('[data-mid]').dataset.mid);
        if (!confirm(t('Report this message for being mean, unsafe or spammy?'))) return;
        try { await auth.api('/api/groups/report', { method: 'POST', body: { id } }); selected = 0; renderConvo(); toast(t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' }); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
        return;
      }
      menu.hidden = true;
      return act(what);
    }
    const bubble = el.closest('.dmsg');
    if (bubble && !el.closest('.dm-actions') && !bubble.classList.contains('dm-typing-row')) {
      const id = Number(bubble.dataset.mid);
      const m = msgs.get(id);
      if (!m || m.deleted || m.hidden) return;
      selected = selected === id ? 0 : id;
      $$('.dmsg.sel', log).forEach((x) => x.classList.remove('sel'));
      if (selected) bubble.classList.add('sel');
    }
  });
  log.addEventListener('dblclick', (e) => { // double-tap a message to ❤️ it
    const bubble = e.target instanceof Element && e.target.closest('.dmsg');
    if (bubble && bubble.dataset.mid && !bubble.querySelector('.deleted') && !e.target.closest('.vn')) { e.preventDefault(); react(Number(bubble.dataset.mid), '❤️'); }
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
    cancelRecording();
    stopVoice();
    threads = []; groups = []; loaded = false; counts = { unread: 0, requests: 0 }; cur = null; msgs = new Map(); share = null; suggestions = null; query = ''; search.value = '';
    paintBadge();
    if (visible) renderInbox();
  }
  auth.addEventListener('signin', () => { reset(); pollBadge(); });
  auth.addEventListener('signout', reset);

  return {
    show() {
      visible = true;
      if (!auth.user) { view('guest'); return; }
      if (cur) { view('convo'); if (cur.id) pollConvo({ fresh: !msgs.size }); else renderConvo(true); } else { renderInbox(); loadThreads(); pops?.refresh(); }
      schedule();
    },
    hide() { visible = false; clearTimeout(timer); $('#dmMenu').hidden = true; cancelRecording(); stopVoice(); },
    openWith,
    async openGroup(id) {
      if (!auth.user) { openAuth('signin'); return; }
      if (!loaded) await loadThreads();
      openGroup(Number(id));
    },
    shareStory(item) {
      share = storyOf(item);
      if (cur && !cur.blocked && !cur.request) { view('convo'); paintComposer(); return; }
      cur = null;
      renderInbox();
      setTimeout(() => search.focus({ preventScroll: true }), 150);
    },
    inbox() { if (cur) back(); showRequests = false; renderInbox(); loadThreads(); },
    refreshBadge: pollBadge,
  };
}
