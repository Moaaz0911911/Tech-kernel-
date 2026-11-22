// codme — kerNEl's news-sniffing chat robot.
// Runs entirely in the browser: it understands what you ask (topic, time range, "hot" vs "latest"),
// searches the live feed, and digs through the Hacker News archive for anything older or rarer.
import { $, esc, safeUrl, timeAgo, pick, sleep, store, compact } from './utils.js';
import { CATEGORIES, catById, hotness, searchLocal, searchArchive, tokenize } from './news.js';
import { JOKES, FACTS, lookupGlossary } from './content.js';
import { sfx } from './fun.js';
import { t, tn, langInfo } from './i18n.js';
import { PERSONAS, personaById } from './personas.js';
import { itemFor } from './shop-data.js';

// ---------- understanding Arabic, German and Tagalog ----------
// Questions in other languages are turned into codme's English keywords (headlines are in English).
const AR = (s) => s.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[؟،]/g, ' ');
const PHRASES = [
  // greetings, thanks, help
  ['ازيك|ازيكم|اهلا|اهلين|السلام عليكم|سلام عليكم|هاي|هالو|مرحبا|صباح الخير|مساء الخير|hallo|servus|moin|guten tag|guten morgen|guten abend|kumusta|kamusta|musta|magandang umaga|magandang hapon|magandang gabi', 'hi'],
  ['يا كودمي|يا codme|كودمي', 'codme'],
  ['شكرا|متشكر|متشكرين|تسلم ايدك|تسلم|ميرسي|vielen dank|dankeschön|danke|maraming salamat|salamat', 'thanks'],
  ['انت مين|اسمك ايه|انت ايه|wer bist du|wie heißt du|was bist du|sino ka|anong pangalan mo', 'who are you'],
  ['تقدر تعمل ايه|بتعمل ايه|ساعدني|مساعده|was kannst du|hilfe|ano ang kaya mo|anong kaya mo|tulungan mo ako|tulong', 'help'],
  ['ضحكني|نكته|نكت|هزار|erzähl was lustiges|witze|witz|patawa|biro', 'joke'],
  ['معلومه|تعرف ان|wusstest du|fakt|alam mo ba|kaalaman', 'fun fact'],
  ['فاجئني|اي حاجه|زهقان|عشوائي|überrasch mich|überraschung|zufall|langweilig|sorpresa|kahit ano|nababagot', 'surprise'],
  ['المحفوظات|محفوظاتي|اللي حفظته|المحفوظ|gespeicherte|gespeichert|meine liste|mga na-save|naka-save|nai-save', 'saved'],
  ['لخصلي|لخص|ملخص|الخلاصه|fasse zusammen|fass zusammen|zusammenfassung|überblick|ibuod|buod|lagom', 'summarize'],
  ['احصائيات|كام خبر|statistik|wie viele', 'stats'],
  ['يعني ايه|ايه هو|ايه هي|ايه معني|اشرحلي|اشرح|عرفني|ما هو|ما هي|was bedeutet|was ist|was sind|erklär mir|erkläre|erklär|anong ibig sabihin ng|ano ba ang|ano ang|ano yung|ano yong|ipaliwanag ang|ipaliwanag', 'what is'],
  ['اطفال|الاطفال|عيال|ولاد|kinder|mga bata|pambata|bata', 'kids'],
  ['كمان|تاني|المزيد|اكتر|noch mehr|weiter|mehr|marami pa|isa pa|iba pa|dagdag', 'more'],
  // topics
  ['الذكاء الاصطناعي|ذكاء اصطناعي|الذكاء الصناعي|künstliche intelligenz|ki|artipisyal na intelihensiya', 'ai'],
  ['الالعاب|العاب|الجيمز|جيمز|جيمنج|videospiele|spiele|zocken|mga laro|laro', 'gaming'],
  ['الموبايلات|موبايلات|موبايل|تليفونات|الاجهزه|اجهزه|جادجتس|smartphones|handys|handy|geräte|selpon|cellphone', 'gadgets'],
  ['الامن|امن|سيكيوريتي|اختراق|الهاكرز|هاكرز|sicherheit|seguridad', 'security'],
  ['الفضاء|فضاء|weltraum|raumfahrt|kalawakan', 'space'],
  ['البرمجه|برمجه|المبرمجين|مبرمجين|programmierung|programmieren|entwickler|pagpoprograma', 'programming'],
  ['العلوم|علوم|العلم|wissenschaft|forschung|agham', 'science'],
  ['الفلوس|فلوس|الاقتصاد|اقتصاد|البيزنس|الشركات|wirtschaft|finanzen|börse|geld|ekonomiya|negosyo|pera', 'money'],
  ['التكنولوجيا|تكنولوجيا|التقنيه|technologie|technik|teknolohiya', 'tech'],
  // names people type in Arabic letters
  ['ابل', 'apple'], ['جوجل', 'google'], ['مايكروسوفت', 'microsoft'], ['سامسونج', 'samsung'], ['تسلا', 'tesla'], ['ايلون ماسك', 'elon musk'],
  ['نفيديا|انفيديا', 'nvidia'], ['امازون', 'amazon'], ['فيسبوك|ميتا', 'meta'], ['ايفون|الايفون', 'iphone'], ['اندرويد', 'android'],
  ['بلايستيشن|بلاي ستيشن', 'playstation'], ['نينتندو', 'nintendo'], ['اكس بوكس', 'xbox'], ['شات جي بي تي', 'chatgpt'], ['اوبن اي اي', 'openai'],
  ['سبيس اكس', 'spacex'], ['ناسا', 'nasa'], ['لينكس', 'linux'], ['ويندوز', 'windows'], ['بايثون', 'python'], ['بيتكوين|كريبتو', 'bitcoin'], ['روبوت|روبوتات', 'robot'],
  // hot / latest / news about
  ['الترند|ترند|التريند|الاكثر|اهم|السخن|الهوت|المشهور|angesagt|beliebt|heißeste|heiß|trends|uso|sikat|patok', 'hot'],
  ['اخر|احدث|الجديد|جديد|neueste|neuesten|aktuelle|aktuell|pinakabago|bagong|bago', 'latest'],
  ['الاخبار|اخبار|خبر|nachrichten|neuigkeiten|mga balita|balita', 'news'],
  ['عن|über|tungkol sa', 'about'],
  // time
  ['النهارده|انهارده|اليوم|heute|ngayong araw|ngayon', 'today'], ['امبارح|البارحه|gestern|kahapon', 'yesterday'],
  ['الاسبوع ده|الاسبوع اللي فات|الاسبوع|diese woche|letzte woche|ngayong linggo|nitong linggo', 'this week'],
  ['الشهر ده|الشهر|diesen monat|letzten monat|ngayong buwan', 'this month'], ['السنه دي|السنه|dieses jahr|letztes jahr|ngayong taon', 'this year'],
  ['دلوقتي|gerade|jetzt', 'right now'],
  // little filler words
  ['عايز|عاوز|ممكن|لو سمحت|من فضلك|هاتلي|هات|وريني|قولي|شوفلي|دورلي|دور|ابحث|في|علي|ايه|يا|zeig mir|zeig|gib mir|ich will|bitte|mal|gibt es|die|der|das|im|in|ein|eine|einen|isang|ipakita mo|ipakita|pakita|hanapin|hanap|naman|gusto|po|nga|ang|ng|sa|mga|ko|ako|mo', ''],
].map(([alts, en]) => [new RegExp(`(^|\\s)(?:${alts})(?=\\s|$)`, 'giu'), en]);
function toEnglish(text) {
  let s = AR(String(text).toLowerCase());
  const english = langInfo.id === 'en' && /^[\x00-\x7f]*$/.test(s) && !/\b(hallo|danke|witz|heute|gestern|neueste|nachrichten|was ist|was sind|erklär\w*|bitte|salamat|kumusta|balita|ngayon|ano ang|ano ba|mga)\b/.test(s);
  if (english) return text; // plain English: leave it alone
  for (const [re, en] of PHRASES) s = s.replace(re, (m, sp) => `${sp}${en}`);
  return s.replace(/\s+/g, ' ').trim();
}

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
const chip = (en, vars) => ({ q: en.replace(/\{(\w+)\}/g, (m, k) => vars?.[k] ?? m), label: t(en, vars) });
const SNIFF = ['Sniff sniff… 🐽', 'Digging through the popcorn bucket… 🍿', 'Scanning the tubes… 📡', 'Asking my robot cousins… 🤖', 'Opening the archive vault… 🗄️'];

