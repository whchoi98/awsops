'use client';
// Container Cost Dashboard / 컨테이너 비용 대시보드
// Phase 1: ECS Task cost analysis via Container Insights + Fargate pricing
// 1단계: Container Insights + Fargate 가격 기반 ECS Task 비용 분석

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { DollarSign, Container, Cpu, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Task {
  task_id: string;
  cluster_name: string;
  service_name: string;
  cpu: string;
  memory: string;
  launch_type: string;
  started_at: string;
  availability_zone: string;
  dailyCost: { cpuCost: number; memoryCost: number; totalCost: number };
}

interface Summary {
  totalDailyCost: number;
  totalMonthly: number;
  taskCount: number;
  fargateCount: number;
  ec2Count: number;
  clusterCount: number;
  topService: { name: string; cost: number } | null;
}

interface ContainerCostData {
  summary: Summary;
  tasks: Task[];
  services: any[];
  clusters: any[];
  namespaceCosts: { name: string; cost: number }[];
}

const CHART_COLORS = ['#00d4ff', '#00ff88', '#a855f7', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#f97316'];

export default function ContainerCostPage() {
  const [data, setData] = useState<ContainerCostData | null>(null);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/awsops/api/container-cost');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatCost = (cost: number) => `$${cost.toFixed(3)}`;
  const formatCostLg = (cost: number) => `$${cost.toFixed(2)}`;

  return (
    <div className="space-y-6">
      <Header
        title="Container Cost"
        subtitle="ECS Task cost analysis based on Fargate pricing and Container Insights"
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* StatsCards / 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label="Daily Cost (ECS)"
          value={data ? formatCostLg(data.summary.totalDailyCost) : '-'}
          icon={DollarSign}
          color="cyan"
        />
        <StatsCard
          label="Monthly Estimate"
          value={data ? formatCostLg(data.summary.totalMonthly) : '-'}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          label="Running Tasks"
          value={data ? `${data.summary.taskCount} (F:${data.summary.fargateCount} / EC2:${data.summary.ec2Count})` : '-'}
          icon={Container}
          color="purple"
        />
        <StatsCard
          label="Top Cost Service"
          value={data?.summary.topService ? `${data.summary.topService.name.replace(/^service:/, '')} (${formatCost(data.summary.topService.cost)}/day)` : '-'}
          icon={Cpu}
          color="orange"
        />
      </div>

      {/* Charts / 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Service Cost Distribution / 서비스별 비용 분포 */}
        <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
          <h3 className="text-white font-medium mb-4">Service Cost Distribution (Daily)</h3>
          {data && data.namespaceCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.namespaceCosts.map(s => ({
                    name: s.name.replace(/^service:/, ''),
                    value: s.cost,
                  }))}
                  cx="50%" cy="50%" outerRadius={100}
                  dataKey="value" nameKey="name"
                  label={({ name, value }) => `${name}: $${value.toFixed(3)}`}
                >
                  {data.namespaceCosts.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f1629', border: '1px solid #1a2540', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No ECS tasks running
            </div>
          )}
        </div>

        {/* Service Cost Bar Chart / 서비스별 비용 바 차트 */}
        <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
          <h3 className="text-white font-medium mb-4">Cost by Service (CPU vs Memory)</h3>
          {data && data.services.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.services.map((s: any) => {
                const svcTasks = data.tasks.filter(t => t.service_name === s.service_name);
                const cpuCost = svcTasks.reduce((sum, t) => sum + t.dailyCost.cpuCost, 0);
                const memCost = svcTasks.reduce((sum, t) => sum + t.dailyCost.memoryCost, 0);
                return {
                  name: (s.service_name || '').replace(/^service:/, ''),
                  CPU: Math.round(cpuCost * 1000) / 1000,
                  Memory: Math.round(memCost * 1000) / 1000,
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f1629', border: '1px solid #1a2540', borderRadius: '8px' }} />
                <Legend />
                <Bar dataKey="CPU" fill="#00d4ff" />
                <Bar dataKey="Memory" fill="#00ff88" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No service data available
            </div>
          )}
        </div>
      </div>

      {/* Task Table / Task 테이블 */}
      <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">ECS Tasks — Cost Breakdown</h3>
          <span className="text-xs text-gray-400">
            Fargate tasks show calculated cost. EC2 tasks require node cost allocation (Phase 2).
          </span>
        </div>
        <DataTable
          columns={[
            { key: 'cluster_name', label: 'Cluster' },
            {
              key: 'service_name', label: 'Service',
              render: (v: string) => <span className="text-cyan-400">{(v || '').replace(/^service:/, '')}</span>,
            },
            { key: 'task_id', label: 'Task ID', render: (v: string) => <span className="font-mono text-xs">{v?.slice(0, 12)}</span> },
            {
              key: 'launch_type', label: 'Type',
              render: (v: string) => (
                <span className={`px-2 py-0.5 rounded text-xs ${v === 'FARGATE' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {v}
                </span>
              ),
            },
            { key: 'cpu', label: 'CPU (units)', render: (v: string) => `${v} (${(parseInt(v) / 1024).toFixed(2)} vCPU)` },
            { key: 'memory', label: 'Memory (MB)', render: (v: string) => `${v} (${(parseInt(v) / 1024).toFixed(1)} GB)` },
            {
              key: 'dailyCost', label: 'Daily Cost',
              render: (_: any, row: Task) => row.launch_type === 'FARGATE'
                ? <span className="text-green-400 font-medium">{formatCost(row.dailyCost.totalCost)}</span>
                : <span className="text-gray-500">N/A (EC2)</span>,
            },
            { key: 'availability_zone', label: 'AZ' },
          ]}
          data={data?.tasks}
        />
      </div>

      {/* EKS Tab Placeholder (Phase 2) / EKS 탭 플레이스홀더 (2단계) */}
      <div className="bg-navy-800 rounded-lg p-4 border border-navy-600 opacity-50">
        <h3 className="text-white font-medium mb-2">EKS Pod Cost (Phase 2)</h3>
        <p className="text-gray-400 text-sm">
          OpenCost integration for EKS pod-level cost analysis (CPU, Memory, Network, Storage, GPU).
          Install OpenCost with <code className="text-cyan-400">scripts/06f-setup-opencost.sh</code> to enable.
        </p>
      </div>
    </div>
  );
}
