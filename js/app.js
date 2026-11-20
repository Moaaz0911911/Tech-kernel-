// kerNEl — main page controller.
import { CONFIG } from './config.js';
import { $, $$, esc, safeUrl, timeAgo, compact, hash, pick, debounce, store, toast } from './utils.js';
import { NewsFeed, CATEGORIES, catById, hotness, searchLocal, trends } from './news.js';
import { auth, passwordStrength, USERNAME_RE } from './auth.js';
import { sfx, burst, burstFrom, rain, onKonami, initDoomscroll } from './fun.js';
import { initCodme } from './codme.js';
import { initCommunity } from './community.js';
import { JOKES, FACTS, LOADING_LINES, emojify } from './content.js';

const REFRESH = Math.max(10, Number(CONFIG.refreshSeconds) || 30);
const PAGE = 24;
const RING = 2 * Math.PI * 18;
const REACTS = [
  { id: 'fire', emoji: '🔥', label: 'This is fire' },
  { id: 'lol', emoji: '😂', label: 'LOL' },
  { id: 'mind', emoji: '🤯', label: 'Mind blown' },
  { id: 'meh', emoji: '🥱', label: 'Meh' },
];
const RANKS = [
  [0, 'Unpopped Kernel', '🌽'],
  [50, 'Warm Kernel', '♨️'],
  [150, 'Sizzling Kernel', '🔥'],
  [300, 'Freshly Popped', '🍿'],
  [600, 'Butter Baron', '🧈'],
  [1000, 'Popcorn Overlord', '👑'],
  [2000, 'Galactic Snack Deity', '🌌'],
];
const AVATARS = ['🍿', '🤖', '👾', '🦄', '🐱', '🦊', '🐸', '🦖', '🐙', '🧠', '🚀', '👻', '🥔', '🌮', '🐧', '🦀'];

const feed = new NewsFeed();
const state = { cat: 'all', sort: store.get('sort', 'newest'), query: '', limit: PAGE, chaosSeed: Math.random() };
const extraItems = new Map(); // stories codme pulled from the archive (so they can be saved too)
let nextAt = Date.now();
let heroSig = '';
let tickerSig = '';
let codme = null;
let community = null;

// ====================================================================================
// Per-profile data (guest or account). Accounts also save it on the kerNEl server.
// ====================================================================================
const blankData = () => ({ xp: 0, read: [], saved: [], reactions: {}, konami: false, badges: {}, codmeAsks: 0, chatSent: 0, pollVotes: 0, streak: 0, bestStreak: 0 });
const getData = () => ({ ...blankData(), ...store.get(`data:${auth.profileKey()}`, {}) });
let syncTimer = 0;
const setData = (d) => {
  store.set(`data:${auth.profileKey()}`, d);
  if (auth.user?.apiToken) { // keep the account in sync across devices (debounced)
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const { streak, bestStreak, ...rest } = getData(); // streaks are kept by the server itself
      auth.api('/api/me/data', { method: 'PATCH', body: { ...rest, settings: currentSettings() } }).catch(() => {});
    }, 1500);
  }
};

/** Combine this browser's data with the account's data on the server (nothing is lost). */
function mergeData(local, server) {
  if (!server) return local;
  const keys = new Set();
  const saved = [...(server.saved || []), ...(local.saved || [])].filter((x) => x?.key && !keys.has(x.key) && keys.add(x.key)).slice(0, 200);
  return {
    ...local,
    xp: Math.max(local.xp || 0, server.xp || 0),
    read: [...new Set([...(server.read || []), ...(local.read || [])])].slice(-600),
    saved,
    reactions: { ...(server.reactions || {}), ...(local.reactions || {}) },
    konami: !!(local.konami || server.konami),
    badges: { ...(server.badges || {}), ...(local.badges || {}) },
    codmeAsks: Math.max(local.codmeAsks || 0, server.codmeAsks || 0),
    chatSent: Math.max(local.chatSent || 0, server.chatSent || 0),
    pollVotes: Math.max(local.pollVotes || 0, server.pollVotes || 0),
  };
}

/** Things the account remembers outside the news data: settings and kids' progress. */
function applyServerExtras(user) {
  const data = user?.data || {};
  const st = data.settings;
  if (st?.theme && st.theme !== document.documentElement.dataset.theme) { store.set('theme', st.theme); applyTheme(st.theme); }
  if (st && typeof st.sound === 'boolean' && st.sound !== sfx.enabled) { sfx.toggle(); paintSoundBtn(); }
  if (st && typeof st.kidsRead === 'boolean') store.set('kids:read', st.kidsRead);
  if (data.kids) { // stars only go up
    const local = store.get('kids:stars', {});
    for (const [id, n] of Object.entries(data.kids.stars || {})) local[id] = Math.max(local[id] || 0, n);
    store.set('kids:stars', local);
    store.set('kids:robotLevel', Math.max(store.get('kids:robotLevel', 0), data.kids.robotLevel || 0));
    if (data.kids.name && !store.get('kids:name', '')) store.set('kids:name', data.kids.name);
  }
  if (user?.streak !== undefined) {
    const d = getData();
    d.streak = user.streak;
    d.bestStreak = Math.max(d.bestStreak || 0, user.bestStreak || 0);
    store.set(`data:${auth.profileKey()}`, d);
  }
}

function currentSettings() {
  return { theme: document.documentElement.dataset.theme, sound: sfx.enabled, kidsRead: !!store.get('kids:read', false) };
}

// ====================================================================================
// Achievements
// ====================================================================================
const KID_LESSONS = ['computer', 'binary', 'robot', 'pixels', 'internet', 'passwords', 'safety', 'words', 'quiz'];
const ACHIEVEMENTS = [
  { id: 'first_pop', emoji: '🍿', name: 'First Pop', desc: 'Read your first story', test: (d) => d.read.length >= 1 },
  { id: 'bookworm', emoji: '📚', name: 'Bookworm', desc: 'Read 50 stories', test: (d) => d.read.length >= 50 },
  { id: 'collector', emoji: '🪣', name: 'Collector', desc: 'Save 10 stories', test: (d) => d.saved.length >= 10 },
  { id: 'reactor', emoji: '🔥', name: 'Hype Machine', desc: 'React to 25 stories', test: (d) => Object.keys(d.reactions).length >= 25 },
  { id: 'chatty', emoji: '🤖', name: 'codme’s Pal', desc: 'Ask codme 10 questions', test: (d) => (d.codmeAsks || 0) >= 10 },
  { id: 'social', emoji: '🦋', name: 'Social Butterfly', desc: 'Send your first kerNEl Chat message', test: (d) => (d.chatSent || 0) >= 1 },
  { id: 'chatterbox', emoji: '💬', name: 'Chatterbox', desc: 'Send 25 chat messages', test: (d) => (d.chatSent || 0) >= 25 },
  { id: 'hot_taker', emoji: '🗳️', name: 'Hot Taker', desc: 'Vote in 3 daily polls', test: (d) => (d.pollVotes || 0) >= 3 },
  { id: 'night_owl', emoji: '🦉', name: 'Night Owl', desc: 'Read a story between midnight and 5 am', test: (d, x) => !!x.nightRead },
  { id: 'chaos_agent', emoji: '🌀', name: 'Chaos Agent', desc: 'Turn on chaos mode', test: (d, x) => !!x.chaos },
  { id: 'cheat_code', emoji: '🕹️', name: 'Cheat Coder', desc: 'Find the secret code', test: (d) => !!d.konami },
  { id: 'streak_3', emoji: '📅', name: 'Regular', desc: 'Visit 3 days in a row', test: (d) => (d.bestStreak || 0) >= 3 },
  { id: 'streak_7', emoji: '🗓️', name: 'Week Warrior', desc: 'Visit 7 days in a row', test: (d) => (d.bestStreak || 0) >= 7 },
  { id: 'overlord', emoji: '👑', name: 'Popcorn Overlord', desc: 'Reach 1,000 XP', test: (d) => d.xp >= 1000 },
  { id: 'kid_grad', emoji: '🎓', name: 'Tech Explorer', desc: 'Finish every kerNEl Kids adventure', test: () => KID_LESSONS.every((l) => (store.get('kids:stars', {})[l] || 0) > 0) },
];

