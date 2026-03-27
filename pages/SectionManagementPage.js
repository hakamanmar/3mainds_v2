/* SectionManagementPage.js - 3Minds Platform - Premium Dashboard v2 */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const SectionManagementPage = async () => {
    const user = auth.getUser();
    if (!['super_admin', 'head_dept'].includes(user.role)) {
        return `<div class="forbidden-page"><h1>403</h1><p>غير مصرح بالدخول</p></div>`;
    }

    return `
        <div class="mgmt-dashboard-v2 animate-in">
            <!-- Glass Header -->
            <div class="mgmt-hero">
                <div class="hero-left">
                    <div class="hero-icon"><i class="ph-duotone ph-circles-four"></i></div>
                    <div class="hero-text">
                        <h1>إدارة الأقسام والطلاب</h1>
                        <p>نظام النقل الآمن والحماية الشاملة للبيانات التاريخية.</p>
                    </div>
                </div>
                <div class="hero-stats">
                    <div class="stat-card">
                        <span class="label">إجمالي الطلاب</span>
                        <span class="value" id="global-total-students">0</span>
                    </div>
                </div>
            </div>

            <!-- Top Horizontal Sections Selector -->
            <div class="section-selector-row" id="section-selector-list">
                <div class="selector-skeleton"></div>
            </div>

            <!-- Main Listing Area -->
            <div class="mgmt-card-full">
                <div class="card-header-v3">
                    <div class="active-info">
                        <i class="ph ph-hash"></i>
                        <span id="active-sec-label">اختر شعبة للبدء</span>
                        <div class="badge-mini" id="sec-count">0</div>
                    </div>
                    <div class="search-bubble">
                        <i class="ph ph-magnifying-glass"></i>
                        <input type="text" id="student-search-v2" placeholder="بحث سريع في هذه الشعبة...">
                    </div>
                </div>

                <div id="students-viewport" class="viewport-v2">
                    <div class="welcome-guide">
                        <i class="ph ph-cursor-click"></i>
                        <p>يرجى النقر على إحدى الشعب في الأعلى لاستعراض الطلاب وإدارة عمليات النقل.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
};

SectionManagementPage.init = async () => {
    const selectorContainer = document.getElementById('section-selector-list');
    const viewport = document.getElementById('students-viewport');
    const activeLabel = document.getElementById('active-sec-label');
    const activeCount = document.getElementById('sec-count');
    const globalCountText = document.getElementById('global-total-students');
    const searchInput = document.getElementById('student-search-v2');

    let allStudents = [];
    let currentActiveIdx = null;

    const fetchInitialData = async () => {
        try {
            const data = await api._fetch('/api/admin/section-mgmt-init');
            const sections = data.sections || [];
            const countsMap = data.counts || {};
            globalCountText.innerText = data.total_students || 0;

            if (sections.length === 0) {
                selectorContainer.innerHTML = '<p class="error-inline">لا توجد أقسام مسجلة في النظام حالياً.</p>';
                return;
            }

            selectorContainer.innerHTML = sections.map(s => {
                const count = countsMap[s.id] || 0;
                return `
                    <button class="section-pill-btn" data-id="${s.id}">
                        <div class="pill-icon"><i class="ph-bold ph-presentation-chart"></i></div>
                        <div class="pill-info">
                            <span class="p-name">${s.name || s.id}</span>
                            <span class="p-count">${count} طالب</span>
                        </div>
                    </button>
                `;
            }).join('');

            document.querySelectorAll('.section-pill-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.section-pill-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    loadStudents(btn.dataset.id);
                };
            });

        } catch (err) {
            selectorContainer.innerHTML = `<div class="error-v2">حدث خطأ: ${err.message}</div>`;
        }
    };

    const loadStudents = async (sid) => {
        currentActiveIdx = sid;
        viewport.innerHTML = '<div class="loader-v3"><div class="spin"></div><p>جاري مزامنة بيانات الطلاب...</p></div>';
        try {
            const res = await api._fetch(`/api/admin/section-students?section_id=${sid}`);
            allStudents = res.students || [];
            activeLabel.innerText = `شعبة ${sid}`;
            activeCount.innerText = allStudents.length;
            renderTable(allStudents);
        } catch (err) {
            viewport.innerHTML = `<p class="error-msg-v2">فشل تحميل البيانات: ${err.message}</p>`;
        }
    };

    const renderTable = (list) => {
        if (list.length === 0) {
            viewport.innerHTML = `<div class="empty-state-v3"><i class="ph ph-folder-open"></i><p>لا يوجد طلاب حالياً في هذه الشعبة.</p></div>`;
            return;
        }

        viewport.innerHTML = `
            <table class="premium-mgmt-table animate-in">
                <thead>
                    <tr>
                        <th class="align-r">الطالب</th>
                        <th class="align-r">البريد</th>
                        <th class="text-center">الإجراء</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(s => `
                        <tr>
                            <td>
                                <div class="student-cell">
                                    <div class="s-avatar">${s.full_name.charAt(0)}</div>
                                    <div class="s-name-wrap">
                                        <div class="s-full-name">${s.full_name}</div>
                                        <div class="s-role">طالب رسمي</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="s-email">${s.email}</span></td>
                            <td class="text-center">
                                <button class="btn-modern-transfer" data-id="${s.id}" data-name="${s.full_name}" data-current="${s.section_id}">
                                    <i class="ph-bold ph-shuffle"></i> نقل القسم
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        document.querySelectorAll('.btn-modern-transfer').forEach(btn => {
            btn.onclick = () => showTransferModal(btn.dataset.id, btn.dataset.name, btn.dataset.current);
        });
    };

    const showTransferModal = async (studentId, name, currentSection) => {
        const data = await api._fetch('/api/admin/section-mgmt-init');
        const sections = data.sections || [];

        await UI.modal('النقل الآمن للطلاب', `
            <div class="transfer-v2-body">
                <div class="transfer-user-preview">
                    <div class="p-avatar">${name.charAt(0)}</div>
                    <div class="p-details">
                        <div class="p-name">${name}</div>
                        <div class="p-current">الشعبة الحالية: <b>${currentSection}</b></div>
                    </div>
                </div>
                <div class="pwa-divider"></div>
                <div class="form-group-v3">
                    <label>تحويل إلى الشعبة</label>
                    <select id="new-sec-target" class="v3-select">
                        ${sections.map(s => `<option value="${s.id}" ${s.id === currentSection ? 'disabled' : ''}>شعبة ${s.name || s.id}</option>`).join('')}
                    </select>
                </div>
                <div class="safety-checkpoint">
                    <i class="ph-fill ph-shield-check"></i>
                    <span>سيتم الحفاظ على أرشيف الحضور والدرجات فور النقل.</span>
                </div>
            </div>
        `, async () => {
            const newSid = document.getElementById('new-sec-target').value;
            try {
                const res = await api._fetch('/api/admin/transfer-student', {
                    method: 'POST', body: JSON.stringify({ student_id: studentId, new_section_ids: [newSid] })
                });
                if (res.success) {
                    UI.toast('تمت عملية النقل بنجاح عالي', 'success');
                    loadStudents(currentActiveIdx);
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

    fetchInitialData();
};

export default SectionManagementPage;
