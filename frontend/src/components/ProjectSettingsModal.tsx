import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';

interface ProjectSettingsModalProps {
  project: {
    id: string;
    name: string;
    cron_schedule?: string | null;
    enabled_scanners?: string[] | null;
  };
  onClose: () => void;
}

export function ProjectSettingsModal({ project, onClose }: ProjectSettingsModalProps) {
  const queryClient = useQueryClient();
  const [cronSchedule, setCronSchedule] = useState(project.cron_schedule || '');
  const [scanners, setScanners] = useState({
    secret: project.enabled_scanners?.includes('secret') ?? true,
    vulnerability: project.enabled_scanners?.includes('vulnerability') ?? true,
    sast: project.enabled_scanners?.includes('sast') ?? true,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => projectsApi.update(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Failed to update settings');
    }
  });

  const handleSave = () => {
    const enabled_scanners = Object.entries(scanners)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    updateMutation.mutate({
      cron_schedule: cronSchedule || null,
      enabled_scanners: enabled_scanners.length > 0 ? enabled_scanners : null,
    });
  };

  return (
    <AnimatePresence>
      <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
        <motion.div
          className="modal-content glass-card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 450, padding: 24, zIndex: 101, position: 'relative' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Project Settings</h3>
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Configure advanced settings for <strong>{project.name}</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Scan Schedule (Cron Expression)
              </label>
              <input
                className="input"
                placeholder="e.g. 0 0 * * * (Daily at midnight)"
                value={cronSchedule}
                onChange={(e) => setCronSchedule(e.target.value)}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Leave empty to disable scheduled scans. Timezone is UTC.
              </p>
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                Custom Scan Profiles
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scanners.secret}
                    onChange={(e) => setScanners({ ...scanners, secret: e.target.checked })}
                  />
                  Secret Scanning (Credentials & API Keys)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scanners.vulnerability}
                    onChange={(e) => setScanners({ ...scanners, vulnerability: e.target.checked })}
                  />
                  Dependency Vulnerabilities (CVEs)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scanners.sast}
                    onChange={(e) => setScanners({ ...scanners, sast: e.target.checked })}
                  />
                  Static Analysis (SAST - Security Flaws)
                </label>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Select which scanners to run during a combined or scheduled scan.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={updateMutation.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              <Save size={16} />
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
