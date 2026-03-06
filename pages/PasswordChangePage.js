import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const PasswordChangePage = async () => {
    return `
        <div style="display: flex; justify-content: center; align-items: center; height: 80vh;">
            <div class="glass-panel" style="padding: 3rem; width: 100%; max-width: 400px;">
                <h1 class="text-center">${i18n.t('change_pw_title')}</h1>
                <p class="text-center mb-4">${i18n.t('pw_min_len')}</p>
                
                <form id="change-pw-form">
                    <div class="mb-4">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">${i18n.t('new_pw')}</label>
                        <input type="password" id="new-pw" required minlength="8" />
                    </div>
                    <div class="mb-4">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Confirm Password</label>
                        <input type="password" id="confirm-pw" required minlength="8" />
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">${i18n.t('save')}</button>
                </form>
            </div>
        </div>
    `;
};

PasswordChangePage.init = () => {
    const form = document.getElementById('change-pw-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.getUser();
        const pw = document.getElementById('new-pw').value;
        const confirm = document.getElementById('confirm-pw').value;

        if (pw !== confirm) {
            UI.toast('Passwords do not match', 'error');
            return;
        }

        try {
            const res = await api.changePassword(user.id, pw);
            if (res.success) {
                UI.toast(i18n.t('success'));
                window.router.navigate('/');
            } else {
                UI.toast(res.error || i18n.t('error'), 'error');
            }
        } catch (err) {
            UI.toast(i18n.t('error'), 'error');
        }
    });
};

export default PasswordChangePage;