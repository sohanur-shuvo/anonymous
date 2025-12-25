import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { messagesAPI, createWebSocket } from '../services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import './Chat.css';

interface Message {
    role: string;
    content: string;
    timestamp: string;
    display_time?: string;
    message_id: string;
    user_id: string;
    user_name?: string;
}

export default function Chat() {
    const { user, logout } = useAuth();
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const { data: messages = [], refetch } = useQuery({
        queryKey: ['messages'],
        queryFn: messagesAPI.getMessages,
        refetchInterval: 10000,
    });

    useEffect(() => {
        const websocket = createWebSocket((data) => {
            if (data.type === 'new_message' || data.type === 'messages_cleared') {
                queryClient.invalidateQueries({ queryKey: ['messages'] });
            }
        });
        return () => websocket.close();
    }, [queryClient]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        const msg = newMessage;
        setNewMessage(''); // Optimistic clear

        try {
            await messagesAPI.sendMessage(msg);
            refetch();
        } catch (error) {
            console.error('Failed', error);
            setNewMessage(msg); // Restore on fail
        }
    };

    const isOwnMessage = (message: Message) => message.user_id === user?.username;

    return (
        <div className="chat-container">
            <header className="chat-header">
                <div className="header-content">
                    <h1>Anonymous Chat</h1>
                    <p className="subtitle">Encrypted • Anonymous • Realtime</p>
                </div>
                <div className="header-actions">
                    <span className="user-info">Hi, {user?.name?.split(' ')[0]}</span>
                    {user?.is_admin && (
                        <a href="/admin" className="action-btn">
                            Admin
                        </a>
                    )}
                    <button onClick={logout} className="action-btn logout-btn">
                        <span className="material-symbols-outlined">Logout</span>
                    </button>
                </div>
            </header>

            <div className="chat-content">
                <div className="messages-container">
                    {messages.length === 0 ? (
                        <div className="empty-state">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                <h2>✨ Quiet in here...</h2>
                                <p>Start the conversation anonymously!</p>
                            </motion.div>
                        </div>
                    ) : (
                        <div className="messages-list">
                            <AnimatePresence initial={false}>
                                {messages.map((message: Message) => (
                                    <motion.div
                                        key={message.message_id}
                                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        className={`message ${isOwnMessage(message) ? 'message-right' : 'message-left'}`}
                                    >
                                        <div className="message-content">
                                            <div className="message-text">
                                                <strong>
                                                    {user?.is_admin && !isOwnMessage(message) && `[${message.user_name || 'User'}] `}
                                                    {isOwnMessage(message) ? 'You' : 'Anonymous'}
                                                    {/* Admin tag if needed */}
                                                </strong>
                                                {message.content}
                                            </div>
                                            <div className="message-time">
                                                {new Date(message.timestamp).toLocaleTimeString('en-US', {
                                                    timeZone: 'Asia/Dhaka',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                <div className="input-area-wrapper">
                    <form onSubmit={handleSendMessage} className="message-input-form">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="message-input"
                        />
                        <motion.button
                            type="submit"
                            className="send-btn"
                            disabled={!newMessage.trim()}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            ➤
                        </motion.button>
                    </form>
                </div>
            </div>
        </div>
    );
}
