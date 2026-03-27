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

            // Track which notification IDs we already sent as browser push
            let sentIds = [];
            try { sentIds = JSON.parse(localStorage.getItem('notif_sent_ids') || '[]'); } catch(e){}

            // Get section from user or localStorage
            let sectionId = user.section_id;
            try { if (!sectionId) sectionId = localStorage.getItem('selected_section'); } catch(e){}
            if (!sectionId) return;

            // Fetch announcements
            const res = await fetch(`/api/announcements?section_id=${sectionId}&t=${Date.now()}`, {
                credentials: 'include'
            });
            if (!res.ok) return;
            const data = await res.json();
            const announcements = Array.isArray(data) ? data : (data.announcements || []);

            // New items = newer than lastRead timestamp
            const newItems = announcements.filter(a => {
                const t = new Date(a.created_at).getTime();
                return t > lastRead;
            });

            if (newItems.length === 0) return;

            // Show in-app badge
            const badge = document.getElementById('notif-badge');
            if (badge) badge.style.display = 'flex';

            // Update drawer list (always refresh with latest)
            const list = document.getElementById('notif-list');
            if (list) {
                list.innerHTML = newItems.map(a => `
                    <div class="notif-item unread" style="padding:0.85rem 1rem;border-bottom:1px solid var(--border);position:relative;border-right:3px solid #4f46e5;">
                        <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);margin-bottom:3px;padding-left:1.5rem;">
                            <i class="ph ph-megaphone" style="color:#4f46e5;"></i> ${a.title || 'إعلان جديد'}
                        </div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${(a.content || '').substring(0,100)}${(a.content||'').length>100?'...':''}</div>
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${new Date(a.created_at).toLocaleString('ar-EG')}</div>
                        <button onclick="this.closest('.notif-item').remove(); if(!document.querySelector('.notif-item')) document.getElementById('notif-badge').style.display='none';"
                            style="position:absolute;top:8px;left:8px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:2px 6px;border-radius:4px;">✕</button>
                    </div>
                `).join('');
            }

            // ── Browser push notification ──────────────────────────────────────
            // Only notify for items we haven't already sent a browser notification for
            if ('Notification' in window && Notification.permission === 'granted') {
                const unsent = newItems.filter(a => a.id && !sentIds.includes(String(a.id)));

                for (const item of unsent) {
                    const reg = await navigator.serviceWorker.ready;
                    await reg.showNotification(`🔔 ${item.title || 'إعلان جديد'} — 3Minds`, {
                        body: (item.content || '').substring(0, 120),
                        icon: '/static/img/icon-192.png',
                        badge: '/static/img/icon-192.png',
                        vibrate: [200, 100, 200],
                        dir: 'rtl',
                        lang: 'ar',
                        tag: `notif-${item.id}`,   // same tag = replaces duplicate
                        renotify: false,            // do NOT re-vibrate if same tag
                        data: { url: '/home' },
                        actions: [
                            { action: 'open', title: 'فتح المنصة' },
                            { action: 'dismiss', title: 'تجاهل' }
                        ]
                    });
                    // Record this ID as sent so we never send it again
                    sentIds.push(String(item.id));
                }

                // Keep only last 100 sent IDs to avoid localStorage bloat
                if (sentIds.length > 100) sentIds = sentIds.slice(-100);
                try { localStorage.setItem('notif_sent_ids', JSON.stringify(sentIds)); } catch(e){}
            }
        } catch(e) {
            // Silently fail - notifications are non-critical
        }
    }

    initPWA() {
        // 0. Offline/Online Banner Logic
        const banner = document.getElementById('offline-banner');
        const updateOnlineStatus = () => {
            if (navigator.onLine) {
                if (banner) banner.style.display = 'none';
            } else {
                if (banner) banner.style.display = 'flex';
            }
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus(); // Check initial state

        // 1. Request notification permission (after 5s)
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission();
            }, 5000);
        }

        // 2. Install prompt logic 
        let deferredPrompt = null;
        const triggerBtn = document.getElementById('pwa-install-trigger');

        if (triggerBtn) {
            triggerBtn.style.display = 'flex';
            triggerBtn.addEventListener('click', () => triggerInstall());
        }

        const triggerInstall = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                if (outcome === 'accepted' && triggerBtn) triggerBtn.style.display = 'none';
            } else {
                // Show custom elegant guide modal
                this.showInstallGuide();
            }
        };

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (triggerBtn) triggerBtn.style.color = '#10b981'; // Ready color
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            if (triggerBtn) triggerBtn.style.display = 'none';
            UI.toast('تم تثبيت تطبيق 3Minds!', 'success');
        });

        // Trigger Guide on iOS manually
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const isInStandaloneMode = ('standalone' in navigator) && navigator.standalone;
        if (isIOS && !isInStandaloneMode && triggerBtn) triggerBtn.style.display = 'flex';
    }

    showInstallGuide() {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const modal = document.createElement('div');
        modal.id = 'pwa-guide-modal';
        modal.style = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1.5rem;backdrop-filter:blur(4px);";
        
        let instructions = '';
        if (isIOS) {
            instructions = `
                <div style="text-align:right;color:var(--text-main);">
                    <p style="margin-bottom:1rem;">1. اضغط على أيقونة <strong>المشاركة</strong> <i class="ph-bold ph-export"></i> في شريط Safari.</p>
                    <p>2. اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong> من القائمة.</p>
                </div>`;
        } else {
            instructions = `
                <div style="text-align:right;color:var(--text-main);">
                    <p style="margin-bottom:1rem;">1. اضغط على <strong>النقاط الثلاث (⋮)</strong> في المتصفح.</p>
                    <p style="margin-bottom:1rem;">2. ابحث عن خيار <strong>"تثبيت التطبيق"</strong> أو <strong>"Install App"</strong>.</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);">* إذا كنت تستخدم الكمبيوتر، فستجد أيقونة تثبيت صغيرة في شريط العنوان بالأعلى.</p>
                </div>`;
        }

        modal.innerHTML = `
            <div class="card" style="max-width:400px;width:100%;padding:2rem;position:relative;animation:popIn 0.3s cubic-bezier(0.18,0.89,0.32,1.28);">
                <button onclick="this.closest('#pwa-guide-modal').remove()" style="position:absolute;top:15px;left:15px;background:none;border:none;font-size:1.5rem;color:var(--text-muted);cursor:pointer;">✕</button>
                <div style="text-align:center;margin-bottom:1.5rem;">
                    <img src="/static/img/icon-192.png" style="width:72px;height:72px;border-radius:18px;box-shadow:0 8px 16px rgba(0,0,0,0.2);">
                    <h2 style="margin:1rem 0 0.5rem;font-size:1.4rem;">تثبيت تطبيق 3Minds</h2>
                </div>
                ${instructions}
                <button onclick="this.closest('#pwa-guide-modal').remove()" class="btn btn-primary" style="width:100%;margin-top:1.5rem;padding:0.9rem;">فهمت!</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showIOSInstallGuide() {
        const overlay = document.createElement('div');
        overlay.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:1rem;">
                <div style="background:var(--surface);border-radius:20px 20px 16px 16px;padding:1.5rem;max-width:380px;width:100%;text-align:center;direction:rtl;animation:slideUp 0.3s ease;">
                    <img src="/static/img/icon-192.png" style="width:60px;height:60px;border-radius:14px;margin-bottom:1rem;">
                    <h3 style="margin:0 0 0.5rem;color:var(--text-main);">تثبيت تطبيق 3Minds</h3>
                    <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.25rem;">اتبع الخطوات التالية لتثبيت التطبيق على شاشتك الرئيسية:</p>
                    <div style="background:var(--surface-2);border-radius:12px;padding:1rem;text-align:right;margin-bottom:1rem;">
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;color:var(--text-main);">
                            <span style="background:#4f46e5;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;">1</span>
                            اضغط على زر <strong>المشاركة</strong> <i class="ph ph-export" style="color:#4f46e5;"></i> في شريط Safari
                        </div>
                        <div style="display:flex;align-items:center;gap:0.75rem;color:var(--text-main);">
                            <span style="background:#4f46e5;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;">2</span>
                            اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong>
                        </div>
                    </div>
                    <button onclick="this.closest('[style]').remove()" style="width:100%;background:#4f46e5;color:#fff;border:none;padding:0.85rem;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;">فهمت!</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
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
