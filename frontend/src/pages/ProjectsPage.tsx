/* Projects management page */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, FolderGit2, ExternalLink, Trash2, Clock, Search as SearchIcon, GitBranch, RefreshCw, Webhook, Settings } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { WebhookConfigModal } from '@/components/WebhookConfigModal';
import { ProjectSettingsModal } from '@/components/ProjectSettingsModal';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [configModalProject, setConfigModalProject] = useState<{id: string, name: string} | null>(null);
  const [settingsModalProject, setSettingsModalProject] = useState<any | null>(null);
  const [formData, setFormData] = useState({ name: '', repo_url: '', description: '', branch: 'main', language: '' });
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list({ page: 1, page_size: 50 }),
    refetchInterval: 5000,
  });
  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
      setFormData({ name: '', repo_url: '', description: '', branch: 'main', language: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const rescanMutation = useMutation({
    mutationFn: projectsApi.rescan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      alert('Rescan triggered successfully!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || err.message || 'Failed to trigger rescan');
    }
  });

  const projects = data?.items || [];
  const displayProjects = projects;

  const languageColors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Go: '#00ADD8',
    Java: '#b07219',
    Rust: '#dea584',
    'C#': '#178600',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Projects</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Manage repositories for security scanning
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} />
          Add Project
        </button>
      </div>

      {/* Add Project Form */}
      {showForm && (
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ padding: 24 }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>Add New Project</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Project Name *
              </label>
              <input
                className="input"
                placeholder="e.g. my-web-app"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Repository URL *
              </label>
              <input
                className="input"
                placeholder="https://github.com/org/repo"
                value={formData.repo_url}
                onChange={(e) => setFormData({ ...formData, repo_url: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Branch
              </label>
              <input
                className="input"
                placeholder="main"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Language
              </label>
              <input
                className="input"
                placeholder="e.g. TypeScript"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Description
              </label>
              <input
                className="input"
                placeholder="Brief project description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.name || !formData.repo_url}
              style={{ opacity: !formData.name || !formData.repo_url ? 0.5 : 1 }}
            >
              Create Project
            </button>
          </div>
        </motion.div>
      )}

      {/* Projects Grid */}
      {displayProjects.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <FolderGit2 size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} color="var(--accent-indigo)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No projects found</h3>
          <p style={{ fontSize: '0.8125rem', marginBottom: 16 }}>Get started by adding your first project repository.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {displayProjects.map((project, idx) => (
            <motion.div
              key={project.id}
              className="glass-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              style={{ padding: 24, cursor: 'pointer' }}
              whileHover={{ borderColor: 'var(--border-hover)' }}
              onClick={() => navigate(`/findings?project_id=${project.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FolderGit2 size={20} color="var(--accent-indigo)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{project.name}</h3>
                    {project.description && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {project.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this project?')) deleteMutation.mutate(project.id);
                  }}
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GitBranch size={13} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{project.branch}</span>
                </div>
                {project.language && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: languageColors[project.language] || '#6b7280',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{project.language}</span>
                  </div>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {project.total_scans} scans
                </span>
              </div>

              {/* Findings Summary & Diff */}
              {project.findings && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: 4 }}>Findings:</span>
                    {project.findings.critical > 0 && (
                      <span className="badge badge-critical" style={{ fontSize: '0.625rem' }}>
                        {project.findings.critical}C
                      </span>
                    )}
                    {project.findings.high > 0 && (
                      <span className="badge badge-high" style={{ fontSize: '0.625rem' }}>
                        {project.findings.high}H
                      </span>
                    )}
                    {project.findings.medium > 0 && (
                      <span className="badge badge-medium" style={{ fontSize: '0.625rem' }}>
                        {project.findings.medium}M
                      </span>
                    )}
                    {project.findings.low > 0 && (
                      <span className="badge badge-low" style={{ fontSize: '0.625rem' }}>
                        {project.findings.low}L
                      </span>
                    )}
                    {(project.findings.critical === 0 && project.findings.high === 0 && project.findings.medium === 0 && project.findings.low === 0) && (
                      <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem' }}>✓ Clean</span>
                    )}
                  </div>
                  
                  {project.findings_diff && (
                    <div style={{ display: 'flex', gap: 8, fontSize: '0.6875rem' }}>
                      {project.findings_diff.added > 0 && (
                        <span style={{ color: '#f87171', fontWeight: 500 }}>
                          +{project.findings_diff.added} new
                        </span>
                      )}
                      {project.findings_diff.removed > 0 && (
                        <span style={{ color: '#4ade80', fontWeight: 500 }}>
                          -{project.findings_diff.removed} fixed
                        </span>
                      )}
                      {project.findings_diff.added === 0 && project.findings_diff.removed === 0 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                          no change
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px solid rgba(71, 85, 105, 0.15)',
                }}
              >
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} />
                  Last scan: {project.last_scan_at ? timeAgo(project.last_scan_at) : 'Never'}
                </span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        rescanMutation.mutate(project.id);
                      }}
                      disabled={rescanMutation.isPending}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--accent-indigo)',
                      }}
                    >
                      <RefreshCw size={12} className={rescanMutation.isPending ? 'spin' : ''} />
                      Rescan
                    </button>
                    
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfigModalProject({ id: project.id, name: project.name });
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--accent-indigo)',
                      }}
                    >
                      <Webhook size={12} />
                      Webhook
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingsModalProject(project);
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Settings size={12} />
                      Settings
                    </button>

                  {project.repo_url.startsWith('https://') && (
                    <a
                      href={project.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: '0.75rem', color: 'var(--accent-indigo)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                    >
                      <ExternalLink size={12} />
                      View Repo
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      
      {configModalProject && (
        <WebhookConfigModal
          projectId={configModalProject.id}
          projectName={configModalProject.name}
          onClose={() => setConfigModalProject(null)}
        />
      )}

      {settingsModalProject && (
        <ProjectSettingsModal
          project={settingsModalProject}
          onClose={() => setSettingsModalProject(null)}
        />
      )}
    </div>
  );
}
