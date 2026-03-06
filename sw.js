const CACHE_NAME = '3minds-v4'; // Increment version to trigger update
const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png'
];

// Install: Cache core assets and activate immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate: Cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    return self.clients.claim();
});

// Fetch: Smart caching for offline access
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Dynamic caching for lectures (PDFs, Images, etc.) in the /uploads/ folder
    if (url.pathname.startsWith('/uploads/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;

                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        // Only cache if successful response
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // Default: Stale-While-Revalidate for shell assets
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                // Return cached version but fetch update in background
                fetch(event.request).then(newRes => {
                    if (newRes.status === 200) {
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, newRes));
                    }
                });
                return response;
            }
            return fetch(event.request);
        })
    );
});

// Push Notification Listener
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'تنبيه جديد', body: 'لديك إشعار من منصة 3Minds' };
    const options = {
        body: data.body,
        icon: '/static/img/icon-192.png',
        badge: '/static/img/icon-192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click Listener
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});
