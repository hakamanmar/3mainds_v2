/* MyResultsPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function MyResultsPage() {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    if (!user || user.role !== 'student' && user.role !== 'super_admin') {
        window.router.navigate('/');
        return container;
    }

    container.innerHTML = `<div style="display:grid;place-items:center;height:60vh;"><div class="spinner"></div></div>`;

    let results = [];
    try {
        results = await api.getStudentGrades();
    } catch (e) {
        container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
        return container;
    }

    container.innerHTML = `
        <div style="padding-bottom:2rem;">
            <div class="page-header">
                <button class="btn btn-ghost" onclick="window.router.navigate('/home')" style="margin-bottom:1.5rem;">
                    <i class="ph ph-arrow-right"></i> ${i18n.t('back')}
                </button>
                <h1><i class="ph ph-medal" style="color:#f59e0b;"></i> نتائجي وتقييماتي</h1>
                <p class="text-muted">هنا يمكنك متابعة درجاتك وتغذية الأساتذة الراجعة على واجباتك المسلمة.</p>
            </div>

            <div class="results-container" style="margin-top:2rem; display:grid; gap:1.5rem;">
                ${results.length === 0 ? `
                    <div class="card" style="text-align:center; padding:4rem;">
                        <i class="ph ph-folder-open" style="font-size:4rem; opacity:0.1; margin-bottom:1.5rem;"></i>
                        <h3>لا توجد نتائج مسجلة</h3>
                        <p class="text-muted">لم يتم تقييم أي من واجباتك بعد أو لم تقم بتسليم أي واجب.</p>
                    </div>
                ` : results.map(r => `
                    <div class="card result-card" style="display:flex; flex-direction:column; gap:1.5rem; padding:1.5rem; border-radius:24px; position:relative; overflow:hidden;">
                        <div class="result-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <span style="font-size:0.75rem; font-weight:700; color:var(--primary); background:var(--primary-light); padding:4px 10px; border-radius:6px; text-transform:uppercase;">واجب منزلي</span>
                                <h2 style="margin:8px 0 4px; font-size:1.4rem;">${r.assignment_title}</h2>
                                <div style="font-size:0.85rem; color:var(--text-muted);">تم التسليم في: ${new Date(r.submitted_at).toLocaleDateString('ar-EG', {month:'long', day:'numeric', year:'numeric'})}</div>
                            </div>
                            <div style="text-align:right;">
                                ${r.grade ? `
                                    <div style="font-size:2.5rem; font-weight:900; color:#10b981; line-height:1;">${r.grade}</div>
                                    <div style="font-size:0.75rem; font-weight:800; color:#10b981; text-transform:uppercase; margin-top:4px;">الدرجة النهائية</div>
                                ` : `
                                    <div style="background:#fef3c7; color:#d97706; padding:8px 16px; border-radius:12px; font-weight:800; font-size:0.9rem;">
                                        <i class="ph ph-clock-countdown"></i> في انتظار التقييم
                                    </div>
                                `}
                            </div>
                        </div>
                        
                        ${r.feedback ? `
                            <div class="feedback-box" style="background:#f8fafc; border:1px solid var(--border); border-radius:16px; padding:1.25rem;">
                                <div style="font-size:0.85rem; font-weight:800; color:#64748b; margin-bottom:0.75rem; display:flex; align-items:center; gap:8px;">
                                    <i class="ph-fill ph-chat-centered-text"></i> ملاحظات الأستاذ:
                                </div>
                                <p style="font-size:1rem; line-height:1.6; color:#334155; margin:0;">${r.feedback}</p>
                            </div>
                        ` : ''}
                        
                        <div style="font-size:0.75rem; color:var(--text-muted); border-top:1px solid var(--border); padding-top:1rem; display:flex; gap:1rem;">
                            <span><i class="ph ph-seal-check"></i> تقييم رسمي</span>
                            ${r.graded_at ? `<span><i class="ph ph-calendar-check"></i> تم التقييم بتاريخ: ${new Date(r.graded_at).toLocaleDateString('ar-EG')}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        <style>
            .result-card { transition: all 0.3s ease; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.02); }
            .result-card:hover { transform: translateY(-5px); box-shadow: 0 12px 30px rgba(0,0,0,0.06); border-color: var(--primary-light); }
        </style>
    `;

    return container;
}
