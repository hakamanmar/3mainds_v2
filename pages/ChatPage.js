
import { api, auth } from '/static/js/api.js';
import { UI } from '/static/js/ui.js';
import { i18n } from '/static/js/i18n.js';

export default function ChatPage() {
    const user = auth.getUser();
    if (!user) return '<div class="card">Please login</div>';

    let currentSectionId = user.section_id || null;
    let messages = [];
    let groups = [];
    let selectedGroupId = null;
    let pollInterval = null;
    let isEditingMsgId = null;

    const render = () => {
        const root = document.getElementById('main-content');
        if (!root) return;

        const isAdmin = ['super_admin', 'head_dept'].includes(user.role);

        root.innerHTML = `
            <div class="chat-layout" style="display: flex; height: calc(100vh - 80px); gap: 15px; padding: 10px;">
                <!-- Groups Sidebar (for admins) -->
                ${isAdmin ? `
                <div class="chat-sidebar card" style="width: 280px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--primary-light);">
                    <div class="sidebar-header" style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(to right, var(--primary), var(--secondary));">
                        <h3 style="color: white; margin: 0; font-size: 1.1rem;"><i class="ph ph-chats"></i> المجموعات</h3>
                    </div>
                    <div class="groups-list" style="flex: 1; overflow-y: auto; padding: 10px;">
                        ${groups.map(g => `
                            <div class="group-item ${selectedGroupId === g.id ? 'active' : ''}" 
                                 onclick="window.chat_selectGroup('${g.id}')"
                                 style="padding: 12px; margin-bottom: 8px; border-radius: 12px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 10px; border: 1px solid ${selectedGroupId === g.id ? 'var(--primary)' : 'transparent'}; background: ${selectedGroupId === g.id ? 'rgba(79, 70, 229, 0.2)' : 'rgba(255,255,255,0.05)'};">
                                <div class="group-icon" style="width: 40px; height: 40px; border-radius: 10px; background: var(--primary); display: grid; place-items: center; color: white;">
                                    <i class="ph-bold ph-users-three"></i>
                                </div>
                                <div style="color: white; font-weight: 500;">${g.name}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Main Chat Area -->
                <div class="chat-main card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #0f172a; border: 1px solid rgba(79, 70, 229, 0.3); position: relative;">
                    <!-- Cyber Grid Pattern Overlay -->
                    <div style="position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(79, 70, 229, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(79, 70, 229, 0.05) 1px, transparent 1px); background-size: 30px 30px; pointer-events: none;"></div>

                    <!-- Chat Header -->
                    <div class="chat-header" style="height: 60px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(10px); z-index: 10;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <i class="ph-bold ph-chat-circle" style="color: var(--primary); font-size: 1.4rem;"></i>
                            <h3 style="color: white; margin: 0; display: flex; align-items: center; gap: 10px;">
                                ${groups.find(g => g.id === selectedGroupId)?.name || 'دردشة الشعبة'}
                                ${groups.find(g => g.id === selectedGroupId)?.is_locked ? '<i class="ph ph-lock" style="font-size: 0.9rem; color: var(--red);"></i>' : ''}
                                ${isAdmin ? `<button class="icon-btn" onclick="window.chat_renameGroup()" style="font-size: 1rem;"><i class="ph ph-pencil-simple"></i></button>` : ''}
                            </h3>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button class="icon-btn" onclick="window.chat_viewMembers()" title="قائمة الأعضاء">
                                <i class="ph ph-users-three"></i>
                            </button>
                            ${isAdmin ? `
                            <button class="icon-btn" onclick="window.chat_toggleLock()" title="${groups.find(g => g.id === selectedGroupId)?.is_locked ? 'فتح الدردشة' : 'قفل الدردشة'}">
                                <i class="ph ${groups.find(g => g.id === selectedGroupId)?.is_locked ? 'ph-lock-open' : 'ph-lock'}" style="color: ${groups.find(g => g.id === selectedGroupId)?.is_locked ? '#10b981' : '#f59e0b'}"></i>
                            </button>
                            ` : ''}
                            <button id="mute-toggle" class="icon-btn" onclick="window.chat_toggleMute()" title="كتم الإشعارات">
                                <i class="ph ${groups.find(g => g.id === selectedGroupId)?.is_muted ? 'ph-bell-slash' : 'ph-bell'}" style="color: ${groups.find(g => g.id === selectedGroupId)?.is_muted ? 'var(--red)' : '#fff'}"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Messages Container -->
                    <div id="chat-messages-container" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; position: relative;">
                        ${groups.find(g => g.id === selectedGroupId)?.is_locked ? `
                        <div style="text-align: center; margin-bottom: 20px; animation: fadeIn 0.5s;">
                            <span style="background: rgba(244, 63, 94, 0.1); color: var(--red); padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; border: 1px solid rgba(244, 63, 94, 0.2);">
                                <i class="ph ph-lock"></i> الدردشة مقفلة من قبل المسؤول
                            </span>
                        </div>
                        ` : ''}
                        ${messages.length === 0 ? `
                            <div style="text-align: center; color: var(--text-muted); margin-top: 50px;">
                                <i class="ph ph-chat-centered-dots" style="font-size: 3rem; display: block; margin-bottom: 10px;"></i>
                                لا توجد رسائل بعد. ابدأ المحادثة الآن!
                            </div>
                        ` : messages.map(m => renderMessage(m)).join('')}
                    </div>

                    <!-- Input Area -->
                    <div class="chat-input-area" style="padding: 15px; background: rgba(15, 23, 42, 0.8); border-top: 1px solid rgba(255,255,255,0.1); z-index: 10;">
                        <div style="display: flex; gap: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(79, 70, 229, 0.2); border-radius: 12px; padding: 5px 10px;">
                            <input id="chat-input" type="text" placeholder="اكتب رسالتك هنا..." 
                                   style="flex: 1; background: transparent; border: none; color: white; padding: 10px; outline: none;"
                                   onkeypress="if(event.key === 'Enter') window.chat_sendMessage()">
                            <button onclick="window.chat_sendMessage()" class="btn btn-primary" style="padding: 0 20px; border-radius: 8px;">
                                <i class="ph-bold ph-paper-plane-tilt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .chat-layout { font-family: 'Cairo', sans-serif; }
                .message-bubble { max-width: 75%; padding: 12px 16px; border-radius: 18px; position: relative; animation: slideInUp 0.3s ease; }
                .msg-own { align-self: flex-end; background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; border-bottom-right-radius: 4px; }
                .msg-other { align-self: flex-start; background: rgba(255,255,255,0.1); color: white; border-bottom-left-radius: 4px; border: 1px solid rgba(255,255,255,0.05); }
                .msg-sender { font-size: 0.75rem; font-weight: 700; margin-bottom: 4px; display: block; opacity: 0.8; }
                .msg-time { font-size: 0.65rem; opacity: 0.6; display: block; text-align: right; margin-top: 4px; }
                .group-item.active { background: rgba(79, 70, 229, 0.2) !important; color: white !important; }
                .group-item:hover { background: rgba(255,255,255,0.1); }
                .msg-admin-tag { background: var(--red); color: white; font-size: 0.6rem; padding: 1px 4px; border-radius: 4px; margin-left: 5px; }
                .message-actions { position: absolute; top: -10px; right: 0; display: none; gap: 5px; background: rgba(15, 23, 42, 0.9); padding: 5px; border-radius: 8px; border: 1px solid var(--primary); }
                .message-bubble:hover .message-actions { display: flex; }
                .msg-deleted-content { font-style: italic; opacity: 0.5; font-size: 0.9rem; }
            </style>
        `;
        scrollToBottom();
    };

    const renderMessage = (m) => {
        const isOwn = m.sender_id === user.id;
        const msgTime = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isAdminMsg = ['super_admin', 'head_dept'].includes(m.sender_role);

        if (m.is_deleted) {
            return `
                <div class="message-bubble ${isOwn ? 'msg-own' : 'msg-other'}" style="opacity: 0.6;">
                    <div class="msg-deleted-content"><i class="ph ph-trash"></i> تم حذف هذه الرسالة</div>
                    <span class="msg-time">${msgTime}</span>
                </div>
            `;
        }

        return `
            <div class="message-bubble ${isOwn ? 'msg-own' : 'msg-other'}">
                ${!isOwn ? `<span class="msg-sender">${m.sender_name} ${isAdminMsg ? '<span class="msg-admin-tag">مسؤول</span>' : ''}</span>` : ''}
                <div class="msg-content">${m.content}</div>
                ${m.is_edited ? '<span style="font-size: 0.6rem; opacity: 0.5;">(تم التعديل)</span>' : ''}
                
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; margin-top: 4px;">
                    <span class="msg-time" style="margin:0;">${msgTime}</span>
                    <div class="msg-views" onclick="window.chat_showViews(${m.id})" style="cursor: pointer; display: flex; align-items: center; gap: 3px; font-size: 0.65rem; opacity: 0.7;">
                        <i class="ph-bold ph-checks" style="color: ${m.views_count > 0 ? '#00f2ff' : '#aaa'};"></i>
                        <span>${m.views_count}</span>
                    </div>
                </div>

                <!-- Actions -->
                ${(isOwn || ['super_admin', 'head_dept'].includes(user.role)) ? `
                <div class="message-actions">
                    ${isOwn ? `<button class="icon-btn" onclick="window.chat_editMessage(${m.id}, '${m.content}')" style="padding: 2px;"><i class="ph ph-pencil-simple" style="font-size: 14px;"></i></button>` : ''}
                    <button class="icon-btn" onclick="window.chat_deleteMessage(${m.id})" style="padding: 2px; color: var(--red);"><i class="ph ph-trash-simple" style="font-size: 14px;"></i></button>
                </div>
                ` : ''}
            </div>
        `;
    };

    const scrollToBottom = () => {
        const container = document.getElementById('chat-messages-container');
        if (container) container.scrollTop = container.scrollHeight;
    };

    const init = async () => {
        try {
            groups = await api.getMyChatGroups();
            if (groups.length > 0) {
                // Determine starting group
                selectedGroupId = user.section_id || (groups.length > 0 ? groups[0].id : null);
                if (selectedGroupId) await refreshMessages();
            }
            render();
            startPolling();
        } catch (e) {
            UI.toast('Error loading chats', 'error');
        }
    };

    const refreshMessages = async () => {
        if (!selectedGroupId) return;
        try {
            const newMessages = await api.getChatMessages(selectedGroupId);
            // Only update if changed
            if (JSON.stringify(newMessages) !== JSON.stringify(messages)) {
                messages = newMessages;
                render();
                // Mark new messages as read
                const unreadIds = messages.map(m => m.id);
                if (unreadIds.length > 0) api.markChatMessageRead(unreadIds);
            }
        } catch (e) {}
    };

    const startPolling = () => {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(refreshMessages, 4000); 
    };

    // Global listeners
    window.chat_showViews = async (id) => {
        try {
            const viewers = await api.getMessageViews(id);
            const content = viewers.length > 0 
                ? viewers.map(v => `
                    <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="color: white; font-weight: 600;">${v.full_name}</span>
                        <span style="font-size: 0.7rem; color: #94a3b8;">${new Date(v.read_at).toLocaleString()}</span>
                    </div>
                `).join('')
                : '<p style="text-align: center; color: #94a3b8; padding: 20px;">لم يشاهد أحد الرسالة بعد</p>';
            
            const modal = document.createElement('div');
            modal.id = 'chat-views-modal';
            modal.style = "position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:99999; display:flex; align-items:center; justify-content:center; padding:1.5rem; backdrop-filter:blur(8px);";
            modal.innerHTML = `
                <div class="card" style="max-width:400px; width:100%; border: 1px solid var(--primary); background: #0f172a; padding: 0; overflow: hidden; animation: popIn 0.3s ease;">
                    <div style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(to right, var(--primary), var(--secondary));">
                        <h3 style="margin: 0; color: white; font-size: 1rem;">من شاهد الرسالة؟</h3>
                        <button onclick="document.getElementById('chat-views-modal').remove()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer;">✕</button>
                    </div>
                    <div style="max-height: 400px; overflow-y: auto; padding: 10px;">${content}</div>
                </div>
            `;
            document.body.appendChild(modal);
        } catch (e) {
            UI.toast('فشل جلب المشاهدات', 'error');
        }
    };

    // Global listeners
    window.chat_selectGroup = async (id) => {
        selectedGroupId = id;
        messages = [];
        render();
        await refreshMessages();
    };

    window.chat_sendMessage = async () => {
        const input = document.getElementById('chat-input');
        const content = input?.value?.trim();
        if (!content || !selectedGroupId) return;

        input.value = '';
        try {
            await api.sendChatMessage(content, selectedGroupId);
            await refreshMessages();
        } catch (e) {
            UI.toast('فشل إرسال الرسالة', 'error');
        }
    };

    window.chat_deleteMessage = async (id) => {
        if (!confirm(i18n.t('confirm_delete'))) return;
        try {
            await api.deleteChatMessage(id);
            await refreshMessages();
        } catch (e) {
            UI.toast('فشل الحذف', 'error');
        }
    };

    window.chat_editMessage = async (id, oldContent) => {
        const newContent = prompt('تعديل الرسالة:', oldContent);
        if (newContent && newContent.trim() !== oldContent) {
            try {
                await api.updateChatMessage(id, newContent.trim());
                await refreshMessages();
            } catch (e) {
                UI.toast('فشل التعديل', 'error');
            }
        }
    };

    window.chat_toggleMute = async () => {
        try {
            const res = await api.toggleChatMute(selectedGroupId);
            // Update local group state
            const g = groups.find(x => x.id === selectedGroupId);
            if (g) g.is_muted = res.is_muted;
            UI.toast(res.is_muted ? 'تم كتم الدردشة' : 'تم تفعيل التنبيهات', 'success');
            render();
        } catch (e) {}
    };

    window.chat_viewMembers = async () => {
        try {
            const members = await api.getGroupMembers(selectedGroupId);
            const content = members.length > 0 
                ? members.map(m => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 35px; height: 35px; border-radius: 50%; background: var(--primary); display: grid; place-items: center; font-weight: bold; color: white;">
                                ${m.full_name[0].toUpperCase()}
                            </div>
                            <div>
                                <div style="color: white; font-weight: 600; font-size: 0.9rem;">${m.full_name}</div>
                                <div style="color: #94a3b8; font-size: 0.7rem;">${m.email}</div>
                            </div>
                        </div>
                        <span style="font-size: 0.7rem; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 10px;">
                            ${m.role === 'student' ? 'طالب' : 'مسؤول'}
                        </span>
                    </div>
                `).join('')
                : '<p style="text-align: center; color: #94a3b8; padding: 20px;">لا يوجد أعضاء في هذه المجموعة</p>';

            UI.modal('أعضاء المجموعة', `<div style="max-height: 400px; overflow-y: auto;">${content}</div>`, () => true);
        } catch (e) {
            UI.toast('فشل جلب قائمة الأعضاء', 'error');
        }
    };

    window.chat_toggleLock = async () => {
        try {
            const res = await api.toggleChatLock(selectedGroupId);
            const g = groups.find(x => x.id === selectedGroupId);
            if (g) g.is_locked = res.is_locked;
            UI.toast(res.is_locked ? 'تم قفل الدردشة بنجاح' : 'تم فتح الدردشة بنجاح', 'success');
            render();
        } catch (e) {
            UI.toast('فشل تغيير حالة القفل', 'error');
        }
    };

    window.chat_renameGroup = async () => {
        const currentName = groups.find(g => g.id === selectedGroupId)?.name || '';
        const newName = prompt('تغيير اسم المجموعة:', currentName);
        if (newName && newName.trim() !== currentName) {
            try {
                await api.renameGroup(selectedGroupId, newName.trim());
                const g = groups.find(x => x.id === selectedGroupId);
                if (g) g.name = newName.trim();
                UI.toast('تم تغيير الاسم بنجاح', 'success');
                render();
            } catch (e) {
                UI.toast('فشل تغيير الاسم', 'error');
            }
        }
    };

    // Cleanup on destroy
    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('main-content').contains(document.querySelector('.chat-layout'))) {
            if (pollInterval) clearInterval(pollInterval);
            observer.disconnect();
        }
    });
    setTimeout(() => {
        const target = document.getElementById('main-content');
        if (target) observer.observe(target, { childList: true, subtree: true });
    }, 100);

    init();
    return '<div style="display:grid; place-items:center; height: 50vh;"><div class="spinner"></div></div>';
}
