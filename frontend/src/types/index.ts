/* TypeScript types for the SCA Platform */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanType = 'sast' | 'vulnerability' | 'secret' | 'combined';
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  description: string | null;
  branch: string;
  language: string | null;
  created_at: string;
  updated_at: string;
  total_scans: number;
  last_scan_at: string | null;
  findings: Record<Severity, number> | null;
  findings_diff: { added: number; removed: number; unmodified: number } | null;
}

export interface ScanSummary {
  total_findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface Scan {
  id: string;
  project_id: string;
  project_name: string | null;
  scan_type: ScanType;
  status: ScanStatus;
  progress: number;
  progress_message: string | null;
  celery_task_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  summary: ScanSummary | null;
  findings_diff: { added: number; removed: number; unmodified: number } | null;
  created_at: string;
}

export interface Finding {
  id: string;
  scan_id: string;
  severity: Severity;
  title: string;
  description: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  rule_id: string | null;
  cve_id: string | null;
  cvss_score: number | null;
  package_name: string | null;
  package_version: string | null;
  fixed_version: string | null;
  detector_type: string | null;
  verified: boolean | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface DashboardStats {
  total_projects: number;
  total_scans: number;
  completed_scans: number;
  running_scans: number;
  total_findings: number;
  findings_by_severity: Record<Severity, number>;
  scans_by_type: Record<ScanType, number>;
}

export interface TrendData {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface ScanTrend {
  date: string;
  count: number;
}

export interface DashboardTrends {
  findings_trend: TrendData[];
  scans_trend: ScanTrend[];
}

export interface RecentActivity {
  recent_scans: RecentScan[];
  critical_findings: CriticalFinding[];
}

export interface RecentScan {
  id: string;
  project_name: string;
  project_id: string;
  scan_type: ScanType;
  status: ScanStatus;
  findings_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CriticalFinding {
  id: string;
  severity: Severity;
  title: string;
  file_path: string | null;
  rule_id: string | null;
  cve_id: string | null;
  created_at: string;
}
