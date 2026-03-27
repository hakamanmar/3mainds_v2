/* sw.js - 3Minds PWA - Professional Offline Mechanism (v11) */
const CACHE_NAME = '3minds-offline-v11';
const DATA_CACHE_NAME = '3minds-data-v2';

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
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(err => console.error('Cache addAll error', err)))
    );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    return self.clients.claim();
});

// ── Fetch: The Heart of Offline Support ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Skip auth and sensitive actions
    if (url.pathname.includes('/login') || url.pathname.includes('/logout') || event.request.method !== 'GET') {
        return;
    }

    // 2. Handle File Caching (Catbox, local uploads, docs)
    // Caching shared files, PDFs, images, etc. to make them work offline after first open
    const isFile = url.pathname.match(/\.(pdf|jpg|jpeg|png|gif|webp|mp4|mp3|wav|docx|pptx)$/i) || 
                   url.hostname === 'files.catbox.moe' ||
                   url.pathname.startsWith('/uploads/');

    if (isFile) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200) return response;
                    
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return response;
                }).catch(() => caches.match(event.request));
            })
        );
        return;
    }

    // 3. Handle API Data (Subjects, Lessons, etc.)
    // Strategy: Stale-While-Revalidate (Show cached while fetching fresh)
    if (url.pathname.startsWith('/api/') && !url.pathname.includes('/attendance')) {
        event.respondWith(
            caches.open(DATA_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => cachedResponse); // Fallback to cache on network fail

                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // 4. Default Strategy: Network First for App Shell
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// ── Push Notification Listener ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
    let data = { title: 'منصة 3Minds', body: 'لديك إشعار جديد' };
    try { if (event.data) data = event.data.json(); } catch (e) {}
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/static/img/icon-192.png',
            badge: '/static/img/icon-192.png',
            dir: 'rtl',
            lang: 'ar',
            data: { url: data.url || '/' }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
