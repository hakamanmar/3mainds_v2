/* HomePage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';

const subjectIcons = ['ph-atom', 'ph-code', 'ph-calculator', 'ph-flask', 'ph-book-open', 'ph-globe', 'ph-cpu', 'ph-database', 'ph-chart-bar', 'ph-microscope'];

const HomePage = async () => {
    let subjects = [];
    let announcements = [];
    let activeAttendance = null;

    try {
        const results = await Promise.all([
            api.getSubjects(),
            api.getAnnouncements(),
            fetch('/api/attendance/active-for-me').then(r => r.json())
        ]);
        subjects = results[0];
        announcements = results[1];
        if (results[2].active) activeAttendance = results[2].session;
    } catch (e) {
        console.error(e);
        return `<div class="error-state">
            <i class="ph ph-warning-circle"></i>
            <h3>${i18n.t('error') || 'Error'}</h3>
            <p>${e.message}</p>
            <button class="btn btn-primary" onclick="window.location.reload()">${i18n.t('refresh_now') || 'Retry'}</button>
        </div>`;
    }

    const user = auth.getUser();

    const announcementsHTML = announcements.length > 0 ? `
        <div class="announcements-banner">
            <div class="ann-icon"><i class="ph ph-megaphone-simple"></i></div>
            <div class="ann-content">
                <h4>${i18n.t('announcements')}</h4>
                <div class="ann-list">
                    ${announcements.map(a => `
                        <div class="ann-item">
                            <i class="ph ph-dot-outline" style="color: var(--primary);"></i>
                            <span style="flex: 1;">${a.content}</span>
                            ${a.target_date ?
            `<div class="ann-countdown" data-target="${a.target_date}" style="color: var(--danger); font-weight: bold; background: var(--danger-light); padding: 2px 8px; border-radius: 4px;">
                                    <small><i class="ph ph-clock"></i> <span class="cd-text">${i18n.t('calculating')}</span></small>
                                </div>`
            : `<small>${formatDate(a.created_at)}</small>`
        }
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    ` : '';

    const welcomeName = user ? user.email.split('@')[0] : '';

    const attendanceBanner = activeAttendance ? `
        <div class="attendance-alert-banner" 
             style="background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%); color: white; padding: 1.25rem; border-radius: 16px; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 10px 25px rgba(79, 70, 229, 0.2); animation: slideDown 0.5s ease-out; position: relative; overflow: hidden;">
            <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: url('https://www.transparenttextures.com/patterns/cubes.png'); opacity: 0.1;"></div>
            <div style="display: flex; align-items: center; gap: 1rem; position: relative; z-index: 1;">
                <div class="pulse-icon" style="background: rgba(255,255,255,0.2); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                    <i class="ph ph-qr-code"></i>
                </div>
                <div>
                    <h4 style="margin: 0; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.5px;">${i18n.lang === 'ar' ? 'بدأ تسجيل الحضور الآن!' : 'Attendance counts now!'}</h4>
                    <p style="margin: 0; opacity: 0.9; font-size: 0.9rem;">${i18n.lang === 'ar' ? `مادة ${activeAttendance.subject_title}` : `Subject: ${activeAttendance.subject_title}`}</p>
                </div>
            </div>
            <button class="btn btn-light" data-path="/subject/${activeAttendance.subject_id}?action=scan" 
                    style="position: relative; z-index: 1; font-weight: 700; background: white; color: #4f46e5; border: none; padding: 0.6rem 1.2rem; border-radius: 10px; display: flex; align-items: center; gap: 8px; transition: transform 0.2s;">
                <i class="ph ph-rocket-launch"></i>
                ${i18n.lang === 'ar' ? 'سجل حضورك' : 'Register Now'}
            </button>
        </div>
        <style>
            @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .pulse-icon { animation: pulseAnim 2s infinite; }
            @keyframes pulseAnim { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); } 70% { box-shadow: 0 0 0 15px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
        </style>
    ` : '';

    if (subjects.length === 0) {
        return `
            ${attendanceBanner}
            ${announcementsHTML}
            <div class="empty-state">
                <i class="ph ph-books"></i>
                <h2>${i18n.t('no_subjects_yet')}</h2>
                <p>${i18n.t('subjects_added_soon')}</p>
            </div>
        `;
    }

    return `
        ${attendanceBanner}
        ${announcementsHTML}

        <div class="page-header">
            <div>
                <h1>${i18n.t('subjects')}</h1>
                <p class="text-muted">${i18n.t('hello')} <strong>${welcomeName}</strong> — ${i18n.t('welcome_home')}</p>
            </div>
            <div class="subjects-count">
                <i class="ph ph-books"></i>
                <span>${subjects.length} ${i18n.t('subject')}</span>
            </div>
        </div>

        <div class="subjects-grid">
            ${subjects.map((subject, idx) => {
        const icon = subjectIcons[idx % subjectIcons.length];
        return `
                    <div class="subject-card" data-path="/subject/${subject.id}"
                         style="--subject-color: ${subject.color || '#4f46e5'};">
                        <div class="subject-card-bg"></div>
                        <div class="subject-card-content">
                            <div class="subject-icon">
                                <i class="ph ${icon}"></i>
                            </div>
                            <div class="subject-info">
                                <h3>${subject.title}</h3>
                                <span class="subject-code">${subject.code || ''}</span>
                            </div>
                        </div>
                        <p class="subject-desc">${subject.description || ''}</p>
                        <div class="subject-card-footer">
                            <span><i class="ph ph-arrow-left"></i> ${i18n.t('view_lessons')}</span>
                        </div>
                    </div>
                `;
    }).join('')}
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
    `;
};

HomePage.init = () => {
    let countdownInterval;

    const updateTimers = () => {
        document.querySelectorAll('.ann-countdown').forEach(el => {
            // Replace space with T to ensure robust cross-browser compatibility
            const targetStr = el.dataset.target.replace(' ', 'T');
            const target = new Date(targetStr).getTime();
            const now = new Date().getTime();
            const dist = target - now;
            const textEl = el.querySelector('.cd-text');

            if (isNaN(dist)) {
                textEl.innerHTML = i18n.t('error');
                return;
            }

            if (dist < 0) {
                textEl.innerHTML = i18n.t('time_ended');
                el.style.color = 'var(--text-muted)';
                el.style.background = 'var(--surface)';
                return;
            }

            const d = Math.floor(dist / (1000 * 60 * 60 * 24));
            const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((dist % (1000 * 60)) / 1000);

            // Notification logic for "1 day left"
            if (d === 1 && h === 0 && m === 0 && !el.dataset.notified) {
                el.dataset.notified = 'true';
                if (window.Notification && Notification.permission === "granted") {
                    new Notification(i18n.t('notifications'), {
                        body: i18n.lang === 'ar'
                            ? 'بقي يوم واحد فقط على الموعد، يرجى الاستعداد!'
                            : 'Only 1 day left for this deadline, please prepare!',
                        icon: '/logo.png'
                    });
                }
            }

            const andWord = i18n.lang === 'ar' ? 'و' : 'and';
            let timeStr = `${i18n.t('time_left')} `;
            if (d > 0) timeStr += `<span class="badge badge-outline">${d}</span> ${i18n.t('day_and')} `;
            timeStr += `<span class="badge badge-outline">${h}</span> ${i18n.t('hour_and')} <span class="badge badge-outline">${m}</span> ${i18n.t('minute')} ${andWord} <span class="badge" style="background:var(--danger);color:white">${s}</span> ${i18n.t('seconds')}`;

            textEl.innerHTML = timeStr;
        });
    };

    updateTimers();
    // Clear any existing intervals if component is re-rendered
    if (window.annCountdown) clearInterval(window.annCountdown);
    window.annCountdown = setInterval(updateTimers, 1000); // update every second
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

export default HomePage;
