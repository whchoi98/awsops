'use client';
// Container Cost Dashboard / 컨테이너 비용 대시보드
// Phase 1: ECS Task cost analysis via Container Insights + Fargate pricing
// 1단계: Container Insights + Fargate 가격 기반 ECS Task 비용 분석

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { DollarSign, Container, Cpu, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import SafeResponsiveContainer from '@/components/charts/SafeResponsiveContainer';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAccountContext } from '@/contexts/AccountContext';


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
  const { t } = useLanguage();
  const { currentAccountId } = useAccountContext();

  const [data, setData] = useState<ContainerCostData | null>(null);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBasis, setShowBasis] = useState(false);
  const [clusterFilter, setClusterFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const acctParam = currentAccountId && currentAccountId !== '__all__' ? `?accountId=${currentAccountId}` : '';
      const res = await fetch(`/awsops/api/container-cost${acctParam}`);
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
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatCost = (cost: number) => `$${cost.toFixed(3)}`;
  const formatCostLg = (cost: number) => `$${cost.toFixed(2)}`;

  // Cluster list from data
  const clusterNames = useMemo(() => {
    if (!data?.clusters) return [];
    return data.clusters.map((c: any) => c.cluster_name).filter(Boolean).sort();
  }, [data]);

  // Filter tasks by cluster
  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    if (!clusterFilter) return data.tasks;
    return data.tasks.filter(t => t.cluster_name === clusterFilter);
  }, [data, clusterFilter]);

  // Recompute stats for filtered tasks
  const filteredSummary = useMemo(() => {
    const totalDailyCost = filteredTasks.reduce((sum, t) => sum + t.dailyCost.totalCost, 0);
    const fargateCount = filteredTasks.filter(t => t.launch_type === 'FARGATE').length;
    const ec2Count = filteredTasks.filter(t => t.launch_type === 'EC2').length;
    const serviceCosts: Record<string, number> = {};
    filteredTasks.forEach(t => {
      const svc = t.service_name || 'unknown';
      serviceCosts[svc] = (serviceCosts[svc] || 0) + t.dailyCost.totalCost;
    });
    const sorted = Object.entries(serviceCosts).sort((a, b) => b[1] - a[1]);
    return {
      totalDailyCost: Math.round(totalDailyCost * 1000) / 1000,
      totalMonthly: Math.round(totalDailyCost * 30 * 100) / 100,
      taskCount: filteredTasks.length,
      fargateCount,
      ec2Count,
      topService: sorted[0] ? { name: sorted[0][0], cost: sorted[0][1] } : null,
    };
  }, [filteredTasks]);

  // Service cost breakdown for charts
  const filteredServiceCosts = useMemo(() => {
    const serviceCosts: Record<string, number> = {};
    filteredTasks.forEach(t => {
      const svc = t.service_name || 'unknown';
      serviceCosts[svc] = (serviceCosts[svc] || 0) + t.dailyCost.totalCost;
    });
    return Object.entries(serviceCosts)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 1000) / 1000 }))
      .sort((a, b) => b.cost - a.cost);
  }, [filteredTasks]);

  return (
    <div className="space-y-6">
      <Header
        title={t('containerCost.title')}
        subtitle={t('containerCost.subtitle')}
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Cluster Filter / 클러스터 필터 */}
      {clusterNames.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">ECS Cluster:</span>
          <select
            value={clusterFilter}
            onChange={e => setClusterFilter(e.target.value)}
            className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500/50 focus:outline-none"
          >
            <option value="">All Clusters ({clusterNames.length})</option>
            {clusterNames.map((name: string) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {clusterFilter && (
            <button onClick={() => setClusterFilter('')} className="text-xs text-gray-500 hover:text-white">Clear</button>
          )}
        </div>
      )}

      {/* StatsCards / 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label={t('containerCost.dailyCost')}
          value={data ? formatCostLg(filteredSummary.totalDailyCost) : '-'}
          icon={DollarSign}
          color="cyan"
        />
        <StatsCard
          label={t('containerCost.totalCost')}
          value={data ? formatCostLg(filteredSummary.totalMonthly) : '-'}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          label={t('containerCost.taskCount')}
          value={data ? `${filteredSummary.taskCount} (F:${filteredSummary.fargateCount} / EC2:${filteredSummary.ec2Count})` : '-'}
          icon={Container}
          color="purple"
        />
        <StatsCard
          label="Top Cost Service"
          value={filteredSummary.topService ? `${filteredSummary.topService.name.replace(/^service:/, '')} (${formatCost(filteredSummary.topService.cost)}/day)` : '-'}
          icon={Cpu}
          color="orange"
        />
      </div>

      {/* Charts / 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Service Cost Distribution / 서비스별 비용 분포 */}
        <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
          <h3 className="text-white font-medium mb-4">Service Cost Distribution (Daily)</h3>
          {filteredServiceCosts.length > 0 ? (
            <SafeResponsiveContainer height={300}>
              <PieChart>
                <Pie
                  data={filteredServiceCosts.map(s => ({
                    name: s.name.replace(/^service:/, ''),
                    value: s.cost,
                  }))}
                  cx="50%" cy="50%" outerRadius={100}
                  dataKey="value" nameKey="name"
                  label={({ name, value }) => `${name}: $${value.toFixed(3)}`}
                >
                  {filteredServiceCosts.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f1629', border: '1px solid #1a2540', borderRadius: '8px' }} />
              </PieChart>
            </SafeResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              {t('containerCost.noData')}
            </div>
          )}
        </div>

        {/* Service Cost Bar Chart / 서비스별 비용 바 차트 */}
        <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
          <h3 className="text-white font-medium mb-4">Cost by Service (CPU vs Memory)</h3>
          {filteredServiceCosts.length > 0 ? (
            <SafeResponsiveContainer height={300}>
              <BarChart data={filteredServiceCosts.map(s => {
                const svcTasks = filteredTasks.filter(t => t.service_name === s.name);
                const cpuCost = svcTasks.reduce((sum, t) => sum + t.dailyCost.cpuCost, 0);
                const memCost = svcTasks.reduce((sum, t) => sum + t.dailyCost.memoryCost, 0);
                return {
                  name: (s.name || '').replace(/^service:/, ''),
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
            </SafeResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No service data available
            </div>
          )}
        </div>
      </div>

      {/* Task Table / Task 테이블 */}
      <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
        <h3 className="text-white font-medium mb-4">ECS Tasks — Cost Breakdown</h3>
        <DataTable
          columns={[
            { key: 'cluster_name', label: t('containerCost.clusterName') },
            {
              key: 'service_name', label: t('containerCost.serviceName'),
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
              key: 'dailyCost', label: t('containerCost.estimatedCost'),
              render: (_: any, row: Task) => row.launch_type === 'FARGATE'
                ? <span className="text-green-400 font-medium">{formatCost(row.dailyCost.totalCost)}</span>
                : <span className="text-gray-500">N/A (EC2)</span>,
            },
            { key: 'availability_zone', label: 'AZ' },
          ]}
          data={filteredTasks}
        />
      </div>

      {/* Cost Calculation Basis / 비용 계산 근거 */}
      <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
        <button
          onClick={() => setShowBasis(!showBasis)}
          className="flex items-center gap-2 text-white font-medium w-full text-left"
        >
          <span className={`transition-transform ${showBasis ? 'rotate-90' : ''}`}>▶</span>
          Cost Calculation Basis / 비용 계산 근거
        </button>
        {showBasis && (
          <div className="mt-4 space-y-4 text-sm text-gray-300">
            {/* Fargate Pricing / Fargate 가격 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Fargate Pricing (ap-northeast-2)</h4>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-navy-600 text-gray-400">
                    <th className="py-1 pr-4">Resource / 리소스</th>
                    <th className="py-1 pr-4">Unit Price / 단가</th>
                    <th className="py-1">Billing Unit / 과금 단위</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-4">vCPU</td>
                    <td className="py-1.5 pr-4 text-green-400 font-mono">$0.04048</td>
                    <td className="py-1.5">per vCPU-hour</td>
                  </tr>
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-4">Memory</td>
                    <td className="py-1.5 pr-4 text-green-400 font-mono">$0.004445</td>
                    <td className="py-1.5">per GB-hour</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4">Ephemeral Storage (&gt;20GB)</td>
                    <td className="py-1.5 pr-4 text-green-400 font-mono">$0.000111</td>
                    <td className="py-1.5">per GB-hour</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Calculation Formula / 계산 공식 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Calculation Formula / 계산 공식</h4>
              <div className="bg-navy-900 rounded p-3 font-mono text-xs space-y-1">
                <p><span className="text-purple-400">CPU Cost</span> = (CPU Units / 1024) x $0.04048/hr x 24hr</p>
                <p><span className="text-purple-400">Memory Cost</span> = (Memory MB / 1024) x $0.004445/hr x 24hr</p>
                <p><span className="text-yellow-400">Daily Cost</span> = CPU Cost + Memory Cost</p>
                <p><span className="text-yellow-400">Monthly Estimate</span> = Daily Cost x 30</p>
              </div>
            </div>

            {/* Example / 예시 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Example / 예시</h4>
              <div className="bg-navy-900 rounded p-3 text-xs space-y-1">
                <p className="text-gray-400">Fargate Task: 512 CPU units (0.5 vCPU) + 1024 MB (1 GB)</p>
                <p>CPU: 0.5 vCPU x $0.04048/hr x 24hr = <span className="text-green-400">$0.486/day</span></p>
                <p>Memory: 1 GB x $0.004445/hr x 24hr = <span className="text-green-400">$0.107/day</span></p>
                <p>Total: <span className="text-yellow-400 font-medium">$0.593/day ($17.78/month)</span></p>
              </div>
            </div>

            {/* Notes / 참고 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Notes / 참고</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>Fargate tasks: cost calculated from task definition CPU/Memory allocation (Fargate Task는 Task 정의의 CPU/Memory 할당 기준 계산)</li>
                <li>EC2 launch type: requires node cost allocation — not supported in Phase 1 (EC2 타입은 노드 비용 분배 필요 — Phase 1 미지원)</li>
                <li>Prices are configurable in <code className="text-cyan-400">data/config.json</code> (fargatePricing) (가격은 config.json에서 변경 가능)</li>
                <li>Monthly estimate assumes 30-day continuous running (월 추정은 30일 연속 실행 가정)</li>
                <li>Data source: AWS Fargate Pricing (ap-northeast-2, 2025) (데이터 출처: AWS Fargate 가격표)</li>
              </ul>
            </div>
          </div>
        )}
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
