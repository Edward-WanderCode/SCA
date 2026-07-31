/* Auth API functions for SCA Platform */

import axios from 'axios';
import type { AuthTokens, User, LoginCredentials, RegisterData } from '@/types';

const authApi = axios.create({
  baseURL: '/api/auth',
});

const TOKEN_KEY = 'sca_access_token';
const REFRESH_KEY = 'sca_refresh_token';

// === Token Storage ===

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// === Auth API Calls ===

export async function loginApi(credentials: LoginCredentials): Promise<AuthTokens> {
  const { data } = await authApi.post<AuthTokens>('/login', credentials);
  setTokens(data);
  return data;
}

export async function registerApi(registerData: RegisterData): Promise<User> {
  const { data } = await authApi.post<User>('/register', registerData);
  return data;
}

export async function refreshTokenApi(): Promise<AuthTokens> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  const { data } = await authApi.post<AuthTokens>('/refresh', {
    refresh_token: refreshToken,
  });
  setTokens(data);
  return data;
}

export async function logoutApi(): Promise<void> {
  const token = getAccessToken();
  if (token) {
    try {
      await authApi.post('/logout', null, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore errors during logout — we clear tokens anyway
    }
  }
  clearTokens();
}

export async function getCurrentUser(): Promise<User> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const { data } = await authApi.get<User>('/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
