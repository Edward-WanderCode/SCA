/* Authentication Context for SCA Platform */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { User, LoginCredentials, RegisterData } from '@/types';
import {
  loginApi,
  registerApi,
  logoutApi,
  getCurrentUser,
  getAccessToken,
  clearTokens,
} from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Load user on mount if token exists
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      getCurrentUser()
        .then(setUser)
        .catch(() => {
          clearTokens();
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    await loginApi(credentials);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    await registerApi(data);
    // Don't auto-login — redirect to login page
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
