import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI, statsAPI, messagesAPI, createWebSocket } from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import './AdminPanel.css';

export default function AdminPanel() {
    const { logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'users' | 'live-chat' | 'chat-mgmt' | 'settings'>('users');
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const { data: users = {} } = useQuery({
        queryKey: ['users'],
        queryFn: adminAPI.getUsers,
    });

    const { data: settings = { auto_refresh_interval: 2 } } = useQuery({
        queryKey: ['settings'],
        queryFn: adminAPI.getSettings,
    });

    const { data: stats } = useQuery({
        queryKey: ['stats'],
        queryFn: statsAPI.getStats,
    });

    const { data: messages = [], refetch: refetchMessages } = useQuery({
        queryKey: ['messages'],
        queryFn: messagesAPI.getMessages,
        refetchInterval: 5000,
    });

    const banMutation = useMutation({
        mutationFn: ({ username, status }: { username: string; status: string }) =>
            adminAPI.updateUser(username, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (username: string) => adminAPI.deleteUser(username),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const deleteUserMessagesMutation = useMutation({
        mutationFn: (username: string) => adminAPI.deleteUserMessages(username),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            alert(`Successfully deleted ${data.deleted_count || 'all'} messages for user.`);
        },
        onError: (error) => {
            console.error(error);
            alert('Failed to delete messages. Make sure the backend is running and up to date.');
        }
    });

    const clearMessagesMutation = useMutation({
        mutationFn: adminAPI.clearMessages,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
        }
    });

    const updateSettingsMutation = useMutation({
        mutationFn: (interval: number) => adminAPI.updateSettings(interval),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
    });

    useEffect(() => {
        const websocket = createWebSocket((data: any) => {
            if (data.type === 'new_message' || data.type === 'messages_cleared') {
                queryClient.invalidateQueries({ queryKey: ['messages'] });
                queryClient.invalidateQueries({ queryKey: ['stats'] });
            }
        });

        return () => websocket.close();
    }, [queryClient]);

    useEffect(() => {
        if (activeTab === 'live-chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, activeTab]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            await messagesAPI.sendMessage(newMessage);
            setNewMessage('');
            refetchMessages();
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    return (
        <div className="admin-container">
            <header className="admin-header">
                <h1>Admin Panel</h1>
                <div className="header-actions">
                    <a href="/chat" className="back-link">
                        ← Back to Chat
                    </a>
                    <button onClick={logout} className="logout-btn">
                        Logout
                    </button>
                </div>
            </header>

            <div className="admin-tabs">
                <button
                    className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    User Management
                </button>
                <button
                    className={`admin-tab ${activeTab === 'live-chat' ? 'active' : ''}`}
                    onClick={() => setActiveTab('live-chat')}
                >
                    Live Chat
                </button>
                <button
                    className={`admin-tab ${activeTab === 'chat-mgmt' ? 'active' : ''}`}
                    onClick={() => setActiveTab('chat-mgmt')}
                >
                    Chat Management
                </button>
                <button
                    className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    Settings
                </button>
            </div>

            <div className="admin-content">
                {activeTab === 'users' && (
                    <div className="users-section">
                        <h2>User Management</h2>
                        {Object.entries(users).length === 0 ? (
                            <p>No users found</p>
                        ) : (
                            <div className="users-list">
                                {Object.entries(users).map(([username, userData]: [string, any]) => (
                                    <div key={username} className="user-card">
                                        <div className="user-info">
                                            <h3>{userData.name} ({username})</h3>
                                            <p>{userData.email}</p>
                                            <p className="user-date">
                                                Created: {new Date(userData.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="user-status">
                                            {userData.status === 'active' ? (
                                                <span className="status-active">🟢 Active</span>
                                            ) : (
                                                <span className="status-banned">🔴 Banned</span>
                                            )}
                                        </div>
                                        <div className="user-actions">
                                            {userData.status === 'active' ? (
                                                <button
                                                    onClick={() => banMutation.mutate({ username, status: 'banned' })}
                                                    className="btn-ban"
                                                >
                                                    Ban
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => banMutation.mutate({ username, status: 'active' })}
                                                    className="btn-unban"
                                                >
                                                    Unban
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    if (confirm(`Delete user ${username}?`)) {
                                                        deleteMutation.mutate(username);
                                                    }
                                                }}
                                                className="btn-delete"
                                                title="Delete User Account"
                                            >
                                                🗑️
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm(`Delete ALL messages from ${username}? This cannot be undone.`)) {
                                                        deleteUserMessagesMutation.mutate(username);
                                                    }
                                                }}
                                                className="btn-cleanup"
                                                title="Delete All Messages from User"
                                            >
                                                🧹
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'live-chat' && (
                    <div className="admin-chat-section">
                        <h2>Real-time Global Chat</h2>
                        <div className="admin-messages-container">
                            <div className="admin-messages-list">
                                {messages.map((message: any) => (
                                    <div
                                        key={message.message_id}
                                        className={`admin-message ${message.user_id === 'Admin' ? 'admin-right' : 'admin-left'}`}
                                    >
                                        <div className="admin-message-content">
                                            <div className="admin-message-text">
                                                <strong>{message.user_id === 'Admin' ? 'You (Admin)' : message.user_name || 'Anonymous'}:</strong> {message.content}
                                            </div>
                                            <div className="admin-message-time">
                                                {new Date(message.timestamp).toLocaleTimeString('en-US', {
                                                    timeZone: 'Asia/Dhaka',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>
                        <form onSubmit={handleSendMessage} className="admin-chat-form">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Send an admin message..."
                                className="admin-chat-input"
                            />
                            <button type="submit" className="admin-send-btn" disabled={!newMessage.trim()}>
                                Send
                            </button>
                        </form>
                    </div>
                )}

                {activeTab === 'chat-mgmt' && (
                    <div className="chat-section">
                        <h2>Chat Management</h2>
                        <div className="stats-grid">
                            <div className="stat-card">
                                <h3>Total Messages</h3>
                                <p className="stat-value">{stats?.total_messages || 0}</p>
                            </div>
                            <div className="stat-card">
                                <h3>Active Connections</h3>
                                <p className="stat-value">{stats?.active_connections || 0}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (confirm('Clear all messages?')) {
                                    clearMessagesMutation.mutate();
                                }
                            }}
                            className="btn-clear"
                        >
                            Clear All Messages
                        </button>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="settings-section">
                        <h2>Application Settings</h2>
                        <div className="setting-item">
                            <label>Auto-refresh interval (seconds):</label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={settings.auto_refresh_interval}
                                onChange={(e) => updateSettingsMutation.mutate(parseInt(e.target.value))}
                                className="setting-input"
                            />
                        </div>
                        <div className="stats-grid">
                            <div className="stat-card">
                                <h3>Total Users</h3>
                                <p className="stat-value">{stats?.total_users || 0}</p>
                            </div>
                            <div className="stat-card">
                                <h3>Total Messages</h3>
                                <p className="stat-value">{stats?.total_messages || 0}</p>
                            </div>
                        </div>

                        <div className="danger-zone">
                            <h3>Danger Zone</h3>
                            <button
                                onClick={() => {
                                    if (confirm('⚠️ ARE YOU SURE? This will delete ALL messages from the database. This action cannot be undone.')) {
                                        clearMessagesMutation.mutate();
                                    }
                                }}
                                className="btn-clear-all"
                            >
                                ☢️ Delete All Messages
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
