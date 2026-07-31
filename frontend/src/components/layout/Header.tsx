/* Top header bar */

import { Search, Bell, RefreshCw, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import UserProfile from '@/components/UserProfile';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/scans': 'Scans',
  '/findings': 'Findings',
  '/projects': 'Projects',
  '/settings': 'Settings',
};

interface HeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
}

export default function Header({ onMenuClick, isMobile }: HeaderProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'SCA Platform';

  return (
    <header
      style={{
        height: 72,
        padding: isMobile ? '0 16px' : '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-primary)',
        background: 'rgba(10, 14, 26, 0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {isMobile && (
          <button
            onClick={onMenuClick}
            style={{
              padding: 8,
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Menu size={20} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </h2>
          {!isMobile && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Static Code Analysis Platform
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
        {/* Search - Hidden on mobile, smaller on tablet */}
        {!isMobile && (
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
        )}

        {/* Refresh */}
        <button
          className="btn btn-ghost"
          style={{ padding: 8, borderRadius: 8, flexShrink: 0 }}
          title="Refresh data"
        >
          <RefreshCw size={18} />
        </button>

        {/* Notifications */}
        <button
          className="btn btn-ghost"
          style={{ padding: 8, borderRadius: 8, position: 'relative', flexShrink: 0 }}
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
        {!isMobile && <UserProfile />}
      </div>
    </header>
  );
}
