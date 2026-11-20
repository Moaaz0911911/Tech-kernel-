// kerNEl extras: 🧠 Explain / TL;DR, 🎧 daily audio briefing, 📼 Time Machine, 📱 swipe mode and 🎁 Wrapped.
import { $, $$, esc, safeUrl, timeAgo, compact, hash, toast, store } from './utils.js';
import { catById, hotness, CATEGORIES } from './news.js';
import { auth } from './auth.js';
import { sfx, burst, burstFrom, rain } from './fun.js';
import { t, tn, tServer, lang, langInfo, isRTL } from './i18n.js';
import { GLOSSARY, emojify } from './content.js';

// What each section is about, said simply (used when codme's AI isn't switched on).
const CAT_ELI10 = {
  ai: 'This is about AI: computer programs that learn from lots of examples, so they can chat, draw or spot patterns.',
  gadgets: 'This is about gadgets: the phones, laptops, watches and other devices people carry around.',
  gaming: 'This is about video games: the consoles, the games and the people who make them.',
  security: 'This is about online safety: keeping computers, accounts and secrets safe from bad guys.',
  space: 'This is about space: rockets, satellites, planets and the people exploring them.',
  dev: 'This is about coding: how programmers build the apps and websites we use every day.',
  science: 'This is about science: scientists testing ideas to learn how the world works.',
  money: 'This is about the business of tech: companies, money and who is buying or building what.',
};
const CAT_WHY = {
  ai: 'AI is changing how we search, learn and work, so every new step is a big deal.',
  gadgets: 'New gadgets change what we can do with the devices in our pockets.',
  gaming: 'Games are one of the biggest kinds of entertainment in the world.',
  security: 'Staying safe online protects your accounts, money and privacy.',
  space: 'Space tech helps with weather, maps, phones — and finding out what’s out there.',
  dev: 'Better tools for programmers mean better apps for everyone.',
  science: 'New discoveries can lead to new medicines, energy and inventions.',
  money: 'Where the money goes shows which tech will grow next.',
};

