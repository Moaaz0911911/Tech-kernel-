// ☀️ Morning Drop, 🔔 followed topics and companies, 🕰️ "how we got here" timelines in the reader.
import { $, esc, toast, store, safeUrl } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer, fmtDate, fmtTime } from './i18n.js';

const SUGGEST_FALLBACK = ['OpenAI', 'Apple', 'Google', 'Nvidia', 'SpaceX', 'Nintendo', 'Linux', 'Rust'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const topicRe = (topic) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(topic)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
const HOURS = [6, 7, 8, 9, 10, 12, 18, 21];

export function initDiscover({ openAuth, openStory, onTopicsChange }) {
  let topics = [];          // [{ topic, today }]
  let trending = [];
  let suggested = SUGGEST_FALLBACK;
  let res = [];
  let dropHour = null;
  const key = () => `topics:${auth.profileKey()}`;

  const setTopics = (list) => {
    topics = list;
    res = topics.map((x) => topicRe(x.topic));
    store.set(key(), topics.map((x) => x.topic));
    onTopicsChange?.();
  };
  // keep the For You feed working before the server answers
  const cachedNames = () => store.get(key(), []);
  res = cachedNames().map(topicRe);

  /** Which followed topic a headline is about (or null). */
  const matchTopic = (title) => {
    const names = topics.length ? topics.map((x) => x.topic) : cachedNames();
    const list = topics.length ? res : names.map(topicRe);
    const i = list.findIndex((re) => re.test(title || ''));
    return i >= 0 ? names[i] : null;
  };

  // ---------------- 🔔 the topics widget (Me tab) ----------------
  const box = $('#topicsWidget');
  const body = $('#topicsBody');
  function paintTopics() {
    if (!box) return;
    box.hidden = !auth.ready;
    if (!auth.user) {
      body.innerHTML = `<p class="muted small">${t('Follow companies and topics like Apple, SpaceX or Rust. We’ll ping you when they’re in the news.')}</p>
        <button type="button" class="btn btn-primary btn-sm" data-action="signup">${t('Sign up to follow topics')}</button>`;
      return;
    }
    const chip = (x) => `<span class="chip tp-chip"><b dir="auto">${esc(x.topic)}</b>${x.today ? `<small>${tn(x.today, '{n} today', '{n} today')}</small>` : ''}<button type="button" data-unfollow-topic="${esc(x.topic)}" aria-label="${esc(t('Unfollow {topic}', { topic: x.topic }))}">✕</button></span>`;
    const add = (x) => `<button type="button" class="chip tp-add" data-follow-topic="${esc(x)}">＋ ${esc(x)}</button>`;
    body.innerHTML = `
      ${topics.length ? `<div class="tp-mine">${topics.map(chip).join('')}</div>` : `<p class="muted small">${t('Follow companies and topics like Apple, SpaceX or Rust. We’ll ping you when they’re in the news.')}</p>`}
      <form class="tp-form" data-topic-form><input name="topic" maxlength="30" autocomplete="off" placeholder="${esc(t('Follow a company or topic…'))}" aria-label="${esc(t('Follow a company or topic…'))}"><button class="btn btn-primary btn-sm">${t('Follow')}</button></form>
      ${trending.length ? `<p class="tp-label">🔥 ${t('Trending now')}</p><div class="tp-suggest">${trending.slice(0, 6).map(add).join('')}</div>` : ''}
      <p class="tp-label">💡 ${t('Popular')}</p><div class="tp-suggest">${suggested.slice(0, 10).map(add).join('')}</div>
      <p class="muted small">${t('Followed topics shape your ⭐ For You feed and ☀️ Morning Drop, and send up to 3 alerts a day.')}</p>`;
  }

  async function loadTopics() {
    if (!auth.user) { topics = []; res = []; paintTopics(); return; }
    try {
      const r = await auth.api('/api/topics');
      trending = r.trending || [];
      suggested = r.suggested || SUGGEST_FALLBACK;
      setTopics(r.topics || []);
    } catch { /* offline: the cached names still drive For You */ }
    paintTopics();
  }

  async function follow(topic, on = true, from = null) {
    if (!auth.user) { toast(t('Sign in to follow topics 🔔'), { emoji: '🔔' }); openAuth?.('signin'); return; }
    try {
      const r = await auth.api('/api/topics', { method: 'POST', body: { topic, follow: on } });
      trending = r.trending || trending;
      suggested = r.suggested || suggested;
      setTopics(r.topics || []);
      paintTopics();
      if (on) {
        toast(t('Following {topic}! 🔔', { topic }), { emoji: '🔔' });
        sfx.ding();
        if (from?.isConnected) burstFrom(from, { emojis: ['🔔', '✨'], count: 8, spread: 50 });
      }
      return true;
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); return false; }
  }

  box?.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-topic-form]');
    if (!f) return;
    e.preventDefault();
    const v = f.elements.topic.value.trim();
    if (v) follow(v, true, f).then((ok) => { if (ok) f.elements.topic.value = ''; });
  });
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const f = el?.closest('[data-follow-topic]');
    if (f) { follow(f.dataset.followTopic, true, f).then((ok) => { if (ok && f.closest('#readerFollow')) paintReaderFollow(); }); return; }
    const u = el?.closest('[data-unfollow-topic]');
    if (u) follow(u.dataset.unfollowTopic, false);
  });

  // ---------------- ☀️ Morning Drop ----------------
  const D = document.createElement('dialog');
  D.className = 'modal drop-dialog';
  D.innerHTML = `<form method="dialog" class="modal-x-form"><button class="modal-x" aria-label="${esc(t('Close'))}">✕</button></form>
    <div class="modal-body"><div class="drop-sun" aria-hidden="true">☀️</div><h2>${t('Morning Drop')}</h2><p class="muted small" id="dropSub"></p><ol class="drop-list" id="dropList"></ol><div class="drop-foot" id="dropFoot"></div></div>`;
  document.body.append(D);
  let drop = [];

  async function openDrop() {
    if (!D.open) D.showModal();
    $('#dropList').innerHTML = '<div class="chat-empty"><span class="spin">☀️</span></div>';
    try {
      const r = await auth.api('/api/drop');
      drop = r.stories || [];
      dropHour = r.hour ?? dropHour;
      $('#dropSub').textContent = t('The 5 stories to know today · {date}', { date: fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }) });
      $('#dropList').innerHTML = drop.map((s, i) => {
        const c = catById(s.cat);
        const pic = s.image && safeUrl(s.image) !== '#' ? `<img src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
        return `<li><button type="button" class="drop-item" data-drop="${i}"><span class="drop-n">${i + 1}</span>
          <span class="drop-text"><small>${c.emoji} ${esc(t(c.label))}${s.topic ? ` · 🔔 ${esc(s.topic)}` : ''}</small><b dir="auto">${esc(s.title)}</b>${s.summary ? `<span class="drop-sum" dir="auto">${esc(s.summary)}</span>` : ''}</span>
          ${pic ? `<span class="drop-pic">${pic}</span>` : ''}</button></li>`;
      }).join('');
      paintDropFoot();
      sfx.pop();
    } catch (err) { $('#dropList').innerHTML = `<p class="muted">😵 ${esc(tServer(err.message))}</p>`; }
  }
  const hourLabel = (h) => fmtTime(new Date(2026, 0, 1, h, 0).getTime());
  const hourSelect = () => `<select data-drop-hour aria-label="${esc(t('Morning Drop time'))}"><option value="">${t('Off')}</option>${HOURS.map((h) => `<option value="${h}" ${dropHour === h ? 'selected' : ''}>${esc(hourLabel(h))}</option>`).join('')}</select>`;
  function paintDropFoot() {
    const foot = $('#dropFoot');
    if (!auth.user) { foot.innerHTML = `<p class="muted small">${t('Sign up to get your Morning Drop every day ☀️')}</p><button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up free')}</button>`; return; }
    foot.innerHTML = `<label class="drop-when">☀️ ${t('Send me this every day at')} ${hourSelect()}</label>
      <p class="muted small">${dropHour === null ? t('It lands in your 🔔 inbox, and on your phone if notifications are on.') : t('Coming tomorrow at {time} (your time). 🔔', { time: hourLabel(dropHour) })}</p>`;
  }
  D.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (el === D) { D.close(); return; }
    const b = el?.closest('[data-drop]');
    if (b) { const s = drop[Number(b.dataset.drop)]; D.close(); openStory?.(s); }
  });

  async function setDropHour(value) {
    const h = value === '' ? null : Number(value);
    try {
      const r = await auth.api('/api/notify/prefs', { method: 'PUT', body: { dropHour: h, tz: -new Date().getTimezoneOffset() } });
      dropHour = r.dropHour ?? null;
      toast(dropHour === null ? t('Morning Drop turned off.') : t('Morning Drop set for {time} every day ☀️', { time: hourLabel(dropHour) }), { emoji: '☀️' });
      paintDropWidget();
      if (D.open) paintDropFoot();
      if (dropHour !== null && !store.get('push:on', false)) setTimeout(() => toast(t('Turn on notifications to get it on your phone 🔔'), { emoji: '🔔', ms: 5000 }), 1200);
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }
  document.addEventListener('change', (e) => { if (e.target.matches?.('[data-drop-hour]')) setDropHour(e.target.value); });

  // the Morning Drop widget on the Me tab
  function paintDropWidget() {
    const w = $('#dropWidget');
    if (!w) return;
    w.hidden = !auth.ready;
    $('#dropBody').innerHTML = `<p class="small">${t('The 5 stories to know, picked for you, at the time you choose.')}</p>
      ${auth.user ? `<label class="drop-when">${t('Every day at')} ${hourSelect()}</label>` : ''}
      <button type="button" class="btn btn-ghost btn-block" data-action="drop">☀️ ${t('See today’s drop')}</button>`;
  }
  async function loadDropHour() {
    if (!auth.user) { dropHour = null; paintDropWidget(); return; }
    try { dropHour = (await auth.api('/api/notify/prefs')).dropHour ?? null; } catch { /* keep */ }
    paintDropWidget();
  }

  // ---------------- 🕰️ + 🔔 in the reader ----------------
  let readerItem = null;
  function paintReaderFollow() {
    const el = $('#readerFollow');
    if (!el || !readerItem) return;
    const following = topics.map((x) => x.topic.toLowerCase());
    const pool = [...new Set([...suggested, ...trending, ...SUGGEST_FALLBACK, ...topics.map((x) => x.topic)])];
    const found = pool.filter((x) => topicRe(x).test(readerItem.title)).slice(0, 3);
    el.hidden = !found.length || !auth.ready;
    el.innerHTML = found.map((x) => (following.includes(x.toLowerCase())
      ? `<span class="chip tp-on">🔔 ${t('Following {topic}', { topic: esc(x) })}</span>`
      : `<button type="button" class="chip tp-add" data-follow-topic="${esc(x)}">＋ ${t('Follow {topic}', { topic: esc(x) })}</button>`)).join('');
  }
  async function readerOpened(it) {
    readerItem = it;
    paintReaderFollow();
    const sec = $('#readerTimeline');
    const list = $('#readerTlList');
    if (!sec) return;
    sec.hidden = true;
    if (!auth.ready || !it?.key) return;
    const want = it.key;
    try {
      const r = await auth.api(`/api/timeline?key=${encodeURIComponent(it.key)}`);
      if (readerItem?.key !== want || !r.items?.length) return;
      list.innerHTML = r.items.map((x) => `<li><time>${esc(fmtDate(x.time, { month: 'short', year: 'numeric' }))}</time>
        <a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer" dir="auto">${esc(x.title)}</a>${x.points ? `<small>▲ ${x.points}</small>` : ''}</li>`).join('');
      sec.hidden = false;
    } catch { /* no timeline for this one */ }
  }

  auth.addEventListener('signin', () => { loadTopics(); loadDropHour(); });
  auth.addEventListener('signout', () => { topics = []; res = []; dropHour = null; paintTopics(); paintDropWidget(); onTopicsChange?.(); });
  paintTopics();
  paintDropWidget();
  if (auth.user) { loadTopics(); loadDropHour(); }

  return { openDrop, matchTopic, hasTopics: () => (topics.length ? topics.length : cachedNames().length) > 0, readerOpened, follow };
}
