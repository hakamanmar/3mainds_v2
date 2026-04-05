/* ExamListPage.js - 3Minds Platform - Exam Dashboard */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function ExamListPage(params) {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    if (!user) { window.router.navigate('/'); return container; }

    const isInstructor = ['teacher', 'super_admin', 'section_admin', 'head_dept', 'committee'].includes(user.role);
    const isStudent = user.role === 'student' || user.role === 'super_admin';

    container.innerHTML = `<div style="display:grid;place-items:center;height:55vh;"><div class="spinner"></div></div>`;

    let exams = [];
    try {
        exams = await api.listExams();
        if (!Array.isArray(exams)) exams = [];
    } catch (e) {
        container.innerHTML = `<div class="error-state"><i class="ph ph-warning-circle"></i><h3>فشل تحميل الاختبارات</h3><p>${e.message}</p></div>`;
        return container;
    }

    container.innerHTML = `
        <div style="max-width:1000px;margin:0 auto;padding:2rem 1rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:2rem;">
                <div>
                    <h1 style="display:flex;align-items:center;gap:12px;margin:0;">
                        <span style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;display:flex;align-items:center;justify-content:center;">
                            <i class="ph-fill ph-exam" style="color:#fff;font-size:1.5rem;"></i>
                        </span>
                        الاختبارات
                    </h1>
                    <p style="color:var(--text-muted);margin-top:8px;">${exams.length} اختبار مسجل</p>
                </div>
                ${isInstructor && user.role !== 'committee' ? `
                    <button id="create-exam-btn" class="btn btn-primary" style="height:50px;padding:0 1.5rem;border-radius:14px;font-size:1rem;">
                        <i class="ph-bold ph-plus"></i> إنشاء اختبار جديد
                    </button>
                ` : ''}
            </div>

            ${exams.length === 0 ? `
                <div class="card" style="text-align:center;padding:4rem;border-radius:20px;">
                    <i class="ph ph-exam" style="font-size:4rem;opacity:0.1;"></i>
                    <h3 style="margin-top:1.5rem;">لا توجد اختبارات</h3>
                    <p style="color:var(--text-muted);">${isInstructor ? 'ابدأ بإنشاء اختبار جديد لطلابك.' : 'لم يتم نشر أي اختبارات بعد.'}</p>
                </div>                        const expired = exam.attempt && exam.attempt.is_submitted;
                        const started = exam.attempt && !exam.attempt.is_submitted;
                        const closed = exam.is_closed;

                        return `
                        <div class="exam-list-card" data-exam-id="${exam.id}">
                            <div style="display:flex;align-items:center;gap:1.25rem;flex:1;min-width:0;">
                                <div style="width:52px;height:52px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <i class="ph-fill ph-exam" style="color:#fff;font-size:1.4rem;"></i>
                                </div>
                                <div style="min-width:0;">
                                    <h3 style="margin:0;font-size:1.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${exam.title}</h3>
                                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
                                        <span style="font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:4px;">
                                            <i class="ph ph-book-open"></i> ${exam.subject_title || 'مادة'}
                                        </span>
                                        <span style="font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:4px;">
                                            <i class="ph ph-clock"></i> ${exam.duration_minutes} دقيقة
                                        </span>
                                        <span style="font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:4px;">
                                            <i class="ph ph-list-numbers"></i> ${exam.question_count} سؤال
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex;gap:10px;align-items:center;flex-shrink:0;">
                                ${user.role === 'student' ? `
                                    ${expired ? `
                                        <span style="background:#ecfdf5;color:#10b981;padding:6px 16px;border-radius:10px;font-weight:800;font-size:0.9rem;">
                                            <i class="ph-bold ph-check-circle"></i> تم: ${exam.attempt.score}%
                                        </span>
                                        <button class="btn-view-result" data-exam-id="${exam.id}" style="padding:8px 14px;border-radius:10px;background:#f1f5f9;border:none;cursor:pointer;font-weight:700;color:#4f46e5;">
                                            عرض النتيجة
                                        </button>
                                    ` : started ? `
                                        <span style="background:#fef3c7;color:#d97706;padding:6px 16px;border-radius:10px;font-weight:800;font-size:0.9rem;">
                                            <i class="ph ph-hourglass"></i> جارٍ...
                                        </span>
                                        <button class="btn-take-exam" data-exam-id="${exam.id}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;padding:10px 18px;border-radius:12px;cursor:pointer;font-weight:700;">
                                            متابعة الاختبار
                                        </button>
                                    ` : closed ? `
                                        <span style="background:#fef2f2;color:#ef4444;padding:6px 16px;border-radius:10px;font-weight:800;font-size:0.9rem;">
                                            <i class="ph ph-lock-key"></i> مُغلق
                                        </span>
                                    ` : `
                                        <button class="btn-take-exam" data-exam-id="${exam.id}" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;padding:10px 18px;border-radius:12px;cursor:pointer;font-weight:700;font-size:1rem;">
                                            <i class="ph-bold ph-play"></i> ابدأ الاختبار
                                        </button>
                                    `}
                      <i class="ph-bold ph-play"></i> ابدأ الاختبار
                                        </button>
                                    `}
                                ` : `
                                    <button class="btn-view-results-instructor" data-exam-id="${exam.id}" style="background:#f1f5f9;border:none;padding:10px 18px;border-radius:12px;cursor:pointer;font-weight:700;color:#4f46e5;">
                                        <i class="ph ph-chart-bar"></i> النتائج
                                    </button>
                                    ${user.role !== 'committee' ? `
                                        <button class="btn-delete-exam" data-exam-id="${exam.id}" style="background:#fef2f2;border:none;padding:10px 14px;border-radius:12px;cursor:pointer;color:#ef4444;">
                                            <i class="ph-bold ph-trash"></i>
                                        </button>
                                    ` : ''}
                                `}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
        <style>
            .exam-list-card { display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:1.25rem 1.5rem;gap:1rem;transition:all 0.2s; }
            .exam-list-card:hover { border-color:#6366f1;box-shadow:0 8px 24px rgba(99,102,241,0.08);transform:translateY(-2px); }
            .btn-view-result, .btn-view-results-instructor { background:var(--surface-2) !important; color:var(--primary) !important; }
        </style>
    `;

    // Bind events
    container.querySelector('#create-exam-btn')?.addEventListener('click', () => {
        window.router.navigate('/exams/create');
    });

    container.querySelectorAll('.btn-take-exam').forEach(btn => {
        btn.onclick = () => window.router.navigate(`/exam/${btn.dataset.examId}/take`);
    });

    container.querySelectorAll('.btn-view-result').forEach(btn => {
        btn.onclick = () => window.router.navigate(`/exam/${btn.dataset.examId}/result`);
    });

    container.querySelectorAll('.btn-view-results-instructor').forEach(btn => {
        btn.onclick = () => window.router.navigate(`/exam/${btn.dataset.examId}/results`);
    });

    container.querySelectorAll('.btn-delete-exam').forEach(btn => {
        btn.onclick = async () => {
            const confirmed = await UI.confirm('هل أنت متأكد من حذف هذا الاختبار وجميع نتائجه؟');
            if (confirmed) {
                const res = await api.deleteExam(btn.dataset.examId);
                if (res.success) {
                    UI.toast('تم حذف الاختبار');
                    window.location.reload();
                } else {
                    UI.toast(res.error || 'فشل الحذف', 'error');
                }
            }
        };
    });

    return container;
}
