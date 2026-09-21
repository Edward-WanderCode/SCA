/* Scans management page with Scan Code Update action */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Filter, Clock, Trash2, Download, RefreshCw, AlertTriangle, X, FolderGit2, ChevronDown, ChevronRight, Layers, List, ExternalLink } from 'lucide-react';
import { scansApi, default as api } from '@/lib/api';
import { scanTypeConfig, statusConfig, timeAgo, formatDuration } from '@/lib/utils';
import type { ScanType, ScanStatus, Scan } from '@/types';
import NewScanDialog from '@/components/scans/NewScanDialog';
import UpdateCodeModal from '@/components/scans/UpdateCodeModal';

function ScanProgressBar({ scan }: { scan: Scan }) {
  const isActive = scan.status === 'running' || scan.status === 'pending';
  const progress = scan.progress || 0;

  if (!isActive) {
    const statConf = statusConfig[scan.status];
    return <span className={`badge ${statConf.className}`}>{statConf.label}</span>;
  }

  return (
    <div className="scan-progress">
      <div className="scan-progress-bar">
        <div
          className={`scan-progress-fill ${isActive ? 'active' : ''}`}
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
      </div>
      <div className="scan-progress-info">
        <span className="scan-progress-percentage">{progress}%</span>
        <span className="scan-progress-message">
          {scan.progress_message || (scan.status === 'pending' ? 'Queued...' : 'Scanning...')}
        </span>
      </div>
    </div>
  );
}

