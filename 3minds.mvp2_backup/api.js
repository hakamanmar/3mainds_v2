const API_BASE = '/api';
const getDeviceId = () => {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = 'dev-' + Math.random().toString(36).substr(2, 16);
        localStorage.setItem('device_id', id);
    }
    return id;
};

export const api = {
    async login(email, password) {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, device_id: getDeviceId() })
        });
        return res.json();
    },

    async _fetch(url, options = {}) {
        const user = auth.getUser();
        const headers = {
            'Content-Type': 'application/json',
            'X-User-Role': user ? user.role : 'guest',
            ...options.headers
        };
        const res = await fetch(url, { ...options, headers });
        if (res.status === 403 || res.status === 401) {
            const data = await res.json();
            throw { status: res.status, message: data.message || data.error };
        }
        return res.json();
    },

    async getSubjects() {
        return this._fetch(`${API_BASE}/subjects`);
    },

    async getSubject(id) {
        return this._fetch(`${API_BASE}/subjects/${id}`);
    },

    async uploadFile(formData) {
        const user = auth.getUser();
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: { 'X-User-Role': user ? user.role : 'guest' },
            body: formData
        });
        return res.json();
    },

    async getSummary(fileId) {
        return this._fetch(`${API_BASE}/ai/summarize`, {
            method: 'POST',
            body: JSON.stringify({ fileId })
        });
    },

    async addSubject(subject) {
        return this._fetch(`${API_BASE}/subjects`, {
            method: 'POST',
            body: JSON.stringify(subject)
        });
    },

    async deleteSubject(id) {
        return this._fetch(`${API_BASE}/subjects/${id}`, {
            method: 'DELETE'
        });
    },

    async updateSubject(id, data) {
        return this._fetch(`${API_BASE}/subjects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteFile(id) {
        return this._fetch(`${API_BASE}/files/${id}`, {
            method: 'DELETE'
        });
    },

    async updateFile(id, data) {
        return this._fetch(`${API_BASE}/files/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async getUsers() {
        return this._fetch(`${API_BASE}/users`);
    },

    async updateUserRole(id, role) {
        return this._fetch(`${API_BASE}/users/${id}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role })
        });
    },

    async changePassword(userId, password) {
        return this._fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, password })
        });
    },

    async resetDevice(userId) {
        return this._fetch(`${API_BASE}/admin/reset-device`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
    },

    async addStudent(email, password) {
        return this._fetch(`${API_BASE}/admin/add-student`, {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    }
};

export const auth = {
    getUser() {
        const u = localStorage.getItem('user');
        return u ? JSON.parse(u) : null;
    },
    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    },
    logout() {
        localStorage.removeItem('user');
        window.location.reload();
    }
};
