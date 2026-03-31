const CACHE_NAME = '3minds-v41';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/pages/AdminPage.js',
    '/pages/HomePage.js',
    '/pages/SectionManagementPage.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))));
    self.clients.claim();
});

// ─── Push Notification Handler ────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: '3Minds', body: event.data.text(), icon: '/logo.png' };
    }

    const options = {
        body: data.body || 'لديك إشعار جديد',
        icon: data.icon || '/logo.png',
        badge: '/logo.png',
        tag: data.tag || 'default',
        renotify: true,
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/',
            type: data.type || 'general'
        },
        actions: data.actions || []
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '3Minds', options)
    );
});

// ─── Notification Click Handler ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it and navigate
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE', url: targetUrl });
                    return;
                }
            }
            // If app is closed, open it
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ─── Fetch Handler ────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('/').then((cached) => {
                return cached || fetch(event.request).then((res) => {
                    if (res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
                    }
                    return res;
                });
            }).catch(() => caches.match('/'))
        );
        return;
    }

    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || 
        url.pathname.endsWith('.png') || url.pathname === '/logo.png') {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const fetched = fetch(event.request).then((res) => {
                    if (res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return res;
                }).catch(() => null);
                return cached || fetched;
            })
        );
        return;
    }

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then((res) => {
                    if (res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(event.request, { ignoreSearch: true }))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then(res => {
                if (res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return res;
            });
        })
    );
});
