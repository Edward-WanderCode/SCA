/* Scans management page */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Filter, Clock, Trash2 } from 'lucide-react';
import { scansApi } from '@/lib/api';
import { scanTypeConfig, statusConfig, timeAgo, formatDuration } from '@/lib/utils';
import type { ScanType, ScanStatus, Scan } from '@/types';
import NewScanDialog from '@/components/scans/NewScanDialog';

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
        <span className="scan-progress-percent">{progress}%</span>
        <span className="scan-progress-message">
          {scan.progress_message || (scan.status === 'pending' ? 'Queued...' : 'Starting...')}
        </span>
      </div>
    </div>
  );
}

export default function ScansPage() {
  const [showNewScan, setShowNewScan] = useState(false);
  const [filterType, setFilterType] = useState<ScanType | ''>('');
  const [filterStatus, setFilterStatus] = useState<ScanStatus | ''>('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['scans', page, filterType, filterStatus],
    queryFn: () =>
      scansApi.list({
        page,
        page_size: 20,
        scan_type: filterType || undefined,
        status: filterStatus || undefined,
      }),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: scansApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
    },
  });

  const scans = data?.items || [];
  const total = data?.total || 0;
  const displayScans: Scan[] = scans;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Security Scans</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Manage and monitor your security scan operations
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewScan(true)}>
          <Plus size={18} />
          New Scan
        </button>
      </div>

      {/* Filters */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Filter size={16} color="var(--text-muted)" />
        <select
          className="input"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ScanType | '')}
          style={{ width: 160, height: 36, fontSize: '0.8125rem' }}
        >
          <option value="">All Types</option>
          <option value="sast">🔍 SAST</option>
          <option value="vulnerability">🛡️ Vulnerability</option>
          <option value="secret">🔑 Secret</option>
        </select>

        <select
          className="input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ScanStatus | '')}
          style={{ width: 160, height: 36, fontSize: '0.8125rem' }}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {total} scans
        </span>
      </div>

      {/* Scans Table */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ overflow: 'hidden' }}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Scan Type</th>
              <th>Status</th>
              <th>Findings</th>
              <th>Duration</th>
              <th>Started</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayScans.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No scans found
                </td>
              </tr>
            ) : (
              displayScans.map((scan, idx) => {
                const typeConf = scanTypeConfig[scan.scan_type];

                return (
                  <motion.tr
                    key={scan.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <td>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                        {scan.project_name}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: `${typeConf.color}15`,
                          border: `1px solid ${typeConf.color}30`,
                          fontSize: '0.8125rem',
                        }}
                      >
                        {typeConf.icon} {typeConf.label}
                      </div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <ScanProgressBar scan={scan} />
                    </td>
                    <td>
                      {scan.summary ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
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
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatDuration(scan.duration_seconds)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        {timeAgo(scan.created_at)}
                      </span>
                    </td>
                    <td>
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
    </div>
  );
}
