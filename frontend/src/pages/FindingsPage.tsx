/* Findings page with filterable table */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Filter,
  Search,
  FileCode,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Shield,
  Key,
  Download,
  ChevronDown,
  ChevronLeft,
  FolderTree,
  Folder,
  FolderOpen,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  X,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { findingsApi, projectsApi, scansApi, default as api } from '@/lib/api';
import { severityConfig } from '@/lib/utils';
import type { Severity, Finding, ProjectFileItem, SuspiciousFinding } from '@/types';

const getToolBadge = (detectorType?: string | null) => {
  if (!detectorType) return null;
  const dt = detectorType.toLowerCase();
  if (dt === 'opengrep') return { label: 'OpenGrep', icon: '🔍', color: '#818cf8', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)' };
  if (dt === 'trivy') return { label: 'Trivy', icon: '🛡️', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };
  if (dt === 'trufflehog') return { label: 'TruffleHog', icon: '🔑', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
  if (dt === 'bandit') return { label: 'Bandit', icon: '🐍', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
  if (dt === 'gosec') return { label: 'GoSec', icon: '🐹', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)' };
  return { label: detectorType, icon: '⚙️', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.12)', border: 'rgba(156, 163, 175, 0.3)' };
};

export default function FindingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id') || '';
  const filterScanId = searchParams.get('scan_id') || '';
  const [filterSeverity, setFilterSeverity] = useState<Severity | ''>('');
  const [filterDetector, setFilterDetector] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [filterNewOnly, setFilterNewOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // File Tree States
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileTreeSearch, setFileTreeSearch] = useState('');
  const [fileFilterMode, setFileFilterMode] = useState<'all' | 'issues'>('all');
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const handleExportReport = async (format: 'html' | 'markdown' | 'json') => {
    try {
      setShowExportMenu(false);
      const response = await api.get('/findings/export', {
        params: {
          format,
          project_id: filterProjectId || undefined,
          severity: filterSeverity || undefined,
        },
        responseType: 'blob',
      });
      const extension = format === 'html' ? 'html' : format === 'markdown' ? 'md' : 'json';
      const mimeType = format === 'html' ? 'text/html' : format === 'markdown' ? 'text/markdown' : 'application/json';
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      let filename = `sca_report_${format}_${Date.now()}.${extension}`;
      const disposition = response.headers?.['content-disposition'];
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export report format:', format, err);
    }
  };

  // Fetch projects list for dropdown filter
  const { data: projectsData } = useQuery({
    queryKey: ['projects-list-simple'],
    queryFn: () => projectsApi.list({ page: 1, page_size: 100 }),
  });
  const projects = projectsData?.items || [];

  // Determine effective project ID
  const effectiveProjectId = filterProjectId || (projects.length > 0 ? projects[0].id : '');

  // Fetch project file tree
  const { data: fileTreeData, isLoading: isFileTreeLoading } = useQuery({
    queryKey: ['project-file-tree', effectiveProjectId, filterScanId],
    queryFn: () => projectsApi.getFileTree(effectiveProjectId, filterScanId || undefined),
    enabled: Boolean(effectiveProjectId),
  });

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['findings', page, filterSeverity, filterDetector, filterStatus, filterProjectId, filterScanId, searchQuery, selectedFilePath],
    queryFn: () =>
      findingsApi.list({
        page,
        page_size: 50,
        severity: filterSeverity || undefined,
        detector_type: filterDetector || undefined,
        status: filterStatus || undefined,
        project_id: filterProjectId || (selectedFilePath ? effectiveProjectId : undefined),
        scan_id: filterScanId || undefined,
        search: searchQuery || undefined,
        file_path: selectedFilePath || undefined,
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => findingsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      // Update local state for selected finding if it's currently open
      if (selectedFinding) {
        setSelectedFinding({ ...selectedFinding, status: updateStatusMutation.variables?.status || 'open' });
      }
    },
  });

  const rawFindings = data?.items || [];
  const newCount = rawFindings.filter((f) => f.is_new).length;
  const displayFindings: Finding[] = filterNewOnly ? rawFindings.filter((f) => f.is_new) : rawFindings;

  const setFilterProjectId = (id: string) => {
    const params = new URLSearchParams(searchParams);
    if (id) {
      params.set('project_id', id);
    } else {
      params.delete('project_id');
    }
    params.delete('scan_id');
    setSearchParams(params);
    setSelectedFilePath(null);
    setPage(1);
  };

  const clearScanFilter = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('scan_id');
    setSearchParams(params);
    setSelectedFilePath(null);
    setPage(1);
  };

  // Fetch current scan detail if filterScanId is active
  const { data: scanDetail } = useQuery({
    queryKey: ['scan-detail-diff', filterScanId],
    queryFn: () => scansApi.get(filterScanId),
    enabled: Boolean(filterScanId),
  });

  // Fetch current project detail if filterProjectId is active (and no filterScanId)
  const { data: projectDetail } = useQuery({
    queryKey: ['project-detail-diff', filterProjectId],
    queryFn: () => projectsApi.get(filterProjectId),
    enabled: Boolean(filterProjectId && !filterScanId),
  });

  const activeDiff = scanDetail?.findings_diff || projectDetail?.findings_diff;
  const suspiciousFindings = activeDiff?.suspicious_findings || [];
  const suspiciousCount = activeDiff?.suspicious || suspiciousFindings.length;

  // Group suspicious findings by file_path
  interface SuspiciousFileGroup {
    file_path: string;
    count: number;
    findings: SuspiciousFinding[];
  }

  const groupedSuspicious = useMemo(() => {
    const map: Record<string, SuspiciousFileGroup> = {};
    for (const item of suspiciousFindings) {
      const fp = item.file_path || 'unknown file';
      if (!map[fp]) {
        map[fp] = { file_path: fp, count: 0, findings: [] };
      }
      map[fp].count += 1;
      map[fp].findings.push(item);
    }
    return Object.values(map);
  }, [suspiciousFindings]);

  const [expandedSuspiciousFiles, setExpandedSuspiciousFiles] = useState<Record<string, boolean>>({});
  const toggleSuspiciousFile = (filePath: string) => {
    setExpandedSuspiciousFiles((prev) => ({ ...prev, [filePath]: !prev[filePath] }));
  };

  // Build hierarchical file tree structure
  interface FileTreeNode {
    name: string;
    path: string;
    isDir: boolean;
    fileItem?: ProjectFileItem;
    children: Record<string, FileTreeNode>;
    totalFindings: number;
    hasDeleted: boolean;
    hasIssues: boolean;
  }

  const fileTreeRoot = useMemo(() => {
    if (!fileTreeData?.files) return null;

    const root: FileTreeNode = {
      name: 'root',
      path: '',
      isDir: true,
      children: {},
      totalFindings: 0,
      hasDeleted: false,
      hasIssues: false,
    };

    const searchLower = fileTreeSearch.trim().toLowerCase();

    for (const file of fileTreeData.files) {
      const normPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
      const hasIssues = file.findings_count > 0 || Boolean(file.is_deleted);

      if (fileFilterMode === 'issues' && !hasIssues) {
        continue;
      }

      if (searchLower && !normPath.toLowerCase().includes(searchLower)) {
        continue;
      }

      const parts = normPath.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const curPath = parts.slice(0, i + 1).join('/');

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: curPath,
            isDir: !isFile,
            fileItem: isFile ? file : undefined,
            children: {},
            totalFindings: 0,
            hasDeleted: false,
            hasIssues: false,
          };
        }

        current.children[part].totalFindings += file.findings_count;
        if (file.is_deleted) {
          current.children[part].hasDeleted = true;
        }
        if (hasIssues) {
          current.children[part].hasIssues = true;
        }

        current = current.children[part];
      }
    }

    return root;
  }, [fileTreeData, fileTreeSearch, fileFilterMode]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: prev[folderPath] === undefined ? false : !prev[folderPath],
    }));
  };

  const isFolderExpanded = (folderPath: string, hasIssues: boolean) => {
    if (expandedFolders[folderPath] !== undefined) {
      return expandedFolders[folderPath];
    }
    // Default open if it has search, issues or deleted items
    return Boolean(fileTreeSearch.trim() || hasIssues);
  };

  const renderTreeNode = (node: FileTreeNode, depth: number = 0): React.ReactNode => {
    // If root, render its children
    if (node.name === 'root') {
      const childKeys = Object.keys(node.children).sort((a, b) => {
        const itemA = node.children[a];
        const itemB = node.children[b];
        if (itemA.isDir !== itemB.isDir) {
          return itemA.isDir ? -1 : 1;
        }
        return a.localeCompare(b);
      });

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {childKeys.map((key) => renderTreeNode(node.children[key], 0))}
        </div>
      );
    }

    if (node.isDir) {
      const expanded = isFolderExpanded(node.path, node.hasIssues);
      const childKeys = Object.keys(node.children).sort((a, b) => {
        const itemA = node.children[a];
        const itemB = node.children[b];
        if (itemA.isDir !== itemB.isDir) {
          return itemA.isDir ? -1 : 1;
        }
        return a.localeCompare(b);
      });

      return (
        <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            onClick={() => toggleFolder(node.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 8px',
              paddingLeft: 8 + depth * 14,
              borderRadius: 6,
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: '0.8125rem',
              color: node.hasIssues ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
              <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span style={{ color: expanded ? '#818cf8' : '#f59e0b', display: 'inline-flex', alignItems: 'center' }}>
                {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: node.hasIssues ? 600 : 400,
                }}
                title={node.name}
              >
                {node.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
              {node.hasDeleted && (
                <span
                  title="Có file đã xóa bên trong"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                  }}
                />
              )}
              {node.totalFindings > 0 && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    padding: '0px 5px',
                    borderRadius: 10,
                    background: 'rgba(249, 115, 22, 0.16)',
                    color: '#f97316',
                    border: '1px solid rgba(249, 115, 22, 0.3)',
                    lineHeight: '16px',
                  }}
                  title={`${node.totalFindings} lỗi trong thư mục`}
                >
                  {node.totalFindings}
                </span>
              )}
            </div>
          </div>

          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {childKeys.map((key) => renderTreeNode(node.children[key], depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Leaf: File Node
    const file = node.fileItem;
    if (!file) return null;
    const isSelected = selectedFilePath === file.path;
    const isDeleted = Boolean(file.is_deleted);
    const hasFindings = file.findings_count > 0;

    return (
      <div
        key={file.path}
        onClick={() => setSelectedFilePath(isSelected ? null : file.path)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          paddingLeft: 8 + depth * 14,
          borderRadius: 6,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '0.8125rem',
          background: isSelected ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
          borderLeft: isSelected ? '3px solid var(--accent-indigo)' : '3px solid transparent',
          transition: 'all 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'transparent';
        }}
        title={`${file.path}${isDeleted ? ' (Đã bị xóa)' : ''}${hasFindings ? ` (${file.findings_count} lỗi)` : ''}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            {isDeleted ? (
              <Trash2 size={13} color="#ef4444" />
            ) : hasFindings ? (
              <AlertTriangle size={13} color="#f97316" />
            ) : (
              <FileCode size={13} color="var(--text-muted)" />
            )}
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.78rem',
              color: isDeleted
                ? '#f87171'
                : isSelected
                ? '#ffffff'
                : hasFindings
                ? 'var(--text-primary)'
                : 'var(--text-secondary)',
              textDecoration: isDeleted ? 'line-through' : 'none',
              fontWeight: isSelected || hasFindings ? 600 : 400,
            }}
          >
            {node.name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
          {isDeleted && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                whiteSpace: 'nowrap',
              }}
            >
              Đã xóa
            </span>
          )}

          {hasFindings && (
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                padding: '0px 6px',
                borderRadius: 10,
                background:
                  file.severities?.critical
                    ? 'rgba(239, 68, 68, 0.22)'
                    : file.severities?.high
                    ? 'rgba(249, 115, 22, 0.22)'
                    : 'rgba(234, 179, 8, 0.22)',
                color:
                  file.severities?.critical
                    ? '#ef4444'
                    : file.severities?.high
                    ? '#f97316'
                    : '#eab308',
                border: `1px solid ${
                  file.severities?.critical
                    ? 'rgba(239, 68, 68, 0.45)'
                    : file.severities?.high
                    ? 'rgba(249, 115, 22, 0.45)'
                    : 'rgba(234, 179, 8, 0.45)'
                }`,
                lineHeight: '16px',
                whiteSpace: 'nowrap',
              }}
            >
              {file.findings_count}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            Security Findings
            {filterScanId && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                  padding: '2px 10px',
                  borderRadius: 20,
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Lượt quét: {filterScanId.substring(0, 8)}...
                <button
                  onClick={clearScanFilter}
                  style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                  title="Xóa lọc lượt quét"
                >
                  ✕
                </button>
              </span>
            )}
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
            All vulnerabilities, code issues, and exposed secrets
          </p>
        </div>
      </div>

      {/* Red Alert Banner: Cảnh báo né lỗi do xóa file */}
      {suspiciousCount > 0 && groupedSuspicious.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderRadius: '10px',
            padding: '14px 18px',
            color: '#fee2e2',
            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                marginTop: 2,
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: '#f87171',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  letterSpacing: '0.01em',
                }}
              >
                ⚠️ CẢNH BÁO NÉ LỖI: Có {suspiciousCount} lỗi biến mất do {groupedSuspicious.length} FILE BỊ XÓA:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groupedSuspicious.map((group) => {
                  const isExpanded = Boolean(expandedSuspiciousFiles[group.file_path]);
                  const uniqueTitles = Array.from(new Set(group.findings.map((f) => f.title).filter(Boolean)));
                  const previewTitles = uniqueTitles.slice(0, 3).join(', ');
                  const remainingCount = uniqueTitles.length - 3;

                  return (
                    <div
                      key={group.file_path}
                      style={{
                        background: 'rgba(0, 0, 0, 0.28)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        fontSize: '0.84rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: 700,
                              color: '#ffffff',
                              backgroundColor: 'rgba(239, 68, 68, 0.22)',
                              padding: '2px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(239, 68, 68, 0.45)',
                            }}
                          >
                            {group.file_path}
                          </span>

                          <span
                            style={{
                              background: 'rgba(239, 68, 68, 0.3)',
                              color: '#fca5a5',
                              border: '1px solid rgba(239, 68, 68, 0.5)',
                              borderRadius: 12,
                              padding: '1px 8px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            {group.count} lỗi biến mất
                          </span>

                          <span style={{ color: '#f87171', fontWeight: 600 }}>
                            -&gt; File không còn tồn tại trong source code mới!
                          </span>

                          {previewTitles && (
                            <span style={{ color: '#cbd5e1', fontSize: '0.8rem', fontStyle: 'italic' }}>
                              ({previewTitles}
                              {remainingCount > 0 ? ` +${remainingCount} lỗi khác` : ''})
                            </span>
                          )}
                        </div>

                        {group.findings.length > 1 && (
                          <button
                            onClick={() => toggleSuspiciousFile(group.file_path)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#93c5fd',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              textDecoration: 'underline',
                            }}
                          >
                            {isExpanded ? 'Thu gọn ▲' : `Xem chi tiết ${group.count} lỗi ▼`}
                          </button>
                        )}
                      </div>

                      {/* Expandable details list */}
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                            maxHeight: 160,
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          {group.findings.map((finding, fIdx) => (
                            <div
                              key={fIdx}
                              style={{
                                fontSize: '0.78rem',
                                color: '#e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <span style={{ color: '#ef4444' }}>•</span>
                              <span style={{ color: '#fca5a5', fontWeight: 500 }}>
                                {finding.title || finding.rule_id || 'Lỗi bảo mật'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            className="input"
            placeholder="Search findings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 36, height: 36, fontSize: '0.8125rem' }}
          />
        </div>

        <select
          className="input"
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          style={{ width: 180, height: 36, fontSize: '0.8125rem' }}
        >
          <option value="">All Projects</option>
          {projects.map((proj) => (
            <option key={proj.id} value={proj.id}>
              📁 {proj.name}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as Severity | '')}
          style={{ width: 160, height: 36, fontSize: '0.8125rem' }}
        >
          <option value="">All Severities</option>
          <option value="critical">🔴 Critical</option>
          <option value="high">🟠 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🔵 Low</option>
          <option value="info">⚪ Info</option>
        </select>

        <select
          className="input"
          value={filterDetector}
          onChange={(e) => {
            setFilterDetector(e.target.value);
            setPage(1);
          }}
          style={{ width: 150, height: 36, fontSize: '0.8125rem' }}
        >
          <option value="">All Tools</option>
          <option value="opengrep">🔍 OpenGrep</option>
          <option value="trivy">🛡️ Trivy</option>
          <option value="trufflehog">🔑 TruffleHog</option>
          <option value="bandit">🐍 Bandit</option>
          <option value="gosec">🐹 GoSec</option>
        </select>

        <select
          className="input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: 140, height: 36, fontSize: '0.8125rem' }}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="ignored">Ignored</option>
          <option value="resolved">Resolved</option>
        </select>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setFilterNewOnly(!filterNewOnly)}
          style={{
            height: 36,
            padding: '0 12px',
            fontSize: '0.8125rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: filterNewOnly ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            border: filterNewOnly ? '1px solid rgba(244, 63, 94, 0.5)' : '1px solid var(--border-color)',
            color: filterNewOnly ? '#fb7185' : 'var(--text-secondary)',
            fontWeight: filterNewOnly ? 700 : 500,
            borderRadius: 8,
          }}
          title="Chỉ hiển thị các lỗ hổng mới phát hiện"
        >
          ✨ Lỗi mới ({newCount})
        </button>

        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowExportMenu(!showExportMenu)}
            style={{
              height: 36,
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
            }}
          >
            <Download size={14} />
            Export Report
            <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <>
              <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                onClick={() => setShowExportMenu(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  marginTop: 6,
                  width: 160,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                  zIndex: 999,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <button
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleExportReport('html')}
                >
                  📄 HTML Report
                </button>
                <button
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    borderTop: '1px solid var(--border-color)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleExportReport('markdown')}
                >
                  📝 Markdown Report
                </button>
                <button
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    borderTop: '1px solid var(--border-color)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleExportReport('json')}
                >
                  📦 JSON Data
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {displayFindings.length} / {data?.total || 0} findings
        </span>
      </div>

      {/* 3-Column Layout: [File Tree Sidebar] + [Findings List] + [Finding Detail] */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isTreeCollapsed
            ? (selectedFinding ? '48px minmax(320px, 1fr) minmax(400px, 1.3fr)' : '48px 1fr')
            : (selectedFinding ? '280px minmax(320px, 1fr) minmax(400px, 1.25fr)' : '280px 1fr'),
          gap: 16,
          minHeight: 0,
          height: 'calc(100vh - 280px)',
          transition: 'grid-template-columns 200ms ease',
        }}
      >
        {/* Column 1: File Tree Sidebar */}
        {isTreeCollapsed ? (
          <div
            className="glass-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '14px 6px',
              gap: 16,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setIsTreeCollapsed(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Mở rộng File Explorer"
            >
              <PanelLeftOpen size={18} />
            </button>
            <div
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={() => setIsTreeCollapsed(false)}
            >
              <FolderTree size={14} color="var(--accent-indigo)" />
              PROJECT FILES
            </div>
            {fileTreeData && fileTreeData.files_with_findings_count > 0 && (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: 'rgba(249, 115, 22, 0.2)',
                  color: '#f97316',
                  padding: '2px 5px',
                  borderRadius: 8,
                  border: '1px solid rgba(249, 115, 22, 0.4)',
                }}
                title={`${fileTreeData.files_with_findings_count} files có lỗi`}
              >
                {fileTreeData.files_with_findings_count}
              </span>
            )}
          </div>
        ) : (
          <motion.div
            className="glass-card"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
              height: '100%',
            }}
          >
            {/* Tree Header */}
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(71, 85, 105, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <FolderTree size={16} color="var(--accent-indigo)" />
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  Project Files
                </span>
                {fileTreeData && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    ({fileTreeData.total_files})
                  </span>
                )}
              </div>

              <button
                onClick={() => setIsTreeCollapsed(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Thu gọn sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            {/* Search & Filter Bar */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(71, 85, 105, 0.12)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  className="input"
                  placeholder="Lọc file theo tên..."
                  value={fileTreeSearch}
                  onChange={(e) => setFileTreeSearch(e.target.value)}
                  style={{
                    paddingLeft: 26,
                    paddingRight: fileTreeSearch ? 26 : 8,
                    height: 28,
                    fontSize: '0.75rem',
                    width: '100%',
                    borderRadius: 6,
                  }}
                />
                {fileTreeSearch && (
                  <button
                    onClick={() => setFileTreeSearch('')}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Mode Pills */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setFileFilterMode('all')}
                  style={{
                    flex: 1,
                    padding: '3px 6px',
                    fontSize: '0.72rem',
                    fontWeight: fileFilterMode === 'all' ? 600 : 400,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: fileFilterMode === 'all' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: fileFilterMode === 'all' ? '#818cf8' : 'var(--text-muted)',
                    transition: 'all 120ms ease',
                  }}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setFileFilterMode('issues')}
                  style={{
                    flex: 1,
                    padding: '3px 6px',
                    fontSize: '0.72rem',
                    fontWeight: fileFilterMode === 'issues' ? 600 : 400,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: fileFilterMode === 'issues' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: fileFilterMode === 'issues' ? '#f87171' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 120ms ease',
                  }}
                >
                  Có vấn đề
                  {fileTreeData && (fileTreeData.files_with_findings_count > 0 || fileTreeData.deleted_count > 0) && (
                    <span
                      style={{
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        padding: '0 4px',
                        borderRadius: 6,
                        background: 'rgba(239, 68, 68, 0.3)',
                        color: '#fee2e2',
                      }}
                    >
                      {fileTreeData.files_with_findings_count + fileTreeData.deleted_count}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Tree Nodes List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '8px 6px',
                minHeight: 0,
              }}
            >
              {isFileTreeLoading ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Đang nạp cấu trúc files...
                </div>
              ) : !fileTreeRoot || Object.keys(fileTreeRoot.children).length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  {fileFilterMode === 'issues'
                    ? 'Không có file nào có lỗi hoặc bị xóa.'
                    : 'Không có file nào phù hợp.'}
                </div>
              ) : (
                renderTreeNode(fileTreeRoot)
              )}
            </div>

            {/* Tree Footer with Active Selected File */}
            {selectedFilePath && (
              <div
                style={{
                  padding: '8px 10px',
                  borderTop: '1px solid rgba(71, 85, 105, 0.18)',
                  background: 'rgba(99, 102, 241, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#c7d2fe',
                    maxWidth: '160px',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  title={selectedFilePath}
                >
                  {selectedFilePath}
                </span>
                <button
                  onClick={() => setSelectedFilePath(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#818cf8',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: '2px 4px',
                    borderRadius: 4,
                  }}
                >
                  Hủy lọc ✕
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Column 2: Findings List */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}
        >
          {/* Active File Filter Banner inside List */}
          {selectedFilePath && (
            <div
              style={{
                padding: '8px 16px',
                background: 'rgba(99, 102, 241, 0.12)',
                borderBottom: '1px solid rgba(99, 102, 241, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <FileText size={15} color="#818cf8" />
                <span style={{ color: 'var(--text-secondary)' }}>Đang lọc file:</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    color: '#ffffff',
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '1px 8px',
                    borderRadius: 4,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 240,
                  }}
                  title={selectedFilePath}
                >
                  {selectedFilePath}
                </span>
              </div>
              <button
                onClick={() => setSelectedFilePath(null)}
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: '#c7d2fe',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: '2px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Hiển thị tất cả file <X size={12} />
              </button>
            </div>
          )}
          {displayFindings.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              No findings found
            </div>
          ) : (
            <div
              className="findings-scroll"
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                minHeight: 0,
                scrollBehavior: 'smooth',
              }}
            >
              {displayFindings.map((finding, idx) => {
              const sevConf = severityConfig[finding.severity];
              const isSelected = selectedFinding?.id === finding.id;

              return (
                <motion.div
                  key={finding.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setSelectedFinding(finding)}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(71, 85, 105, 0.12)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent-indigo)' : '3px solid transparent',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Severity Dot */}
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: sevConf.color,
                        marginTop: 5,
                        flexShrink: 0,
                        boxShadow: `0 0 6px ${sevConf.color}40`,
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span className={`badge badge-${finding.severity}`} style={{ fontSize: '0.625rem' }}>
                          {sevConf.label}
                        </span>
                        {finding.detector_type && (() => {
                          const tool = getToolBadge(finding.detector_type);
                          if (!tool) return null;
                          return (
                            <span
                              style={{
                                fontSize: '0.625rem',
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: tool.bg,
                                color: tool.color,
                                border: `1px solid ${tool.border}`,
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                              title={`Phát hiện bởi ${tool.label}`}
                            >
                              {tool.icon} {tool.label}
                            </span>
                          );
                        })()}
                        {finding.is_new && (
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(244, 63, 94, 0.2)',
                              color: '#fb7185',
                              border: '1px solid rgba(244, 63, 94, 0.4)',
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              boxShadow: '0 0 8px rgba(244, 63, 94, 0.3)',
                            }}
                            title="Lỗi mới phát hiện ở lượt quét này"
                          >
                            ✨ NEW
                          </span>
                        )}
                        {finding.cve_id && (
                          <span style={{ fontSize: '0.6875rem', color: 'var(--accent-cyan)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {finding.cve_id}
                          </span>
                        )}
                        {finding.verified && (
                          <span style={{ fontSize: '0.625rem', color: '#ef4444', fontWeight: 700 }}>
                            ⚡ VERIFIED
                          </span>
                        )}
                        <span style={{ 
                          fontSize: '0.625rem', 
                          padding: '2px 6px', 
                          borderRadius: 4, 
                          background: finding.status === 'open' ? 'rgba(239, 68, 68, 0.1)' : 
                                     finding.status === 'ignored' ? 'rgba(156, 163, 175, 0.1)' : 
                                     'rgba(16, 185, 129, 0.1)',
                          color: finding.status === 'open' ? '#ef4444' : 
                                 finding.status === 'ignored' ? '#9ca3af' : 
                                 '#10b981',
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}>
                          {finding.status}
                        </span>
                      </div>

                      <p style={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {finding.title}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                        {finding.file_path && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FileCode size={12} color="var(--text-muted)" />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                              {finding.file_path}
                              {finding.line_start && `:${finding.line_start}`}
                            </span>
                          </div>
                        )}
                        {finding.package_name && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            📦 {finding.package_name}@{finding.package_version}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight size={16} color="var(--text-muted)" style={{ marginTop: 4 }} />
                  </div>
                </motion.div>
              );
            })}
            </div>
          )}
          
          {/* Pagination Controls */}
          {displayFindings.length > 0 && (
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}>
              <button
                className="btn btn-secondary"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  height: 36,
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: page === 1 ? 0.5 : 1,
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  padding: '0 12px',
                }}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
              }}>
                <span>Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong></span>
                <span>of</span>
                <strong style={{ color: 'var(--text-primary)' }}>{Math.ceil((data?.total || 0) / 20)}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                  ({data?.total || 0} total)
                </span>
              </div>
              
              <button
                className="btn btn-secondary"
                onClick={() => setPage(page + 1)}
                disabled={!data?.items || data.items.length < 20}
                style={{
                  height: 36,
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: !data?.items || data.items.length < 20 ? 0.5 : 1,
                  cursor: !data?.items || data.items.length < 20 ? 'not-allowed' : 'pointer',
                  padding: '0 12px',
                }}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </motion.div>

        {/* Finding Detail Panel */}
        {selectedFinding && (
          <motion.div
            className="glass-card findings-detail-scroll"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ 
              padding: 24, 
              position: 'sticky', 
              top: 0,
              height: 'fit-content',
              maxHeight: 'calc(100vh - 200px)',
              overflowY: 'auto',
              alignSelf: 'start'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`badge badge-${selectedFinding.severity}`}>
                  {severityConfig[selectedFinding.severity].label}
                </span>
                
                {/* Status Dropdown */}
                <select
                  className="input"
                  value={selectedFinding.status}
                  onChange={(e) => updateStatusMutation.mutate({ id: selectedFinding.id, status: e.target.value })}
                  style={{
                    height: 28,
                    fontSize: '0.75rem',
                    padding: '0 8px',
                    width: 120,
                    background: selectedFinding.status === 'open' ? 'rgba(239, 68, 68, 0.1)' : 
                               selectedFinding.status === 'ignored' ? 'rgba(156, 163, 175, 0.1)' : 
                               'rgba(16, 185, 129, 0.1)',
                    color: selectedFinding.status === 'open' ? '#ef4444' : 
                           selectedFinding.status === 'ignored' ? '#9ca3af' : 
                           '#10b981',
                    border: '1px solid currentColor',
                    fontWeight: 600,
                  }}
                >
                  <option value="open">OPEN</option>
                  <option value="ignored">IGNORED</option>
                  <option value="resolved">RESOLVED</option>
                </select>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedFinding(null)}>✕</button>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>
              {selectedFinding.title}
            </h3>

            {selectedFinding.is_new && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  color: '#fb7185',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                ✨ <span>Lỗi Mới Phát Hiện: Lỗ hổng này mới xuất hiện ở đợt cập nhật mã nguồn này.</span>
              </div>
            )}

            {selectedFinding.description && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                {selectedFinding.description}
              </p>
            )}

            {/* Meta Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {selectedFinding.detector_type && (() => {
                const tool = getToolBadge(selectedFinding.detector_type);
                if (!tool) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Công cụ phát hiện:</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '3px 10px',
                        borderRadius: 6,
                        background: tool.bg,
                        color: tool.color,
                        border: `1px solid ${tool.border}`,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {tool.icon} {tool.label}
                    </span>
                  </div>
                );
              })()}
              {selectedFinding.file_path && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileCode size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.8125rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-cyan)' }}>
                    {selectedFinding.file_path}
                    {selectedFinding.line_start && `:${selectedFinding.line_start}`}
                    {selectedFinding.line_end && selectedFinding.line_end !== selectedFinding.line_start && `-${selectedFinding.line_end}`}
                  </span>
                </div>
              )}
              {selectedFinding.cve_id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={14} color="var(--severity-high)" />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--severity-high)' }}>
                    {selectedFinding.cve_id}
                    {selectedFinding.cvss_score && ` (CVSS: ${selectedFinding.cvss_score})`}
                  </span>
                </div>
              )}
              {selectedFinding.package_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    📦 {selectedFinding.package_name}@{selectedFinding.package_version}
                    {selectedFinding.fixed_version && (
                      <span style={{ color: 'var(--accent-emerald)' }}>
                        {' → '}{selectedFinding.fixed_version}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {selectedFinding.rule_id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    Rule: {selectedFinding.rule_id}
                  </span>
                </div>
              )}
            </div>

            {/* Code Snippet */}
            {selectedFinding.code_snippet && (
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Code Snippet
                </p>
                <div
                  style={{
                    background: '#0d1117',
                    border: '1px solid rgba(71, 85, 105, 0.3)',
                    borderRadius: 10,
                    padding: '16px 18px',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    color: '#e6edf3',
                    overflowX: 'auto',
                    overflowY: 'auto',
                    maxHeight: 300,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {selectedFinding.line_start && (
                    <span style={{ color: '#484f58', marginRight: 16, userSelect: 'none' }}>
                      {selectedFinding.line_start}
                    </span>
                  )}
                  <span style={{ color: '#f97583' }}>{selectedFinding.code_snippet}</span>
                </div>
              </div>
            )}

            {/* Fix suggestion for CVE */}
            {selectedFinding.fixed_version && (
              <div
                style={{
                  marginTop: 20,
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
              >
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent-emerald)', marginBottom: 4 }}>
                  💡 Recommended Fix
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Update <code style={{ color: 'var(--accent-cyan)' }}>{selectedFinding.package_name}</code> from{' '}
                  <code style={{ color: 'var(--severity-high)' }}>{selectedFinding.package_version}</code> to{' '}
                  <code style={{ color: 'var(--accent-emerald)' }}>{selectedFinding.fixed_version}</code>
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
