/* SectionManagementPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const SectionManagementPage = async () => {
    const user = auth.getUser();
    if (!['super_admin', 'head_dept'].includes(user.role)) {
        return `<div class="error-state"><h1>403</h1><p>غير مصرح لك بالوصول لهذه الصفحة</p></div>`;
    }

    // Default sections as per requirements
    const sections = ['A', 'B', 'C', 'D'];
    let activeSection = 'A';

    return `
        <div class="admin-page-v2">
            <div class="page-top-nav">
                <div class="page-context-title">إدارة أقسام الطلاب</div>
            </div>

            <div class="admin-grid">
                <!-- Sidebar: Sections -->
                <div class="admin-sidebar">
                    <div class="sidebar-info">
                        <h3>الشعب الدراسية</h3>
                        <p>اختر الشعبة لعرض الطلاب وتنسيق عمليات النقل.</p>
                    </div>
                    <nav class="admin-nav">
                        ${sections.map(s => `
                            <button class="nav-item ${activeSection === s ? 'active' : ''}" data-section="${s}">
                                <i class="ph-bold ph-users-four"></i>
                                <span>شعبة ${s}</span>
                            </button>
                        `).join('')}
                    </nav>
                </div>

                <!-- Main Content: Student List -->
                <div class="admin-main">
                    <div class="section-header-v2">
                        <div class="section-title-wrap">
                            <div class="title-icon"><i class="ph-fill ph-users"></i></div>
                            <h2 id="current-section-title">طلاب شعبة ${activeSection}</h2>
                            <span class="items-count-badge" id="student-count">0</span>
                        </div>
                    </div>

                    <div id="students-container" class="students-management-list">
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

SectionManagementPage.init = async () => {
    const user = auth.getUser();
    const container = document.getElementById('students-container');
    const countBadge = document.getElementById('student-count');
    const title = document.getElementById('current-section-title');
    let activeSection = 'A';

    const loadStudents = async (sectionId) => {
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const res = await api._fetch(`/api/admin/section-students?section_id=${sectionId}`);
            const students = res.students || [];
            countBadge.innerText = students.length;
            title.innerText = `طلاب شعبة ${sectionId}`;

            if (students.length === 0) {
                container.innerHTML = `<div class="empty-state"><p>لا يوجد طلاب مسجلين في هذه الشعبة</p></div>`;
                return;
            }

            container.innerHTML = `
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>الاسم الكامل</th>
                            <th>البريد الإلكتروني</th>
                            <th>الشعبة الحالية</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(s => `
                            <tr>
                                <td>
                                    <div class="user-info-cell">
                                        <div class="user-avatar-mini">${s.full_name.charAt(0)}</div>
                                        <span class="user-name">${s.full_name}</span>
                                    </div>
                                </td>
                                <td><span class="user-email-tag">${s.email}</span></td>
                                <td><span class="section-badge">${s.section_id}</span></td>
                                <td>
                                    <button class="btn btn-primary transfer-btn" 
                                            data-id="${s.id}" data-name="${s.full_name}" data-current="${s.section_id}">
                                        <i class="ph ph-shuffle"></i> نقل لشعبة أخرى
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Add event listeners for transfer
            document.querySelectorAll('.transfer-btn').forEach(btn => {
                btn.onclick = () => showTransferModal(btn.dataset.id, btn.dataset.name, btn.dataset.current);
            });

        } catch (err) {
            container.innerHTML = `<div class="error-msg">فشل تحميل البيانات: ${err.message}</div>`;
        }
    };

    const showTransferModal = async (studentId, name, currentSection) => {
        const sections = ['A', 'B', 'C', 'D'];
        
        await UI.modal('نقل طالب آمن', `
            <div class="transfer-modal-content">
                <div class="transfer-warning">
                    <i class="ph-bold ph-warning-circle"></i>
                    <p>سيتم نقل الطالب <strong>${name}</strong> إلى شعبة جديدة. جميع البيانات السابقة (الحضور، الدرجات، الواجبات) ستبقى <strong>محفوظة</strong> ومرتبطة بسجل الطالب التاريخي.</p>
                </div>
                
                <div class="form-group">
                    <label class="form-label">الشعبة الحالية</label>
                    <input type="text" value="شعبة ${currentSection}" disabled class="form-input-disabled"/>
                </div>

                <div class="form-group">
                    <label class="form-label">اختر الشعبة الجديدة (يمكن اختيار أكثر من شعبة)</label>
                    <div class="section-checkbox-grid">
                        ${sections.map(s => `
                            <label class="checkbox-card ${currentSection === s ? 'disabled' : ''}">
                                <input type="checkbox" name="new-sections" value="${s}" ${currentSection === s ? 'disabled' : ''}>
                                <div class="card-content">
                                    <span class="section-name">شعبة ${s}</span>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
        `, async () => {
            const selected = Array.from(document.querySelectorAll('input[name="new-sections"]:checked')).map(i => i.value);
            if (selected.length === 0) {
                UI.toast('يرجى اختيار شعبة واحدة على الأقل', 'error');
                return false;
            }

            try {
                const res = await api._fetch('/api/admin/transfer-student', {
                    method: 'POST',
                    body: JSON.stringify({ student_id: studentId, new_section_ids: selected })
                });
                if (res.success) {
                    UI.toast('تم نقل الطالب بنجاح وتحديث السجلات', 'success');
                    loadStudents(activeSection);
                    return true;
                }
            } catch (err) {
                UI.toast(err.message, 'error');
                return false;
            }
        });
    };

    // Nav Switcher
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeSection = btn.dataset.section;
            loadStudents(activeSection);
        };
    });

    // Initial Load
    loadStudents(activeSection);
};

export default SectionManagementPage;
