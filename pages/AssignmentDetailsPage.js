/* AssignmentDetailsPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function AssignmentDetailsPage(params) {
    const user = auth.getUser();
    if (!user || !['super_admin', 'section_admin', 'teacher', 'head_dept', 'committee', 'admin'].includes(user.role)) {
        window.router.navigate('/');
        return;
    }

    const assignmentId = params.id;
    let data = { assignment: {}, submitted: [], not_submitted: [] };

    try {
        data = await api.getAssignmentSubmissions(assignmentId);
    } catch (e) {
        return `<div class="error-state"><p>${e.message}</p></div>`;
    }

    const container = document.createElement('div');
    container.className = 'fade-in';

    const render = () => {
        container.innerHTML = `
            <div class="page-header" style="margin-bottom: 2rem;">
                <button class="back-btn" onclick="window.history.back()" style="margin-bottom: 1rem;">
                    <i class="ph ph-arrow-right"></i> ${i18n.t('back')}
                </button>
                <h1>${data.assignment.title}</h1>
                <p style="color: var(--text-muted);">${i18n.t('view_submissions')}</p>
            </div>

            <div class="submissions-layout" style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 2rem;">
                <!-- Submitted List -->
                <div class="card">
                    <h3 style="margin-bottom: 1.5rem; display: flex; align-items:center; gap: 10px;">
                        <i class="ph ph-check-circle" style="color: #10b981;"></i>
                        ${i18n.t('submitted_students')}
                        <span class="count-pill" style="background: #ecfdf5; color: #10b981;">${data.submitted.length}</span>
                    </h3>
                    <div class="submission-list">
                        ${data.submitted.length === 0 ? `<p class="empty-text">${i18n.t('no_materials')}</p>` :
                data.submitted.map(s => `
                            <div class="submission-row" style="display: flex; align-items: center; justify-content: space-between; padding: 1rem; border-bottom: 1px solid var(--border);">
                                <div>
                                    <div style="font-weight: 600;">${s.email}</div>
                                    <div style="font-size: 12px; color: var(--text-muted);">${new Date(s.submitted_at).toLocaleString('ar-EG')}</div>
                                </div>
                                <a href="${s.file_url}" target="_blank" class="btn btn-sm btn-primary">
                                    <i class="ph ph-download"></i> تحميل الحل
                                </a>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Not Submitted List -->
                <div class="card">
                    <h3 style="margin-bottom: 1.5rem; display: flex; align-items:center; gap: 10px;">
                        <i class="ph ph-x-circle" style="color: #ef4444;"></i>
                        ${i18n.t('pending_students')}
                        <span class="count-pill" style="background: #fef2f2; color: #ef4444;">${data.not_submitted.length}</span>
                    </h3>
                    <div class="pending-list">
                        ${data.not_submitted.length === 0 ? `<p class="empty-text">الكل سلم! 🎉</p>` :
                data.not_submitted.map(s => `
                            <div class="submission-row" style="padding: 1rem; border-bottom: 1px solid var(--border); color: #ef4444;">
                                <i class="ph ph-user"></i> ${s.email}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    };

    render();
    return container;
}