function checkAchievements(extra = {}) {
  const d = getData();
  const fresh = ACHIEVEMENTS.filter((a) => !d.badges[a.id] && a.test(d, extra));
  if (!fresh.length) return;
  for (const a of fresh) d.badges[a.id] = Date.now();
  d.xp += 20 * fresh.length;
  setData(d);
  fresh.forEach((a, i) => setTimeout(() => {
    toast(`Achievement unlocked: ${a.name} ${a.emoji} (+20 XP)`, { emoji: '🏅', ms: 5000 });
    rain([a.emoji, '✨', '🏅'], 30);
    sfx.win();
  }, i * 900));
  renderProfileWidget();
  renderAchievements();
}

function renderAchievements() {
  const d = getData();
  const got = ACHIEVEMENTS.filter((a) => d.badges[a.id]).length;
  $('#achList').innerHTML = `<p class="muted small">${got} of ${ACHIEVEMENTS.length} unlocked${auth.user ? '' : ' · sign up to keep them forever'}</p>`
    + ACHIEVEMENTS.map((a) => {
      const on = !!d.badges[a.id];
      return `<span class="ach${on ? ' on' : ''}" title="${esc(a.name)} — ${esc(a.desc)}${on ? ' ✓' : ''}" aria-label="${esc(a.name)}: ${esc(a.desc)}${on ? ', unlocked' : ', locked'}">${on ? a.emoji : '🔒'}</span>`;
    }).join('');
}

// ====================================================================================
// Leaderboard
// ====================================================================================
let boardTimer = 0;
async function loadLeaderboard() {
  const box = $('#boardWidget');
  if (!auth.ready) { box.hidden = true; return; }
  box.hidden = false;
  clearTimeout(boardTimer);
  boardTimer = setTimeout(loadLeaderboard, 5 * 60_000);
  try {
    const { top, me } = await auth.leaderboard();
    const medal = ['🥇', '🥈', '🥉'];
    $('#boardList').innerHTML = top.length
      ? top.slice(0, 10).map((u) => `<li class="${auth.user && u.username === auth.user.username ? 'me' : ''}" data-user="${esc(u.username)}" title="See ${esc(u.nickname)}'s profile">
          <span class="b-place">${medal[u.place - 1] || u.place}</span><span class="b-ava" aria-hidden="true">${esc(u.avatar)}</span>
          <span class="b-name"><b>${esc(u.nickname)}</b><small>@${esc(u.username)} · ${esc(u.rankEmoji)}${u.streak > 1 ? ` · 🔥${u.streak}` : ''}</small></span>
          <span class="b-xp">${compact(u.xp)}<small>XP</small></span></li>`).join('')
      : '<li class="muted small">Nobody yet — be the first kernel to pop! 🍿</li>';
    $('#boardMe').innerHTML = !auth.user
      ? '<button type="button" class="linkish" data-action="signup">Sign up</button> to get on the board.'
      : me?.onBoard === false ? 'You’re hidden from the leaderboard (change it in your name tag).'
        : me?.place ? `You’re <b>#${me.place}</b> with ${me.xp} XP. Keep popping!` : '';
  } catch {
    $('#boardList').innerHTML = '<li class="muted small">Leaderboard is napping — back soon. 😴</li>';
  }
}

async function dailyCheckin() {
  if (!auth.user) return;
  try {
    const r = await auth.checkin();
    const d = getData();
    d.streak = r.streak;
    d.bestStreak = Math.max(d.bestStreak || 0, r.bestStreak || 0);
    store.set(`data:${auth.profileKey()}`, d);
    if (!r.already && r.bonusXp) {
      toast(r.streak > 1 ? `${r.streak}-day streak! +${r.bonusXp} XP` : `Daily visit bonus: +${r.bonusXp} XP`, { emoji: '🔥', ms: 4500 });
      addXp(r.bonusXp);
    }
    renderProfileWidget();
    checkAchievements();
  } catch { /* offline: try again next visit */ }
}

function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  return { i, min: RANKS[i][0], title: RANKS[i][1], emoji: RANKS[i][2], next: RANKS[i + 1]?.[0] ?? null };
}

function addXp(n) {
  const d = getData();
  const before = rankFor(d.xp);
  d.xp += n;
  setData(d);
  const after = rankFor(d.xp);
  if (after.i > before.i) {
    toast(`RANK UP! You are now a ${after.title} ${after.emoji}`, { emoji: '🏅', ms: 5000 });
    rain([after.emoji, '🍿', '✨'], 40);
    sfx.win();
  }
  renderProfileWidget();
  checkAchievements();
}

function findItem(key) {
  return feed.get(key) || extraItems.get(key) || getData().saved.find((s) => s.key === key) || null;
}

const snapshot = (it) => ({
  key: it.key, title: it.title, url: it.url, commentsUrl: it.commentsUrl, source: it.source, sourceId: it.sourceId,
  sourceEmoji: it.sourceEmoji, time: it.time, cat: it.cat, image: it.image, domain: it.domain, points: it.points,
  comments: it.comments, summary: it.summary,
});

// ====================================================================================
// Rendering helpers
// ====================================================================================
function artWord(title) {
  const words = (title.match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 3 && w.length <= 11 && !/^(the|and|for|with|from|that|this|your|how|why|what|new|are|was|will|you)$/i.test(w));
  return (words.sort((a, b) => b.length - a.length)[0] || 'TECH').toUpperCase();
}

