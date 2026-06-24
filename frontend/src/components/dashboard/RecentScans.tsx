/* Recent scans activity table */

import { motion } from 'framer-motion';
import { ExternalLink, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RecentActivity } from '@/types';
import { scanTypeConfig, statusConfig, timeAgo, formatDuration } from '@/lib/utils';

interface RecentScansProps {
  activity: RecentActivity | undefined;
}

export default function RecentScans({ activity }: RecentScansProps) {
  const navigate = useNavigate();
  const scans = activity?.recent_scans || [];
  const displayScans = scans;

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Recent Scans</h3>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/scans')}
          style={{ fontSize: '0.75rem' }}
        >
          View All <ExternalLink size={12} />
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Type</th>
            <th>Status</th>
            <th>Findings</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {displayScans.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                No recent scans
              </td>
            </tr>
          ) : (
            displayScans.map((scan, idx) => {
              const typeConf = scanTypeConfig[scan.scan_type];
              const statConf = statusConfig[scan.status];

              return (
                <motion.tr
                  key={scan.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + idx * 0.05 }}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/scans`)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: typeConf.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                        {scan.project_name}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8125rem' }}>
                      {typeConf.icon} {typeConf.label}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${statConf.className}`}>
                      {statConf.label}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          scan.findings_count > 0
                            ? 'var(--severity-high)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {scan.findings_count > 0 ? scan.findings_count : '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ 
                      fontSize: '0.8125rem', 
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <Clock size={12} />
                      {timeAgo(scan.created_at)}
                    </span>
                  </td>
                </motion.tr>
              );
            })
          )}
        </tbody>
      </table>
    </motion.div>
  );
}
