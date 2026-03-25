/* AssignmentDetailsPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function AssignmentDetailsPage(params) {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    // Role check - redirect unauthorized users
    const allowedRoles = ['super_admin', 'section_admin', 'teacher', 'head_dept', 'committee', 'admin'];
    if (!user || !allowedRoles.includes(user.role)) {
        window.router.navigate('/');
        return container; // MUST return container not undefined
    }

    const assignmentId = params.id;
    if (!assignmentId) {
        container.innerHTML = `<div class="error-state"><p>رقم الواجب غير صحيح</p></div>`;
        return container;
    }

    // Show loading spinner while fetching
    container.innerHTML = `<div style="display:grid;place-items:center;height:55vh;"><div class="spinner"></div></div>`;

    let data = { assignment: {}, submitted: [], not_submitted: [] };

    try {
        const result = await api.getAssignmentSubmissions(assignmentId);
        if (result && typeof result === 'object') {
            data.assignment = result.assignment || {};
            data.submitted = result.submitted || [];
            data.not_submitted = result.not_submitted || [];
        }
    } catch (e) {
        container.innerHTML = `
            <div style="padding:2rem;">
                <button class="btn btn-ghost" onclick="window.history.back()" style="margin-bottom:1rem;">
                    <i class="ph ph-arrow-right"></i> رجوع
                </button>
                <div class="card" style="text-align:center; padding:3rem; color:var(--red);">
                    <i class="ph ph-warning-circle" style="font-size:3rem;"></i>
                    <h3 style="margin-top:1rem;">خطأ في تحميل التسليمات</h3>
                    <p style="color:var(--text-muted);">${e?.message || 'تعذر الاتصال بالخادم'}</p>
                    <button class="btn btn-primary" style="margin-top:1rem;" onclick="window.location.reload()">
                        <i class="ph ph-arrow-clockwise"></i> إعادة المحاولة
                    </button>
                </div>
            </div>`;
        return container;
    }

    const total = data.submitted.length + data.not_submitted.length;
    const pct = total > 0 ? Math.round((data.submitted.length / total) * 100) : 0;
    const title = data.assignment?.title || 'الواجب';

    container.innerHTML = `
        <div style="padding-bottom:2rem;">
            <div class="page-header" style="margin-bottom:2rem;">
                <button class="btn btn-ghost" onclick="window.history.back()" style="margin-bottom:1rem;">
                    <i class="ph ph-arrow-right"></i> رجوع
                </button>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <h1 style="margin:0;">${title}</h1>
                        <p style="color:var(--text-muted); margin:0.25rem 0 0;">مشاهدة التسليمات</p>
                    </div>
                    <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                        <div class="card" style="padding:0.75rem 1.25rem; text-align:center; min-width:90px;">
                            <div style="font-size:1.8rem; font-weight:800; color:#10b981;">${data.submitted.length}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">سلّموا</div>
                        </div>
                        <div class="card" style="padding:0.75rem 1.25rem; text-align:center; min-width:90px;">
                            <div style="font-size:1.8rem; font-weight:800; color:#ef4444;">${data.not_submitted.length}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">لم يسلّموا</div>
                        </div>
                        <div class="card" style="padding:0.75rem 1.25rem; text-align:center; min-width:90px;">
                            <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${pct}%</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">التسليم</div>
                        </div>
                    </div>
                </div>
                <div style="margin-top:1rem; background:var(--border); border-radius:50px; height:8px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,#10b981,#059669); border-radius:50px;"></div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                <!-- Submitted -->
                <div class="card">
                    <h3 style="margin-bottom:1.5rem; display:flex; align-items:center; gap:10px; padding-bottom:1rem; border-bottom:1px solid var(--border);">
                        <i class="ph ph-check-circle" style="color:#10b981; font-size:1.4rem;"></i>
                        الطلاب الذين سلّموا
                        <span style="background:#ecfdf5; color:#10b981; padding:2px 10px; border-radius:50px; font-size:0.8rem; font-weight:700; margin-right:auto;">${data.submitted.length}</span>
                    </h3>
                    ${data.submitted.length === 0
                        ? `<div style="text-align:center; padding:2rem; color:var(--text-muted);">
                               <i class="ph ph-clock" style="font-size:2rem;"></i>
                               <p>لا أحد سلّم بعد</p>
                           </div>`
                        : data.submitted.map(s => `
                            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.85rem 0; border-bottom:1px solid var(--border); gap:0.75rem;">
                                <div style="display:flex; align-items:center; gap:0.75rem; min-width:0; flex:1;">
                                    <div style="width:36px; height:36px; background:#ecfdf5; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; color:#10b981; font-size:0.9rem; flex-shrink:0;">
                                        ${(s.email || 'ط').charAt(0).toUpperCase()}
                                    </div>
                                    <div style="min-width:0;">
                                        <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.email || 'طالب'}</div>
                                        <div style="font-size:11px; color:var(--text-muted);">${s.submitted_at ? new Date(s.submitted_at).toLocaleString('ar-EG') : ''}</div>
                                    </div>
                                </div>
                                ${s.file_url ? `
                                    <a href="${s.file_url}" target="_blank" class="btn btn-sm btn-primary" style="flex-shrink:0;">
                                        <i class="ph ph-download"></i> تحميل
                                    </a>` : `<span style="color:var(--text-muted); font-size:12px;">لا ملف</span>`}
                            </div>
                        `).join('')}
                </div>

                <!-- Not Submitted -->
                <div class="card">
                    <h3 style="margin-bottom:1.5rem; display:flex; align-items:center; gap:10px; padding-bottom:1rem; border-bottom:1px solid var(--border);">
                        <i class="ph ph-x-circle" style="color:#ef4444; font-size:1.4rem;"></i>
                        لم يسلّموا بعد
                        <span style="background:#fef2f2; color:#ef4444; padding:2px 10px; border-radius:50px; font-size:0.8rem; font-weight:700; margin-right:auto;">${data.not_submitted.length}</span>
                    </h3>
                    ${data.not_submitted.length === 0
                        ? `<div style="text-align:center; padding:2rem; color:#10b981;">
                               <i class="ph ph-confetti" style="font-size:2rem;"></i>
                               <p style="font-weight:600;">الجميع سلّم! 🎉</p>
                           </div>`
                        : data.not_submitted.map(s => `
                            <div style="display:flex; align-items:center; gap:0.75rem; padding:0.85rem 0; border-bottom:1px solid var(--border);">
                                <div style="width:36px; height:36px; background:#fef2f2; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; color:#ef4444; font-size:0.9rem; flex-shrink:0;">
                                    ${(s.email || 'ط').charAt(0).toUpperCase()}
                                </div>
                                <div style="font-weight:600;">${s.email || 'طالب'}</div>
                            </div>
                        `).join('')}
                </div>
            </div>
        </div>
    `;

    return container;
}
