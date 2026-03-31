/* SectionManagementPage.js - 3Minds Platform - Global Elite Dashboard V3 */
import { api as SectionApi, auth as SectionAuth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const SectionManagementPage = async () => {
    const user = SectionAuth.getUser();
    if (!['super_admin', 'head_dept'].includes(user.role)) {
        return `<div class="forbidden-page"><h1>403</h1><p>غير مصرح بالدخول</p></div>`;
    }

    return `
        <div class="mgmt-dashboard-v3 animate-in">
            <div class="mgmt-v3-header">
                <div class="bg-pattern"></div>
                <div class="header-meta">
                    <h1>إدارة الكتل والأقسام</h1>
                    <p>المجلد الأكاديمي الشامل لتوزيع وتنسيق سجلات الطلاب.</p>
                    <div class="header-badges">
                        <span class="premium-pill">نظام النقل الآمن مفعّل</span>
                        <span class="premium-pill">مزامنة البيانات حية</span>
                    </div>
                </div>
            </div>

            <div class="mgmt-v3-grid">
                <div class="v3-stat-card clickable" data-path="/chat" style="cursor:pointer; border: 1px solid rgba(79, 70, 229, 0.3); background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, transparent 100%);">
                    <div class="icon-wrap" style="color:var(--primary); background:rgba(79, 70, 229, 0.1);"><i class="ph-duotone ph-chats-teardrop"></i></div>
                    <div class="info">
                        <span class="val">دخول</span>
                        <span class="lbl">إدارة الدردشة</span>
                    </div>
                </div>
            </div>

            <nav class="section-glass-nav" id="v3-nav-list">
                <div class="nav-skeleton" style="width:100px; height:60px; background:var(--border); border-radius:15px;"></div>
            </nav>

            <div class="mgmt-v3-main">
                <div class="v3-table-header">
                    <div class="v3-active-title">
                        <i class="ph-bold ph-hash"></i>
                        <span id="v3-active-label">اختر شعبة للتنقل</span>
                    </div>
                    <div class="v3-search-wrap">
                        <i class="ph ph-magnifying-glass"></i>
                        <input type="text" id="v3-search-input" placeholder="ابحث بصيغة (الاسم أو البريد)...">
                    </div>
                </div>
                <div id="v3-viewport" class="v3-container">
                    <div class="v3-empty-state">
                        <i class="ph-duotone ph-fingerprint"></i>
                        <p>بانتظار تحديد الشعبة الدراسية لعرض السجلات...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
};

SectionManagementPage.init = async () => {
    const navList = document.getElementById('v3-nav-list');
    const viewport = document.getElementById('v3-viewport');
    const activeLabel = document.getElementById('v3-active-label');
    const totalStudentsText = document.getElementById('v3-total-students');
    const activeSectionsText = document.getElementById('v3-active-sections');
    const searchInput = document.getElementById('v3-search-input');

    let allStudents = [];
    let currentId = null;

    const fetchInit = async () => {
        try {
            const data = await SectionApi._fetch('/api/admin/section-mgmt-init');
            const sections = data.sections || [];
            const countsMap = data.counts || {};
            totalStudentsText.innerText = data.total_students || 0;
            activeSectionsText.innerText = sections.length;

            if (sections.length === 0) {
                navList.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">لا توجد شعب مسجلة حالياً.</p>`;
                return;
            }

            navList.innerHTML = sections.map(s => {
                const count = countsMap[s.id] || 0;
                return `
                    <button class="v3-sec-btn" data-id="${s.id}">
                        <span class="s-name">شعبة ${s.name || s.id}</span>
                        <span class="s-count">${count} طالب</span>
                    </button>
                `;
            }).join('');

            document.querySelectorAll('.v3-sec-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.v3-sec-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    loadStudents(btn.dataset.id);
                };
            });
        } catch (err) {
            navList.innerHTML = `<div class="error-msg">فشل الجلب: ${err.message}</div>`;
        }
    };

    const loadStudents = async (sid) => {
        currentId = sid;
        viewport.innerHTML = '<div class="v3-loader"><i class="ph ph-circle-notch spin"></i><p>جاري تحديث السجلات...</p></div>';
        try {
            const res = await SectionApi._fetch(`/api/admin/section-students?section_id=${sid}`);
            allStudents = res.students || [];
            activeLabel.innerText = `طلاب شعبة ${sid}`;
            renderTable(allStudents);
        } catch (err) { viewport.innerHTML = `<div class="error-msg">${err.message}</div>`; }
    };

    const renderTable = (list) => {
        if (list.length === 0) {
            viewport.innerHTML = `<div class="v3-empty-state"><i class="ph ph-folder-open"></i><p>لا يوجد طلاب حالياً في هذه الشعبة.</p></div>`;
            return;
        }
        viewport.innerHTML = `
            <table class="v3-table">
                <thead>
                    <tr>
                        <th>الملف الشخصي</th>
                        <th>البريد الإلكتروني</th>
                        <th class="text-center">إجراءات إدارية</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(s => `
                        <tr>
                            <td>
                                <div class="v3-user">
                                    <div class="v3-avatar">${s.full_name.charAt(0)}</div>
                                    <div class="v3-u-info">
                                        <h4>${s.full_name}</h4>
                                        <span>تفعيل قياسي</span>
                                    </div>
                                </div>
                            </td>
                            <td><div class="v3-email">${s.email}</div></td>
                            <td class="text-center">
                                <div style="display:flex; gap:0.5rem; justify-content:center;">
                                    <button class="v3-profile-btn" data-id="${s.id}">
                                        <i class="ph-bold ph-identification-card"></i> عرض الملف
                                    </button>
                                    <button class="v3-transfer-btn" data-id="${s.id}" data-name="${s.full_name}" data-current="${s.section_id}">
                                        <i class="ph-bold ph-paper-plane-tilt"></i> نقل الطالب
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        document.querySelectorAll('.v3-transfer-btn').forEach(btn => {
            btn.onclick = () => showTransferModal(btn.dataset.id, btn.dataset.name, btn.dataset.current);
        });
        document.querySelectorAll('.v3-profile-btn').forEach(btn => {
            btn.onclick = () => showStudentProfile(btn.dataset.id);
        });
    };

    const showStudentProfile = async (studentId) => {
        UI.toast('جاري تحميل السجل الأكاديمي...', 'info');
        try {
            const res = await SectionApi._fetch(`/api/admin/student-profile?student_id=${studentId}&_=${Date.now()}`);
            const { student, performance: perf, attendance, assignments, exams } = res;
            await UI.modal(`السجل الأكاديمي: ${student.full_name}`, `
                <div class="v3-profile-modal">
                    <div class="profile-hero">
                        <div class="perf-badge ${perf.indicator}">${perf.indicator}</div>
                        <div class="student-main">
                            <h2>${student.full_name}</h2>
                            <p>${student.email} • طالب</p>
                            <div class="sec-tags">${student.sections.map(s => `<span class="tag">${s}</span>`).join('')}</div>
                        </div>
                    </div>
                    <div class="profile-stats">
                        <div class="stat-box"><span class="val">${attendance.percentage}%</span><span class="lbl">الحضور</span></div>
                        <div class="stat-box"><span class="val">${perf.average}</span><span class="lbl">معدل الدرجات</span></div>
                        <div class="stat-box"><span class="val">${assignments.filter(a => a.grade).length}</span><span class="lbl">المهام المقيمة</span></div>
                    </div>
                    <div class="profile-tabs-content">
                        <div class="profile-section">
                            <h3><i class="ph ph-calendar-check"></i> ملخص الحضور والغياب</h3>
                            <div class="attendance-bar"><div class="bar-fill" style="width:${attendance.percentage}%"></div></div>
                            <div class="attendance-legend"><span><b>${attendance.present}</b> حضور</span><span><b>${attendance.absent}</b> غياب</span></div>
                        </div>
                        <div class="profile-cols">
                            <div class="profile-col">
                                <h3><i class="ph ph-notebook"></i> الواجبات</h3>
                                <div class="mini-list">${assignments.length === 0 ? '<p>لا يوجد</p>' : assignments.map(a => `<div class="mini-item"><span>${a.title}</span><span class="badge ${a.grade ? 'graded' : 'pending'}">${a.grade || 'بانتظار'}</span></div>`).join('')}</div>
                            </div>
                            <div class="profile-col">
                                <h3><i class="ph ph-exam"></i> الاختبارات</h3>
                                <div class="mini-list">${exams.length === 0 ? '<p>لا يوجد</p>' : exams.map(e => `<div class="mini-item"><span>${e.title}</span><span class="score">${e.score !== null ? `<b>${e.score}</b> / ${e.total_marks}` : 'لم يؤدَ'}</span></div>`).join('')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `, null, { maxWidth: '800px' });
        } catch (err) { UI.toast(err.message, 'error'); }
    };

    const showTransferModal = async (studentId, name, currentSection) => {
        const data = await SectionApi._fetch('/api/admin/section-mgmt-init');
        const sections = data.sections || [];
        await UI.modal('المجلد الإداري: نقل آمن', `
            <div class="v3-modal-body">
                <div class="v3-transfer-card">
                    <div class="v3-avatar-lg">${name.charAt(0)}</div>
                    <div class="v3-u-meta"><h3>${name}</h3><p>الموقع الحالي: <b>شعبة ${currentSection}</b></p></div>
                </div>
                <div class="form-group" style="margin-top:2rem;">
                    <label>الشعبة الدراسية الجديدة</label>
                    <select id="v3-new-sid" class="v3-select" style="width:100%">${sections.map(s => `<option value="${s.id}" ${s.id === currentSection ? 'disabled' : ''}>شعبة ${s.name || s.id}</option>`).join('')}</select>
                </div>
            </div>
        `, async () => {
            const sid = document.getElementById('v3-new-sid').value;
            try {
                const res = await SectionApi._fetch('/api/admin/transfer-student', { method: 'POST', body: JSON.stringify({ student_id: studentId, new_section_ids: [sid] }) });
                if (res.success) { UI.toast('تم النقل بنجاح', 'success'); loadStudents(currentId); return true; }
            } catch (err) { UI.toast(err.message, 'error'); return false; }
        });
    };

    searchInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const filtered = allStudents.filter(s => s.full_name.toLowerCase().includes(val) || s.email.toLowerCase().includes(val));
        renderTable(filtered);
    };
    fetchInit();
};

export default SectionManagementPage;