function thumbHTML(it, c) {
  const h = hash(it.key);
  const h1 = (c.hue + (h % 50) - 25 + 360) % 360;
  const h2 = (h1 + 35 + ((h >> 4) % 90)) % 360;
  const rot = (h % 24) - 12;
  const art = `<div class="art" style="--h1:${h1};--h2:${h2};--rot:${rot}deg"><span class="art-emoji">${c.emoji}</span><span class="art-word">${esc(artWord(it.title))}</span></div>`;
  if (!it.image || safeUrl(it.image) === '#') return art;
  return `${art}<img src="${esc(safeUrl(it.image))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

function badgeList(it) {
  const b = [];
  const now = Date.now();
  if (it.popped && now - it.popped < 15 * 60e3) b.push(['pop', '🍿 JUST POPPED']);
  else if (now - it.time < 60 * 60e3) b.push(['new', '🆕 FRESH']);
  if ((it.points || 0) >= 300) b.push(['hot', '🔥 HOT']);
  if ((it.comments || 0) >= 150) b.push(['spicy', '🌶️ SPICY']);
  return b.slice(0, 2);
}
const badgesHTML = (list) => (list.length ? `<div class="badges">${list.map(([k, t]) => `<span class="badge badge-${k}">${t}</span>`).join('')}</div>` : '');

function reactsHTML(it, mine) {
  return `<span class="reacts" role="group" aria-label="Reactions">${REACTS.map((r) => {
    const n = it.reactions?.[r.id] || 0;
    return `<button type="button" class="react${mine === r.id ? ' on' : ''}" data-react="${r.id}" title="${r.label}${n ? ` · ${n}` : ''}" aria-pressed="${mine === r.id}">${r.emoji}${n ? `<small class="react-n">${compact(n)}</small>` : ''}</button>`;
  }).join('')}</span>`;
}

function sig(it, d) {
  return [JSON.stringify(it.reactions || {}), it.points, it.comments, it.image ? 1 : 0, d.saved.some((s) => s.key === it.key) ? 1 : 0, d.reactions[it.key] || '', d.read.includes(it.key) ? 1 : 0, badgeList(it).map((b) => b[0]).join('')].join('|');
}

function cardHTML(it, variant, d) {
  const c = catById(it.cat);
  const url = esc(safeUrl(it.url));
  const saved = d.saved.some((s) => s.key === it.key);
  const read = d.read.includes(it.key);
  const mine = d.reactions[it.key];
  const tilt = ((hash(it.key) % 15) - 7) / 10;
  const isoTime = new Date(it.time).toISOString();
  return `<article class="card card-${variant}${read ? ' is-read' : ''}" data-key="${esc(it.key)}" style="--cat-h:${c.hue};--tilt:${tilt}deg">
    <a class="card-thumb" href="${url}" target="_blank" rel="noopener noreferrer" data-open tabindex="-1" aria-hidden="true">${thumbHTML(it, c)}${badgesHTML(badgeList(it))}</a>
    <div class="card-body">
      <div class="card-meta">
        <button type="button" class="chip chip-cat" data-cat="${c.id}" title="More ${esc(c.label)} news">${c.emoji} ${esc(c.label)}</button>
        <span class="src">${esc(it.sourceEmoji || '')} ${esc(it.source)}</span>
        <time datetime="${isoTime}" data-time="${it.time}">${timeAgo(it.time)}</time>
      </div>
      <h3 class="card-title"><a href="${url}" target="_blank" rel="noopener noreferrer" data-open>${esc(it.title)}</a></h3>
      ${it.summary && variant !== 'mini' ? `<p class="card-summary">${esc(it.summary)}</p>` : ''}
      <div class="card-foot">
        ${it.points ? `<span class="stat" title="Upvotes / reactions">▲ ${compact(it.points)}</span>` : ''}
        ${it.commentsUrl ? `<a class="stat" href="${esc(safeUrl(it.commentsUrl))}" target="_blank" rel="noopener noreferrer" title="Comments">💬 ${compact(it.comments)}</a>` : ''}
        <span class="domain">${esc(it.domain)}</span>
        <span class="spacer"></span>
        ${reactsHTML(it, mine)}
        <button type="button" class="icon-btn save${saved ? ' on' : ''}" data-save aria-pressed="${saved}" title="${saved ? 'Remove from your bucket' : 'Save to your popcorn bucket'}">${saved ? '🔖' : '📑'}</button>
        <button type="button" class="icon-btn" data-chatshare title="Share to kerNEl Chat">💬</button>
        <button type="button" class="icon-btn" data-emojify title="Emoji TL;DR">🪄</button>
        <button type="button" class="icon-btn" data-share title="Share">🔗</button>
      </div>
    </div>
  </article>`;
}

function htmlToEl(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const updateTimes = () => $$('time[data-time]').forEach((t) => { t.textContent = timeAgo(Number(t.dataset.time)); });

// ====================================================================================
// Feed + hero + ticker + widgets
// ====================================================================================
function sortList(list) {
  if (state.sort === 'hot') return [...list].sort((a, b) => hotness(b) - hotness(a));
  if (state.sort === 'chaos') return [...list].sort((a, b) => hash(a.key + state.chaosSeed) - hash(b.key + state.chaosSeed));
  return [...list].sort((a, b) => b.time - a.time);
}

function getVisible() {
  const d = getData();
  let list;
  if (state.cat === 'saved') {
    list = d.saved.map((s) => feed.get(s.key) || s);
  } else {
    list = feed.all();
    if (state.cat === 'foryou') {
      const topics = auth.getProfile().topics || [];
      list = list.filter((i) => topics.includes(i.cat));
    } else if (state.cat !== 'all') {
      list = list.filter((i) => i.cat === state.cat);
    }
  }
  if (state.query) return searchLocal(list, state.query);
  return state.cat === 'saved' ? list : sortList(list);
}

function feedTitle() {
  if (state.query) return `🔎 Results for “${esc(state.query)}”`;
  if (state.cat === 'saved') return '🔖 Your popcorn bucket';
  if (state.cat === 'foryou') return '⭐ For You';
  if (state.cat !== 'all') { const c = catById(state.cat); return `${c.emoji} ${esc(c.label)} kernels`; }
  return 'Fresh out the microwave 🍿';
}

function emptyMessage() {
  if (state.query) return `<div class="empty-emoji">🕵️</div><p>No stories in the live feed match “${esc(state.query)}”.</p><button class="btn btn-primary" data-action="ask-codme">🤖 Ask codme to dig the archives</button>`;
  if (state.cat === 'saved') return '<div class="empty-emoji">🪣</div><p>Your popcorn bucket is empty. Tap 📑 on any story to save it for later.</p>';
  if (state.cat === 'foryou') {
    return auth.getProfile().topics?.length
      ? '<div class="empty-emoji">⭐</div><p>Nothing in your favourite topics yet — they’re still in the bag. Check back in a minute!</p>'
      : '<div class="empty-emoji">⭐</div><p>Pick your favourite topics to build your For You feed.</p><button class="btn btn-primary" data-action="edit-profile">✏️ Choose topics</button>';
  }
  if (!feed.size) {
    const allFailed = Object.values(feed.status).length && Object.values(feed.status).every((s) => !s.ok);
    return allFailed
      ? `<div class="empty-emoji">📡</div><p>The internet tubes are clogged — couldn’t reach any news source. Retrying in ${REFRESH} seconds…</p><button class="btn btn-primary" data-action="refresh">🔄 Try again now</button>`
      : `<div class="empty-emoji spin">🍿</div><p>${esc(pick(LOADING_LINES))}</p>`;
  }
  const c = catById(state.cat);
  return `<div class="empty-emoji">${c.emoji}</div><p>No ${esc(c.label)} kernels have popped yet. They’re probably still in the bag.</p>`;
}

function renderFeed() {
  const feedEl = $('#feed');
  const list = getVisible();
  const shown = list.slice(0, state.limit);
  const d = getData();

  // keep the reader's place if new stories are inserted above them
  let anchor = null;
  if (feedEl.getBoundingClientRect().top < 0) {
    for (const el of feedEl.children) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 80) { anchor = { el, top: r.top }; break; }
    }
  }

  const existing = new Map();
  for (const el of feedEl.children) if (el.dataset.key) existing.set(el.dataset.key, el);
  const frag = document.createDocumentFragment();
  for (const it of shown) {
    const s = sig(it, d);
    let el = existing.get(it.key);
    if (!el || el.dataset.sig !== s) {
      el = htmlToEl(cardHTML(it, 'row', d));
      el.dataset.sig = s;
      if (it.popped && Date.now() - it.popped < 8000) el.classList.add('pop-in');
    }
    existing.delete(it.key);
    frag.append(el);
  }
  feedEl.replaceChildren(frag);
  feedEl.setAttribute('aria-busy', 'false');

  if (anchor && anchor.el.isConnected) {
    const delta = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }

  $('#feedTitle').innerHTML = feedTitle();
  $('#feedCount').textContent = list.length ? `${shown.length} of ${list.length}` : '';
  const empty = $('#feedEmpty');
  empty.hidden = list.length > 0;
  if (!list.length) empty.innerHTML = emptyMessage();
  $('#moreBtn').hidden = shown.length >= list.length;
  $('#searchClear').hidden = !state.query;
  $$('#sortTabs [data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
  updateTimes();
}

function renderHero() {
  const hero = $('#hero');
  const items = feed.all();
  if (!items.length) {
    if (Object.values(feed.status).length && Object.values(feed.status).every((s) => !s.ok)) {
      hero.innerHTML = '<div class="hero-error"><div class="empty-emoji">🔌</div><h2>Our news antenna is taking a nap</h2><p>We couldn’t reach any news source just now. Check your connection — we’ll keep trying every 30 seconds.</p><button class="btn btn-primary" data-action="refresh">🔄 Wake it up</button></div>';
      heroSig = '';
    }
    return;
  }
  const ranked = items.sort((a, b) => hotness(b) - hotness(a));
  const main = ranked[0];
  const side = ranked.slice(1, 5);
  const d = getData();
  const s = [main, ...side].map((i) => i.key + sig(i, d)).join('§');
  if (s === heroSig) return;
  heroSig = s;
  const c = catById(main.cat);
  const url = esc(safeUrl(main.url));
  const mine = d.reactions[main.key];
  const saved = d.saved.some((x) => x.key === main.key);
  hero.innerHTML = `
    <article class="card hero-main" data-key="${esc(main.key)}" style="--cat-h:${c.hue}">
      <a class="hero-media card-thumb" href="${url}" target="_blank" rel="noopener noreferrer" data-open tabindex="-1" aria-hidden="true">${thumbHTML(main, c)}</a>
      <div class="hero-overlay">
        <div class="hero-stickers"><span class="sticker">🏆 TOP KERNEL</span>${badgeList(main).map(([k, t]) => `<span class="badge badge-${k}">${t}</span>`).join('')}</div>
        <div class="card-meta">
          <button type="button" class="chip chip-cat" data-cat="${c.id}">${c.emoji} ${esc(c.label)}</button>
          <span class="src">${esc(main.sourceEmoji || '')} ${esc(main.source)}</span>
          <time datetime="${new Date(main.time).toISOString()}" data-time="${main.time}">${timeAgo(main.time)}</time>
        </div>
        <h2 class="hero-title"><a href="${url}" target="_blank" rel="noopener noreferrer" data-open>${esc(main.title)}</a></h2>
        <div class="card-foot">
          ${main.points ? `<span class="stat">▲ ${compact(main.points)}</span>` : ''}
          ${main.commentsUrl ? `<a class="stat" href="${esc(safeUrl(main.commentsUrl))}" target="_blank" rel="noopener noreferrer">💬 ${compact(main.comments)}</a>` : ''}
          <span class="domain">${esc(main.domain)}</span>
          <span class="spacer"></span>
          ${reactsHTML(main, mine)}
          <button type="button" class="icon-btn save${saved ? ' on' : ''}" data-save aria-pressed="${saved}" title="Save">${saved ? '🔖' : '📑'}</button>
          <button type="button" class="icon-btn" data-share title="Share">🔗</button>
        </div>
      </div>
    </article>
    <div class="hero-side">
      <h2 class="side-title">Also popping <span aria-hidden="true">🍿</span></h2>
      ${side.map((it) => cardHTML(it, 'mini', d)).join('')}
    </div>`;
}

function renderTicker() {
  const track = $('#tickerTrack');
  const latest = feed.all().sort((a, b) => b.time - a.time).slice(0, 14);
  const s = latest.map((i) => i.key).join('|');
  if (!latest.length || s === tickerSig) return;
  tickerSig = s;
  const items = latest.map((it) => `<a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer" data-open>${catById(it.cat).emoji} ${esc(it.title)}</a>`).join('<span class="tick-sep" aria-hidden="true">✦</span>');
  track.innerHTML = `<div class="ticker-run">${items}<span class="tick-sep" aria-hidden="true">✦</span></div><div class="ticker-run" aria-hidden="true">${items.replace(/data-open/g, 'data-open tabindex="-1"')}<span class="tick-sep">✦</span></div>`;
  track.style.setProperty('--ticker-duration', `${latest.length * 7}s`);
  // ticker links live outside cards; give them their keys so reading them counts
  $$('.ticker-run', track).forEach((run) => $$('a', run).forEach((a, i) => { a.dataset.readKey = latest[i]?.key || ''; }));
}

