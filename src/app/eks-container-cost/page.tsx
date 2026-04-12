'use client';
// EKS Container Cost Dashboard / EKS 컨테이너 비용 대시보드
// Request-based cost estimation: Pod resource requests + EC2 node pricing
// 리소스 요청 기반 비용 추정: Pod 리소스 요청 + EC2 노드 가격

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { DollarSign, Box, Server, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import SafeResponsiveContainer from '@/components/charts/SafeResponsiveContainer';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAccountContext } from '@/contexts/AccountContext';


interface PodCost {
  pod_name: string;
  namespace: string;
  node_name: string;
  instance_type: string;
  cpu_request_vcpu: number;
  memory_request_mb: number;
  cpuCostDaily: number;
  memCostDaily: number;
  networkCostDaily?: number;
  pvCostDaily?: number;
  gpuCostDaily?: number;
  totalCostDaily: number;
  containers?: { name: string; cpu_request: string; memory_request: string }[];
}

interface NodeCost {
  node_name: string;
  instance_type: string;
  hourlyRate: number;
  dailyCost: number;
  pod_count: number;
}

interface EksCostData {
  summary: {
    totalPodCostDaily: number;
    totalPodCostMonthly: number;
    totalNodeCostDaily: number;
    totalNodeCostMonthly: number;
    podCount: number;
    nodeCount: number;
    namespaceCount: number;
    topNamespace: { name: string; cost: number } | null;
  };
  pods: PodCost[];
  nodes: NodeCost[];
  namespaceCosts: { name: string; cost: number }[];
  opencostEnabled: boolean;
  dataSource?: string;
}

