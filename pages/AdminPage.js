/* AdminPage.js - 3Minds Platform - Complete */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

const AdminPage = async () => {
    const selectedSectionId = api.getSelectedSection();
    let subjects = [], users = [], announcements = [], stats = {};
    try {
        [subjects, users, announcements, stats] = await Promise.all([
            api.getSubjects(selectedSectionId),
            api.getUsers(selectedSectionId),
            api.getAnnouncements(),
            api.getStats()
        ]);
    } catch (e) {
        return `<div class="error-state"><i class="ph ph-warning-circle"></i><h3>${i18n.t('error')}</h3><p>${e.message}</p></div>`;
    }

    const user = auth.getUser();
    const sections = await api.getSections();

    // Stats filtering logic (api already filters based on headers, but we might want to group by section for super admin)
    const teachers = users.filter(u => u.role === 'teacher');
    const committees = users.filter(u => u.role === 'committee');
    const sectionAdmins = users.filter(u => u.role === 'section_admin');
    const students = users.filter(u => u.role === 'student');

    return `
        <div class="admin-page">
            <div class="page-header">
                <div>
                    <h1><i class="ph ph-shield-star" style="color: var(--primary);"></i> ${i18n.t('admin_panel')}</h1>
                    <p class="text-muted">${i18n.t('admin_panel_subtitle')}</p>
                </div>
                <div style="display:flex; gap:1rem; align-items:center;">
                    ${user.role === 'super_admin' ? `
                        <select id="super-section-switch" class="btn btn-ghost" style="padding:0.5rem 1rem; border:1px solid var(--border);">
                            <option value="">${i18n.t('all_sections') || 'كل الأقسام'}</option>
                            ${sections.map(s => `<option value="${s.id}" ${selectedSectionId === s.id ? 'selected' : ''}>${i18n.t(s.id)}</option>`).join('')}
                        </select>
                    ` : ''}
                    <button class="btn btn-ghost" data-path="/home">
                        <i class="ph ph-house"></i> ${i18n.t('back')}
                    </button>
                </div>
            </div>

            <!-- Dashboard Stats -->
            <div class="stats-grid">
                <div class="stat-card stat-indigo">
                    <i class="ph ph-users-four"></i>
                    <div>
                        <span class="stat-num">${users.length}</span>
                        <span class="stat-label">${i18n.t('total_users')}</span>
                    </div>
                </div>
                <div class="stat-card stat-purple">
                    <i class="ph ph-books"></i>
                    <div>
                        <span class="stat-num">${subjects.length}</span>
                        <span class="stat-label">${i18n.t('total_subjects')}</span>
                    </div>
                </div>
                <div class="stat-card stat-amber">
                    <i class="ph ph-circles-four"></i>
                    <div>
                        <span class="stat-num">${sections.length}</span>
                        <span class="stat-label">${i18n.t('total_sections')}</span>
                    </div>
                </div>
                <div class="stat-card stat-green">
                    <i class="ph ph-shield-check"></i>
                    <div>
                        <span class="stat-num">${sectionAdmins.length + committees.length}</span>
                        <span class="stat-label">${i18n.t('admins_and_committees')}</span>
                    </div>
                </div>
            </div>

            <div class="admin-grid">

                <!-- Announcements Management -->
                <div class="card admin-card full-width-card">
                    <div class="card-header">
                        <h3><i class="ph ph-megaphone-simple"></i> ${i18n.t('announcements')}</h3>
                        <button id="add-announcement-btn" class="btn btn-primary btn-sm">
                            <i class="ph ph-plus"></i> ${i18n.t('add_announcement')}
                        </button>
                    </div>
                    <div class="ann-admin-list">
                        ${announcements.length === 0 ? `<p class="empty-msg">${i18n.t('no_announcements_yet')}</p>` :
            announcements.map(a => `
                            <div class="ann-admin-item">
                                <div class="ann-admin-content">
                                    <i class="ph ph-megaphone" style="color: var(--primary); font-size: 1.2rem;"></i>
                                    <div>
                                        <div style="font-weight:600;">${i18n.t(a.section_id)}</div>
                                        <span style="font-size:0.95rem;">${a.content}</span>
                                    </div>
                                </div>
                                <div class="ann-admin-actions">
                                    <small style="color: var(--text-muted);">${formatDate(a.created_at)}</small>
                                    <button class="icon-btn del-ann-btn" data-id="${a.id}">
                                        <i class="ph ph-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Subjects Management -->
                <div class="card admin-card">
                    <div class="card-header">
                        <h3><i class="ph ph-books"></i> ${i18n.t('subjects')}</h3>
                        <button id="add-subject-btn" class="btn btn-primary btn-sm">
                            <i class="ph ph-plus"></i> ${i18n.t('add_subject')}
                        </button>
                    </div>
                    <div class="list-container">
                        ${subjects.length === 0 ? `<p class="empty-msg">${i18n.t('no_subjects')}</p>` :
            subjects.map(s => `
                            <div class="list-item" style="border-right: 4px solid ${s.color || '#4f46e5'};">
                                <div class="list-item-info">
                                    <div style="font-weight:600;">${s.title} <span class="badge badge-outline">${i18n.t(s.section_id)}</span></div>
                                    <span class="code-tag">${s.code}</span>
                                </div>
                                <div class="list-item-actions">
                                    ${user.role === 'super_admin' ? `
                                        <button class="icon-btn edit-sub-btn" data-id="${s.id}" 
                                                data-title="${s.title}" data-code="${s.code || ''}" 
                                                data-desc="${s.description || ''}" data-color="${s.color || '#4f46e5'}">
                                            <i class="ph ph-pencil-simple"></i>
                                        </button>
                                        <button class="icon-btn del-sub-btn" data-id="${s.id}" data-title="${s.title}">
                                            <i class="ph ph-trash"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- User Management (All Roles) -->
                <div class="card admin-card">
                    <div class="card-header">
                        <h3><i class="ph ph-users"></i> ${i18n.t('user_management')}</h3>
                        <button id="add-any-user-btn" class="btn btn-primary btn-sm">
                            <i class="ph ph-plus"></i> ${i18n.t('create_account')}
                        </button>
                    </div>
                    <div class="list-container">
                        ${users.length === 0 ? `<p class="empty-msg">${i18n.t('no_users')}</p>` :
            users.map(u => `
                            <div class="list-item">
                                <div class="list-item-info">
                                    <div style="display:flex; align-items:center; gap: 0.75rem;">
                                        <i class="ph ph-circle-wavy-check" style="font-size:1.5rem; color: var(--primary);"></i>
                                        <div>
                                            <div style="font-weight:700; font-size:1rem;">${u.full_name || u.email}</div>
                                            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">${u.email}</div>
                                            <div style="display:flex; gap:0.4rem; margin-top:2px; flex-wrap:wrap;">
                                                <span class="role-pill role-${u.role}">${i18n.t(u.role)}</span>
                                                ${(u.sections && u.sections.length > 0) 
                                                    ? u.sections.map(s => `<span class="badge badge-light">${i18n.t(s)}</span>`).join('') 
                                                    : (u.section_id ? `<span class="badge badge-light">${i18n.t(u.section_id)}</span>` : '')}
                                                 <span class="badge ${u.device_count > 0 ? 'badge-primary' : 'badge-light'}" title="${i18n.t('linked_devices')}">
                                                     <i class="ph ph-devices"></i> ${u.device_count || 0}/3
                                                 </span>
                                             </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="list-item-actions">
                                    <button class="icon-btn reset-device-btn" data-id="${u.id}" title="${i18n.t('reset_device')}">
                                        <i class="ph ph-arrows-counter-clockwise"></i>
                                    </button>
                                    <button class="icon-btn icon-btn-red del-student-btn" data-id="${u.id}" data-email="${u.full_name || u.email}">
                                        <i class="ph ph-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

            </div>

        <!-- Developer Credits - Perfectly Matched Frame -->
        <footer style="
            width: 100%;
            margin-top: 3rem;
            padding: 1rem 0;
        ">
            <div class="card credits-card" style="
                background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 20px;
                padding: 1.5rem;
                position: relative;
                overflow: hidden;
                box-shadow: 0 10px 40px rgba(49, 46, 129, 0.3);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1rem;
            ">
                <!-- Background image overlay -->
                <div style="
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    background-image: url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600');
                    background-size: cover; background-position: center; opacity: 0.15; mix-blend-mode: overlay; z-index: 1;
                "></div>

                <!-- Content -->
                <div style="position: relative; z-index: 2; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; color: #cbd5e1; font-size: 0.8rem; direction: ltr; opacity: 0.9;">
                        <span style="font-weight: 800; letter-spacing: 0.5px; color: #fff;">DEPARTMENT OF CYBERSECURITY</span>
                        <span style="width: 3px; height: 3px; background: #4f46e5; border-radius: 50%;"></span>
                        <span>Supervision: <strong style="color: #4f46e5;">Dr. Muhaned Qasim</strong></span>
                    </div>
                    
                    <div style="display: flex; justify-content: center; gap: 1.25rem; flex-wrap: wrap; direction: ltr;">
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 700; color: #fff;">
                            <i class="ph ph-circle-wavy-check" style="font-size: 1rem; color: #4f46e5;"></i>
                            Alhakam Anmar
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 700; color: #fff;">
                            <i class="ph ph-circle-wavy-check" style="font-size: 1rem; color: #4f46e5;"></i>
                            Mena Sabri
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 700; color: #fff;">
                            <i class="ph ph-circle-wavy-check" style="font-size: 1rem; color: #4f46e5;"></i>
                            Danya Majed
                        </div>
                    </div>

                    <p style="font-size: 0.65rem; color: rgba(203, 213, 225, 0.3); letter-spacing: 0.3px;">
                        3MINDS ACADEMIC © 2026 — AL-NAHRAIN UNIVERSITY
                    </p>
                </div>
            </div>
        </footer>

        </div>
    `;
};

AdminPage.init = () => {
    const user = auth.getUser();

    // ─── Super Admin Section Switch ──────────────────────────
    const superSwitch = document.getElementById('super-section-switch');
    if (superSwitch) {
        superSwitch.addEventListener('change', (e) => {
            api.setSelectedSection(e.target.value);
            location.reload();
        });
    }

    // ─── Announcements ───────────────────────────────────────
    const addAnnBtn = document.getElementById('add-announcement-btn');
    if (addAnnBtn) {
        addAnnBtn.addEventListener('click', async () => {
            const sections = await api.getSections();
            const result = await UI.modal(i18n.t('add_announcement'), `
                    ${user.role === 'super_admin' ? `
                        <div class="form-group">
                            <label class="form-label">${i18n.t('select_section')}</label>
                            <select id="ann-section" class="form-input">
                                ${sections.map(s => `<option value="${s.id}">${i18n.t(s.id)}</option>`).join('')}
                            </select>
                        </div>
                    ` : ''}
                    <div class="form-group">
                        <label class="form-label">${i18n.t('content')}</label>
                        <textarea id="ann-content" style="height: 120px;" placeholder="..."></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">${i18n.t('event_date')}</label>
                        <input type="datetime-local" id="ann-target-date" class="form-input">
                    </div>
                `, async () => {
                const content = document.getElementById('ann-content').value.trim();
                const sidEl = document.getElementById('ann-section');
                const targetDateEl = document.getElementById('ann-target-date');
                const sid = sidEl ? sidEl.value : null;
                const targetDate = targetDateEl ? targetDateEl.value : null;
                if (!content) return false;
                await api.addAnnouncement(content, sid, targetDate || null);
                return true;
            });
            if (result) location.reload();
        });
    }

    document.querySelectorAll('.del-ann-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await UI.confirm(i18n.t('confirm_delete'));
            if (ok) { await api.deleteAnnouncement(btn.dataset.id); location.reload(); }
        });
    });

    // ─── Subjects ────────────────────────────────────────────
    const addSubBtn = document.getElementById('add-subject-btn');
    if (addSubBtn) {
        addSubBtn.addEventListener('click', async () => {
            const sections = await api.getSections();
            const result = await UI.modal(i18n.t('add_subject'), `
                ${user.role === 'super_admin' ? `
                    <div class="form-group">
                        <label class="form-label">${i18n.t('select_section')}</label>
                        <select id="s-section" class="form-input">
                            ${sections.map(s => `<option value="${s.id}">${i18n.t(s.id)}</option>`).join('')}
                        </select>
                    </div>
                ` : ''}
                <div class="form-group">
                    <label class="form-label">${i18n.t('title')}</label>
                    <input id="s-title" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('code')}</label>
                    <input id="s-code" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('description')}</label>
                    <textarea id="s-desc"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">اللون</label>
                    <input type="color" id="s-color" value="#4f46e5" style="height:45px;" />
                </div>
            `, async () => {
                const title = document.getElementById('s-title').value.trim();
                if (!title) return false;
                const secEl = document.getElementById('s-section');
                await api.addSubject({
                    title,
                    code: document.getElementById('s-code').value.trim(),
                    description: document.getElementById('s-desc').value.trim(),
                    color: document.getElementById('s-color').value,
                    section_id: secEl ? secEl.value : null
                });
                return true;
            });
            if (result) location.reload();
        });
    }

    document.querySelectorAll('.del-sub-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await UI.confirm(`${i18n.t('confirm_delete')} (${btn.dataset.title})`);
            if (ok) { await api.deleteSubject(btn.dataset.id); location.reload(); }
        });
    });

    document.querySelectorAll('.edit-sub-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const res = await UI.modal(i18n.lang === 'ar' ? 'تعديل المادة' : 'Edit Subject', `
                <div class="form-group">
                    <label class="form-label">${i18n.t('title')}</label>
                    <input id="edit-s-title" value="${btn.dataset.title}" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('code')}</label>
                    <input id="edit-s-code" value="${btn.dataset.code}" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('description')}</label>
                    <textarea id="edit-s-desc">${btn.dataset.desc}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.lang === 'ar' ? 'لون المادة' : 'Subject Color'}</label>
                    <input type="color" id="edit-s-color" value="${btn.dataset.color}" style="height:45px;" />
                </div>
            `, async () => {
                const title = document.getElementById('edit-s-title').value.trim();
                const code = document.getElementById('edit-s-code').value.trim();
                const description = document.getElementById('edit-s-desc').value.trim();
                const color = document.getElementById('edit-s-color').value;

                if (!title) return false;
                await api.updateSubject(id, { title, code, description, color });
                return true;
            });
            if (res) location.reload();
        });
    });

    // ─── Unified User Management ──────────────────────────────
    const addUserBtn = document.getElementById('add-any-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', async () => {
            const sections = await api.getSections();
            const subjects = await api.getSubjects();
            const currentUser = auth.getUser();

            const result = await UI.modal(i18n.t('create_account'), `
                <style>
                    .create-user-form .form-group { margin-bottom: 1rem; }
                    .create-user-form label { font-weight: 600; font-size: 0.85rem; color: var(--text-muted); display:block; margin-bottom: 0.35rem; }
                    .create-user-form input, .create-user-form select { width: 100%; padding: 0.7rem 1rem; border: 1.5px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 0.95rem; }
                    .create-user-form input:focus, .create-user-form select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.12); }
                    .form-section-title { font-size: 0.8rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin: 1.25rem 0 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
                    .multi-select-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
                    .section-checkbox { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; border: 1.5px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s; }
                    .section-checkbox:hover { border-color: var(--primary); background: rgba(79,70,229,0.05); }
                    .section-checkbox input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primary); }
                    .section-checkbox.checked { border-color: var(--primary); background: rgba(79,70,229,0.08); }
                </style>
                <div class="create-user-form">
                    <div class="form-section-title"><i class="ph ph-user"></i> المعلومات الشخصية</div>
                    <div class="form-group">
                        <label>الاسم الثلاثي (الاسم + اسم الأب + اسم العائلة)</label>
                        <input type="text" id="u-fullname" placeholder="مثال: أحمد علي حسن" autocomplete="off" />
                    </div>
                    <div class="form-group">
                        <label>${i18n.t('email')}</label>
                        <input type="email" id="u-email" placeholder="user@3minds.edu" />
                    </div>
                    <div class="form-group">
                        <label>${i18n.t('password')}</label>
                        <input type="password" id="u-pass" placeholder="8+ أحرف" />
                    </div>

                    <div class="form-section-title"><i class="ph ph-shield"></i> الدور والصلاحيات</div>
                    <div class="form-group">
                        <label>${i18n.t('role')}</label>
                        <select id="u-role" class="form-input">
                            <option value="student">${i18n.t('student')}</option>
                            <option value="teacher">${i18n.t('teacher')}</option>
                            ${currentUser.role === 'super_admin' ? `
                                <option value="committee">${i18n.t('committee')}</option>
                                <option value="head_dept">${i18n.t('head_dept')}</option>
                                <option value="section_admin">${i18n.t('section_admin')}</option>
                                <option value="super_admin">${i18n.t('super_admin')}</option>
                            ` : ''}
                        </select>
                    </div>

                    <div id="section-select-wrapper">
                        <div class="form-section-title"><i class="ph ph-circles-four"></i> الشُعب المخصصة</div>
                        <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.75rem;">
                            اختر شعبة واحدة أو أكثر لتعيين هذا المستخدم إليها
                        </p>
                        <div class="multi-select-grid" id="sections-grid">
                            ${sections.length === 0 
                                ? `<p style="color:var(--text-muted); font-size:0.85rem; grid-column:1/-1;">لا توجد شُعب متاحة. أضف شُعباً أولاً.</p>`
                                : sections.map(s => `
                                    <label class="section-checkbox" id="section-card-${s.id}">
                                        <input type="checkbox" id="chk-sec-${s.id}" value="${s.id}" style="display:none;" onchange="this.parentElement.classList.toggle('checked', this.checked)" />
                                        <i class="ph ph-circles-three-plus" style="color:var(--primary); font-size:1.2rem;"></i>
                                        <div>
                                            <div style="font-weight:700; font-size:0.9rem;">${i18n.t(s.id)}</div>
                                        </div>
                                    </label>
                                `).join('')
                            }
                        </div>
                    </div>

                    <div id="subject-assign-wrapper" style="display:none;">
                        <div class="form-section-title"><i class="ph ph-books"></i> تعيين المواد الدراسية</div>
                        <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.75rem;">
                            اختر مادة واحدة أو أكثر سيدرّسها هذا الأستاذ
                        </p>
                        <div class="multi-select-grid" id="courses-grid">
                            ${subjects.length === 0 
                                ? `<p style="color:var(--text-muted); font-size:0.85rem; grid-column:1/-1;">لا توجد مواد متاحة. أضف مواد أولاً.</p>`
                                : subjects.map(s => `
                                    <label class="section-checkbox" id="course-card-${s.id}">
                                        <input type="checkbox" id="chk-${s.id}" value="${s.id}" style="display:none;" onchange="this.parentElement.classList.toggle('checked', this.checked)" />
                                        <i class="ph ph-book-open-text" style="color:${s.color || 'var(--primary)'}; font-size:1.2rem;"></i>
                                        <div>
                                            <div style="font-weight:700; font-size:0.9rem;">${s.title}</div>
                                            <div style="font-size:0.75rem; color:var(--text-muted);">${i18n.t(s.section_id)} · ${s.code || ''}</div>
                                        </div>
                                    </label>
                                `).join('')
                            }
                        </div>
                    </div>
                </div>
            `, async () => {
                const full_name = document.getElementById('u-fullname').value.trim();
                const email = document.getElementById('u-email').value.trim();
                const pass = document.getElementById('u-pass').value;
                const role = document.getElementById('u-role').value;

                // Collect all checked section IDs
                const checkedSectionBoxes = document.querySelectorAll('#sections-grid input[type=checkbox]:checked');
                const section_ids = Array.from(checkedSectionBoxes).map(cb => cb.value).filter(Boolean);

                // Collect all checked course IDs
                const checkedBoxes = document.querySelectorAll('#courses-grid input[type=checkbox]:checked');
                const subject_ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value)).filter(Boolean);

                if (!full_name) { UI.toast('الاسم الثلاثي مطلوب', 'error'); return false; }
                if (!email || !pass) { UI.toast('البريد وكلمة المرور مطلوبان', 'error'); return false; }
                
                // Allow empty section_ids if it's a global role, otherwise show an error if none selected
                const globalRoles = ['super_admin', 'committee', 'head_dept'];
                if (!globalRoles.includes(role) && section_ids.length === 0) {
                    UI.toast('يجب تحديد شعبة واحدة على الأقل', 'error'); return false;
                }

                await api.addUser(email, pass, role, section_ids, full_name, subject_ids);
                return true;
            });
            if (result) location.reload();

            // UI logic: toggle section/subject based on role
            const roleSel = document.getElementById('u-role');
            const sidWrapper = document.getElementById('section-select-wrapper');
            const subjectWrapper = document.getElementById('subject-assign-wrapper');

            const updateVisibility = () => {
                const r = roleSel ? roleSel.value : '';
                const globalRoles = ['super_admin', 'committee', 'head_dept'];
                if (sidWrapper) sidWrapper.style.display = globalRoles.includes(r) ? 'none' : 'block';
                if (subjectWrapper) subjectWrapper.style.display = r === 'teacher' ? 'block' : 'none';
            };

            if (roleSel) {
                updateVisibility();
                roleSel.addEventListener('change', updateVisibility);
            }
        });
    }

    document.querySelectorAll('.reset-device-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (await UI.confirm(i18n.t('reset_device'))) {
                await api.resetDevice(btn.dataset.id);
                location.reload();
            }
        });
    });

    document.querySelectorAll('.del-student-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (await UI.confirm(i18n.t('confirm_delete'))) {
                await api.deleteUser(btn.dataset.id);
                location.reload();
            }
        });
    });
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return dateStr; }
}

export default AdminPage;
