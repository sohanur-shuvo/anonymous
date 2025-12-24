import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { messagesAPI, createWebSocket } from '../services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import './Chat.css';

interface Message {
    role: string;
    content: string;
    timestamp: string;
    message_id: string;
    user_id: string;
    user_name?: string;
}

export default function Chat() {
    const { user, logout } = useAuth();
    const [newMessage, setNewMessage] = useState('');
    // const [ws, setWs] = useState<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const { data: messages = [], refetch } = useQuery({
        queryKey: ['messages'],
        queryFn: messagesAPI.getMessages,
        refetchInterval: 5000, // Fallback polling every 5 seconds
    });

    useEffect(() => {
        // Setup WebSocket
        const websocket = createWebSocket((data) => {
            if (data.type === 'new_message') {
                // Invalidate and refetch messages
                queryClient.invalidateQueries({ queryKey: ['messages'] });
            } else if (data.type === 'messages_cleared') {
                queryClient.invalidateQueries({ queryKey: ['messages'] });
            }
        });

        // setWs(websocket);

        return () => {
            websocket.close();
        };
    }, [queryClient]);

    useEffect(() => {
        // Scroll to bottom when messages change
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            await messagesAPI.sendMessage(newMessage);
            setNewMessage('');
            refetch(); // Immediately refetch to show own message
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message. Please try again.');
        }
    };

    const isOwnMessage = (message: Message) => {
        return message.user_id === user?.username;
    };

    return (
        <div className="chat-container">
            <header className="chat-header">
                <div className="header-content">
                    <h1>🌐 Anonymous Chat</h1>
                    <p className="subtitle">All messages are anonymous • Your messages on right, others on left</p>
                </div>
                <div className="header-actions">
                    <span className="user-info">Welcome, {user?.name}</span>
                    {user?.is_admin && (
                        <a href="/admin" className="admin-link">
                            Admin Panel
                        </a>
                    )}
                    <button onClick={logout} className="logout-btn">
                        Logout
                    </button>
                </div>
            </header>

            <div className="chat-content">
                <div className="messages-container">
                    {messages.length === 0 ? (
                        <div className="empty-state">
                            <h2>🌟 Welcome to Anonymous Chat!</h2>
                            <p>Be the first to start the conversation!</p>
                        </div>
                    ) : (
                        <div className="messages-list">
                            {messages.map((message: Message) => (
                                <div
                                    key={message.message_id}
                                    className={`message ${isOwnMessage(message) ? 'message-right' : 'message-left'}`}
                                >
                                    <div className="message-content">
                                        <div className="message-text">
                                            <strong>
                                                {user?.is_admin
                                                    ? (isOwnMessage(message) ? 'You (Admin)' : message.user_name || 'Anonymous')
                                                    : (isOwnMessage(message) ? 'You' : 'Anonymous')}:
                                            </strong> {message.content}
                                        </div>
                                        <div className="message-time">{message.timestamp}</div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                <form onSubmit={handleSendMessage} className="message-input-form">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="message-input"
                        autoFocus
                    />
                    <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                        Send
                    </button>
                </form>
            </div>

            <div className="chat-info">
                <p>💬 {messages.length} messages</p>

            </div>
        </div>
    );
}