const CHART_COLORS = ['#00d4ff', '#00ff88', '#a855f7', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#f97316'];

export default function EksContainerCostPage() {
  const { t } = useLanguage();
  const { currentAccountId } = useAccountContext();

  const [data, setData] = useState<EksCostData | null>(null);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBasis, setShowBasis] = useState(false);
  const [activeTab, setActiveTab] = useState<'pods' | 'nodes'>('pods');
  const [clusterFilter, setClusterFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const acctParam = currentAccountId && currentAccountId !== '__all__' ? `?accountId=${currentAccountId}` : '';
      const res = await fetch(`/awsops/api/eks-container-cost${acctParam}`);
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

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatCostLg = (cost: number) => `$${cost.toFixed(2)}`;

  // Extract cluster name from context_name ARN
  const extractCluster = (ctx: string) => {
    const m = ctx?.match(/\/([^/]+)$/);
    return m ? m[1] : '';
  };

  // Unique cluster names from pods + nodes
  const clusterNames = useMemo(() => {
    if (!data) return [];
    const names = new Set<string>();
    data.pods.forEach(p => { const c = extractCluster((p as any).context_name || ''); if (c) names.add(c); });
    data.nodes.forEach(n => { const c = extractCluster((n as any).context_name || ''); if (c) names.add(c); });
    return Array.from(names).sort();
  }, [data]);

  // Filter pods and nodes by cluster
  const filteredPods = useMemo(() => {
    if (!data?.pods) return [];
    if (!clusterFilter) return data.pods;
    return data.pods.filter(p => extractCluster((p as any).context_name || '') === clusterFilter);
  }, [data, clusterFilter]);

  const filteredNodes = useMemo(() => {
    if (!data?.nodes) return [];
    if (!clusterFilter) return data.nodes;
    return data.nodes.filter(n => extractCluster((n as any).context_name || '') === clusterFilter);
  }, [data, clusterFilter]);

  // Recompute stats for filtered data
  const filteredSummary = useMemo(() => {
    const totalPodCostDaily = filteredPods.reduce((sum, p) => sum + p.totalCostDaily, 0);
    const totalNodeCostDaily = filteredNodes.reduce((sum, n) => sum + n.dailyCost, 0);
    const nsCosts: Record<string, number> = {};
    filteredPods.forEach(p => {
      nsCosts[p.namespace] = (nsCosts[p.namespace] || 0) + p.totalCostDaily;
    });
    const sorted = Object.entries(nsCosts).sort((a, b) => b[1] - a[1]);
    return {
      totalPodCostDaily: Math.round(totalPodCostDaily * 1000) / 1000,
      totalPodCostMonthly: Math.round(totalPodCostDaily * 30 * 100) / 100,
      totalNodeCostDaily: Math.round(totalNodeCostDaily * 100) / 100,
      totalNodeCostMonthly: Math.round(totalNodeCostDaily * 30 * 100) / 100,
      podCount: filteredPods.length,
      nodeCount: filteredNodes.length,
      namespaceCount: Object.keys(nsCosts).length,
      topNamespace: sorted[0] ? { name: sorted[0][0], cost: sorted[0][1] } : null,
    };
  }, [filteredPods, filteredNodes]);

  // Namespace costs for charts
  const filteredNsCosts = useMemo(() => {
    const nsCosts: Record<string, number> = {};
    filteredPods.forEach(p => {
      nsCosts[p.namespace] = (nsCosts[p.namespace] || 0) + p.totalCostDaily;
    });
    return Object.entries(nsCosts)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 1000) / 1000 }))
      .sort((a, b) => b.cost - a.cost);
  }, [filteredPods]);

  return (
    <div className="space-y-6">
      <Header
        title={t('eksContainerCost.title')}
        subtitle={t('eksContainerCost.subtitle')}
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {data && (
        <div className={`${data.dataSource === 'opencost' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'} border rounded-lg p-3 text-sm`}>
          {data.dataSource === 'opencost'
            ? '✅ OpenCost (Prometheus) — Actual usage-based cost: CPU + Memory + Network + Storage + GPU'
            : '⚠️ Request-based estimation — CPU + Memory only. Install OpenCost for full cost data: scripts/06f-setup-opencost.sh'}
        </div>
      )}

      {/* Cluster Filter / 클러스터 필터 */}
      {clusterNames.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">EKS Cluster:</span>
          <select
            value={clusterFilter}
            onChange={e => setClusterFilter(e.target.value)}
            className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500/50 focus:outline-none"
          >
            <option value="">All Clusters ({clusterNames.length})</option>
            {clusterNames.map(name => (
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
          label={t('eksContainerCost.totalCost')}
          value={data ? formatCostLg(filteredSummary.totalPodCostDaily) : '-'}
          icon={DollarSign}
          color="cyan"
        />
        <StatsCard
          label="Pod Cost (Monthly)"
          value={data ? formatCostLg(filteredSummary.totalPodCostMonthly) : '-'}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          label="Running Pods"
          value={data ? `${filteredSummary.podCount} pods / ${filteredSummary.nodeCount} nodes` : '-'}
          icon={Box}
          color="purple"
        />
        <StatsCard
          label="Top Namespace"
          value={filteredSummary.topNamespace ? `${filteredSummary.topNamespace.name} (${formatCost(filteredSummary.topNamespace.cost)}/day)` : '-'}
          icon={Server}
          color="orange"
        />
      </div>

      {/* Charts / 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Namespace Cost Distribution / 네임스페이스별 비용 분포 */}
        <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
          <h3 className="text-white font-medium mb-4">Namespace Cost Distribution (Daily)</h3>
          {filteredNsCosts.length > 0 ? (
            <SafeResponsiveContainer height={300}>
              <PieChart>
                <Pie
                  data={filteredNsCosts.map(s => ({ name: s.name, value: s.cost }))}
                  cx="50%" cy="50%" outerRadius={100}
                  dataKey="value" nameKey="name"
                  label={({ name, value }) => `${name}: $${value.toFixed(3)}`}
                >
                  {filteredNsCosts.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f1629', border: '1px solid #1a2540', borderRadius: '8px' }} />
              </PieChart>
            </SafeResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">{t('eksContainerCost.noData')}</div>
          )}
        </div>

        {/* Node Cost Bar Chart / 노드별 비용 바 차트 */}
        <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
          <h3 className="text-white font-medium mb-4">Node Daily Cost + Pod Count</h3>
          {filteredNodes.length > 0 ? (
            <SafeResponsiveContainer height={300}>
              <BarChart data={filteredNodes.map(n => ({
                name: n.node_name.split('.')[0],
                'Daily Cost': n.dailyCost,
                'Pod Count': n.pod_count,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f1629', border: '1px solid #1a2540', borderRadius: '8px' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="Daily Cost" fill="#00d4ff" />
                <Bar yAxisId="right" dataKey="Pod Count" fill="#a855f7" />
              </BarChart>
            </SafeResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No node data</div>
          )}
        </div>
      </div>

      {/* Tab: Pods / Nodes */}
      <div className="bg-navy-800 rounded-lg p-4 border border-navy-600">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setActiveTab('pods')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'pods' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'}`}
          >
            Pods ({filteredSummary.podCount})
          </button>
          <button
            onClick={() => setActiveTab('nodes')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'nodes' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white'}`}
          >
            Nodes ({filteredSummary.nodeCount})
          </button>
          <span className="ml-auto text-xs text-gray-400">
            {data?.dataSource === 'opencost'
              ? 'Source: OpenCost (Prometheus actual usage × AWS pricing)'
              : 'Source: Request-based (Pod request ratio × EC2 node cost)'}
          </span>
        </div>

        {activeTab === 'pods' ? (
          <DataTable
            columns={[
              { key: 'namespace', label: t('eksContainerCost.namespace'), render: (v: string) => <span className="text-cyan-400">{v}</span> },
              { key: 'pod_name', label: 'Pod', render: (v: string) => <span className="font-mono text-xs">{v}</span> },
              { key: 'node_name', label: 'Node', render: (v: string) => <span className="text-xs">{v?.split('.')[0]}</span> },
              { key: 'cpuCostDaily', label: t('eksContainerCost.cpuCost'), render: (v: number) => <span className="text-xs">{formatCost(v)}</span> },
              { key: 'memCostDaily', label: t('eksContainerCost.memoryCost'), render: (v: number) => <span className="text-xs">{formatCost(v)}</span> },
              ...(data?.dataSource === 'opencost' ? [
                { key: 'networkCostDaily', label: 'Network', render: (v: number) => <span className="text-xs">{formatCost(v || 0)}</span> },
                { key: 'pvCostDaily', label: 'Storage', render: (v: number) => <span className="text-xs">{formatCost(v || 0)}</span> },
                { key: 'gpuCostDaily', label: 'GPU', render: (v: number) => <span className="text-xs">{formatCost(v || 0)}</span> },
              ] : []),
              {
                key: 'totalCostDaily', label: 'Total/Day',
                render: (v: number) => <span className="text-green-400 font-medium">{formatCost(v)}</span>,
              },
            ]}
            data={filteredPods}
          />
        ) : (
          <DataTable
            columns={[
              { key: 'node_name', label: 'Node', render: (v: string) => <span className="font-mono text-xs">{v?.split('.')[0]}</span> },
              { key: 'instance_type', label: 'Instance Type', render: (v: string) => <span className="text-cyan-400">{v}</span> },
              { key: 'hourlyRate', label: 'Hourly Rate', render: (v: number) => <span className="text-green-400">${v?.toFixed(4)}</span> },
              { key: 'dailyCost', label: 'Daily Cost', render: (v: number) => <span className="text-green-400 font-medium">${v?.toFixed(2)}</span> },
              { key: 'pod_count', label: 'Pods' },
            ]}
            data={filteredNodes}
          />
        )}
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
            {/* Data Source Comparison / 데이터 소스 비교 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Two Cost Calculation Methods / 두 가지 비용 계산 방식</h4>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-navy-600 text-gray-400">
                    <th className="py-1.5 pr-3">항목 / Item</th>
                    <th className="py-1.5 pr-3">Request 기반 (기본)</th>
                    <th className="py-1.5">OpenCost (설치 시)</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-3 text-white">CPU</td>
                    <td className="py-1.5 pr-3">Request 비율 × 노드 비용</td>
                    <td className="py-1.5"><span className="text-green-400">실제 사용량 × AWS 가격</span></td>
                  </tr>
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-3 text-white">Memory</td>
                    <td className="py-1.5 pr-3">Request 비율 × 노드 비용</td>
                    <td className="py-1.5"><span className="text-green-400">실제 사용량 × AWS 가격</span></td>
                  </tr>
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-3 text-white">Network</td>
                    <td className="py-1.5 pr-3 text-gray-500">미포함</td>
                    <td className="py-1.5"><span className="text-green-400">CNI 기반 전송량 추적</span></td>
                  </tr>
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-3 text-white">Storage (PV)</td>
                    <td className="py-1.5 pr-3 text-gray-500">미포함</td>
                    <td className="py-1.5"><span className="text-green-400">PVC → EBS 비용 매핑</span></td>
                  </tr>
                  <tr className="border-b border-navy-700">
                    <td className="py-1.5 pr-3 text-white">GPU</td>
                    <td className="py-1.5 pr-3 text-gray-500">미포함</td>
                    <td className="py-1.5"><span className="text-green-400">GPU 사용 시간 추적</span></td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 text-white">Data Source</td>
                    <td className="py-1.5 pr-3">Steampipe kubernetes_pod</td>
                    <td className="py-1.5">Prometheus + Metrics Server</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-gray-400 text-xs">
                {data?.opencostEnabled
                  ? '✅ OpenCost is configured — more accurate cost data available via API.'
                  : '⚠️ Currently using Request-based estimation. Install OpenCost for actual usage data: scripts/06f-setup-opencost.sh'}
              </p>
            </div>

            {/* Request-based Method / Request 기반 방식 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Method A: Request-based (Default) / Request 기반 (기본)</h4>
              <div className="bg-navy-900 rounded p-3 font-mono text-xs space-y-1">
                <p><span className="text-purple-400">CPU Ratio</span> = Pod CPU Request / Node Allocatable CPU</p>
                <p><span className="text-purple-400">Memory Ratio</span> = Pod Memory Request / Node Allocatable Memory</p>
                <p><span className="text-yellow-400">Pod Daily Cost</span> = (CPU Ratio × 0.5 + Memory Ratio × 0.5) × Node Hourly Rate × 24h</p>
              </div>
              <p className="mt-1 text-gray-400 text-xs">
                노드 비용을 CPU 50% + Memory 50% 비율로 각 Pod에 분배합니다.
              </p>
            </div>

            {/* OpenCost Method / OpenCost 방식 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Method B: OpenCost (Prometheus) / OpenCost 방식</h4>
              <div className="bg-navy-900 rounded p-3 font-mono text-xs space-y-1">
                <p><span className="text-purple-400">CPU Cost</span> = Actual CPU Usage (cores) × AWS EC2 vCPU Price</p>
                <p><span className="text-purple-400">Memory Cost</span> = Actual Memory Usage (bytes) × AWS EC2 Memory Price</p>
                <p><span className="text-purple-400">Network Cost</span> = Cross-AZ/Region Transfer × Data Transfer Price</p>
                <p><span className="text-purple-400">Storage Cost</span> = PVC Provisioned Size × EBS Volume Price</p>
                <p><span className="text-yellow-400">Pod Total Cost</span> = CPU + Memory + Network + Storage + GPU</p>
              </div>
              <p className="mt-1 text-gray-400 text-xs">
                Prometheus가 수집한 실제 사용량 메트릭과 AWS 가격 정보를 결합하여 5가지 비용 항목을 계산합니다.
                Install: <code className="text-cyan-400">bash scripts/06f-setup-opencost.sh</code>
              </p>
            </div>

            {/* Example / 예시 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Example (Request-based) / 예시</h4>
              <div className="bg-navy-900 rounded p-3 text-xs space-y-1">
                <p className="text-gray-400">Pod: 0.5 vCPU request, 512 MB memory request</p>
                <p className="text-gray-400">Node: m5.xlarge (4 vCPU, 16 GB allocatable), $0.236/hr</p>
                <p>CPU Ratio: 0.5 / 4 = 0.125</p>
                <p>Memory Ratio: 512 / 16384 = 0.03125</p>
                <p>Daily Cost: (0.125 × 0.5 + 0.03125 × 0.5) × $0.236 × 24 = <span className="text-yellow-400 font-medium">$0.442/day</span></p>
              </div>
            </div>

            {/* EC2 Pricing / EC2 가격 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">EC2 Pricing (ap-northeast-2, on-demand) / EC2 가격</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {[
                  ['m5.large', '$0.118'], ['m5.xlarge', '$0.236'], ['m6g.large', '$0.100'], ['c5.xlarge', '$0.196'],
                  ['r5.large', '$0.152'], ['t3.large', '$0.104'], ['t4g.large', '$0.086'], ['c6g.xlarge', '$0.166'],
                ].map(([type, price]) => (
                  <div key={type} className="bg-navy-700 rounded px-2 py-1">
                    <span className="text-cyan-400">{type}</span>: <span className="text-green-400">{price}</span>/hr
                  </div>
                ))}
              </div>
            </div>

            {/* Notes / 참고 */}
            <div>
              <h4 className="text-cyan-400 font-medium mb-2">Notes / 참고 사항</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li><strong>Request 기반</strong>: 리소스 요청 기준 추정 — 실제 사용량과 차이 있음</li>
                <li><strong>OpenCost</strong>: Prometheus 실제 메트릭 기반 — Network, Storage, GPU 포함</li>
                <li>Pods without resource requests show $0.00 in Request mode (Request 모드에서 리소스 요청 없는 Pod는 $0.00)</li>
                <li>EC2 on-demand pricing used — Spot/RI not reflected (온디맨드 가격 — Spot/RI 미반영)</li>
                <li>OpenCost Network cost: cross-AZ transfer only, same-AZ is free (OpenCost 네트워크: cross-AZ만, 같은 AZ는 무료)</li>
                <li>OpenCost Storage cost: PVC-based only, EmptyDir/HostPath excluded (PVC만, 임시 스토리지 제외)</li>
                <li>Config: <code className="text-cyan-400">data/config.json</code> → opencostEndpoint for OpenCost API</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
