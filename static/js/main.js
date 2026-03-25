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
};

class Router {
    constructor() {
        this.baseContainer = document.getElementById('main-content');
        this.navContainer = document.getElementById('nav-menu');

        this.initGlobalListeners();

        document.documentElement.lang = i18n.lang;

        window.addEventListener('popstate', () => this.resolve());
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
                if (drawer && drawer.style.display === 'flex' && badge) badge.style.display = 'none';
            });
        }

        document.addEventListener('click', () => {
            if (drawer) drawer.style.display = 'none';
        });
        if (drawer) {
            drawer.addEventListener('click', e => e.stopPropagation());
        }
    }

    async checkNewNotifications() {
        const user = auth.getUser();
        if (!user) return;
        // Mocking logic removed for briefness, assuming it works if needed.
    }

    initPWA() {
        window.addEventListener('beforeinstallprompt', (e) => e.preventDefault());
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
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>`;

            // === HEAD OF DEPT: Monitor everything, broadcast notifications ===
            } else if (user.role === 'head_dept') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/admin"><i class="ph ph-eye"></i><span>مراقبة الأقسام</span></button>
                    <button class="btn btn-ghost" data-path="/committee"><i class="ph ph-chart-line"></i><span>${i18n.t('high_committee')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>`;

            // === TEACHER: Only their subjects + attendance ===
            } else if (user.role === 'teacher') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>`;

            // === SECTION ADMIN: Manage their section ===
            } else if (user.role === 'section_admin') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/admin"><i class="ph ph-gear"></i><span>${i18n.t('section_mgmt')}</span></button>
                    <button class="btn btn-ghost" data-path="/attendance"><i class="ph ph-qr-code"></i><span>${i18n.t('attendance_mgmt')}</span></button>`;

            // === STUDENT: View-only ===
            } else if (user.role === 'student') {
                links = `
                    <button class="btn btn-ghost" data-path="/home"><i class="ph ph-house"></i><span>${i18n.t('home')}</span></button>
                    <button class="btn btn-ghost" data-path="/results"><i class="ph ph-medal"></i><span>نتائجي</span></button>`;
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
window.router.resolve();
window.toggleLang = () => {
    i18n.lang = i18n.lang === 'ar' ? 'en' : 'ar';
    window.location.reload();
};
