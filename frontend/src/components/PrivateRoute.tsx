import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

interface PrivateRouteProps {
    children: ReactNode;
    adminOnly?: boolean;
}

export default function PrivateRoute({ children, adminOnly = false }: PrivateRouteProps) {
    const { isAuthenticated, isAdmin } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to={`/login${adminOnly ? '?mode=admin' : ''}`} replace />;
    }

    if (adminOnly && !isAdmin) {
        return <Navigate to="/chat" replace />;
    }

    return <>{children}</>;
}
