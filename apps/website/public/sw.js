/* global caches, self */

const CACHE_PREFIX = 'learnbox-public-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v10`;
const OFFLINE_URL = '/offline.html';
// Bobo expressions reachable while offline are precached as their RAW public paths.
// Bobo renders through next/image, so the first request is '/_next/image?url=...' which
// this worker intentionally does not cache (it can proxy protected media). The component
// falls back to the raw path below on error, which is why precaching these two is enough.
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  '/images/bobo/celebrate-v2.png',
  '/images/bobo/recovery-v2.png',
  '/images/launch/germany-welcome-v1.jpg',
  '/icons/learnbox-v1-192.png',
  '/icons/learnbox-v1-512.png',
  '/fonts/IRANSansX-Regular.woff2',
  '/fonts/IRANSansX-Bold.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isPublicShellRequest =
    requestUrl.origin === self.location.origin &&
    !requestUrl.pathname.startsWith('/api/') &&
    !event.request.headers.has('Authorization') &&
    (event.request.mode === 'navigate' ||
      requestUrl.pathname.startsWith('/_next/static/') ||
      requestUrl.pathname.startsWith('/fonts/') ||
      requestUrl.pathname.startsWith('/images/') ||
      requestUrl.pathname.startsWith('/icons/') ||
      requestUrl.pathname === '/icon.svg' ||
      requestUrl.pathname === '/manifest.webmanifest');

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isPublicShellRequest && response.ok) {
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match(OFFLINE_URL);
        return Response.error();
      }),
  );
});

// Daily review-reminder (LB-B19 made real). The payload is plain JSON with a title/body the
// notification-worker service chose; nothing here reaches into learner data, so the worst a
// forged push can do (if it ever got past VAPID auth) is show a generic reminder text.
self.addEventListener('push', (event) => {
  let payload = { title: 'LearnBox', body: 'وقت مرور کلمات امروزته!' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload = { ...payload, body: event.data.text() || payload.body };
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/learnbox-v1-192.png',
      badge: '/icons/learnbox-v1-192.png',
      tag: 'learnbox-daily-reminder',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
