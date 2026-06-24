/* Dashboard stat cards with animated counters */

import { motion } from 'framer-motion';
import { Shield, AlertTriangle, TrendingUp, Activity, Search, FolderGit2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DashboardStats } from '@/types';

interface StatsCardsProps {
  stats: DashboardStats | undefined;
  isLoading: boolean;
}

function AnimatedCounter({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (value === 0) { setCount(0); return; }
    
    const steps = 40;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, (duration * 1000) / steps);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <>{count.toLocaleString()}</>;
}

const cardConfig = [
  {
    key: 'total_scans',
    label: 'Total Scans',
    icon: Search,
    gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.08))',
    iconBg: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  {
    key: 'critical',
    label: 'Critical Issues',
    icon: AlertTriangle,
    gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.08))',
    iconBg: 'linear-gradient(135deg, #ef4444, #f97316)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  {
    key: 'total_findings',
    label: 'Total Findings',
    icon: Shield,
    gradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(234, 179, 8, 0.06))',
    iconBg: 'linear-gradient(135deg, #f97316, #eab308)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  {
    key: 'total_projects',
    label: 'Projects',
    icon: FolderGit2,
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.08))',
    iconBg: 'linear-gradient(135deg, #10b981, #06b6d4)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
];

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const [gridCols, setGridCols] = useState('repeat(4, 1fr)');

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setGridCols('1fr');
      } else if (window.innerWidth < 1024) {
        setGridCols('repeat(2, 1fr)');
      } else {
        setGridCols('repeat(4, 1fr)');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getValue = (key: string): number => {
    if (!stats) return 0;
    if (key === 'critical') return stats.findings_by_severity?.critical || 0;
    return (stats as any)[key] || 0;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 20 }}>
      {cardConfig.map((card, index) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.5 }}
          style={{
            background: card.gradient,
            backdropFilter: 'blur(12px)',
            border: `1px solid ${card.borderColor}`,
            borderRadius: 16,
            padding: '24px',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 250ms ease',
          }}
          whileHover={{ 
            scale: 1.02, 
            boxShadow: `0 8px 32px ${card.borderColor}`,
          }}
        >
          {/* Background glow */}
          <div
            style={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: card.iconBg,
              opacity: 0.06,
              filter: 'blur(20px)',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ 
                fontSize: '0.8125rem', 
                color: 'var(--text-muted)', 
                fontWeight: 500, 
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {card.label}
              </p>
              <p style={{ 
                fontSize: '2rem', 
                fontWeight: 800,
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}>
                {isLoading ? (
                  <span style={{ 
                    display: 'inline-block', 
                    width: 60, 
                    height: 32, 
                    background: 'rgba(255,255,255,0.05)', 
                    borderRadius: 8,
                    animation: 'pulse 1.5s infinite',
                  }} />
                ) : (
                  <AnimatedCounter value={getValue(card.key)} />
                )}
              </p>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: card.iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${card.borderColor}`,
                flexShrink: 0,
              }}
            >
              <card.icon size={22} color="white" />
            </div>
          </div>

          {/* Sub info */}
          {stats && card.key === 'total_scans' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} color="var(--accent-emerald)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)' }}>
                {stats.running_scans} running
              </span>
            </div>
          )}
          {stats && card.key === 'total_findings' && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} color="var(--severity-high)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--severity-high)' }}>
                {stats.findings_by_severity?.high || 0} high severity
              </span>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
