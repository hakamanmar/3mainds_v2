/* ExamCreatePage.js - 3Minds Platform - MCQ Exam Creation */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

export default async function ExamCreatePage(params) {
    const user = auth.getUser();
    const container = document.createElement('div');
    container.className = 'fade-in';

    const allowed = ['teacher', 'super_admin', 'section_admin', 'head_dept'];
    if (!user || !allowed.includes(user.role)) {
        window.router.navigate('/home');
        return container;
    }

    // Load subjects for this teacher / admin
    let subjects = [];
    try {
        const res = await api.getSubjects();
        subjects = res?.subjects || res || [];
    } catch (e) {
        console.error('Could not load subjects', e);
    }

    let questions = [];

    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding: 2rem 1rem;">
            <div class="page-header" style="margin-bottom:2rem;">
                <button class="btn btn-ghost" data-path="/exams" style="margin-bottom:1rem;">
                    <i class="ph ph-arrow-right"></i> رجوع
                </button>
                <h1 style="display:flex;align-items:center;gap:12px;">
                    <span style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;display:flex;align-items:center;justify-content:center;">
                        <i class="ph-fill ph-exam" style="color:#fff;font-size:1.5rem;"></i>
                    </span>
                    إنشاء اختبار جديد
                </h1>
                <p style="color:var(--text-muted);">أضف اختباراً من نوع اختيار متعدد (MCQ) لطلابك</p>
            </div>

            <!-- Exam Info Card -->
            <div class="card" style="padding:1.5rem; margin-bottom:1.5rem; border-radius:20px;">
                <h3 style="margin-bottom:1.5rem; color:var(--text-main); display:flex;align-items:center;gap:8px;">
                    <i class="ph ph-info" style="color:#6366f1;"></i> معلومات الاختبار
                </h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label class="form-label">عنوان الاختبار *</label>
                        <input id="exam-title" class="form-control" placeholder="مثال: اختبار منتصف الفصل..." style="height:50px;font-size:1.1rem;" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">المادة الدراسية *</label>
                        <select id="exam-subject" class="form-control" style="height:50px;">
                            <option value="">-- اختر المادة --</option>
                            ${subjects.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">مدة الاختبار (بالدقائق) *</label>
                        <input id="exam-duration" type="number" class="form-control" value="60" min="5" max="300" style="height:50px;font-size:1.1rem;" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">وقت إغلاق الاختبار (بالدقائق من الآن) *</label>
                        <input id="exam-closing" type="number" class="form-control" value="120" min="1" max="10000" style="height:50px;font-size:1.1rem;" />
                        <small style="color:var(--text-muted);">بعد هذه المدة من الآن، سيتم إغلاق الاختبار ولن يتمكن أي طالب جديد من الدخول.</small>
                    </div>
                </div>
            </div>

            <!-- Questions Section -->
            <div class="card" style="padding:1.5rem; margin-bottom:1.5rem; border-radius:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                    <h3 style="color:var(--text-main);display:flex;align-items:center;gap:8px;margin:0;">
                        <i class="ph ph-list-numbers" style="color:#6366f1;"></i>
                        الأسئلة (<span id="q-count">0</span>)
                    </h3>
                    <button id="add-question-btn" class="btn btn-primary" style="border-radius:12px;">
                        <i class="ph-bold ph-plus"></i> إضافة سؤال
                    </button>
                </div>
                <div id="questions-container">
                    <div style="text-align:center;padding:3rem;color:var(--text-muted);background:var(--surface-2);border-radius:16px;border:2px dashed var(--border);">
                        <i class="ph ph-exam" style="font-size:3rem;opacity:0.2;"></i>
                        <p style="margin-top:1rem;">اضغط "إضافة سؤال" لبدء إنشاء الاختبار</p>
                    </div>
                </div>
            </div>

            <!-- Submit -->
            <div style="display:flex;justify-content:flex-end;gap:1rem;">
                <button data-path="/exams" class="btn btn-ghost" style="height:50px;padding:0 2rem;">إلغاء</button>
                <button id="submit-exam-btn" class="btn btn-primary" style="height:50px;padding:0 2.5rem;font-size:1.1rem;border-radius:14px;">
                    <i class="ph-bold ph-check-circle"></i> نشر الاختبار
                </button>
            </div>
        </div>
        <style>
            .question-card { border:1px solid var(--border); border-radius:16px; padding:1.5rem; margin-bottom:1rem; background:var(--surface); position:relative; }
            .question-card .q-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem; }
            .q-number { width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:0.9rem; }
            .option-row { display:grid; grid-template-columns:40px 1fr; gap:10px; align-items:center; margin-bottom:10px; }
            .option-label { width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;flex-shrink:0; }
            .opt-a { background:#dbeafe;color:#1d4ed8; }
            .opt-b { background:#dcfce7;color:#15803d; }
            .opt-c { background:#fef3c7;color:#b45309; }
            .opt-d { background:#fce7f3;color:#be185d; }
            .correct-select { display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border); }
            .correct-btn { padding:6px 16px;border-radius:8px;border:2px solid var(--border);background:var(--surface-2);cursor:pointer;font-weight:700;transition:all 0.2s;font-size:0.85rem;color:var(--text-main); }
            .correct-btn.active { border-color:#10b981;background:#ecfdf5;color:#10b981; }
            .delete-q-btn { background:#fef2f2;color:#ef4444;border:none;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s; }
            .delete-q-btn:hover { background:#ef4444;color:#fff; }
        </style>
    `;

    let qIndex = 0;

    function updateQCount() {
        const el = container.querySelector('#q-count');
        if (el) el.textContent = questions.length;
    }

    function renderQuestion(idx, q) {
        return `
            <div class="question-card" data-qidx="${idx}">
                <div class="q-header">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="q-number">${idx + 1}</div>
                        <span style="font-weight:700;color:var(--text-main);">سؤال #${idx + 1}</span>
                    </div>
                    <button class="delete-q-btn" data-delete-q="${idx}" title="حذف السؤال">
                        <i class="ph-bold ph-trash"></i>
                    </button>
                </div>
                <div class="form-group" style="margin-bottom:1rem;">
                    <input class="form-control q-text" data-qidx="${idx}" placeholder="نص السؤال..." value="${q.question_text || ''}" style="font-weight:600;" />
                </div>
                <div class="option-row">
                    <div class="option-label opt-a">A</div>
                    <input class="form-control q-opt" data-qidx="${idx}" data-opt="option_a" placeholder="الخيار الأول..." value="${q.option_a || ''}" style="height:44px;" />
                </div>
                <div class="option-row">
                    <div class="option-label opt-b">B</div>
                    <input class="form-control q-opt" data-qidx="${idx}" data-opt="option_b" placeholder="الخيار الثاني..." value="${q.option_b || ''}" style="height:44px;" />
                </div>
                <div class="option-row">
                    <div class="option-label opt-c">C</div>
                    <input class="form-control q-opt" data-qidx="${idx}" data-opt="option_c" placeholder="الخيار الثالث..." value="${q.option_c || ''}" style="height:44px;" />
                </div>
                <div class="option-row">
                    <div class="option-label opt-d">D</div>
                    <input class="form-control q-opt" data-qidx="${idx}" data-opt="option_d" placeholder="الخيار الرابع..." value="${q.option_d || ''}" style="height:44px;" />
                </div>
                <div>
                    <div style="font-size:0.85rem;font-weight:700;color:#64748b;margin-bottom:8px;">الإجابة الصحيحة:</div>
                    <div class="correct-select">
                        ${['a','b','c','d'].map((k, i) => `
                            <button class="correct-btn ${q.correct_answer === k ? 'active' : ''}" data-qidx="${idx}" data-correct="${k}">
                                ${['A','B','C','D'][i]}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function rerenderQuestions() {
        const qc = container.querySelector('#questions-container');
        if (!qc) return;
        if (questions.length === 0) {
            qc.innerHTML = `
                <div style="text-align:center;padding:3rem;color:var(--text-muted);background:var(--surface-2);border-radius:16px;border:2px dashed var(--border);">
                    <i class="ph ph-exam" style="font-size:3rem;opacity:0.2;"></i>
                    <p style="margin-top:1rem;">اضغط "إضافة سؤال" لبدء إنشاء الاختبار</p>
                </div>`;
        } else {
            qc.innerHTML = questions.map((q, i) => renderQuestion(i, q)).join('');
        }
        updateQCount();
        bindQuestionEvents();
    }

    function bindQuestionEvents() {
        // Text inputs
        container.querySelectorAll('.q-text').forEach(inp => {
            inp.oninput = () => {
                const idx = parseInt(inp.dataset.qidx);
                questions[idx].question_text = inp.value;
            };
        });
        container.querySelectorAll('.q-opt').forEach(inp => {
            inp.oninput = () => {
                const idx = parseInt(inp.dataset.qidx);
                const opt = inp.dataset.opt;
                questions[idx][opt] = inp.value;
            };
        });
        // Correct answer buttons
        container.querySelectorAll('.correct-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.qidx);
                const key = btn.dataset.correct;
                questions[idx].correct_answer = key;
                // Update UI
                const siblings = container.querySelectorAll(`.correct-btn[data-qidx="${idx}"]`);
                siblings.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
        // Delete question
        container.querySelectorAll('[data-delete-q]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.deleteQ);
                questions.splice(idx, 1);
                rerenderQuestions();
            };
        });
    }

    // Add Question button
    container.querySelector('#add-question-btn').onclick = () => {
        questions.push({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a' });
        rerenderQuestions();
        // Scroll to new question
        const cards = container.querySelectorAll('.question-card');
        if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Submit
    container.querySelector('#submit-exam-btn').onclick = async () => {
        const title = container.querySelector('#exam-title').value.trim();
        const subject_id = container.querySelector('#exam-subject').value;
        const duration_minutes = parseInt(container.querySelector('#exam-duration').value);
        const closing_after_minutes = parseInt(container.querySelector('#exam-closing').value || 0);

        if (!title) { UI.toast('يرجى إدخال عنوان الاختبار', 'error'); return; }
        if (!subject_id) { UI.toast('يرجى اختيار المادة', 'error'); return; }
        if (questions.length === 0) { UI.toast('يرجى إضافة سؤال واحد على الأقل', 'error'); return; }

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.question_text.trim()) { UI.toast(`سؤال #${i + 1}: يرجى إدخال نص السؤال`, 'error'); return; }
            if (!q.option_a.trim() || !q.option_b.trim() || !q.option_c.trim() || !q.option_d.trim()) {
                UI.toast(`سؤال #${i + 1}: يرجى ملء جميع الخيارات`, 'error'); return;
            }
        }

        const btn = container.querySelector('#submit-exam-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner"></i> جاري الحفظ...';

        try {
            const res = await api.createExam({ title, subject_id, duration_minutes, closing_after_minutes, questions });
            if (res.success) {
                UI.toast('تم نشر الاختبار بنجاح ✅');
                window.router.navigate('/exams');
            } else {
                UI.toast(res.error || 'فشل في الحفظ', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="ph-bold ph-check-circle"></i> نشر الاختبار';
            }
        } catch (e) {
            UI.toast(e.message || 'خطأ في الشبكة', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-check-circle"></i> نشر الاختبار';
        }
    };

    return container;
}
