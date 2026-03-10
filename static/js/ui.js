/* ui.js - 3Minds Platform - Clean & Professional */
import { i18n } from './i18n.js';

export const UI = {
    modal(title, content, onConfirm, options = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-box" ${options.large ? 'style="max-width: 800px; width: 95%;"' : ''}>
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close-btn"><i class="ph ph-x"></i></button>
                    </div>
                    <div class="modal-body">${content}</div>
                    <div class="modal-footer" ${options.hideFooter ? 'style="display:none;"' : ''}>
                        <button class="btn modal-cancel-btn">${i18n.t('cancel')}</button>
                        <button class="btn btn-primary modal-confirm-btn">${i18n.t('save')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = () => { 
                if (options.onClose) options.onClose();
                overlay.remove(); 
                resolve(null); 
            };
            
            // Global access to close current modal
            UI.closeCurrentModal = close;

            overlay.querySelector('.modal-close-btn').onclick = close;
            const cancelBtn = overlay.querySelector('.modal-cancel-btn');
            if (cancelBtn) cancelBtn.onclick = close;
            
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

            const confirmBtn = overlay.querySelector('.modal-confirm-btn');
            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    const origText = confirmBtn.innerHTML;
                    confirmBtn.innerHTML = '<div class="btn-spinner"></div>';
                    confirmBtn.disabled = true;
                    try {
                        const result = await onConfirm();
                        if (result !== false) {
                            if (options.onClose) options.onClose();
                            overlay.remove();
                            resolve(result);
                        } else {
                            confirmBtn.innerHTML = origText;
                            confirmBtn.disabled = false;
                        }
                    } catch (err) {
                        UI.toast(err.message || i18n.t('error'), 'error');
                        confirmBtn.innerHTML = origText;
                        confirmBtn.disabled = false;
                    }
                };
            }
        });
    },

    toast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'error' ? 'ph-warning-circle' : 'ph-check-circle';
        toast.innerHTML = `<i class="ph ${icon}"></i><span>${message}</span>`;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    confirm(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-box" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3 style="color: #ef4444;">تأكيد الحذف</h3>
                    </div>
                    <div class="modal-body">
                        <p style="text-align: center; font-size: 1.1rem; color: var(--text-main); margin: 0;">${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn modal-cancel-btn">${i18n.t('cancel')}</button>
                        <button class="btn" style="background: #ef4444; color: white;" id="confirm-delete-btn">حذف</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('.modal-cancel-btn').onclick = () => { overlay.remove(); resolve(false); };
            overlay.querySelector('#confirm-delete-btn').onclick = () => { overlay.remove(); resolve(true); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        });
    }
};
