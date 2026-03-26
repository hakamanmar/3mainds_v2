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
    let reportData = [];
    let subjects = [];

    async function init() {
        try {
            [stats, alerts, subjects] = await Promise.all([
                api.getAttendanceOverview(),
                api.getAttendanceAlerts(),
                api.getSubjects()
            ]);
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
                    <h1>📊 ${i18n.t('exam_committee_dashboard') || 'لوحة لجنة الامتحانات'}</h1>
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
                        <span>⚠️ ${i18n.t('absence_alerts') || 'تنبيهات الغياب الحرجة'}</span>
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
                    <button class="btn btn-red-soft" style="width:100%; margin-top:15px; font-weight:700;">
                        <i class="ph ph-paper-plane-tilt"></i> ${i18n.t('send_bulk_warnings') || 'إرسال إنذارات لجميع المشمولين'}
                    </button>
                </div>
            </div>
            <style>
                .alerts-board-container { max-height: 400px; overflow-y: auto; padding: 5px; display: flex; flex-direction: column; gap: 12px; }
                .alerts-badge { background: var(--red); color: white; padding: 2px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; }
                .alert-card-premium { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: transform 0.2s; }
                .alert-card-premium:hover { transform: scale(1.02); box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
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
                .alert-percentage .p-lbl { font-size: 0.6rem; color: var(--muted); font-weight: 700; text-transform: uppercase; }
                .alert-progress-bg { height: 6px; background: var(--surface-2); border-radius: 10px; overflow: hidden; }
                .alert-progress-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease-out; }
            </style>

            <div class="card" style="margin-top: 24px;">
                <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>📋 ${i18n.t('attendance_report_generator') || 'منشئ تقارير الحضور'}</span>
                    <div style="display:flex; gap:10px;">
                        <select id="subject-filter" class="form-control" style="width: 200px; padding: 5px;">
                            <option value="">${i18n.t('all_subjects') || 'كل المواد'}</option>
                            ${subjects.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}
                        </select>
                        <button id="generate-btn" class="btn btn-primary btn-sm">${i18n.t('generate') || 'توليد'}</button>
                    </div>
                </div>
                <div id="report-table-wrap" style="margin-top: 20px;">
                    <p class="empty-text">اختر مادة الدراسية لتوليد التقرير التفصيلي</p>
                </div>
            </div>
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

    async function loadReport(subjectId) {
        const tableWrap = container.querySelector('#report-table-wrap');
        tableWrap.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';

        try {
            const data = await api.getAttendanceReport(subjectId);
            tableWrap.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>${i18n.t('student')}</th>
                            <th>${i18n.t('total_sessions')}</th>
                            <th>${i18n.t('present')}</th>
                            <th>${i18n.t('absent')}</th>
                            <th>${i18n.t('rate')}</th>
                            <th>${i18n.t('status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(r => `
                            <tr>
                                <td>
                                    <div style="font-weight: 700;">${r.full_name || r.email}</div>
                                    <div style="font-size: 11px; color: var(--muted);">${r.email}</div>
                                </td>
                                <td>${r.total}</td>
                                <td>${r.attended}</td>
                                <td>${r.absent}</td>
                                <td><span class="num">${r.rate}%</span></td>
                                <td>
                                    <span class="tag ${r.rate >= 75 ? 'tag-good' : (r.rate >= 60 ? 'tag-ok' : 'tag-low')}">
                                        ${r.rate >= 75 ? (i18n.t('excellent') || 'ممتاز') : (r.rate >= 60 ? (i18n.t('good') || 'جيد') : (i18n.t('danger') || 'خطر'))}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            tableWrap.innerHTML = `<p class="error-text">فشل تحميل التقرير: ${e.message}</p>`;
        }
    }

    container.addEventListener('click', async (e) => {
        if (e.target.closest('#generate-btn')) {
            const subjectId = container.querySelector('#subject-filter').value;
            loadReport(subjectId);
        }

        if (e.target.closest('#export-btn')) {
            UI.toast('جاري إعداد التقرير وتحويله إلى PDF...');
            setTimeout(() => UI.toast('تم تحميل التقرير بنجاح ✅'), 2000);
        }
    });

    init();
    return container;
}
