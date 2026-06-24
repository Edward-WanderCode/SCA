/* Findings page with filterable table */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Filter, Search, FileCode, ExternalLink, ChevronRight, AlertTriangle, Shield, Key, Download, ChevronDown, ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { findingsApi, projectsApi } from '@/lib/api';
import { severityConfig, timeAgo } from '@/lib/utils';
import type { Severity, Finding } from '@/types';

export default function FindingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id') || '';
  const [filterSeverity, setFilterSeverity] = useState<Severity | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Fetch projects list for dropdown filter
  const { data: projectsData } = useQuery({
    queryKey: ['projects-list-simple'],
    queryFn: () => projectsApi.list({ page: 1, page_size: 100 }),
  });
  const projects = projectsData?.items || [];

  const { data, isLoading } = useQuery({
    queryKey: ['findings', page, filterSeverity, filterProjectId, searchQuery],
    queryFn: () =>
      findingsApi.list({
        page,
        page_size: 20,
        severity: filterSeverity || undefined,
        project_id: filterProjectId || undefined,
        search: searchQuery || undefined,
      }),
  });

  const findings = data?.items || [];
  const displayFindings: Finding[] = findings;

  const setFilterProjectId = (id: string) => {
    const params = new URLSearchParams(searchParams);
    if (id) {
      params.set('project_id', id);
    } else {
      params.delete('project_id');
    }
    setSearchParams(params);
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Security Findings</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
          All vulnerabilities, code issues, and exposed secrets
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
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
                  onClick={() => {
                    setShowExportMenu(false);
                    const url = `/api/findings/export?format=html${filterProjectId ? `&project_id=${filterProjectId}` : ''}${filterSeverity ? `&severity=${filterSeverity}` : ''}`;
                    window.open(url, '_blank');
                  }}
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
                  onClick={() => {
                    setShowExportMenu(false);
                    const url = `/api/findings/export?format=markdown${filterProjectId ? `&project_id=${filterProjectId}` : ''}${filterSeverity ? `&severity=${filterSeverity}` : ''}`;
                    window.open(url, '_blank');
                  }}
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
                  onClick={() => {
                    setShowExportMenu(false);
                    const url = `/api/findings/export?format=json${filterProjectId ? `&project_id=${filterProjectId}` : ''}${filterSeverity ? `&severity=${filterSeverity}` : ''}`;
                    window.open(url, '_blank');
                  }}
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

      {/* Split View: List + Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedFinding ? '1fr 1fr' : '1fr', gap: 20, minHeight: 0, height: 'calc(100vh - 280px)' }}>
        {/* Findings List */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}
        >
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`badge badge-${finding.severity}`} style={{ fontSize: '0.625rem' }}>
                          {sevConf.label}
                        </span>
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
              <span className={`badge badge-${selectedFinding.severity}`}>
                {severityConfig[selectedFinding.severity].label}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedFinding(null)}>✕</button>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>
              {selectedFinding.title}
            </h3>

            {selectedFinding.description && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                {selectedFinding.description}
              </p>
            )}

            {/* Meta Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
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
