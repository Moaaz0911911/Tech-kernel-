// codme — kerNEl's news-sniffing chat robot.
// Runs entirely in the browser: it understands what you ask (topic, time range, "hot" vs "latest"),
// searches the live feed, and digs through the Hacker News archive for anything older or rarer.
import { $, esc, safeUrl, timeAgo, pick, sleep, store, compact } from './utils.js';
import { CATEGORIES, catById, hotness, searchLocal, searchArchive, tokenize } from './news.js';
import { JOKES, FACTS, lookupGlossary } from './content.js';
import { sfx } from './fun.js';

const DAY = 864e5;
const HOT_RE = /\b(hot|hottest|trending|top|popular|best|viral|biggest)\b/;
const INTENT_WORDS = new Set(['hot', 'hottest', 'trending', 'top', 'popular', 'best', 'viral', 'biggest', 'latest', 'newest', 'recent', 'fresh', 'breaking', 'happening', 'new', 'today', 'right', 'now', 'currently']);
const CAT_ALIASES = {
  ai: 'ai', 'artificial intelligence': 'ai', ml: 'ai', 'machine learning': 'ai', llm: 'ai', llms: 'ai',
  gadget: 'gadgets', gadgets: 'gadgets', phone: 'gadgets', phones: 'gadgets', smartphone: 'gadgets', smartphones: 'gadgets', hardware: 'gadgets', devices: 'gadgets',
  gaming: 'gaming', game: 'gaming', games: 'gaming', gamer: 'gaming', videogames: 'gaming', 'video games': 'gaming',
  security: 'security', cybersecurity: 'security', hacking: 'security', hackers: 'security', privacy: 'security', cyber: 'security',
  space: 'space', astronomy: 'space', rockets: 'space',
  dev: 'dev', developer: 'dev', developers: 'dev', programming: 'dev', coding: 'dev', code: 'dev', software: 'dev',
  science: 'science', research: 'science',
  money: 'money', business: 'money', finance: 'money', startups: 'money', startup: 'money', economy: 'money', markets: 'money',
  tech: 'all', technology: 'all',
};

const CHIPS_DEFAULT = ['🔥 What’s hot?', '🤖 Latest AI news', '🔎 News about Apple', '📋 Summarize today', '🎲 Surprise me', '😂 Tell me a joke'];
const SNIFF = ['Sniff sniff… 🐽', 'Digging through the popcorn bucket… 🍿', 'Scanning the tubes… 📡', 'Asking my robot cousins… 🤖', 'Opening the archive vault… 🗄️'];

// ---------- time understanding ----------
function parseTime(t) {
  const now = Date.now();
  const mid = new Date(); mid.setHours(0, 0, 0, 0);
  let m;
  if (/\byesterday\b/.test(t)) return { since: mid.getTime() - DAY, until: mid.getTime(), label: 'yesterday' };
  if (/\b(today|this morning|tonight)\b/.test(t)) return { since: mid.getTime(), label: 'today' };
  if ((m = t.match(/\b(?:last|past)\s+(\d{1,3})\s*(hours?|hrs?|days?|weeks?|months?|years?)\b/))) {
    const n = Number(m[1]);
    const unit = m[2].replace(/s$/, '');
    const ms = { hour: 36e5, hr: 36e5, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }[unit];
    return { since: now - n * ms, label: `the last ${n} ${unit === 'hr' ? 'hour' : unit}${n > 1 ? 's' : ''}` };
  }
  if (/\b(?:last|past)\s+hour\b|\bright now\b|\bjust now\b/.test(t)) return { since: now - 36e5, label: 'the last hour' };
  if (/\b(?:this|last|past)\s+week\b/.test(t)) return { since: now - 7 * DAY, label: 'the past week' };
  if (/\b(?:this|last|past)\s+month\b/.test(t)) return { since: now - 30 * DAY, label: 'the past month' };
  if (/\b(?:this|last|past)\s+year\b/.test(t)) return { since: now - 365 * DAY, label: 'the past year' };
  if ((m = t.match(/\b(19[89]\d|20[0-3]\d)\b/))) {
    const y = Number(m[1]);
    return { since: Date.UTC(y, 0, 1), until: Date.UTC(y + 1, 0, 1), label: String(y) };
  }
  return null;
}
const stripTime = (t) => t.replace(/\b(today|this morning|tonight|yesterday|right now|just now|(?:last|past|this)\s+(?:\d{1,3}\s*)?(?:hours?|hrs?|days?|weeks?|months?|years?)|in\s+(?:19|20)\d\d|(?:19|20)\d\d)\b/g, ' ');

