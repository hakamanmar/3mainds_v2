/* sw.js - 3Minds PWA - Stable Offline v17 (Universal Support) */
const SHELL_CACHE = '3minds-shell-v17';
const DATA_CACHE  = '3minds-data-v6';

const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/static/css/style.css',
    '/static/css/variables.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
    
    // External
    'https://unpkg.com/@phosphor-icons/web@2.0.3',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',

    // Essential Pages
    '/pages/SectionSelectionPage.js',
    '/pages/LoginPage.js',
    '/pages/HomePage.js',
    '/pages/SubjectPage.js',
    '/pages/ViewerPage.js',
    '/pages/AdminPage.js',
    '/pages/AttendancePage.js',
    '/pages/AssignmentDetailsPage.js',
    '/pages/MyResultsPage.js',
    '/pages/ExamListPage.js',
    '/pages/ExamCreatePage.js',
    '/pages/ExamTakePage.js',
    '/pages/ExamResultsPage.js',
    '/pages/PasswordChangePage.js',
    '/pages/CommitteePage.js'
];

// ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;
    if (url.pathname.includes('/login') || url.pathname.includes('/logout')) return;

    // 1. API Data (Stale-While-Revalidate)
    if (url.pathname.startsWith('/api/') && !url.pathname.includes('/attendance')) {
        event.respondWith(
            caches.open(DATA_CACHE).then((cache) => {
                return cache.match(event.request, { ignoreSearch: true }).then((cached) => {
                    const network = fetch(event.request).then((res) => {
                        if (res && res.status === 200) cache.put(event.request, res.clone());
                        return res;
                    }).catch(() => cached);
                    return cached || network;
                });
            })
        );
        return;
    }

    // 2. Everything else (Cache First + Fallback to /)
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            return cached || fetch(event.request).then((res) => {
                // If fetching a local/CDN asset successfully, cache it
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                }
                return res;
            }).catch(() => {
                // EXCEPTION: If request is a page/navigate, always return '/'
                if (event.request.mode === 'navigate' || url.origin === location.origin) {
                    return caches.match('/', { ignoreSearch: true }) || caches.match('/index.html');
                }
            });
        })
    );
});
