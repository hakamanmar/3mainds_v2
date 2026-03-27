/* sw.js - 3Minds PWA - Universal Recovery v20 */
const CACHE_NAME = '3minds-v20';

const ASSETS = [
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
    'https://unpkg.com/@phosphor-icons/web@2.0.3',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    
    // Page Scripts
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
    event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Bypass External (Catbox, etc.)
    if (url.origin !== location.origin) {
        if (url.hostname === 'unpkg.com' || url.hostname.includes('fonts')) {
            // Serve these from cache if available
            event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
        }
        return;
    }

    // 2. Ignore non-GET
    if (event.request.method !== 'GET' || url.pathname.includes('/login')) return;

    // 3. Main Fetch Strategy
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            const network = fetch(event.request).then((res) => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return res;
            }).catch(() => {
                // IF NETWORK FAILS & IT'S A LOCAL PAGE REQUEST -> ALWAYS RETURN ROOT SHELL
                if (event.request.mode === 'navigate' || (url.origin === location.origin && !url.pathname.includes('.'))) {
                    return caches.match('/', { ignoreSearch: true });
                }
                return cached;
            });

            return cached || network;
        })
    );
});
