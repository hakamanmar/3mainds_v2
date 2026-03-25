/* AssignmentDetailsPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function AssignmentDetailsPage(params) {
    const user = auth.getUser();
    // Allow all admin-level roles to view submissions
    const allowedRoles = ['super_admin', 'section_admin', 'teacher', 'head_dept', 'committee', 'admin'];
    if (!user || !allowedRoles.includes(user.role)) {
        window.router.navigate('/');
        return document.createElement('div');
    }

    const assignmentId = params.id;
    if (!assignmentId) {
        window.router.navigate('/');
        return document.createElement('div');
    }

    const container = document.createElement('div');
    container.className = 'fade-in';

    // Show loading spinner while fetching
    container.innerHTML = `<div style="display:grid;place-items:center;height:55vh;"><div class="spinner"></div></div>`;

    let data = { assignment: {}, submitted: [], not_submitted: [] };

    try {
        const result = await api.getAssignmentSubmissions(assignmentId);
        if (result && typeof result === 'object') {
            data = {
                assignment: result.assignment || {},
                submitted: result.submitted || [],
                not_submitted: result.not_submitted || []
            };
        }
    } catch (e) {
        container.innerHTML = `
            <div class="page-header" style="margin-bottom:2rem;">
                <button class="btn btn-ghost" onclick="window.history.back()">
                    <i class="ph ph-arrow-right"></i> ${i18n.t('back') || 'رجوع'}
                </button>
            </div>
            <div class="card" style="text-align:center; padding:3rem; color:var(--red);">
                <i class="ph ph-warning-circle" style="font-size:3rem;"></i>
                <h3 style="margin-top:1rem;">خطأ في تحميل البيانات</h3>
                <p style="color:var(--text-muted);">${e?.message || 'تعذر الاتصال بالخادم'}</p>
                <button class="btn btn-primary" style="margin-top:1rem;" onclick="window.location.reload()">
                    <i class="ph ph-arrow-clockwise"></i> إعادة المحاولة
                </button>
            </div>`;
        return container;
    }

    const totalStudents = data.submitted.length + data.not_submitted.length;
    const submittedPercent = totalStudents > 0 ? Math.round((data.submitted.length / totalStudents) * 100) : 0;
    const assignmentTitle = data.assignment?.title || 'الواجب';

    container.innerHTML = `
        <div class="page-header" style="margin-bottom: 2rem;">
            <button class="btn btn-ghost" onclick="window.history.back()" style="margin-bottom:1rem;">
                <i class="ph ph-arrow-right"></i> ${i18n.t('back') || 'رجوع'}
            </button>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                <div>
                    <h1 style="margin:0;">${assignmentTitle}</h1>
                    <p style="color:var(--text-muted); margin:0.25rem 0 0;">${i18n.t('view_submissions') || 'مشاهدة التسليمات'}</p>
                </div>
                <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                    <div class="card" style="padding:0.75rem 1.5rem; text-align:center; min-width:100px;">
                        <div style="font-size:1.8rem; font-weight:800; color:#10b981;">${data.submitted.length}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">سلّموا</div>
                    </div>
                    <div class="card" style="padding:0.75rem 1.5rem; text-align:center; min-width:100px;">
                        <div style="font-size:1.8rem; font-weight:800; color:#ef4444;">${data.not_submitted.length}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">لم يسلّموا</div>
                    </div>
                    <div class="card" style="padding:0.75rem 1.5rem; text-align:center; min-width:100px;">
                        <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${submittedPercent}%</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">نسبة التسليم</div>
                    </div>
                </div>
            </div>
            <!-- Progress bar -->
            <div style="margin-top:1rem; background:var(--border); border-radius:50px; height:8px; width:100%; overflow:hidden;">
                <div style="height:100%; width:${submittedPercent}%; background:linear-gradient(90deg,#10b981,#059669); border-radius:50px; transition:width 1s ease;"></div>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
            <!-- Submitted -->
            <div class="card">
                <h3 style="margin-bottom:1.5rem; display:flex; align-items:center; gap:10px; padding-bottom:1rem; border-bottom:1px solid var(--border);">
                    <i class="ph ph-check-circle" style="color:#10b981; font-size:1.4rem;"></i>
                    الطلاب الذين سلّموا
                    <span style="background:#ecfdf5; color:#10b981; padding:2px 10px; border-radius:50px; font-size:0.8rem; font-weight:700;">${data.submitted.length}</span>
                </h3>
                <div>
                    ${data.submitted.length === 0
                        ? `<div style="text-align:center; padding:2rem; color:var(--text-muted);">
                               <i class="ph ph-clock" style="font-size:2rem;"></i>
                               <p>لا أحد سلّم بعد</p>
                           </div>`
                        : data.submitted.map(s => `
                            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.85rem 0; border-bottom:1px solid var(--border); gap:1rem;">
                                <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
                                    <div style="width:36px; height:36px; background:#ecfdf5; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; color:#10b981; font-size:0.9rem; flex-shrink:0;">
                                        ${(s.email || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div style="min-width:0;">
                                        <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.email || 'طالب'}</div>
                                        <div style="font-size:11px; color:var(--text-muted);">${s.submitted_at ? new Date(s.submitted_at).toLocaleString('ar-EG') : ''}</div>
                                    </div>
                                </div>
                                ${s.file_url ? `
                                    <a href="${s.file_url}" target="_blank" class="btn btn-sm btn-primary" style="flex-shrink:0;">
                                        <i class="ph ph-download"></i> تحميل
                                    </a>` : `<span style="color:var(--text-muted); font-size:12px;">لا يوجد ملف</span>`}
                            </div>
                        `).join('')}
                </div>
            </div>

            <!-- Not Submitted -->
            <div class="card">
                <h3 style="margin-bottom:1.5rem; display:flex; align-items:center; gap:10px; padding-bottom:1rem; border-bottom:1px solid var(--border);">
                    <i class="ph ph-x-circle" style="color:#ef4444; font-size:1.4rem;"></i>
                    الطلاب الذين لم يسلّموا
                    <span style="background:#fef2f2; color:#ef4444; padding:2px 10px; border-radius:50px; font-size:0.8rem; font-weight:700;">${data.not_submitted.length}</span>
                </h3>
                <div>
                    ${data.not_submitted.length === 0
                        ? `<div style="text-align:center; padding:2rem; color:#10b981;">
                               <i class="ph ph-confetti" style="font-size:2rem;"></i>
                               <p style="font-weight:600;">الجميع سلّم! 🎉</p>
                           </div>`
                        : data.not_submitted.map(s => `
                            <div style="display:flex; align-items:center; gap:0.75rem; padding:0.85rem 0; border-bottom:1px solid var(--border);">
                                <div style="width:36px; height:36px; background:#fef2f2; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; color:#ef4444; font-size:0.9rem; flex-shrink:0;">
                                    ${(s.email || '?').charAt(0).toUpperCase()}
                                </div>
                                <div style="font-weight:600; color:var(--text-main);">${s.email || 'طالب'}</div>
                            </div>
                        `).join('')}
                </div>
            </div>
        </div>
    `;

    return container;
}
