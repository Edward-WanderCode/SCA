/* Severity distribution donut chart */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import type { DashboardStats } from '@/types';

interface SeverityChartProps {
  stats: DashboardStats | undefined;
}

const SEVERITY_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#3b82f6',
  Info: '#6b7280',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          padding: '10px 14px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <p style={{ color: data.payload.fill, fontWeight: 600, fontSize: '0.875rem' }}>
          {data.name}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: 2 }}>
          {data.value} findings ({data.payload.percentage}%)
        </p>
      </div>
    );
  }
  return null;
};

export default function SeverityChart({ stats }: SeverityChartProps) {
  if (!stats) return null;

  const total = stats.total_findings || 1;
  const data = [
    { name: 'Critical', value: stats.findings_by_severity.critical, fill: SEVERITY_COLORS.Critical },
    { name: 'High', value: stats.findings_by_severity.high, fill: SEVERITY_COLORS.High },
    { name: 'Medium', value: stats.findings_by_severity.medium, fill: SEVERITY_COLORS.Medium },
    { name: 'Low', value: stats.findings_by_severity.low, fill: SEVERITY_COLORS.Low },
    { name: 'Info', value: stats.findings_by_severity.info, fill: SEVERITY_COLORS.Info },
  ]
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, percentage: Math.round((d.value / total) * 100) }));

  // If no data, show placeholder
  if (data.length === 0) {
    data.push({ name: 'No Data', value: 1, fill: '#1e293b', percentage: 100 });
  }

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      style={{ padding: 24, height: '100%' }}
    >
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 24 }}>
        Severity Distribution
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Chart */}
        <div style={{ width: 180, height: 180, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.total_findings}
            </p>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: -2 }}>
              Total
            </p>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {Object.entries(SEVERITY_COLORS).map(([name, color]) => {
            const val =
              stats.findings_by_severity[name.toLowerCase() as keyof typeof stats.findings_by_severity] || 0;
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;

            return (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: color,
                    }}
                  />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {name}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{val}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 36, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
