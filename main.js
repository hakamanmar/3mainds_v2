import { auth } from './api.js';
import { i18n } from './i18n.js';
import HomePage from './pages/HomePage.js';
import LoginPage from './pages/LoginPage.js';
import SubjectPage from './pages/SubjectPage.js';
import AdminPage from './pages/AdminPage.js';
import PasswordChangePage from './pages/PasswordChangePage.js';

const routes = {
    '/': HomePage,
    '/login': LoginPage,
    '/admin': AdminPage,
    '/subject/:id': SubjectPage,
    '/change-password': PasswordChangePage
};

class Router {
    constructor() {
        this.baseContainer = document.getElementById('main-content');
        this.navContainer = document.getElementById('nav-menu');

        // Initial Language Setup
        document.documentElement.lang = i18n.lang;
        document.documentElement.dir = i18n.t('dir');

        window.addEventListener('popstate', () => this.resolve());
        this.updateNav();
    }

    navigate(path) {
        window.history.pushState({}, '', path);
        this.resolve();
    }

    async resolve() {
        const path = window.location.pathname;
        let Component = routes[path];
        let params = {};

        if (!Component) {
            if (path.startsWith('/subject/')) {
                Component = SubjectPage;
                params.id = path.split('/')[2];
            } else {
                Component = HomePage;
            }
        }

        const user = auth.getUser();
        if (!user && Component !== LoginPage) {
            this.navigate('/login');
            return;
        }

        this.baseContainer.innerHTML = '<div style="display:grid; place-items:center; height:50vh;"><div class="spinner"></div></div>';
        try {
            const content = await Component(params);
            this.baseContainer.innerHTML = content;
            if (Component.init) Component.init(params);
            this.updateNav();
        } catch (err) {
            console.error(err);
            this.baseContainer.innerHTML = `<p class="error">${i18n.t('error')}</p>`;
        }
    }

    updateNav() {
        const user = auth.getUser();
        const currentLang = i18n.lang;

        const langToggle = `
            <button class="btn" style="padding: 0.5rem; border: 1px solid var(--border);" onclick="window.toggleLang()">
                ${currentLang === 'ar' ? 'English' : 'العربية'}
            </button>
        `;

        document.querySelector('.logo').innerHTML = `<i class="ph ph-graduation-cap"></i> ${i18n.t('logo')}`;

        if (user) {
            this.navContainer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    ${langToggle}
                    <span class="user-email-badge">
                        ${user.email} <span class="badge" style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 20px; font-size: 0.75rem;">${user.role}</span>
                    </span>
                    ${user.role === 'admin' ? `
                        <button class="btn" style="padding: 0.5rem 1rem; border: 1px solid var(--border);" onclick="window.router.navigate('/admin')">
                            ${i18n.t('admin_panel')}
                        </button>
                    ` : ''}
                    <button class="btn btn-primary" style="padding: 0.5rem 1rem;" onclick="window.auth.logout()">
                        <i class="ph ph-sign-out"></i>
                    </button>
                </div>
            `;
        } else {
            this.navContainer.innerHTML = langToggle;
        }
    }
}

window.auth = auth;
window.toggleLang = () => {
    i18n.lang = i18n.lang === 'ar' ? 'en' : 'ar';
    window.location.reload();
};

window.router = new Router();
window.router.resolve();
