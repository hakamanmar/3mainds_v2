/* SectionManagementPage.js - 3Minds Platform - Global Elite Dashboard V3 */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const SectionManagementPage = async () => {
    const user = auth.getUser();
    if (!['super_admin', 'head_dept'].includes(user.role)) {
        return `<div class="forbidden-page"><h1>403</h1><p>غير مصرح بالدخول</p></div>`;
    }

    return `
        <div class="mgmt-dashboard-v3 animate-in">
            <!-- Global Elite Header -->
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
                <div class="header-visual">
                    <!-- Statistics could go here too if needed -->
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="mgmt-v3-grid">
                <div class="v3-stat-card">
                    <div class="icon-wrap"><i class="ph-duotone ph-users-three"></i></div>
                    <div class="info">
                        <span class="val" id="v3-total-students">0</span>
                        <span class="lbl">إجمالي الطلاب</span>
                    </div>
                </div>
                <div class="v3-stat-card">
                    <div class="icon-wrap" style="color:#10b981; background:rgba(16,185,129,0.1);"><i class="ph-duotone ph-check-circle"></i></div>
                    <div class="info">
                        <span class="val" id="v3-active-sections">0</span>
                        <span class="lbl">الشعب المفعلة</span>
                    </div>
                </div>
                <div class="v3-stat-card">
                    <div class="icon-wrap" style="color:#f59e0b; background:rgba(245,158,11,0.1);"><i class="ph-duotone ph-arrows-left-right"></i></div>
                    <div class="info">
                        <span class="val">آمن</span>
                        <span class="lbl">حالة النقل</span>
                    </div>
                </div>
            </div>

            <!-- Horizontal Glass Navigation -->
            <nav class="section-glass-nav" id="v3-nav-list">
                <div class="nav-skeleton" style="width:100px; height:60px; background:var(--border); border-radius:15px;"></div>
            </nav>

            <!-- Main Listing Area -->
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
            const data = await api._fetch('/api/admin/section-mgmt-init');
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
            const res = await api._fetch(`/api/admin/section-students?section_id=${sid}`);
            allStudents = res.students || [];
            activeLabel.innerText = `طلاب شعبة ${sid}`;
            renderTable(allStudents);
        } catch (err) {
            viewport.innerHTML = `<div class="error-msg">${err.message}</div>`;
        }
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
                                <button class="v3-transfer-btn" data-id="${s.id}" data-name="${s.full_name}" data-current="${s.section_id}">
                                    <i class="ph-bold ph-paper-plane-tilt"></i> نقل الطالب
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        document.querySelectorAll('.v3-transfer-btn').forEach(btn => {
            btn.onclick = () => showTransferModal(btn.dataset.id, btn.dataset.name, btn.dataset.current);
        });
    };

    const showTransferModal = async (studentId, name, currentSection) => {
        const data = await api._fetch('/api/admin/section-mgmt-init');
        const sections = data.sections || [];

        await UI.modal('المجلد الإداري: نقل آمن', `
            <div class="v3-modal-body">
                <div class="v3-transfer-card">
                    <div class="v3-avatar-lg">${name.charAt(0)}</div>
                    <div class="v3-u-meta">
                        <h3>${name}</h3>
                        <p>الموقع الحالي: <b>شعبة ${currentSection}</b></p>
                    </div>
                </div>
                <div class="form-group" style="margin-top:2rem;">
                    <label style="font-weight:800; display:block; margin-bottom:10px;">الشعبة الدراسية الجديدة</label>
                    <select id="v3-new-sid" class="v3-select" style="width:100%; padding:15px; border-radius:15px; border:2px solid var(--border); font-family:inherit; font-weight:800; background:var(--background); color:var(--text-main);">
                        ${sections.map(s => `<option value="${s.id}" ${s.id === currentSection ? 'disabled' : ''}>شعبة ${s.name || s.id}</option>`).join('')}
                    </select>
                </div>
                <div class="v3-safety-tip" style="background:rgba(37,99,235,0.1); color:#2563eb; padding:15px; border-radius:12px; margin-top:20px; font-weight:700; font-size:0.9rem; display:flex; gap:10px; align-items:center;">
                    <i class="ph-fill ph-shield-check"></i>
                    <span>تشفير النقل مفعّل: سيتم سحب الصلاحيات الحالية تلقائياً.</span>
                </div>
            </div>
        `, async () => {
            const newSid = document.getElementById('v3-new-sid').value;
            try {
                const res = await api._fetch('/api/admin/transfer-student', {
                    method: 'POST', body: JSON.stringify({ student_id: studentId, new_section_ids: [newSid] })
                });
                if (res.success) {
                    UI.toast('تمت عملية النقل بنجاح إداري عالٍ', 'success');
                    loadStudents(currentId);
                    return true;
                }
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
