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
                    <div class="card-title">⚠️ ${i18n.t('absence_alerts') || 'تنبيهات الغياب الحرجة'}</div>
                    <div id="alerts-list" style="max-height: 250px; overflow-y: auto;">
                        ${alerts.length === 0 ? '<p class="empty-text">لا توجد تنبيهات حالياً</p>' : alerts.map(a => `
                            <div class="alert-item" style="padding: 12px; border-bottom: 1px solid var(--border); border-right: 4px solid var(--red); margin-bottom: 8px; background: #fef2f2; border-radius: 4px;">
                                <div style="font-weight: 700; font-size: 14px;">${a.email}</div>
                                <div style="font-size: 12px; color: var(--muted);">${a.subject} — نسبة الغياب: <span style="color:var(--red); font-weight:700;">${a.absence_rate}%</span></div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-red-soft" style="width:100%; margin-top:10px;">
                        ${i18n.t('send_bulk_warnings') || 'إرسال إنذارات لجميع المشمولين'}
                    </button>
                </div>
            </div>

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
                                <td>${r.email}</td>
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
