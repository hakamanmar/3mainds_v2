
import { api, auth } from '/static/js/api.js';
import { UI } from '/static/js/ui.js';
import { i18n } from '/static/js/i18n.js';

export default function ChatPage() {
    const user = auth.getUser();
    if (!user) return '<div class="card">Please login</div>';

    let currentSectionId = user.section_id || null;
    let messages = [];
    let groups = [];
    let privates = [];
    let selectedId = null;
    let selectedType = 'group'; // 'group' or 'private'
    let pollInterval = null;
    let isEditingMsgId = null;

    const render = () => {
        const root = document.getElementById('main-content');
        if (!root) return;

        const isAdmin = ['super_admin', 'head_dept'].includes(user.role);
        const selectedChat = (selectedType === 'group' 
            ? groups.find(g => g.id === selectedId) 
            : privates.find(p => p.id === selectedId));

        root.innerHTML = `
            <div class="chat-layout" style="display: flex; height: calc(100vh - 80px); gap: 15px; padding: 10px;">
                <!-- Sidebar -->
                <div class="chat-sidebar card" style="width: 280px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--primary-light);">
                    <div class="sidebar-header" style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(to right, var(--primary), var(--secondary)); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="color: white; margin: 0; font-size: 1.1rem;"><i class="ph ph-chats"></i> الدردشات</h3>
                        <button class="icon-btn" onclick="window.chat_startNewPrivate()" title="بدء محادثة خاصة" style="width: 30px; height: 30px; font-size: 0.9rem;">
                            <i class="ph ph-plus"></i>
                        </button>
                    </div>
                    
                    <div class="chat-list" style="flex: 1; overflow-y: auto; padding: 10px;">
                        <div style="color: #94a3b8; font-size: 0.75rem; margin: 10px 0 5px 5px; text-transform: uppercase; letter-spacing: 1px;">المجموعات</div>
                        ${groups.map(g => `
                            <div class="chat-item ${selectedId === g.id && selectedType === 'group' ? 'active' : ''}" 
                                 onclick="window.chat_select('group', '${g.id}')"
                                 style="padding: 12px; margin-bottom: 8px; border-radius: 12px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 10px; border: 1px solid ${selectedId === g.id && selectedType === 'group' ? 'var(--primary)' : 'transparent'}; background: ${selectedId === g.id && selectedType === 'group' ? 'rgba(79, 70, 229, 0.2)' : 'rgba(255,255,255,0.05)'};">
                                <div class="chat-icon group-icon" style="width: 35px; height: 35px; border-radius: 10px; background: var(--primary); display: grid; place-items: center; color: white;">
                                    <i class="ph-bold ph-users-three"></i>
                                </div>
                                <div style="color: white; font-weight: 500; font-size: 0.9rem;">${g.name}</div>
                            </div>
                        `).join('')}

                        <div style="color: #94a3b8; font-size: 0.75rem; margin: 20px 0 5px 5px; text-transform: uppercase; letter-spacing: 1px;">المحادثات الخاصة</div>
                        ${privates.length === 0 ? '<div style="color: #475569; font-size: 0.8rem; text-align: center; padding: 10px;">لا توجد محادثات خاصة</div>' : privates.map(p => `
                            <div class="chat-item ${selectedId === p.id && selectedType === 'private' ? 'active' : ''}" 
                                 onclick="window.chat_select('private', ${p.id})"
                                 style="padding: 12px; margin-bottom: 8px; border-radius: 12px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 10px; border: 1px solid ${selectedId === p.id && selectedType === 'private' ? 'var(--secondary)' : 'transparent'}; background: ${selectedId === p.id && selectedType === 'private' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.05)'};">
                                <div class="chat-icon private-icon" style="width: 35px; height: 35px; border-radius: 50%; background: var(--secondary); display: grid; place-items: center; color: white; font-weight: bold; font-size: 0.8rem;">
                                    ${p.name[0].toUpperCase()}
                                </div>
                                <div style="overflow: hidden;">
                                    <div style="color: white; font-weight: 500; font-size: 0.9rem; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
                                    <div style="color: #94a3b8; font-size: 0.7rem;">${p.role === 'student' ? 'طالب' : 'مسؤول'}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Main Chat Area -->
                <div class="chat-main card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #0f172a; border: 1px solid rgba(79, 70, 229, 0.3); position: relative;">
                    <!-- Cyber Grid Pattern Overlay -->
                    <div style="position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(79, 70, 229, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(79, 70, 229, 0.05) 1px, transparent 1px); background-size: 30px 30px; pointer-events: none;"></div>

                    <!-- Chat Header -->
                    <div class="chat-header" style="height: 60px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(10px); z-index: 10;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${selectedType === 'group' 
                                ? '<i class="ph-bold ph-chat-circle" style="color: var(--primary); font-size: 1.4rem;"></i>' 
                                : '<i class="ph-bold ph-user-circle" style="color: var(--secondary); font-size: 1.4rem;"></i>'}
                            <div style="display: flex; flex-direction: column;">
                                <h3 style="color: white; margin: 0; display: flex; align-items: center; gap: 10px; font-size: 1rem;">
                                    ${selectedChat?.name || 'اختر محادثة'}
                                    ${selectedType === 'group' && selectedChat?.is_locked ? '<i class="ph ph-lock" style="font-size: 0.9rem; color: var(--red);"></i>' : ''}
                                    ${isAdmin && selectedType === 'group' ? `<button class="icon-btn" onclick="window.chat_renameGroup()" style="font-size: 1rem; width: 25px; height: 25px;"><i class="ph ph-pencil-simple"></i></button>` : ''}
                                </h3>
                                <div style="display: flex; align-items: center; gap: 5px; color: #10b981; font-size: 0.65rem; margin-top: 2px;">
                                    <i class="ph-fill ph-shield-check"></i>
                                    <span>مشفر وآمن (E2EE)</span>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${selectedType === 'group' ? `
                                <button class="icon-btn" onclick="window.chat_viewMembers()" title="قائمة الأعضاء">
                                    <i class="ph ph-users-three"></i>
                                </button>
                                ${isAdmin ? `
                                <button class="icon-btn" onclick="window.chat_toggleLock()" title="${selectedChat?.is_locked ? 'فتح الدردشة' : 'قفل الدردشة'}">
                                    <i class="ph ${selectedChat?.is_locked ? 'ph-lock-open' : 'ph-lock'}" style="color: ${selectedChat?.is_locked ? '#10b981' : '#f59e0b'}"></i>
                                </button>
                                ` : ''}
                                <button id="mute-toggle" class="icon-btn" onclick="window.chat_toggleMute()" title="كتم الإشعارات">
                                    <i class="ph ${selectedChat?.is_muted ? 'ph-bell-slash' : 'ph-bell'}" style="color: ${selectedChat?.is_muted ? 'var(--red)' : '#fff'}"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Messages Container -->
                    <div id="chat-messages-container" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; position: relative;">
                        ${selectedType === 'group' && selectedChat?.is_locked ? `
                        <div style="text-align: center; margin-bottom: 20px; animation: fadeIn 0.5s;">
                            <span style="background: rgba(244, 63, 94, 0.1); color: var(--red); padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; border: 1px solid rgba(244, 63, 94, 0.2);">
                                <i class="ph ph-lock"></i> الدردشة مقفلة من قبل المسؤول
                            </span>
                        </div>
                        ` : ''}
                        ${!selectedId ? `
                            <div style="text-align: center; color: var(--text-muted); margin-top: 50px;">
                                <i class="ph ph-chat-circle-dots" style="font-size: 5rem; display: block; margin-bottom: 20px; opacity: 0.3;"></i>
                                اختر محادثة من القائمة الجانبية للبدء
                            </div>
                        ` : messages.length === 0 ? `
                            <div style="text-align: center; color: var(--text-muted); margin-top: 50px;">
                                <i class="ph ph-chat-centered-dots" style="font-size: 3rem; display: block; margin-bottom: 10px;"></i>
                                لا توجد رسائل بعد. ابدأ المحادثة الآن!
                            </div>
                        ` : messages.map(m => renderMessage(m)).join('')}
                    </div>

                    <!-- Input Area -->
                    ${selectedId ? `
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
                    ` : ''}
                </div>
            </div>

            <style>
                .chat-layout { font-family: 'Cairo', sans-serif; }
                .message-bubble { max-width: 75%; padding: 12px 16px; border-radius: 18px; position: relative; animation: slideInUp 0.3s ease; }
                .msg-own { align-self: flex-end; background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; border-bottom-right-radius: 4px; }
                .msg-other { align-self: flex-start; background: rgba(255,255,255,0.1); color: white; border-bottom-left-radius: 4px; border: 1px solid rgba(255,255,255,0.05); }
                .msg-sender { font-size: 0.75rem; font-weight: 700; margin-bottom: 4px; display: block; opacity: 0.8; }
                .msg-time { font-size: 0.65rem; opacity: 0.6; display: block; text-align: right; margin-top: 4px; }
                .chat-item.active { background: rgba(79, 70, 229, 0.2) !important; color: white !important; }
                .chat-item:hover { background: rgba(255,255,255,0.1); }
                .msg-admin-tag { background: var(--red); color: white; font-size: 0.6rem; padding: 1px 4px; border-radius: 4px; margin-left: 5px; }
                .message-actions { position: absolute; top: -10px; right: 0; display: none; gap: 5px; background: rgba(15, 23, 42, 0.9); padding: 5px; border-radius: 8px; border: 1px solid var(--primary); }
                .message-bubble:hover .message-actions { display: flex; }
                .msg-deleted-content { font-style: italic; opacity: 0.5; font-size: 0.9rem; }
                .icon-btn { 
                    background: rgba(255,255,255,0.1); 
                    border: 1px solid rgba(255,255,255,0.15); 
                    color: #e2e8f0 !important; 
                    width: 36px; height: 36px; 
                    border-radius: 10px; 
                    display: inline-flex; align-items: center; justify-content: center;
                    font-size: 1.1rem; cursor: pointer; 
                    transition: all 0.2s;
                }
                .icon-btn:hover { 
                    background: rgba(79, 70, 229, 0.3); 
                    border-color: var(--primary); 
                    color: white !important;
                    transform: translateY(-1px);
                }
                .chat-sidebar { border-right: 1px solid rgba(255,255,255,0.05); }
                [dir="rtl"] .chat-sidebar { border-right: none; border-left: 1px solid rgba(255,255,255,0.05); }
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
                ${!isOwn && selectedType === 'group' ? `<span class="msg-sender">${m.sender_name} ${isAdminMsg ? '<span class="msg-admin-tag">مسؤول</span>' : ''}</span>` : ''}
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
            const res = await api.getMyChatGroups();
            groups = res.groups || [];
            privates = res.privates || [];
            
            if (groups.length > 0 || privates.length > 0) {
                // Determine starting group
                selectedId = selectedId || user.section_id || (groups.length > 0 ? groups[0].id : null);
                selectedType = selectedType || 'group';
                if (selectedId) await refreshMessages();
            }
            render();
            startPolling();
        } catch (e) {
            UI.toast('خطأ في تحميل المحادثات', 'error');
        }
    };

    const refreshMessages = async () => {
        if (!selectedId) return;
        try {
            const newMessages = (selectedType === 'group')
                ? await api.getChatMessages(selectedId)
                : await api.getChatMessages(null, selectedId);
                
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

    window.chat_select = async (type, id) => {
        selectedType = type;
        selectedId = id;
        messages = [];
        render();
        await refreshMessages();
    };

    window.chat_sendMessage = async () => {
        const input = document.getElementById('chat-input');
        const content = input?.value?.trim();
        if (!content || !selectedId) return;

        input.value = '';
        try {
            if (selectedType === 'group') {
                await api.sendChatMessage(content, selectedId);
            } else {
                await api.sendChatMessage(content, null, selectedId);
            }
            await refreshMessages();
        } catch (e) {
            UI.toast('فشل إرسال الرسالة', 'error');
        }
    };

    window.chat_startNewPrivate = async () => {
        try {
            // Get students in the same section to start a chat with
            const members = await api.getGroupMembers(user.section_id);
            const filtered = members.filter(m => m.id !== user.id);
            
            if (filtered.length === 0) {
                UI.toast('لا يوجد زملاء متاحين للدردشة', 'info');
                return;
            }

            const content = `
                <div style="max-height: 400px; overflow-y: auto;">
                    ${filtered.map(m => `
                        <div class="chat-item" onclick="window.chat_startWithUser(${m.id}, '${m.full_name}')" 
                             style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--secondary); display: grid; place-items: center; color: white; font-weight: bold;">
                                ${m.full_name[0].toUpperCase()}
                            </div>
                            <div>
                                <div style="color: white; font-weight: 600;">${m.full_name}</div>
                                <div style="color: #94a3b8; font-size: 0.75rem;">${m.email}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            UI.modal('بدء محادثة خاصة', content, () => true);
        } catch (e) {
            UI.toast('فشل جلب قائمة الزملاء', 'error');
        }
    };

    window.chat_startWithUser = async (userId, name) => {
        // Check if already in privates
        let existing = privates.find(p => p.id === userId);
        if (!existing) {
            privates.unshift({ id: userId, name, type: 'private', user_id: userId, role: 'student' });
        }
        
        selectedId = userId;
        selectedType = 'private';
        
        // Close modal
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
        
        messages = [];
        render();
        await refreshMessages();
    };

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
            
            UI.modal('من شاهد الرسالة؟', `<div style="max-height: 400px; overflow-y: auto;">${content}</div>`, () => true);
        } catch (e) {
            UI.toast('فشل جلب المشاهدات', 'error');
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
        if (selectedType !== 'group') return;
        try {
            const res = await api.toggleChatMute(selectedId);
            const g = groups.find(x => x.id === selectedId);
            if (g) g.is_muted = res.is_muted;
            UI.toast(res.is_muted ? 'تم كتم الدردشة' : 'تم تفعيل التنبيهات', 'success');
            render();
        } catch (e) {}
    };

    window.chat_viewMembers = async () => {
        if (selectedType !== 'group') return;
        try {
            const members = await api.getGroupMembers(selectedId);
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
        if (selectedType !== 'group') return;
        try {
            const res = await api.toggleChatLock(selectedId);
            const g = groups.find(x => x.id === selectedId);
            if (g) g.is_locked = res.is_locked;
            UI.toast(res.is_locked ? 'تم قفل الدردشة بنجاح' : 'تم فتح الدردشة بنجاح', 'success');
            render();
        } catch (e) {
            UI.toast('فشل تغيير حالة القفل', 'error');
        }
    };

    window.chat_renameGroup = async () => {
        if (selectedType !== 'group') return;
        const currentName = groups.find(g => g.id === selectedId)?.name || '';
        const newName = prompt('تغيير اسم المجموعة:', currentName);
        if (newName && newName.trim() !== currentName) {
            try {
                await api.renameGroup(selectedId, newName.trim());
                const g = groups.find(x => x.id === selectedId);
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
        const chatRoot = document.querySelector('.chat-layout');
        if (!document.getElementById('main-content').contains(chatRoot)) {
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
