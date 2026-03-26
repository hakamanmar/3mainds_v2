/* sw.js - 3Minds PWA Service Worker with Push Notifications */
const CACHE_NAME = '3minds-v10';
const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
    '/manifest.json'
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
    );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    return self.clients.claim();
});

// ── Fetch: Smart caching ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never cache API calls, auth, or uploads (real-time data)
    const skip = url.pathname.startsWith('/api/') ||
                 url.pathname.startsWith('/login') ||
                 url.pathname.startsWith('/logout') ||
                 url.pathname.startsWith('/uploads/') ||
                 event.request.method !== 'GET';
    if (skip) return;

    // Stale-while-revalidate for app shell
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request).then((res) => {
                if (res.status === 200) {
                    caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});

// ── Push Notification ──────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    let data = { title: 'منصة 3Minds', body: 'لديك إشعار جديد', url: '/' };
    try {
        if (event.data) data = { ...data, ...event.data.json() };
    } catch (e) {}

    const options = {
        body: data.body,
        icon: '/static/img/icon-192.png',
        badge: '/static/img/icon-192.png',
        image: data.image || undefined,
        vibrate: [200, 100, 200],
        tag: data.tag || 'notif-' + Date.now(),
        renotify: true,
        requireInteraction: data.requireInteraction || false,
        dir: 'rtl',
        lang: 'ar',
        data: { url: data.url || '/', type: data.type || 'general' },
        actions: [
            { action: 'open', title: 'فتح المنصة' },
            { action: 'dismiss', title: 'إغلاق' }
        ]
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification Click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const targetUrl = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing tab if open
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.navigate(targetUrl);
                    return;
                }
            }
            // Otherwise open a new tab
            return clients.openWindow(targetUrl);
        })
    );
});

// ── Background Sync (future use) ───────────────────────────────────────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-attendance') {
        // Placeholder for future offline attendance sync
        console.log('[SW] Background sync triggered:', event.tag);
    }
});
