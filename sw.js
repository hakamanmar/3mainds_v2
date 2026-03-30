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

    // STRATEGY: NETWORK-FIRST for Core App Files (JS, CSS, HTML)
    // This ensures updates are seen IMMEDIATELY without manual refresh.
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || 
        url.pathname === '/' || url.pathname === '/index.html' || 
        url.pathname.startsWith('/api/')) {
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

    // STRATEGY: CACHE-FIRST for Static Media (Images, Fonts, Icons)
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
