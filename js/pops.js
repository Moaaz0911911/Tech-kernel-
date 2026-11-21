// 🫧 Pops: 24-hour posts for the people who follow you — a text card, a photo or a kerNEl story.
// A row of rings at the top of Messages, a full-screen viewer (tap to skip, hold to pause), replies and reactions.
import { $$, esc, timeAgo, toast, safeUrl } from './utils.js';
import { catById } from './news.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tn, tServer } from './i18n.js';
import { lookHTML } from './look.js';

const BACKGROUNDS = 8;
const ROW_MS = 60_000;
const PHOTO_SIDE = 1080;
const PHOTO_BYTES = 430_000;

const showMs = (p) => (p.kind === 'text' ? Math.min(10_000, 4500 + p.text.length * 35) : p.kind === 'story' ? 8000 : 6000);
const photoSrc = (key) => `${auth.apiBase}/api/pops/photo/${encodeURIComponent(key)}`;
const sizeClass = (s) => (s.length < 40 ? 'big' : s.length < 110 ? 'mid' : 'small');

/** Shrink a picked photo to at most 1080 px on its long side and about 430 KB. */
async function shrinkPhoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error(t('That photo didn’t work — try a JPG or PNG'));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(t('That photo didn’t work — try a JPG or PNG'))); i.src = url; });
    for (const [side, q] of [[PHOTO_SIDE, 0.82], [PHOTO_SIDE, 0.68], [860, 0.66], [700, 0.6]]) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', q);
      if ((data.length - 23) * 0.75 <= PHOTO_BYTES) return data;
    }
    throw new Error(t('That photo is too big'));
  } finally { URL.revokeObjectURL(url); }
}