function keywords(t) {
  return tokenize(stripTime(t)).filter((w) => !INTENT_WORDS.has(w));
}

function detectCategory(kw) {
  if (!kw.length) return null;
  const phrase = kw.join(' ');
  if (CAT_ALIASES[phrase]) return CAT_ALIASES[phrase];
  if (kw.every((w) => CAT_ALIASES[w])) return CAT_ALIASES[kw[0]];
  return null;
}

// ---------- main ----------
export function initCodme(api) {
  const launcher = $('#codmeLauncher');
  const panel = $('#codmePanel');
  const log = $('#codmeLog');
  const form = $('#codmeForm');
  const input = $('#codmeInput');
  const chipsEl = $('#codmeChips');
  const badge = $('#codmeBadge');
  const teaser = $('#codmeTeaser');
  const statusEl = $('#codmeStatus');
  if (!launcher || !panel) return null;

  let typingEl = null;
  let chain = Promise.resolve();
  let last = null; // { title, results, offset, q, time }
  let unread = 0;

  const AVATAR = '<span class="msg-avatar" aria-hidden="true">🤖</span>';

  // ----- rendering -----
  function miniCard(it) {
    const c = catById(it.cat);
    const saved = api.isSaved(it.key);
    return `<article class="mini-result" data-key="${esc(it.key)}">
      <span class="mr-emoji" aria-hidden="true">${c.emoji}</span>
      <div class="mr-body">
        <a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer" data-open>${esc(it.title)}</a>
        <div class="mr-meta">${esc(it.source)} · ${esc(timeAgo(it.time))}${it.points ? ` · ▲ ${compact(it.points)}` : ''}${it.comments ? ` · 💬 ${compact(it.comments)}` : ''}</div>
      </div>
      <button class="mr-save ${saved ? 'on' : ''}" type="button" data-save aria-pressed="${saved}" title="${saved ? 'Saved' : 'Save to your bucket'}">${saved ? '🔖' : '📑'}</button>
    </article>`;
  }

  function addMsg(who, html, { cards = [] } = {}) {
    const m = document.createElement('div');
    m.className = `msg msg-${who}`;
    m.innerHTML = `${who === 'bot' ? AVATAR : ''}<div class="bubble">${html}${cards.length ? `<div class="msg-cards">${cards.map(miniCard).join('')}</div>` : ''}</div>`;
    log.append(m);
    while (log.children.length > 80) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function setChips(list = CHIPS_DEFAULT) {
    chipsEl.innerHTML = list.map((c) => `<button type="button" class="qchip">${esc(c)}</button>`).join('');
  }

  function typing(on) {
    if (on && !typingEl) {
      typingEl = document.createElement('div');
      typingEl.className = 'msg msg-bot typing';
      typingEl.innerHTML = `${AVATAR}<div class="bubble" aria-label="codme is typing"><i></i><i></i><i></i></div>`;
      log.append(typingEl);
      log.scrollTop = log.scrollHeight;
    } else if (!on && typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  async function say(html, opts = {}) {
    typing(true);
    const textLen = html.replace(/<[^>]+>/g, '').length;
    await sleep(Math.min(1000, 280 + textLen * 5));
    typing(false);
    addMsg('bot', html, opts);
    if (opts.cards?.length) api.remember(opts.cards);
    if (opts.chips) setChips(opts.chips);
    sfx.blip();
    if (panel.hidden) bumpUnread();
  }

  function bumpUnread() {
    unread++;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.hidden = false;
  }

  const name = () => api.userName() || 'friend';
  const plural = (n, w) => `${n} ${n === 1 ? w : `${w.replace(/([^aeiou])y$/, '$1ie')}s`}`;

  // ----- skills -----
  async function greet() {
    await say(pick([
      `Hey ${esc(name())}! 👋 I’m <b>codme</b>. Ask me for any tech news — a topic, a company, a time range — and I’ll sniff it out.`,
      `Yo ${esc(name())}! 🤖 codme online and fully buttered. What news are we hunting today?`,
      `Hello hello, ${esc(name())}! 🍿 Give me a topic and I’ll fetch the freshest kernels.`,
    ]), { chips: CHIPS_DEFAULT });
  }

  async function help() {
    await say(`Here’s what I can do 🛠️<ul class="help-list">
      <li><b>Find anything:</b> “news about Rust”, “OpenAI this week”, “SpaceX in 2023”</li>
      <li><b>Hot or latest:</b> “what’s hot in gaming?”, “latest security news”</li>
      <li><b>Explain words:</b> “what is an API?”, “explain blockchain”</li>
      <li><b>Catch up:</b> “summarize today”, “stats”</li>
      <li><b>Your stuff:</b> “my saved stories”</li>
      <li><b>Silly stuff:</b> “tell me a joke”, “fun fact”, “surprise me”</li>
    </ul>Say “more” after any search to see more results.`, { chips: ['🔎 News about Rust', '🛰️ SpaceX this month', '❓ What is an API?', '📊 Stats'] });
  }

  async function showList(title, results, ctx = {}) {
    if (!results.length) {
      await sorry(ctx.q || '');
      return;
    }
    last = { title, results, offset: 5, ...ctx };
    const more = results.length > 5 ? `<br><small>Say <b>“more”</b> for ${plural(Math.min(5, results.length - 5), 'more story')}.</small>` : '';
    await say(`${title}${more}`, { cards: results.slice(0, 5), chips: results.length > 5 ? ['➕ More', '🔥 What’s hot?', '🎲 Surprise me'] : ['🔥 What’s hot?', '📋 Summarize today', '🎲 Surprise me'] });
  }

  async function more() {
    if (!last || last.offset >= last.results.length) {
      await say(last ? 'That’s every kernel I found for that one! 🍿 Try different words?' : 'More of what? Ask me something first! 😄');
      return;
    }
    const slice = last.results.slice(last.offset, last.offset + 5);
    last.offset += 5;
    const left = last.results.length - last.offset;
    await say(`Here’s more 👇${left > 0 ? ` <small>(${left} left — say “more” again)</small>` : ''}`, { cards: slice });
  }

  function inTime(list, time) {
    if (!time) return list;
    return list.filter((i) => i.time >= time.since && (!time.until || i.time < time.until));
  }

  async function hotOrLatest(kind, catId, time) {
    const c = catId && catId !== 'all' ? catById(catId) : null;
    let list = api.items();
    if (c) list = list.filter((i) => i.cat === c.id);
    list = inTime(list, time);
    list = kind === 'hot' ? [...list].sort((a, b) => hotness(b) - hotness(a)) : [...list].sort((a, b) => b.time - a.time);
    const label = c ? `${c.emoji} ${c.label}` : '⚡ tech';
    const when = time ? ` from ${time.label}` : '';
    if (list.length < 3 && (c || time)) {
      // the live feed only covers the last day or two — go to the archive
      typing(true);
      try {
        const arch = await searchArchive(c ? c.query : 'technology', {
          since: time?.since ?? Date.now() - 3 * DAY, until: time?.until, hits: 15, byDate: kind !== 'hot',
        });
        typing(false);
        const merged = dedupe([...list, ...arch]);
        if (kind === 'hot') merged.sort((a, b) => (b.points || 0) - (a.points || 0));
        return showList(`${kind === 'hot' ? '🔥 Hottest' : '🆕 Latest'} ${esc(label)} news${esc(when)} (with some help from the archive 🗄️):`, merged, { q: c?.query });
      } catch {
        typing(false);
      }
    }
    return showList(kind === 'hot'
      ? `🔥 The hottest ${esc(label)} kernels${esc(when)} right now:`
      : `🆕 Freshly popped ${esc(label)} news${esc(when)}:`, list, { q: c?.label });
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  }

  async function search(kw, time, raw) {
    const q = kw.join(' ');
    addSniff();
    const local = searchLocal(api.items(), q, time || {});
    let archive = [];
    try {
      archive = await searchArchive(q, { since: time?.since ?? Date.now() - 365 * DAY, until: time?.until, hits: 12 });
      if (!archive.length && !time) archive = await searchArchive(q, { hits: 8 });
    } catch { /* offline: local results only */ }
    removeSniff();
    const results = dedupe([...local, ...archive]);
    const when = time ? ` from ${time.label}` : '';
    const intro = local.length
      ? pick([`Sniffed out ${plural(results.length, 'story')} about “${esc(q)}”${esc(when)} 🐽`, `Found ${plural(results.length, 'kernel')} on “${esc(q)}”${esc(when)} — freshest & most relevant first 🍿`])
      : `Nothing about “${esc(q)}” in today’s feed, but I dug up ${plural(results.length, 'story')} from the archive${esc(when)} 🗄️`;
    await showList(intro, results, { q, time, raw });
  }

  let sniffEl = null;
  function addSniff() { sniffEl = addMsg('bot', `<span class="sniff">${esc(pick(SNIFF))}</span>`); }
  function removeSniff() { sniffEl?.remove(); sniffEl = null; }

  async function sorry(q) {
    const tr = api.trends().slice(0, 4).map(([w]) => `🔎 News about ${w}`);
    await say(pick([
      `I sniffed everywhere for “${esc(q)}”… nothing. 🐽💨 Try another word, or one of these trending ones?`,
      `Zero kernels popped for “${esc(q)}”. 😢 Maybe check the spelling, or try something broader?`,
    ]), { chips: tr.length ? tr : CHIPS_DEFAULT });
  }

  async function explain(g, term) {
    const related = searchLocal(api.items(), term).slice(0, 3);
    await say(`<b>${esc(g.term.toUpperCase())}</b> — ${esc(g.text)}${related.length ? '<br><br>Related stories in today’s feed:' : ''}`, {
      cards: related, chips: [`🔎 News about ${g.term}`, '❓ What is a GPU?', '🧸 Kids corner'],
    });
  }

  async function digest() {
    const items = api.items();
    if (!items.length) return say('My popcorn bucket is still empty — give me a few seconds to fetch the news! 🍿');
    const recent = items.filter((i) => i.time > Date.now() - DAY);
    const pool = recent.length >= 5 ? recent : items;
    const counts = CATEGORIES.map((c) => [c, pool.filter((i) => i.cat === c.id).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    const top = [...pool].sort((a, b) => hotness(b) - hotness(a)).slice(0, 3);
    const lead = counts[0];
    const max = lead ? lead[1] : 1;
    const bars = counts.slice(0, 5).map(([c, n]) => `<div class="mb"><span>${c.emoji} ${esc(c.label)}</span><i style="--w:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join('');
    await say(`<b>📋 Your kernel digest</b><br>${plural(pool.length, 'story')} popped ${recent.length >= 5 ? 'in the last 24 hours' : 'recently'}.
      ${lead ? `${lead[0].emoji} <b>${esc(lead[0].label)}</b> is hogging the microwave with ${Math.round((lead[1] / pool.length) * 100)}% of the chatter.` : ''}
      <div class="mini-bars">${bars}</div>The 3 hottest right now:`, { cards: top, chips: ['🔥 What’s hot?', '🆕 Latest news', '😂 Tell me a joke'] });
  }

  async function stats() {
    const s = api.status();
    const items = api.items();
    const byCat = CATEGORIES.map((c) => `${c.emoji} ${items.filter((i) => i.cat === c.id).length}`).join(' · ');
    await say(`📊 I’m tracking <b>${items.length}</b> stories from <b>${s.ok}/${s.total}</b> sources that are vibing right now.<br>${byCat}<br><small>The feed refreshes every ${s.every} seconds.</small>`);
  }

  async function surprise() {
    const items = api.items();
    if (!items.length) return say('Nothing to surprise you with yet… the kernels are still heating up! 🔥');
    const it = pick(items);
    await say(pick(['🎲 Rolled the dice and got…', '🎰 Jackpot! Random kernel:', '🙈 Closed my eyes and pointed at…']), { cards: [it], chips: ['🎲 Surprise me again', '😂 Tell me a joke', '💡 Fun fact'] });
  }

  async function saved() {
    const list = api.saved();
    if (!list.length) return say('Your popcorn bucket is empty! Tap 📑 on any story to save it for later. 🪣');
    await showList(`🔖 You’ve saved ${plural(list.length, 'story')}:`, list);
  }

  // ----- intent router -----
  async function respond(raw) {
    const t = raw.toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}\s'?.#+-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return say('Hmm, that was all emoji and no words — I’m good, but not *that* good. 😅', { chips: CHIPS_DEFAULT });

    if (/^(hi|hello|hey|heya|yo|sup|hola|salam|salaam|marhaba|howdy|good (morning|evening|afternoon))( there| codme| bot)?[\s!.?]*$/.test(t)) return greet();
    if (/\b(thank|thanks|thx|ty|appreciate|love you|good bot)\b/.test(t)) return say(pick(['Anytime! 🍿', 'Aww, my circuits are blushing. 🤖💕', 'Happy to help — that’s literally my whole job. 😄']));
    if (/\b(who are you|your name|what are you|are you (an? )?(ai|bot|robot|human|real))\b/.test(t)) {
      return say('I’m <b>codme</b> 🤖 — kerNEl’s news-sniffing robot. I live right here in your browser, read every headline the moment it pops, and dig through years of tech-news archives (Hacker News via Algolia) when you ask for something specific. I run on pattern-matching and popcorn butter, not a giant cloud brain — so short, clear questions work best!');
    }
    if (/\b(help|what can you do|commands|how do (i|you) (use|work))\b/.test(t)) return help();
    if (/\b(joke|funny|laugh|make me smile|pun)\b/.test(t)) return say(`😂 ${esc(pick(JOKES))}`, { chips: ['😂 Another joke', '💡 Fun fact', '🔥 What’s hot?'] });
    if (/\b(fun fact|fact|did you know|trivia)\b/.test(t)) return say(`💡 ${esc(pick(FACTS))}`, { chips: ['💡 Another fact', '😂 Tell me a joke'] });
    if (/^(more|show more|next|keep going|➕ more)\b/.test(t) || t === 'more') return more();
    if (/\b(surprise|random|i'?m bored|bored)\b/.test(t)) return surprise();
    if (/\b(kids?|child|children|kernel kids)\b/.test(t) || /\bkids corner\b/.test(t)) {
      return say('🧸 The <a href="kids.html">kerNEl Kids corner</a> teaches binary, robot coding, pixels, passwords and more — with games and stars! ⭐ Perfect for young techies.');
    }
    if (/\b(saved|bookmarks?|my list|reading list|my bucket)\b/.test(t)) return saved();
    if (/\b(summar\w*|digest|recap|brief(ing)?|tl;?dr|overview|catch me up)\b/.test(t)) return digest();
    if (/\b(stats|statistics|how many)\b/.test(t)) return stats();

    const whatIs = t.match(/^(?:what(?:'s| is| are| does)|explain|define|meaning of|eli5|tell me about)\s+(?:an?\s+|the\s+)?(.+?)\s*(?:mean)?\??$/);
    if (whatIs) {
      const g = lookupGlossary(whatIs[1]);
      if (g) return explain(g, whatIs[1]);
    }

    const time = parseTime(t);
    const kw = keywords(t);
    const cat = detectCategory(kw);
    const wantsHot = HOT_RE.test(t);
    if (!kw.length || cat) return hotOrLatest(wantsHot ? 'hot' : 'latest', cat, time);
    return search(kw, time, raw);
  }

  function send(text) {
    const msg = String(text || '').trim();
    if (!msg) return;
    addMsg('user', esc(msg));
    chain = chain.then(() => respond(msg)).catch((e) => {
      console.error(e);
      typing(false);
      addMsg('bot', 'Oops — I tripped over a cable. 🔌 Try that again?');
    });
  }

  // ----- wiring -----
  function open(prefill) {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    teaser.hidden = true;
    store.set('codme:met', true);
    unread = 0;
    badge.hidden = true;
    requestAnimationFrame(() => panel.classList.add('open'));
    if (!log.children.length) greet();
    if (prefill) send(prefill);
    else setTimeout(() => input.focus(), 120);
    sfx.pop();
  }
  function close() {
    panel.classList.remove('open');
    launcher.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!panel.classList.contains('open')) panel.hidden = true; }, 220);
  }
  const toggle = () => (panel.hidden ? open() : close());

  launcher.addEventListener('click', toggle);
  $('#codmeClose').addEventListener('click', close);
  $('#codmeClear').addEventListener('click', () => { log.innerHTML = ''; last = null; greet(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); input.value = ''; });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.qchip');
    if (b) send(b.textContent);
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); launcher.focus(); } });

  // voice input where the browser supports it
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('#codmeMic');
  if (SR && mic) {
    mic.hidden = false;
    let rec = null;
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      rec.onresult = (ev) => { const said = ev.results[0][0].transcript; input.value = said; send(said); input.value = ''; };
      rec.onend = () => { rec = null; mic.classList.remove('on'); };
      rec.onerror = () => { rec = null; mic.classList.remove('on'); };
      mic.classList.add('on');
      rec.start();
    });
  }

  // googly eyes follow the pointer
  const pupils = [...document.querySelectorAll('.codme-face .pupil')];
  let raf = 0;
  window.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const p of pupils) {
        const eye = p.parentNode.getBoundingClientRect();
        if (!eye.width) continue;
        const ang = Math.atan2(e.clientY - (eye.top + eye.height / 2), e.clientX - (eye.left + eye.width / 2));
        p.setAttribute('transform', `translate(${(Math.cos(ang) * 3.4).toFixed(2)} ${(Math.sin(ang) * 3.4).toFixed(2)})`);
      }
    });
  }, { passive: true });

  // one-time teaser bubble
  if (!store.get('codme:met', false)) {
    setTimeout(() => { if (panel.hidden) { teaser.hidden = false; setTimeout(() => { teaser.hidden = true; }, 9000); } }, 7000);
  }
  teaser.addEventListener('click', () => open());

  setChips();
  const updateStatus = () => { statusEl.textContent = `online · sniffing ${api.items().length} stories`; };
  updateStatus();

  return {
    open, close, toggle, send, updateStatus,
    notify(fresh) {
      updateStatus();
      if (!fresh.length) return;
      if (!panel.hidden) {
        const top = [...fresh].sort((a, b) => hotness(b) - hotness(a)).slice(0, 2);
        say(`Ding! 🔔 ${plural(fresh.length, 'new story')} just popped. Here’s the tastiest:`, { cards: top });
      }
    },
  };
}
