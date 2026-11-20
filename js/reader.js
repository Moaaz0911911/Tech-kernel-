// The reader: a story opens inside kerNEl in a clean sheet — picture, headline, the publisher's description,
// a quick summary (TL;DR or "explain like I'm 10"), your reaction, and the comments.
import { $, $$, esc, safeUrl, timeAgo, hash } from './utils.js';
import { catById } from './news.js';
import { t, lang } from './i18n.js';
import { icon, applyIcons } from './icons.js';
import { sfx } from './fun.js';

export function initReader({ getData, reactsHTML, summarize, speakText, showComments, onOpen, chatEnabled }) {
  const dlg = $('#readerDialog');
  const scroller = $('#readerScroll');
  let item = null;
  let mode = 'tldr';
  let summaryText = '';
  let returnFocus = null;

  const thumb = (it) => {
    const c = catById(it.cat);
    const art = `<div class="art" style="--rot:${(hash(it.key) % 24) - 12}deg"><span class="art-emoji">${c.emoji}</span></div>`;
    return it.image && safeUrl(it.image) !== '#' ? `${art}<img src="${esc(safeUrl(it.image))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : art;
  };

  function tools(it) {
    const d = getData();
    const saved = d.saved.some((s) => s.key === it.key);
    return `<button type="button" class="icon-btn save${saved ? ' on' : ''}" data-save aria-pressed="${saved}" title="${saved ? t('Remove from your bucket') : t('Save to your popcorn bucket')}">${icon('bookmark')}</button>
      ${chatEnabled ? `<button type="button" class="icon-btn" data-chatshare title="${t('Share to kerNEl Chat')}">${icon('chat')}</button>` : ''}
      <button type="button" class="icon-btn" data-share title="${t('Share')}">${icon('share')}</button>`;
  }

  async function loadSummary() {
    const it = item;
    const m = mode;
    $$('#readerDialog [data-rmode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rmode === m)));
    const box = $('#readerSummary');
    box.innerHTML = `<span class="muted">${t('codme is thinking…')}</span>`;
    const r = await summarize(it, m);
    if (it !== item || m !== mode) return; // the reader moved on
    summaryText = r.text;
    box.textContent = r.text;
    $('#readerSummaryNote').textContent = r.ai ? t('🤖 codme AI') : t('🍿 codme’s quick explainer');
  }

  function open(it, { focus = null } = {}) {
    if (!it) return;
    item = it;
    mode = 'tldr';
    returnFocus = document.activeElement;
    const c = catById(it.cat);
    const mine = getData().reactions[it.key];
    $('#readerSrc').textContent = it.source || it.domain || '';
    $('#readerTools').dataset.key = it.key;
    $('#readerTools').innerHTML = tools(it);
    $('#readerMedia').innerHTML = thumb(it);
    $('#readerKicker').textContent = [`${t(c.label)}`, it.source, timeAgo(it.time)].filter(Boolean).join(' · ');
    const title = $('#readerTitle');
    title.textContent = it.title;
    title.setAttribute('dir', 'auto');
    title.setAttribute('lang', 'en');
    $('#readerDek').textContent = it.summary || '';
    const openBtn = $('#readerOpen');
    openBtn.href = safeUrl(it.url);
    openBtn.innerHTML = `${esc(t('Continue reading on {source}', { source: it.source || it.domain || t('the original site') }))} ${icon('external')}`;
    const tr = $('#readerTranslate');
    tr.hidden = lang === 'en';
    if (lang !== 'en') tr.href = `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(safeUrl(it.url))}`;
    const reacts = $('#readerReacts');
    reacts.dataset.key = it.key;
    reacts.innerHTML = reactsHTML(it, mine, 'reader-reacts-row');
    if (!dlg.open) dlg.showModal();
    scroller.scrollTop = 0;
    loadSummary();
    showComments(it, { focus: focus === 'comments' });
    if (focus === 'comments') setTimeout(() => $('.reader-comments').scrollIntoView({ behavior: 'smooth', block: 'start' }), 380);
    onOpen?.(it);
    sfx.pop();
  }

  function close() { if (dlg.open) dlg.close(); }

  dlg.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (e.target === dlg || el?.closest('[data-reader="close"]')) { close(); return; }
    const m = el?.closest('[data-rmode]');
    if (m && item && m.dataset.rmode !== mode) { mode = m.dataset.rmode; loadSummary(); }
  });
  $('#readerSpeak').addEventListener('click', () => { if (summaryText) speakText(`${item.title}\n${summaryText}`); });
  dlg.addEventListener('close', () => {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (location.hash.startsWith('#story=')) history.replaceState(null, '', location.pathname + location.search);
    returnFocus?.focus?.({ preventScroll: true });
  });
  applyIcons(dlg);
  return { open, close, current: () => item, isOpen: () => dlg.open };
}
