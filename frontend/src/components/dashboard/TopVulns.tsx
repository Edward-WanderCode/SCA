/* Top critical vulnerabilities list */

import { motion } from 'framer-motion';
import { AlertTriangle, ExternalLink, FileCode } from 'lucide-react';
import type { RecentActivity } from '@/types';
import { timeAgo } from '@/lib/utils';

interface TopVulnsProps {
  activity: RecentActivity | undefined;
}

export default function TopVulns({ activity }: TopVulnsProps) {
  const findings = activity?.critical_findings || [];
  const displayFindings = findings;

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.5 }}
      style={{ padding: 24 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="var(--severity-critical)" />
          Critical & High Findings
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {displayFindings.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            No critical or high findings
          </div>
        ) : (
          displayFindings.map((finding, idx) => (
            <motion.div
              key={finding.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + idx * 0.05 }}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: finding.severity === 'critical'
                  ? 'rgba(239, 68, 68, 0.06)'
                  : 'rgba(249, 115, 22, 0.04)',
                border: `1px solid ${
                  finding.severity === 'critical'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(249, 115, 22, 0.12)'
                }`,
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
              whileHover={{
                background: finding.severity === 'critical'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(249, 115, 22, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      className={`badge badge-${finding.severity}`}
                      style={{ fontSize: '0.625rem' }}
                    >
                      {finding.severity}
                    </span>
                    {finding.cve_id && (
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--accent-cyan)',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {finding.cve_id}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginBottom: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {finding.title}
                  </p>
                  {finding.file_path && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileCode size={12} color="var(--text-muted)" />
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {finding.file_path}
                      </span>
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {timeAgo(finding.created_at)}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
