import { api, auth } from '../static/js/api.js';
import { i18n } from '../static/js/i18n.js';

export default async function SectionSelectionPage() {
    const container = document.createElement('div');
    container.className = 'fade-in';

    const sections = await api.getSections();

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; text-align: center;">
            <div class="cyber-logo">
                <img src="/logo.png?v=2.5" alt="Logo" style="height: 180px; margin-bottom: 1.5rem;">
            </div>
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--primary); font-weight: 800;">${i18n.t('welcome_title')}</h1>
            <p style="color: var(--text-muted); font-size: 1.25rem; margin-bottom: 3rem;">${i18n.t('select_section_subtitle')}</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; width: 100%; max-width: 1000px;">
                ${sections.map(s => `
                    <div class="card section-card" data-id="${s.id}" style="cursor: pointer; padding: 2.5rem; border: 1px solid var(--border);">
                        <div style="font-size: 3rem; margin-bottom: 1rem;"><i class="ph ph-users-three"></i></div>
                        <h3 style="font-size: 1.5rem; font-weight: 700;">${i18n.t(s.id)}</h3>
                        <p style="font-size: 0.95rem; color: var(--text-muted); margin-top: 0.5rem;">${i18n.t('click_to_enter')}</p>
                    </div>
                `).join('')}
            </div>
            
            <div class="fade-in" style="margin-top: 4rem; animation-delay: 0.3s;">
                <button class="btn btn-ghost" data-path="/login?role=super_admin">
                    <i class="ph ph-shield-check"></i> ${i18n.t('super_admin_login')}
                </button>
            </div>
        </div>

        <style>
            .section-card:hover {
                border-color: var(--primary) !important;
                background: var(--blue-bg) !important;
                transform: translateY(-8px);
                box-shadow: var(--shadow-lg);
            }
            .section-card i { color: var(--primary); transition: transform 0.3s ease; }
            .section-card:hover i { transform: scale(1.1); }
        </style>
    `;

    container.querySelectorAll('.section-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            api.setSelectedSection(id);
            window.router.navigate('/login');
        });
    });

    return container;
}
