/* ViewerPage.js - 3Minds Platform - Smart Redirect v2 */
import { i18n } from '/static/js/i18n.js';

const getFileType = (url) => {
    if (!url) return 'other';
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'audio';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    return 'external'; // PDF, DOCX, Catbox, everything else → open directly
};

const ViewerPage = async (params) => {
    const fileUrl = decodeURIComponent(params.url || '');
    const fileName = decodeURIComponent(params.name || i18n.t('materials'));
    const fileType = getFileType(fileUrl);

    // ── For any external link (PDF, Catbox, DOCX...) ─────────────────────────
    // Instead of trying to embed it (which gets blocked), redirect immediately.
    if (fileType === 'external') {
        const proxyUrl = `/api/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName)}&mode=inline&t=${Date.now()}`;
        window.open(proxyUrl, '_blank');
        window.history.back();
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:1.5rem;text-align:center;padding:2rem;">
            <i class="ph ph-arrow-square-out" style="font-size:4rem;color:var(--primary);"></i>
            <h2 style="color:var(--text-main);">${i18n.lang === 'ar' ? 'جاري فتح الملف...' : 'Opening file...'}</h2>
            <p style="color:var(--text-muted);">${i18n.lang === 'ar' ? 'إذا لم يفتح في 2 ثانية، اضغط الزر أدناه' : 'If it did not open, click below'}</p>
            <a href="${fileUrl}" target="_blank" style="background:var(--primary);color:#fff;padding:0.75rem 2rem;border-radius:10px;text-decoration:none;font-weight:600;display:flex;align-items:center;gap:8px;">
                <i class="ph ph-arrow-square-out"></i>
                ${i18n.lang === 'ar' ? 'فتح مباشر' : 'Open File'}
            </a>
            <button onclick="window.history.back()" style="background:var(--surface-2);color:var(--text-muted);padding:0.5rem 1.5rem;border-radius:8px;border:1px solid var(--border);cursor:pointer;">
                ${i18n.lang === 'ar' ? '← عودة' : '← Back'}
            </button>
        </div>`;
    }

    // ── Video ─────────────────────────────────────────────────────────────────
    if (fileType === 'video') {
        return `
            <div style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
                <button onclick="window.history.back()" style="color:var(--text-muted);padding:0.5rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                    <i class="ph ph-arrow-${i18n.lang === 'ar' ? 'right' : 'left'}"></i> ${i18n.t('back')}
                </button>
                <h3 style="color:var(--text-main);margin:0;">${fileName}</h3>
            </div>
            <div style="background:#000;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.3);">
                <video controls style="width:100%;max-height:80vh;display:block;" src="${fileUrl}">
                    ${i18n.lang === 'ar' ? 'المتصفح لا يدعم الفيديو' : 'Browser does not support video.'}
                </video>
            </div>`;
    }

    // ── Audio ─────────────────────────────────────────────────────────────────
    if (fileType === 'audio') {
        return `
            <div style="display:grid;place-items:center;height:60vh;background:var(--surface-2);border-radius:16px;">
                <div style="text-align:center;padding:2rem;">
                    <i class="ph ph-music-notes" style="font-size:5rem;color:var(--primary);"></i>
                    <h3 style="margin:1rem 0;color:var(--text-main);">${fileName}</h3>
                    <audio controls style="width:100%;max-width:500px;">
                        <source src="${fileUrl}">
                    </audio>
                </div>
            </div>`;
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    if (fileType === 'image') {
        return `
            <div style="display:grid;place-items:center;height:80vh;background:var(--surface-2);border-radius:16px;overflow:auto;">
                <img src="${fileUrl}" alt="${fileName}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;"/>
            </div>`;
    }

    return '';
};

ViewerPage.init = () => {};

export default ViewerPage;
