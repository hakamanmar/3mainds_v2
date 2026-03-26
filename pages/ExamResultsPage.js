/* ExamResultsPage.js - 3Minds Platform - Exam Results Viewer */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function ExamResultsPage(params) {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    if (!user) { window.router.navigate('/'); return container; }

    const examId = params.id;
    const isStudent = user.role === 'student';
    // If params.mode is 'result', show student their result;
    // otherwise show instructor the full list
    const studentView = params.mode === 'result' || isStudent;

    container.innerHTML = `<div style="display:grid;place-items:center;height:60vh;"><div class="spinner"></div></div>`;

    try {
        const data = await api.getExamResults(examId);

        if (studentView) {
            const result = data.my_result;
            if (!result) {
                container.innerHTML = `
                    <div style="padding:2rem;text-align:center;">
                        <div class="card" style="max-width:500px;margin:2rem auto;padding:3rem;border-radius:20px;">
                            <i class="ph ph-hourglass" style="font-size:4rem;color:#f59e0b;"></i>
                            <h2 style="margin-top:1rem;">لم تبدأ هذا الاختبار بعد</h2>
                            <button class="btn btn-primary" data-path="/exams" style="margin-top:1.5rem;height:48px;padding:0 2rem;border-radius:14px;">
                                العودة للاختبارات
                            </button>
                        </div>
                    </div>`;
                return container;
            }

            const score = result.score ?? 0;
            const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
            const scoreLabel = score >= 80 ? 'ممتاز 🏆' : score >= 60 ? 'جيد 👍' : 'يحتاج تحسين 📖';

            container.innerHTML = `
                <div style="max-width:650px;margin:0 auto;padding:2rem 1rem;">
                    <button class="btn btn-ghost" data-path="/exams" style="margin-bottom:1.5rem;">
                        <i class="ph ph-arrow-right"></i> رجوع
                    </button>
                    <div class="card" style="padding:2.5rem;border-radius:24px;text-align:center;border-top:6px solid ${scoreColor};">
                        <div style="font-size:0.9rem;font-weight:700;color:${scoreColor};background:${scoreColor}22;padding:6px 16px;border-radius:8px;display:inline-block;margin-bottom:1.5rem;">
                            ${scoreLabel}
                        </div>
                        <h2 style="font-size:1.5rem;color:var(--text-main);">${result.exam_title || ''}</h2>
                        <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:2rem;">نتيجتك في الاختبار</div>

                        <!-- Score Circle -->
                        <div style="position:relative;width:160px;height:160px;margin:0 auto 2rem;">
                            <svg viewBox="0 0 36 36" style="width:160px;height:160px;transform:rotate(-90deg);">
                                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--border)" stroke-width="2.5"/>
                                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="${scoreColor}" stroke-width="2.5"
                                    stroke-dasharray="${score} ${100 - score}" stroke-linecap="round"/>
                            </svg>
                            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
                                <div style="font-size:2.5rem;font-weight:900;color:${scoreColor};line-height:1;">${score}%</div>
                                <div style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">الدرجة</div>
                            </div>
                        </div>

                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:2rem;">
                            <div style="background:var(--surface-2);border-radius:14px;padding:1rem;">
                                <div style="font-size:1.5rem;font-weight:800;color:var(--text-main);">${result.total_questions}</div>
                                <div style="font-size:0.8rem;color:var(--text-muted);">إجمالي الأسئلة</div>
                            </div>
                            <div style="background:${scoreColor}15;border-radius:14px;padding:1rem;">
                                <div style="font-size:1.5rem;font-weight:800;color:${scoreColor};">${Math.round(score * result.total_questions / 100)}</div>
                                <div style="font-size:0.8rem;color:var(--text-muted);">إجابات صحيحة</div>
                            </div>
                        </div>

                        ${result.feedback ? `
                            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:16px;padding:1.25rem;text-align:right;margin-bottom:1.5rem;">
                                <div style="font-size:0.8rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                                    <i class="ph-fill ph-chat-centered-text"></i> ملاحظات الأستاذ
                                </div>
                                <p style="margin:0;color:var(--text-main);line-height:1.6;">${result.feedback}</p>
                            </div>
                        ` : `
                            <div style="background:#fef3c7;border-radius:14px;padding:1rem;margin-bottom:1.5rem;font-size:0.9rem;color:#b45309;font-weight:700;">
                                <i class="ph ph-clock-countdown"></i> لم يُضف الأستاذ ملاحظات بعد
                            </div>
                        `}

                        <div style="font-size:0.8rem;color:var(--text-muted);">
                            تاريخ التسليم: ${result.submitted_at ? new Date(result.submitted_at).toLocaleString('ar-EG') : 'N/A'}
                        </div>
                    </div>
                </div>`;

        } else {
            // Instructor view: all results
            const exam = data.exam || {};
            const results = data.results || [];
            const submitted = results.filter(r => r.is_submitted);
            const avgScore = submitted.length ? Math.round(submitted.reduce((a, r) => a + (r.score || 0), 0) / submitted.length) : 0;

            container.innerHTML = `
                <div style="max-width:1000px;margin:0 auto;padding:2rem 1rem;">
                    <button class="btn btn-ghost" data-path="/exams" style="margin-bottom:1.5rem;">
                        <i class="ph ph-arrow-right"></i> رجوع
                    </button>
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:2rem;">
                        <div>
                            <h1 style="margin:0;">${exam.title || 'الاختبار'}</h1>
                            <p style="color:var(--text-muted);">نتائج وتقييمات الطلاب</p>
                        </div>
                        <div style="display:flex;gap:1rem;flex-wrap:wrap;">
                            <div class="card" style="padding:1rem 1.5rem;text-align:center;min-width:100px;border-top:4px solid #10b981;">
                                <div style="font-size:2rem;font-weight:800;color:#10b981;">${submitted.length}</div>
                                <div style="font-size:0.8rem;color:var(--text-muted);">قدّموا الاختبار</div>
                            </div>
                            <div class="card" style="padding:1rem 1.5rem;text-align:center;min-width:100px;border-top:4px solid #6366f1;">
                                <div style="font-size:2rem;font-weight:800;color:#6366f1;">${avgScore}%</div>
                                <div style="font-size:0.8rem;color:var(--text-muted);">المتوسط العام</div>
                            </div>
                        </div>
                    </div>

                    <div class="card" style="padding:1.5rem;border-radius:20px;">
                        <h3 style="margin-bottom:1.5rem;">قائمة النتائج</h3>
                        ${results.length === 0 ? `
                            <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                                <i class="ph ph-hourglass" style="font-size:3rem;opacity:0.2;"></i>
                                <p>لم يقدم أي طالب الاختبار بعد</p>
                            </div>
                        ` : `
                            <div style="display:grid;gap:12px;">
                                ${results.map((r, idx) => {
                                    const sc = r.score ?? 0;
                                    const color = sc >= 80 ? '#10b981' : sc >= 60 ? '#f59e0b' : '#ef4444';
                                    return r.is_submitted ? `
                                        <div class="result-row" data-student-id="${r.student_id}">
                                            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                                                <div style="width:36px;text-align:center;font-weight:800;color:var(--text-muted);font-size:0.9rem;">#${idx + 1}</div>
                                                <div style="width:44px;height:44px;background:linear-gradient(135deg,${color},${color}aa);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">
                                                    ${(r.student_name || 'ط').charAt(0)}
                                                </div>
                                                <div style="min-width:0;">
                                                    <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.student_name}</div>
                                                    <div style="font-size:0.75rem;color:var(--text-muted);">
                                                        ${r.submitted_at ? new Date(r.submitted_at).toLocaleString('ar-EG') : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style="display:flex;align-items:center;gap:1rem;">
                                                <div style="text-align:center;">
                                                    <div style="font-size:1.5rem;font-weight:900;color:${color};">${sc}%</div>
                                                    ${r.feedback ? `<div style="font-size:0.7rem;color:#10b981;">✓ التغذية الراجعة</div>` : ''}
                                                </div>
                                                <button class="add-feedback-btn btn" data-student-id="${r.student_id}" data-student-name="${r.student_name}" style="background:#f1f5f9;border:none;padding:8px 14px;border-radius:10px;cursor:pointer;font-weight:700;color:#4f46e5;font-size:0.85rem;">
                                                    ${r.feedback ? 'تعديل الملاحظة' : 'إضافة ملاحظة'}
                                                </button>
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="result-row" style="opacity:0.6;">
                                            <div style="display:flex;align-items:center;gap:12px;flex:1;">
                                                <div style="width:36px;text-align:center;color:var(--text-muted);font-size:0.9rem;">${idx + 1}</div>
                                                <div style="width:44px;height:44px;background:#f1f5f9;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#64748b;flex-shrink:0;">
                                                    ${(r.student_name || 'ط').charAt(0)}
                                                </div>
                                                <div style="font-weight:600;">${r.student_name}</div>
                                            </div>
                                            <span style="background:#fef3c7;color:#b45309;padding:4px 12px;border-radius:8px;font-weight:700;font-size:0.8rem;">
                                                لم يقدم بعد
                                            </span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `}
                    </div>
                </div>
                <style>
                    .result-row { display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border:1px solid var(--border);border-radius:14px;background:var(--surface);gap:1rem;transition:all 0.2s; }
                    .result-row:hover { border-color:#6366f1;box-shadow:0 4px 12px rgba(99,102,241,0.06); }
                </style>`;

            // Feedback buttons
            container.querySelectorAll('.add-feedback-btn').forEach(btn => {
                btn.onclick = async () => {
                    const studentId = btn.dataset.studentId;
                    const studentName = btn.dataset.studentName;
                    const html = `
                        <div style="padding:0.5rem;">
                            <p style="color:var(--text-muted);margin-bottom:1rem;">إضافة ملاحظة للطالب: <strong>${studentName}</strong></p>
                            <textarea id="exam-feedback-text" class="form-control" rows="4" placeholder="اكتب ملاحظاتك هنا..."></textarea>
                        </div>`;
                    const res = await UI.modal('إضافة تغذية راجعة', html, async () => {
                        const feedback = document.getElementById('exam-feedback-text').value.trim();
                        if (!feedback) { UI.toast('يرجى كتابة ملاحظة', 'error'); return false; }
                        await api.addExamFeedback(examId, { student_id: studentId, feedback });
                        return true;
                    });
                    if (res) { UI.toast('تم حفظ الملاحظة ✅'); window.location.reload(); }
                };
            });
        }

    } catch (e) {
        container.innerHTML = `<div class="error-state"><i class="ph ph-warning-circle"></i><h3>فشل التحميل</h3><p>${e.message}</p></div>`;
    }

    return container;
}
