/* Findings trend line chart */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { DashboardTrends } from '@/types';

interface TrendChartProps {
  trends: DashboardTrends | undefined;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          padding: '12px 16px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {entry.name}: <strong style={{ color: 'var(--text-primary)' }}>{entry.value}</strong>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function TrendChart({ trends }: TrendChartProps) {
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');

  const data = trends?.findings_trend || [];

  // Generate empty stats trend line if empty
  const chartData = data.length > 0 ? data : Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.now() - (13 - i) * 86400000).toISOString().split('T')[0],
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: 0,
  }));

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      style={{ padding: 24, height: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Findings Trend</h3>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3 }}>
          {(['7', '30', '90'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: timeRange === range ? 'var(--accent-indigo)' : 'transparent',
                color: timeRange === range ? 'white' : 'var(--text-muted)',
                transition: 'all 150ms ease',
              }}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="gradCritical" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradMedium" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#eab308" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(71, 85, 105, 0.15)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(71, 85, 105, 0.2)' }}
            tickFormatter={(val) => {
              const d = new Date(val);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={35}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="critical"
            name="Critical"
            stroke="#ef4444"
            fill="url(#gradCritical)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="high"
            name="High"
            stroke="#f97316"
            fill="url(#gradHigh)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="medium"
            name="Medium"
            stroke="#eab308"
            fill="url(#gradMedium)"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
