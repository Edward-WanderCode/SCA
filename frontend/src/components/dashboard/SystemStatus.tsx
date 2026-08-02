import { Activity, Cpu, Database, Server, ShieldCheck, Send } from 'lucide-react';
import { motion } from 'framer-motion';

interface SystemStatusProps {
  stats?: any;
}

export default function SystemStatus({ stats }: SystemStatusProps) {
  const engines = [
    { name: 'OpenGrep Engine', type: 'SAST Code Analysis', status: 'operational', version: 'v1.23.0', color: '#10b981' },
    { name: 'TruffleHog Engine', type: 'Secret Detection', status: 'operational', version: 'v3.88.0', color: '#6366f1' },
    { name: 'Trivy Engine', type: 'SCA Vulnerability', status: 'operational', version: 'v0.58.0', color: '#3b82f6' },
    { name: 'PostgreSQL Database', type: 'Core Storage', status: 'operational', version: 'v16.0', color: '#ec4899' },
    { name: 'Redis Broker', type: 'Celery & Cache', status: 'operational', version: 'v7.0', color: '#f59e0b' },
  ];

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} style={{ color: '#6366f1' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>System & Engine Status</h3>
        </div>
        <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }}>
          All Systems Operational
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {engines.map((eng, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',

              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: eng.color, boxShadow: `0 0 8px ${eng.color}` }} />
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{eng.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{eng.type}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {eng.version}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
