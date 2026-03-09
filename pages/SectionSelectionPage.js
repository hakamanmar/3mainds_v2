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
            <p id="selection-subtitle" style="color: var(--text-muted); font-size: 1.25rem; margin-bottom: 3rem;">الرجاء اختيار الشعبة الدراسية لفتح المنصة</p>
            
            <div id="dept-container" style="display: flex; justify-content: center; width: 100%; max-width: 800px; padding: 0 1rem;">
                <div class="card dept-card" style="
                    cursor: pointer; 
                    padding: 3.5rem 2rem; 
                    border: 1px solid var(--border);
                    border-radius: 24px;
                    width: 100%;
                    overflow: hidden;
                    position: relative;
                    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
                    color: white;
                    text-align: center;
                    box-shadow: 0 10px 40px rgba(49, 46, 129, 0.3);
                ">
                    <!-- Background image overlay -->
                    <div style="
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background-image: url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800');
                        background-size: cover;
                        background-position: center;
                        opacity: 0.2;
                        mix-blend-mode: overlay;
                        z-index: 1;
                    "></div>
                    <!-- Content -->
                    <div style="position: relative; z-index: 2;">
                        <div style="font-size: 3.5rem; margin-bottom: 1.5rem; color: #60a5fa; filter: drop-shadow(0 0 10px rgba(96,165,250,0.5));">
                            <i class="ph ph-shield-check"></i>
                        </div>
                        <h3 style="font-size: 2.2rem; font-weight: 800; margin-bottom: 0.5rem; letter-spacing: -0.5px;">قسم الأمن السيبراني</h3>
                        <p style="font-size: 1.1rem; color: #cbd5e1; margin-top: 0.5rem;">انقر هنا للدخول واختيار الشعبة (A/B صباحي ومسائي)</p>
                    </div>
                </div>
            </div>

            <div id="classes-container" class="fade-in" style="display: none; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; width: 100%; max-width: 1000px;">
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
            .dept-card {
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease;
            }
            .dept-card:hover {
                transform: translateY(-8px) scale(1.02);
                box-shadow: 0 20px 50px rgba(49, 46, 129, 0.5) !important;
                border-color: #60a5fa !important;
            }
            .dept-card i { transition: transform 0.5s ease; color: #60a5fa !important; }
            .dept-card:hover i { transform: scale(1.15) rotate(5deg); }

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

    const deptContainer = container.querySelector('#dept-container');
    const classesContainer = container.querySelector('#classes-container');
    const subtitle = container.querySelector('#selection-subtitle');

    container.querySelector('.dept-card').addEventListener('click', () => {
        deptContainer.style.display = 'none';
        classesContainer.style.display = 'grid';
        subtitle.textContent = 'الرجاء اختيار الشعبة (صباحي / مسائي)';
    });

    container.querySelectorAll('.section-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            api.setSelectedSection(id);
            window.router.navigate('/login');
        });
    });

    return container;
}
