/* sw.js - 3Minds PWA - Full Offline Support v12 */
const SHELL_CACHE = '3minds-shell-v12';
const DATA_CACHE  = '3minds-data-v3';

// ── App Shell: Everything needed to boot the app from zero internet ──────────
const SHELL_ASSETS = [
    '/',
    '/manifest.json',
    '/static/css/style.css',
    '/static/css/variables.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',

    // All page modules
    '/pages/SectionSelectionPage.js',
    '/pages/LoginPage.js',
    '/pages/HomePage.js',
    '/pages/SubjectPage.js',
    '/pages/ViewerPage.js',
    '/pages/AdminPage.js',
    '/pages/AttendancePage.js',
    '/pages/CommitteePage.js',
    '/pages/AssignmentDetailsPage.js',
    '/pages/MyResultsPage.js',
    '/pages/ExamListPage.js',
    '/pages/ExamCreatePage.js',
    '/pages/ExamTakePage.js',
    '/pages/ExamResultsPage.js',
    '/pages/PasswordChangePage.js',
];

// ── Install: Cache full app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            cache.addAll(SHELL_ASSETS).catch((err) => {
                console.warn('[SW] Some assets failed to cache:', err);
            })
        )
    );
});

// ── Activate: Remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter(k => k !== SHELL_CACHE && k !== DATA_CACHE)
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET and login/logout routes
    if (event.request.method !== 'GET') return;
    if (url.pathname === '/login' || url.pathname === '/logout') return;

    // ── 1. Files (PDFs, images, videos, Catbox) ─── Cache First ──────────────
    const isMediaFile =
        /\.(pdf|jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav|ogg|docx|pptx|xlsx)$/i.test(url.pathname) ||
        url.hostname === 'files.catbox.moe';

    if (isMediaFile || url.pathname.startsWith('/uploads/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;

                return fetch(event.request)
                    .then((response) => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => cached); // Return cached version if network fails
            })
        );
        return;
    }

    // ── 2. API Calls ─── Stale-While-Revalidate (show data immediately) ───────
    // Skip attendance & login APIs (must be real-time)
    const skipApi = url.pathname.includes('/attendance') ||
                    url.pathname.includes('/session') ||
                    url.pathname.includes('/qr');

    if (url.pathname.startsWith('/api/') && !skipApi) {
        event.respondWith(
            caches.open(DATA_CACHE).then((cache) =>
                cache.match(event.request).then((cached) => {
                    const networkFetch = fetch(event.request)
                        .then((response) => {
                            if (response && response.status === 200) {
                                cache.put(event.request, response.clone());
                            }
                            return response;
                        })
                        .catch(() => cached); // Offline: return stale cache

                    return cached || networkFetch; // Return cache immediately if available
                })
            )
        );
        return;
    }

    // ── 3. App Shell & Pages ─── Cache First, fallback to network ─────────────
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Last resort: return root page for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                });
        })
    );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    let data = { title: 'منصة 3Minds', body: 'لديك إشعار جديد', url: '/' };
    try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) {}

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/static/img/icon-192.png',
            badge: '/static/img/icon-192.png',
            vibrate: [200, 100, 200],
            dir: 'rtl',
            lang: 'ar',
            tag: 'notif-' + Date.now(),
            data: { url: data.url }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    const target = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if ('focus' in client) { client.focus(); client.navigate(target); return; }
            }
            clients.openWindow(target);
        })
    );
});