function renderTrends() {
  const list = trends(feed.all(), 16);
  const box = $('#trendList');
  if (!list.length) { box.innerHTML = '<p class="muted">Warming up the hype detector… 🌡️</p>'; return; }
  const max = list[0][1];
  box.innerHTML = list.map(([w, n]) => {
    const lvl = Math.ceil((n / max) * 4);
    return `<button type="button" class="trend t${lvl}" data-trend="${esc(w)}" title="${n} headlines">${esc(w)} <small>${n}</small></button>`;
  }).join('');
}

function renderSources() {
  const box = $('#sourceList');
  box.innerHTML = feed.sourceRows().map((s) => {
    const [dot, mood] = !s.known ? ['⚪', 'warming up'] : s.ok ? ['🟢', `vibing · ${s.count}`] : ['🔴', 'napping'];
    const tip = s.error ? ` title="${esc(s.error)}"` : '';
    return `<li${tip}><span>${esc(s.emoji)} ${esc(s.name)}</span><span class="src-mood">${dot} ${esc(mood)}</span></li>`;
  }).join('') + (feed.usingApi() ? '<li class="via-api"><span>⚡ Served by the kerNEl server</span></li>' : '');
}

function sourceCounts() {
  const rows = feed.sourceRows();
  return { ok: rows.filter((s) => s.ok).length, total: rows.length, every: REFRESH };
}

function updateStatusLine() {
  const el = $('#feedStatus');
  if (!el) return;
  const { ok, total } = sourceCounts();
  if (!feed.lastRefresh) {
    el.textContent = feed.hadCache ? `🍿 Showing ${feed.size} cached stories from ${timeAgo(feed.cacheTime)} while fresh ones pop…` : `🍿 ${pick(LOADING_LINES)}`;
    return;
  }
  if (!ok) {
    el.textContent = feed.size
      ? `📡 Can’t reach the news sources right now — showing ${feed.size} saved stories. Retrying every ${REFRESH}s…`
      : `📡 Can’t reach the news sources right now. Retrying every ${REFRESH}s…`;
    return;
  }
  el.textContent = `🍿 ${feed.size} stories · last pop ${timeAgo(feed.lastSuccess || feed.lastRefresh)} · ${ok}/${total} sources vibing`;
}

function avatarHTML(profile, cls = '') {
  return `<span class="avatar avatar-emoji ${cls}" aria-hidden="true">${esc(profile.avatar || '🍿')}</span>`;
}

function renderProfileWidget() {
  const box = $('#profileWidget');
  const p = auth.getProfile();
  const d = getData();
  const r = rankFor(d.xp);
  const pct = r.next ? Math.round(((d.xp - r.min) / (r.next - r.min)) * 100) : 100;
  box.innerHTML = `
    <div class="pw-head">${avatarHTML(p, 'avatar-lg')}<div><b>${esc(p.nickname)}</b><span class="rank">${r.emoji} ${esc(r.title)}</span></div></div>
    <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress to next rank"><i style="width:${pct}%"></i></div>
    <p class="xp-note">${d.xp} XP${r.next ? ` · ${r.next - d.xp} to next rank` : ' · max rank, legend!'}</p>
    <div class="pw-stats"><span><b>${d.read.length}</b> read</span><span><b>${d.saved.length}</b> saved</span><span><b>${Object.keys(d.reactions).length}</b> reactions</span>${auth.user ? `<span title="Visit every day to grow your streak"><b>🔥${d.streak || 0}</b> streak</span>` : ''}</div>
    ${auth.user ? `<p class="muted small synced">☁️ Saved to @${esc(auth.user.username)}</p>` : '<button type="button" class="btn btn-primary btn-block" data-action="signup">Save your progress — sign up free</button>'}`;
}

