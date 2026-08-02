/* API client for SCA Platform backend */

import axios from 'axios';
import type {
  Project,
  Scan,
  Finding,
  PaginatedResponse,
  DashboardStats,
  DashboardTrends,
  RecentActivity,
  ScanType,
  ScanStatus,
  Severity,
  SystemSettings,
} from '@/types';

import { getAccessToken, refreshTokenApi, clearTokens } from '@/lib/auth';

const api = axios.create({
  baseURL: '/api',
});

// === Request Interceptor: Attach auth token ===
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// === Response Interceptor: Handle 401 with token refresh ===
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401 errors on non-auth endpoints
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await refreshTokenApi();
        processQueue(null);
        // Retry the original request with the new token
        const token = getAccessToken();
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// === Projects ===
export const projectsApi = {
  list: async (params?: { page?: number; page_size?: number; search?: string }) => {
    const { data } = await api.get<PaginatedResponse<Project>>('/projects', { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<Project>(`/projects/${id}`);
    return data;
  },

  create: async (project: { name: string; repo_url: string; description?: string; branch?: string; language?: string }) => {
    const { data } = await api.post<Project>('/projects', project);
    return data;
  },

  update: async (id: string, project: Partial<Project>) => {
    const { data } = await api.put<Project>(`/projects/${id}`, project);
    return data;
  },

  delete: async (id: string) => {
    await api.delete(`/projects/${id}`);
  },
  rescan: async (id: string) => {
    const { data } = await api.post<Scan[]>(`/projects/${id}/rescan`);
    return data;
  },
  
  getWebhookConfig: async (id: string) => {
    const { data } = await api.get<{ webhook_url: string; webhook_secret: string; provider: string | null }>(`/projects/${id}/webhook-config`);
    return data;
  },
  
  generateWebhookConfig: async (id: string, provider: string) => {
    const { data } = await api.post<{ webhook_url: string; webhook_secret: string; provider: string | null }>(`/projects/${id}/webhook-config`, { provider });
    return data;
  },
};

// === Scans ===
export const scansApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    project_id?: string;
    scan_type?: ScanType;
    status?: ScanStatus;
  }) => {
    const { data } = await api.get<PaginatedResponse<Scan>>('/scans', { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<Scan>(`/scans/${id}`);
    return data;
  },

  create: async (scan: { project_id: string; scan_types: ScanType[] }) => {
    const { data } = await api.post<Scan[]>('/scans', scan);
    return data;
  },

  localScan: async (file: File, scanTypes: ScanType[], projectId?: string) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('scan_types', scanTypes.length > 0 ? scanTypes.join(',') : 'combined');
    if (projectId) {
      formData.append('project_id', projectId);
    }
    const { data } = await api.post<Scan[]>('/scans/local', formData, {
      timeout: 20 * 60 * 1000,
      headers: {
        Accept: 'application/json',
      },
    });
    return data;
  },

  uploadFolder: async (files: File[], scanTypes: ScanType[], projectId?: string) => {
    const formData = new FormData();
    files.forEach((file) => {
      const path = (file as any).webkitRelativePath || file.name;
      formData.append('files', file, path);
    });
    formData.append('scan_types', scanTypes.length > 0 ? scanTypes.join(',') : 'combined');
    if (projectId) {
      formData.append('project_id', projectId);
    }
    const { data } = await api.post<Scan[]>('/scans/local-folder', formData, {
      timeout: 20 * 60 * 1000,
      headers: {
        Accept: 'application/json',
      },
    });
    return data;
  },

  folderScan: async (folderPath: string, scanTypes: ScanType[], projectId?: string) => {
    const { data } = await api.post<Scan[]>('/scans/folder', {
      folder_path: folderPath,
      scan_types: scanTypes,
      project_id: projectId,
    });
    return data;
  },

  browse: async (path?: string) => {
    const { data } = await api.get<{
      current_path: string;
      parent_path: string | null;
      directories: string[];
      is_root: boolean;
    }>('/scans/browse', { params: { path } });
    return data;
  },

  delete: async (id: string) => {
    await api.delete(`/scans/${id}`);
  },
};


// === Findings ===
export const findingsApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    scan_id?: string;
    project_id?: string;
    severity?: Severity;
    status?: string;
    file_path?: string;
    rule_id?: string;
    cve_id?: string;
    verified?: boolean;
    search?: string;
  }) => {
    const { data } = await api.get<PaginatedResponse<Finding>>('/findings', { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<Finding>(`/findings/${id}`);
    return data;
  },

  updateStatus: async (id: string, status: string) => {
    const { data } = await api.put<Finding>(`/findings/${id}/status`, { status });
    return data;
  },
};

// === Dashboard ===
export const dashboardApi = {
  getStats: async () => {
    const { data } = await api.get<DashboardStats>('/dashboard/stats');
    return data;
  },

  getTrends: async (days: number = 30) => {
    const { data } = await api.get<DashboardTrends>('/dashboard/trends', {
      params: { days },
    });
    return data;
  },

  getRecent: async (limit: number = 10) => {
    const { data } = await api.get<RecentActivity>('/dashboard/recent', {
      params: { limit },
    });
    return data;
  },
};

// === Settings ===
export const settingsApi = {
  get: async () => {
    const { data } = await api.get<SystemSettings>('/settings');
    return data;
  },

  update: async (settings: Partial<SystemSettings>) => {
    const { data } = await api.put<SystemSettings>('/settings', settings);
    return data;
  },

  testTelegram: async (params?: {
    telegram_bot_token?: string;
    telegram_chat_id?: string;
    telegram_bot_command_thread_id?: number;
    telegram_bot_api_url?: string;
    telegram_api_id?: string;
    telegram_api_hash?: string;
  }) => {
    const { data } = await api.post<{ status: string; message: string }>('/settings/test-telegram', params);
    return data;
  },

};

export default api;