export function initExtras({ getItems, getVisible, findItem, getData, profile, rankFor, onSave, onReact, onRead, bump }) {
  // ====================================================================================
  // 🔊 speech helpers
  // ====================================================================================
  const canSpeak = 'speechSynthesis' in window;
  const voiceFor = (code) => {
    const voices = canSpeak ? speechSynthesis.getVoices() : [];
    const base = code.split('-')[0];
    return voices.find((v) => v.lang === code) || voices.find((v) => v.lang?.startsWith(base)) || (base === 'fil' ? voices.find((v) => v.lang?.startsWith('tl')) : null) || null;
  };
  /** Speak a list of [text, language] parts one after another. Headlines are English, so they get an English voice. */
  function speak(parts, { onPart, onEnd } = {}) {
    if (!canSpeak) { toast(t('Your browser can’t read aloud, sorry! 🙉'), { emoji: '🔇' }); return null; }
    speechSynthesis.cancel();
    let i = 0;
    let stopped = false;
    const next = () => {
      if (stopped) return;
      if (i >= parts.length) { onEnd?.(); return; }
      const [text, code] = parts[i];
      const u = new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, ''));
      const v = voiceFor(code);
      if (v) u.voice = v;
      u.lang = v?.lang || code;
      u.rate = 1.02;
      u.onend = () => { i++; next(); };
      u.onerror = () => { i++; next(); };
      onPart?.(i);
      speechSynthesis.speak(u);
    };
    next();
    return {
      stop() { stopped = true; speechSynthesis.cancel(); },
      skip() { speechSynthesis.cancel(); }, // onend moves on to the next part
      pause() { speechSynthesis.pause(); },
      resume() { speechSynthesis.resume(); },
    };
  }
  const myVoice = voiceFor(langInfo.speech) ? langInfo.speech : 'en-US'; // fall back to English if there's no voice for my language
  const sayMine = (text) => [text, myVoice];

  // ====================================================================================
  // 🧠 Explain like I'm 10 / ⚡ TL;DR
  // ====================================================================================
  const xDlg = $('#explainDialog');
  let xItem = null;
  let xMode = 'eli10';
  let xText = '';
  let xSpeech = null;

  function offline(item, mode) {
    const c = catById(item.cat);
    const words = Object.keys(GLOSSARY).filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(`${item.title} ${item.summary || ''}`)).slice(0, 2);
    if (mode === 'tldr') {
      return [
        `• ${t('What: {title}', { title: item.title })}`,
        `• ${t('Who reported it: {source}, {when}', { source: item.source, when: timeAgo(item.time) })}`,
        `• ${t('Why it matters: {why}', { why: t(CAT_WHY[c.id] || CAT_WHY.dev) })}`,
        `• ${t('Emoji TL;DR: {e}', { e: emojify(item.title) })}`,
      ].join('\n');
    }
    return [
      t(CAT_ELI10[c.id] || CAT_ELI10.dev),
      t('The headline says: “{title}”.', { title: item.title }),
      item.summary ? t('The publisher adds: {summary}', { summary: item.summary.slice(0, 220) }) : '',
      ...words.map((w) => `${t('Word to know')} — ${w.toUpperCase()}: ${t(GLOSSARY[w])}`),
      `💡 ${t(CAT_WHY[c.id] || CAT_WHY.dev)}`,
    ].filter(Boolean).join('\n\n');
  }

  async function explain(item, mode = xMode) {
    xItem = item;
    xMode = mode;
    xSpeech?.stop();
    $('#explainStory').textContent = item.title;
    $$('#explainDialog [data-xmode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.xmode === mode)));
    $('#explainOpen').href = safeUrl(item.url);
    const tr = $('#explainTranslate');
    tr.hidden = lang === 'en';
    if (lang !== 'en') tr.href = `https://translate.google.com/translate?sl=auto&tl=${lang === 'tl' ? 'tl' : lang}&u=${encodeURIComponent(safeUrl(item.url))}`;
    const box = $('#explainText');
    box.innerHTML = `<span class="spin">🧠</span> ${t('codme is thinking…')}`;
    if (!xDlg.open) xDlg.showModal();
    let ai = false;
    try {
      if (!auth.ready) throw new Error('offline');
      const r = await auth.api('/api/explain', { method: 'POST', body: { key: item.key, mode, lang } });
      xText = r.text;
      ai = true;
    } catch (e) {
      xText = offline(item, mode);
      if (e.status === 429) toast(tServer(e.message), { emoji: '⏳' });
    }
    if (xItem !== item || xMode !== mode) return; // the reader moved on
    box.innerHTML = `<span class="x-label">${ai ? t('🤖 codme AI') : t('🍿 codme’s quick explainer')}</span>\n${esc(xText)}`;
    $('#explainFine').textContent = ai ? t('AI explanations can make mistakes — the article itself is the real deal.') : t('Made from the headline and the publisher’s summary. Open the article for the full story.');
    bump('explains');
  }
  $$('#explainDialog [data-xmode]').forEach((b) => b.addEventListener('click', () => xItem && explain(xItem, b.dataset.xmode)));
  $('#explainSpeak').addEventListener('click', () => {
    if (!xText) return;
    const isEnglishBit = (s) => /^[\x00-\x7f“”‘’—–…•·]*$/.test(s);
    xSpeech = speak(xText.split('\n').filter(Boolean).map((line) => [line, isEnglishBit(line) ? 'en-US' : myVoice]));
  });
  xDlg.addEventListener('close', () => xSpeech?.stop());
  xDlg.addEventListener('click', (e) => { if (e.target === e.currentTarget) xDlg.close(); });

  // ====================================================================================
  // 🎧 daily audio briefing
  // ====================================================================================
  const bar = $('#briefing');
  let brSpeech = null;
  let brPaused = false;
  function briefing() {
    if (brSpeech) { stopBriefing(); return; }
    const top = [...getItems()].sort((a, b) => hotness(b) - hotness(a)).slice(0, 5);
    if (!top.length) { toast(t('The news is still popping — try again in a few seconds!'), { emoji: '🍿' }); return; }
    const h = new Date().getHours();
    const hello = h < 12 ? 'Good morning, {name}!' : h < 18 ? 'Good afternoon, {name}!' : 'Good evening, {name}!';
    const parts = [sayMine(`${t(hello, { name: profile().nickname })} ${t('Here are the top {n} tech stories on kerNEl right now.', { n: top.length })}`)];
    const map = [-1];
    top.forEach((it, i) => {
      parts.push(sayMine(t('Story {i}, from {source}:', { i: i + 1, source: it.source })));
      map.push(i);
      parts.push([it.title, 'en-US']);
      map.push(i);
    });
    parts.push(sayMine(t('That’s your kerNEl briefing. Stay buttery! 🍿')));
    map.push(-1);
    $('#brTitle').textContent = t('🎧 Today’s briefing');
    $('#brDots').innerHTML = top.map(() => '<i></i>').join('');
    bar.hidden = false;
    brPaused = false;
    $('#brPause').textContent = '⏸️';
    brSpeech = speak(parts, {
      onPart: (i) => {
        const n = map[i];
        $('#brNow').textContent = n >= 0 ? top[n].title : t('Your top stories, read aloud');
        $$('#brDots i').forEach((d, k) => d.classList.toggle('on', k <= n));
      },
      onEnd: () => { stopBriefing(); toast(t('Briefing done! You’re all caught up. 🍿'), { emoji: '🎧' }); },
    });
    if (brSpeech) { bump('briefings'); sfx.pop(); }
    else bar.hidden = true;
  }
  function stopBriefing() { brSpeech?.stop(); brSpeech = null; bar.hidden = true; }
  $('#brStop').addEventListener('click', stopBriefing);
  $('#brNext').addEventListener('click', () => brSpeech?.skip());
  $('#brPause').addEventListener('click', () => {
    if (!brSpeech) return;
    brPaused = !brPaused;
    if (brPaused) brSpeech.pause(); else brSpeech.resume();
    $('#brPause').textContent = brPaused ? '▶️' : '⏸️';
  });

  // ====================================================================================
  // 📼 Time Machine
  // ====================================================================================
  let tm = null;
  function paintYear(year) {
    const y = tm.years.find((x) => x.year === year) || tm.years[0];
    $$('#tmYears button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.year) === y.year)));
    const ago = new Date().getFullYear() - y.year;
    $('#tmStory').innerHTML = `<div class="tm-card"><span class="tm-year">${y.year}</span> <small>${tn(ago, '{n} year ago', '{n} years ago')}</small>
      <a href="${esc(safeUrl(y.url))}" target="_blank" rel="noopener noreferrer" dir="ltr" lang="en">${esc(y.title)}</a>
      <small>▲ ${compact(y.points)} · <a href="${esc(safeUrl(y.hnUrl))}" target="_blank" rel="noopener noreferrer" style="display:inline">💬 ${compact(y.comments)}</a></small></div>`;
  }
  async function loadTimeMachine() {
    if (!auth.ready) { $('#tmWidget').remove(); return; }
    try {
      tm = await auth.api('/api/timemachine', { auth: false });
      if (!tm.years?.length) throw new Error('empty');
      $('#tmWidget').hidden = false;
      $('#tmYears').innerHTML = tm.years.map((y) => `<button type="button" data-year="${y.year}">${y.year}</button>`).join('') + `<button type="button" data-year="random">🎲</button>`;
      paintYear(tm.years[0].year);
    } catch { $('#tmWidget').hidden = true; }
  }
  $('#tmYears').addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-year]');
    if (!b || !tm) return;
    const year = b.dataset.year === 'random' ? tm.years[Math.floor(Math.random() * tm.years.length)].year : Number(b.dataset.year);
    paintYear(year);
    sfx.blip();
    bump('timeTravels');
  });

  // ====================================================================================
  // 📱 swipe mode
  // ====================================================================================
  const sw = $('#swipeMode');
  const stage = $('#swipeStage');
  let deck = [];
  let at = 0;
  let lastTap = 0;
  const thumb = (it) => {
    const c = catById(it.cat);
    const h = hash(it.key);
    const art = `<div class="art" style="--h1:${(c.hue + (h % 50) + 335) % 360};--h2:${(c.hue + 60) % 360};--rot:${(h % 24) - 12}deg"><span class="art-emoji">${c.emoji}</span></div>`;
    return it.image && safeUrl(it.image) !== '#' ? `${art}<img src="${esc(safeUrl(it.image))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : art;
  };
  function paintSwipe(dir) {
    const it = deck[at];
    if (!it) { stage.innerHTML = `<div class="chat-empty"><span>🍿</span><p>${t('That’s every story! You’re a swipe legend.')}</p></div>`; return; }
    const c = catById(it.cat);
    const saved = getData().saved.some((s) => s.key === it.key);
    const card = document.createElement('article');
    card.className = 'swipe-card';
    card.dataset.key = it.key;
    card.style.setProperty('--cat-h', c.hue);
    card.innerHTML = `<a class="card-thumb" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer" data-sopen tabindex="-1">${thumb(it)}</a>
      <div class="sc-body">
        <div class="card-meta"><span class="chip chip-cat">${c.emoji} ${esc(t(c.label))}</span><span class="src">${esc(it.source)}</span><time>${timeAgo(it.time)}</time></div>
        <h3><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer" data-sopen dir="ltr" lang="en">${esc(it.title)}</a></h3>
        ${it.summary ? `<p dir="auto">${esc(it.summary.slice(0, 160))}</p>` : ''}
        <p>${it.points ? `▲ ${compact(it.points)} · ` : ''}${it.comments ? `💬 ${compact(it.comments)} · ` : ''}${saved ? `🔖 ${t('Saved')}` : ''}</p>
      </div>`;
    if (dir) { card.classList.add(dir === 'up' ? 'out-down' : 'out-up'); requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('out-down', 'out-up'))); }
    stage.replaceChildren(card);
    $('#swipeCount').textContent = `${at + 1} / ${deck.length}`;
  }
  function move(delta, anim) {
    const card = stage.querySelector('.swipe-card');
    const go = () => { at = Math.max(0, Math.min(deck.length, at + delta)); paintSwipe(delta > 0 ? 'up' : 'down'); };
    if (card && anim) { card.classList.add(anim); setTimeout(go, 220); } else go();
    if (delta > 0) bump('swipes');
  }
  function stamp(cls, text) {
    const card = stage.querySelector('.swipe-card');
    if (card) card.insertAdjacentHTML('afterbegin', `<span class="swipe-stamp ${cls}">${text}</span>`);
  }
  function act(what) {
    const it = deck[at];
    switch (what) {
      case 'next': return move(1, 'out-up');
      case 'prev': return at > 0 && move(-1, 'out-down');
      case 'skip': stamp('skip', t('NOPE')); return move(1, 'out-left');
      case 'save': if (it) { if (!getData().saved.some((s) => s.key === it.key)) onSave(it.key); stamp('save', t('SAVED')); sfx.pop(); move(1, 'out-right'); } return undefined;
      case 'fire': if (it) { onReact(it.key, 'fire'); stage.insertAdjacentHTML('beforeend', '<span class="swipe-heart">🔥</span>'); setTimeout(() => stage.querySelector('.swipe-heart')?.remove(), 700); sfx.pop(); } return undefined;
      case 'explain': return it && explain(it);
      case 'close': return closeSwipe();
      default: return undefined;
    }
  }
  function openSwipe() {
    deck = getVisible().slice(0, 150);
    if (!deck.length) { toast(t('The news is still popping — try again in a few seconds!'), { emoji: '🍿' }); return; }
    at = 0;
    sw.hidden = false;
    document.documentElement.classList.add('no-scroll');
    paintSwipe();
    if (!store.get('swipe:hinted', false)) { toast(t('Swipe up for the next story, right to save, left to skip. Double-tap for 🔥!'), { emoji: '📱', ms: 5000 }); store.set('swipe:hinted', true); }
    sfx.pop();
  }
  function closeSwipe() { sw.hidden = true; document.documentElement.classList.remove('no-scroll'); }
  sw.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const b = el?.closest('[data-swipe]');
    if (b) { act(b.dataset.swipe); return; }
    const open = el?.closest('[data-sopen]');
    if (open && deck[at]) { onRead(deck[at].key, e); return; }
    if (el?.closest('.swipe-card')) {
      const now = Date.now();
      if (now - lastTap < 320) act('fire');
      lastTap = now;
    }
  });
  let start = null;
  stage.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 50) return;
    if (Math.abs(dy) > Math.abs(dx)) act(dy < 0 ? 'next' : 'prev');
    else act((dx > 0) !== isRTL ? 'save' : 'skip');
  });
  document.addEventListener('keydown', (e) => {
    if (sw.hidden || document.querySelector('dialog[open]')) return;
    const k = { ArrowUp: 'next', ArrowDown: 'prev', ArrowRight: isRTL ? 'skip' : 'save', ArrowLeft: isRTL ? 'save' : 'skip', ' ': 'next', f: 'fire', s: 'save', e: 'explain', Escape: 'close' }[e.key];
    if (k) { e.preventDefault(); act(k); }
  });

  // ====================================================================================
  // 🎁 kerNEl Wrapped (a shareable stats card)
  // ====================================================================================
  const VIBES = {
    ai: ['🤖', 'AI Whisperer'], gadgets: ['📱', 'Gadget Goblin'], gaming: ['🎮', 'Respawn Royalty'], security: ['🔐', 'Cyber Sentinel'],
    space: ['🚀', 'Space Cadet'], dev: ['💻', 'Code Wizard'], science: ['🔬', 'Lab Legend'], money: ['💰', 'Startup Shark'],
  };
  const canvas = $('#wrappedCanvas');
  async function drawWrapped() {
    const d = getData();
    const p = profile();
    const r = rankFor(d.xp);
    const reads = d.catReads || {};
    const topCat = Object.entries(reads).sort((a, b) => b[1] - a[1])[0]?.[0] || p.topics?.[0] || 'ai';
    const [vibeEmoji, vibe] = VIBES[topCat] || VIBES.ai;
    const counts = d.counts || {};
    const ctx = canvas.getContext('2d');
    const W = 1080;
    const H = 1350;
    const font = lang === 'ar' ? '"Lalezar", "Baloo Bhaijaan 2", sans-serif' : '"Bungee", Impact, sans-serif';
    const body = lang === 'ar' ? '"Baloo Bhaijaan 2", "Rubik", sans-serif' : '"Rubik", system-ui, sans-serif';
    try { await Promise.all([document.fonts.load(`80px ${font}`), document.fonts.load(`700 40px ${body}`)]); } catch { /* use fallback fonts */ }
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ff2d3d'); g.addColorStop(.55, '#8b5cf6'); g.addColorStop(1, '#111216');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .12;
    ctx.font = '120px serif';
    for (let i = 0; i < 18; i++) ctx.fillText(['🍿', '🌽', '🧈', '✨'][i % 4], (hash(`w${i}`) % W), (hash(`h${i}`) % H));
    ctx.globalAlpha = 1;
    ctx.direction = isRTL ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `64px ${font}`;
    ctx.fillText(t('My kerNEl Wrapped'), W / 2, 130);
    ctx.font = `700 34px ${body}`;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(new Date().toLocaleDateString(langInfo.html === 'ar-EG' ? 'ar-EG-u-nu-latn' : langInfo.html, { month: 'long', year: 'numeric' }), W / 2, 180);
    // avatar + hat
    ctx.font = '190px serif';
    ctx.fillText(p.avatar || '🍿', W / 2, 440);
    const hat = { cap: '🧢', bow: '🎀', tophat: '🎩', grad: '🎓', helmet: '⛑️', crown: '👑', ufo: '🛸', trophy: '🏆' }[p.hat];
    if (hat) { ctx.font = '110px serif'; ctx.fillText(hat, W / 2 + 10, 300); }
    ctx.fillStyle = '#fff';
    ctx.font = `60px ${font}`;
    ctx.fillText(p.nickname || 'Kernel', W / 2, 525);
    ctx.font = `700 40px ${body}`;
    ctx.fillText(`${r.emoji} ${t(r.title)} · ${d.xp} XP`, W / 2, 580);
    // the vibe
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRect(ctx, 90, 615, W - 180, 150, 36); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = `700 32px ${body}`;
    ctx.fillText(t('My news vibe'), W / 2, 668);
    ctx.fillStyle = '#fff';
    ctx.font = `56px ${font}`;
    ctx.fillText(`${vibeEmoji} ${t(vibe)}`, W / 2, 738);
    // stats grid
    const stats = [
      ['📰', d.read.length, t('stories read')], ['🔖', d.saved.length, t('saved')], ['🔥', Object.keys(d.reactions).length, t('reactions')],
      ['📅', d.bestStreak || d.streak || 0, t('best streak')], ['🧠', counts.quizPlayed || 0, t('quizzes')], ['🏅', Object.keys(d.badges || {}).length, t('achievements')],
    ];
    stats.forEach(([e, n, label], i) => {
      const x = 90 + (i % 3) * 310;
      const y = 800 + Math.floor(i / 3) * 210;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      roundRect(ctx, x, y, 280, 180, 30); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '52px serif';
      ctx.fillText(e, x + 140, y + 62);
      ctx.font = `60px ${font}`;
      ctx.fillText(compact(n), x + 140, y + 128);
      ctx.font = `700 26px ${body}`;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(label, x + 140, y + 165);
    });
    const topLabel = CATEGORIES.find((c) => c.id === topCat);
    ctx.fillStyle = '#fff';
    ctx.font = `700 34px ${body}`;
    ctx.fillText(t('Favourite section: {cat}', { cat: `${topLabel?.emoji || ''} ${t(topLabel?.label || 'AI')}` }), W / 2, 1265);
    ctx.font = `42px "Bungee", Impact, sans-serif`;
    ctx.fillStyle = '#ffd23f';
    ctx.direction = 'ltr';
    ctx.fillText('kerNEl 🍿', W / 2, 1320);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const wrappedBlob = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
  async function openWrapped() {
    const dlg = $('#wrappedDialog');
    if (!dlg.open) dlg.showModal();
    await drawWrapped();
    rain(['🎁', '🍿', '✨'], 30);
    sfx.win();
    bump('wrapped');
  }
  $('#wrappedDownload').addEventListener('click', async () => {
    const blob = await wrappedBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-kernel-wrapped.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });
  $('#wrappedShare').addEventListener('click', async (e) => {
    const blob = await wrappedBlob();
    const file = new File([blob], 'my-kernel-wrapped.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t('My kerNEl Wrapped'), text: t('My kerNEl Wrapped 🍿') });
      else { $('#wrappedDownload').click(); toast(t('Saved the picture — share it anywhere! 📤'), { emoji: '🎁' }); }
      burstFrom(e.currentTarget, { emojis: ['🎁', '✨'], count: 10 });
    } catch (err) { if (err?.name !== 'AbortError') toast(t('Couldn’t share — try Download instead.'), { emoji: '🤷' }); }
  });
  $('#wrappedDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  if (canSpeak) speechSynthesis.getVoices(); // voices load lazily in some browsers
  loadTimeMachine();
  return { explain, briefing, openSwipe, closeSwipe, openWrapped, burst };
}