function renderAuthSlot() {
  const slot = $('#authSlot');
  if (!auth.user) {
    slot.innerHTML = '<button type="button" class="btn btn-ghost" data-action="signin">Sign in</button><button type="button" class="btn btn-primary hide-sm" data-action="signup">Sign up</button>';
    return;
  }
  const p = auth.getProfile();
  slot.innerHTML = `<div class="user-menu">
    <button type="button" class="avatar-btn" data-action="menu" aria-haspopup="menu" aria-expanded="false">${avatarHTML(p)}<span class="nick hide-sm">${esc(p.nickname)}</span><span aria-hidden="true">▾</span></button>
    <div class="menu" role="menu" hidden>
      <div class="menu-head">${avatarHTML(p, 'avatar-lg')}<div><b>${esc(p.nickname)}</b><small>@${esc(auth.user.username)}</small><span class="provider">☁️ progress saved to your account</span></div></div>
      <button type="button" role="menuitem" data-action="edit-profile">✏️ Edit name tag</button>
      <button type="button" role="menuitem" data-action="show-foryou">⭐ For You feed</button>
      <button type="button" role="menuitem" data-action="show-saved">🔖 My popcorn bucket</button>
      <button type="button" role="menuitem" data-action="show-board">🏆 Leaderboard</button>
      <button type="button" role="menuitem" data-action="account">🔑 Account &amp; security</button>
      <button type="button" role="menuitem" data-action="signout">🚪 Sign out</button>
    </div></div>`;
}

function renderNav() {
  const nav = $('#catNav');
  const tabs = [
    { id: 'all', label: 'All', emoji: '⚡' },
    ...(auth.user ? [{ id: 'foryou', label: 'For You', emoji: '⭐' }] : []),
    ...CATEGORIES,
    { id: 'saved', label: 'Saved', emoji: '🔖' },
  ];
  nav.innerHTML = tabs.map((t) => `<button type="button" class="nav-btn" data-cat="${t.id}" aria-pressed="${state.cat === t.id}"><span aria-hidden="true">${t.emoji}</span> ${esc(t.label)}</button>`).join('')
    + (auth.ready ? '<button type="button" class="nav-btn nav-chat" data-action="chat"><span aria-hidden="true">💬</span> Chat<span class="chat-dot" hidden></span></button>' : '')
    + '<a class="nav-btn nav-kids" href="kids.html"><span aria-hidden="true">🧸</span> Kids</a>';
}

function renderAll() {
  renderHero();
  renderFeed();
  renderTicker();
  renderTrends();
  renderSources();
  updateStatusLine();
  codme?.updateStatus();
}

