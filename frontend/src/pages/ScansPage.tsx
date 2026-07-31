/* Scans management page with Scan Code Update action */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Filter, Clock, Trash2, Download, RefreshCw } from 'lucide-react';
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        </div>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {scans.length} scans
        </span>
      </div>

      {/* Scans Table */}
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
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Loading scans...
                </td>
              </tr>
            ) : scans.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No scans found
                </td>
              </tr>
            ) : (
              scans.map((scan) => {
                const typeConf = scanTypeConfig[scan.scan_type];
                return (
                  <motion.tr
                    key={scan.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => navigate(`/findings?project_id=${scan.project_id}&scan_id=${scan.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {scan.project_name || '—'}
                        </span>
                      </div>
                    </td>
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
                            {(scan.summary.critical === 0 && scan.summary.high === 0 && scan.summary.medium === 0) && (
                              <span style={{ color: 'var(--accent-emerald)', fontSize: '0.8125rem' }}>✓ Clean</span>
                            )}
                          </div>
                          {scan.findings_diff && (
                            <div style={{ display: 'flex', gap: 8, fontSize: '0.6875rem', marginTop: 2 }}>
                              {scan.findings_diff.added > 0 && (
                                <span style={{ color: '#f87171', fontWeight: 500 }}>
                                  +{scan.findings_diff.added} new
                                </span>
                              )}
                              {scan.findings_diff.removed > 0 && (
                                <span style={{ color: '#4ade80', fontWeight: 500 }}>
                                  -{scan.findings_diff.removed} fixed
                                </span>
                              )}
                              {scan.findings_diff.added === 0 && scan.findings_diff.removed === 0 && (
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
              })
            )}
          </tbody>
        </table>
      </motion.div>

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
    </div>
  );
}
