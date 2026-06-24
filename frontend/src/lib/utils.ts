/* Utility functions */

import { type Severity, type ScanType, type ScanStatus } from '@/types';

export const severityConfig: Record<Severity, { label: string; color: string; bg: string; icon: string }> = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: '🔴' },
  high: { label: 'High', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: '🟠' },
  medium: { label: 'Medium', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', icon: '🟡' },
  low: { label: 'Low', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: '🔵' },
  info: { label: 'Info', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', icon: '⚪' },
};

export const scanTypeConfig: Record<ScanType, { label: string; icon: string; color: string }> = {
  sast: { label: 'SAST', icon: '🔍', color: '#6366f1' },
  vulnerability: { label: 'Vulnerability', icon: '🛡️', color: '#f97316' },
  secret: { label: 'Secret', icon: '🔑', color: '#8b5cf6' },
  combined: { label: 'Full Scan', icon: '⚡', color: '#10b981' },
};

export const statusConfig: Record<ScanStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'badge-pending' },
  running: { label: 'Running', className: 'badge-running' },
  completed: { label: 'Completed', className: 'badge-completed' },
  failed: { label: 'Failed', className: 'badge-failed' },
};

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(dateStr);
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
