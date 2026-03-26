/* ViewerPage.js - 3Minds Platform */
import { i18n } from '/static/js/i18n.js';

const isLocalUpload = (url) => url && url.startsWith('/uploads/');
const isExternalUrl = (url) => url && (url.startsWith('http://') || url.startsWith('https://'));

const getEmbedUrl = (url) => {
    if (!url) return '';
    // Google Drive
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
    // External URL (Catbox, etc.) — serve directly
    if (isExternalUrl(url)) return url;
    // Local file — use Google Docs Viewer as fallback (works for PDF, DOCX, etc.)
    const fullUrl = window.location.origin + url;
    return `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`;
};

const getDownloadUrl = (url) => {
    if (!url) return '#';
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}&confirm=t`;
    return url;
};

const getFileType = (url) => {
    if (!url) return 'other';
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'audio';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    return 'iframe';
};

const ViewerPage = async (params) => {
    const fileUrl = decodeURIComponent(params.url || '');
    const fileName = decodeURIComponent(params.name || i18n.t('materials'));
    const fileType = getFileType(fileUrl);
    const downloadLabel = i18n.t('download');
    const backLabel = i18n.t('back');

    // Detect if this is a legacy local upload (may be unavailable on Vercel ephemeral storage)
    const isBrokenLocalLink = isLocalUpload(fileUrl);

    let viewerHTML = '';

    if (isBrokenLocalLink) {
        // Try Google Docs Viewer as fallback for old /uploads/ links
        const fallbackEmbed = `https://docs.google.com/viewer?url=${encodeURIComponent(window.location.origin + fileUrl)}&embedded=true`;
        viewerHTML = `
            <div style="width:100%;height:100%;display:flex;flex-direction:column;">
                <div style="background:linear-gradient(135deg,#fbbf24,#f59e0b);padding:0.75rem 1.25rem;display:flex;align-items:center;gap:0.75rem;color:#fff;font-weight:600;font-size:0.9rem;">
                    <i class="ph ph-warning" style="font-size:1.3rem;"></i>
                    <span>هذا الملف قد يكون غير متاح مؤقتاً — يتم عرضه عبر Google Docs</span>
                    <a href="${fileUrl}" download style="margin-right:auto;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:6px;color:#fff;text-decoration:none;font-size:0.8rem;">⬇ حاول التحميل المباشر</a>
                </div>
                <iframe id="fileViewer" src="${fallbackEmbed}" style="flex:1;width:100%;border:none;" allow="autoplay"></iframe>
                <div id="broken-fallback" style="display:none;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;padding:2rem;text-align:center;">
                    <i class="ph ph-file-x" style="font-size:5rem;color:#ef4444;opacity:0.7;"></i>
                    <h2 style="color:var(--text-main);">الملف غير متاح</h2>
                    <p style="color:var(--text-muted);max-width:400px;">هذا الملف كان مخزناً على السيرفر المحلي وفُقد بسبب إعادة تشغيل Vercel. يرجى رفع الملف مجدداً لكي يُخزن بشكل دائم.</p>
                </div>
            </div>`;
    } else if (fileType === 'video') {
        viewerHTML = `<video controls style="width:100%;height:100%;background:#000;" src="${fileUrl}">
            <source src="${fileUrl}"> ${i18n.lang === 'ar' ? 'المتصفح لا يدعم الفيديو' : 'Browser does not support video.'}
        </video>`;
    } else if (fileType === 'audio') {
        viewerHTML = `<div style="display:grid;place-items:center;height:100%;background:var(--surface-2);">
            <div style="text-align:center; padding: 2rem;">
                <i class="ph ph-music-notes" style="font-size:5rem;color:var(--primary);"></i>
                <h3 style="margin:1rem 0;">${fileName}</h3>
                <audio controls style="width:100%;max-width:500px;">
                    <source src="${fileUrl}">
                </audio>
            </div>
        </div>`;
    } else if (fileType === 'image') {
        viewerHTML = `<div style="display:grid;place-items:center;height:100%;background:var(--surface-2); overflow:auto;">
            <img src="${fileUrl}" alt="${fileName}" style="max-width:100%;max-height:100%;object-fit:contain;"/>
        </div>`;
    } else {
        const embedUrl = getEmbedUrl(fileUrl);
        viewerHTML = `<iframe id="fileViewer" src="${embedUrl}" style="width:100%;height:100%;border:none;" allow="autoplay"></iframe>`;
    }

    return `
        <!-- Top bar -->
        <div style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
            <button class="btn" onclick="window.history.back()"
                style="color:var(--text-muted);padding:0.5rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                <i class="ph ph-arrow-${i18n.lang === 'ar' ? 'right' : 'left'}"></i> ${backLabel}
            </button>
            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                <a id="downloadBtn" href="${getDownloadUrl(fileUrl)}" target="_blank"
                    style="background:#10b981;color:white;padding:0.5rem 1.25rem;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:pointer;border:none;text-decoration:none;">
                    <i class="ph ph-download-simple"></i> ${downloadLabel}
                </a>
                ${isExternalUrl(fileUrl) ? `
                <a href="${fileUrl}" target="_blank"
                    style="background:#4f46e5;color:white;padding:0.5rem 1.25rem;border-radius:8px;display:flex;align-items:center;gap:8px;text-decoration:none;">
                    <i class="ph ph-arrow-square-out"></i> فتح مباشر
                </a>` : ''}
            </div>
        </div>

        <!-- File info card -->
        <div style="padding:1rem 1.5rem;background:var(--surface);border-radius:10px;box-shadow:var(--shadow-sm);margin-bottom:1rem;display:flex;align-items:center;gap:0.75rem;">
            <i class="ph ph-file-text" style="color:var(--primary);font-size:1.4rem;"></i>
            <h2 style="margin:0;font-size:1.1rem;color:var(--text-main);">${fileName}</h2>
        </div>

        <!-- Viewer -->
        <div id="viewer-wrapper" style="position:relative;width:100%;height:calc(100vh - 220px);min-height:500px;background:var(--surface);border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
            ${viewerHTML}
        </div>
    `;
};

ViewerPage.init = (params) => {
    // No initialization needed
};

export default ViewerPage;
