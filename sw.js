/* sw.js - 3Minds PWA - iPhone Specialized v18 */
const SHELL_CACHE = '3minds-shell-v18';
const DATA_CACHE  = '3minds-data-v7';

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
    
    // CDNs
    'https://unpkg.com/@phosphor-icons/web@2.0.3',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',

    // All page scripts
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

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => ![SHELL_CACHE, DATA_CACHE].includes(k)).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // CRITICAL for iPhone: Do NOT intercept external navigations
    // This fixed the "forever loading" issue on iOS when opening Catbox links
    if (event.request.mode === 'navigate' && url.origin !== location.origin) {
        return; 
    }

    if (event.request.method !== 'GET') return;
    if (url.pathname.includes('/login') || url.pathname.includes('/logout')) return;

    // 1. API Data
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

    // 2. Local Assets & Media (Cache First)
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            const network = fetch(event.request).then((res) => {
                if (res && res.status === 200 && (url.origin === location.origin || url.hostname === 'unpkg.com')) {
                    const clone = res.clone();
                    caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                }
                return res;
            }).catch(() => cached);

            // Fallback for navigation requests when offline
            if (!cached && event.request.mode === 'navigate') {
                return caches.match('/', { ignoreSearch: true });
            }

            return cached || network;
        })
    );
});
