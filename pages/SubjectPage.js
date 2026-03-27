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
        const [subRes, assignmentsRes] = await Promise.allSettled([
            api.getSubject(id),
            api.getAssignments(id)
        ]);
        
        const subData = subRes.status === 'fulfilled' ? subRes.value : null;
        const assignmentsData = assignmentsRes.status === 'fulfilled' ? assignmentsRes.value : [];

        if (subData) {
            subject = subData.subject || {};
            lessons = subData.lessons || [];
        }
        assignments = assignmentsData || [];

        // If even the subject name is missing and we aren't loading, then we show error
        if (!subject.title && !navigator.onLine) {
             throw new Error('لم يتم تحميل هذه المادة مسبقاً للعمل بدون إنترنت');
        }
    } catch (e) {
        return `<div class="error-state">
            <i class="ph ph-wifi-slash" style="color:#fbbf24;font-size:3rem;margin-bottom:1rem;"></i>
            <h3 style="margin-bottom:0.5rem;">أنت غير متصل بالإنترنت</h3>
            <p style="color:var(--text-muted);margin-bottom:1.5rem;">${e.message || 'هذه الصفحة غير محفوظة حالياً للعمل بدون اتصال.'}</p>
            <button class="btn btn-primary" data-path="/">تصفح المواد المحفوظة</button>
        </div>`;
    }

    const user = auth.getUser();
    const isSuper = user && user.role === 'super_admin';
    const isAdmin = user && ['super_admin', 'section_admin', 'teacher', 'admin'].includes(user.role); // keeping admin just in case of old DB entries, but teacher is now included
    const isStudent = user && (user.role === 'student' || user.role === 'super_admin');

    return `
        <div class="subject-page-v2">
            <!-- Glass Header Navigation -->
            <div class="page-top-nav">
                <button class="glass-back-btn" data-path="/">
                    <i class="ph-bold ph-caret-${i18n.lang === 'ar' ? 'right' : 'left'}"></i>
                    <span>${i18n.t('back')}</span>
                </button>
                <div class="page-context-title">${subject.title || ''}</div>
            </div>

            <!-- Premium Hero Section -->
            <div class="subject-premium-hero" style="--subj-color: ${subject.color || '#4f46e5'}">
                <div class="hero-bg-accent"></div>
                <div class="hero-inner">
                    <div class="hero-left">
                        <div class="hero-badge-row">
                            <span class="premium-badge">
                                <i class="ph-fill ph-graduation-cap"></i>
                                ${subject.code || 'COURSE'}
                            </span>
                            ${subject.category ? `<span class="premium-tag">${subject.category}</span>` : ''}
                        </div>
                        <h1 class="hero-title">${subject.title || 'المادة الدراسية'}</h1>
                        <p class="hero-subtitle">${subject.description || 'مرحباً بك في صفحة المادة، هنا تجد كافة المحاضرات والواجبات.'}</p>
                    </div>
                    <div class="hero-right">
                        <div class="hero-actions-glass">
                            ${isStudent ? `
                                <button class="action-card-btn primary" id="student-attendance-btn">
                                    <div class="action-icon"><i class="ph-bold ph-qr-code"></i></div>
                                    <span>${i18n.t('scan_attendance')}</span>
                                </button>
                            ` : ''}
                            ${isAdmin ? `
                                <button class="action-card-btn secondary" id="add-lesson-here-btn">
                                    <div class="action-icon"><i class="ph-bold ph-plus"></i></div>
                                    <span>${i18n.t('add_lesson')}</span>
                                </button>
                            ` : ''}
                            ${isSuper ? `
                                <div class="super-quick-actions">
                                    <button class="mini-action-btn" id="edit-subject-btn" title="تعديل">
                                        <i class="ph-bold ph-pencil-simple"></i>
                                    </button>
                                    <button class="mini-action-btn danger" id="delete-subject-btn" title="حذف">
                                        <i class="ph-bold ph-trash"></i>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Grid Layout -->
            <div class="subject-content-layout">
                <!-- Left Column: Materials -->
                <div class="content-main-col">
                    <div class="section-header-v2">
                        <div class="section-title-wrap">
                            <div class="title-icon"><i class="ph-fill ph-folder-open"></i></div>
                            <h2>${i18n.t('materials')}</h2>
                            <span class="items-count-badge">${lessons.length}</span>
                        </div>
                    </div>

                    ${lessons.length === 0 ? `
                        <div class="premium-empty-state">
                            <div class="empty-art">
                                <i class="ph-light ph-files"></i>
                            </div>
                            <h3>لا توجد مواد دراسية</h3>
                            <p>لم يتم رفع أي محاضرات لهذه المادة حتى الآن.</p>
                        </div>
                    ` : `
                        <div class="premium-lessons-list">
                            ${lessons.map((item, idx) => {
                                const type = getFileType(item.url);
                                const icon = typeIcon[type] || 'ph-file';
                                const color = typeColor[type] || '#4f46e5';
                                const encodedUrl = encodeURIComponent(item.url || '');
                                const encodedName = encodeURIComponent(item.title || 'ملف');
                                return `
                                    <div class="lesson-row-card" data-id="${item.id}" style="--item-color: ${color}">
                                        <div class="row-left">
                                            <div class="row-icon-box">
                                                <i class="ph-bold ${icon}"></i>
                                                <div class="icon-ring"></div>
                                            </div>
                                            <div class="row-details">
                                                <h4>${item.title}</h4>
                                                <div class="row-meta">
                                                    <span class="meta-item"><i class="ph ph-calendar"></i> ${new Date().toLocaleDateString('ar-EG')}</span>
                                                    <span class="meta-item type-tag" style="background: ${color}10; color: ${color}">${type}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="row-right">
                                            <div class="row-actions">
                                                <a href="${item.url}" target="_blank" 
                                                   class="glass-action-btn view" title="${i18n.t('view')}">
                                                    <i class="ph-bold ph-eye"></i>
                                                </a>
                                                <a href="${item.url}" target="_blank" 
                                                   class="glass-action-btn download" title="${i18n.t('download')}">
                                                    <i class="ph-bold ph-download-simple"></i>
                                                </a>
                                                ${isAdmin ? `
                                                    <button class="glass-action-btn delete delete-lesson-btn" data-id="${item.id}">
                                                        <i class="ph-bold ph-trash"></i>
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>

                <!-- Right Column: Assignments & Info -->
                <div class="content-side-col">
                    <div class="sticky-sidebar">
                        <div class="section-header-v2">
                            <div class="section-title-wrap">
                                <div class="title-icon alt"><i class="ph-fill ph-notebook"></i></div>
                                <h2>${i18n.t('homework')}</h2>
                                <span class="items-count-badge alt">${assignments.length}</span>
                            </div>
                            ${isAdmin ? `
                                <button class="mini-add-btn" id="add-assignment-btn">
                                    <i class="ph-bold ph-plus"></i>
                                </button>
                            ` : ''}
                        </div>

                        <div class="premium-assignments-list">
                            ${assignments.length === 0 ? `
                                <div class="side-empty-state">
                                    <p>لا يوجد واجبات حالية</p>
                                </div>
                            ` : assignments.map(a => {
                                const isExpired = a.due_date && new Date(a.due_date) < new Date();
                                return `
                                    <div class="assignment-mini-card ${isExpired ? 'expired' : ''}">
                                        <div class="assign-header">
                                            <h3>${a.title}</h3>
                                            ${a.status === 'submitted' ? '<span class="status-badge-mini">تم التسليم</span>' : '<div class="assign-status-dot"></div>'}
                                        </div>
                                        ${!isStudent ? `<p class="assign-desc">${a.description || ''}</p>` : ''}
                                        <div class="assign-footer">
                                            <div class="assign-meta">
                                                <span class="due-tag">
                                                    <i class="ph-bold ph-clock"></i>
                                                    ${new Date(a.due_date).toLocaleDateString('ar-EG', {month:'short', day:'numeric'})}
                                                </span>
                                                <span class="format-tag">${a.allowed_formats}</span>
                                            </div>
                                            <div class="assign-btns">
                                                ${a.file_url && !isStudent ? `
                                                    <a href="${a.file_url}" target="_blank" class="assign-icon-btn" title="الملف">
                                                        <i class="ph-bold ph-file-pdf"></i>
                                                    </a>
                                                ` : ''}
                                                ${isStudent ? `
                                                    <div style="display:flex; gap:8px; width:100%;">
                                                        <button class="assign-main-btn submit-solution-btn" 
                                                                data-id="${a.id}" data-formats="${a.allowed_formats}"
                                                                ${isExpired ? 'disabled' : ''}>
                                                            ${isExpired ? 'انتهى' : (a.status === 'submitted' ? 'استبدال الحل' : i18n.t('submit_homework'))}
                                                        </button>
                                                        ${a.status === 'submitted' && !isExpired ? `
                                                            <button class="mini-icon-btn danger delete-submission-btn" data-sub-id="${a.submission_id}" title="حذف التسليم">
                                                                <i class="ph-bold ph-trash"></i>
                                                            </button>
                                                        ` : ''}
                                                    </div>
                                                ` : ''}
                                                ${isAdmin && !isStudent ? `
                                                    <button class="assign-main-btn alt view-submissions-btn" data-id="${a.id}">
                                                        ${i18n.t('view_submissions')}
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
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


    const openScanner = async () => {
        const html = `
            <div style="text-align: center; padding: 10px;">
                <div id="qr-reader" style="width: 100%; max-width: 450px; margin: 0 auto; border: none !important;"></div>
                
                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed var(--border);">
                    <button id="toggle-manual-btn" class="btn btn-outline" style="width: 100%; padding: 12px; height: auto;">
                        <i class="ph ph-keyboard"></i> ${i18n.lang === 'ar' ? 'أو أدخل الرمز يدوياً (خيار بديل)' : 'Or Enter Code Manually'}
                    </button>
                    <div id="manual-input-area" style="display: none; margin-top: 1.5rem; animation: slideDown 0.3s ease;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input id="qr-token-input" class="form-control" style="text-align: center; font-size: 1.2rem; letter-spacing: 2px; border: 2px solid var(--primary); height: 50px;" placeholder="ABC123..." />
                            <button id="manual-submit-btn" class="btn btn-primary" style="height: 50px; padding: 0 15px;"><i class="ph ph-check"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        let html5QrcodeScanner;
        
        const onScanSuccess = async (decodedText) => {
            if (html5QrcodeScanner) {
                await html5QrcodeScanner.clear().catch(() => {});
            }
            UI.toast(i18n.lang === 'ar' ? 'تم التقاط الرمز!' : 'Code detected!');
            const res = await api.scanQR(decodedText, user.id);
            if (res.success) {
                UI.toast(res.message);
                if (UI.closeCurrentModal) UI.closeCurrentModal();
                if (params.action === 'scan') window.router.navigate(`/subject/${subjectId}`); 
            } else {
                UI.toast(res.message, 'error');
                // Restart scanner if error
                initScannerUI();
            }
        };

        const initScannerUI = () => {
            if (typeof Html5QrcodeScanner === 'undefined') {
                UI.toast(i18n.lang === 'ar' ? 'خطأ: لم يتم تحميل مكتبة الكاميرا' : 'Error: Camera library not loaded', 'error');
                return;
            }

            html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { 
                fps: 10, 
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
            }, /* verbose= */ false);
            
            html5QrcodeScanner.render(onScanSuccess, (err) => {
                // Ignore routine errors
            });
        };

        UI.modal(i18n.t('scan_attendance') || 'تسجيل الحضور', html, () => false, {
            onClose: async () => { if (html5QrcodeScanner) await html5QrcodeScanner.clear().catch(() => {}); },
            hideFooter: true,
            large: false
        });

        // Setup UI Listeners
        setTimeout(() => {
            initScannerUI();
            const toggleBtn = document.getElementById('toggle-manual-btn');
            if (toggleBtn) toggleBtn.onclick = () => {
                const area = document.getElementById('manual-input-area');
                area.style.display = area.style.display === 'none' ? 'block' : 'none';
            };

            const submitBtn = document.getElementById('manual-submit-btn');
            if (submitBtn) submitBtn.onclick = async () => {
                 const token = document.getElementById('qr-token-input').value.trim();
                 if (!token) { UI.toast('يرجى إدخال الرمز', 'error'); return; }
                 const res = await api.scanQR(token, user.id);
                 if (res.success) {
                    if (html5QrcodeScanner) await html5QrcodeScanner.clear().catch(() => {});
                    UI.toast(res.message);
                    if (UI.closeCurrentModal) UI.closeCurrentModal();
                    if (params.action === 'scan') window.router.navigate(`/subject/${subjectId}`);
                 } else { UI.toast(res.message, 'error'); }
            };
        }, 300);
    };

    const attBtn = document.getElementById('student-attendance-btn');
    if (attBtn) attBtn.onclick = openScanner;

    // AUTO-OPEN scanner if action=scan is present
    if (params.action === 'scan') {
        setTimeout(openScanner, 600);
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

    // Delete Submission (Student)
    document.querySelectorAll('.delete-submission-btn').forEach(btn => {
        btn.onclick = async () => {
            const confirmed = await UI.confirm(i18n.lang === 'ar' ? 'هل أنت متأكد من حذف هذا التسليم؟' : 'Are you sure you want to delete this submission?');
            if (confirmed) {
                const res = await api.deleteSubmission(btn.dataset.subId);
                if (res.success) {
                    UI.toast(i18n.lang === 'ar' ? 'تم حذف التسليم' : 'Submission deleted');
                    window.location.reload();
                } else {
                    UI.toast(res.error || 'Error', 'error');
                }
            }
        };
    });
};

export default SubjectPage;
