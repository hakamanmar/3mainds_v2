/* SubjectPage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';
import { UI } from '/static/js/ui.js';

/* No longer using Google Drive - files uploaded directly to server */

const getFileType = (url) => {
    if (!url) return 'PDF';
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'Video';
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'Audio';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'Image';
    return 'PDF';
};

const typeIcon = { 'PDF': 'ph-file-pdf', 'Video': 'ph-video', 'Image': 'ph-image-square' };
const typeColor = { 'PDF': '#ef4444', 'Video': '#8b5cf6', 'Image': '#10b981' };

const SubjectPage = async (params) => {
    const id = params.id;
    let subject = {};
    let lessons = [];
    let assignments = [];

    try {
        const [subRes, assignmentsRes] = await Promise.all([
            api.getSubject(id),
            api.getAssignments(id)
        ]);
        if (subRes) {
            subject = subRes.subject || {};
            lessons = subRes.lessons || [];
        }
        assignments = assignmentsRes || [];
    } catch (e) {
        return `<div class="error-state">
            <i class="ph ph-warning-circle"></i>
            <h3>تعذّر تحميل المادة</h3>
            <p>${e.message || 'يرجى المحاولة مجدداً'}</p>
            <button class="btn btn-primary" data-path="/">العودة للرئيسية</button>
        </div>`;
    }

    const user = auth.getUser();
    const isSuper = user && user.role === 'super_admin';
    const isAdmin = user && ['super_admin', 'section_admin', 'teacher', 'admin'].includes(user.role); // keeping admin just in case of old DB entries, but teacher is now included
    const isStudent = user && (user.role === 'student' || user.role === 'super_admin');

    return `
        <div class="subject-page">
            <button class="back-btn" data-path="/">
                <i class="ph ph-arrow-${i18n.lang === 'ar' ? 'right' : 'left'}"></i>
                ${i18n.t('back')}
            </button>

            <div class="subject-hero" style="border-color: ${subject.color || '#4f46e5'};">
                <div class="subject-hero-accent" style="background: ${subject.color || '#4f46e5'};"></div>
                <div class="subject-hero-content">
                    <div>
                        <h1>${subject.title || 'غير معروف'}</h1>
                        <span class="subject-code-badge" style="background: ${subject.color || '#4f46e5'}20; color: ${subject.color || '#4f46e5'}; border: 1px solid ${subject.color || '#4f46e5'}40;">
                            ${subject.code || ''}
                        </span>
                        <p style="margin-top: 0.75rem; color: var(--text-muted);">${subject.description || ''}</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        ${isStudent ? `
                            <button class="btn btn-outline" id="student-attendance-btn" style="white-space: nowrap; border-color: ${subject.color || '#4f46e5'}; color: ${subject.color || '#4f46e5'};">
                                <i class="ph ph-qr-code"></i>
                                ${i18n.t('scan_attendance') || 'تسجيل الحضور'}
                            </button>
                        ` : ''}
                        ${isAdmin ? `
                            <button class="btn btn-primary" id="add-lesson-here-btn" style="white-space: nowrap;">
                                <i class="ph ph-plus-circle"></i>
                                ${i18n.t('add_lesson')}
                            </button>
                        ` : ''}
                        ${isSuper ? `
                            <button class="btn btn-outline" id="edit-subject-btn" style="border-color: #f59e0b; color: #f59e0b;" title="${i18n.lang === 'ar' ? 'تعديل المادة' : 'Edit Subject'}">
                                <i class="ph ph-pencil-simple"></i>
                            </button>
                            <button class="btn btn-outline" id="delete-subject-btn" style="border-color: #ef4444; color: #ef4444;" title="${i18n.lang === 'ar' ? 'حذف المادة' : 'Delete Subject'}">
                                <i class="ph ph-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="lessons-section">
                <h2 class="section-title">
                    <i class="ph ph-files" style="color: ${subject.color || '#4f46e5'};"></i>
                    ${i18n.t('materials')}
                    <span class="count-pill">${lessons.length}</span>
                </h2>

                ${lessons.length === 0 ?
            `<div class="empty-state" style="margin-top: 2rem;">
                        <i class="ph ph-folder-open"></i>
                        <h3>${i18n.t('no_materials')}</h3>
                        <p>لم يتم رفع أي دروس لهذه المادة بعد</p>
                    </div>` :
            `<div class="lessons-grid" id="lessons-container">
                        ${lessons.map((item, idx) => {
                const icon = typeIcon[item.type] || 'ph-file';
                const color = typeColor[item.type] || '#4f46e5';
                const encodedUrl = encodeURIComponent(item.url || '');
                const encodedName = encodeURIComponent(item.title || 'ملف');
                return `
                                <div class="lesson-card" data-id="${item.id}">
                                    <div class="lesson-num">${idx + 1}</div>
                                    <div class="lesson-icon" style="background: ${color}15; color: ${color};">
                                        <i class="ph ${icon}"></i>
                                    </div>
                                    <div class="lesson-info">
                                        <h4>${item.title}</h4>
                                        <span class="lesson-type" style="color: ${color};">${item.type || 'PDF'}</span>
                                    </div>
                                    <div class="lesson-actions">
                                        <button data-path="/viewer?url=${encodedUrl}&name=${encodedName}"
                                                class="btn btn-primary lesson-btn">
                                            <i class="ph ph-eye"></i>
                                            ${i18n.t('view')}
                                        </button>
                                        <a href="${item.url}?download=1"
                                           class="btn lesson-btn" style="background: #10b981; color: white; text-decoration: none;">
                                            <i class="ph ph-download-simple"></i>
                                            ${i18n.t('download')}
                                        </a>

                                        ${isAdmin ? `
                                            <button class="btn delete-lesson-btn" data-id="${item.id}"
                                                    style="background: #fee2e2; color: #ef4444;">
                                                <i class="ph ph-trash"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>`
        }
            </div>

            <div class="assignments-section" style="margin-top: 3rem; padding-bottom: 2rem;">
                <h2 class="section-title">
                    <i class="ph ph-notebook" style="color: #f59e0b;"></i>
                    ${i18n.t('homework')}
                    <span class="count-pill" style="background: #fffbeb; color: #f59e0b;">${assignments.length}</span>
                </h2>

                <div style="display: flex; gap: 15px; margin-bottom: 1.5rem;">
                    ${isAdmin ? `
                        <button class="btn btn-primary" id="add-assignment-btn" style="background: #f59e0b; border: none;">
                            <i class="ph ph-plus-circle"></i>
                            ${i18n.t('add_assignment')}
                        </button>
                    ` : ''}
                </div>

                ${assignments.length === 0 ?
            `<div class="empty-state">
                        <i class="ph ph-stack"></i>
                        <h3>${i18n.t('no_assignments')}</h3>
                    </div>` :
            `<div class="assignments-grid">
                        ${assignments.map(a => `
                            <div class="card assignment-card" style="margin-bottom: 1rem; border-right: 4px solid #f59e0b;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                        <h3 style="margin-bottom: 5px;">${a.title}</h3>
                                        <p style="font-size: 14px; color: var(--text-muted);">${a.description || ''}</p>
                                        <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                                            ${a.due_date ? `
                                                <span class="tag ${new Date(a.due_date) < new Date() ? 'tag-low' : 'tag-ok'}">
                                                    <i class="ph ph-clock"></i> ${i18n.t('due_date')}: ${new Date(a.due_date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                                </span>
                                            ` : ''}
                                            <span class="tag tag-blue"><i class="ph ph-file-code"></i> ${a.allowed_formats}</span>
                                        </div>
                                    </div>
                                    <div style="display: flex; flex-direction: column; gap: 8px;">
                                        ${a.file_url ? `
                                            <a href="${a.file_url}" target="_blank" class="btn btn-sm btn-outline">
                                                <i class="ph ph-download"></i> ${i18n.t('view')}
                                            </a>
                                        ` : ''}
                                        ${isStudent ? `
                                            <button class="btn btn-sm btn-primary submit-solution-btn" 
                                                    data-id="${a.id}" 
                                                    data-formats="${a.allowed_formats}" 
                                                    style="background: #10b981; border: none;"
                                                    ${(a.due_date && new Date(a.due_date) < new Date()) ? 'disabled title="انتهى وقت التسليم"' : ''}>
                                                <i class="ph ph-upload-simple"></i> ${new Date(a.due_date) < new Date() ? 'انتهى الوقت' : i18n.t('submit_homework')}
                                            </button>
                                        ` : ''}
                                        ${isAdmin ? `
                                            <button class="btn btn-sm btn-outline view-submissions-btn" data-id="${a.id}">
                                                <i class="ph ph-users"></i> ${i18n.t('view_submissions')}
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>`
        }
            </div>
        </div>
    `;
};

SubjectPage.init = (params) => {
    const subjectId = params.id;
    const user = auth.getUser();

    // Edit Subject (Super Admin)
    const editSubBtn = document.getElementById('edit-subject-btn');
    if (editSubBtn) {
        editSubBtn.onclick = async () => {
            // Get current details (we already have them from subject object in SubjectPage scope, 
            // but we need to pass them to init, or rather we can just re-extract from DOM if needed, 
            // but better yet, let's just use the subject object if available. 
            // Wait, subject object is inside the async SubjectPage function, not SubjectPage.init.
            // I'll need to fetch it or pass it. 
            // Actually, let's just fetch the subject again to be sure or use params.id.

            const subData = await api.getSubject(subjectId);
            const sub = subData.subject;

            const res = await UI.modal(i18n.lang === 'ar' ? 'تعديل المادة' : 'Edit Subject', `
                <div class="form-group">
                    <label class="form-label">${i18n.t('title')}</label>
                    <input id="edit-s-title" value="${sub.title}" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('code')}</label>
                    <input id="edit-s-code" value="${sub.code || ''}" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('description')}</label>
                    <textarea id="edit-s-desc">${sub.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.lang === 'ar' ? 'لون المادة' : 'Subject Color'}</label>
                    <input type="color" id="edit-s-color" value="${sub.color || '#4f46e5'}" style="height:45px;" />
                </div>
            `, async () => {
                const title = document.getElementById('edit-s-title').value.trim();
                const code = document.getElementById('edit-s-code').value.trim();
                const description = document.getElementById('edit-s-desc').value.trim();
                const color = document.getElementById('edit-s-color').value;

                if (!title) return false;
                await api.updateSubject(subjectId, { title, code, description, color });
                return true;
            });
            if (res) window.location.reload();
        };
    }

    // Delete Subject (Super Admin)
    const delSubBtn = document.getElementById('delete-subject-btn');
    if (delSubBtn) {
        delSubBtn.onclick = async () => {
            const confirmed = await UI.confirm(i18n.lang === 'ar' ? 'هل أنت متأكد من حذف هذه المادة وجميع دروسها؟' : 'Are you sure you want to delete this subject and all its lessons?');
            if (confirmed) {
                await api.deleteSubject(subjectId);
                UI.toast(i18n.lang === 'ar' ? 'تم حذف المادة' : 'Subject deleted');
                window.router.navigate('/');
            }
        };
    }

    // Add Lesson button - now with file upload
    const addBtn = document.getElementById('add-lesson-here-btn');
    if (addBtn) {
        addBtn.onclick = async () => {
            const html = `
                <div class="form-group">
                    <label class="form-label">${i18n.t('lesson_title')}</label>
                    <input id="l-title" placeholder="${i18n.lang === 'ar' ? 'مثال: المحاضرة الأولى' : 'e.g. Lecture 1'}" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.lang === 'ar' ? 'رفع الملف (صورة أو PDF أو فيديو أو صوت...)' : 'Upload File (Image, PDF, Video, Audio...)'}</label>
                    <input type="file" id="l-file" class="form-input" accept=".pdf,.mp4,.mov,.webm,.mp3,.wav,.ogg,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.ppt,.pptx" />
                    <p style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${i18n.lang === 'ar' ? 'تدعم PDF ، فيديو، صوت، صور - حتى 500MB' : 'Supports PDF, Video, Audio, Images - up to 500MB'}</p>
                    <div id="upload-progress" style="display:none; margin-top:8px;">
                        <div style="height:6px; background:var(--border); border-radius:3px; overflow:hidden;">
                            <div id="progress-bar" style="height:100%; width:0%; background:var(--primary); transition:width 0.3s;"></div>
                        </div>
                        <small id="progress-text" style="color:var(--text-muted);"></small>
                    </div>
                </div>
            `;
            const result = await UI.modal(i18n.t('add_lesson'), html, async () => {
                const title = document.getElementById('l-title').value.trim();
                const fileInput = document.getElementById('l-file');

                if (!title) { UI.toast(i18n.lang === 'ar' ? 'العنوان مطلوب' : 'Title required', 'error'); return false; }
                if (!fileInput.files.length) { UI.toast(i18n.lang === 'ar' ? 'يرجى اختيار ملف' : 'Please select a file', 'error'); return false; }

                const file = fileInput.files[0];
                const ext = file.name.split('.').pop().toLowerCase();
                let type = 'PDF';
                if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) type = 'Video';
                else if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) type = 'Audio';
                else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) type = 'Image';

                // Show progress
                document.getElementById('upload-progress').style.display = 'block';
                const progressBar = document.getElementById('progress-bar');
                const progressText = document.getElementById('progress-text');

                // XHR with progress for large files
                const formData = new FormData();
                formData.append('subject_id', subjectId);
                formData.append('title', title);
                formData.append('type', type);
                formData.append('file', file);

                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/api/admin/add-lesson');
                    // Zero Trust: The 'auth_token' cookie is sent automatically by the browser.
                    // No need to send insecure user-role headers anymore.

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const pct = Math.round((e.loaded / e.total) * 100);
                            progressBar.style.width = pct + '%';
                            progressText.textContent = `${pct}% - ${(e.loaded / 1024 / 1024).toFixed(1)} MB`;
                        }
                    };
                    xhr.onload = () => {
                        const res = JSON.parse(xhr.responseText);
                        if (res.success) resolve(res);
                        else reject(new Error(res.error || 'Upload failed'));
                    };
                    xhr.onerror = () => reject(new Error('Network error'));
                    xhr.send(formData);
                });
                return true;
            });
            if (result) { UI.toast(i18n.t('success')); window.location.reload(); }
        };
    }

    // Delete lesson buttons
    document.querySelectorAll('.delete-lesson-btn').forEach(btn => {
        btn.onclick = async () => {
            const confirmed = await UI.confirm(i18n.t('confirm_delete'));
            if (confirmed) {
                await api.deleteLesson(btn.dataset.id);
                UI.toast(i18n.lang === 'ar' ? 'تم حذف الدرس' : 'Lesson deleted');
                window.location.reload();
            }
        };
    });

    // ─── Translation Panel ────────────────────────────────────
    // Translation feature was removed


    // Student Attendance Scan
    const attBtn = document.getElementById('student-attendance-btn');
    if (attBtn) {
        attBtn.onclick = async () => {
            const html = `
                <div style="text-align: center; padding: 10px;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;"><i class="ph ph-qr-code"></i></div>
                    <p>${i18n.t('scan_instruction') || 'أدخل الرمز الظاهر على شاشة الأستاذ لتسجيل حضورك'}</p>
                    <input id="qr-token-input" class="form-control" style="text-align: center; font-size: 1.5rem; letter-spacing: 2px; margin-top: 1rem;" placeholder="ABC123..." />
                </div>
            `;
            await UI.modal(i18n.t('scan_attendance') || 'تسجيل الحضور', html, async () => {
                const token = document.getElementById('qr-token-input').value.trim();
                if (!token) { UI.toast('يرجى إدخال الرمز', 'error'); return false; }
                const res = await api.scanQR(token, user.id);
                if (res.success) {
                    UI.toast(res.message);
                    return true;
                } else {
                    UI.toast(res.message, 'error');
                    return false;
                }
            });
        };
    }

    // Add Assignment (Teacher/Super)
    const addAssignBtn = document.getElementById('add-assignment-btn');
    if (addAssignBtn) {
        addAssignBtn.onclick = async () => {
            const html = `
                <div class="form-group">
                    <label class="form-label">${i18n.t('assignment_title')}</label>
                    <input id="a-title" placeholder="Homework 1..." />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('description')}</label>
                    <textarea id="a-desc" class="form-control" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('due_date')} والوقت</label>
                    <input type="datetime-local" id="a-due" class="form-control" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('allowed_formats')}</label>
                    <input id="a-formats" value=".pdf,.zip,.doc,.docx" />
                </div>
                <div class="form-group">
                    <label class="form-label">${i18n.t('upload_task_file')}</label>
                    <input type="file" id="a-file" class="form-control" />
                </div>
            `;
            const result = await UI.modal(i18n.t('add_assignment'), html, async () => {
                const title = document.getElementById('a-title').value.trim();
                const desc = document.getElementById('a-desc').value.trim();
                const due = document.getElementById('a-due').value;
                const formats = document.getElementById('a-formats').value.trim();
                const fileInput = document.getElementById('a-file');

                if (!title) { UI.toast('العنوان مطلوب', 'error'); return false; }

                let fileUrl = '';
                if (fileInput.files.length > 0) {
                    const uploadRes = await api.uploadFile(fileInput.files[0]);
                    fileUrl = uploadRes.url;
                }

                await api.addAssignment({
                    subject_id: subjectId,
                    teacher_id: user.id,
                    title, description: desc,
                    due_date: due, allowed_formats: formats,
                    file_url: fileUrl
                });
                return true;
            });
            if (result) { UI.toast(i18n.t('success')); window.location.reload(); }
        };
    }

    // Submit Solution (Student/Super)
    document.querySelectorAll('.submit-solution-btn').forEach(btn => {
        btn.onclick = async () => {
            const assignmentId = btn.dataset.id;
            const formats = btn.dataset.formats;
            const html = `
                <div style="text-align:center; padding: 20px;">
                    <i class="ph ph-upload-simple" style="font-size: 3rem; color: #10b981; margin-bottom: 1rem;"></i>
                    <p>${i18n.t('upload_solution')}</p>
                    <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 20px;">المسموح: ${formats}</p>
                    <input type="file" id="solution-file" class="form-control" accept="${formats}" />
                </div>
            `;
            const result = await UI.modal(i18n.t('submit_homework'), html, async () => {
                const fileInput = document.getElementById('solution-file');
                if (fileInput.files.length === 0) { UI.toast('يرجى اختيار ملف الحل', 'error'); return false; }

                const uploadRes = await api.uploadFile(fileInput.files[0]);
                await api.submitHomework({
                    assignment_id: assignmentId,
                    student_id: user.id,
                    file_url: uploadRes.url
                });
                return true;
            });
            if (result) { UI.toast(i18n.t('submission_success')); }
        };
    });

    // View Submissions (Teacher/Super)
    document.querySelectorAll('.view-submissions-btn').forEach(btn => {
        btn.onclick = () => {
            window.router.navigate(`/assignment/${btn.dataset.id}/submissions`);
        };
    });
};

export default SubjectPage;
