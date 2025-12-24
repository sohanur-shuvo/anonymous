import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

interface PrivateRouteProps {
    children: ReactNode;
    adminOnly?: boolean;
}

export default function PrivateRoute({ children, adminOnly = false }: PrivateRouteProps) {
    const { isAuthenticated, isAdmin, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loader"></div>
                <p>Verifying session...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to={`/login${adminOnly ? '?mode=admin' : ''}`} replace />;
    }

    if (adminOnly && !isAdmin) {
        return <Navigate to="/chat" replace />;
    }

    return <>{children}</>;
}
