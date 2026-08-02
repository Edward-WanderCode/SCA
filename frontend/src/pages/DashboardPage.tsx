/* Dashboard page — assembles all dashboard components */

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import StatsCards from '@/components/dashboard/StatsCards';
import SeverityChart from '@/components/dashboard/SeverityChart';
import TrendChart from '@/components/dashboard/TrendChart';
import RecentScans from '@/components/dashboard/RecentScans';
import TopVulns from '@/components/dashboard/TopVulns';
import SystemStatus from '@/components/dashboard/SystemStatus';
import QuickActions from '@/components/dashboard/QuickActions';
import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 15000,
  });

  const { data: trends } = useQuery({
    queryKey: ['dashboard-trends'],
    queryFn: () => dashboardApi.getTrends(30),
    refetchInterval: 60000,
  });

  const { data: activity } = useQuery({
    queryKey: ['dashboard-recent'],
    queryFn: () => dashboardApi.getRecent(10),
    refetchInterval: 15000,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      {/* Top Header */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Dashboard Overview</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Comprehensive security posture analytics and scanner operations
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={stats} isLoading={statsLoading} />

      {/* Main Grid: Left 2 Columns (Charts & Activity) + Right 1 Column (Status & Actions) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2.3fr) minmax(0, 1fr)',
        gap: 24,
        alignItems: 'start',
      }}>
        {/* Left Main Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Charts Row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.4fr)',
            gap: 20,
          }}>
            <SeverityChart stats={stats} />
            <TrendChart trends={trends} />
          </div>

          {/* Activity Row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 20,
          }}>
            <RecentScans activity={activity} />
            <TopVulns activity={activity} />
          </div>
        </div>

        {/* Right Sidebar Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <QuickActions />
          <SystemStatus stats={stats} />
        </div>
      </div>
    </div>
  );
}
