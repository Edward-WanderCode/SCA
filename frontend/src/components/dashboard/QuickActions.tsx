import { Plus, Send, RefreshCw, FileText, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function QuickActions() {
  const navigate = useNavigate();

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Quick Actions</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          className="btn"
          onClick={() => navigate('/projects')}
          style={{
            justifyContent: 'flex-start',
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            color: '#818cf8',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '10px 14px',
            fontSize: '0.8125rem',
          }}
        >
          <Plus size={16} />
          New Scan
        </button>

        <button
          className="btn"
          onClick={() => navigate('/findings')}
          style={{
            justifyContent: 'flex-start',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#34d399',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '10px 14px',
            fontSize: '0.8125rem',
          }}
        >
          <FileText size={16} />
          Export SARIF
        </button>

        <button
          className="btn"
          onClick={() => navigate('/settings')}
          style={{
            justifyContent: 'flex-start',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            padding: '10px 14px',
            fontSize: '0.8125rem',
          }}
        >
          <Send size={16} />
          Telegram Bot
        </button>

        <button
          className="btn"
          onClick={() => navigate('/settings')}
          style={{
            justifyContent: 'flex-start',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '10px 14px',
            fontSize: '0.8125rem',
          }}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </motion.div>
  );
}