export function initPops({ openAuth, openStory, openProfile } = {}) {
  let rings = [];
  let reacts = ['🔥', '😂', '😮', '❤️', '👏', '🍿'];
  let loaded = false;
  let loadedAt = 0;
  const rows = new Set();

  // ---------------- the row of rings ----------------
  const meLook = () => ({ ...auth.getProfile(), username: auth.user?.username });
  function rowHTML() {
    const mine = rings.find((r) => r.me);
    const others = rings.filter((r) => !r.me);
    const meItem = `<div class="pop-item pop-me">
        <button type="button" class="pop-avatar" ${mine ? 'data-pop-ring="me"' : 'data-pop-new'} aria-label="${esc(mine ? t('See your pop') : t('Add a pop'))}">
          <span class="pop-ring ${mine ? 'seen' : 'none'}">${lookHTML(mine ? mine.user : meLook())}</span></button>
        <button type="button" class="pop-plus" data-pop-new aria-label="${esc(t('Add a pop'))}">+</button>
        <small>${t('Your pop')}</small></div>`;
    return `<div class="pops-strip" role="list">${meItem}${others.map((r) => `<div class="pop-item" role="listitem">
        <button type="button" class="pop-avatar" data-pop-ring="${esc(r.user.username)}" aria-label="${esc(t('Pops from {name}', { name: r.user.nickname }))}${r.unseen ? ` (${esc(tn(r.unseen, '{n} new', '{n} new'))})` : ''}">
          <span class="pop-ring ${r.unseen ? 'unseen' : 'seen'}">${lookHTML(r.user)}</span></button>
        <small dir="auto">${esc(r.user.nickname)}</small></div>`).join('')}</div>`;
  }
  function paintRows() {
    for (const el of rows) {
      if (!el.isConnected) { rows.delete(el); continue; }
      el.hidden = !auth.user;
      if (auth.user) el.innerHTML = rowHTML();
    }
  }
  async function load(force = false) {
    if (!auth.user || (!force && Date.now() - loadedAt < 15_000)) { paintRows(); return; }
    loadedAt = Date.now();
    try {
      const r = await auth.api('/api/pops');
      rings = r.rings;
      reacts = r.reacts || reacts;
      loaded = true;
    } catch { /* offline: keep what we had */ }
    paintRows();
  }
  setInterval(() => { if (!document.hidden && [...rows].some((el) => el.isConnected && el.offsetParent)) load(true); }, ROW_MS);
  auth.addEventListener('signin', () => { rings = []; loaded = false; load(true); });
  auth.addEventListener('signout', () => { rings = []; loaded = false; paintRows(); });

  function mountRow(el) {
    rows.add(el);
    el.classList.add('pops-row');
    el.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target : null;
      if (b?.closest('[data-pop-new]')) return compose();
      const ring = b?.closest('[data-pop-ring]');
      if (ring) {
        const name = ring.dataset.popRing;
        const i = rings.findIndex((r) => (name === 'me' ? r.me : r.user.username === name));
        if (i >= 0) openViewer(rings, i);
      }
    });
    paintRows();
    if (!loaded) load(true);
  }

  // ---------------- the viewer ----------------
  const V = document.createElement('dialog');
  V.className = 'pop-viewer';
  V.setAttribute('aria-label', t('Pops'));
  V.innerHTML = `<div class="pv-stage">
      <div class="pv-bars" aria-hidden="true"></div>
      <header class="pv-head">
        <button type="button" class="pv-who" data-pv="who"></button>
        <span class="pv-spacer"></span>
        <button type="button" class="pv-btn" data-pv="pause" aria-label="${esc(t('Pause'))}">❚❚</button>
        <button type="button" class="pv-btn" data-pv="menu" aria-label="${esc(t('More options'))}" aria-haspopup="menu">⋯</button>
        <button type="button" class="pv-btn" data-pv="close" aria-label="${esc(t('Close'))}">✕</button>
        <div class="pv-menu glass" role="menu" hidden></div>
      </header>
      <div class="pv-body" data-pv-tap></div>
      <footer class="pv-foot"></footer>
      <div class="pv-sheet" hidden></div>
    </div>`;
  document.body.append(V);
  const bars = V.querySelector('.pv-bars');
  const body = V.querySelector('.pv-body');
  const foot = V.querySelector('.pv-foot');
  const who = V.querySelector('.pv-who');
  const menu = V.querySelector('.pv-menu');
  const sheet = V.querySelector('.pv-sheet');

  let list = [];       // rings being shown
  let ri = 0;          // ring index
  let pi = 0;          // pop index in that ring
  let started = 0;     // when the current pop started (minus paused time)
  let pausedAt = 0;
  let holds = 0;       // reasons to pause: typing, menu, sheet, holding
  let raf = 0;
  const reasons = new Set();

  const ring = () => list[ri];
  const pop = () => ring()?.pops[pi];
  const pause = (why) => { if (!reasons.size) pausedAt = performance.now(); reasons.add(why); paintPause(); };
  const resume = (why) => {
    if (!reasons.delete(why)) return;
    if (!reasons.size && pausedAt) { started += performance.now() - pausedAt; pausedAt = 0; }
    paintPause();
  };
  const paintPause = () => { const b = V.querySelector('[data-pv="pause"]'); b.textContent = reasons.has('button') ? '▶' : '❚❚'; b.setAttribute('aria-label', reasons.has('button') ? t('Play') : t('Pause')); };

  function tick() {
    cancelAnimationFrame(raf);
    if (!V.open) return;
    const p = pop();
    if (!p) return;
    const now = reasons.size ? pausedAt : performance.now();
    const k = Math.min(1, (now - started) / showMs(p));
    const cur = bars.children[pi];
    if (cur) cur.style.setProperty('--k', String(k));
    if (k >= 1) { next(); return; }
    raf = requestAnimationFrame(tick);
  }

  function bodyHTML(p) {
    if (p.kind === 'text') return `<div class="pv-text pop-bg-${p.bg % BACKGROUNDS}"><p dir="auto" class="${sizeClass(p.text)}">${esc(p.text).replace(/\n/g, '<br>')}</p></div>`;
    if (p.kind === 'photo') {
      return `<div class="pv-photo"><img src="${esc(photoSrc(p.photo))}" alt="" draggable="false" onerror="this.closest('.pv-photo').classList.add('gone')"><span class="pv-gone">🫧 ${t('That pop is gone')}</span>
        ${p.text ? `<p class="pv-caption" dir="auto">${esc(p.text)}</p>` : ''}</div>`;
    }
    const s = p.story || {};
    const c = catById(s.cat);
    const pic = s.image && safeUrl(s.image) !== '#' ? `<img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="pv-story-emoji" aria-hidden="true">${c.emoji}</span>`;
    return `<div class="pv-storywrap pop-bg-${p.bg % BACKGROUNDS}">
        ${p.text ? `<p class="pv-say" dir="auto">${esc(p.text)}</p>` : ''}
        <button type="button" class="pv-story" data-pv="read">${pic}<span><small>${c.emoji} ${esc(t(c.label))}</small><b dir="auto">${esc(s.title || '')}</b><small>${esc(s.source || s.domain || '')}</small><span class="pv-read">${t('Read the story')} ›</span></span></button>
      </div>`;
  }

  function footHTML(r, p) {
    if (r.me) {
      return `<button type="button" class="pv-chip" data-pv="viewers">👁 ${tn(p.views || 0, '{n} view', '{n} views')}</button>
        ${p.hidden ? `<span class="pv-chip warn">🚩 ${t('Hidden after reports')}</span>` : ''}
        <span class="pv-spacer"></span>
        <button type="button" class="pv-chip" data-pv="add">＋ ${t('Add')}</button>
        <button type="button" class="pv-chip" data-pv="delete" aria-label="${esc(t('Delete pop'))}">🗑️</button>`;
    }
    return `<form class="pv-reply" data-pv-reply><input maxlength="500" autocomplete="off" enterkeyhint="send" placeholder="${esc(t('Reply to @{name}…', { name: r.user.username }))}" aria-label="${esc(t('Reply'))}"><button type="submit" aria-label="${esc(t('Send'))}">➤</button></form>
      <div class="pv-reacts">${reacts.map((e) => `<button type="button" data-pv-react="${e}" aria-pressed="${p.myReact === e}">${e}</button>`).join('')}</div>`;
  }

  function show() {
    const r = ring();
    const p = pop();
    if (!r || !p) { close(); return; }
    menu.hidden = true;
    sheet.hidden = true;
    reasons.delete('menu');
    reasons.delete('sheet');
    reasons.delete('typing');
    reasons.delete('hold');
    bars.innerHTML = r.pops.map((x, i) => `<span style="--k:${i < pi ? 1 : 0}"></span>`).join('');
    who.innerHTML = `${lookHTML(r.user)}<span><b dir="auto">${esc(r.me ? t('Your pop') : r.user.nickname)}</b><small>${esc(timeAgo(p.created))}</small></span>`;
    who.dataset.user = r.user.username;
    body.innerHTML = bodyHTML(p);
    foot.innerHTML = footHTML(r, p);
    // preload the next photo
    const nx = r.pops[pi + 1] || list[ri + 1]?.pops[0];
    if (nx?.photo) { const i = new Image(); i.src = photoSrc(nx.photo); }
    started = performance.now();
    pausedAt = reasons.size ? started : 0;
    if (!r.me && !p.seen) {
      p.seen = true;
      r.unseen = Math.max(0, (r.unseen || 0) - 1);
      auth.api('/api/pops/view', { method: 'POST', body: { id: p.id } }).catch(() => {});
      paintRows();
    }
    tick();
  }

  function next() {
    const r = ring();
    if (r && pi < r.pops.length - 1) { pi++; show(); return; }
    if (ri < list.length - 1) { ri++; pi = firstUnseen(ring()); show(); return; }
    close();
  }
  function prev() {
    if (pi > 0) { pi--; show(); return; }
    if (ri > 0) { ri--; pi = 0; show(); return; }
    started = performance.now();
    if (reasons.size) pausedAt = started;
  }
  const firstUnseen = (r) => { const i = r.pops.findIndex((p) => !p.seen); return i < 0 ? 0 : i; };

  function openViewer(fromList, index) {
    list = fromList;
    ri = index;
    pi = firstUnseen(ring());
    reasons.clear();
    if (!V.open) V.showModal();
    sfx.blip();
    show();
  }
  function close() {
    cancelAnimationFrame(raf);
    if (V.open) V.close();
    paintRows();
  }
  V.addEventListener('close', () => { cancelAnimationFrame(raf); reasons.clear(); });
  V.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowRight') { e.preventDefault(); (rtl ? prev : next)(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); (rtl ? next : prev)(); }
    if (e.key === ' ') { e.preventDefault(); if (reasons.has('button')) resume('button'); else pause('button'); }
  });

  // tap the left third to go back, anywhere else to go on; press and hold to pause
  let downAt = 0;
  body.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-pv="read"]')) return;
    downAt = performance.now();
    pause('hold');
  });
  const release = (e) => {
    if (!downAt) return;
    const held = performance.now() - downAt;
    downAt = 0;
    resume('hold');
    if (held > 280 || e.type === 'pointercancel') return;
    const box = V.querySelector('.pv-stage').getBoundingClientRect();
    const x = (e.clientX - box.left) / (box.width || 1);
    const rtl = document.documentElement.dir === 'rtl';
    const back = rtl ? x > 2 / 3 : x < 1 / 3;
    if (back) prev(); else next();
  };
  body.addEventListener('pointerup', release);
  body.addEventListener('pointercancel', release);
  body.addEventListener('contextmenu', (e) => e.preventDefault());

  foot.addEventListener('focusin', () => pause('typing'));
  foot.addEventListener('focusout', () => setTimeout(() => { if (!foot.contains(document.activeElement)) resume('typing'); }, 0));
  foot.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = foot.querySelector('input');
    const text = input.value.trim();
    const r = ring();
    const p = pop();
    if (!text || !r || !p) return;
    input.disabled = true;
    try {
      await auth.api('/api/dm', { method: 'POST', body: { to: r.user.username, text, pop: p.id } });
      input.value = '';
      toast(t('Reply sent to @{name} ✉️', { name: r.user.username }), { emoji: '✉️' });
      sfx.pop();
      input.blur();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    input.disabled = false;
  });

  async function react(emoji, btn) {
    const p = pop();
    if (!p) return;
    const nextReact = p.myReact === emoji ? null : emoji;
    p.myReact = nextReact;
    $$('[data-pv-react]', foot).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pvReact === nextReact)));
    if (nextReact) { burstFrom(btn, { emojis: [emoji], count: 10, spread: 70 }); sfx.pop(); }
    try { await auth.api('/api/pops/view', { method: 'POST', body: { id: p.id, react: nextReact } }); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }

  async function showViewers() {
    const p = pop();
    if (!p) return;
    pause('sheet');
    sheet.hidden = false;
    sheet.innerHTML = `<div class="pv-sheet-head"><b>👁 ${t('Seen by')}</b><button type="button" class="pv-btn" data-pv="sheet-close" aria-label="${esc(t('Close'))}">✕</button></div><div class="pv-sheet-list"><div class="chat-empty"><span class="spin">🫧</span></div></div>`;
    try {
      const r = await auth.api(`/api/pops/${p.id}/viewers`);
      const box = sheet.querySelector('.pv-sheet-list');
      if (!box) return;
      box.innerHTML = r.viewers.length
        ? r.viewers.map((v) => `<button type="button" class="pv-viewer" data-pv-user="${esc(v.username)}">${lookHTML(v)}<span><b dir="auto">${esc(v.nickname)}</b><small>@${esc(v.username)} · ${esc(timeAgo(v.at))}</small></span>${v.react ? `<span class="pv-viewer-react">${esc(v.react)}</span>` : ''}</button>`).join('')
        : `<p class="muted small">${t('Nobody yet — your followers will see it soon 🍿')}</p>`;
    } catch (err) { sheet.querySelector('.pv-sheet-list').innerHTML = `<p class="muted small">😵 ${esc(tServer(err.message))}</p>`; }
  }

  V.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el === V) { close(); return; } // the backdrop
    if (!el.closest('[data-pv="menu"]') && !menu.hidden && !el.closest('.pv-menu')) { menu.hidden = true; resume('menu'); }
    const rb = el.closest('[data-pv-react]');
    if (rb) return react(rb.dataset.pvReact, rb);
    const vu = el.closest('[data-pv-user]');
    if (vu) { close(); openProfile?.(vu.dataset.pvUser); return; }
    const b = el.closest('[data-pv]');
    if (!b) return;
    const what = b.dataset.pv;
    const r = ring();
    const p = pop();
    if (what === 'close') return close();
    if (what === 'pause') { if (reasons.has('button')) resume('button'); else pause('button'); return; }
    if (what === 'who') { close(); openProfile?.(r.user.username); return; }
    if (what === 'read') { close(); openStory?.(p.story); return; }
    if (what === 'viewers') return showViewers();
    if (what === 'sheet-close') { sheet.hidden = true; resume('sheet'); return; }
    if (what === 'add') { close(); compose(); return; }
    if (what === 'menu') {
      menu.innerHTML = r.me
        ? `<button type="button" role="menuitem" data-pv="delete">🗑️ ${t('Delete pop')}</button>`
        : `<button type="button" role="menuitem" data-pv="profile">👤 ${t('View profile')}</button><button type="button" role="menuitem" data-pv="report">🚩 ${t('Report pop')}</button>`;
      menu.hidden = !menu.hidden;
      if (menu.hidden) resume('menu'); else pause('menu');
      return;
    }
    menu.hidden = true;
    resume('menu');
    if (what === 'profile') { close(); openProfile?.(r.user.username); return; }
    if (what === 'delete') {
      pause('confirm');
      const yes = confirm(t('Delete this pop?'));
      resume('confirm');
      if (!yes) return;
      try {
        await auth.api(`/api/pops/${p.id}`, { method: 'DELETE' });
        r.pops.splice(pi, 1);
        if (!r.pops.length) { rings = rings.filter((x) => x !== r); list = list.filter((x) => x !== r); close(); load(true); return; }
        pi = Math.min(pi, r.pops.length - 1);
        show();
        toast(t('Pop deleted.'), { emoji: '🗑️' });
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      return;
    }
    if (what === 'report') {
      pause('confirm');
      const yes = confirm(t('Report this pop for being mean, unsafe or spammy?'));
      resume('confirm');
      if (!yes) return;
      try { await auth.api('/api/pops/report', { method: 'POST', body: { id: p.id } }); toast(t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' }); next(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });

  // ---------------- the composer ----------------
  const C = document.createElement('dialog');
  C.className = 'modal pop-compose';
  C.innerHTML = `<button type="button" class="modal-x" data-pc="close" aria-label="${esc(t('Close'))}">✕</button>
    <h2>🫧 ${t('New pop')}</h2>
    <div class="seg pc-seg" role="tablist"><button type="button" role="tab" data-pc-mode="text">Aa ${t('Text')}</button><button type="button" role="tab" data-pc-mode="photo">📷 ${t('Photo')}</button></div>
    <div class="pc-preview"></div>
    <div class="pc-bgs" role="radiogroup" aria-label="${esc(t('Background'))}">${Array.from({ length: BACKGROUNDS }, (_, i) => `<button type="button" role="radio" class="pop-bg-${i}" data-pc-bg="${i}" aria-label="${esc(t('Background {n}', { n: i + 1 }))}"></button>`).join('')}</div>
    <input type="file" accept="image/*" hidden data-pc-file>
    <p class="muted small pc-note">👯 ${t('The people who follow you can see it for 24 hours.')}</p>
    <button type="button" class="btn btn-primary btn-block" data-pc="post">🫧 ${t('Share pop')}</button>`;
  document.body.append(C);
  const preview = C.querySelector('.pc-preview');
  const fileIn = C.querySelector('[data-pc-file]');
  let draft = { kind: 'text', text: '', bg: 0, photo: null, story: null };

  function paintComposer() {
    C.querySelector('.pc-seg').hidden = draft.kind === 'story';
    $$('[data-pc-mode]', C).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pcMode === draft.kind)));
    C.querySelector('.pc-bgs').hidden = draft.kind === 'photo';
    $$('[data-pc-bg]', C).forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.pcBg) === draft.bg)));
    if (draft.kind === 'text') {
      preview.className = `pc-preview pop-bg-${draft.bg}`;
      preview.innerHTML = `<textarea data-pc-text maxlength="200" dir="auto" placeholder="${esc(t('What’s popping? 🍿'))}" aria-label="${esc(t('Your pop'))}">${esc(draft.text)}</textarea>`;
    } else if (draft.kind === 'photo') {
      preview.className = 'pc-preview pc-photo';
      preview.innerHTML = draft.photo
        ? `<img src="${draft.photo}" alt=""><button type="button" class="pv-chip pc-change" data-pc="pick">📷 ${t('Change photo')}</button><input data-pc-text maxlength="200" dir="auto" placeholder="${esc(t('Add a caption…'))}" value="${esc(draft.text)}" aria-label="${esc(t('Caption'))}">`
        : `<button type="button" class="pc-pick" data-pc="pick"><span>📷</span>${t('Pick a photo')}</button>`;
    } else {
      const s = draft.story;
      const c = catById(s.cat);
      preview.className = `pc-preview pop-bg-${draft.bg}`;
      preview.innerHTML = `<div class="pv-story pc-story">${s.image && safeUrl(s.image) !== '#' ? `<img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="pv-story-emoji">${c.emoji}</span>`}<span><b dir="auto">${esc(s.title)}</b><small>${esc(s.source || s.domain || '')}</small></span></div>
        <input data-pc-text maxlength="200" dir="auto" placeholder="${esc(t('Say something about it…'))}" value="${esc(draft.text)}" aria-label="${esc(t('Caption'))}">`;
    }
  }

  function compose({ story = null } = {}) {
    if (!auth.user) { toast(t('Sign in to post pops 🫧'), { emoji: '🫧' }); openAuth?.('signin'); return; }
    draft = story
      ? { kind: 'story', text: '', bg: Math.floor(Math.random() * BACKGROUNDS), photo: null, story: { key: story.key, title: story.title, url: story.url, source: story.source, cat: story.cat, image: story.image, domain: story.domain } }
      : { kind: 'text', text: '', bg: Math.floor(Math.random() * BACKGROUNDS), photo: null, story: null };
    paintComposer();
    if (!C.open) C.showModal();
    setTimeout(() => C.querySelector('[data-pc-text]')?.focus(), 80);
  }

  C.addEventListener('input', (e) => { if (e.target.matches?.('[data-pc-text]')) draft.text = e.target.value; });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    preview.innerHTML = '<div class="chat-empty"><span class="spin">📷</span></div>';
    try { draft.photo = await shrinkPhoto(f); } catch (err) { toast(err.message, { emoji: '😵' }); }
    paintComposer();
  });
  C.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const m = el.closest('[data-pc-mode]');
    if (m) { draft.kind = m.dataset.pcMode; paintComposer(); if (draft.kind === 'photo' && !draft.photo) fileIn.click(); return; }
    const bg = el.closest('[data-pc-bg]');
    if (bg) { draft.bg = Number(bg.dataset.pcBg); paintComposer(); return; }
    const b = el.closest('[data-pc]');
    if (!b) return;
    if (b.dataset.pc === 'close') { C.close(); return; }
    if (b.dataset.pc === 'pick') { fileIn.click(); return; }
    if (b.dataset.pc === 'post') {
      const body = { kind: draft.kind, text: draft.text.trim(), bg: draft.bg };
      if (draft.kind === 'text' && !body.text) { toast(t('Write something first!'), { emoji: '✏️' }); return; }
      if (draft.kind === 'photo') { if (!draft.photo) { fileIn.click(); return; } body.photo = draft.photo; }
      if (draft.kind === 'story') body.storyKey = draft.story.key;
      b.disabled = true;
      try {
        await auth.api('/api/pops', { method: 'POST', body });
        C.close();
        toast(t('Popped! Your followers can see it for 24 hours 🫧'), { emoji: '🫧' });
        sfx.ding();
        burstFrom(document.querySelector('.pops-row:not([hidden]) .pop-me') || document.body, { emojis: ['🫧', '✨', '🍿'], count: 14 });
        await load(true);
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
      b.disabled = false;
    }
  });

  /** Open someone's pops straight from their profile card. */
  async function openUser(username) {
    if (!auth.user) { openAuth?.('signin'); return; }
    try {
      const r = await auth.api(`/api/pops?user=${encodeURIComponent(username)}`);
      if (!r.rings.length) { toast(t('No pops right now.'), { emoji: '🫧' }); return; }
      reacts = r.reacts || reacts;
      openViewer(r.rings, 0);
      load(true);
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  }

  return { mountRow, refresh: () => load(true), compose, openUser };
}
