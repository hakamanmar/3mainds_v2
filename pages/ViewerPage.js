/* ViewerPage.js - 3Minds Platform */
import { i18n } from '/static/js/i18n.js';

const getEmbedUrl = (url) => {
    if (!url) return '';
    // Google Drive
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
    // Local/server file
    return url;
};

const getDownloadUrl = (url) => {
    if (!url) return '#';
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}&confirm=t`;
    // Local: trigger download via query param
    return url + '?download=1';
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
    const embedUrl = getEmbedUrl(fileUrl);
    const fileType = getFileType(fileUrl);

    const downloadLabel = i18n.t('download');
    const backLabel = i18n.t('back');

    let viewerHTML = '';
    if (fileType === 'video') {
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
                <a id="downloadBtn" href="${getDownloadUrl(fileUrl)}"
                    style="background:#10b981;color:white;padding:0.5rem 1.25rem;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:pointer;border:none;text-decoration:none;">
                    <i class="ph ph-download-simple"></i> ${downloadLabel}
                </a>
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
    // No initialization needed after removing translation feature
};

export default ViewerPage;