// 🎟️ Invite links: kerNEl…/#join=<username>. The new kernel and the friend who invited them both get bonus XP,
// and invites unlock the 🎟️ VIP ticket hat (1 friend) and the Ambassador frame (5 friends).
import { $, esc, store, toast } from './utils.js';
import { auth } from './auth.js';
import { t, tn } from './i18n.js';
import { lookHTML } from './look.js';
import { burstFrom, sfx } from './fun.js';

const linkFor = (username) => `${location.origin}${location.pathname}#join=${encodeURIComponent(username)}`;

/** Someone opened an invite link: remember who invited them (for 7 days) until they sign up. */
export function catchInvite(openAuth) {
  const m = decodeURIComponent(location.hash).match(/^#join=([A-Za-z0-9_]{3,20})$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (auth.user) return; // already has an account
  store.set('invite', { by: m[1], at: Date.now() });
  setTimeout(() => {
    toast(t('@{name} invited you! Sign up to get +50 XP and the 🥳 Party hat.', { name: m[1] }), { emoji: '🎟️', ms: 7000 });
    openAuth?.('signup');
  }, 900);
}

/** Who invited this browser (if anyone, and not too long ago). */
export function pendingInvite() {
  const i = store.get('invite', null);
  return i && Date.now() - i.at < 7 * 864e5 ? i.by : null;
}
export const clearInvite = () => store.del('invite');

export function paintInviteNote() {
  const note = $('#inviteNote');
  if (!note) return;
  const by = pendingInvite();
  note.hidden = !by;
  if (by) note.textContent = t('🎟️ Invited by @{name} — you’ll both get +50 XP.', { name: by });
}

export function initInvites() {
  const box = $('#inviteWidget');
  if (!box || !auth.ready) return null;
  async function render() {
    box.hidden = false;
    const body = $('#inviteBody');
    if (!auth.user) {
      body.innerHTML = `<p class="small">${t('Bring your friends to kerNEl — you both get +50 XP.')}</p><button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to get your invite link')}</button>`;
      return;
    }
    const link = linkFor(auth.user.username);
    let info = { count: 0, people: [], xpEach: 50 };
    try { info = await auth.api('/api/me/invites'); } catch { /* show the link anyway */ }
    body.innerHTML = `
      <p class="small">${t('Share your link. When a friend signs up with it, you both get +{xp} XP.', { xp: info.xpEach })}</p>
      <div class="invite-link"><input readonly value="${esc(link)}" aria-label="${esc(t('Your invite link'))}"><button type="button" class="btn btn-primary btn-sm" data-invite="copy">${t('Copy')}</button>${navigator.share ? `<button type="button" class="btn btn-ghost btn-sm" data-invite="share">${t('Share')}</button>` : ''}</div>
      <p class="invite-goals"><span class="${info.count >= 1 ? 'done' : ''}">🎟️ ${t('1 friend: VIP ticket hat')}</span><span class="${info.count >= 5 ? 'done' : ''}">💙 ${t('5 friends: Ambassador frame')}</span></p>
      <p class="muted small">${info.count ? tn(info.count, 'You’ve invited {n} friend', 'You’ve invited {n} friends') : t('No friends invited yet — be the first in your group! 🍿')}</p>
      ${info.people.length ? `<div class="invite-people">${info.people.slice(0, 12).map((p) => `<button type="button" class="friend" data-user="${esc(p.username)}" title="@${esc(p.username)}">${lookHTML(p)}</button>`).join('')}</div>` : ''}`;
  }
  box.addEventListener('click', async (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-invite]') : null;
    if (!b || !auth.user) return;
    const link = linkFor(auth.user.username);
    try {
      if (b.dataset.invite === 'share') await navigator.share({ title: 'kerNEl', text: t('Join me on kerNEl — tech news, games and chat! 🍿'), url: link });
      else { await navigator.clipboard.writeText(link); toast(t('Invite link copied! 🎟️'), { emoji: '🎟️' }); burstFrom(b, { emojis: ['🎟️', '✨'], count: 8 }); sfx.pop(); }
    } catch { /* cancelled */ }
  });
  render();
  auth.addEventListener('signin', render);
  auth.addEventListener('signout', render);
  return { render };
}
