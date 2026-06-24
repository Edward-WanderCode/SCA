/* New scan dialog / modal */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Play, Loader2, Upload, FolderArchive, Folder, FolderOpen } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { projectsApi, scansApi } from '@/lib/api';
import type { ScanType } from '@/types';

interface NewScanDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}


type ScanMode = 'project' | 'local' | 'folder';

export default function NewScanDialog({ onClose, onSuccess }: NewScanDialogProps) {
  const [mode, setMode] = useState<ScanMode>('project');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<ScanType>>(new Set(['combined']));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderPath, setFolderPath] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserData, setBrowserData] = useState<{
    current_path: string;
    parent_path: string | null;
    directories: string[];
    is_root: boolean;
  } | null>(null);
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState('');

  const loadDirectory = async (path: string) => {
    setIsBrowserLoading(true);
    setBrowserError('');
    try {
      const data = await scansApi.browse(path);
      setBrowserData(data);
    } catch (err: any) {
      setBrowserError(err.response?.data?.detail || err.message || 'Failed to load directory');
    } finally {
      setIsBrowserLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectsApi.list({ page: 1, page_size: 100 }),
  });

  const projectMutation = useMutation({
    mutationFn: scansApi.create,
    onSuccess: () => onSuccess(),
  });

  const localMutation = useMutation({
    mutationFn: ({ file, types }: { file: File; types: ScanType[] }) =>
      scansApi.localScan(file, types),
    onSuccess: () => onSuccess(),
  });

  const folderMutation = useMutation({
    mutationFn: ({ path, types }: { path: string; types: ScanType[] }) =>
      scansApi.folderScan(path, types),
    onSuccess: () => onSuccess(),
  });

  const isPending = projectMutation.isPending || localMutation.isPending || folderMutation.isPending;



  const handleSubmit = () => {
    if (selectedTypes.size === 0) return;

    if (mode === 'project') {
      if (!selectedProject) return;
      projectMutation.mutate({
        project_id: selectedProject,
        scan_types: Array.from(selectedTypes),
      });
    } else if (mode === 'local') {
      if (!selectedFile) return;
      localMutation.mutate({
        file: selectedFile,
        types: Array.from(selectedTypes),
      });
    } else {
      if (!folderPath) return;
      folderMutation.mutate({
        path: folderPath,
        types: Array.from(selectedTypes),
      });
    }
  };

  const canSubmit =
    selectedTypes.size > 0 &&
    (mode === 'project' ? !!selectedProject : mode === 'local' ? !!selectedFile : !!folderPath);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 580,
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 20,
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '24px 28px',
              borderBottom: '1px solid var(--border-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>New Security Scan</h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Scan a project repository or upload local code
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={{ padding: 8, borderRadius: 8 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Mode Tabs */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                padding: 4,
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: 10,
                border: '1px solid var(--border-primary)',
              }}
            >
              <button
                onClick={() => setMode('project')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: mode === 'project' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'project' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Search size={14} />
                Git Repository
              </button>
              <button
                onClick={() => setMode('local')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: mode === 'local' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'local' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Upload size={14} />
                Upload ZIP
              </button>
              <button
                onClick={() => setMode('folder')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: mode === 'folder' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'folder' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Folder size={14} />
                Local Folder
              </button>
            </div>

            {/* Source Selection */}
            {mode === 'project' ? (
              <div>
                <label
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Select Project
                </label>
                <select
                  className="input"
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  style={{ height: 44 }}
                >
                  <option value="">Choose a project...</option>
                  {(projects?.items || [])
                    .filter((p) => !p.repo_url.startsWith('local://') && !p.repo_url.startsWith('folder://'))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.repo_url}
                      </option>
                    ))}
                </select>
              </div>
            ) : mode === 'local' ? (
              <div>
                <label
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Upload Source Code
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                <motion.div
                  whileHover={{ borderColor: 'var(--accent-indigo)' }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: selectedFile ? '16px 20px' : '32px 20px',
                    borderRadius: 12,
                    border: `2px dashed ${selectedFile ? 'var(--accent-indigo)' : 'var(--border-primary)'}`,
                    background: selectedFile ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 200ms ease',
                  }}
                >
                  {selectedFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FolderArchive size={20} color="var(--accent-indigo)" />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                          {selectedFile.name}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB — Click to change
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload size={28} color="var(--text-muted)" />
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        Click to upload a ZIP file
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ZIP your project folder and upload it for scanning
                      </p>
                    </>
                  )}
                </motion.div>
              </div>
            ) : (
              <div>
                <label
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Local Folder Path
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. D:\Code\my-project or /absolute/path/to/project"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    style={{ height: 44, flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowBrowser(true);
                      loadDirectory('');
                    }}
                    style={{ height: 44, display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px' }}
                  >
                    <FolderOpen size={16} />
                    Browse
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  Enter the absolute directory path of the folder on the host machine.
                </p>
              </div>
            )}

            {/* Combined Scan Info Card */}
            <div
              style={{
                padding: '20px 24px',
                borderRadius: 14,
                border: '1px solid rgba(16, 185, 129, 0.2)',
                background: 'rgba(16, 185, 129, 0.05)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <Play size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#10b981', marginBottom: 4 }}>
                  Full Security Scan Enabled
                </h4>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  This scan will automatically run and combine all security engines:
                </p>
                <ul style={{ 
                  fontSize: '0.8125rem', 
                  color: 'var(--text-muted)', 
                  marginTop: 6, 
                  paddingLeft: 16, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 4 
                }}>
                  <li style={{ listStyleType: 'disc' }}>🔍 <strong>SAST:</strong> Code structure, syntax, and vulnerability scanning.</li>
                  <li style={{ listStyleType: 'disc' }}>🛡️ <strong>Vulnerabilities:</strong> Known library vulnerabilities in dependencies.</li>
                  <li style={{ listStyleType: 'disc' }}>🔑 <strong>Secrets:</strong> Embedded passwords, private keys, and API tokens.</li>
                </ul>
              </div>
            </div>

            {/* Error Message */}
            {(projectMutation.isError || localMutation.isError || folderMutation.isError) && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 600 }}>Error:</span>
                <span>
                  {projectMutation.isError
                    ? ((projectMutation.error as any)?.response?.data?.detail || projectMutation.error?.message || 'Failed to start scan')
                    : localMutation.isError
                    ? ((localMutation.error as any)?.response?.data?.detail || localMutation.error?.message || 'Failed to upload and scan')
                    : ((folderMutation.error as any)?.response?.data?.detail || folderMutation.error?.message || 'Failed to run folder scan')}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '20px 28px',
              borderTop: '1px solid var(--border-primary)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Starting...
                </>
              ) : (
                <>
                  <Play size={16} /> {mode === 'local' ? 'Upload & Scan' : mode === 'folder' ? 'Scan Folder' : 'Start Scan'}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              width: 500,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 16,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '80vh',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Select Local Folder</h3>
              <button
                className="btn btn-ghost"
                onClick={() => setShowBrowser(false)}
                style={{ padding: 6, borderRadius: 6 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Path Breadcrumbs */}
            <div
              style={{
                padding: '10px 20px',
                background: 'rgba(15, 23, 42, 0.4)',
                borderBottom: '1px solid var(--border-primary)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                wordBreak: 'break-all',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontWeight: 600 }}>Path:</span>
              <span>{browserData?.current_path || 'Loading...'}</span>
            </div>

            {/* Directory List */}
            <div
              style={{
                padding: 12,
                overflowY: 'auto',
                flex: 1,
                minHeight: 250,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {isBrowserLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: 'var(--text-muted)' }}>
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : browserError ? (
                <div style={{ color: 'var(--accent-red, #ef4444)', padding: 12, textAlign: 'center', fontSize: '0.8125rem' }}>
                  {browserError}
                </div>
              ) : (
                <>
                  {/* Up directory option */}
                  {browserData?.parent_path && (
                    <div
                      onClick={() => loadDirectory(browserData.parent_path!)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'transparent',
                        fontSize: '0.8125rem',
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <FolderOpen size={16} color="var(--accent-indigo)" />
                      <span style={{ fontWeight: 600 }}>.. (Parent Directory)</span>
                    </div>
                  )}

                  {/* List of subdirectories */}
                  {browserData?.directories.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      No folders in this directory
                    </div>
                  ) : (
                    browserData?.directories.map((dirName) => (
                      <div
                        key={dirName}
                        onDoubleClick={() => loadDirectory(`${browserData.current_path}/${dirName}`)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'transparent',
                          fontSize: '0.8125rem',
                          transition: 'background 150ms ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Folder size={16} color="var(--accent-indigo)" />
                          <span>{dirName}</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadDirectory(`${browserData.current_path}/${dirName}`);
                          }}
                          style={{ padding: '2px 8px', fontSize: '0.6875rem' }}
                        >
                          Open
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border-primary)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                background: 'rgba(15, 23, 42, 0.2)',
              }}
            >
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBrowser(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!browserData}
                onClick={() => {
                  if (browserData) {
                    setFolderPath(browserData.current_path);
                    setShowBrowser(false);
                  }
                }}
              >
                Select Current Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
