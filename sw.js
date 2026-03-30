const CACHE_NAME = '3minds-v40'; // Global Purge v40 (BREAK CACHE TRAP)
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

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    // STRATEGY: STALE-WHILE-REVALIDATE for Static Assets (Images, UI, Files)
    // This makes it feel INSTANT like Telegram because it loads from cache first
    if (!url.pathname.startsWith('/api/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                    }
                    return networkResponse;
                }).catch(() => null); // Fail silently if offline

                return cachedResponse || fetchedResponse;
            })
        );
        return;
    }

    // STRATEGY: NETWORK-FIRST for API Data
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
});
