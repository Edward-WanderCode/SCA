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
} from '@/types';

const api = axios.create({
  baseURL: '/api',
});

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

  localScan: async (file: File, scanTypes: ScanType[]) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('scan_types', scanTypes.length > 0 ? scanTypes.join(',') : 'combined');
    const { data } = await api.post<Scan[]>('/scans/local', formData, {
      timeout: 20 * 60 * 1000,
      headers: {
        Accept: 'application/json',
      },
    });
    return data;
  },

  uploadFolder: async (files: File[], scanTypes: ScanType[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      const path = (file as any).webkitRelativePath || file.name;
      formData.append('files', file, path);
    });
    formData.append('scan_types', scanTypes.length > 0 ? scanTypes.join(',') : 'combined');
    const { data } = await api.post<Scan[]>('/scans/local-folder', formData, {
      timeout: 20 * 60 * 1000,
      headers: {
        Accept: 'application/json',
      },
    });
    return data;
  },

  folderScan: async (folderPath: string, scanTypes: ScanType[]) => {
    const { data } = await api.post<Scan[]>('/scans/folder', {
      folder_path: folderPath,
      scan_types: scanTypes,
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

export default api;
