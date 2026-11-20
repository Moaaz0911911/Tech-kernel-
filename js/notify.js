// kerNEl notifications on the website: 🔔 inbox, Web Push on/off, settings, install-as-app, deep links.
import { $, $$, esc, timeAgo, toast, store } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom } from './fun.js';

const b64uToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const secure = () => location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
const pushSupported = () => secure() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function initNotify({ openAuth, openRoom }) {
  const bell = $('#bellBtn');
  const panel = $('#bellPanel');
  let swReg = null;
  let installEvent = null;
  let timer = 0;
  let items = [];

  // ---------- service worker (push + offline) ----------
  // (the one-file build has no manifest and no sw.js next to it, so it skips this)
  if (secure() && 'serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'kernel-open') go(e.data.url); });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; paintInstall(); });
  window.addEventListener('appinstalled', () => { installEvent = null; paintInstall(); toast('kerNEl is on your home screen! 🍿', { emoji: '📲' }); });
  const swReady = () => (swReg ? Promise.resolve(swReg) : navigator.serviceWorker.ready);

  // ---------- deep links (#chat=room) ----------
  function go(url) {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) { window.open(u.href, '_blank', 'noopener'); return; }
    if (u.hash.startsWith('#chat=')) { openRoom(u.hash.slice(6)); history.replaceState(null, '', location.pathname + location.search); return; }
    if (u.pathname !== location.pathname) location.href = u.href;
  }
  const fromHash = () => { if (location.hash.startsWith('#chat=')) go(location.href); };
  window.addEventListener('hashchange', fromHash);
  setTimeout(fromHash, 300);

  // ---------- 🔔 inbox ----------
  function paintBell(unread) {
    const show = auth.ready && !!auth.user;
    bell.hidden = !show;
    const count = bell.querySelector('.bell-count');
    count.hidden = !unread;
    count.textContent = unread > 9 ? '9+' : String(unread || '');
    bell.setAttribute('aria-label', unread ? `Notifications, ${unread} new` : 'Notifications');
  }

  async function loadInbox() {
    clearTimeout(timer);
    if (!auth.user) { paintBell(0); return; }
    try {
      const r = await auth.api('/api/notifications');
      const prevTop = items[0]?.id;
      items = r.items;
      paintBell(r.unread);
      if (!panel.hidden) paintPanel();
      if (prevTop && items[0] && items[0].id > prevTop && !items[0].read) { // something new while you're here
        toast(items[0].title, { emoji: '🔔', ms: 5000 });
        bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring');
        sfx.ding();
      }
    } catch { /* offline */ }
    timer = setTimeout(() => (document.hidden ? (timer = setTimeout(loadInbox, 60_000)) : loadInbox()), 60_000);
  }

  function paintPanel() {
    const pushOn = store.get('push:on', false);
    $('#bellList').innerHTML = items.length
      ? items.map((n) => `<button type="button" class="bell-item${n.read ? '' : ' unread'}" data-nid="${n.id}" data-url="${esc(n.url || './')}">
          <span class="bi-icon" aria-hidden="true">${esc(n.icon || '🍿')}</span>
          <span class="bi-text"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<time>${timeAgo(n.created)}</time></span></button>`).join('')
      : '<p class="bell-empty">🍿 Nothing yet. When someone @mentions you, big news breaks in your topics, or your streak needs saving, it shows up here.</p>';
    $('#bellCta').hidden = pushOn || !pushPossible();
  }

  function togglePanel(force) {
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) { paintPanel(); loadInbox(); }
  }

  bell.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
  document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest?.('#bellPanel')) togglePanel(false); });
  panel.addEventListener('click', async (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest('[data-bell="read"]')) {
      await auth.api('/api/notifications/read', { method: 'POST', body: { all: true } }).catch(() => {});
      items = items.map((n) => ({ ...n, read: true }));
      paintBell(0); paintPanel();
      return;
    }
    if (t.closest('[data-bell="settings"]')) { togglePanel(false); openSettings(); return; }
    const item = t.closest('[data-nid]');
    if (item) {
      auth.api('/api/notifications/read', { method: 'POST', body: { id: Number(item.dataset.nid) } }).catch(() => {});
      togglePanel(false);
      go(item.dataset.url);
      setTimeout(loadInbox, 500);
    }
  });

  // ---------- settings + turning push on ----------
  const pushPossible = () => pushSupported() && !(isIOS() && !isStandalone());

  async function devicePushState() {
    if (isIOS() && !isStandalone()) return 'ios-install'; // Apple: push only for Home Screen apps
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    try {
      const reg = await swReady();
      const sub = await reg.pushManager.getSubscription();
      store.set('push:on', !!sub && Notification.permission === 'granted');
      return sub && Notification.permission === 'granted' ? 'on' : 'off';
    } catch { return 'off'; }
  }

  const STATE_TEXT = {
    on: ['🔔', 'Notifications are ON for this device.'],
    off: ['🔕', 'Notifications are off on this device.'],
    blocked: ['⛔', 'Notifications are blocked for kerNEl in your browser settings. Allow them there, then come back.'],
    unsupported: ['🤷', 'This browser can’t do push notifications. Try Chrome, Edge, Firefox or Safari.'],
    'ios-install': ['📱', 'On iPhone and iPad, notifications work once kerNEl is on your Home Screen (Apple’s rule). Here’s how:'],
  };

  async function paintSettings() {
    const state = await devicePushState();
    const [icon, text] = STATE_TEXT[state];
    $('#nsState').innerHTML = `<span class="ns-icon">${icon}</span><span>${esc(text)}</span>`;
    $('#nsIOS').hidden = state !== 'ios-install';
    $('#nsOn').hidden = state !== 'off';
    $('#nsOff').hidden = state !== 'on';
    $('#nsTest').hidden = state !== 'on';
    paintInstall();
    if (auth.user) {
      try {
        const p = await auth.api('/api/notify/prefs');
        for (const k of ['mentions', 'news', 'streak']) $(`#notifyDialog [name="${k}"]`).checked = !!p[k];
        $('#nsDevices').textContent = p.devices ? `Push is on for ${p.devices} device${p.devices === 1 ? '' : 's'}.` : '';
      } catch { /* offline */ }
    }
  }

  function paintInstall() {
    const btn = $('#nsInstall');
    if (btn) btn.hidden = !installEvent || isStandalone();
  }

  function openSettings() {
    if (!auth.user) { toast('Sign in to get notifications.', { emoji: '🔔' }); openAuth('signin'); return; }
    const dlg = $('#notifyDialog');
    if (!dlg.open) dlg.showModal();
    paintSettings();
  }

  async function enablePush(btn) {
    try {
      btn.disabled = true;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('No worries — you can turn notifications on any time.', { emoji: '🔕' }); return paintSettings(); }
      const reg = await swReady();
      const { publicKey } = await auth.api('/api/push/key', { auth: false });
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
      await auth.api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), tz: -new Date().getTimezoneOffset() } });
      store.set('push:on', true);
      burstFrom(btn, { emojis: ['🔔', '🍿', '✨'], count: 14 });
      sfx.win();
      await auth.api('/api/push/test', { method: 'POST' }).catch(() => {});
      toast('Notifications on! A test one is on its way. 🔔', { emoji: '🎉' });
    } catch (e) {
      toast(`Couldn’t turn on notifications: ${e.message}`, { emoji: '😵', type: 'error', ms: 6000 });
    } finally {
      btn.disabled = false;
      paintSettings();
      loadInbox();
    }
  }

  async function disablePush() {
    try {
      const reg = await swReady();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await auth.api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      store.set('push:on', false);
      toast('Notifications off on this device. 🔕', { emoji: '🔕' });
    } finally { paintSettings(); }
  }

  $('#nsOn').addEventListener('click', (e) => enablePush(e.currentTarget));
  $('#nsOff').addEventListener('click', disablePush);
  $('#nsTest').addEventListener('click', async () => {
    try { const r = await auth.api('/api/push/test', { method: 'POST' }); toast(r.sent ? 'Test sent — look at your notifications! 🔔' : 'Sent to your 🔔 inbox (no device received it).', { emoji: '🧪' }); }
    catch (e) { toast(e.message, { emoji: '😵' }); }
    loadInbox();
  });
  $('#nsInstall').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    paintInstall();
  });
  $$('#notifyDialog .ns-kinds input').forEach((box) => box.addEventListener('change', () => {
    const prefs = Object.fromEntries(['mentions', 'news', 'streak'].map((k) => [k, $(`#notifyDialog [name="${k}"]`).checked]));
    auth.api('/api/notify/prefs', { method: 'PUT', body: { prefs, tz: -new Date().getTimezoneOffset() } }).catch(() => {});
  }));
  $('#notifyDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#bellCta').addEventListener('click', () => { togglePanel(false); openSettings(); });

  // ---------- lifecycle ----------
  auth.addEventListener('signin', () => { paintBell(0); loadInbox(); });
  auth.addEventListener('signout', () => { items = []; paintBell(0); togglePanel(false); });
  paintBell(0);
  if (auth.user) {
    loadInbox();
    // keep the time zone fresh so streak reminders arrive in your evening
    if (store.get('push:on', false)) auth.api('/api/notify/prefs', { method: 'PUT', body: { tz: -new Date().getTimezoneOffset() } }).catch(() => {});
  }

  return { openSettings, refresh: loadInbox };
}
