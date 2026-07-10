// TOP BINS Service Worker
// - アプリシェル(index.html/manifest.json)はnetwork-first: オンライン時は常に最新、オフライン時はキャッシュにフォールバック
// - audio/images は cache-first: 一度再生・表示したファイルはオフラインでも再生可能
// - /api/* は一切キャッシュしない（AIコール・音声認識・採点は常に最新のレスポンスが必要）
const SHELL_CACHE = 'topbins-shell-v1';
const RUNTIME_CACHE = 'topbins-runtime-v1';
const SHELL_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith('/audio/') || url.pathname.startsWith('/images/') || url.pathname === '/manifest.json') {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

// 復習期限が来たシーンの再挑戦を促すプッシュ通知（api/send-review-notifications.jsから送信）
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'TOP BINS';
  const body = data.body || '復習の時間だ。';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/images/icon-192.png',
      badge: '/images/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
      // 既存タブがあっても素通りせず、必ずクリック計測用パラメータ付きURLへ遷移させる
      for (const client of clients) {
        if ('navigate' in client) {
          await client.navigate(url);
          if ('focus' in client) return client.focus();
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
