/* api.js - 3Minds Platform - Fixed & Complete */
const API_BASE = '/api';

// Generate a unique device fingerprint
function getDeviceId() {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
}

export const auth = {
    getUser() {
        const u = localStorage.getItem('user');
        return u ? JSON.parse(u) : null;
    },
    getToken() {
        // No longer needed: Token is stored in an HttpOnly cookie for security
        return null;
    },
    setUser(user, token = null) {
        localStorage.setItem('user', JSON.stringify(user));
        // We don't store the token in LocalStorage anymore! It's in the HttpOnly cookie.
    },
    logout() {
        localStorage.removeItem('user');
        // Let the server clear the cookie
        fetch('/api/logout', { method: 'POST' }).finally(() => {
            window.location.href = '/';
        });
    }
};

export const api = {
    async _fetch(url, options = {}) {
        const user = auth.getUser();
        const selectedSection = localStorage.getItem('selected_section');
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

        // Zero Trust: The 'auth_token' cookie is automatically sent by the browser.
        // It is HttpOnly, so JavaScript cannot access or leak it.

        // Device Binding: Send the device fingerprint for session-to-hardware mapping
        const deviceId = localStorage.getItem('device_id');
        if (deviceId) headers['X-Device-ID'] = deviceId;

        // Legacy headers kept for frontend logic compatibility, but server now relies on Bearer token
        if (user && user.role) headers['X-User-Role'] = user.role;
        const sectionId = (user && user.section_id) || selectedSection;
        if (sectionId) headers['X-Section-ID'] = sectionId;

        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            // Token expired or invalid
            auth.logout();
            return;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw { status: res.status, message: err.error || err.message || res.statusText };
        }
        return res.json();
    },

    // ── Sections ──────────────────────────────────────────────
    async getSections() {
        return this._fetch(`${API_BASE}/sections`);
    },
    getSelectedSection() {
        return localStorage.getItem('selected_section');
    },
    setSelectedSection(id) {
        localStorage.setItem('selected_section', id);
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
    async getUsers() {
        return this._fetch(`${API_BASE}/users`);
    },
    async deleteUser(id) {
        return this._fetch(`${API_BASE}/users?id=${id}`, { method: 'DELETE' });
    },
    async addUser(email, password, role, section_id) {
        return this._fetch(`${API_BASE}/admin/add-user`, {
            method: 'POST',
            body: JSON.stringify({ email, password, role, section_id })
        });
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
    async manualMarkAttendance(data) {
        return this._fetch(`${API_BASE}/attendance/manual-mark`, { method: 'POST', body: JSON.stringify(data) });
    },

    // ── Homework / Assignments ──────────────────────────────
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const headers = {};
        const deviceId = localStorage.getItem('device_id');
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
    async getAssignmentSubmissions(assignmentId) {
        return this._fetch(`${API_BASE}/assignments/${assignmentId}/submissions`);
    }
};