// ---------- time understanding ----------
const tr = t; // (inside parseTime, `t` is the question text)
function parseTime(t) {
  const now = Date.now();
  const mid = new Date(); mid.setHours(0, 0, 0, 0);
  let m;
  if (/\byesterday\b/.test(t)) return { since: mid.getTime() - DAY, until: mid.getTime(), label: tr('from yesterday') };
  if (/\b(today|this morning|tonight)\b/.test(t)) return { since: mid.getTime(), label: tr('from today') };
  if ((m = t.match(/\b(?:last|past)\s+(\d{1,3})\s*(hours?|hrs?|days?|weeks?|months?|years?)\b/))) {
    const n = Number(m[1]);
    const unit = m[2].replace(/s$/, '');
    const ms = { hour: 36e5, hr: 36e5, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }[unit];
    const u = unit === 'hr' ? 'hour' : unit;
    return { since: now - n * ms, label: tn(n, `from the last ${u}`, `from the last {n} ${u}s`) };
  }
  if (/\b(?:last|past)\s+hour\b|\bright now\b|\bjust now\b/.test(t)) return { since: now - 36e5, label: tr('from the last hour') };
  if (/\b(?:this|last|past)\s+week\b/.test(t)) return { since: now - 7 * DAY, label: tr('from the past week') };
  if (/\b(?:this|last|past)\s+month\b/.test(t)) return { since: now - 30 * DAY, label: tr('from the past month') };
  if (/\b(?:this|last|past)\s+year\b/.test(t)) return { since: now - 365 * DAY, label: tr('from the past year') };
  if ((m = t.match(/\b(19[89]\d|20[0-3]\d)\b/))) {
    const y = Number(m[1]);
    return { since: Date.UTC(y, 0, 1), until: Date.UTC(y + 1, 0, 1), label: tr('from {year}', { year: y }) };
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
  let aiHistory = []; // conversation sent to the AI (when the kerNEl server is on)
  let aiOff = false;  // the server said AI isn't switched on: stop trying this session
  let unread = 0;

  // 🎭 personalities from the Butter Shop: codme wears one like a costume
  const persona = () => personaById(api.persona?.());
  const avatar = () => `<span class="msg-avatar" aria-hidden="true">${persona().emoji}</span>`;

  // ----- rendering -----
  function miniCard(it) {
    const c = catById(it.cat);
    const saved = api.isSaved(it.key);
    return `<article class="mini-result" data-key="${esc(it.key)}">
      <span class="mr-emoji" aria-hidden="true">${it._n ? `<b class="mr-n">${it._n}</b>` : c.emoji}</span>
      <div class="mr-body">
        <a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer" data-open dir="auto">${esc(it.title)}</a>
        <div class="mr-meta">${esc(it.source)} · ${esc(timeAgo(it.time))}${it.points ? ` · ▲ ${compact(it.points)}` : ''}${it.comments ? ` · 💬 ${compact(it.comments)}` : ''}</div>
      </div>
      <button class="mr-save ${saved ? 'on' : ''}" type="button" data-save aria-pressed="${saved}" title="${saved ? t('Saved') : t('Save to your bucket')}">${saved ? '🔖' : '📑'}</button>
    </article>`;
  }

  function addMsg(who, html, { cards = [] } = {}) {
    const m = document.createElement('div');
    m.className = `msg msg-${who}`;
    m.innerHTML = `${who === 'bot' ? avatar() : ''}<div class="bubble">${html}${cards.length ? `<div class="msg-cards">${cards.map(miniCard).join('')}</div>` : ''}</div>`;
    log.append(m);
    while (log.children.length > 80) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function setChips(list = CHIPS_DEFAULT) {
    chipsEl.innerHTML = list.map((c) => (typeof c === 'string' ? chip(c) : c)).map((c) => `<button type="button" class="qchip" data-q="${esc(c.q)}">${esc(c.label)}</button>`).join('');
  }

  function typing(on) {
    if (on && !typingEl) {
      typingEl = document.createElement('div');
      typingEl.className = 'msg msg-bot typing';
      typingEl.innerHTML = `${avatar()}<div class="bubble" aria-label="${t('codme is typing')}"><i></i><i></i><i></i></div>`;
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
    const pp = persona();
    if (pp.tics && !opts.noTic && Math.random() < (opts.ticChance ?? 0.35)) html += ` <span class="persona-tic">${t(pick(pp.tics))}</span>`;
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

  const name = () => api.userName() || t('friend');
  const stories = (n) => tn(n, '{n} story', '{n} stories');

  // ----- skills -----
  async function greet() {
    const pp = persona();
    if (pp.hi) { await say(t(pp.hi, { name: esc(name()) }), { chips: CHIPS_DEFAULT, noTic: true }); return; }
    await say(t(pick([
      'Hey {name}! 👋 I’m <b>codme</b>. Ask me for any tech news — a topic, a company, a time range — and I’ll sniff it out.',
      'Yo {name}! 🤖 codme online and fully buttered. What news are we hunting today?',
      'Hello hello, {name}! 🍿 Give me a topic and I’ll fetch the freshest kernels.',
    ]), { name: esc(name()) }), { chips: CHIPS_DEFAULT });
  }

  async function help() {
    await say(`${t('Here’s what I can do 🛠️')}<ul class="help-list">
      <li>${t('<b>Find anything:</b> “news about Rust”, “OpenAI this week”, “SpaceX in 2023”')}</li>
      <li>${t('<b>Hot or latest:</b> “what’s hot in gaming?”, “latest security news”')}</li>
      <li>${t('<b>Explain words:</b> “what is an API?”, “explain blockchain”')}</li>
      <li>${t('<b>Catch up:</b> “summarize today”, “stats”')}</li>
      <li>${t('<b>Your stuff:</b> “my saved stories”')}</li>
      <li>${t('<b>Silly stuff:</b> “tell me a joke”, “fun fact”, “surprise me”')}</li>
    </ul>${t('Say “more” after any search to see more results.')}`, { chips: ['🔎 News about Rust', '🛰️ SpaceX this month', '❓ What is an API?', '📊 Stats'] });
  }

  async function showList(title, results, ctx = {}) {
    if (!results.length) {
      await sorry(ctx.q || '');
      return;
    }
    last = { title, results, offset: 5, ...ctx };
    const more = results.length > 5 ? `<br><small>${tn(Math.min(5, results.length - 5), 'Say <b>“more”</b> for {n} more story.', 'Say <b>“more”</b> for {n} more stories.')}</small>` : '';
    const intro = persona().found ? `${t(persona().found)}<br>` : '';
    await say(`${intro}${title}${more}`, { cards: results.slice(0, 5), chips: results.length > 5 ? ['➕ More', '🔥 What’s hot?', '🎲 Surprise me'] : ['🔥 What’s hot?', '📋 Summarize today', '🎲 Surprise me'] });
  }

  async function more() {
    if (!last || last.offset >= last.results.length) {
      await say(last ? t('That’s every kernel I found for that one! 🍿 Try different words?') : t('More of what? Ask me something first! 😄'));
      return;
    }
    const slice = last.results.slice(last.offset, last.offset + 5);
    last.offset += 5;
    const left = last.results.length - last.offset;
    await say(`${t('Here’s more 👇')}${left > 0 ? ` <small>${t('({n} left — say “more” again)', { n: left })}</small>` : ''}`, { cards: slice });
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
    const label = c ? `${c.emoji} ${t(c.label)}` : `⚡ ${t('tech')}`;
    const when = time ? ` ${time.label}` : '';
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
        return showList(t(kind === 'hot' ? '🔥 Hottest {label} news{when} (with some help from the archive 🗄️):' : '🆕 Latest {label} news{when} (with some help from the archive 🗄️):', { label: esc(label), when: esc(when) }), merged, { q: c?.query });
      } catch {
        typing(false);
      }
    }
    return showList(t(kind === 'hot' ? '🔥 The hottest {label} kernels{when} right now:' : '🆕 Freshly popped {label} news{when}:', { label: esc(label), when: esc(when) }), list, { q: c?.label });
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
    const when = time ? ` ${time.label}` : '';
    const v = { n: results.length, q: esc(q), when: esc(when) };
    const intro = local.length
      ? tn(results.length, pick(['Sniffed out {n} story about “{q}”{when} 🐽', 'Found {n} kernel on “{q}”{when} 🍿']), pick(['Sniffed out {n} stories about “{q}”{when} 🐽', 'Found {n} kernels on “{q}”{when} — freshest & most relevant first 🍿']), v)
      : tn(results.length, 'Nothing about “{q}” in today’s feed, but I dug up {n} story from the archive{when} 🗄️', 'Nothing about “{q}” in today’s feed, but I dug up {n} stories from the archive{when} 🗄️', v);
    await showList(intro, results, { q, time, raw });
  }

  let sniffEl = null;
  function addSniff() { sniffEl = addMsg('bot', `<span class="sniff">${esc(t(pick(SNIFF)))}</span>`); }
  function removeSniff() { sniffEl?.remove(); sniffEl = null; }

  async function sorry(q) {
    const trending = api.trends().slice(0, 4).map(([w]) => chip('🔎 News about {w}', { w }));
    if (persona().none) { await say(t(persona().none, { q: esc(q) }), { chips: trending.length ? trending : CHIPS_DEFAULT, noTic: true }); return; }
    await say(t(pick([
      'I sniffed everywhere for “{q}”… nothing. 🐽💨 Try another word, or one of these trending ones?',
      'Zero kernels popped for “{q}”. 😢 Maybe check the spelling, or try something broader?',
    ]), { q: esc(q) }), { chips: trending.length ? trending : CHIPS_DEFAULT });
  }

  async function explain(g, term) {
    const related = searchLocal(api.items(), term).slice(0, 3);
    await say(`<b>${esc(g.term.toUpperCase())}</b> — ${esc(t(g.text))}${related.length ? `<br><br>${t('Related stories in today’s feed:')}` : ''}`, {
      cards: related, chips: [chip('🔎 News about {w}', { w: g.term }), '❓ What is a GPU?', '🧸 Kids corner'],
    });
  }

  async function digest() {
    const items = api.items();
    if (!items.length) return say(t('My popcorn bucket is still empty — give me a few seconds to fetch the news! 🍿'));
    const recent = items.filter((i) => i.time > Date.now() - DAY);
    const pool = recent.length >= 5 ? recent : items;
    const counts = CATEGORIES.map((c) => [c, pool.filter((i) => i.cat === c.id).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    const top = [...pool].sort((a, b) => hotness(b) - hotness(a)).slice(0, 3);
    const lead = counts[0];
    const max = lead ? lead[1] : 1;
    const bars = counts.slice(0, 5).map(([c, n]) => `<div class="mb"><span>${c.emoji} ${esc(t(c.label))}</span><i style="--w:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join('');
    await say(`<b>${t('📋 Your kernel digest')}</b><br>${recent.length >= 5 ? tn(pool.length, '{n} story popped in the last 24 hours.', '{n} stories popped in the last 24 hours.') : tn(pool.length, '{n} story popped recently.', '{n} stories popped recently.')}
      ${lead ? t('{emoji} <b>{cat}</b> is hogging the microwave with {pct}% of the chatter.', { emoji: lead[0].emoji, cat: esc(t(lead[0].label)), pct: Math.round((lead[1] / pool.length) * 100) }) : ''}
      <div class="mini-bars">${bars}</div>${t('The 3 hottest right now:')}`, { cards: top, chips: ['🔥 What’s hot?', '🆕 Latest news', '😂 Tell me a joke'] });
  }

  async function stats() {
    const s = api.status();
    const items = api.items();
    const byCat = CATEGORIES.map((c) => `${c.emoji} ${items.filter((i) => i.cat === c.id).length}`).join(' · ');
    await say(`${t('📊 I’m tracking <b>{n}</b> stories from <b>{ok}/{total}</b> sources that are vibing right now.', { n: items.length, ok: s.ok, total: s.total })}<br>${byCat}<br><small>${t('The feed refreshes every {n} seconds.', { n: s.every })}</small>`);
  }

  async function surprise() {
    const items = api.items();
    if (!items.length) return say(t('Nothing to surprise you with yet… the kernels are still heating up! 🔥'));
    const it = pick(items);
    await say(t(pick(['🎲 Rolled the dice and got…', '🎰 Jackpot! Random kernel:', '🙈 Closed my eyes and pointed at…'])), { cards: [it], chips: ['🎲 Surprise me again', '😂 Tell me a joke', '💡 Fun fact'] });
  }

  async function saved() {
    const list = api.saved();
    if (!list.length) return say(t('Your popcorn bucket is empty! Tap 📑 on any story to save it for later. 🪣'));
    await showList(tn(list.length, '🔖 You’ve saved {n} story:', '🔖 You’ve saved {n} stories:'), list);
  }

  // ----- intent router -----
  async function respond(original) {
    const raw = toEnglish(original);
    const t = raw.toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}\s'?.#+-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return say(tr('Hmm, that was all emoji and no words — I’m good, but not *that* good. 😅'), { chips: CHIPS_DEFAULT });

    if (/^(hi|hello|hey|heya|yo|sup|hola|salam|salaam|marhaba|howdy|good (morning|evening|afternoon))( there| codme| bot)?[\s!.?]*$/.test(t)) return greet();
    if (/\b(thank|thanks|thx|ty|appreciate|love you|good bot)\b/.test(t)) return say(tr(pick(['Anytime! 🍿', 'Aww, my circuits are blushing. 🤖💕', 'Happy to help — that’s literally my whole job. 😄'])));
    if (/\b(who are you|your name|what are you|are you (an? )?(ai|bot|robot|human|real))\b/.test(t)) {
      return say(tr('I’m <b>codme</b> 🤖 — kerNEl’s news-sniffing robot. I live right here in your browser, read every headline the moment it pops, and dig through years of tech-news archives (Hacker News via Algolia) when you ask for something specific. I run on pattern-matching and popcorn butter, not a giant cloud brain — so short, clear questions work best!'));
    }
    if (/\b(help|what can you do|commands|how do (i|you) (use|work))\b/.test(t)) return help();
    if (/\b(joke|funny|laugh|make me smile|pun)\b/.test(t)) return say(`😂 ${esc(pick(JOKES))}`, { chips: ['😂 Another joke', '💡 Fun fact', '🔥 What’s hot?'] });
    if (/\b(fun fact|fact|did you know|trivia)\b/.test(t)) return say(`💡 ${esc(tr(pick(FACTS)))}`, { chips: ['💡 Another fact', '😂 Tell me a joke'] });
    if (/^(more|show more|next|keep going|➕ more)\b/.test(t) || t === 'more') return more();
    if (/\b(surprise|random|i'?m bored|bored)\b/.test(t)) return surprise();
    if (/\b(kids?|child|children|kernel kids)\b/.test(t) || /\bkids corner\b/.test(t)) {
      return say(tr('🧸 The <a href="kids.html">kerNEl Kids corner</a> teaches binary, robot coding, pixels, passwords and more — with games and stars! ⭐ Perfect for young techies.'));
    }
    if (/\b(saved|bookmarks?|my list|reading list|my bucket)\b/.test(t)) return saved();
    if (/\b(summar\w*|digest|recap|brief(ing)?|tl;?dr|overview|catch me up)\b/.test(t)) return digest();
    if (/\b(stats|statistics|how many)\b/.test(t)) return stats();

    const whatIs = t.match(/^(?:what(?:'s| is| are| does)|explain|define|meaning of|eli5|tell me about)\s+(?:an?\s+|the\s+)?(.+?)\s*(?:mean)?\??$/);
    if (whatIs) {
      const g = lookupGlossary(whatIs[1]);
      if (g) return explain(g, whatIs[1]);
    }

    if (api.aiEnabled?.() && !aiOff && (await askAI(original))) return;

    const time = parseTime(t);
    const kw = keywords(t);
    const cat = detectCategory(kw);
    const wantsHot = HOT_RE.test(t);
    if (!kw.length || cat) return hotOrLatest(wantsHot ? 'hot' : 'latest', cat, time);
    return search(kw, time, raw);
  }

  /** Ask the AI on the kerNEl server. Returns false so we can fall back to offline search. */
  async function askAI(raw) {
    aiHistory.push({ role: 'user', content: raw });
    typing(true);
    try {
      const r = await api.ai(aiHistory.slice(-10));
      typing(false);
      aiHistory.push({ role: 'assistant', content: r.reply });
      const cards = Array.isArray(r.stories) ? r.stories : [];
      const cardNo = new Map(cards.map((s, i) => [s.key, i + 1]));
      // turn [n] citations into little numbers that match the story cards below
      const html = esc(r.reply)
        .replace(/\[(\d{1,3})\]/g, (m, n) => (r.refs?.[n] && cardNo.has(r.refs[n]) ? `<sup class="cite">${cardNo.get(r.refs[n])}</sup>` : ''))
        .replace(/\n/g, '<br>');
      if (cards.length) last = { title: 'AI', results: cards, offset: cards.length };
      await say(html, { cards: cards.map((c, i) => ({ ...c, _n: i + 1 })), chips: ['🔥 What’s hot?', '📋 Summarize today', '😂 Tell me a joke'] });
      return true;
    } catch (e) {
      typing(false);
      aiHistory.pop();
      if (e.status === 503) aiOff = true;
      if (e.status === 429) await say(`${esc(t(e.message))} ${t('Meanwhile, my offline brain found this: 👇')}`);
      return false;
    }
  }

  function send(text, shown) {
    const msg = String(text || '').trim();
    if (!msg) return;
    addMsg('user', esc(shown || msg));
    api.onAsk?.();
    chain = chain.then(() => respond(msg)).catch((e) => {
      console.error(e);
      typing(false);
      addMsg('bot', t('Oops — I tripped over a cable. 🔌 Try that again?'));
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

  // ----- 🎭 personality picker -----
  const picker = $('#codmePersonas');
  const titleEl = panel.querySelector('.codme-title b');
  const paintTitle = () => {
    const pp = persona();
    titleEl.textContent = pp.id === 'classic' ? 'codme' : `codme · ${pp.emoji} ${t(pp.name)}`;
    launcher.dataset.persona = pp.id;
    launcher.dataset.personaEmoji = pp.id === 'classic' ? '' : pp.emoji; // a little costume badge on the button
  };
  function paintPicker() {
    picker.innerHTML = `<p class="tp-label">🎭 ${t('Pick codme’s personality')}</p>${PERSONAS.map((pp) => {
      const item = itemFor('persona', pp.id);
      const open = pp.id === 'classic' || api.ownsPersona?.(pp.id);
      const on = persona().id === pp.id;
      return `<button type="button" class="persona-opt${on ? ' on' : ''}" data-persona="${pp.id}" aria-pressed="${on}">
        <span aria-hidden="true">${pp.emoji}</span><b>${esc(t(pp.name))}</b><small>${on ? '✓' : open ? '' : `🔒 🧈 ${item?.price ?? ''}`}</small></button>`;
    }).join('')}`;
  }
  $('#codmePersonaBtn')?.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    if (!picker.hidden) paintPicker();
  });
  picker?.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-persona]');
    if (!b) return;
    const id = b.dataset.persona;
    if (id !== 'classic' && !api.ownsPersona?.(id)) { picker.hidden = true; api.openShop?.('persona'); return; }
    api.setPersona?.(id === 'classic' ? 'none' : id);
    picker.hidden = true;
    paintTitle();
    aiHistory = []; // a fresh start in the new costume
    sfx.ding();
    greet();
  });
  document.addEventListener('kernel:look', (e) => { if (e.detail?.kind === 'persona') { paintTitle(); if (!panel.hidden) greet(); } });
  paintTitle();

  launcher.addEventListener('click', toggle);
  $('#codmeClose').addEventListener('click', close);
  $('#codmeClear').addEventListener('click', () => { log.innerHTML = ''; last = null; aiHistory = []; greet(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); input.value = ''; });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.qchip');
    if (b) send(b.dataset.q || b.textContent, b.textContent);
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
      rec.lang = langInfo.speech;
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
  const updateStatus = () => { statusEl.textContent = t('online · sniffing {n} stories', { n: api.items().length }); };
  updateStatus();

  return {
    open, close, toggle, send, updateStatus,
    notify(fresh) {
      updateStatus();
      if (!fresh.length) return;
      if (!panel.hidden) {
        const top = [...fresh].sort((a, b) => hotness(b) - hotness(a)).slice(0, 2);
        say(tn(fresh.length, 'Ding! 🔔 {n} new story just popped. Here’s the tastiest:', 'Ding! 🔔 {n} new stories just popped. Here’s the tastiest:'), { cards: top });
      }
    },
  };
}
