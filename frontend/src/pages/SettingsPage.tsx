/* Settings page */

import { motion } from 'framer-motion';
import { Settings, Server, Database, Shield, Bell, Palette } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Settings</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Configure your SCA Platform instance
        </p>
      </div>

      {/* Scanner Configuration */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Shield size={18} color="var(--accent-indigo)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Scanner Configuration</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              OpenGrep Docker Image
            </label>
            <input className="input" defaultValue="ghcr.io/opengrep/opengrep:latest" />
          </div>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Trivy Docker Image
            </label>
            <input className="input" defaultValue="aquasecurity/trivy:latest" />
          </div>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              TruffleHog Docker Image
            </label>
            <input className="input" defaultValue="trufflesecurity/trufflehog:latest" />
          </div>
        </div>
      </motion.div>

      {/* Server Configuration */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Server size={18} color="var(--accent-emerald)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Server Configuration</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Max Concurrent Scans
            </label>
            <input className="input" type="number" defaultValue="3" />
          </div>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Scan Timeout (seconds)
            </label>
            <input className="input" type="number" defaultValue="600" />
          </div>
        </div>
      </motion.div>

      {/* Database Status */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Database size={18} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>System Status</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { name: 'PostgreSQL', status: 'Connected', color: '#10b981' },
            { name: 'Redis', status: 'Connected', color: '#10b981' },
            { name: 'Celery Workers', status: 'Running (3)', color: '#10b981' },
          ].map((service) => (
            <div
              key={service.name}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: service.color,
                    boxShadow: `0 0 6px ${service.color}`,
                  }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{service.name}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)' }}>{service.status}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button className="btn btn-secondary">Reset</button>
        <button className="btn btn-primary">Save Changes</button>
      </div>
    </div>
  );
}
