/* LoginPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const LoginPage = async () => {
    return `
        <div class="login-wrapper" style="background: radial-gradient(circle at top right, rgba(79, 70, 229, 0.05), transparent), radial-gradient(circle at bottom left, rgba(30, 27, 75, 0.05), transparent); background-color: var(--background);">
            <div class="login-card" style="
                background: var(--surface);
                border: 1px solid var(--border);
                box-shadow: 0 20px 50px rgba(0,0,0,0.1);
                backdrop-filter: blur(10px);
            ">
                <div class="login-logo cyber-logo" style="margin-bottom: 2.5rem;">
                    <img src="/logo.png?v=2.5" alt="3Minds" style="height: 160px; width: auto; margin-bottom: 1.5rem; filter: drop-shadow(0 0 20px rgba(79, 70, 229, 0.2));">
                    <h1 class="brand-name" style="
                        font-size: 2.5rem; 
                        font-weight: 900; 
                        background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        margin-bottom: 0.5rem;
                        letter-spacing: -1px;
                    ">3Minds</h1>
                    <p class="brand-tagline" style="font-weight: 600; color: var(--text-muted); opacity: 0.8;">${i18n.t('select_section_subtitle') || 'المنصة الأكاديمية الشاملة'}</p>
                </div>

                <form id="login-form" autocomplete="off" style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.6rem; display: flex; align-items: center; gap: 8px;">
                            <i class="ph ph-envelope-simple" style="color: var(--primary);"></i>
                            ${i18n.t('email')}
                        </label>
                        <input type="email" id="email" 
                            style="
                                background: var(--surface-2); 
                                border: 1px solid var(--border); 
                                border-radius: 14px; 
                                padding: 14px 18px; 
                                font-size: 1rem;
                                transition: all 0.3s;
                            " 
                            placeholder="example@3minds.edu" required />
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.6rem; display: flex; align-items: center; gap: 8px;">
                            <i class="ph ph-lock-simple" style="color: var(--primary);"></i>
                            ${i18n.t('password')}
                        </label>
                        <div class="password-field" style="position: relative;">
                            <input type="password" id="password" 
                                style="
                                    background: var(--surface-2); 
                                    border: 1px solid var(--border); 
                                    border-radius: 14px; 
                                    padding: 14px 18px; 
                                    padding-left: 50px;
                                    font-size: 1rem;
                                    width: 100%;
                                    transition: all 0.3s;
                                " 
                                placeholder="••••••••" required />
                            <button type="button" class="toggle-pw-btn" id="toggle-pw-btn" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); opacity: 0.5;">
                                <i class="ph ph-eye" id="pw-eye-icon" style="font-size: 1.2rem;"></i>
                            </button>
                        </div>
                    </div>
                    
                    <button type="submit" class="btn btn-primary login-submit-btn" id="login-btn" style="
                        padding: 1rem; 
                        border-radius: 14px; 
                        font-size: 1.05rem; 
                        font-weight: 800; 
                        margin-top: 1rem;
                        background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%);
                        box-shadow: 0 10px 25px rgba(79, 70, 229, 0.3);
                        border: none;
                    ">
                        <i class="ph ph-fingerprint" style="font-size: 1.3rem;"></i>
                        ${i18n.t('login')}
                    </button>
                </form>

                <!-- Professional Developer Credits - Framed -->
                <div class="credits-frame" style="
                    margin-top: 2.5rem;
                    padding: 1.5rem 1rem;
                    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
                    border: 1px solid rgba(96, 165, 250, 0.2);
                    border-radius: 20px;
                    color: white;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                ">
                    <!-- Background overlay -->
                    <div style="
                        position: absolute; top:0; left:0; right:0; bottom:0;
                        background-image: url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400');
                        background-size: cover; opacity: 0.1; mix-blend-mode: overlay;
                    "></div>

                    <div style="position: relative; z-index: 2;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #cbd5e1; font-size: 0.75rem; direction: ltr; margin-bottom: 1rem; opacity: 0.9;">
                            <span style="font-weight: 800; color: #fff;">CYBERSECURITY DEPT</span>
                            <span style="width: 3px; height: 3px; background: #4f46e5; border-radius: 50%;"></span>
                            <span>Supervised by: <strong style="color: #4f46e5;">Dr. Muhaned</strong></span>
                        </div>
                        
                        <div style="display: flex; justify-content: center; gap: 1rem; flex-direction: row; direction: ltr; font-size: 0.85rem; white-space: nowrap;">
                            <span style="display: flex; align-items: center; gap: 5px; font-weight: 700; color: #fff;">
                                <i class="ph ph-circle-wavy-check" style="color: #4f46e5;"></i>
                                Alhakam Anmar
                            </span>
                            <span style="display: flex; align-items: center; gap: 5px; font-weight: 700; color: #fff;">
                                <i class="ph ph-circle-wavy-check" style="color: #4f46e5;"></i>
                                Mena Sabri
                            </span>
                            <span style="display: flex; align-items: center; gap: 5px; font-weight: 700; color: #fff;">
                                <i class="ph ph-circle-wavy-check" style="color: #4f46e5;"></i>
                                Danya Majed
                            </span>
                        </div>
                        
                        <p style="font-size: 0.6rem; color: rgba(203, 213, 225, 0.4); margin-top: 0.8rem; letter-spacing: 0.5px;">
                            3MINDS ACADEMIC © 2026
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
