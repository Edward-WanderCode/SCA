/* Protected Route component — redirects unauthenticated users to login */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export default function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #0a0a1a)',
        }}
      >
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role check
  if (requiredRole && user) {
    const roleHierarchy: Record<UserRole, number> = {
      admin: 3,
      analyst: 2,
      viewer: 1,
    };
    if (roleHierarchy[user.role] < roleHierarchy[requiredRole]) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
