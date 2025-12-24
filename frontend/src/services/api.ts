import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth API
export const authAPI = {
    signup: async (data: { name: string; email: string; username: string; password: string }) => {
        const response = await api.post('/api/auth/signup', data);
        return response.data;
    },
    login: async (data: { email: string; password: string }) => {
        const response = await api.post('/api/auth/login', data);
        return response.data;
    },
    adminLogin: async (data: { username: string; password: string }) => {
        const response = await api.post('/api/auth/admin-login', data);
        return response.data;
    },
    googleLogin: async (credential: string) => {
        const response = await api.post('/api/auth/google', { credential });
        return response.data;
    },
    getConfig: async () => {
        const response = await api.get('/api/auth/config');
        return response.data;
    },
};

// Messages API
export const messagesAPI = {
    getMessages: async () => {
        const response = await api.get('/api/messages');
        return response.data.messages;
    },
    sendMessage: async (content: string) => {
        const response = await api.post('/api/messages', { content });
        return response.data;
    },
};

// Admin API
export const adminAPI = {
    getUsers: async () => {
        const response = await api.get('/api/admin/users');
        return response.data.users;
    },
    updateUser: async (username: string, status: string) => {
        const response = await api.put(`/api/admin/users/${username}`, { status });
        return response.data;
    },
    deleteUser: async (username: string) => {
        const response = await api.delete(`/api/admin/users/${username}`);
        return response.data;
    },
    getSettings: async () => {
        const response = await api.get('/api/admin/settings');
        return response.data;
    },
    updateSettings: async (auto_refresh_interval: number) => {
        const response = await api.put('/api/admin/settings', { auto_refresh_interval });
        return response.data;
    },
    clearMessages: async () => {
        const response = await api.delete('/api/admin/messages');
        return response.data;
    },
};

// Stats API
export const statsAPI = {
    getStats: async () => {
        const response = await api.get('/api/stats');
        return response.data;
    },
};

// WebSocket connection
export const createWebSocket = (onMessage: (message: any) => void) => {
    const ws = new WebSocket(`${WS_BASE_URL}/ws/chat`);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
    };

    return ws;
};

export default api;
