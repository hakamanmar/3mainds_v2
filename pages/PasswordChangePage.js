import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const PasswordChangePage = async () => {
    return `
        <div style="display: flex; justify-content: center; align-items: center; height: 80vh;">
            <div class="glass-panel" style="padding: 3rem; width: 100%; max-width: 420px; border-radius: 20px;">
                <div style="text-align:center; margin-bottom:2rem;">
                    <div style="width:64px;height:64px;background:rgba(79,70,229,0.1);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:2rem;">
                        🔐
                    </div>
                    <h1 style="font-size:1.5rem; font-weight:800; margin:0 0 0.5rem;">${i18n.t('change_pw_title')}</h1>
                    <p style="color:var(--text-muted); font-size:0.85rem;">${i18n.t('pw_min_len')}</p>
                </div>
                
                <form id="change-pw-form">
                    <div class="form-group">
                        <label class="form-label" style="font-weight:600;">كلمة السر الحالية</label>
                        <input type="password" id="old-pw" class="form-input" placeholder="أدخل كلمة السر الحالية" autocomplete="current-password" />
                    </div>
                    <div class="form-group">
                        <label class="form-label" style="font-weight:600;">${i18n.t('new_pw')}</label>
                        <input type="password" id="new-pw" class="form-input" placeholder="8 أحرف على الأقل، حرف كبير ورقم" autocomplete="new-password" />
                    </div>
                    <div class="form-group">
                        <label class="form-label" style="font-weight:600;">تأكيد كلمة السر الجديدة</label>
                        <input type="password" id="confirm-pw" class="form-input" placeholder="أعد كتابة كلمة السر الجديدة" autocomplete="new-password" />
                    </div>

                    <div id="pw-error" style="display:none; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:10px; padding:0.75rem; font-size:0.85rem; margin-bottom:1rem; text-align:right;"></div>

                    <button type="submit" class="btn btn-primary" style="width: 100%; padding:0.9rem; font-size:1rem; border-radius:12px; font-weight:700;">
                        <i class="ph ph-lock-key"></i> ${i18n.t('save')}
                    </button>
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
        const oldPw    = document.getElementById('old-pw').value;
        const pw       = document.getElementById('new-pw').value;
        const confirm  = document.getElementById('confirm-pw').value;
        const errBox   = document.getElementById('pw-error');

        const showErr = (msg) => { errBox.textContent = msg; errBox.style.display = 'block'; };

        if (!oldPw)            { showErr('كلمة السر الحالية مطلوبة'); return; }
        if (pw !== confirm)    { showErr('كلمة السر الجديدة وتأكيدها غير متطابقتين'); return; }
        if (pw.length < 8)     { showErr('كلمة السر يجب أن تكون 8 أحرف على الأقل'); return; }

        errBox.style.display = 'none';

        try {
            const res = await api.changePassword(user.id, oldPw, pw);
            if (res && res.success) {
                UI.toast('✅ تم تغيير كلمة السر بنجاح', 'success');
                window.router.navigate('/home');
            } else {
                showErr(res?.error || i18n.t('error'));
            }
        } catch (err) {
            showErr(err.message || i18n.t('error'));
        }
    });
};

export default PasswordChangePage;
