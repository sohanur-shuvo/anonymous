import { useState, useEffect } from 'react';

declare const google: any;
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import './Login.css';

interface LoginProps {
    defaultMode?: 'login' | 'signup' | 'admin';
}

export default function Login({ defaultMode }: LoginProps = {}) {
    const [searchParams] = useSearchParams();
    const urlMode = searchParams.get('mode');
    const validModes = ['login', 'signup', 'admin'];
    const initialMode = defaultMode || ((urlMode && validModes.includes(urlMode)) ? (urlMode as 'login' | 'signup' | 'admin') : 'login');

    const [mode, setMode] = useState<'login' | 'signup' | 'admin'>(initialMode);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        username: '',
        password: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleClientId, setGoogleClientId] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleGoogleLogin = async (response: any) => {
        try {
            setLoading(true);
            const data = await authAPI.googleLogin(response.credential);
            login(data.access_token, data.user);
            navigate('/chat');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Google authentication failed.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        authAPI.getConfig()
            .then(config => setGoogleClientId(config.googleClientId))
            .catch(err => console.error("Failed to load config", err));
    }, []);

    useEffect(() => {
        if (googleClientId && typeof google !== 'undefined' && (mode === 'login' || mode === 'signup')) {
            try {
                google.accounts.id.initialize({
                    client_id: googleClientId,
                    callback: handleGoogleLogin
                });
                google.accounts.id.renderButton(
                    document.getElementById("googleSignInDiv"),
                    { theme: "outline", size: "large", width: "250" }
                );
            } catch (e) {
                console.error("Google Auth Error", e);
            }
        }
    }, [googleClientId, mode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let response;

            if (mode === 'signup') {
                response = await authAPI.signup(formData);
            } else if (mode === 'admin') {
                response = await authAPI.adminLogin({
                    username: formData.username,
                    password: formData.password,
                });
            } else {
                response = await authAPI.login({
                    email: formData.email,
                    password: formData.password,
                });
            }

            login(response.access_token, response.user);
            navigate(response.user.is_admin ? '/admin' : '/chat');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Authentication failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>🌐 Anonymous Chat</h1>
                    <p>Please login or signup to access Anonymous Chat</p>
                </div>

                <div className="tabs">
                    {mode !== 'admin' && (
                        <>
                            <button
                                className={`tab ${mode === 'login' ? 'active' : ''}`}
                                onClick={() => setMode('login')}
                            >
                                Login
                            </button>
                            <button
                                className={`tab ${mode === 'signup' ? 'active' : ''}`}
                                onClick={() => setMode('signup')}
                            >
                                Sign Up
                            </button>
                        </>
                    )}
                    {mode === 'admin' && (
                        <button
                            className={`tab ${mode === 'admin' ? 'active' : ''}`}
                            onClick={() => setMode('admin')}
                        >
                            Admin
                        </button>
                    )}
                </div>



                <form onSubmit={handleSubmit} className="login-form">
                    {error && <div className="error-message">{error}</div>}

                    {mode === 'signup' && (
                        <input
                            type="text"
                            name="name"
                            placeholder="Full Name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="form-input"
                        />
                    )}

                    {mode !== 'admin' && (
                        <input
                            type="email"
                            name="email"
                            placeholder="Email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="form-input"
                        />
                    )}

                    {(mode === 'signup' || mode === 'admin') && (
                        <input
                            type="text"
                            name="username"
                            placeholder={mode === 'admin' ? 'Admin Username' : 'Username'}
                            value={formData.username}
                            onChange={handleChange}
                            required
                            className="form-input"
                        />
                    )}

                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        className="form-input"
                    />

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? 'Please wait...' : mode === 'admin' ? 'Admin Login' : mode === 'signup' ? 'Sign Up' : 'Login'}
                    </button>
                </form>

                {(mode === 'login' || mode === 'signup') && (
                    <div>
                        <div className="divider">or</div>
                        <div id="googleSignInDiv"></div>
                    </div>
                )}
            </div>
        </div>
    );
}
