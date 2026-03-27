/* sw.js - 3Minds PWA - Standard Offline v16 (Optimized for iOS) */
const SHELL_CACHE = '3minds-shell-v16';
const DATA_CACHE  = '3minds-data-v5';

// ── Critical Shell Assets ─────────────────────────────────────
const SHELL_ASSETS = [
    '/',
    '/index.html', // Added for iOS explicit matching
    '/manifest.json',
    '/static/css/style.css',
    '/static/css/variables.css',
    '/static/js/main.js',
    '/static/js/api.js',
    '/static/js/ui.js',
    '/static/js/i18n.js',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
    
    // External Resources
    'https://unpkg.com/@phosphor-icons/web@2.0.3',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',

    // All possible page imports (Pre-cached for instant offline boot)
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

// ── Install: Cache fast ───────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
    );
});

// ── Activate: Old Cache Cleanup ───────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => ![SHELL_CACHE, DATA_CACHE].includes(k)).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── Fetch: Smart Handling ─────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET / non-app requests
    if (event.request.method !== 'GET') return;
    if (url.pathname.includes('/login') || url.pathname.includes('/logout')) return;

    // ── 1. App Shell Caching (Cache-First) ────────────────────
    // Always serve from cache first for shell files (CSS, JS, Icons)
    const isShellAsset = SHELL_ASSETS.some(asset => url.pathname.endsWith(asset) || url.href === asset);
    
    // ── 2. Media / External Assets (Cache-First w/ Network Update)
    const isMedia = url.hostname === 'files.catbox.moe' || 
                    url.hostname === 'unpkg.com' ||
                    url.hostname.includes('fonts.googleapis.com') ||
                    url.hostname.includes('gstatic.com') ||
                    url.pathname.startsWith('/uploads/') ||
                    /\.(pdf|jpg|jpeg|png|gif|webp|mp4|webm|mp3|docx|pptx|xlsx)$/i.test(url.pathname);

    if (isShellAsset || isMedia) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cached) => {
                return cached || fetch(event.request).then((res) => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
                    }
                    return res;
                }).catch(() => cached);
            })
        );
        return;
    }

    // ── 3. API Data (Stale-While-Revalidate) ──────────────────
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

    // ── 4. Global Navigation Fallback (CRITICAL FOR iOS) ──────
    // If we are navigating to ANY page (/home, /subject/1) and offline, return root.
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match('/', { ignoreSearch: true }) || 
                   caches.match('/index.html', { ignoreSearch: true });
        })
    );
});
