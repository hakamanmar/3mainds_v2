const SectionManagementPage = async () => {
    const user = auth.getUser();
    if (!['super_admin', 'head_dept'].includes(user.role)) {
        return `<div class="error-state"><h1>403</h1><p>غير مصرح لك بالوصول لهذه الصفحة</p></div>`;
    }

    return `
        <div class="sections-mgmt-container">
            <!-- Header Section -->
            <div class="mgmt-header">
                <div class="header-main">
                    <div class="title-badge"><i class="ph-fill ph-users-three"></i></div>
                    <div class="title-text">
                        <h1>إدارة الأقسام وتوزيع الطلاب</h1>
                        <p>نظم، انقل، وراقب توزيع الطلاب عبر الشعب الدراسية بكل سهولة.</p>
                    </div>
                </div>
                <div class="header-stats" id="global-stats">
                    <div class="stat-item">
                        <span class="stat-label">إجمالي الشعب</span>
                        <span class="stat-value" id="total-sections-count">-</span>
                    </div>
                </div>
            </div>

            <div class="mgmt-layout">
                <!-- Sidebar: Navigation -->
                <aside class="mgmt-sidebar">
                    <div class="sidebar-header">الشعب الدراسية</div>
                    <div id="sections-list" class="sections-nav">
                        <div class="skeleton-nav"></div>
                    </div>
                </aside>

                <!-- Main Content -->
                <main class="mgmt-content">
                    <div class="content-card">
                        <div class="card-header">
                            <div class="section-info">
                                <h2 id="active-section-name">اختر شعبة للبدء</h2>
                                <span class="badge-pill" id="student-count-badge">0 طالب</span>
                            </div>
                            <div class="search-box">
                                <i class="ph ph-magnifying-glass"></i>
                                <input type="text" id="student-search" placeholder="بحث عن طالب في هذه الشعبة...">
                            </div>
                        </div>

                        <div id="students-table-container" class="table-responsive">
                            <div class="empty-welcome">
                                <i class="ph ph-hand-pointing"></i>
                                <p>يرجى اختيار شعبة من القائمة الجانبية لعرض قائمة الطلاب وإدارة عمليات النقل.</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    `;
};

