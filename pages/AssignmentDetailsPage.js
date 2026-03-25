/* AssignmentDetailsPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function AssignmentDetailsPage(params) {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    const allowedRoles = ['super_admin', 'section_admin', 'teacher', 'head_dept', 'committee', 'admin'];
    if (!user || !allowedRoles.includes(user.role)) {
        window.router.navigate('/');
        return container;
    }

    const assignmentId = params.id;
    if (!assignmentId) {
        container.innerHTML = `<div class="error-state"><p>رقم الواجب غير صحيح</p></div>`;
        return container;
    }

    container.innerHTML = `<div style="display:grid;place-items:center;height:55vh;"><div class="spinner"></div></div>`;

    let data = { assignment: {}, submitted: [], not_submitted: [] };

    try {
        const result = await api.getAssignmentSubmissions(assignmentId);
        if (result && typeof result === 'object') {
            data.assignment = result.assignment || {};
            data.submitted = result.submitted || [];
            data.not_submitted = result.not_submitted || [];
        } else {
            throw new Error('البيانات المستلمة غير صالحة');
        }
    } catch (e) {
        // Updated error logic to show MORE details
        const status = e.status || '';
        const msg = e.message || 'خطأ غير معروف في الشبكة';
        container.innerHTML = `
            <div style="padding:2rem;">
                <button class="btn btn-ghost" onclick="window.history.back()" style="margin-bottom:1rem;">
                    <i class="ph ph-arrow-right"></i> رجوع
                </button>
                <div class="card" style="text-align:center; padding:3rem;">
                    <i class="ph ph-warning-circle" style="font-size:4rem; color:#ef4444;"></i>
                    <h2 style="margin-top:1.5rem; color:#1e1b4b;">فشل جلب البيانات</h2>
                    <p style="color:var(--text-muted); font-size:1.1rem; margin-top:0.5rem;">
                        ${status ? `[HTTP ${status}] ` : ''} ${msg}
                    </p>
                    <div style="margin-top:2rem; display:flex; gap:1rem; justify-content:center;">
                        <button class="btn btn-primary" onclick="window.location.reload()">
                            <i class="ph ph-arrow-clockwise"></i> إعادة المحاولة
                        </button>
                        <button class="btn btn-ghost" onclick="window.router.navigate('/home')">
                            الرئيسية
                        </button>
                    </div>
                    <p style="margin-top:2rem; font-size:0.8rem; opacity:0.5;">
                        URL: /api/assignments/${assignmentId}/submissions
                    </p>
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
                <button class="btn btn-ghost" onclick="window.history.back()" style="margin-bottom:1.5rem;">
                    <i class="ph ph-arrow-right"></i> ${i18n.t('back') || 'رجوع'}
                </button>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1.5rem;">
                    <div>
                        <h1 style="margin:0; font-size:2rem; color:#1e1b4b;">${title}</h1>
                        <p style="color:var(--text-muted); margin:0.5rem 0 0; font-size:1.1rem;">
                            <i class="ph ph-users"></i> إحصائيات تسليم الواجب
                        </p>
                    </div>
                    <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                        <div class="card" style="padding:1rem 1.5rem; text-align:center; min-width:110px; border-top: 4px solid #10b981;">
                            <div style="font-size:2rem; font-weight:800; color:#10b981;">${data.submitted.length}</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">تم التسليم</div>
                        </div>
                        <div class="card" style="padding:1rem 1.5rem; text-align:center; min-width:110px; border-top: 4px solid #ef4444;">
                            <div style="font-size:2rem; font-weight:800; color:#ef4444;">${data.not_submitted.length}</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">غياب</div>
                        </div>
                        <div class="card" style="padding:1rem 1.5rem; text-align:center; min-width:110px; border-top: 4px solid var(--primary);">
                            <div style="font-size:2rem; font-weight:800; color:var(--primary);">${pct}%</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">النسبة</div>
                        </div>
                    </div>
                </div>
                <div style="margin-top:1.5rem; background:var(--border); border-radius:50px; height:12px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,#10b981,#059669); border-radius:50px; transition: width 1s ease;"></div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:2rem;">
                <!-- Submitted -->
                <div class="card" style="padding:1.5rem;">
                    <h3 style="margin-bottom:1.5rem; display:flex; align-items:center; gap:12px; padding-bottom:1rem; border-bottom:1px solid var(--border);">
                        <i class="ph ph-check-square" style="color:#10b981; font-size:1.8rem;"></i>
                        قائمة الطلاب المسلّمين
                        <span style="background:#ecfdf5; color:#10b981; padding:4px 12px; border-radius:50px; font-size:0.9rem; font-weight:700; margin-right:auto;">${data.submitted.length}</span>
                    </h3>
                    <div style="display:grid; gap:1rem;">
                    ${data.submitted.length === 0
                        ? `<div style="text-align:center; padding:3rem; color:var(--text-muted); background:var(--bg-faded); border-radius:16px;">
                               <i class="ph ph-file-dashed" style="font-size:3rem; opacity:0.3;"></i>
                               <p style="margin-top:1rem;">لم يتم رفع أي ملفات حتى الآن</p>
                           </div>`
                        : data.submitted.map(s => `
                            <div class="submission-item" style="display:flex; align-items:center; justify-content:space-between; padding:1.25rem; border:1px solid var(--border); border-radius:20px; gap:1rem; transition:all 0.2s; background:#fff;">
                                <div style="display:flex; align-items:center; gap:1rem; min-width:0; flex:1;">
                                    <div style="width:50px; height:50px; background:linear-gradient(135deg, #10b981, #059669); border-radius:14px; display:flex; align-items:center; justify-content:center; font-weight:800; color:#fff; font-size:1.3rem; flex-shrink:0; box-shadow:0 4px 12px rgba(16,185,129,0.2);">
                                        ${(s.student_name || 'ط').charAt(0).toUpperCase()}
                                    </div>
                                    <div style="min-width:0;">
                                        <div style="font-weight:700; color:#1e1b4b; font-size:1.1rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.student_name}</div>
                                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; display:flex; gap:12px; align-items:center;">
                                            <span><i class="ph ph-envelope"></i> ${s.email}</span>
                                            <span><i class="ph ph-calendar"></i> ${s.submitted_at ? new Date(s.submitted_at).toLocaleString('ar-EG') : 'N/A'}</span>
                                        </div>
                                        ${s.current_grade ? `
                                            <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                                                <span class="tag tag-success" style="font-weight:800;"><i class="ph-bold ph-star"></i> درجة: ${s.current_grade}</span>
                                                ${s.current_feedback ? `<span style="font-size:0.8rem; color:var(--text-muted); background:#f1f5f9; padding:2px 8px; border-radius:6px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.current_feedback}</span>` : ''}
                                            </div>
                                        ` : '<div style="margin-top:8px; font-size:0.8rem; color:#f59e0b; font-weight:700;"><i class="ph ph-clock"></i> بانتظار التقييم</div>'}
                                    </div>
                                </div>
                                <div style="display:flex; gap:0.75rem; align-items:center;">
                                    ${s.file_url ? `
                                        <a href="${s.file_url}" target="_blank" class="glass-btn" title="معاينة الملف" style="width:42px; height:42px; display:flex; align-items:center; justify-content:center; border-radius:12px; background:#f1f5f9; color:#4f46e5;">
                                            <i class="ph ph-file-pdf" style="font-size:1.4rem;"></i>
                                        </a>` : ''}
                                    <button class="btn btn-primary grade-btn" 
                                            data-id="${s.id}" 
                                            data-student="${s.student_name}" 
                                            data-grade="${s.current_grade || ''}" 
                                            data-feedback="${s.current_feedback || ''}"
                                            style="padding:0.75rem 1.5rem; border-radius:14px; font-weight:700;">
                                        <i class="ph ph-check-circle"></i> ${s.current_grade ? 'تعديل التقييم' : 'تقييم الآن'}
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Not Submitted -->
                <div class="card" style="padding:1.5rem; background: #fcfcfd;">
                    <h3 style="margin-bottom:1.5rem; display:flex; align-items:center; gap:12px; padding-bottom:1rem; border-bottom:1px solid var(--border);">
                        <i class="ph ph-warning-octagon" style="color:#ef4444; font-size:1.8rem;"></i>
                        التسليمات المعلقة
                        <span style="background:#fef2f2; color:#ef4444; padding:4px 12px; border-radius:50px; font-size:0.9rem; font-weight:700; margin-right:auto;">${data.not_submitted.length}</span>
                    </h3>
                    <div style="display:grid; gap:0.75rem;">
                    ${data.not_submitted.length === 0
                        ? `<div style="text-align:center; padding:3rem; color:#10b981; background:#ecfdf5; border-radius:16px;">
                               <i class="ph ph-crown" style="font-size:3rem;"></i>
                               <p style="font-weight:700; margin-top:1rem;">ممتاز! اكتملت جميع التسليمات</p>
                           </div>`
                        : data.not_submitted.map(s => `
                            <div style="display:flex; align-items:center; gap:1rem; padding:1rem; border-radius:16px; background:#fff; border:1px solid var(--border);">
                                <div style="width:40px; height:40px; background:#fef2f2; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:700; color:#ef4444; font-size:1rem; flex-shrink:0;">
                                    ${(s.full_name || 'ط').charAt(0).toUpperCase()}
                                </div>
                                <div style="min-width:0;">
                                    <div style="font-weight:700; color:#1e1b4b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.full_name || s.email}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">لم يتم التسليم بعد</div>
                                </div>
                                <div style="margin-right:auto; color:#ef4444; font-size:0.75rem; font-weight:700; background:#fef2f2; padding:3px 8px; border-radius:6px;">غائب</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
        <style>
            .submission-item:hover { transform: translateY(-3px); border-color: var(--primary) !important; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
            .glass-btn:hover { background: #e2e8f0 !important; transform: scale(1.05); }
        </style>
    `;

    // Event listener for Grading Modal
    container.querySelectorAll('.grade-btn').forEach(btn => {
        btn.onclick = async () => {
            const sid = btn.dataset.id;
            const student = btn.dataset.student;
            const currentGrade = btn.dataset.grade;
            const currentFeedback = btn.dataset.feedback;

            const html = `
                <div style="padding:0.5rem;">
                    <p style="color:var(--text-muted); margin-bottom:1.5rem;">تقييم الطالب: <strong style="color:var(--primary);">${student}</strong></p>
                    <div class="form-group">
                        <label class="form-label">الدرجة (مثال: 90 أو A+)</label>
                        <input id="grade-val" class="form-control" value="${currentGrade}" placeholder="أدخل الدرجة..." style="height:50px; font-size:1.1rem; font-weight:700;" />
                    </div>
                    <div class="form-group" style="margin-top:1.5rem;">
                        <label class="form-label">ملاحظات الأستاذ / التغذية الراجعة</label>
                        <textarea id="grade-feedback" class="form-control" rows="4" placeholder="اكتب ملاحظاتك هنا للهذا الطالب...">${currentFeedback}</textarea>
                    </div>
                </div>
            `;

            const res = await UI.modal('تقييم تسليم الواجب', html, async () => {
                const grade = document.getElementById('grade-val').value.trim();
                const feedback = document.getElementById('grade-feedback').value.trim();
                if (!grade) { UI.toast('يرجى إدخال الدرجة أولاً', 'error'); return false; }
                await api.gradeSubmission(sid, { grade, feedback });
                return true;
            });

            if (res) {
                UI.toast('تم حفظ التقييم بنجاح ✅');
                window.location.reload();
            }
        };
    });

    return container;
}
