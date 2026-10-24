// Relay service worker — app-shell precache + offline fallback + notification
// clicks. (No `push` handler: Holm has no Web Push yet.)
// Holm serves /sw.js with short/revalidating cache headers so update checks stay fresh.

const VERSION = 'relay-v0.2.0'; // the version in holm.json
const CACHE_PREFIX = 'relay-v';
const SHELL = [
  '/',
  '/index.html',
  '/src/styles.css',
  '/favicon.svg',
  '/manifest.webmanifest'
];

function relayVersionParts(key) {
  if (!key.startsWith(CACHE_PREFIX)) return null;
  const parts = key.slice(CACHE_PREFIX.length).split('.').map((part) => Number(part));
  return parts.length && parts.every((part) => Number.isInteger(part)) ? parts : null;
}

function compareRelayVersions(a, b) {
  const left = relayVersionParts(a);
  const right = relayVersionParts(b);
  if (!left || !right) return 0;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function isAppOwnedRoute(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_') ||
    pathname.startsWith('/cdn-cgi/')
  ) return false;
  return !/\/[^/]+\.[^/]+$/.test(pathname);
}

function shouldCacheNavigationShell(req, res) {
  if (!res || !res.ok) return false;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return false;
  const finalUrl = new URL(res.url || req.url, self.location.origin);
  return finalUrl.origin === self.location.origin && isAppOwnedRoute(finalUrl.pathname);
}

function offlineNavigationResponse() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Relay offline</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><h1>Relay is offline</h1><p>The app shell is not available right now. Check your connection and retry.</p></main></body></html>',
    { status: 503, statusText: 'Service Unavailable', headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const relayKeys = keys.filter((key) => relayVersionParts(key)).sort(compareRelayVersions);
      const newestPrior = relayKeys.filter((key) => key !== VERSION).pop();
      const keep = new Set([VERSION, newestPrior].filter(Boolean));
      return Promise.all(
        relayKeys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API or realtime socket — always go to network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_ws')) return;

  // App navigations: network-first, fall back to cached shell when offline.
  // respondWith MUST resolve to a Response — never undefined — or the browser
  // throws "Failed to convert value to 'Response'". Guard every fallback.
  if (req.mode === 'navigate') {
    let cacheWrite = Promise.resolve();
    const responsePromise = fetch(req)
      .then((res) => {
        if (shouldCacheNavigationShell(req, res)) {
          const copy = res.clone();
          cacheWrite = caches.open(VERSION)
            .then((c) => c.put('/index.html', copy))
            .catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match('/index.html')
        .then((r) => r || caches.match('/'))
        .then((r) => r || offlineNavigationResponse()));
    event.respondWith(responsePromise);
    event.waitUntil(responsePromise.then(() => cacheWrite, () => cacheWrite));
    return;
  }

  // Mutable source files: network-first so online clients see current bytes.
  if (url.origin === self.location.origin && url.pathname.startsWith('/src/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error()))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          // If the network fails (offline, blocked by an extension, etc.) fall
          // back to cache; if there's no cache either, yield a real (error)
          // Response so respondWith never receives undefined.
          .catch(() => cached || Response.error());
        return cached || network;
      })
    );
  }
});

// Notification tap: focus an open Relay window and route it to the chat, or
// open one. Notifications are shown by the page via registration.showNotification
// (tag `relay:<roomId>`, data.url = chat path) so they also work in installed PWAs.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        win.postMessage({ type: 'relay:navigate', url: path });
        return win.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
