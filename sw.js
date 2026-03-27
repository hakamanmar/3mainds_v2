/* sw.js - 3Minds PWA - Full Offline Support v13 (Stable) */
const SHELL_CACHE = '3minds-shell-v13';
const DATA_CACHE  = '3minds-data-v3';

// ── App Shell assets ──────────────────────────────────────────
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

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
    );
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => ![SHELL_CACHE, DATA_CACHE].includes(k)).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;
    if (['/login', '/logout'].some(p => url.pathname.includes(p))) return;

    // ── 1. Media & Files (Cache First) ────────────────────────
    const isMedia = url.hostname === 'files.catbox.moe' || 
                    url.pathname.startsWith('/uploads/') ||
                    /\.(pdf|jpg|jpeg|png|gif|webp|mp4|webm|mp3|docx|pptx|xlsx)$/i.test(url.pathname);

    if (isMedia) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cached) => {
                return cached || fetch(event.request).then((res) => {
                    if (res.status === 200) {
                        const clone = res.clone();
                        caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                    }
                    return res;
                }).catch(() => cached);
            })
        );
        return;
    }

    // ── 2. API Data (Stale-While-Revalidate) ──────────────────
    if (url.pathname.startsWith('/api/') && !url.pathname.includes('/attendance')) {
        event.respondWith(
            caches.open(DATA_CACHE).then((cache) => {
                return cache.match(event.request, { ignoreSearch: true }).then((cached) => {
                    const network = fetch(event.request).then((res) => {
                        if (res.status === 200) cache.put(event.request, res.clone());
                        return res;
                    }).catch(() => cached);
                    return cached || network;
                });
            })
        );
        return;
    }

    // ── 3. App Shell & Page Scripts (Cache First, Ignore Version) ───
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((res) => {
                if (res.status === 200) {
                    const clone = res.clone();
                    caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                }
                return res;
            }).catch(() => {
                if (event.request.mode === 'navigate') return caches.match('/', { ignoreSearch: true });
            });
        })
    );
});