SectionManagementPage.init = async () => {
    const container = document.getElementById('sections-list');
    const tableContainer = document.getElementById('students-table-container');
    const badge = document.getElementById('student-count-badge');
    const sectionTitle = document.getElementById('active-section-name');
    const totalCount = document.getElementById('total-sections-count');
    const searchInput = document.getElementById('student-search');

    let allStudents = [];
    let currentActiveSection = null;

    const fetchSections = async () => {
        try {
            // First fetch users to get sections they belong to + the actual sections table
            const res = await api._fetch('/api/admin/users');
            const sectionsRes = await api._fetch('/api/sections'); // Assuming this exists or getting from users
            
            let sections = sectionsRes.sections || [];
            
            // If API didn't return sections, fallback to extracting from user data
            if (sections.length === 0 && res.users) {
                const uniqueSections = [...new Set(res.users.map(u => u.section_id).filter(s => s))];
                sections = uniqueSections.map(s => ({ id: s, name: s }));
            }

            totalCount.innerText = sections.length;
            
            container.innerHTML = sections.map(s => `
                <div class="nav-section-item" data-id="${s.id}">
                    <div class="item-icon"><i class="ph ph-layout"></i></div>
                    <div class="item-label">شعبة ${s.name || s.id}</div>
                    <div class="item-arrow"><i class="ph ph-caret-left"></i></div>
                </div>
            `).join('');

            // Click events
            document.querySelectorAll('.nav-section-item').forEach(item => {
                item.onclick = () => {
                    document.querySelectorAll('.nav-section-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    loadStudents(item.dataset.id);
                };
            });

        } catch (err) {
            container.innerHTML = `<div class="error-box">حدث خطأ في جلب الأقسام</div>`;
        }
    };

    const loadStudents = async (sectionId) => {
        currentActiveSection = sectionId;
        tableContainer.innerHTML = '<div class="loader-wrap"><div class="premium-loader"></div><p>جاري مزامنة بيانات الشعبة...</p></div>';
        
        try {
            const res = await api._fetch(`/api/admin/section-students?section_id=${sectionId}`);
            allStudents = res.students || [];
            renderTable(allStudents);
            sectionTitle.innerText = `طلاب شعبة ${sectionId}`;
            badge.innerText = `${allStudents.length} طالب`;
        } catch (err) {
            tableContainer.innerHTML = `<div class="error-msg">${err.message}</div>`;
        }
    };

    const renderTable = (students) => {
        if (students.length === 0) {
            tableContainer.innerHTML = `<div class="empty-results"><i class="ph ph-users-slash"></i><p>لا يوجد طلاب مسجلين في هذه الشعبة حالياً.</p></div>`;
            return;
        }

        tableContainer.innerHTML = `
            <table class="mgmt-table">
                <thead>
                    <tr>
                        <th>الطالب</th>
                        <th>البريد الإلكتروني</th>
                        <th>الحالة</th>
                        <th class="text-center">الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => `
                        <tr>
                            <td>
                                <div class="student-profile">
                                    <div class="avatar-circle">${s.full_name.charAt(0)}</div>
                                    <span class="name">${s.full_name}</span>
                                </div>
                            </td>
                            <td><span class="email-tag">${s.email}</span></td>
                            <td><span class="status-pill online">نشط</span></td>
                            <td class="text-center">
                                <button class="action-btn-transfer" data-id="${s.id}" data-name="${s.full_name}" data-current="${s.section_id}">
                                    <i class="ph ph-shuffle"></i> نقل الشعبة
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        document.querySelectorAll('.action-btn-transfer').forEach(btn => {
            btn.onclick = () => showTransferModal(btn.dataset.id, btn.dataset.name, btn.dataset.current);
        });
    };

    const showTransferModal = async (studentId, name, currentSection) => {
        const sectionsRes = await api._fetch('/api/sections');
        const sections = sectionsRes.sections || [];

        await UI.modal('إعادة توزيع الطالب', `
            <div class="pwa-modal-body">
                <div class="alert-info-v2">
                    <i class="ph-fill ph-info"></i>
                    <p>نظام النقل يحافظ على درجات الطالب وتقارير غيابه وتنبيهاته بشكل كامل.</p>
                </div>
                <div class="transfer-entity">
                    <div class="entity-label">الطالب المستهدف</div>
                    <div class="entity-name">${name}</div>
                </div>
                <div class="form-group">
                    <label>الشعبة الجديدة</label>
                    <select id="new-section-select" class="premium-select">
                        ${sections.map(s => `<option value="${s.id}" ${s.id === currentSection ? 'disabled' : ''}>شعبة ${s.name || s.id}</option>`).join('')}
                    </select>
                </div>
                <div class="confirmation-warning">
                    بمجرد النقل، سيتم سحب صلاحيات الوصول للمواد القديمة ومنح الطالب حق الوصول لمحتوى الشعبة الجديدة فوراً.
                </div>
            </div>
        `, async () => {
            const newSid = document.getElementById('new-section-select').value;
            try {
                const res = await api._fetch('/api/admin/transfer-student', {
                    method: 'POST', body: JSON.stringify({ student_id: studentId, new_section_ids: [newSid] })
                });
                if (res.success) {
                    UI.toast('تمت عملية النقل بنجاح', 'success');
                    loadStudents(currentActiveSection);
                    return true;
                }
            } catch (err) { UI.toast(err.message, 'error'); return false; }
        });
    };

    // Search Logic
    searchInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const filtered = allStudents.filter(s => s.full_name.toLowerCase().includes(val) || s.email.toLowerCase().includes(val));
        renderTable(filtered);
    };

    fetchSections();
};

export default SectionManagementPage;
