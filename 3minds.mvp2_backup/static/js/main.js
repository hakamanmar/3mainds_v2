/* main.js - 3Minds Platform */
import { auth } from './api.js';
import { i18n } from './i18n.js';

// Dynamic imports for pages (they're served from /pages/ route via Flask static or directly)
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
};

class Router {
    constructor() {
        this.baseContainer = document.getElementById('main-content');
        this.navContainer = document.getElementById('nav-menu');

        this.initGlobalListeners();

        document.documentElement.lang = i18n.lang;
        document.documentElement.dir = 'rtl';

        window.addEventListener('popstate', () => this.resolve());
        this.initTheme();
        this.initNotifications();
        this.initPWA();
        this.updateNav();
    }

    initGlobalListeners() {
        // High-Security: Universal Event Delegation for the entire app body.
        // This handles ALL elements with 'data-path' or 'data-action'.
        // It's the only way to navigate securely with a strict CSP (no unsafe-inline).
        document.body.addEventListener('click', (e) => {
            const el = e.target.closest('[data-path], [data-action]');
            if (!el) return;

            if (el.dataset.path) {
                e.preventDefault();
                this.navigate(el.dataset.path);
            } else if (el.dataset.action === 'logout') {
                e.preventDefault();
                window.auth.logout();
            } else if (el.dataset.action === 'toggle-lang') {
                e.preventDefault();
                window.toggleLang();
            } else if (el.dataset.action === 'reload') {
                e.preventDefault();
                window.location.reload();
            }
        });
    }

    initNavListeners() {
        // We already have initGlobalListeners handling things globally now.
        // Keeping this empty or merging logic above.
    }

    initTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        if (theme === 'dark') document.body.classList.add('dark-theme');

        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            localStorage.setItem('theme', current);
            document.querySelector('#theme-toggle i').className = current === 'dark' ? 'ph ph-sun' : 'ph ph-moon';
        });

        // Set initial icon
        const icon = document.querySelector('#theme-toggle i');
        if (icon) icon.className = (theme === 'dark') ? 'ph ph-sun' : 'ph ph-moon';
    }

    initNotifications() {
        const btn = document.getElementById('notif-btn');
        const drawer = document.getElementById('notif-drawer');
        const badge = document.getElementById('notif-badge');

        btn?.addEventListener('click', (e) => {
            e.stopPropagation();
            drawer.style.display = drawer.style.display === 'flex' ? 'none' : 'flex';
            if (drawer.style.display === 'flex') badge.style.display = 'none';
        });

        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }

        document.addEventListener('click', () => {
            if (drawer) drawer.style.display = 'none';
        });

        drawer?.addEventListener('click', e => e.stopPropagation());

        // Simulate new notifications every minute
        setInterval(() => this.checkNewNotifications(), 60000);
        this.checkNewNotifications();
    }

    async checkNewNotifications() {
        const user = auth.getUser();
        if (!user) return;

        // This would call an actual API, for now we simulate
        const mockNotifs = [
            { id: 1, title: 'محاضرة جديدة', body: 'قام الدكتور أنمار برفع محاضرة "تطبيقات الويب"', time: 'منذ دقيقتين' },
            { id: 2, title: 'واجب منزلي', body: 'تمت إضافة واجب جديد بمادة الـ OOP', time: 'منذ ساعة' }
        ];

        const list = document.getElementById('notif-list');
        const badge = document.getElementById('notif-badge');

        if (mockNotifs.length > 0) {
            badge.style.display = 'block';
            list.innerHTML = mockNotifs.map(n => `
                <div class="notif-item unread">
                    <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">${n.title}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${n.body}</div>
                    <div style="font-size: 10px; color: var(--primary); margin-top: 5px;">${n.time}</div>
                </div>
            `).join('');
        }
    }

    initPWA() {
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            // Optionally show a custom install button somewhere
            console.log('PWA Install Prompt available');
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
        } else {
            loader = pageModules[path] || pageModules['/'];
        }

        const user = auth.getUser();
        const selectedSection = localStorage.getItem('selected_section');

        // Redirect logic
        if (!user) {
            // If not logged in and not on login/selection page, go to selection
            if (path !== '/' && path !== '/login') {
                this.navigate('/');
                return;
            }
            // If at selection and has section, maybe allow login? (selection page handles this)
        } else {
            // If logged in
            if (path === '/' || path === '/login') {
                this.navigate('/home');
                return;
            }
        }

        if (user && user.must_reset && path !== '/change-password') {
            this.navigate('/change-password');
            return;
        }

        this.showSpinner();

        try {
            const module = await loader();
            const Component = module.default;
            const content = await Component(params);
            if (typeof content === 'string') {
                this.baseContainer.innerHTML = content;
            } else {
                this.baseContainer.innerHTML = '';
                this.baseContainer.appendChild(content);
            }
            if (Component.init) Component.init(params);
            this.updateNav();
        } catch (err) {
            console.error('Router error:', err);
            this.baseContainer.innerHTML = `
                <div class="error-state">
                    <i class="ph ph-warning-circle"></i>
                    <h2>حدث خطأ في التحميل</h2>
                    <p>${err.message || 'تعذّر تحميل الصفحة'}</p>
                    <button class="btn btn-primary" style="margin-top:1rem" data-action="reload">
                        <i class="ph ph-arrow-clockwise"></i> إعادة المحاولة
                    </button>
                </div>`;
        }
    }

    showSpinner() {
        this.baseContainer.innerHTML = `
            <div style="display:grid;place-items:center;height:55vh;">
                <div class="spinner"></div>
            </div>`;
    }

    updateNav() {
        const user = auth.getUser();
        const currentLang = i18n.lang;

        const langBtn = `
            <button class="btn btn-ghost" data-action="toggle-lang">
                ${currentLang === 'ar' ? 'EN' : 'عربي'}
            </button>`;

        if (user) {
            let adminBtns = '';
            if (user.role === 'super_admin') {
                adminBtns = `
                    <button class="btn btn-ghost" data-path="/admin">
                        <i class="ph ph-shield-star"></i>
                        <span>${i18n.t('high_control')}</span>
                    </button>
                    <button class="btn btn-ghost" data-path="/committee">
                        <i class="ph ph-chart-line"></i>
                        <span>${i18n.t('high_committee')}</span>
                    </button>
                    <button class="btn btn-ghost" data-path="/attendance">
                        <i class="ph ph-qr-code"></i>
                        <span>${i18n.t('attendance_mgmt')}</span>
                    </button>`;
            } else if (user.role === 'section_admin') {
                adminBtns = `
                    <button class="btn btn-ghost" data-path="/admin">
                        <i class="ph ph-gear"></i>
                        <span>${i18n.t('section_mgmt')}</span>
                    </button>`;
            } else if (user.role === 'teacher') {
                adminBtns = `
                    <button class="btn btn-ghost" data-path="/attendance">
                        <i class="ph ph-qr-code"></i>
                        <span>${i18n.t('attendance_mgmt')}</span>
                    </button>`;
            } else if (user.role === 'committee') {
                adminBtns = `
                    <button class="btn btn-ghost" data-path="/committee">
                        <i class="ph ph-seal-warning"></i>
                        <span>${i18n.t('absence_committee')}</span>
                    </button>`;
            }

            this.navContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                    <button class="btn btn-ghost" data-action="toggle-lang">
                        ${currentLang === 'ar' ? 'EN' : 'عربي'}
                    </button>
                    <span class="user-badge">
                        <i class="ph ph-user-circle"></i>
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;">${user.email}</span>
                        <span class="role-pill role-${user.role}">${i18n.t(user.role).toUpperCase()}</span>
                    </span>
                    ${adminBtns}
                    <button class="btn btn-primary logout-btn" data-action="logout">
                        <i class="ph ph-sign-out"></i>
                        <span>${i18n.t('logout') || 'تسجيل الخروج'}</span>
                    </button>
                </div>`;
        } else {
            this.navContainer.innerHTML = langBtn;
        }

        const elToggleTheme = document.getElementById('theme-toggle');
        if (elToggleTheme) elToggleTheme.title = i18n.t('toggle_theme');

        const elNotifBtn = document.getElementById('notif-btn');
        if (elNotifBtn) elNotifBtn.title = i18n.t('notifications');

        const elNotifHeader = document.querySelector('.drawer-header h4');
        if (elNotifHeader) elNotifHeader.innerText = i18n.t('notifications');

        const elMarkAllRead = document.getElementById('mark-all-read');
        if (elMarkAllRead) elMarkAllRead.innerText = i18n.t('mark_all_read');

        const elNoNotif = document.querySelector('#notif-list .empty-msg');
        if (elNoNotif) elNoNotif.innerText = i18n.t('no_new_notifications');
    }
}

window.auth = auth;
window.toggleLang = () => {
    i18n.lang = i18n.lang === 'ar' ? 'en' : 'ar';
    window.location.reload();
};

window.router = new Router();
window.router.resolve();