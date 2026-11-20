// kerNEl social on the website: 🗨️ story comments and 👯 friends (who you follow + what they've been up to).
import { $, esc, timeAgo, toast } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';
import { t, tServer } from './i18n.js';
import { lookHTML } from './look.js';

export function initSocial({ openAuth, onComment, rankInfo, badgeInfo, onCount }) {
  if (!auth.ready) { $('#friendsWidget')?.remove(); return null; }

  // ====================================================================================
  // 🗨️ story comments
  // ====================================================================================
  const dlg = $('#commentsDialog');
  const list = $('#commentsList');
  const form = $('#commentForm');
  const input = $('#commentInput');
  let story = null;

  const formatText = (text) => esc(text).replace(/(^|\s)@([A-Za-z0-9_]{2,20})\b/g, (m, sp, name) => `${sp}<b class="at" data-user="${name}">@${name}</b>`);
  const commentHTML = (c) => `<div class="cmt" data-cid="${c.id}">
    <button type="button" class="cm-ava" data-user="${esc(c.user.username)}" aria-label="${esc(t('{name}’s profile', { name: c.user.nickname }))}">${lookHTML(c.user, { streak: c.user.streak })}</button>
    <div class="cmt-bubble">
      <div class="cmt-head"><button type="button" data-user="${esc(c.user.username)}" dir="auto">${esc(c.user.nickname)}</button><time>${timeAgo(c.created)}</time>
        ${c.mine ? `<button type="button" class="cm-more" data-cmt="delete" aria-label="${t('Delete my comment')}">🗑️</button>` : auth.user ? `<button type="button" class="cm-more" data-cmt="report" aria-label="${t('Report comment')}">🚩</button>` : ''}</div>
      <div class="cmt-text" dir="auto">${formatText(c.text)}</div>
    </div></div>`;

  async function load() {
    try {
      const r = await auth.api(`/api/comments?key=${encodeURIComponent(story.key)}`);
      list.innerHTML = r.items.length ? r.items.map(commentHTML).join('') : `<div class="chat-empty"><span>🗨️</span><p>${t('No comments yet. Drop the first hot take!')}</p></div>`;
      list.scrollTop = list.scrollHeight;
      onCount?.(story.key, r.items.length);
    } catch (e) { list.innerHTML = `<p>😵 ${esc(tServer(e.message))}</p>`; }
  }

  function open(item) {
    story = item;
    $('#commentsStory').textContent = item.title;
    form.hidden = !auth.user;
    $('#commentGuest').hidden = !!auth.user;
    list.innerHTML = '<div class="chat-empty"><span class="spin">🍿</span></div>';
    if (!dlg.open) dlg.showModal();
    load();
    if (auth.user) setTimeout(() => input.focus(), 100);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await auth.api('/api/comments', { method: 'POST', body: { key: story.key, text } });
      input.value = '';
      burstFrom(btn, { emojis: ['🗨️', '🍿', '✨'], count: 8 });
      sfx.pop();
      onComment?.();
      load();
    } catch (err) { toast(tServer(err.message), { emoji: err.status === 403 ? '🔇' : '😵', ms: 6000 }); }
    finally { btn.disabled = false; }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
  list.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const row = el?.closest('[data-cid]');
    if (!row) return;
    const id = Number(row.dataset.cid);
    if (el.closest('[data-cmt="delete"]')) {
      if (!confirm(t('Delete this comment?'))) return;
      try { await auth.api(`/api/comments/${id}`, { method: 'DELETE' }); load(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    } else if (el.closest('[data-cmt="report"]')) {
      if (!confirm(t('Report this comment as mean, unsafe or spam? Comments with 3 reports are hidden.'))) return;
      try { const r = await auth.api('/api/comments/report', { method: 'POST', body: { id } }); toast(r.hidden ? t('Thanks — that comment is now hidden.') : t('Thanks for reporting. We’ve got it from here. 🛡️'), { emoji: '🚩' }); load(); } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  dlg.addEventListener('click', (e) => { if (e.target === e.currentTarget) dlg.close(); });
  dlg.addEventListener('close', () => { if (location.hash.startsWith('#story=')) history.replaceState(null, '', location.pathname + location.search); });

  // ====================================================================================
  // 👯 friends
  // ====================================================================================
  function activityText(a) {
    const who = `<b data-user="${esc(a.user.username)}">@${esc(a.user.username)}</b>`;
    switch (a.kind) {
      case 'rank': { const r = rankInfo(a.data.rank); return `${r.emoji} ${t('{who} hit {rank}!', { who, rank: esc(t(r.title)) })}`; }
      case 'badge': { const b = badgeInfo(a.data.id); return b ? `🏅 ${t('{who} unlocked {badge}', { who, badge: `${b.emoji} ${esc(t(b.name))}` })}` : ''; }
      case 'quiz': return `🧠 ${t('{who} scored {s}/{n} in the Daily Quiz', { who, s: a.data.score, n: a.data.total })}`;
      case 'tourney': return `🕵️ ${t('{who} scored {s}/{n} in the weekly tournament', { who, s: a.data.score, n: a.data.total })}`;
      case 'trophy': return `${['🥇', '🥈', '🥉'][a.data.place - 1] || '🏆'} ${t('{who} won a tournament trophy (#{place})!', { who, place: a.data.place })}`;
      case 'streak': return `🔥 ${t('{who} is on a {n}-day streak!', { who, n: a.data.n })}`;
      default: return '';
    }
  }

  async function loadFriends() {
    const box = $('#friendsWidget');
    if (!auth.user) { box.hidden = true; return; }
    box.hidden = false;
    try {
      const r = await auth.api('/api/me/friends');
      const people = r.following.length
        ? `<div class="friend-row">${r.following.map((p) => `<button type="button" class="friend" data-user="${esc(p.username)}">${lookHTML(p, { streak: p.streak })}<span dir="auto">${esc(p.nickname)}</span></button>`).join('')}</div>`
        : `<p class="muted small">${t('You’re not following anyone yet. Tap a name in the chat or on the leaderboard, then ➕ Follow.')}</p>`;
      const acts = r.activity.map((a) => ({ a, html: activityText(a) })).filter((x) => x.html).slice(0, 8);
      $('#friendsBody').innerHTML = `${people}
        <p class="muted small">${t('{n} followers · {m} following', { n: r.followers, m: r.following.length })}</p>
        ${acts.length ? `<ul class="activity">${acts.map(({ a, html }) => `<li>${lookHTML(a.user)}<span>${html}<time>${timeAgo(a.created)}</time></span></li>`).join('')}</ul>` : r.following.length ? `<p class="muted small">${t('Your friends have been quiet lately… 🦗')}</p>` : ''}`;
    } catch { box.hidden = true; }
  }

  loadFriends();
  auth.addEventListener('signin', loadFriends);
  auth.addEventListener('signout', loadFriends);
  setInterval(() => { if (!document.hidden) loadFriends(); }, 5 * 60_000);
  return { openComments: open, loadFriends, needsAuth: () => openAuth('signin') };
}
