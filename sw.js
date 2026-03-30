const CACHE_NAME = '3minds-v37'; // Global Purge v37
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

    // Aggressive Strategy: Network First, then Cache
    event.respondWith(
        fetch(event.request)
            .then((res) => {
                if (res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        // Store it! We use ignoreSearch later to match
                        cache.put(event.request, clone);
                    });
                }
                return res;
            })
            .catch(() => {
                // If offline, look in cache. We try a direct match first, then ignoreSearch
                return caches.match(event.request).then(matched => {
                    return matched || caches.match(event.request, { ignoreSearch: true });
                });
            })
    );
});
