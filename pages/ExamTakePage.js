/* ExamTakePage.js - 3Minds Platform - Student Exam Taking */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function ExamTakePage(params) {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    if (!user || (user.role !== 'student' && user.role !== 'super_admin')) {
        window.router.navigate('/home');
        return container;
    }

    const examId = params.id;
    if (!examId) {
        container.innerHTML = `<div class="error-state"><p>رقم الاختبار غير صحيح</p></div>`;
        return container;
    }

    container.innerHTML = `<div style="display:grid;place-items:center;height:60vh;"><div class="spinner"></div></div>`;

    let exam;
    try {
        // Start the attempt via API
        const startRes = await api.startExam(examId);
        if (startRes.error) {
            container.innerHTML = `
                <div style="padding:2rem;text-align:center;">
                    <div class="card" style="max-width:500px;margin:2rem auto;padding:3rem;border-radius:20px;">
                        <i class="ph ph-check-circle" style="font-size:4rem;color:#10b981;"></i>
                        <h2 style="margin-top:1rem;">لقد قدمت هذا الاختبار مسبقاً</h2>
                        <p style="color:var(--text-muted);">يُسمح بمحاولة واحدة فقط لكل اختبار.</p>
                        <button class="btn btn-primary" data-path="/exams" style="margin-top:1.5rem;height:48px;padding:0 2rem;border-radius:14px;">
                            العودة للاختبارات
                        </button>
                    </div>
                </div>`;
            return container;
        }

        const attempt = startRes.attempt;
        // Get exam with questions
        exam = await api.getExam(examId);

        if (!exam || !exam.questions) throw new Error('فشل تحميل أسئلة الاختبار');

        // Calculate remaining time
        // Fix for cross-browser date parsing (especially Safari/iOS)
        const dateStr = attempt.started_at.includes(' ') ? attempt.started_at.replace(' ', 'T') + 'Z' : attempt.started_at;
        const startedAt = new Date(dateStr).getTime();
        const duration = parseInt(exam.duration_minutes) || 60;
        const endTime = startedAt + (duration * 60 * 1000);
        const now = Date.now();
        const remainingMs = Math.max(endTime - now, 0);

        if (remainingMs === 0) {
            // Auto-submit if time is up
            await api.submitExam(examId, {});
            container.innerHTML = `<div style="padding:2rem;text-align:center;"><div class="card" style="max-width:500px;margin:2rem auto;padding:3rem;border-radius:20px;"><i class="ph ph-timer" style="font-size:4rem;color:#ef4444;"></i><h2 style="margin-top:1rem;">انتهى وقت الاختبار</h2><p>تم تسليم الاختبار تلقائياً.</p><button class="btn btn-primary" data-path="/exam/${examId}/result" style="margin-top:1.5rem;height:48px;padding:0 2rem;border-radius:14px;">عرض نتيجتي</button></div></div>`;
            return container;
        }

        // State
        let answers = {};
        let timerInterval;

        const totalQ = exam.questions.length;

        function formatTime(ms) {
            const totalSec = Math.floor(ms / 1000);
            const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
            const s = (totalSec % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        function answeredCount() {
            return Object.keys(answers).length;
        }

        container.innerHTML = `
            <!-- Sticky Timer Header -->
            <div id="exam-header" style="position:sticky;top:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                <div>
                    <div style="font-weight:800;font-size:1.1rem;color:var(--text-main);">${exam.title}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">أجب على <strong>${totalQ}</strong> سؤال</div>
                </div>
                <div style="display:flex;align-items:center;gap:1.5rem;">
                    <div id="answered-count" style="font-size:0.85rem;color:var(--text-muted);">أجبت على 0/${totalQ}</div>
                    <div id="timer-box" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:10px 20px;border-radius:14px;font-size:1.3rem;font-weight:900;min-width:90px;text-align:center;font-family:monospace;">
                        ${formatTime(remainingMs)}
                    </div>
                </div>
            </div>

            <!-- Tab Warning -->
            <div id="tab-warning" style="display:none;background:#fef3c7;border-bottom:3px solid #f59e0b;padding:12px 1.5rem;text-align:center;font-weight:700;color:#b45309;">
                <i class="ph ph-warning"></i> تحذير: لا تغادر صفحة الاختبار أثناء تأدية الاختبار!
            </div>

            <div style="max-width:800px;margin:0 auto;padding:2rem 1rem;">
                <!-- Questions -->
                <div id="questions-area">
                    ${exam.questions.map((q, idx) => `
                        <div class="exam-question-card" id="q-card-${q.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:1.5rem;margin-bottom:1.25rem;transition:all 0.2s;">
                            <div style="display:flex;gap:12px;margin-bottom:1.25rem;">
                                <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;flex-shrink:0;">${idx + 1}</div>
                                <p style="margin:0;font-size:1.05rem;font-weight:600;line-height:1.6;padding-top:4px;">${q.question_text}</p>
                            </div>
                            <div style="display:grid;gap:10px;">
                                ${(q.shuffled_options || [
                                    {key: 'a', text: q.option_a},
                                    {key: 'b', text: q.option_b},
                                    {key: 'c', text: q.option_c},
                                    {key: 'd', text: q.option_d}
                                ]).map(opt => `
                                    <label class="exam-option" data-q="${q.id}" data-key="${opt.key}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:2px solid var(--border);border-radius:14px;cursor:pointer;transition:all 0.15s;font-weight:500;">
                                        <input type="radio" name="q-${q.id}" value="${opt.key}" style="display:none;" />
                                        <div class="opt-indicator" style="width:22px;height:22px;border:2px solid var(--border);border-radius:50%;flex-shrink:0;transition:all 0.15s;"></div>
                                        <span>${opt.text || '(خيار فارغ)'}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Submit Button -->
                <div style="padding:2rem 0;text-align:center;">
                    <button id="submit-exam-btn" class="btn btn-primary" style="height:56px;padding:0 3rem;font-size:1.1rem;border-radius:16px;background:linear-gradient(135deg,#10b981,#059669);">
                        <i class="ph-bold ph-paper-plane-tilt"></i> تسليم الاختبار النهائي
                    </button>
                    <p style="margin-top:1rem;font-size:0.85rem;color:var(--text-muted);">بعد التسليم لن تتمكن من التعديل</p>
                </div>
            </div>

            <style>
                .exam-option:hover { border-color:#6366f1; background:#f5f3ff; }
                .exam-option.selected { border-color:#6366f1; background:#f5f3ff; }
                .exam-option.selected .opt-indicator { background:#6366f1; border-color:#6366f1; box-shadow:inset 0 0 0 4px #fff; }
                #timer-box.warning { background:linear-gradient(135deg,#ef4444,#dc2626) !important; animation: pulse 1s infinite; }
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
            </style>
        `;

        // Timer logic
        let remaining = remainingMs;
        const timerEl = container.querySelector('#timer-box');
        const answeredEl = container.querySelector('#answered-count');

        timerInterval = setInterval(async () => {
            remaining -= 1000;
            if (remaining <= 0) {
                clearInterval(timerInterval);
                timerEl.textContent = '00:00';
                UI.toast('انتهى وقت الاختبار! يتم التسليم التلقائي...', 'error');
                await submitAnswers(true);
                return;
            }
            timerEl.textContent = formatTime(remaining);
            if (remaining <= 5 * 60 * 1000) timerEl.classList.add('warning');
        }, 1000);

        // Answer selection
        container.querySelectorAll('.exam-option').forEach(label => {
            label.onclick = () => {
                const qId = label.dataset.q;
                const key = label.dataset.key;
                answers[qId] = key;
                // Update UI
                const siblings = container.querySelectorAll(`.exam-option[data-q="${qId}"]`);
                siblings.forEach(s => s.classList.remove('selected'));
                label.classList.add('selected');
                // Update count
                if (answeredEl) answeredEl.textContent = `أجبت على ${answeredCount()}/${totalQ}`;
                // Highlight card as answered
                const card = container.querySelector(`#q-card-${qId}`);
                if (card) card.style.borderColor = '#10b981';
            };
        });

        // Tab switch detection
        document.addEventListener('visibilitychange', () => {
            const warningEl = container.querySelector('#tab-warning');
            if (document.hidden && warningEl) {
                warningEl.style.display = 'block';
            }
        });

        // Submit button
        const submitBtn = container.querySelector('#submit-exam-btn');
        if (submitBtn) {
            submitBtn.onclick = async () => {
                const unanswered = totalQ - answeredCount();
                if (unanswered > 0) {
                    const confirmed = await UI.confirm(`لم تجب على ${unanswered} سؤال بعد. هل تريد التسليم الآن؟`);
                    if (!confirmed) return;
                }
                await submitAnswers(false);
            };
        }

        async function submitAnswers(auto = false) {
            clearInterval(timerInterval);
            const btn = container.querySelector('#submit-exam-btn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i> جاري التسليم...'; }
            try {
                const res = await api.submitExam(examId, { answers });
                if (res.success) {
                    UI.toast(auto ? 'تم التسليم التلقائي ✅' : 'تم التسليم بنجاح ✅');
                    setTimeout(() => window.router.navigate(`/exam/${examId}/result`), 1200);
                } else {
                    UI.toast(res.error || 'فشل التسليم', 'error');
                }
            } catch (e) {
                UI.toast(e.message || 'خطأ في الشبكة', 'error');
            }
        }

    } catch (e) {
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;">
                <div class="card" style="max-width:500px;margin:2rem auto;padding:3rem;border-radius:20px;">
                    <i class="ph ph-warning-circle" style="font-size:4rem;color:#ef4444;"></i>
                    <h2 style="margin-top:1rem;">فشل تحميل الاختبار</h2>
                    <p style="color:var(--text-muted);">${e.message}</p>
                    <button class="btn btn-primary" data-path="/exams" style="margin-top:1.5rem;height:48px;padding:0 2rem;border-radius:14px;">رجوع</button>
                </div>
            </div>`;
    }

    return container;
}