export default function ScansPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showNewScan, setShowNewScan] = useState(false);
  const [updateModalScan, setUpdateModalScan] = useState<Scan | null>(null);
  const [selectedSuspiciousScan, setSelectedSuspiciousScan] = useState<Scan | null>(null);

  const handleDownloadSarif = async (scanId: string) => {
    try {
      const response = await api.get(`/scans/${scanId}/sarif`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `scan_${scanId.substring(0, 8)}.sarif`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download SARIF:', err);
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['scans', typeFilter, statusFilter],
    queryFn: () =>
      scansApi.list({
        scan_type: typeFilter !== 'all' ? (typeFilter as ScanType) : undefined,
        status: statusFilter !== 'all' ? (statusFilter as ScanStatus) : undefined,
        page_size: 50,
      }),
    refetchInterval: (query) => {
      const scans = query.state.data?.items || [];
      const hasActive = scans.some((s) => s.status === 'running' || s.status === 'pending');
      return hasActive ? 2000 : 10000;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: scansApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
    },
  });

  const scans = data?.items || [];

  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const projectGroups = useMemo(() => {
    const map = new Map<string, {
      projectId: string;
      projectName: string;
      scans: Scan[];
      latestScan: Scan;
      activeCount: number;
      hasSuspicious: boolean;
    }>();

    for (const scan of scans) {
      const pid = scan.project_id || 'unknown';
      const pname = scan.project_name || 'Unnamed Project';
      if (!map.has(pid)) {
        map.set(pid, {
          projectId: pid,
          projectName: pname,
          scans: [],
          latestScan: scan,
          activeCount: 0,
          hasSuspicious: false,
        });
      }
      const g = map.get(pid)!;
      g.scans.push(scan);
      if (scan.status === 'running' || scan.status === 'pending') {
        g.activeCount++;
      }
      if (scan.findings_diff?.suspicious && scan.findings_diff.suspicious > 0) {
        g.hasSuspicious = true;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.latestScan.created_at || 0).getTime();
      const timeB = new Date(b.latestScan.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, [scans]);

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    projectGroups.forEach((g) => {
      allCollapsed[g.projectId] = true;
    });
    setCollapsedProjects(allCollapsed);
  };

  const expandAll = () => {
    setCollapsedProjects({});
  };

  const renderScanRow = (scan: Scan, showProjectCol: boolean = false) => {
    const typeConf = scanTypeConfig[scan.scan_type];
    return (
      <motion.tr
        key={scan.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => navigate(`/findings?project_id=${scan.project_id}&scan_id=${scan.id}`)}
        style={{ cursor: 'pointer' }}
      >
        {showProjectCol && (
          <td>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {scan.project_name || '—'}
            </span>
          </td>
        )}
        <td>
          <span
            className="badge"
            style={{
              background: `${typeConf.color}15`,
              color: typeConf.color,
              border: `1px solid ${typeConf.color}30`,
              whiteSpace: 'nowrap',
            }}
          >
            {typeConf.icon} {typeConf.label}
          </span>
        </td>
        <td>
          <ScanProgressBar scan={scan} />
        </td>
        <td>
          {scan.summary ? (
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {scan.summary.critical > 0 && (
                  <span className="badge badge-critical" style={{ fontSize: '0.625rem' }}>
                    {scan.summary.critical}C
                  </span>
                )}
                {scan.summary.high > 0 && (
                  <span className="badge badge-high" style={{ fontSize: '0.625rem' }}>
                    {scan.summary.high}H
                  </span>
                )}
                {scan.summary.medium > 0 && (
                  <span className="badge badge-medium" style={{ fontSize: '0.625rem' }}>
                    {scan.summary.medium}M
                  </span>
                )}
                {scan.summary.critical === 0 && scan.summary.high === 0 && scan.summary.medium === 0 && (
                  <span style={{ color: 'var(--accent-emerald)', fontSize: '0.8125rem' }}>✓ Clean</span>
                )}
              </div>
              {scan.findings_diff && (
                <div style={{ display: 'flex', gap: 6, fontSize: '0.6875rem', marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  {scan.findings_diff.added > 0 && (
                    <span style={{ color: '#f87171', fontWeight: 500 }}>
                      +{scan.findings_diff.added} new
                    </span>
                  )}
                  {(scan.findings_diff.resolved ?? scan.findings_diff.removed) > 0 && (
                    <span style={{ color: '#4ade80', fontWeight: 500 }}>
                      -{(scan.findings_diff.resolved ?? scan.findings_diff.removed)} fixed
                    </span>
                  )}
                  {scan.findings_diff.suspicious && scan.findings_diff.suspicious > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSuspiciousScan(scan);
                      }}
                      style={{
                        color: '#f87171',
                        fontWeight: 600,
                        background: 'rgba(239, 68, 68, 0.15)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title="Nhấp để xem chi tiết các lỗi biến mất do file bị xóa"
                    >
                      <AlertTriangle size={11} />
                      {scan.findings_diff.suspicious} file deleted
                    </button>
                  ) : null}
                  {scan.findings_diff.added === 0 &&
                    (scan.findings_diff.resolved ?? scan.findings_diff.removed) === 0 &&
                    (!scan.findings_diff.suspicious || scan.findings_diff.suspicious === 0) && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                        no change
                      </span>
                    )}
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </td>
        <td>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
            {formatDuration(scan.duration_seconds)}
          </span>
        </td>
        <td>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <Clock size={12} />
            {timeAgo(scan.created_at)}
          </span>
        </td>
        <td style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            {scan.status === 'completed' && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUpdateModalScan(scan);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    color: '#818cf8',
                    fontWeight: 600,
                    borderRadius: 6,
                    whiteSpace: 'nowrap',
                  }}
                  title="Scan Code Update (Quét lại mã nguồn mới)"
                >
                  <RefreshCw size={12} />
                  Code Update
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSarif(scan.id);
                  }}
                  style={{
                    padding: 6,
                    color: 'var(--accent-indigo)',
                  }}
                  title="Download SARIF"
                >
                  <Download size={14} />
                </button>
              </>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this scan and all its findings?')) {
                  deleteMutation.mutate(scan.id);
                }
              }}
              disabled={scan.status === 'running'}
              style={{
                padding: 6,
                color: 'var(--text-muted)',
                opacity: scan.status === 'running' ? 0.3 : 1,
              }}
              title="Delete scan"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </motion.tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Security Scans</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Manage and monitor your security scan operations
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowNewScan(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Plus size={16} /> New Scan
        </button>
      </div>

      {/* Filter Bar */}
      <div
        className="glass-card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select
            className="input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 140, padding: '6px 12px', fontSize: '0.8125rem' }}
          >
            <option value="all">All Types</option>
            <option value="sast">SAST</option>
            <option value="vulnerability">Vulnerability</option>
            <option value="secret">Secret</option>
            <option value="combined">Combined</option>
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 140, padding: '6px 12px', fontSize: '0.8125rem' }}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          {/* View Mode Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: 'rgba(0, 0, 0, 0.25)',
              padding: 3,
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginLeft: 8,
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'grouped' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('grouped')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 6,
              }}
              title="Gom nhóm các lần quét theo từng dự án"
            >
              <Layers size={13} />
              Theo Dự Án
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'flat' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('flat')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 6,
              }}
              title="Xem danh sách bảng phẳng"
            >
              <List size={13} />
              Danh Sách
            </button>
          </div>

          {viewMode === 'grouped' && projectGroups.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={expandAll}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                Mở tất cả
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={collapseAll}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                Thu gọn
              </button>
            </div>
          )}
        </div>

        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {projectGroups.length} dự án • {scans.length} lượt quét
        </span>
      </div>

      {/* Scans Content: Grouped or Flat */}
      {isLoading ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          Đang tải dữ liệu quét...
        </div>
      ) : scans.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          Không tìm thấy lượt quét nào
        </div>
      ) : viewMode === 'grouped' ? (
        /* Grouped by Project Cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {projectGroups.map((group) => {
            const isCollapsed = Boolean(collapsedProjects[group.projectId]);
            const latest = group.latestScan;
            return (
              <motion.div
                key={group.projectId}
                className="glass-card"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  overflow: 'hidden',
                  border: group.hasSuspicious
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : group.activeCount > 0
                    ? '1px solid rgba(99, 102, 241, 0.45)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: group.hasSuspicious
                    ? '0 4px 20px rgba(239, 68, 68, 0.08)'
                    : 'none',
                }}
              >
                {/* Project Group Header */}
                <div
                  onClick={() => toggleProjectCollapse(group.projectId)}
                  style={{
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isCollapsed ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.04)',
                    borderBottom: isCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.07)',
                    userSelect: 'none',
                    transition: 'background 0.2s',
                  }}
                >
                  {/* Left: Project Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </div>

                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: 'rgba(99, 102, 241, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#818cf8',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                      }}
                    >
                      <FolderGit2 size={18} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {group.projectName}
                        </span>

                        <span
                          className="badge"
                          style={{
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#818cf8',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            padding: '1px 8px',
                          }}
                        >
                          {group.scans.length} lượt quét
                        </span>

                        {group.activeCount > 0 && (
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(234, 179, 8, 0.15)',
                              color: '#facc15',
                              border: '1px solid rgba(234, 179, 8, 0.35)',
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <RefreshCw size={11} className="spin" />
                            {group.activeCount} đang quét...
                          </span>
                        )}

                        {group.hasSuspicious && (
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <AlertTriangle size={11} />
                            Có file bị xóa né lỗi
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
                        Lần quét gần nhất: {timeAgo(latest.created_at)} • Trạng thái: {latest.status.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quick actions & Latest status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {latest.summary && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {latest.summary.critical > 0 && (
                          <span className="badge badge-critical" style={{ fontSize: '0.625rem' }}>
                            {latest.summary.critical}C
                          </span>
                        )}
                        {latest.summary.high > 0 && (
                          <span className="badge badge-high" style={{ fontSize: '0.625rem' }}>
                            {latest.summary.high}H
                          </span>
                        )}
                        {latest.summary.medium > 0 && (
                          <span className="badge badge-medium" style={{ fontSize: '0.625rem' }}>
                            {latest.summary.medium}M
                          </span>
                        )}
                        {latest.summary.critical === 0 && latest.summary.high === 0 && latest.summary.medium === 0 && (
                          <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 600 }}>✓ Clean</span>
                        )}
                      </div>
                    )}

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/findings?project_id=${group.projectId}`);
                      }}
                      style={{
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        color: 'var(--accent-indigo)',
                        padding: '4px 10px',
                      }}
                      title="Xem tất cả Findings của dự án này"
                    >
                      <ExternalLink size={12} />
                      Findings
                    </button>
                  </div>
                </div>

                {/* Sub-table: Danh sách các lượt quét của riêng dự án này */}
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflowX: 'auto' }}
                    >
                      <table className="data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 140 }}>Scan Type</th>
                            <th style={{ minWidth: 160 }}>Status</th>
                            <th style={{ minWidth: 180 }}>Findings</th>
                            <th style={{ width: 110 }}>Duration</th>
                            <th style={{ width: 130 }}>Started</th>
                            <th style={{ width: 200, textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.scans.map((scan) => renderScanRow(scan, false))}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* Flat Table Mode */
        <motion.div className="glass-card" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Project</th>
                <th style={{ width: 140 }}>Scan Type</th>
                <th style={{ minWidth: 160 }}>Status</th>
                <th style={{ minWidth: 180 }}>Findings</th>
                <th style={{ width: 110 }}>Duration</th>
                <th style={{ width: 130 }}>Started</th>
                <th style={{ width: 200, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => renderScanRow(scan, true))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* New Scan Dialog */}
      {showNewScan && (
        <NewScanDialog
          onClose={() => setShowNewScan(false)}
          onSuccess={() => {
            setShowNewScan(false);
            refetch();
          }}
        />
      )}

      {/* Update Code Modal */}
      {updateModalScan && (
        <UpdateCodeModal
          projectId={updateModalScan.project_id}
          projectName={updateModalScan.project_name || 'Project'}
          onClose={() => setUpdateModalScan(null)}
          onSuccess={() => {
            setUpdateModalScan(null);
            refetch();
          }}
        />
      )}

      {/* Modal chi tiết lỗi biến mất do file bị xóa */}
      {selectedSuspiciousScan && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setSelectedSuspiciousScan(null)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: 680,
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 24,
              backgroundColor: '#161922',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              boxShadow: '0 10px 30px rgba(239, 68, 68, 0.25)',
              borderRadius: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f87171', margin: 0 }}>
                    ⚠️ CẢNH BÁO NÉ LỖI: Có {selectedSuspiciousScan.findings_diff?.suspicious || 0} lỗi biến mất nhưng do FILE BỊ XÓA:
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Dự án: {selectedSuspiciousScan.project_name || selectedSuspiciousScan.project_id}
                  </p>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedSuspiciousScan(null)}
                style={{ padding: 6 }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 18,
              }}
            >
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(selectedSuspiciousScan.findings_diff?.suspicious_findings || []).map((item, idx) => (
                  <li key={idx} style={{ fontSize: '0.84rem', lineHeight: 1.5, color: '#fee2e2' }}>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        color: '#ffffff',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {item.file_path || 'unknown file'}
                    </span>{' '}
                    <span style={{ color: '#fca5a5' }}>
                      ({item.title ? `Lỗi ${item.title}` : 'Lỗi bảo mật'})
                    </span>{' '}
                    <span style={{ color: '#f87171', fontWeight: 600 }}>
                      -&gt; File không còn tồn tại trong source code mới!
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedSuspiciousScan(null)}
              >
                Đóng
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  navigate(`/findings?scan_id=${selectedSuspiciousScan.id}`);
                  setSelectedSuspiciousScan(null);
                }}
              >
                Xem danh sách Findings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