// ====================================================================================
// Actions
// ====================================================================================
function setCat(cat) {
  if (cat === 'foryou' && !auth.user) return openAuth('signin');
  state.cat = cat;
  state.limit = PAGE;
  renderNav();
  renderFeed();
  $('#feedSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setQuery(q) {
  $('#search').value = q;
  state.query = q.trim();
  state.limit = PAGE;
  renderFeed();
  $('#feedSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncCards(key) {
  const d = getData();
  const saved = d.saved.some((s) => s.key === key);
  const mine = d.reactions[key];
  $$('[data-key]').filter((el) => el.dataset.key === key).forEach((card) => {
    card.querySelectorAll('[data-save]').forEach((b) => {
      b.classList.toggle('on', saved);
      b.setAttribute('aria-pressed', String(saved));
      b.textContent = saved ? '🔖' : '📑';
      b.title = saved ? 'Remove from your bucket' : 'Save to your popcorn bucket';
    });
    card.querySelectorAll('[data-react]').forEach((b) => {
      const on = b.dataset.react === mine;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (d.read.includes(key)) card.classList.add('is-read');
    const it = findItem(key);
    if (it && card.dataset.sig) card.dataset.sig = sig(it, d);
  });
  heroSig = '';
}

function toggleSave(key, btn) {
  const d = getData();
  const idx = d.saved.findIndex((s) => s.key === key);
  if (idx >= 0) {
    d.saved.splice(idx, 1);
    setData(d);
    toast('Removed from your popcorn bucket', { emoji: '🪣' });
  } else {
    const it = findItem(key);
    if (!it) return;
    d.saved.unshift(snapshot(it));
    d.saved = d.saved.slice(0, 200);
    setData(d);
    toast(auth.user ? 'Saved to your popcorn bucket!' : 'Saved! Sign up to keep it under your own name tag.', { emoji: '🔖' });
    burstFrom(btn, { emojis: ['🔖', '🍿', '⭐'], count: 8, spread: 70 });
    sfx.pop();
    addXp(2);
  }
  syncCards(key);
  renderProfileWidget();
  if (state.cat === 'saved') renderFeed();
}

let reactHintShown = false;
function react(key, btn) {
  const d = getData();
  const id = btn.dataset.react;
  const before = d.reactions[key];
  if (before === id) delete d.reactions[key];
  else {
    d.reactions[key] = id;
    burstFrom(btn, { emojis: [REACTS.find((r) => r.id === id).emoji], count: 10, spread: 90 });
    sfx.pop();
  }
  setData(d);
  if (!before && d.reactions[key]) addXp(1);
  const it = findItem(key);
  if (it && auth.user?.apiToken) {
    // Shared counts: update instantly, then take the server's numbers.
    const counts = { ...(it.reactions || {}) };
    if (before) counts[before] = Math.max(0, (counts[before] || 1) - 1);
    if (d.reactions[key]) counts[d.reactions[key]] = (counts[d.reactions[key]] || 0) + 1;
    it.reactions = counts;
    auth.api('/api/react', { method: 'POST', body: { key, emoji: d.reactions[key] || null } })
      .then((r) => { it.reactions = r.reactions; refreshReactButtons(key); })
      .catch(() => {});
  } else if (feed.usingApi() && !auth.user && !reactHintShown) {
    reactHintShown = true;
    toast('Sign in to add your reaction to the public count!', { emoji: '🔥' });
  }
  syncCards(key);
  refreshReactButtons(key);
  renderProfileWidget();
}

function refreshReactButtons(key) {
  const it = findItem(key);
  if (!it) return;
  const mine = getData().reactions[key];
  $$('[data-key]').filter((el) => el.dataset.key === key).forEach((card) => {
    const box = card.querySelector('.reacts');
    if (box) box.outerHTML = reactsHTML(it, mine);
    if (card.dataset.sig) card.dataset.sig = sig(it, getData());
  });
}

function markRead(key, e) {
  const d = getData();
  if (d.read.includes(key)) return;
  d.read.push(key);
  d.read = d.read.slice(-600);
  setData(d);
  if (e?.clientX) burst(e.clientX, e.clientY, { emojis: ['✨', '+5'], count: 5, spread: 50 });
  addXp(5);
  const h = new Date().getHours();
  if (h < 5) checkAchievements({ nightRead: true });
  syncCards(key);
}

async function share(key) {
  const it = findItem(key);
  if (!it) return;
  const url = safeUrl(it.url);
  try {
    if (navigator.share) {
      await navigator.share({ title: it.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Link copied to your clipboard', { emoji: '📋' });
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Couldn’t share that one — try long-pressing the headline instead.', { emoji: '🤷' });
  }
}

function emojifyCard(key, btn) {
  const it = findItem(key);
  if (!it) return;
  const e = emojify(it.title);
  toast(`Emoji TL;DR: ${e}`, { emoji: '🪄', ms: 5200 });
  burstFrom(btn, { emojis: e.split(' '), count: 8, spread: 80 });
  sfx.boing();
}

// ---------- sign in / sign up / forgot password ----------
let authMode = 'signin';
let afterCode = null; // what to do once the recovery code is saved
const AUTH_TEXT = {
  signin: ['Welcome back, kernel! 🍿', 'Sign in with your kerNEl username and password.'],
  signup: ['Join the kerNEl! 🎉', 'Free, no email needed. Your XP, saved stories, achievements and kids’ stars get saved to your account.'],
  recover: ['Forgot your password? 🔑', 'No stress — your recovery code gets you back in.'],
  code: ['Your recovery code 🛟', 'One last thing before you pop in.'],
};

function openAuth(mode = 'signin') {
  const dlg = $('#authDialog');
  if (!dlg.open) dlg.showModal();
  setAuthMode(mode);
}

function setAuthMode(mode) {
  authMode = mode;
  $$('.auth-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('.auth-tabs').hidden = mode === 'code';
  $('#authTitle').textContent = AUTH_TEXT[mode][0];
  $('#authSub').textContent = AUTH_TEXT[mode][1];
  $('#authOff').hidden = auth.ready;
  $('#authFine').hidden = mode === 'code';
  $$('#authDialog [data-view]').forEach((f) => { f.hidden = f.dataset.view !== mode; });
  $$('#authDialog .auth-form input, #authDialog .auth-form button[type="submit"]').forEach((el) => { el.disabled = !auth.ready && mode !== 'code'; });
  $$('#authDialog .auth-error').forEach((el) => { el.textContent = ''; });
  const first = $(`#authDialog [data-view="${mode}"] input`);
  if (first && auth.ready) setTimeout(() => first.focus(), 60);
}

function showRecoveryCode(code, then) {
  afterCode = then;
  $('#recoveryCode').textContent = code;
  $('#codeSaved').checked = false;
  $('#codeDone').disabled = true;
  openAuth('code');
}

async function runAuthForm(form, fn) {
  const err = form.querySelector('.auth-error');
  const btn = form.querySelector('button[type="submit"]');
  err.textContent = '';
  btn.disabled = true;
  btn.classList.add('busy');
  try {
    await fn(form.elements);
  } catch (e) {
    err.textContent = `😵 ${e.message}`;
    sfx.buzz();
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
  } finally {
    btn.disabled = !auth.ready;
    btn.classList.remove('busy');
  }
}

function paintStrength(form) {
  const pw = form.elements.password.value;
  const st = passwordStrength(pw, form.elements.username?.value || '');
  const meter = form.querySelector('.pw-meter i');
  if (meter) {
    meter.style.width = `${(st.score / 4) * 100}%`;
    meter.style.background = ['#ff4d5e', '#ff4d5e', '#ffb02e', '#ffd23f', '#2ee6a6'][st.score];
  }
  const label = form.querySelector('.pw-label');
  if (label) label.textContent = `${st.emoji} ${st.label}`;
}

function openAccount() {
  const dlg = $('#accountDialog');
  $('#accountWho').textContent = `Signed in as @${auth.user.username}`;
  $$('#accountDialog form.auth-form').forEach((f) => { f.reset(); f.querySelector('.auth-error').textContent = ''; });
  if (!dlg.open) dlg.showModal();
}

// ---------- profile dialog ----------
function openProfile(isNew = false) {
  const dlg = $('#profileDialog');
  const form = $('#profileForm');
  const p = auth.getProfile();
  $('#profileTitle').textContent = isNew ? 'Make your name tag 🏷️' : 'Edit your name tag ✏️';
  $('#profileSave').textContent = isNew ? 'Pop me in! 🍿' : 'Save changes ✅';
  form.elements.nickname.value = p.nickname || '';
  $('#avatarPick').innerHTML = AVATARS.map((a) => `<label class="pick-avatar"><input type="radio" name="avatar" value="${esc(a)}" ${p.avatar === a ? 'checked' : ''}><span>${a}</span></label>`).join('');
  form.elements.leaderboard.checked = p.leaderboard !== false;
  form.elements.leaderboard.closest('.check').hidden = !auth.user;
  $('#topicPick').innerHTML = CATEGORIES.map((c) => `<label class="pick-topic"><input type="checkbox" name="topics" value="${c.id}" ${(p.topics || []).includes(c.id) ? 'checked' : ''}><span>${c.emoji} ${esc(c.label)}</span></label>`).join('');
  if (!dlg.open) dlg.showModal();
}

function migrateGuest() {
  const guest = store.get('data:guest', null);
  if (!guest || (!guest.xp && !guest.saved?.length)) return;
  const d = getData();
  d.xp += guest.xp || 0;
  const keys = new Set(d.saved.map((s) => s.key));
  d.saved = [...d.saved, ...(guest.saved || []).filter((s) => !keys.has(s.key))];
  d.read = [...new Set([...d.read, ...(guest.read || [])])];
  d.reactions = { ...(guest.reactions || {}), ...d.reactions };
  d.badges = { ...(guest.badges || {}), ...d.badges };
  d.codmeAsks = (d.codmeAsks || 0) + (guest.codmeAsks || 0);
  d.konami = !!(d.konami || guest.konami);
  setData(d);
  store.del('data:guest');
  const n = guest.saved?.length || 0;
  toast(`Brought your guest stuff along: ${guest.xp || 0} XP and ${n} saved stor${n === 1 ? 'y' : 'ies'} 🧳`, { emoji: '🎒', ms: 5000 });
}

// ---------- theme / sound / chaos ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#themeBtn');
  btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}
function paintSoundBtn() {
  const b = $('#soundBtn');
  b.textContent = sfx.enabled ? '🔊' : '🔇';
  b.setAttribute('aria-pressed', String(sfx.enabled));
  b.title = sfx.enabled ? 'Sound effects on' : 'Sound effects off';
}

function handleAction(action, el) {
  switch (action) {
    case 'signin': openAuth('signin'); break;
    case 'signup': openAuth('signup'); break;
    case 'menu': {
      const menu = el.nextElementSibling;
      const open = menu.hidden;
      menu.hidden = !open;
      el.setAttribute('aria-expanded', String(open));
      if (open) menu.querySelector('[role="menuitem"]')?.focus();
      break;
    }
    case 'edit-profile': closeMenus(); openProfile(false); break;
    case 'show-saved': closeMenus(); setCat('saved'); break;
    case 'show-foryou': closeMenus(); if (!auth.getProfile().topics?.length) openProfile(false); setCat('foryou'); break;
    case 'signout': closeMenus(); auth.signOut(); break;
    case 'account': closeMenus(); openAccount(); break;
    case 'show-board': closeMenus(); $('#boardWidget').scrollIntoView({ behavior: 'smooth', block: 'center' }); loadLeaderboard(); break;
    case 'refresh': refreshNow(true); break;
    case 'more': state.limit += PAGE; renderFeed(); break;
    case 'joke': $('#jokeText').textContent = pick(JOKES); sfx.boing(); burstFrom(el, { emojis: ['😂', '🤣', '😆'], count: 8 }); break;
    case 'fact': $('#factText').textContent = pick(FACTS); sfx.blip(); break;
    case 'codme': codme?.open(); break;
    case 'chat': community?.toggle(); break;
    case 'ask-codme': codme?.open(state.query ? `news about ${state.query}` : undefined); break;
    case 'clear-search': setQuery(''); $('#search').focus(); break;
    case 'theme': {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      store.set('theme', next);
      applyTheme(next);
      sfx.blip();
      if (auth.user) setData(getData()); // remember the theme on the account
      break;
    }
    case 'sound': sfx.toggle(); paintSoundBtn(); if (auth.user) setData(getData()); break;
    case 'chaos': {
      const on = document.documentElement.classList.toggle('chaos');
      el.setAttribute('aria-pressed', String(on));
      if (on) { rain(['🌀', '🍿', '🤪', '💥'], 40); sfx.boing(); toast('CHAOS MODE: everything is wobbly now. You asked for this. 🌀', { emoji: '🤪' }); checkAchievements({ chaos: true }); }
      else toast('Order restored. Boring, but readable. 😌', { emoji: '🧘' });
      break;
    }
    case 'home': {
      state.cat = 'all'; state.query = ''; state.limit = PAGE; $('#search').value = '';
      renderNav(); renderFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      burstFrom(el, { count: 12 });
      sfx.pop();
      break;
    }
    default: break;
  }
}

function closeMenus() {
  $$('.user-menu .menu').forEach((m) => { m.hidden = true; });
  $$('.avatar-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

// ====================================================================================
// Refresh loop: every REFRESH seconds while the tab is visible
// ====================================================================================
function updatePopper() {
  const popper = $('#popper');
  const left = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
  $('#popperRing').style.strokeDashoffset = feed.loading ? '0' : String((RING * Math.min(left, REFRESH)) / REFRESH);
  $('#countdown').textContent = feed.loading ? '…' : `${left}s`;
  popper.classList.toggle('heating', left <= 5 && !feed.loading);
  popper.classList.toggle('loading', feed.loading);
  popper.title = feed.loading ? 'Popping fresh news…' : `Next refresh in ${left}s — click to pop now`;
}

function refreshNow(force = false) {
  if (feed.loading) return;
  nextAt = Date.now() + REFRESH * 1000;
  feed.refresh(force);
}

feed.addEventListener('loading', updatePopper);
feed.addEventListener('update', (e) => {
  const { fresh, anyOk, firstOfSession } = e.detail;
  updatePopper();
  const popper = $('#popper');
  popper.classList.remove('popped');
  void popper.offsetWidth; // restart the animation
  popper.classList.add('popped');
  $('#factText').textContent = pick(FACTS);
  renderAll();
  if (!anyOk) return;
  if (!firstOfSession && fresh.length) {
    toast(`${fresh.length} fresh kernel${fresh.length === 1 ? '' : 's'} just popped!`, { emoji: '🍿' });
    burstFrom(popper, { count: 10, spread: 90 });
    sfx.pop();
    codme?.notify(fresh);
  } else if (firstOfSession && feed.hadCache && fresh.length) {
    toast(`Welcome back! ${fresh.length} new stor${fresh.length === 1 ? 'y' : 'ies'} popped since your last visit.`, { emoji: '👋' });
  }
});

// ====================================================================================
// Boot
// ====================================================================================
function boot() {
  // theme: saved choice, else follow the system
  applyTheme(store.get('theme', null) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  paintSoundBtn();
  $('#year').textContent = new Date().getFullYear();
  $('#jokeText').textContent = pick(JOKES);
  $('#factText').textContent = pick(FACTS);
  $('#popperRing').style.strokeDasharray = String(RING);
  $('#refreshEvery').textContent = REFRESH;

  renderNav();
  renderAuthSlot();
  renderProfileWidget();
  if (feed.size) renderAll();
  else { renderSources(); updateStatusLine(); }

  codme = initCodme({
    items: () => feed.all(),
    status: sourceCounts,
    userName: () => (auth.user ? auth.getProfile().nickname : null),
    saved: () => getData().saved.map((s) => feed.get(s.key) || s),
    isSaved: (key) => getData().saved.some((s) => s.key === key),
    remember: (items) => items.forEach((i) => { if (!feed.get(i.key)) extraItems.set(i.key, i); }),
    trends: () => trends(feed.all(), 8),
    aiEnabled: () => !!auth.apiBase,
    ai: (messages) => auth.api('/api/codme', { method: 'POST', body: { messages } }),
    onAsk: () => { const d = getData(); d.codmeAsks = (d.codmeAsks || 0) + 1; setData(d); checkAchievements(); },
  });

  community = initCommunity({
    openAuth,
    onSent: () => { const d = getData(); d.chatSent = (d.chatSent || 0) + 1; setData(d); addXp(2); },
    onVote: () => { const d = getData(); d.pollVotes = (d.pollVotes || 0) + 1; setData(d); addXp(5); },
    badgeInfo: (id) => ACHIEVEMENTS.find((a) => a.id === id),
    rankTitle: (xp) => rankFor(xp).title,
  });

  // ---- global click delegation ----
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const actionEl = t.closest('[data-action]');
    if (actionEl) {
      if (actionEl.tagName === 'A') e.preventDefault();
      handleAction(actionEl.dataset.action, actionEl);
    }
    if (!t.closest('.user-menu')) closeMenus();
    const catBtn = t.closest('[data-cat]');
    if (catBtn) setCat(catBtn.dataset.cat);
    const trend = t.closest('[data-trend]');
    if (trend) setQuery(trend.dataset.trend);
    const sortBtn = t.closest('[data-sort]');
    if (sortBtn) {
      if (sortBtn.dataset.sort === 'chaos') { state.chaosSeed = Math.random(); sfx.boing(); burstFrom(sortBtn, { emojis: ['🎲', '🌀'], count: 8 }); }
      state.sort = sortBtn.dataset.sort;
      store.set('sort', state.sort === 'chaos' ? 'newest' : state.sort);
      renderFeed();
    }
    const tickerLink = t.closest('[data-read-key]');
    if (tickerLink && tickerLink.dataset.readKey) markRead(tickerLink.dataset.readKey, e);
    const card = t.closest('[data-key]');
    if (card) {
      const key = card.dataset.key;
      let b;
      if ((b = t.closest('[data-save]'))) toggleSave(key, b);
      else if ((b = t.closest('[data-react]'))) react(key, b);
      else if ((b = t.closest('[data-emojify]'))) emojifyCard(key, b);
      else if (t.closest('[data-share]')) share(key);
      else if (t.closest('[data-chatshare]')) { const it = findItem(key); if (it && community) community.share(it); else if (!community) toast('Chat needs the kerNEl server.', { emoji: '💬' }); }
      else if (t.closest('[data-open]')) markRead(key, e);
    }
  });
  document.addEventListener('auxclick', (e) => {
    const card = e.target instanceof Element && e.target.closest('[data-key]');
    if (card && e.target.closest('[data-open]')) markRead(card.dataset.key, e);
  });

  // ---- search ----
  const search = $('#search');
  const runSearch = debounce(() => { state.query = search.value.trim(); state.limit = PAGE; renderFeed(); }, 180);
  search.addEventListener('input', runSearch);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; runSearch(); search.blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      state.query = search.value.trim();
      renderFeed();
      $('#feedSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // ---- sign in / sign up / forgot password ----
  $$('.auth-tab, .auth-link').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
  $$('#authDialog .pw-eye').forEach((eye) => eye.addEventListener('click', () => {
    const input = eye.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.textContent = show ? '🙈' : '👁️';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
  $('#authDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget && authMode !== 'code') e.currentTarget.close(); });
  $('#authDialog').addEventListener('cancel', (e) => { if (authMode === 'code') e.preventDefault(); }); // don't lose the code by pressing Esc
  $('#profileDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#accountDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  const signupForm = $('#signupForm');
  const nameCheck = signupForm.querySelector('.name-check');
  const checkName = debounce(async () => {
    const name = signupForm.elements.username.value.trim();
    if (!name) { nameCheck.textContent = ''; return; }
    if (!USERNAME_RE.test(name)) { nameCheck.textContent = '✗ 3–20 letters, numbers or _'; nameCheck.className = 'name-check bad'; return; }
    try {
      const r = await auth.checkUsername(name);
      if (signupForm.elements.username.value.trim() !== name) return;
      nameCheck.textContent = r.available ? `✓ @${name} is free!` : `✗ ${r.reason || 'Taken'}`;
      nameCheck.className = `name-check ${r.available ? 'good' : 'bad'}`;
    } catch { nameCheck.textContent = ''; }
  }, 350);
  signupForm.elements.username.addEventListener('input', () => { checkName(); paintStrength(signupForm); });
  signupForm.elements.password.addEventListener('input', () => paintStrength(signupForm));

  $('#signinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runAuthForm(e.currentTarget, (f) => {
      if (!f.username.value.trim() || !f.password.value) throw new Error('Type your username and password');
      return auth.login(f.username.value.trim(), f.password.value);
    });
  });
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runAuthForm(e.currentTarget, (f) => {
      const name = f.username.value.trim();
      if (!USERNAME_RE.test(name)) throw new Error('Usernames are 3–20 letters, numbers or underscores');
      if (f.password.value.length < 8) throw new Error('Passwords need at least 8 characters');
      if (f.password.value !== f.confirm.value) throw new Error('The two passwords don’t match');
      return auth.register(name, f.password.value, { leaderboard: f.leaderboard.checked });
    });
  });
  $('#recoverForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runAuthForm(e.currentTarget, (f) => {
      if (!f.username.value.trim() || !f.code.value.trim()) throw new Error('Type your username and recovery code');
      if (f.password.value.length < 8) throw new Error('New passwords need at least 8 characters');
      return auth.recover(f.username.value.trim(), f.code.value, f.password.value);
    });
  });
  $('#codeSaved').addEventListener('change', (e) => { $('#codeDone').disabled = !e.target.checked; });
  $('#codeDone').addEventListener('click', () => {
    $('#authDialog').close();
    const then = afterCode;
    afterCode = null;
    then?.();
  });
  $$('[data-code]').forEach((b) => b.addEventListener('click', async () => {
    const code = $('#recoveryCode').textContent;
    if (b.dataset.code === 'copy') {
      try { await navigator.clipboard.writeText(code); toast('Recovery code copied — paste it somewhere safe!', { emoji: '📋' }); }
      catch { toast('Couldn’t copy — select the code and copy it by hand.', { emoji: '✍️' }); }
    } else {
      const text = `kerNEl recovery code for @${auth.user?.username || ''}\n\n${code}\n\nUse it on the “Forgot your password?” screen if you ever forget your password.\n`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = `kernel-recovery-code-${auth.user?.username || 'account'}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    $('#codeSaved').checked = true;
    $('#codeDone').disabled = false;
  }));

  // ---- account & security ----
  $('#passwordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runAuthForm(e.currentTarget, async (f) => {
      if (f.password.value.length < 8) throw new Error('New passwords need at least 8 characters');
      await auth.changePassword(f.current.value, f.password.value);
      e.target.reset();
      toast('Password changed! Other devices were signed out.', { emoji: '🔑' });
      sfx.ding();
    });
  });
  $('#newCodeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runAuthForm(e.currentTarget, async (f) => {
      const { recoveryCode } = await auth.newRecoveryCode(f.password.value);
      $('#accountDialog').close();
      showRecoveryCode(recoveryCode, () => toast('New recovery code saved. The old one no longer works.', { emoji: '🛟' }));
    });
  });
  $('#deleteAccount').addEventListener('click', async () => {
    const name = auth.user?.username;
    const typed = prompt(`This deletes @${name} and ALL its progress forever.\n\nType your username to confirm:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== String(name).toLowerCase()) { toast('Username didn’t match — nothing was deleted.', { emoji: '😅' }); return; }
    try {
      await auth.deleteAccount();
      $('#accountDialog').close();
      toast('Account deleted. Thanks for popping by. 🍿', { emoji: '👋', ms: 6000 });
    } catch (err) { toast(err.message, { emoji: '😵', type: 'error' }); }
  });

  auth.addEventListener('signin', (e) => {
    const { profile, isNew, serverData, recoveryCode, user } = e.detail;
    if (isNew) migrateGuest();
    if (serverData) setData(mergeData(getData(), serverData));
    applyServerExtras({ data: serverData, streak: e.detail.streak });
    if (isNew) setData(getData()); // push guest progress + settings to the new account
    heroSig = '';
    renderAuthSlot(); renderNav(); renderProfileWidget(); renderAchievements(); renderHero(); renderFeed();
    loadLeaderboard();
    burst(window.innerWidth / 2, window.innerHeight / 3, { count: 30, emojis: ['🎉', '🍿', '✨', '🥳'] });
    sfx.win();
    const welcome = () => {
      if (isNew) {
        toast(`Account created — welcome to the kerNEl, @${user.username}!`, { emoji: '🎉', ms: 5000 });
        setTimeout(() => openProfile(true), 300);
      } else {
        toast(`Welcome back, ${profile.nickname}!`, { emoji: '👋' });
      }
      dailyCheckin();
    };
    if (recoveryCode) showRecoveryCode(recoveryCode, welcome);
    else { $('#authDialog').close(); welcome(); }
  });
  auth.addEventListener('signout', (e) => {
    if (state.cat === 'foryou') state.cat = 'all';
    heroSig = '';
    renderAuthSlot(); renderNav(); renderProfileWidget(); renderAchievements(); renderHero(); renderFeed();
    loadLeaderboard();
    if (!e.detail?.quiet) toast('Signed out. The kernel misses you already 🥲', { emoji: '👋' });
  });
  auth.addEventListener('expired', () => toast('Your session expired — please sign in again.', { emoji: '⏰', ms: 6000 }));
  // A saved session: check it's still valid, pull progress from other devices, count today's visit.
  if (auth.user?.apiToken) {
    auth.refreshFromServer()
      .then((u) => {
        if (!u) return;
        setData(mergeData(getData(), u.data));
        applyServerExtras(u);
        renderProfileWidget(); renderAchievements(); renderFeed();
        dailyCheckin();
      })
      .catch(() => {});
  }
  renderAchievements();
  loadLeaderboard();
  auth.addEventListener('profile', () => { renderAuthSlot(); renderProfileWidget(); if (state.cat === 'foryou') renderFeed(); });

  $('#profileForm').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save') return;
    const fd = new FormData(e.currentTarget);
    const p = auth.getProfile();
    p.nickname = String(fd.get('nickname') || '').trim().slice(0, 24) || p.nickname;
    p.avatar = String(fd.get('avatar') || p.avatar);
    p.topics = fd.getAll('topics').map(String);
    if (auth.user) p.leaderboard = fd.get('leaderboard') === 'on';
    auth.saveProfile(p);
    setTimeout(loadLeaderboard, 800);
    renderNav();
    toast('Name tag updated — looking sharp!', { emoji: '🏷️' });
    burst(window.innerWidth / 2, window.innerHeight / 2, { count: 18 });
    sfx.ding();
  });

  // ---- keyboard shortcuts ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
    const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === '/') { e.preventDefault(); search.focus(); }
    else if (e.key === 'r') refreshNow(true);
    else if (e.key === 'c') codme?.toggle();
    else if (e.key === 't') community?.toggle();
  });

  onKonami(() => {
    rain(['🍿', '🌽', '🧈', '🎮'], 80);
    sfx.win();
    const d = getData();
    if (!d.konami) {
      d.konami = true;
      setData(d);
      addXp(100); // also unlocks the Cheat Coder achievement
      toast('CHEAT CODE ACCEPTED: +100 XP 🎮', { emoji: '🕹️', ms: 5000 });
    } else {
      toast('Cheat code still works. Popcorn is infinite. 🍿', { emoji: '🕹️' });
    }
  });

  initDoomscroll(({ meters, emoji, text }) => {
    $('#scrollEmoji').textContent = emoji;
    $('#scrollText').textContent = `You’ve scrolled ${meters} today — that’s ${text}.`;
  });

  // ---- the 30-second heartbeat ----
  let ticks = 0;
  setInterval(() => {
    updatePopper();
    if (!feed.loading && Date.now() >= nextAt && !document.hidden) refreshNow();
    if (++ticks % 15 === 0) updateTimes();
    updateStatusLine();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() >= nextAt) refreshNow();
  });

  refreshNow();
}

boot();
