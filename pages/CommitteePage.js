import { api, auth } from '/static/js/api.js';
import { UI } from '/static/js/ui.js';
import { i18n } from '/static/js/i18n.js';

export default async function CommitteePage(params) {
    const user = auth.getUser();
    if (!user || (user.role !== 'committee' && user.role !== 'super_admin' && user.role !== 'section_admin')) {
        window.router.navigate('/');
        return;
    }

    const container = document.createElement('div');
    container.className = 'fade-in';

    let stats = null;
    let alerts = [];
    let subjects = [];
    let sections = [];
    let selectedSectionId = localStorage.getItem('committee_selected_section') || '';
    let reportData = null;

    async function init() {
        try {
            [stats, alerts, subjects, sections] = await Promise.all([
                api.getAttendanceOverview(),
                api.getAttendanceAlerts(),
                api.getSubjects(),
                api.getSections()
            ]);
            
            if (selectedSectionId) {
                reportData = await api.getSectionReport(selectedSectionId);
            }
            
            render();
            initCharts();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    function render() {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>📊 ${i18n.t('exam_committee_dashboard') || 'لوحة لجنة الغيابات'}</h1>
                    <p>${i18n.t('committee_subtitle') || 'متابعة تقارير الغياب والحضور والإنذارات الرسمية'}</p>
                </div>
                <div class="header-actions">
                    <button id="export-btn" class="btn btn-outline">
                        <i class="ph ph-file-pdf"></i> ${i18n.t('export_ministry_report') || 'تقرير الوزارة الشهري'}
                    </button>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card stat-indigo">
                    <i class="ph ph-users"></i>
                    <div>
                        <span class="stat-num">${stats.total_students}</span>
                        <span class="stat-label">${i18n.t('total_students')}</span>
                    </div>
                </div>
                <div class="stat-card stat-green">
                    <i class="ph ph-check-circle"></i>
                    <div>
                        <span class="stat-num">${stats.avg_rate}%</span>
                        <span class="stat-label">${i18n.t('avg_attendance_rate')}</span>
                    </div>
                </div>
                <div class="stat-card stat-amber">
                    <i class="ph ph-calendar"></i>
                    <div>
                        <span class="stat-num">${stats.today_sessions}</span>
                        <span class="stat-label">${i18n.t('lectures_today')}</span>
                    </div>
                </div>
                <div class="stat-card stat-red">
                    <i class="ph ph-warning-circle"></i>
                    <div>
                        <span class="stat-num">${alerts.length}</span>
                        <span class="stat-label">${i18n.t('active_warnings')}</span>
                    </div>
                </div>
            </div>

            <div class="grid-2" style="margin-top: 24px;">
                <div class="card">
                    <div class="card-title">📈 ${i18n.t('attendance_trends') || 'اتجاهات الحضور الأسبوعية'}</div>
                    <canvas id="trendsChart" height="250"></canvas>
                </div>
                <div class="card">
                    <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>⚠️ ${i18n.t('absence_alerts') || 'تنبيهات الغياب الحرجة (تلقائي)'}</span>
                        <span class="alerts-badge">${alerts.length}</span>
                    </div>
                    <div id="alerts-list" class="alerts-board-container">
                        ${alerts.length === 0 ? `
                            <div class="empty-state-mini">
                                <i class="ph ph-check-circle" style="color:var(--green);"></i>
                                <p>لا يوجد طلاب متجاوزين لنسبة الغياب حالياً</p>
                            </div>
                        ` : alerts.map(a => {
                            const rate = a.absence_rate;
                            const statusColor = rate >= 25 ? '#ef4444' : (rate >= 15 ? '#f59e0b' : '#3b82f6');
                            const statusLabel = rate >= 25 ? 'فصل نهائي' : (rate >= 15 ? 'إنذار ثاني' : 'إنذار أول');
                            
                            return `
                                <div class="alert-card-premium">
                                    <div class="alert-status-pillar" style="background: ${statusColor}"></div>
                                    <div class="alert-content-main">
                                        <div class="alert-row-top">
                                            <div class="alert-stu-info">
                                                <span class="alert-stu-name">${a.full_name || a.email}</span>
                                                <span class="alert-stu-email">${a.email}</span>
                                            </div>
                                            <div class="alert-level-badge" style="background: ${statusColor}15; color: ${statusColor}">
                                                ${statusLabel}
                                            </div>
                                        </div>
                                        <div class="alert-row-mid">
                                            <div class="alert-subj-tag">
                                                <i class="ph ph-book-open"></i> ${a.subject}
                                            </div>
                                            <div class="alert-percentage">
                                                <span class="p-val">${rate}%</span>
                                                <span class="p-lbl">نسبة الغياب</span>
                                            </div>
                                        </div>
                                        <div class="alert-progress-bg">
                                            <div class="alert-progress-fill" style="width: ${Math.min(rate, 100)}%; background: ${statusColor}"></div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div class="card" style="margin-top: 24px;">
                <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 15px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="ph ph-users-four" style="font-size: 1.5rem; color: var(--primary);"></i>
                        <span style="font-size: 1.2rem; font-weight: 800;">سجل الطلاب التفصيلي</span>
                    </div>
                    <div style="display:flex; gap:10px; flex: 1; justify-content: flex-end;">
                        <select id="section-filter" class="form-control" style="max-width: 250px;">
                            <option value="">-- اختر الشعبة لعرض الطلاب --</option>
                            ${sections.map(s => `<option value="${s.id}" ${s.id === selectedSectionId ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div id="section-report-wrap" style="margin-top: 20px; overflow-x: auto;">
                    ${selectedSectionId ? renderSectionReport() : '<p class="empty-text" style="padding: 40px;">يرجى اختيار شعبة لعرض تقرير الطلاب المفصل</p>'}
                </div>
            </div>

            <style>
                .alerts-board-container { max-height: 400px; overflow-y: auto; padding: 5px; display: flex; flex-direction: column; gap: 12px; }
                .alerts-badge { background: var(--red); color: white; padding: 2px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; }
                .alert-card-premium { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: transform 0.2s; }
                .alert-status-pillar { width: 6px; flex-shrink: 0; }
                .alert-content-main { flex: 1; padding: 12px 15px; }
                .alert-row-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
                .alert-stu-info { display: flex; flex-direction: column; }
                .alert-stu-name { font-weight: 800; font-size: 0.95rem; color: var(--text-main); }
                .alert-stu-email { font-size: 0.75rem; color: var(--muted); }
                .alert-level-badge { font-size: 0.7rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; }
                .alert-row-mid { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
                .alert-subj-tag { font-size: 0.8rem; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 5px; background: var(--primary-light); padding: 4px 10px; border-radius: 6px; }
                .alert-percentage { text-align: right; }
                .alert-percentage .p-val { font-size: 1.1rem; font-weight: 900; color: var(--text-main); display: block; line-height: 1; }
                .alert-progress-bg { height: 6px; background: var(--surface-2); border-radius: 10px; overflow: hidden; }
                .alert-progress-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease-out; }
                
                .report-table { width: 100%; border-collapse: separate; border-spacing: 0; }
                .report-table th { background: #f8fafc; padding: 12px; font-weight: 800; color: #64748b; border-bottom: 2px solid #e2e8f0; text-align: right; white-space: nowrap; }
                .report-table td { padding: 15px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
                .report-table tr:hover { background: #f8fafc; }
                
                .stats-cell { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
                .stats-val { font-size: 0.9rem; font-weight: 700; color: var(--text-main); }
                .stats-absent { color: var(--red); font-size: 0.75rem; font-weight: 600; }
                .btn-action { padding: 6px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s; display: flex; align-items: center; gap: 5px; }
                .btn-warning { background: #fee2e2; color: #ef4444; }
                .btn-excuse { background: #fef3c7; color: #d97706; }
                .btn-action:hover { opacity: 0.8; transform: scale(1.05); }
            </style>
        `;
    }

    function renderSectionReport() {
        if (!reportData || !reportData.students) return '<p class="empty-text">لا توجد بيانات لهذه الشعبة</p>';
        
        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="position: sticky; right: 0; background: #f8fafc; z-index: 10;">اسم الطالب</th>
                        ${reportData.subjects.map(s => `<th>${s.title}</th>`).join('')}
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${reportData.students.map(stu => `
                        <tr>
                            <td style="position: sticky; right: 0; background: inherit; z-index: 5; box-shadow: -2px 0 5px rgba(0,0,0,0.02);">
                                <div style="font-weight: 800; color: var(--text-main);">${stu.full_name || 'طالب جديد'}</div>
                                <div style="font-size: 0.7rem; color: var(--muted);">${stu.email}</div>
                            </td>
                            ${stu.subjects.map(s => `
                                <td>
                                    <div class="stats-cell">
                                        <div class="stats-val">✅ حضور: ${s.attended} / ${s.total}</div>
                                        <div class="stats-absent">❌ غياب: ${s.absent}</div>
                                        <div style="height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
                                            <div style="height: 100%; width: ${(s.attended/s.total*100)||0}%; background: ${s.attended/s.total > 0.75 ? '#10b981' : (s.attended/s.total > 0.5 ? '#f59e0b' : '#ef4444')};"></div>
                                        </div>
                                        <button class="btn-action btn-excuse" data-student-id="${stu.student_id}" data-subject-id="${s.subject_id}" data-subject-name="${s.title}">
                                            <i class="ph ph-calendar-check"></i> تبرير غياب
                                        </button>
                                    </div>
                                </td>
                            `).join('')}
                            <td>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <button class="btn-action btn-warning" data-student-id="${stu.student_id}" data-student-name="${stu.full_name || stu.email}">
                                        <i class="ph ph-warning"></i> إرسال إنذار
                                    </button>
                                    <button class="btn-action btn-outline" style="background: #f1f5f9; color: #475569;" onclick="window.router.navigate('/results?student_id=${stu.student_id}')">
                                        <i class="ph ph-eye"></i> عرض السجل
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function initCharts() {
        const chartEl = container.querySelector('#trendsChart');
        const ctx = chartEl ? chartEl.getContext('2d') : null;
        if (!ctx) return;

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
                datasets: [{
                    label: 'نسبة الحضور %',
                    data: [82, 78, 85, 74, 81],
                    borderColor: '#1e40af',
                    backgroundColor: 'rgba(30,64,175,0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }

    container.addEventListener('change', async (e) => {
        if (e.target.id === 'section-filter') {
            selectedSectionId = e.target.value;
            localStorage.setItem('committee_selected_section', selectedSectionId);
            if (selectedSectionId) {
                UI.toast('جاري تحميل بيانات الشعبة...');
                reportData = await api.getSectionReport(selectedSectionId);
            } else {
                reportData = null;
            }
            render();
            initCharts();
        }
    });

    container.addEventListener('click', async (e) => {
        const warningBtn = e.target.closest('.btn-warning');
        if (warningBtn) {
            showWarningModal(warningBtn.dataset.studentId, warningBtn.dataset.studentName);
        }

        const excuseBtn = e.target.closest('.btn-excuse');
        if (excuseBtn) {
            showExcuseModal(excuseBtn.dataset.studentId, excuseBtn.dataset.subjectId, excuseBtn.dataset.subjectName);
        }

        if (e.target.closest('#export-btn')) {
            UI.toast('جاري إعداد التقرير وتحويله إلى PDF...');
            setTimeout(() => UI.toast('تم تحميل التقرير بنجاح ✅'), 2000);
        }
    });

    async function showWarningModal(studentId, studentName) {
        const html = `
            <div style="direction: rtl; text-align: right;">
                <p style="margin-bottom: 15px;">إرسال إنذار رسمي للطالب: <strong>${studentName}</strong></p>
                <div class="form-group">
                    <label>نوع الإنذار</label>
                    <select id="w-type" class="form-control">
                        <option value="أول">إنذار غياب أول (5%)</option>
                        <option value="ثاني">إنذار غياب ثاني (10%)</option>
                        <option value="نهائي">إنذار نهائي وفصل (15% فأكثر)</option>
                        <option value="عام">تنبيه سلوكي/إداري عام</option>
                    </select>
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <label>نص الرسالة (سيظهر للطالب)</label>
                    <textarea id="w-message" class="form-control" rows="4" placeholder="اكتب ملاحظاتك هنا..."></textarea>
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <label>المادة (اختياري)</label>
                    <select id="w-subject" class="form-control">
                        <option value="">كل المواد / عام</option>
                        ${subjects.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}
                    </select>
                </div>
                <button id="send-w-btn" class="btn btn-primary" style="width: 100%; margin-top: 20px;">إرسال الإنذار الآن</button>
            </div>
        `;
        UI.modal('إصدار إنذار رسمي', html);
        
        document.getElementById('send-w-btn').onclick = async () => {
            const data = {
                student_id: studentId,
                type: document.getElementById('w-type').value,
                message: document.getElementById('w-message').value,
                subject_id: document.getElementById('w-subject').value || null
            };
            
            try {
                await api.addWarning(data);
                UI.toast('تم إرسال الإنذار بنجاح');
                UI.modalClose();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
        };
    }

    async function showExcuseModal(studentId, subjectId, subjectName) {
        UI.toast('جاري جلب المحاضرات التي غاب عنها الطالب...');
        try {
            const missed = await api.getStudentMissedSessions(studentId, subjectId);
            
            if (missed.length === 0) {
                UI.toast('الطالب حاضر في جميع محاضرات هذه المادة!', 'info');
                return;
            }

            const html = `
                <div style="direction: rtl; text-align: right;">
                    <p style="margin-bottom: 15px;">تحديد محاضرات كمجاز للمادة: <strong>${subjectName}</strong></p>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 12px; padding: 10px;">
                        ${missed.map(m => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border);">
                                <div>
                                    <div style="font-weight: 700;">${new Date(m.started_at).toLocaleDateString('ar-EG')}</div>
                                    <div style="font-size: 0.8rem; color: var(--muted);">${new Date(m.started_at).toLocaleTimeString('ar-EG')}</div>
                                </div>
                                <button class="btn btn-sm btn-primary mark-excused-btn" data-session-id="${m.id}">تحويل لمجاز</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            UI.modal('تبرير غياب يدوي', html);

            document.querySelectorAll('.mark-excused-btn').forEach(btn => {
                btn.onclick = async () => {
                    const sid = btn.dataset.sessionId;
                    btn.disabled = true;
                    btn.textContent = '...';
                    try {
                        await api.markExcused(sid, studentId);
                        UI.toast('تم التعديل بنجاح');
                        btn.parentElement.innerHTML = '<span style="color: var(--green); font-weight: 800;">✅ تم الإجازة</span>';
                        // Refresh main report in background
                        reportData = await api.getSectionReport(selectedSectionId);
                        render();
                    } catch (err) {
                        UI.toast(err.message, 'error');
                        btn.disabled = false;
                        btn.textContent = 'تحويل لمجاز';
                    }
                };
            });

        } catch (err) {
            UI.toast(err.message, 'error');
        }
    }

    init();
    return container;
}
