/* LoginPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const LoginPage = async () => {
    return `
        <div class="login-wrapper">
            <div class="login-card glass-panel">
                <div class="login-logo cyber-logo">
                    <img src="/logo.png?v=2.5" alt="3Minds" style="height: 180px; width: auto; margin-bottom: 1rem;">
                    <h1 class="brand-name">3Minds</h1>
                    <p class="brand-tagline">${i18n.t('select_section_subtitle')}</p>
                </div>

                <form id="login-form" autocomplete="off">
                    <div class="form-group">
                        <label class="form-label">
                            <i class="ph ph-envelope"></i>
                            ${i18n.t('email')}
                        </label>
                        <input type="email" id="email" placeholder="example@3minds.edu" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">
                            <i class="ph ph-lock"></i>
                            ${i18n.t('password')}
                        </label>
                        <div class="password-field">
                            <input type="password" id="password" placeholder="••••••••" required />
                            <button type="button" class="toggle-pw-btn" id="toggle-pw-btn">
                                <i class="ph ph-eye" id="pw-eye-icon"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary login-submit-btn" id="login-btn">
                        <i class="ph ph-sign-in"></i>
                        ${i18n.t('login')}
                    </button>
                </form>

                <div class="login-footer">
                    <p>${i18n.t('developed_by')}</p>
                    <div class="dev-team">
                        <span>Danya Majed</span>
                        <span>Mena Sabri</span>
                        <span>Alhakam Anmar</span>
                    </div>
                </div>
            </div>
        </div>
    `;
};

LoginPage.init = () => {
    const toggleBtn = document.getElementById('toggle-pw-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const input = document.getElementById('password');
            const icon = document.getElementById('pw-eye-icon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'ph ph-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'ph ph-eye';
            }
        });
    }

    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('login-btn');

        btn.innerHTML = `<div class="btn-spinner"></div> ${i18n.t('processing')}`;
        btn.disabled = true;

        try {
            const res = await api.login(email, password);
            if (res.success) {
                const user = { ...res.user, must_reset: res.must_reset };
                // High-Security: Store both the user data and the signed Bearer token
                auth.setUser(user, res.token);
                if (res.must_reset) {
                    window.router.navigate('/change-password');
                } else {
                    window.router.navigate('/home');
                }
            } else {
                UI.toast(res.message || i18n.t('error'), 'error');
                btn.innerHTML = `<i class="ph ph-sign-in"></i> ${i18n.t('login')}`;
                btn.disabled = false;
            }
        } catch (err) {
            const msg = err.status === 403 ? i18n.t('device_locked') : (err.message || i18n.t('error'));
            UI.toast(msg, 'error');
            btn.innerHTML = `<i class="ph ph-sign-in"></i> ${i18n.t('login')}`;
            btn.disabled = false;
        }
    });
};

export default LoginPage;
