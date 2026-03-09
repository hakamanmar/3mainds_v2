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

                <!-- Professional Developer Credits -->
                <div class="login-footer" style="
                    margin-top: 3rem;
                    padding-top: 2rem;
                    border-top: 1px solid var(--border);
                    text-align: center;
                ">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--text-muted); font-size: 0.8rem; direction: ltr; opacity: 0.8;">
                            <span style="font-weight: 700;">Department of Cybersecurity</span>
                            <span style="width: 4px; height: 4px; background: var(--border); border-radius: 50%;"></span>
                            <span>Supervised by: <strong>Dr. Muhaned Qasim</strong></span>
                        </div>
                        
                        <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; direction: ltr;">
                            <span style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--primary);">
                                <i class="ph ph-circle-wavy-check" style="font-size: 1rem;"></i>
                                Alhakam Anmar
                            </span>
                            <span style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--primary);">
                                <i class="ph ph-circle-wavy-check" style="font-size: 1rem;"></i>
                                Mena Sabri
                            </span>
                            <span style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--primary);">
                                <i class="ph ph-circle-wavy-check" style="font-size: 1rem;"></i>
                                Danya Majed
                            </span>
                        </div>
                        
                        <p style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.6; margin-top: 0.5rem; letter-spacing: 0.5px;">
                            3MINDS ACADEMIC © 2026 — AL-NAHRAIN UNIVERSITY
                        </p>
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
