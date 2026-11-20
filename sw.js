// kerNEl service worker: shows push notifications and keeps the app working offline.
const CACHE = 'kernel-v3';
const SHELL = ['./', 'index.html', 'kids.html', 'css/main.css', 'css/kids.css', 'assets/favicon.svg', 'assets/icon-192.png',
  'js/app.js', 'js/config.js', 'js/utils.js', 'js/content.js', 'js/fun.js', 'js/news.js', 'js/auth.js', 'js/codme.js',
  'js/community.js', 'js/notify.js', 'js/game.js', 'js/kids.js', 'js/i18n.js', 'js/i18n-main.js', 'js/i18n-kids.js',
  'js/fakes.js', 'js/cosmetics.js', 'js/look.js', 'js/play.js', 'js/social.js', 'js/extras.js', 'js/icons.js', 'js/tabs.js', 'js/reader.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Same-site files: try the network first (always fresh), fall back to the cache when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    } catch {
      return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    }
  })());
});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'kerNEl', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'kerNEl', {
    body: d.body || '',
    icon: 'assets/icon-192.png',
    badge: 'assets/badge-96.png',
    tag: d.tag || 'kernel',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  const inside = url.startsWith(self.registration.scope);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open && inside) { // kerNEl is already open: bring it forward and go there
      await open.focus();
      open.postMessage({ type: 'kernel-open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
