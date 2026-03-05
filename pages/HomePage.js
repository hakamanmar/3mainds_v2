/* HomePage.js - 3Minds Platform */
import { api, auth } from '/static/js/api.js';
import { i18n } from '/static/js/i18n.js';

const subjectIcons = ['ph-atom', 'ph-code', 'ph-calculator', 'ph-flask', 'ph-book-open', 'ph-globe', 'ph-cpu', 'ph-database', 'ph-chart-bar', 'ph-microscope'];

const HomePage = async () => {
    let subjects = [];
    let announcements = [];

    try {
        [subjects, announcements] = await Promise.all([
            api.getSubjects(),
            api.getAnnouncements()
        ]);
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

    if (subjects.length === 0) {
        return `
            ${announcementsHTML}
            <div class="empty-state">
                <i class="ph ph-books"></i>
                <h2>${i18n.t('no_subjects_yet')}</h2>
                <p>${i18n.t('subjects_added_soon')}</p>
            </div>
        `;
    }

    return `
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

        <!-- Developer Credits -->
        <div style="
            margin-top: 2.5rem;
            background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%);
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            direction: ltr;
        ">
            <div style="font-size:0.7rem;font-weight:800;color:rgba(255,255,255,0.9);letter-spacing:1px;margin-bottom:0.3rem;">
                Department of Cybersecurity
            </div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);margin-bottom:0.85rem;">
                Under the Supervision of: <span style="color:rgba(255,255,255,0.8);font-weight:700;">Dr. Muhaned Qasim</span>
            </div>
            <div style="
                font-size: 0.6rem;
                font-weight: 700;
                color: rgba(255,255,255,0.35);
                letter-spacing: 2px;
                text-transform: uppercase;
                margin-bottom: 0.75rem;
            ">✦ Developed by ✦</div>
            <div style="display:flex; justify-content:center; gap:0.5rem; flex-wrap:wrap; flex-direction: row; direction: ltr;">
                <span style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:30px;padding:0.4rem 1rem;font-size:0.8rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#60a5fa;border-radius:50%;display:inline-block;"></span>Alhakam Anmar</span>
                <span style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:30px;padding:0.4rem 1rem;font-size:0.8rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#60a5fa;border-radius:50%;display:inline-block;"></span>Mena Sabri</span>
                <span style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:30px;padding:0.4rem 1rem;font-size:0.8rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#60a5fa;border-radius:50%;display:inline-block;"></span>Danya Majed</span>
            </div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:0.75rem;">
                3Minds Academic © 2026 — Al-Nahrain University
            </div>
        </div>
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
