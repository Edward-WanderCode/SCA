/* Dashboard page — assembles all dashboard components */

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import StatsCards from '@/components/dashboard/StatsCards';
import SeverityChart from '@/components/dashboard/SeverityChart';
import TrendChart from '@/components/dashboard/TrendChart';
import RecentScans from '@/components/dashboard/RecentScans';
import TopVulns from '@/components/dashboard/TopVulns';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30000,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stats Cards */}
      <StatsCards stats={stats} isLoading={statsLoading} />

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>
        <SeverityChart stats={stats} />
        <TrendChart trends={trends} />
      </div>

      {/* Activity Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <RecentScans activity={activity} />
        <TopVulns activity={activity} />
      </div>
    </div>
  );
}
