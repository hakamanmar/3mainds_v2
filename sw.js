/* sw.js - 3Minds PWA - Global Elite Update v30 (Ultra Smooth & Instant) */
const CACHE_NAME = '3minds-v30'; // Changing name forces total cache purge

const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/pages/SectionManagementPage.js' // Added the new page to cache
];

self.addEventListener('install', (event) => {
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Clean up old caches
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[PWA] Purging Ancient Cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Control all pages immediately
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle GET requests and local origin
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    // For JS, CSS and Index -> Network First (Try latest, fallback to cache)
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname === '/' || url.pathname === '/index.html') {
        event.respondWith(
            fetch(event.request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return res;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For other assets (Images, etc) -> Cache First
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request);
        })
    );
});
