/* Scan Code Update modal dialog */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FolderArchive, Folder, FolderOpen, Play, Loader2, RefreshCw, AlertCircle, HardDrive } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { scansApi, projectsApi } from '@/lib/api';
import type { ScanType } from '@/types';

interface UpdateCodeModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}

type UpdateMode = 'zip' | 'folder' | 'host' | 'git';

export default function UpdateCodeModal({
  projectId,
  projectName,
  onClose,
  onSuccess,
}: UpdateCodeModalProps) {
  const [mode, setMode] = useState<UpdateMode>('zip');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderFiles, setSelectedFolderFiles] = useState<File[] | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [hostFolderPath, setHostFolderPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  const zipMutation = useMutation({
    mutationFn: (file: File) => scansApi.localScan(file, ['combined'], projectId),
    onSuccess: () => onSuccess(),
  });

  const folderMutation = useMutation({
    mutationFn: (files: File[]) => scansApi.uploadFolder(files, ['combined'], projectId),
    onSuccess: () => onSuccess(),
  });

  const hostMutation = useMutation({
    mutationFn: (path: string) => scansApi.folderScan(path, ['combined'], projectId),
    onSuccess: () => onSuccess(),
  });

  const gitMutation = useMutation({
    mutationFn: () => projectsApi.rescan(projectId),
    onSuccess: () => onSuccess(),
  });

  const isPending =
    zipMutation.isPending || folderMutation.isPending || hostMutation.isPending || gitMutation.isPending;

  const error =
    (zipMutation.error as any)?.response?.data?.detail ||
    zipMutation.error?.message ||
    (folderMutation.error as any)?.response?.data?.detail ||
    folderMutation.error?.message ||
    (hostMutation.error as any)?.response?.data?.detail ||
    hostMutation.error?.message ||
    (gitMutation.error as any)?.response?.data?.detail ||
    gitMutation.error?.message;

  async function openFolderPicker() {
    if ((window as any).showDirectoryPicker) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        const files: File[] = [];
        async function walk(handle: any, basePath = '') {
          for await (const [name, entry] of handle.entries()) {
            if (entry.kind === 'file') {
              try {
                const fh = await entry.getFile();
                (fh as any).webkitRelativePath = basePath ? `${basePath}/${fh.name}` : fh.name;
                files.push(fh);
              } catch (e) {}
            } else if (entry.kind === 'directory') {
              await walk(entry, basePath ? `${basePath}/${name}` : name);
            }
          }
        }
        await walk(dirHandle, '');
        if (files.length > 0) {
          setSelectedFolderFiles(files);
          setSelectedFolderName(dirHandle.name || files[0].name);
          return;
        }
      } catch (err) {}
    }
    folderInputRef.current?.click();
  }

  const handleSubmit = () => {
    if (mode === 'zip') {
      if (!selectedFile) return;
      zipMutation.mutate(selectedFile);
    } else if (mode === 'folder') {
      if (!selectedFolderFiles || selectedFolderFiles.length === 0) return;
      folderMutation.mutate(selectedFolderFiles);
    } else if (mode === 'host') {
      if (!hostFolderPath.trim()) return;
      hostMutation.mutate(hostFolderPath.trim());
    } else if (mode === 'git') {
      gitMutation.mutate();
    }
  };

  const canSubmit =
    mode === 'zip'
      ? !!selectedFile
      : mode === 'folder'
      ? !!selectedFolderFiles && selectedFolderFiles.length > 0
      : mode === 'host'
      ? !!hostFolderPath.trim()
      : true;

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
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
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
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RefreshCw size={16} color="var(--accent-indigo)" />
                </div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Scan Code Update</h2>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Dự án: <strong style={{ color: 'var(--text-primary)' }}>{projectName}</strong>
              </p>
            </div>
            <button onClick={onClose} className="btn btn-ghost" style={{ padding: 8, borderRadius: 8 }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Mode selection tabs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 4,
                padding: 4,
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: 10,
                border: '1px solid var(--border-primary)',
              }}
            >
              <button
                type="button"
                onClick={() => setMode('zip')}
                style={{
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: mode === 'zip' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'zip' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <FolderArchive size={13} />
                Upload ZIP
              </button>

              <button
                type="button"
                onClick={() => setMode('folder')}
                style={{
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: mode === 'folder' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'folder' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Folder size={13} />
                Folder Upload
              </button>

              <button
                type="button"
                onClick={() => setMode('host')}
                style={{
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: mode === 'host' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'host' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <HardDrive size={13} />
                Host Path
              </button>

              <button
                type="button"
                onClick={() => setMode('git')}
                style={{
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: mode === 'git' ? 'var(--gradient-primary)' : 'transparent',
                  color: mode === 'git' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={13} />
                Git Rescan
              </button>
            </div>

            {/* Content area based on mode */}
            {mode === 'zip' ? (
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Tải lên File nén mã nguồn mới (ZIP / RAR)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.rar"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                <div
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
                  }}
                >
                  {selectedFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FolderArchive size={22} color="var(--accent-indigo)" />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                          {selectedFile.name}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB — Nhấn để chọn file khác
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload size={28} color="var(--text-muted)" />
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        Nhấn để chọn file nén mã nguồn mới (.ZIP / .RAR)
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Mã nguồn mới sẽ cập nhật trực tiếp vào dự án này
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : mode === 'folder' ? (
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Tải lên Thư mục mã nguồn từ máy tính
                </label>
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length === 0) {
                      setSelectedFolderFiles(null);
                      setSelectedFolderName('');
                      return;
                    }
                    setSelectedFolderFiles(files);
                    const firstRelativePath = (files[0] as any).webkitRelativePath || files[0].name;
                    const rootFolder = firstRelativePath.split('/')[0] || files[0].name;
                    setSelectedFolderName(rootFolder);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openFolderPicker()}
                  style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px' }}
                >
                  <FolderOpen size={16} />
                  Chọn thư mục mã nguồn mới
                </button>
                {selectedFolderFiles && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--accent-indigo)', marginTop: 10, fontWeight: 500 }}>
                    Thư mục đã chọn: <strong>{selectedFolderName}</strong> ({selectedFolderFiles.length} tệp)
                  </p>
                )}
              </div>
            ) : mode === 'host' ? (
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Đường dẫn thư mục chứa mã nguồn mới trên máy chủ
                </label>
                <input
                  className="input"
                  placeholder="Ví dụ: /app/workspace/my-new-code"
                  value={hostFolderPath}
                  onChange={(e) => setHostFolderPath(e.target.value)}
                  style={{ fontFamily: "'JetBrains Mono', monospace", height: 44 }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Đường dẫn tuyệt đối tới folder mã nguồn mới
                </span>
              </div>
            ) : (
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 10,
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Tải lại mã nguồn mới từ kho lưu trữ Git hiện tại và thực hiện quét lại.
              </div>
            )}

            {/* Error message if any */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </motion.div>
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
            <button className="btn btn-secondary" onClick={onClose} disabled={isPending}>
              Hủy
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || isPending}>
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Đang xử lý...
                </>
              ) : (
                <>
                  <Play size={16} /> Bắt đầu Quét lại Code mới
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
