/* main.js - 3Minds Platform - Enhanced Mobile Reliability */
import { auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';

const pageModules = {
    '/': () => import('/pages/SectionSelectionPage.js'),
    '/home': () => import('/pages/HomePage.js'),
    '/login': () => import('/pages/LoginPage.js'),
    '/admin': () => import('/pages/AdminPage.js'),
    '/attendance': () => import('/pages/AttendancePage.js'),
    '/committee': () => import('/pages/CommitteePage.js'),
    '/change-password': () => import('/pages/PasswordChangePage.js'),
    '/viewer': () => import('/pages/ViewerPage.js'),
    '/assignment/submissions': () => import('/pages/AssignmentDetailsPage.js'),
    '/results': () => import('/pages/MyResultsPage.js'),
    '/exams': () => import('/pages/ExamListPage.js'),
    '/exams/create': () => import('/pages/ExamCreatePage.js'),
};

class Router {
    constructor() {
        this.baseContainer = document.getElementById('main-content');
        this.navContainer = document.getElementById('nav-menu');

        this.initGlobalListeners();

        document.documentElement.lang = i18n.lang;

        window.addEventListener('popstate', () => this.resolve());
        // Global error capture to reveal white-screen causes
        window.onerror = (msg, url, line, col, error) => {
            if (this.baseContainer) {
                this.baseContainer.innerHTML = `<div style="padding:2rem; color:red; background:#fff1f2; border:1px solid #fda4af; border-radius:12px; margin:2rem;">
                    <h3>Runtime Error</h3>
                    <p>${msg}</p>
                    <small>${url} L:${line}:${col}</small>
                </div>`;
            }
            return false;
        };
        this.initTheme();
        this.initNotifications();
        this.initPWA();
        this.updateNav();
        this.resolve();
    }

    initGlobalListeners() {
        document.body.addEventListener('click', (e) => {
            const el = e.target.closest('[data-path], [data-action]');
            if (!el) return;

            if (el.dataset.path) {
                e.preventDefault();
                this.navigate(el.dataset.path);
            } else if (el.dataset.action === 'logout') {
                e.preventDefault();
                auth.logout();
            } else if (el.dataset.action === 'toggle-lang') {
                e.preventDefault();
                window.toggleLang();
            } else if (el.dataset.action === 'reload') {
                e.preventDefault();
                window.location.reload();
            }
        });
    }

    initTheme() {
        const body = document.body;
        let theme = 'light';
        try { theme = localStorage.getItem('theme') || 'light'; } catch (e) { }
        const updateIcons = () => {
            const isDark = body.classList.contains('dark-theme');
            const toggleIcon = document.querySelector('#theme-toggle i');
            if (toggleIcon) toggleIcon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
        };

        if (theme === 'dark') body.classList.add('dark-theme');
        else body.classList.remove('dark-theme');
        updateIcons();

        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                body.classList.toggle('dark-theme');
                try { localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light'); } catch (e) { }
                updateIcons();
            });
        }

        // Mobile Menu Logic
        const menuBtn = document.getElementById('mobile-menu-toggle');
        const navMenu = document.getElementById('nav-menu');

        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (navMenu) navMenu.classList.toggle('active');
                const icon = menuBtn.querySelector('i');
                if (icon) icon.className = (navMenu && navMenu.classList.contains('active')) ? 'ph ph-x' : 'ph ph-list';
            });
        }

        document.addEventListener('click', (e) => {
            if (navMenu && navMenu.classList.contains('active')) {
                const isInside = navMenu.contains(e.target) || (menuBtn && menuBtn.contains(e.target));
                if (!isInside) {
                    navMenu.classList.remove('active');
                    const icon = menuBtn ? menuBtn.querySelector('i') : null;
                    if (icon) icon.className = 'ph ph-list';
                }
            }
        });
    }

    initNotifications() {
        const btn = document.getElementById('notif-btn');
        const drawer = document.getElementById('notif-drawer');
        const badge = document.getElementById('notif-badge');

        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (drawer) drawer.style.display = drawer.style.display === 'flex' ? 'none' : 'flex';
                if (drawer && drawer.style.display === 'flex') {
                    if (badge) badge.style.display = 'none';
                    // Mark as read
                    try { localStorage.setItem('notif_last_read', Date.now()); } catch(e){}
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (drawer && !drawer.contains(e.target) && e.target !== btn) {
                drawer.style.display = 'none';
            }
        });
        if (drawer) drawer.addEventListener('click', e => e.stopPropagation());

        // Mark all read button
        const markAllBtn = document.getElementById('mark-all-read');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                try { localStorage.setItem('notif_last_read', Date.now()); } catch(e){}
                if (badge) badge.style.display = 'none';
                const list = document.getElementById('notif-list');
                if (list) {
                    list.querySelectorAll('.notif-item.unread').forEach(i => i.classList.remove('unread'));
                }
            });
        }

        // Start polling for new notifications every 30 seconds
        this.checkNewNotifications();
        setInterval(() => this.checkNewNotifications(), 30000);
    }

    async checkNewNotifications() {
        const user = auth.getUser();
        if (!user) return;

        try {
            let lastRead = 0;
            try { lastRead = parseInt(localStorage.getItem('notif_last_read') || '0'); } catch(e){}
            
            // Get section from user or localStorage
            let sectionId = user.section_id;
            try { if (!sectionId) sectionId = localStorage.getItem('selected_section'); } catch(e){}
            if (!sectionId) return;

            // Fetch recent announcements
            const res = await fetch(`/api/announcements?section_id=${sectionId}&t=${Date.now()}`, {
                credentials: 'include',
                headers: { 'X-Device-ID': localStorage.getItem('device_id') || '' }
            });
            if (!res.ok) return;
            const data = await res.json();
            const announcements = Array.isArray(data) ? data : (data.announcements || []);

            // Find new items since last read
            const newItems = announcements.filter(a => {
                const t = new Date(a.created_at).getTime();
                return t > lastRead;
            });

            if (newItems.length === 0) return;

            // Show badge
            const badge = document.getElementById('notif-badge');
            if (badge) badge.style.display = 'flex';

            // Update drawer list
            const list = document.getElementById('notif-list');
            if (list) {
                const html = newItems.map(a => `
                    <div class="notif-item unread" style="padding:0.85rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;border-right:3px solid #4f46e5;">
                        <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);margin-bottom:3px;">
                            <i class="ph ph-megaphone" style="color:#4f46e5;"></i> ${a.title || 'إعلان جديد'}
                        </div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${(a.content || '').substring(0,80)}${(a.content||'').length>80?'...':''}</div>
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${new Date(a.created_at).toLocaleString('ar-EG')}</div>
                    </div>
                `).join('');
                list.innerHTML = html || '<p class="empty-msg">لا توجد إشعارات جديدة</p>';
            }

            // Browser push notification for the newest item
            if (newItems.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
                const newest = newItems[0];
                const reg = await navigator.serviceWorker.ready;
                reg.showNotification(`🔔 ${newest.title || 'إعلان جديد'} - 3Minds`, {
                    body: (newest.content || '').substring(0, 100),
                    icon: '/static/img/icon-192.png',
                    badge: '/static/img/icon-192.png',
                    vibrate: [200, 100, 200],
                    dir: 'rtl',
                    lang: 'ar',
                    tag: `notif-${newest.id || Date.now()}`,
                    renotify: false,
                    data: { url: '/home' },
                    actions: [
                        { action: 'open', title: 'فتح المنصة' },
                        { action: 'dismiss', title: 'إغلاق' }
                    ]
                });
            }
        } catch(e) {
            // Silently fail - notifications are non-critical
        }
    }

    initPWA() {
        // 1. Request push notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            // Ask after a short delay to avoid immediately prompting on page load
            setTimeout(() => {
                Notification.requestPermission().then(permission => {
                    console.log('[PWA] Notification permission:', permission);
                });
            }, 5000);
        }

        // 2. Install prompt ("Add to Home Screen")
        let deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;

            // Show a subtle install banner after 10 seconds
            setTimeout(() => {
                if (!deferredPrompt) return;
                const user = auth.getUser();
                if (!user) return; // Only show when logged in

                // Create install banner
                const banner = document.createElement('div');
                banner.id = 'pwa-install-banner';
                banner.innerHTML = `
                    <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;
                        background:linear-gradient(135deg,#4f46e5,#7c3aed);
                        color:#fff;padding:0.85rem 1.5rem;border-radius:16px;
                        display:flex;align-items:center;gap:0.75rem;
                        box-shadow:0 8px 32px rgba(79,70,229,0.4);
                        animation:slideUp 0.4s ease;max-width:340px;width:90%;">
                        <img src="/static/img/icon-192.png" style="width:36px;height:36px;border-radius:8px;">
                        <div style="flex:1;">
                            <div style="font-weight:700;font-size:0.9rem;">ثبّت منصة 3Minds</div>
                            <div style="font-size:0.75rem;opacity:0.85;">استخدمها كتطبيق على جهازك</div>
                        </div>
                        <button id="pwa-install-btn" style="background:rgba(255,255,255,0.2);border:none;color:#fff;
                            padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85rem;">ثبّت</button>
                        <button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:1.2rem;">✕</button>
                    </div>
                `;
                document.body.appendChild(banner);

                document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
                    if (deferredPrompt) {
                        deferredPrompt.prompt();
                        await deferredPrompt.userChoice;
                        deferredPrompt = null;
                    }
                    banner.remove();
                });
                document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => banner.remove());
            }, 10000);
        });

        // 3. Handle app installed event
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed!');
            deferredPrompt = null;
        });
    }

    navigate(path) {
        window.history.pushState({}, '', path);
        this.resolve();
    }

    async resolve() {
        const path = window.location.pathname;
        const search = window.location.search;
        let params = {};
        let loader;

        if (path === '/viewer') {
            const urlParams = new URLSearchParams(search);
            params.url = urlParams.get('url');
            params.name = urlParams.get('name');
            loader = pageModules['/viewer'];
        } else if (path.startsWith('/assignment/') && path.endsWith('/submissions')) {
            params.id = path.split('/')[2];
            loader = pageModules['/assignment/submissions'];
        } else if (path.startsWith('/subject/')) {
            params.id = path.split('/')[2];
            loader = () => import('/pages/SubjectPage.js');
        } else if (path.startsWith('/exam/') && path.endsWith('/take')) {
            params.id = path.split('/')[2];
            loader = () => import('/pages/ExamTakePage.js');
        } else if (path.startsWith('/exam/') && path.endsWith('/results')) {
            params.id = path.split('/')[2];
            params.mode = 'results';
            loader = () => import('/pages/ExamResultsPage.js');
        } else if (path.startsWith('/exam/') && path.endsWith('/result')) {
            params.id = path.split('/')[2];
            params.mode = 'result';
            loader = () => import('/pages/ExamResultsPage.js');
        } else {
            loader = pageModules[path] || pageModules['/'];
        }

        const user = auth.getUser();
        if (!user && path !== '/' && path !== '/login') {
            this.navigate('/');
            return;
        } else if (user && (path === '/' || path === '/login')) {
            this.navigate('/home');
            return;
        }

        this.showSpinner();
        try {
            const module = await loader();
            const content = await module.default(params);
            if (content == null) {
                // page returned undefined - likely redirected, do nothing
                return;
            }
            if (typeof content === 'string') this.baseContainer.innerHTML = content;
            else if (content instanceof Node) { this.baseContainer.innerHTML = ''; this.baseContainer.appendChild(content); }
            else { this.baseContainer.innerHTML = String(content); }
            if (module.default.init) module.default.init(params);
            this.updateNav();
        } catch (err) {
            console.error('Router error:', err);
            this.baseContainer.innerHTML = `<div class="error-state"><h2>خطأ في التحميل</h2><p>${err.message}</p></div>`;
        }
    }

    showSpinner() {
        this.baseContainer.innerHTML = `<div style="display:grid;place-items:center;height:55vh;"><div class="spinner"></div></div>`;
    }

    updateNav() {
        const user = auth.getUser();
        const currentLang = i18n.lang;

        let navHtml = `
            <div class="nav-content-wrapper">
                <div class="nav-header-mobile">
                    <span>3Minds Menu</span>
                    <i class="ph ph-circles-four"></i>
                </div>
                <button class="btn btn-ghost" data-action="toggle-lang">
                    <i class="ph ph-translate"></i>
                    <span>${currentLang === 'ar' ? 'English Language' : 'اللغة العربية'}</span>
                </button>
        `;

        if (user) {
            let links = '';

            // === COMMITTEE: Only access committee panel, NO home, NO subjects ===
            if (user.role === 'committee') {
                links = `
                    <button class="btn btn-ghost" data-path="/committee">
                        <i class="ph ph-seal-warning"></i>
                        <span>${i18n.t('absence_committee')}</span>
                    </button>`;

            // === SUPER ADMIN: Full access ===
            } else if (user.role === 'super_admin') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/admin"><i class="ph ph-shield-star"></i><span>${i18n.t('high_control')}</span></button>
                    <button class="btn btn-ghost" data-path="/committee"><i class="ph ph-chart-line"></i><span>${i18n.t('high_committee')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>
                    <button class="btn btn-ghost" data-path="/exams"><i class="ph ph-exam"></i><span>الاختبارات</span></button>`;

            // === HEAD OF DEPT: Monitor everything, broadcast notifications ===
            } else if (user.role === 'head_dept') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/admin"><i class="ph ph-eye"></i><span>مراقبة الأقسام</span></button>
                    <button class="btn btn-ghost" data-path="/committee"><i class="ph ph-chart-line"></i><span>${i18n.t('high_committee')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>
                    <button class="btn btn-ghost" data-path="/exams"><i class="ph ph-exam"></i><span>الاختبارات</span></button>`;

            // === TEACHER: Only their subjects + attendance ===
            } else if (user.role === 'teacher') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>
                    <button class="btn btn-ghost" data-path="/exams"><i class="ph ph-exam"></i><span>الاختبارات</span></button>`;

            // === SECTION ADMIN: Manage their section ===
            } else if (user.role === 'section_admin') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/admin"><i class="ph ph-gear"></i><span>${i18n.t('section_mgmt')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>
                    <button class="btn btn-ghost" data-path="/exams"><i class="ph ph-exam"></i><span>الاختبارات</span></button>`;

            // === STUDENT: View-only ===
            } else if (user.role === 'student') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/results"><i class="ph ph-medal"></i><span>نتائجي</span></button>
                    <button class="btn btn-ghost" data-path="/exams"><i class="ph ph-exam"></i><span>الاختبارات</span></button>`;
            }

            navHtml += `
                <div class="user-badge-mobile">
                    <i class="ph ph-user-circle-fill"></i>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:700; font-size:13px;">${user.email}</span>
                        <span class="role-pill role-${user.role}" style="font-size:9px; width:fit-content;">${i18n.t(user.role) ? i18n.t(user.role).toUpperCase() : user.role.toUpperCase()}</span>
                    </div>
                </div>
                <div class="nav-links-container">
                    ${links}
                </div>
                <button class="btn btn-primary logout-btn" data-action="logout" style="margin-top:auto;">
                    <i class="ph ph-sign-out"></i>
                    <span>${i18n.t('logout')}</span>
                </button>
            `;
        } else {
            navHtml += `
                <div class="nav-links-container">
                    <button class="btn btn-primary" data-path="/login">
                        <i class="ph ph-sign-in"></i>
                        <span>${i18n.t('login')}</span>
                    </button>
                </div>`;
        }

        navHtml += `</div>`;
        if (this.navContainer) {
            this.navContainer.innerHTML = navHtml;
        }
    }
}

window.router = new Router();
window.toggleLang = () => {
    i18n.lang = i18n.lang === 'ar' ? 'en' : 'ar';
    window.location.reload();
};
