/* api.js - 3Minds Platform - Fixed & Complete */
const API_BASE = '/api';

// Generate a unique device fingerprint
function getDeviceId() {
    try {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    } catch (e) {
        return 'temp_device_' + Date.now();
    }
}

export const auth = {
    getUser() {
        try {
            const u = localStorage.getItem('user');
            return u ? JSON.parse(u) : null;
        } catch (e) {
            return null;
        }
    },
    getToken() {
        // No longer needed: Token is stored in an HttpOnly cookie for security
        return null;
    },
    setUser(user, token = null) {
        try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) { }
        // We don't store the token in LocalStorage anymore! It's in the HttpOnly cookie.
    },
    logout() {
        try { localStorage.removeItem('user'); } catch (e) { }
        // Let the server clear the cookie
        fetch('/api/logout', { method: 'POST' }).finally(() => {
            window.location.href = '/';
        });
    }
};

export const api = {
    async _fetch(url, options = {}) {
        const user = auth.getUser();
        let selectedSection = localStorage.getItem('selected_section');
        let deviceId = localStorage.getItem('device_id');

        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (deviceId) headers['X-Device-ID'] = deviceId;
        if (user && user.role) headers['X-User-Role'] = user.role;
        const sectionId = (user && user.section_id) || selectedSection;
        if (sectionId) headers['X-Section-ID'] = sectionId;

        const isGet = !options.method || options.method.toUpperCase() === 'GET';
        const cacheKey = `cache_${url.split('?')[0]}`;
        
        let finalUrl = url;
        if (navigator.onLine && isGet) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl += `${separator}t=${Date.now()}`;
        }

        try {
            const res = await fetch(finalUrl, { ...options, headers });
            
            if (res.status === 401) { auth.logout(); return; }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw { status: res.status, message: err.error || err.message || res.statusText };
            }

            const data = await res.json();
            // Save to Persistent LocalStorage Cache if it's a GET request
            if (isGet) {
                try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch(e) {}
            }
            return data;
        } catch (e) {
            // OFFLINE FALLBACK: Return data from LocalStorage if available
            if (isGet) {
                try {
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) {
                        console.log('[Bulletproof Cache] Serving from LocalStorage:', url);
                        return JSON.parse(cachedData); 
                    }
                } catch(err) {}
            }
            // If it's lessons or assignments, return empty array to prevent map errors
            if (url.includes('lessons') || url.includes('assignments') || url.includes('subjects') || url.includes('users')) return [];
            throw e;
        }
    },

    // ── Sections ──────────────────────────────────────────────
    async getSections() {
        const res = await this._fetch(`${API_BASE}/sections`);
        return Array.isArray(res) ? res : (res.sections || []);
    },
    getSelectedSection() {
        try { return localStorage.getItem('selected_section'); } catch (e) { return null; }
    },
    setSelectedSection(id) {
        try { localStorage.setItem('selected_section', id); } catch (e) { }
    },

    // ── Auth ──────────────────────────────────────────────────
    async login(email, password) {
        return this._fetch(`${API_BASE}/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password, device_id: getDeviceId() })
        });
    },
    async changePassword(user_id, password) {
        return this._fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            body: JSON.stringify({ user_id, password })
        });
    },

    // ── Subjects ──────────────────────────────────────────────
    async getSubjects(sectionId = null) {
        let url = `${API_BASE}/subjects`;
        if (sectionId) url += `?section_id=${sectionId}`;
        return this._fetch(url);
    },
    async getSubject(id) {
        return this._fetch(`${API_BASE}/subjects/${id}`);
    },
    async addSubject(data) {
        return this._fetch(`${API_BASE}/subjects`, { method: 'POST', body: JSON.stringify(data) });
    },
    async updateSubject(id, data) {
        return this._fetch(`${API_BASE}/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteSubject(id) {
        return this._fetch(`${API_BASE}/subjects/${id}`, { method: 'DELETE' });
    },

    // ── Lessons ───────────────────────────────────────────────
    async getLessons(subjectId) {
        return this._fetch(`${API_BASE}/subjects/${subjectId}/lessons`);
    },
    async addLesson(data) {
        return this._fetch(`${API_BASE}/admin/add-lesson`, { method: 'POST', body: JSON.stringify(data) });
    },
    async updateLesson(id, data) {
        return this._fetch(`${API_BASE}/lessons/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteLesson(id) {
        return this._fetch(`${API_BASE}/lessons/${id}`, { method: 'DELETE' });
    },

    // ── Announcements ─────────────────────────────────────────
    async getAnnouncements() {
        return this._fetch(`${API_BASE}/announcements`);
    },
    async addAnnouncement(content, sectionId = null, targetDate = null) {
        return this._fetch(`${API_BASE}/announcements`, { method: 'POST', body: JSON.stringify({ content, section_id: sectionId, target_date: targetDate }) });
    },
    async updateAnnouncement(id, content, targetDate = null) {
        return this._fetch(`${API_BASE}/announcements?id=${id}`, { method: 'PUT', body: JSON.stringify({ content, target_date: targetDate }) });
    },
    async deleteAnnouncement(id) {
        return this._fetch(`${API_BASE}/announcements?id=${id}`, { method: 'DELETE' });
    },

    // ── Users / Students ──────────────────────────────────────
    async getUsers(sectionId = null) {
        let url = `${API_BASE}/users`;
        if (sectionId) url += `?section_id=${sectionId}`;
        return this._fetch(url);
    },
    async deleteUser(id) {
        return this._fetch(`${API_BASE}/users?id=${id}`, { method: 'DELETE' });
    },
    async addUser(email, password, role, section_ids = [], full_name = '', subject_ids = []) {
        return this._fetch(`${API_BASE}/admin/add-user`, {
            method: 'POST',
            body: JSON.stringify({ email, password, role, section_ids, full_name, subject_ids })
        });
    },
    async adminChangePassword(user_id, new_password) {
        return this._fetch(`${API_BASE}/admin/change-password`, {
            method: 'POST',
            body: JSON.stringify({ user_id, new_password })
        });
    },
    async resetDevice(user_id) {
        return this._fetch(`${API_BASE}/admin/reset-device`, { method: 'POST', body: JSON.stringify({ user_id }) });
    },
    async assignInstructorCourses(instructor_id, course_ids) {
        return this._fetch(`${API_BASE}/instructor-courses`, {
            method: 'POST',
            body: JSON.stringify({ instructor_id, course_ids })
        });
    },
    async getMyCourses() {
        return this._fetch(`${API_BASE}/my-courses`);
    },
    
    // ── Push Notifications ─────────────────────────────────────
    async getPushPublicKey() {
        return this._fetch(`${API_BASE}/push/public-key`);
    },
    async subscribePush(subscription) {
        return this._fetch(`${API_BASE}/push/subscribe`, {
            method: 'POST',
            body: JSON.stringify(subscription)
        });
    },

    // ── Stats ─────────────────────────────────────────────────
    async getStats() {
        return this._fetch(`${API_BASE}/stats`);
    },

    // ── Attendance ────────────────────────────────────────────
    async startAttendance(data) {
        return this._fetch(`${API_BASE}/attendance/start`, { method: 'POST', body: JSON.stringify(data) });
    },
    async getAttendanceQR(sessionId, force = false) {
        return this._fetch(`${API_BASE}/attendance/qr/${sessionId}${force ? '?refresh=1' : ''}`, {
            method: force ? 'POST' : 'GET'
        });
    },
    async scanQR(token, studentId) {
        return this._fetch(`${API_BASE}/attendance/scan`, { method: 'POST', body: JSON.stringify({ token, student_id: studentId }) });
    },
    async getLiveAttendance(sessionId) {
        return this._fetch(`${API_BASE}/attendance/live/${sessionId}`);
    },
    async endAttendance(sessionId) {
        return this._fetch(`${API_BASE}/attendance/end/${sessionId}`, { method: 'POST' });
    },
    async toggleAttendanceStatus(sessionId, status) {
        return this._fetch(`${API_BASE}/attendance/toggle-status/${sessionId}`, { method: 'POST', body: JSON.stringify({ status }) });
    },
    async getAttendanceSessions(professorId = null, subjectId = null, status = null) {
        let url = `${API_BASE}/attendance/sessions?`;
        if (professorId) url += `professor_id=${professorId}&`;
        if (subjectId) url += `subject_id=${subjectId}&`;
        if (status) url += `status=${status}`;
        return this._fetch(url);
    },
    async getSessionDetails(sessionId) {
        return this._fetch(`${API_BASE}/attendance/sessions/${sessionId}/details`);
    },
    async getMyAttendanceHistory(studentId, subjectId = null) {
        let url = `${API_BASE}/attendance/my-history?student_id=${studentId}`;
        if (subjectId) url += `&subject_id=${subjectId}`;
        return this._fetch(url);
    },
    async getMyAttendanceStats(studentId) {
        return this._fetch(`${API_BASE}/attendance/my-stats?student_id=${studentId}`);
    },
    async getAttendanceReport(subjectId = null) {
        let url = `${API_BASE}/attendance/report`;
        if (subjectId) url += `?subject_id=${subjectId}`;
        return this._fetch(url);
    },
    async getAttendanceAlerts(threshold = 0.25) {
        return this._fetch(`${API_BASE}/attendance/alerts?threshold=${threshold}`);
    },
    async getAttendanceOverview() {
        return this._fetch(`${API_BASE}/attendance/overview`);
    },
    async getActiveSession(subjectId) {
        return this._fetch(`${API_BASE}/attendance/active/${subjectId}`);
    },

    async getSectionStudents(sectionId) {
        let url = `${API_BASE}/attendance/section-students`;
        if (sectionId) url += `?section_id=${sectionId}`;
        return this._fetch(url);
    },
    async manualMarkAttendance(data) {
        return this._fetch(`${API_BASE}/attendance/manual-mark`, { method: 'POST', body: JSON.stringify(data) });
    },
    async deleteAttendanceRecord(sessionId, studentId) {
        return this._fetch(`${API_BASE}/attendance/delete-record`, {
            method: 'DELETE',
            body: JSON.stringify({ session_id: sessionId, student_id: studentId })
        });
    },

    async deleteAttendanceSession(sessionId) {
        return this._fetch(`${API_BASE}/attendance/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    },

    // ── Homework / Assignments ──────────────────────────────
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const headers = {};
        let deviceId = null;
        try { deviceId = localStorage.getItem('device_id'); } catch (e) { }
        if (deviceId) headers['X-Device-ID'] = deviceId;

        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers,
            body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    },
    async getAssignments(subjectId) {
        return this._fetch(`${API_BASE}/assignments?subject_id=${subjectId}`);
    },
    async addAssignment(data) {
        return this._fetch(`${API_BASE}/assignments`, { method: 'POST', body: JSON.stringify(data) });
    },
    async submitHomework(data) {
        return this._fetch(`${API_BASE}/submissions`, { method: 'POST', body: JSON.stringify(data) });
    },
    async gradeSubmission(submissionId, data) {
        return this._fetch(`${API_BASE}/submissions/${submissionId}/grade`, { method: 'POST', body: JSON.stringify(data) });
    },
    async getStudentGrades() {
        return this._fetch(`${API_BASE}/student/grades`);
    },
    async getAssignmentSubmissions(assignmentId) {
        return this._fetch(`${API_BASE}/assignments/${assignmentId}/submissions`);
    },
    async deleteSubmission(submissionId) {
        return this._fetch(`${API_BASE}/submissions/${submissionId}`, { method: 'DELETE' });
    },
    // ── MCQ EXAM SYSTEM ──────────────────────────────────────────
    async listExams() {
        return this._fetch(`${API_BASE}/exams`);
    },
    async createExam(data) {
        return this._fetch(`${API_BASE}/exams`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    async getExam(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}`);
    },
    async startExam(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    },
    async submitExam(examId, data) {
        return this._fetch(`${API_BASE}/exams/${examId}/submit`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    async getExamResults(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}/results`);
    },
    async addExamFeedback(examId, data) {
        return this._fetch(`${API_BASE}/exams/${examId}/feedback`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    async deleteExam(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}`, { method: 'DELETE' });
    },

    // ── CHAT SYSTEM ──────────────────────────────────────────────
    async getChatMessages(sectionId = null, limit = 50) {
        let url = `${API_BASE}/chat/messages?limit=${limit}`;
        if (sectionId) url += `&section_id=${sectionId}`;
        return this._fetch(url);
    },
    async sendChatMessage(content, sectionId = null) {
        return this._fetch(`${API_BASE}/chat/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, section_id: sectionId })
        });
    },
    async updateChatMessage(msgId, content) {
        return this._fetch(`${API_BASE}/chat/messages/${msgId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
    },
    async deleteChatMessage(msgId) {
        return this._fetch(`${API_BASE}/chat/messages/${msgId}`, { method: 'DELETE' });
    },
    async toggleChatMute(sectionId = null) {
        return this._fetch(`${API_BASE}/chat/settings/toggle-mute`, {
            method: 'POST',
            body: JSON.stringify({ section_id: sectionId })
        });
    },
    async getMyChatGroups() {
        return this._fetch(`${API_BASE}/chat/my-groups`);
    },
    async markChatMessageRead(messageIds) {
        return this._fetch(`${API_BASE}/chat/mark-read`, {
            method: 'POST',
            body: JSON.stringify({ message_ids: messageIds })
        });
    },
    async getMessageViews(msgId) {
        return this._fetch(`${API_BASE}/chat/messages/${msgId}/views`);
    },
    async getGroupMembers(sectionId) {
        return this._fetch(`${API_BASE}/chat/groups/${sectionId}/members`);
    },
    async toggleChatLock(sectionId) {
        return this._fetch(`${API_BASE}/chat/groups/${sectionId}/toggle-lock`, { method: 'POST' });
    },
    async renameGroup(sectionId, name) {
        return this._fetch(`${API_BASE}/chat/groups/${sectionId}/rename`, {
            method: 'PUT',
            body: JSON.stringify({ name })
        });
    }
};
/* api.js - 3Minds Platform - Fixed & Complete */
const API_BASE = '/api';

// Generate a unique device fingerprint
function getDeviceId() {
    try {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    } catch (e) {
        return 'temp_device_' + Date.now();
    }
}

export const auth = {
    getUser() {
        try {
            const u = localStorage.getItem('user');
            return u ? JSON.parse(u) : null;
        } catch (e) {
            return null;
        }
    },
    getToken() {
        // No longer needed: Token is stored in an HttpOnly cookie for security
        return null;
    },
    setUser(user, token = null) {
        try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) { }
        // We don't store the token in LocalStorage anymore! It's in the HttpOnly cookie.
    },
    logout() {
        try { localStorage.removeItem('user'); } catch (e) { }
        // Let the server clear the cookie
        fetch('/api/logout', { method: 'POST' }).finally(() => {
            window.location.href = '/';
        });
    }
};

export const api = {
    async _fetch(url, options = {}) {
        const user = auth.getUser();
        let selectedSection = localStorage.getItem('selected_section');
        let deviceId = localStorage.getItem('device_id');

        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (deviceId) headers['X-Device-ID'] = deviceId;
        if (user && user.role) headers['X-User-Role'] = user.role;
        const sectionId = (user && user.section_id) || selectedSection;
        if (sectionId) headers['X-Section-ID'] = sectionId;

        const isGet = !options.method || options.method.toUpperCase() === 'GET';
        const cacheKey = `cache_${url.split('?')[0]}`;
        
        let finalUrl = url;
        if (navigator.onLine && isGet) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl += `${separator}t=${Date.now()}`;
        }

        try {
            const res = await fetch(finalUrl, { ...options, headers });
            
            if (res.status === 401) { auth.logout(); return; }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw { status: res.status, message: err.error || err.message || res.statusText };
            }

            const data = await res.json();
            // Save to Persistent LocalStorage Cache if it's a GET request
            if (isGet) {
                try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch(e) {}
            }
            return data;
        } catch (e) {
            // OFFLINE FALLBACK: Return data from LocalStorage if available
            if (isGet) {
                try {
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) {
                        console.log('[Bulletproof Cache] Serving from LocalStorage:', url);
                        return JSON.parse(cachedData); 
                    }
                } catch(err) {}
            }
            // If it's lessons or assignments, return empty array to prevent map errors
            if (url.includes('lessons') || url.includes('assignments') || url.includes('subjects') || url.includes('users')) return [];
            throw e;
        }
    },

    // ── Sections ──────────────────────────────────────────────
    async getSections() {
        const res = await this._fetch(`${API_BASE}/sections`);
        return Array.isArray(res) ? res : (res.sections || []);
    },
    getSelectedSection() {
        try { return localStorage.getItem('selected_section'); } catch (e) { return null; }
    },
    setSelectedSection(id) {
        try { localStorage.setItem('selected_section', id); } catch (e) { }
    },

    // ── Auth ──────────────────────────────────────────────────
    async login(email, password) {
        return this._fetch(`${API_BASE}/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password, device_id: getDeviceId() })
        });
    },
    async changePassword(user_id, password) {
        return this._fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            body: JSON.stringify({ user_id, password })
        });
    },

    // ── Subjects ──────────────────────────────────────────────
    async getSubjects(sectionId = null) {
        let url = `${API_BASE}/subjects`;
        if (sectionId) url += `?section_id=${sectionId}`;
        return this._fetch(url);
    },
    async getSubject(id) {
        return this._fetch(`${API_BASE}/subjects/${id}`);
    },
    async addSubject(data) {
        return this._fetch(`${API_BASE}/subjects`, { method: 'POST', body: JSON.stringify(data) });
    },
    async updateSubject(id, data) {
        return this._fetch(`${API_BASE}/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteSubject(id) {
        return this._fetch(`${API_BASE}/subjects/${id}`, { method: 'DELETE' });
    },

    // ── Lessons ───────────────────────────────────────────────
    async getLessons(subjectId) {
        return this._fetch(`${API_BASE}/subjects/${subjectId}/lessons`);
    },
    async addLesson(data) {
        return this._fetch(`${API_BASE}/admin/add-lesson`, { method: 'POST', body: JSON.stringify(data) });
    },
    async updateLesson(id, data) {
        return this._fetch(`${API_BASE}/lessons/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteLesson(id) {
        return this._fetch(`${API_BASE}/lessons/${id}`, { method: 'DELETE' });
    },

    // ── Announcements ─────────────────────────────────────────
    async getAnnouncements() {
        return this._fetch(`${API_BASE}/announcements`);
    },
    async addAnnouncement(content, sectionId = null, targetDate = null) {
        return this._fetch(`${API_BASE}/announcements`, { method: 'POST', body: JSON.stringify({ content, section_id: sectionId, target_date: targetDate }) });
    },
    async updateAnnouncement(id, content, targetDate = null) {
        return this._fetch(`${API_BASE}/announcements?id=${id}`, { method: 'PUT', body: JSON.stringify({ content, target_date: targetDate }) });
    },
    async deleteAnnouncement(id) {
        return this._fetch(`${API_BASE}/announcements?id=${id}`, { method: 'DELETE' });
    },

    // ── Users / Students ──────────────────────────────────────
    async getUsers(sectionId = null) {
        let url = `${API_BASE}/users`;
        if (sectionId) url += `?section_id=${sectionId}`;
        return this._fetch(url);
    },
    async deleteUser(id) {
        return this._fetch(`${API_BASE}/users?id=${id}`, { method: 'DELETE' });
    },
    async addUser(email, password, role, section_ids = [], full_name = '', subject_ids = []) {
        return this._fetch(`${API_BASE}/admin/add-user`, {
            method: 'POST',
            body: JSON.stringify({ email, password, role, section_ids, full_name, subject_ids })
        });
    },
    async adminChangePassword(user_id, new_password) {
        return this._fetch(`${API_BASE}/admin/change-password`, {
            method: 'POST',
            body: JSON.stringify({ user_id, new_password })
        });
    },
    async resetDevice(user_id) {
        return this._fetch(`${API_BASE}/admin/reset-device`, {
            method: 'POST',
            body: JSON.stringify({ user_id })
        });
    },
    async assignInstructorCourses(instructor_id, course_ids) {
        return this._fetch(`${API_BASE}/instructor-courses`, {
            method: 'POST',
            body: JSON.stringify({ instructor_id, course_ids })
        });
    },
    async getMyCourses() {
        return this._fetch(`${API_BASE}/my-courses`);
    },
    async resetDevice(user_id) {
        return this._fetch(`${API_BASE}/admin/reset-device`, { method: 'POST', body: JSON.stringify({ user_id }) });
    },

    // ── Stats ─────────────────────────────────────────────────
    async getStats() {
        return this._fetch(`${API_BASE}/stats`);
    },

    // ── Attendance ────────────────────────────────────────────
    async startAttendance(data) {
        return this._fetch(`${API_BASE}/attendance/start`, { method: 'POST', body: JSON.stringify(data) });
    },
    async getAttendanceQR(sessionId, force = false) {
        return this._fetch(`${API_BASE}/attendance/qr/${sessionId}${force ? '?refresh=1' : ''}`, {
            method: force ? 'POST' : 'GET'
        });
    },
    async scanQR(token, studentId) {
        return this._fetch(`${API_BASE}/attendance/scan`, { method: 'POST', body: JSON.stringify({ token, student_id: studentId }) });
    },
    async getLiveAttendance(sessionId) {
        return this._fetch(`${API_BASE}/attendance/live/${sessionId}`);
    },
    async endAttendance(sessionId) {
        return this._fetch(`${API_BASE}/attendance/end/${sessionId}`, { method: 'POST' });
    },
    async toggleAttendanceStatus(sessionId, status) {
        return this._fetch(`${API_BASE}/attendance/toggle-status/${sessionId}`, { method: 'POST', body: JSON.stringify({ status }) });
    },
    async getAttendanceSessions(professorId = null, subjectId = null, status = null) {
        let url = `${API_BASE}/attendance/sessions?`;
        if (professorId) url += `professor_id=${professorId}&`;
        if (subjectId) url += `subject_id=${subjectId}&`;
        if (status) url += `status=${status}`;
        return this._fetch(url);
    },
    async getSessionDetails(sessionId) {
        return this._fetch(`${API_BASE}/attendance/sessions/${sessionId}/details`);
    },
    async getMyAttendanceHistory(studentId, subjectId = null) {
        let url = `${API_BASE}/attendance/my-history?student_id=${studentId}`;
        if (subjectId) url += `&subject_id=${subjectId}`;
        return this._fetch(url);
    },
    async getMyAttendanceStats(studentId) {
        return this._fetch(`${API_BASE}/attendance/my-stats?student_id=${studentId}`);
    },
    async getAttendanceReport(subjectId = null) {
        let url = `${API_BASE}/attendance/report`;
        if (subjectId) url += `?subject_id=${subjectId}`;
        return this._fetch(url);
    },
    async getAttendanceAlerts(threshold = 0.25) {
        return this._fetch(`${API_BASE}/attendance/alerts?threshold=${threshold}`);
    },
    async getAttendanceOverview() {
        return this._fetch(`${API_BASE}/attendance/overview`);
    },
    async getActiveSession(subjectId) {
        return this._fetch(`${API_BASE}/attendance/active/${subjectId}`);
    },

    async getSectionStudents(sectionId) {
        let url = `${API_BASE}/attendance/section-students`;
        if (sectionId) url += `?section_id=${sectionId}`;
        return this._fetch(url);
    },
    async manualMarkAttendance(data) {
        return this._fetch(`${API_BASE}/attendance/manual-mark`, { method: 'POST', body: JSON.stringify(data) });
    },
    async deleteAttendanceRecord(sessionId, studentId) {
        return this._fetch(`${API_BASE}/attendance/delete-record`, {
            method: 'DELETE',
            body: JSON.stringify({ session_id: sessionId, student_id: studentId })
        });
    },

    async deleteAttendanceSession(sessionId) {
        return this._fetch(`${API_BASE}/attendance/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    },

    // ── Homework / Assignments ──────────────────────────────
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const headers = {};
        let deviceId = null;
        try { deviceId = localStorage.getItem('device_id'); } catch (e) { }
        if (deviceId) headers['X-Device-ID'] = deviceId;

        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers,
            body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    },
    async getAssignments(subjectId) {
        return this._fetch(`${API_BASE}/assignments?subject_id=${subjectId}`);
    },
    async addAssignment(data) {
        return this._fetch(`${API_BASE}/assignments`, { method: 'POST', body: JSON.stringify(data) });
    },
    async submitHomework(data) {
        return this._fetch(`${API_BASE}/submissions`, { method: 'POST', body: JSON.stringify(data) });
    },
    async gradeSubmission(submissionId, data) {
        return this._fetch(`${API_BASE}/submissions/${submissionId}/grade`, { method: 'POST', body: JSON.stringify(data) });
    },
    async getStudentGrades() {
        return this._fetch(`${API_BASE}/student/grades`);
    },
    async getAssignmentSubmissions(assignmentId) {
        return this._fetch(`${API_BASE}/assignments/${assignmentId}/submissions`);
    },
    async deleteSubmission(submissionId) {
        return this._fetch(`${API_BASE}/submissions/${submissionId}`, { method: 'DELETE' });
    },
    // ── MCQ EXAM SYSTEM ──────────────────────────────────────────
    async listExams() {
        return this._fetch(`${API_BASE}/exams`);
    },
    async createExam(data) {
        return this._fetch(`${API_BASE}/exams`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    async getExam(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}`);
    },
    async startExam(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    },
    async submitExam(examId, data) {
        return this._fetch(`${API_BASE}/exams/${examId}/submit`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    async getExamResults(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}/results`);
    },
    async addExamFeedback(examId, data) {
        return this._fetch(`${API_BASE}/exams/${examId}/feedback`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    async deleteExam(examId) {
        return this._fetch(`${API_BASE}/exams/${examId}`, { method: 'DELETE' });
    },

    // ── CHAT SYSTEM ──────────────────────────────────────────────
    async getChatMessages(sectionId = null, limit = 50) {
        let url = `${API_BASE}/chat/messages?limit=${limit}`;
        if (sectionId) url += `&section_id=${sectionId}`;
        return this._fetch(url);
    },
    async sendChatMessage(content, sectionId = null) {
        return this._fetch(`${API_BASE}/chat/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, section_id: sectionId })
        });
    },
    async updateChatMessage(msgId, content) {
        return this._fetch(`${API_BASE}/chat/messages/${msgId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
    },
    async deleteChatMessage(msgId) {
        return this._fetch(`${API_BASE}/chat/messages/${msgId}`, { method: 'DELETE' });
    },
    async toggleChatMute(sectionId = null) {
        return this._fetch(`${API_BASE}/chat/settings/toggle-mute`, {
            method: 'POST',
            body: JSON.stringify({ section_id: sectionId })
        });
    },
    async getMyChatGroups() {
        return this._fetch(`${API_BASE}/chat/my-groups`);
    },
    async markChatMessageRead(messageIds) {
        return this._fetch(`${API_BASE}/chat/mark-read`, {
            method: 'POST',
            body: JSON.stringify({ message_ids: messageIds })
        });
    },
    async getMessageViews(msgId) {
        return this._fetch(`${API_BASE}/chat/messages/${msgId}/views`);
    },
    async getGroupMembers(sectionId) {
        return this._fetch(`${API_BASE}/chat/groups/${sectionId}/members`);
    },
    async toggleChatLock(sectionId) {
        return this._fetch(`${API_BASE}/chat/groups/${sectionId}/toggle-lock`, { method: 'POST' });
    },
    async renameGroup(sectionId, name) {
        return this._fetch(`${API_BASE}/chat/groups/${sectionId}/rename`, {
            method: 'PUT',
            body: JSON.stringify({ name })
        });
    }
};
