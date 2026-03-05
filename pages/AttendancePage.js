import { api, auth } from '/static/js/api.js';
import { UI } from '/static/js/ui.js';
import { i18n } from '/static/js/i18n.js';

export default async function AttendancePage(params) {
    const user = auth.getUser();
    // Restriction: Only Super Admin and Teacher
    if (!user || (user.role !== 'teacher' && user.role !== 'super_admin')) {
        window.router.navigate('/');
        return;
    }

    const container = document.createElement('div');
    container.className = 'fade-in';

    let activeSession = null;
    let qrGenerator = null;
    let qrInterval = null;
    let liveInterval = null;
    let subjects = [];
    let sections = [];
    let history = [];
    let selectedSectionId = user.section_id;
    try { selectedSectionId = selectedSectionId || localStorage.getItem('selected_section'); } catch (e) { }

    async function init() {
        sections = await api.getSections();
        if (selectedSectionId) {
            subjects = await api.getSubjects(selectedSectionId);
        } else if (user.role !== 'super_admin') {
            subjects = await api.getSubjects();
        }
        await loadHistory();
        render();
    }

    async function loadHistory() {
        history = await api.getAttendanceSessions(user.id);
    }

    function render() {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>${i18n.t('attendance_mgmt') || 'إدارة الحضور'}</h1>
                    <p>${i18n.t('attendance_subtitle') || 'نظام الحضور الذكي عبر QR code'}</p>
                </div>
            </div>

            <div id="attendance-content">
                ${activeSession ? renderActiveSession() : renderStartSession()}
                ${!activeSession ? renderHistorySection() : ''}
            </div>
        `;

        if (activeSession) {
            setupQR();
            startLiveTracker();
        }
    }

    function renderStartSession() {
        const showSectionSelect = user.role === 'super_admin';
        return `
            <div class="card" style="max-width: 600px; margin: 0 auto;">
                <h3 style="margin-bottom: 20px;">🎓 ${i18n.t('start_lecture') || 'بدء محاضرة جديدة'}</h3>
                
                ${showSectionSelect ? `
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label style="font-weight: 700; display: block; margin-bottom: 0.5rem; color: var(--blue);">${i18n.t('select_section') || 'اختر القسم الدراسي'}</label>
                    <select id="section-select" class="form-control" style="border: 2px solid var(--blue-light);">
                        <option value="">-- ${i18n.t('choose_section') || 'اختر القسم'} --</option>
                        ${sections.map(s => `<option value="${s.id}" ${s.id === selectedSectionId ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
                ` : ''}

                <div class="form-group">
                    <label>${i18n.t('select_subject') || 'اختر المادة'}</label>
                    <select id="subject-select" class="form-control" ${subjects.length === 0 ? 'disabled' : ''}>
                        <option value="">-- ${subjects.length === 0 ? (i18n.t('no_subjects_found') || 'لا توجد مواد لهذا القسم') : (i18n.t('choose_subject') || 'اختر المادة الدراسية')} --</option>
                        ${subjects.map(s => `<option value="${s.id}">${s.title} (${s.code})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>${i18n.t('refresh_rate') || 'معدل تحديث الرمز (ثواني)'}</label>
                    <select id="interval-select" class="form-control">
                        <option value="5">5 ثوانٍ</option>
                        <option value="10" selected>10 ثوانٍ</option>
                        <option value="15">15 ثانية</option>
                        <option value="30">30 ثانية</option>
                    </select>
                </div>
                <button id="start-btn" class="btn btn-primary" style="width: 100%; margin-top: 10px;" ${subjects.length === 0 ? 'disabled' : ''}>
                    <i class="ph ph-play"></i> ${i18n.t('start_attendance') || 'بدء تسجيل الحضور'}
                </button>
            </div>
        `;
    }

    function renderActiveSession() {
        return `
            <div class="attendance-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div class="card">
                    <div class="card-title">📲 ${i18n.t('dynamic_qr') || 'رمز QR الديناميكي'}</div>
                    <div class="qr-container-wrap" style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 20px;">
                        <div id="qr-display-box" style="padding: 15px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                            <div id="qr-canvas"></div>
                        </div>
                        <div class="countdown-wrap" style="display: flex; align-items: center; gap: 10px;">
                            <div id="timer-ring" style="width: 50px; height: 50px; border: 4px solid var(--blue-light); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--blue);">10</div>
                            <span style="font-size: 14px; color: var(--muted); font-weight: 600;">${i18n.t('seconds') || 'ثانية'}</span>
                        </div>
                        <p style="text-align: center; font-size: 13px; color: var(--muted);">
                            ${i18n.t('qr_instruction') || 'اعرض هذا الرمز للطلاب، يتجدد تلقائياً لمنع الغش'}
                        </p>
                        <div class="qr-actions" style="display: flex; gap: 10px; width: 100%;">
                            <button id="toggle-status-btn" class="btn ${activeSession.status === 'active' ? 'btn-red-soft' : 'btn-primary'}" style="flex: 1;">
                                <i class="ph ${activeSession.status === 'active' ? 'ph-pause' : 'ph-play'}"></i>
                                ${activeSession.status === 'active' ? 'إيقاف مؤقت' : 'فتح التسجيل'}
                            </button>
                            <button id="regenerate-btn" class="btn btn-outline" style="flex: 1;">
                                <i class="ph ph-arrows-clockwise"></i> ${i18n.t('refresh_now') || 'تجديد الرمز'}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>👥 ${i18n.t('live_attendance') || 'الحاضرون الآن'}</span>
                        <div class="live-badge" style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--green);">
                            <span class="live-dot" style="width: 8px; height: 8px; background: var(--green); border-radius: 50%; display: inline-block;"></span>
                            <span id="attendee-counter">0 / 0</span>
                        </div>
                    </div>
                    <div id="live-list" style="height: 350px; overflow-y: auto; margin-top: 15px;">
                        <div class="empty-state" style="padding: 40px 0;">
                            <i class="ph ph-users" style="font-size: 32px; color: var(--muted);"></i>
                            <p>${i18n.t('waiting_scans') || 'بانتظار مسح الطلاب للرمز...'}</p>
                        </div>
                    </div>
                    <button id="end-btn" class="btn btn-danger" style="width: 100%; margin-top: 15px;">
                        <i class="ph ph-stop"></i> ${i18n.t('end_lecture') || 'إنهاء المحاضرة وحفظ التقرير'}
                    </button>
                </div>
            </div>
        `;
    }

    function renderHistorySection() {
        return `
            <div class="card" style="margin-top: 3rem;">
                <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>📁 أرشيف محاضراتي (سجل الحضور)</span>
                    <span class="count-pill">${history.length}</span>
                </div>
                <div class="history-list" style="margin-top: 15px;">
                    ${history.length === 0 ? `<p class="empty-text">لا توجد محاضرات سابقة مسجلة.</p>` :
                history.map(s => `
                        <div class="history-item" data-id="${s.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); transition: background 0.2s; cursor: pointer;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div class="icon-indicator" style="width: 40px; height: 40px; background: #f3f4f6; color: #475569; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                    <i class="ph ph-folder-open"></i>
                                </div>
                                <div>
                                    <div style="font-weight: 700; color: var(--text-main);">${s.subject_title}</div>
                                    <div style="font-size: 13px; color: var(--muted);">${new Date(s.started_at).toLocaleString('ar-EG')}</div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 700; color: var(--blue); font-size: 1.1rem;">${s.attended} <span style="font-weight: 400; font-size: 0.8rem; color: var(--muted);">/ ${s.total_in_section}</span></div>
                                <div class="tag tag-ok">انتهت</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async function showSessionDetails(id) {
        const data = await api.getSessionDetails(id);
        const s = data.session;
        const html = `
            <div style="direction: rtl; text-align: right;">
                <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 2rem; border: 1px solid #e2e8f0;">
                    <h2 style="margin-bottom: 10px; color: var(--blue);"><i class="ph ph-bookmark-simple"></i> ${s.subject_title} (${s.subject_code})</h2>
                    <p><strong><i class="ph ph-user-circle"></i> مدرس المادة:</strong> ${s.professor_email}</p>
                    <p><strong><i class="ph ph-calendar-blank"></i> اليوم والتاريخ:</strong> ${new Date(s.started_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p><strong><i class="ph ph-clock"></i> وقت البدء:</strong> ${new Date(s.started_at).toLocaleTimeString('ar-EG')}</p>
                </div>
                
                <h3 style="margin-bottom: 1rem;"><i class="ph ph-users"></i> قائمة الطلاب الحاضرين (${data.attended.length})</h3>
                <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: #f1f5f9; position: sticky; top: 0;">
                            <tr>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0;">الطالب</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0;">وقت تسجيل الحضور</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0;">الأسلوب</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.attended.map(r => `
                                <tr>
                                    <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${r.email}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${new Date(r.scanned_at).toLocaleTimeString('ar-EG')}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;"><span class="tag tag-ok">${r.method === 'qr' ? 'بصمة QR' : 'يدوي'}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        UI.modal('تقرير المحاضرة بالتفصيل', html, null, { large: true });
    }

    function setupQR() {
        const qrCanvas = container.querySelector('#qr-canvas');
        if (!qrCanvas) return;

        qrGenerator = new QRCode(qrCanvas, {
            text: activeSession.token,
            width: 200,
            height: 200,
            colorDark: "#1e40af",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const timerEl = container.querySelector('#timer-ring');
        let remaining = activeSession.interval;

        qrInterval = setInterval(async () => {
            remaining--;
            if (timerEl) timerEl.textContent = remaining;

            if (remaining <= 0) {
                try {
                    const data = await api.getAttendanceQR(activeSession.session_id);
                    activeSession.token = data.token;
                    remaining = data.interval;
                    if (timerEl) timerEl.textContent = remaining;
                    if (activeSession.status === 'active') {
                        qrGenerator.clear();
                        qrGenerator.makeCode(data.token);
                    }
                } catch (e) {
                    console.error('QR refresh failed', e);
                }
            }
        }, 1000);

        container.querySelector('#regenerate-btn')?.addEventListener('click', async () => {
            const data = await api.getAttendanceQR(activeSession.session_id, true);
            activeSession.token = data.token;
            remaining = data.interval;
            if (timerEl) timerEl.textContent = remaining;
            qrGenerator.clear();
            qrGenerator.makeCode(data.token);
            UI.toast(i18n.t('qr_refreshed') || 'تم تجديد الرمز بنجاح');
        });
    }

    function startLiveTracker() {
        const listContainer = container.querySelector('#live-list');
        const counterEl = container.querySelector('#attendee-counter');

        const updateList = async () => {
            try {
                const data = await api.getLiveAttendance(activeSession.session_id);
                if (counterEl) counterEl.textContent = `${data.count} / ${data.total}`;

                if (data.attended.length > 0) {
                    listContainer.innerHTML = data.attended.map(r => `
                        <div class="attendance-row" style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid var(--border); background: #fff; margin-bottom: 5px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); animation: slideInUp 0.3s ease;">
                            <div class="user-avatar" style="width: 45px; height: 45px; border-radius: 12px; background: var(--blue-bg); color: var(--blue); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; border: 2px solid var(--blue-light);">
                                ${r.email.charAt(0).toUpperCase()}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 700; font-size: 15px; color: var(--text-main);">${r.email}</div>
                                <div style="font-size: 12px; color: var(--muted); display:flex; align-items:center; gap:5px;">
                                    <i class="ph ph-clock"></i> ${new Date(r.scanned_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                <span class="tag tag-good">${i18n.t('present') || 'حاضر'}</span>
                                <span style="font-size: 10px; color: var(--muted);">عبر QR 📲</span>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (e) {
                console.error('Live tracker failed', e);
            }
        };

        updateList();
        liveInterval = setInterval(updateList, 3000);
    }

    container.addEventListener('change', async (e) => {
        if (e.target.id === 'section-select') {
            selectedSectionId = e.target.value;
            if (selectedSectionId) {
                UI.toast(i18n.t('loading_subjects') || 'جاري تحميل مواد القسم...');
                subjects = await api.getSubjects(selectedSectionId);
            } else {
                subjects = [];
            }
            render();
        }
    });

    container.addEventListener('click', async (e) => {
        if (e.target.closest('#start-btn')) {
            const subjectId = container.querySelector('#subject-select').value;
            if (!subjectId) {
                UI.toast(i18n.t('select_subject_error') || 'يرجى اختيار مادة أولاً', 'error');
                return;
            }
            const interval = container.querySelector('#interval-select').value;
            try {
                const res = await api.startAttendance({
                    subject_id: subjectId,
                    professor_id: user.id,
                    refresh_interval: interval
                });
                activeSession = {
                    session_id: res.session_id,
                    token: res.token,
                    interval: res.interval,
                    status: 'active'
                };
                render();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
        }

        if (e.target.closest('#end-btn')) {
            if (confirm(i18n.t('confirm_end_attendance') || 'هل أنت متأكد من إنهاء تسجيل الحضور؟')) {
                await api.endAttendance(activeSession.session_id);
                clearInterval(qrInterval);
                clearInterval(liveInterval);
                UI.toast(i18n.t('attendance_saved') || 'تم حفظ سجل الحضور بنجاح');
                activeSession = null;
                await loadHistory();
                render();
            }
        }

        if (e.target.closest('#toggle-status-btn')) {
            const newStatus = activeSession.status === 'active' ? 'paused' : 'active';
            await api.toggleAttendanceStatus(activeSession.session_id, newStatus);
            activeSession.status = newStatus;
            UI.toast(newStatus === 'active' ? 'تم فتح التسجيل' : 'تم إيقاف التسجيل مؤقتاً');
            if (newStatus === 'paused') {
                qrGenerator.clear();
                qrGenerator.makeCode('PAUSED');
            } else {
                qrGenerator.makeCode(activeSession.token);
            }
            render();
        }

        const histItem = e.target.closest('.history-item');
        if (histItem) {
            showSessionDetails(histItem.dataset.id);
        }
    });

    init();
    return container;
}
