/* Top header bar */

import { Search, Bell, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/scans': 'Scans',
  '/findings': 'Findings',
  '/projects': 'Projects',
  '/settings': 'Settings',
};

export default function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'SCA Platform';

  return (
    <header
      style={{
        height: 72,
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-primary)',
        background: 'rgba(10, 14, 26, 0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{title}</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
          Static Code Analysis Platform
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="input"
            placeholder="Search findings..."
            style={{
              width: 260,
              paddingLeft: 36,
              height: 38,
              fontSize: '0.8125rem',
              background: 'rgba(15, 23, 42, 0.6)',
            }}
          />
        </div>

        {/* Refresh */}
        <button
          className="btn btn-ghost"
          style={{ padding: 8, borderRadius: 8 }}
          title="Refresh data"
        >
          <RefreshCw size={18} />
        </button>

        {/* Notifications */}
        <button
          className="btn btn-ghost"
          style={{ padding: 8, borderRadius: 8, position: 'relative' }}
          title="Notifications"
        >
          <Bell size={18} />
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--severity-critical)',
              border: '2px solid var(--bg-primary)',
            }}
          />
        </button>

        {/* User Avatar */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--gradient-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginLeft: 4,
          }}
        >
          A
        </div>
      </div>
    </header>
  );
}
