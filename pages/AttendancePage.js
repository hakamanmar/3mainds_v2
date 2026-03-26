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
                    <label style="font-weight: 700; display: block; margin-bottom: 0.5rem; color: var(--blue);">${i18n.t('select_section') || 'اختر الشعبة الدراسية'}</label>
                    <select id="section-select" class="form-control" style="border: 2px solid var(--blue-light);">
                        <option value="">-- ${i18n.t('choose_section') || 'اختر الشعبة'} --</option>
                        ${sections.map(s => `<option value="${s.id}" ${s.id === selectedSectionId ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
                ` : ''}

                <div class="form-group">
                    <label>${i18n.t('select_subject') || 'اختر المادة'}</label>
                    <select id="subject-select" class="form-control" ${subjects.length === 0 ? 'disabled' : ''}>
                        <option value="">-- ${subjects.length === 0 ? (i18n.t('no_subjects_found') || 'لا توجد مواد لهذه الشعبة') : (i18n.t('choose_subject') || 'اختر المادة الدراسية')} --</option>
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
                        <div class="manual-code-box" style="margin-top: 15px; padding: 15px; background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 10px; width: 100%; text-align: center;">
                            <span style="font-size: 0.85rem; color: #92400e; display: block; margin-bottom: 5px; font-weight: 600;">🔑 الرمز اليدوي للطالب:</span>
                            <span id="manual-token-display" style="font-size: 2rem; font-weight: 800; color: #b45309; letter-spacing: 4px; font-family: monospace;">${activeSession.token}</span>
                        </div>
                        <p style="text-align: center; font-size: 13px; color: var(--muted); margin-top: 10px;">
                            ${i18n.t('qr_instruction') || 'اعرض هذا الرمز للطلاب، أو قم بإملائهم الرمز أعلاه'}
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
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>👥 ${i18n.t('live_attendance') || 'الحاضرون الآن'}</span>
                            <button id="manual-add-btn" class="btn btn-sm" style="padding: 4px 10px; background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-light); border-radius: 6px; font-size: 12px;">
                                <i class="ph ph-plus-circle"></i> إضافة يدوي
                            </button>
                        </div>
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
                            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                                <div style="font-weight: 700; color: var(--blue); font-size: 1.1rem;">${s.attended} <span style="font-weight: 400; font-size: 0.8rem; color: var(--muted);">/ ${s.total_in_section}</span></div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <div class="tag tag-ok">انتهت</div>
                                    <button class="delete-session-btn" data-id="${s.id}" title="حذف الأرشيف" style="background: var(--danger-light); color: var(--danger); border: none; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                        <i class="ph ph-trash"></i>
                                    </button>
                                </div>
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
                <div style="background: var(--surface-2); padding: 20px; border-radius: 12px; margin-bottom: 2rem; border: 1px solid var(--border);">
                    <h2 style="margin-bottom: 10px; color: var(--blue);"><i class="ph ph-bookmark-simple"></i> ${s.subject_title} (${s.subject_code})</h2>
                    <p><strong><i class="ph ph-user-circle"></i> مدرس المادة:</strong> ${s.professor_email}</p>
                    <p><strong><i class="ph ph-calendar-blank"></i> اليوم والتاريخ:</strong> ${new Date(s.started_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p><strong><i class="ph ph-clock"></i> وقت البدء:</strong> ${new Date(s.started_at).toLocaleTimeString('ar-EG')}</p>
                </div>
                
                <h3 style="margin-bottom: 1rem;"><i class="ph ph-users"></i> قائمة الطلاب الحاضرين (${data.attended.length})</h3>
                <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: var(--surface-2); position: sticky; top: 0;">
                            <tr>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid var(--border);">الطالب</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid var(--border);">الأسلوب</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid var(--border);">وقت التسجيل</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid var(--border);">الإجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.attended.map(r => `
                                <tr>
                                    <td style="padding: 12px; border-bottom: 1px solid var(--border); font-weight: 600;">${r.full_name || r.email}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid var(--border);"><span class="tag tag-ok">${r.method === 'qr' ? 'بصمة QR' : 'يدوي'}</span></td>
                                    <td style="padding: 12px; border-bottom: 1px solid var(--border); font-size: 13px;">${new Date(r.scanned_at).toLocaleTimeString('ar-EG')}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid var(--border);">
                                        <button class="delete-attendee-btn btn-sm" data-session="${id}" data-student="${r.student_id}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 5px;">
                                            <i class="ph ph-trash" style="font-size: 1.2rem;"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        UI.modal('تقرير المحاضرة بالتفصيل', html, null, { large: true });
    }

    // Attach row listeners including capture for delete button
    container.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.delete-session-btn');
        if (delBtn) {
            e.stopPropagation();
            const id = delBtn.dataset.id;
            const confirmed = await UI.confirm('هل أنت متأكد من حذف سجل المحاضرة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.');
            if (confirmed) {
                try {
                    await api.deleteAttendanceSession(id);
                    UI.toast('تم حذف السجل بنجاح');
                    const page = await AttendancePage(params);
                    container.innerHTML = '';
                    container.appendChild(page);
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
            }
            return;
        }

        const histItem = e.target.closest('.history-item');
        if (histItem) {
            showSessionDetails(histItem.dataset.id);
        }
    });

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
                    
                    const tokenDisplay = container.querySelector('#manual-token-display');
                    if (tokenDisplay) tokenDisplay.textContent = data.token;

                    if (activeSession.status === 'active') {
                        qrGenerator.clear();
                        qrGenerator.makeCode(data.token);
                    }
                } catch (e) {
                    console.error('QR refresh failed', e);
                }
            }
        }, 1000);

        const regenBtn = container.querySelector('#regenerate-btn');
        if (regenBtn) {
            regenBtn.addEventListener('click', async () => {
                const data = await api.getAttendanceQR(activeSession.session_id, true);
                activeSession.token = data.token;
                remaining = data.interval;
                if (timerEl) timerEl.textContent = remaining;
                
                const tokenDisplay = container.querySelector('#manual-token-display');
                if (tokenDisplay) tokenDisplay.textContent = data.token;

                qrGenerator.clear();
                qrGenerator.makeCode(data.token);
                UI.toast(i18n.t('qr_refreshed') || 'تم تجديد الرمز بنجاح');
            });
        }
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
                        <div class="attendance-row" style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid var(--border); background: var(--surface); margin-bottom: 5px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); animation: slideInUp 0.3s ease;" data-name="${r.full_name || ''}" data-email="${r.email || ''}">
                            <div class="user-avatar" style="width: 45px; height: 45px; border-radius: 12px; background: var(--blue-bg); color: var(--blue); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; border: 2px solid var(--blue-light);">
                                ${(r.full_name || r.email).charAt(0).toUpperCase()}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 700; font-size: 15px; color: var(--text-main);">${r.full_name || r.email}</div>
                                <div style="font-size: 12px; color: var(--muted); display:flex; align-items:center; gap:5px;">
                                    <i class="ph ph-envelope"></i> ${r.email}  <span style="margin: 0 5px;">|</span> <i class="ph ph-clock"></i> ${new Date(r.scanned_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                    ${r.method === 'excused' ? `
                                        <span class="tag tag-warn">مجاز 📄</span>
                                        <span style="font-size: 10px; color: var(--muted);">عذر رسمي</span>
                                    ` : `
                                        <span class="tag tag-good">${r.method === 'manual' ? 'حضور يدوي' : (i18n.t('present') || 'حاضر')}</span>
                                        <span style="font-size: 10px; color: var(--muted);">${r.method === 'manual' ? 'بواسطة الأستاذ' : 'بصمة QR 📲'}</span>
                                    `}
                                </div>
                                <button class="delete-attendee-btn" data-session="${activeSession.session_id}" data-student="${r.student_id}" style="background: #fee2e2; border: none; color: #ef4444; width: 35px; height: 35px; border-radius: 8px; cursor: pointer;">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    listContainer.innerHTML = `
                        <div class="empty-state" style="padding: 40px 0;">
                            <i class="ph ph-users" style="font-size: 32px; color: var(--muted);"></i>
                            <p>${i18n.t('waiting_scans') || 'بانتظار مسح الطلاب للرمز...'}</p>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Live tracker failed', e);
            }
        };

        // Make updateList available globally within the page scope for immediate refresh after delete
        container.updateLiveList = updateList;
        updateList();
        liveInterval = setInterval(updateList, 3000);
    }

    container.addEventListener('change', async (e) => {
        if (e.target.id === 'section-select') {
            selectedSectionId = e.target.value;
            if (selectedSectionId) {
                UI.toast(i18n.t('loading_subjects') || 'جاري تحميل مواد الشعبة...');
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
                const selectedSubj = subjects.find(s => s.id == subjectId);
                activeSession = {
                    session_id: res.session_id,
                    token: res.token,
                    interval: res.interval,
                    status: 'active',
                    section_id: selectedSubj ? selectedSubj.section_id : selectedSectionId
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

        // 🗑️ Delete Attendee Logic
        const delAttendeeBtn = e.target.closest('.delete-attendee-btn');
        if (delAttendeeBtn) {
            const sessId = delAttendeeBtn.dataset.session;
            const stuId = delAttendeeBtn.dataset.student;
            if (confirm(i18n.lang === 'ar' ? 'هل أنت متأكد من حذف هذا الطالب من سجل الحضور؟' : 'Are you sure you want to remove this student?')) {
                const res = await api.deleteAttendanceRecord(sessId, stuId);
                if (res.success) {
                    UI.toast(i18n.lang === 'ar' ? 'تم حذف الحضور بنجاح' : 'Attendance record deleted');
                    
                    // Immediate feedback for live tracker
                    const row = delAttendeeBtn.closest('.attendance-row');
                    if (row) {
                        row.style.opacity = '0.5';
                        row.style.pointerEvents = 'none';
                        setTimeout(() => {
                            if (container.updateLiveList) container.updateLiveList();
                        }, 500);
                    }

                    // Refresh if in modal
                    const modal = document.querySelector('.modal-overlay');
                    if (modal) {
                        modal.remove(); // Close old
                        showSessionDetails(sessId); // Re-open
                    }
                }
            }
        }

        if (e.target.closest('#manual-add-btn')) {
            showManualAddModal();
        }
    });

    async function showManualAddModal() {
        try {
        UI.toast('جاري تحميل قائمة الطلاب...', 'info');
        const sessData = await api.getLiveAttendance(activeSession.session_id);
        const sid = activeSession.section_id || selectedSectionId;
        const allStudentsRaw = await api.getSectionStudents(sid);
        const allStudents = Array.isArray(allStudentsRaw) ? allStudentsRaw : [];
        const presentIds = new Set(Array.isArray(sessData.attended) ? sessData.attended.map(r => r.student_id) : []);
        
        const html = `
            <div style="direction: rtl; text-align: right;">
                <p style="margin-bottom: 15px; color: var(--muted);">اختر الطالب لتسجيله كحاضر أو مجاز (إجمالي طلاب الشعبة: ${allStudents.length}):</p>
                <div class="form-group" style="margin-bottom: 15px;">
                    <input type="text" id="student-search" class="form-control" placeholder="بحث عن اسم الطالب..." style="width: 100%;">
                </div>
                <div id="manual-student-list" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 12px;">
                    ${allStudents.filter(s => s.role === 'student').map(s => {
                        const isPresent = presentIds.has(s.id);
                        return `
                        <div class="student-item" data-email="${s.email}" data-name="${s.full_name || ''}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border); ${isPresent ? 'background: #f8fafc; opacity: 0.7;' : ''}">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="avatar-sm" style="width: 32px; height: 32px; background: #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">${(s.full_name || s.email).charAt(0).toUpperCase()}</div>
                                <div>
                                    <div style="font-weight: 600; font-size: 14px;">${s.full_name || s.email}</div>
                                    <div style="font-size: 11px; color: var(--muted);">${s.email} | ${isPresent ? '✅ مسجل مسبقاً' : 'غير مسجل حالياً'}</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                ${!isPresent ? `
                                    <button class="btn-mark-present btn-sm" data-id="${s.id}" style="background: var(--blue); color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer;">حضور</button>
                                    <button class="btn-mark-excused btn-sm" data-id="${s.id}" style="background: #f59e0b; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer;">مجاز</button>
                                ` : ''}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        UI.modal('تسجيل حضور يدوي / إجازة', html, null, { large: true, hideFooter: true });

        // Search logic
        const modal = document.querySelector('.modal-overlay');
        const searchInput = modal.querySelector('#student-search');
        searchInput.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            modal.querySelectorAll('.student-item').forEach(item => {
                const matches = item.dataset.email.toLowerCase().includes(val) || 
                               item.dataset.name.toLowerCase().includes(val);
                item.style.display = matches ? 'flex' : 'none';
            });
        };

        // Click logic
        modal.onclick = async (e) => {
            const btn = e.target.closest('.btn-mark-present, .btn-mark-excused');
            if (btn) {
                const method = e.target.classList.contains('btn-mark-present') ? 'manual' : 'excused';
                const studentId = btn.dataset.id;
                btn.disabled = true;
                btn.innerHTML = '...';
                
                try {
                    await api.manualMarkAttendance({
                        session_id: activeSession.session_id,
                        student_id: studentId,
                        method: method
                    });
                    UI.toast(method === 'manual' ? 'تم تسجيل حضور الطالب' : 'تم تسجيل الطالب كمجاز');
                    if (container.updateLiveList) container.updateLiveList();
                    
                    // Update UI in modal too
                    const item = btn.closest('.student-item');
                    item.style.background = '#f8fafc';
                    item.style.opacity = '0.7';
                    item.querySelector('div div:last-child').textContent = '✅ تمت الإضافة الآن';
                    btn.parentElement.innerHTML = ''; 
                } catch (err) {
                    UI.toast(err.message, 'error');
                    btn.disabled = false;
                    btn.innerHTML = method === 'manual' ? 'حضور' : 'مجاز';
                }
            }
        };
        } catch (err) {
            console.error('showManualAddModal error:', err);
            UI.toast('حدث خطأ عند تحميل قائمة الطلاب: ' + (err.message || ''), 'error');
        }
    }

    init();
    return container;
}
