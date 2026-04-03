'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RefreshCw, Search, Timer, TimerOff } from 'lucide-react';
import K9sClusterHeader from '@/components/k8s/K9sClusterHeader';
import K9sResourceTable from '@/components/k8s/K9sResourceTable';
import K9sDetailPanel from '@/components/k8s/K9sDetailPanel';
import NamespaceFilter from '@/components/k8s/NamespaceFilter';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAccountContext } from '@/contexts/AccountContext';


interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

const NODE_QUERY = `
  SELECT
    name, capacity_cpu as cpu_capacity, capacity_memory as memory_capacity,
    allocatable_cpu, allocatable_memory, context_name
  FROM kubernetes_node
`;

const POD_REQUESTS_QUERY = `
  SELECT
    p.node_name,
    c->'resources'->'requests'->>'cpu' AS cpu_req,
    c->'resources'->'requests'->>'memory' AS mem_req,
    p.context_name
  FROM
    kubernetes_pod p,
    jsonb_array_elements(p.containers) AS c
  WHERE
    p.phase = 'Running' AND p.node_name IS NOT NULL
`;

// Parse K8s CPU (e.g. "8" → 8, "7910m" → 7.91)
function parseCpu(cpu: any): number {
  if (!cpu) return 0;
  const s = String(cpu).trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  return parseFloat(s) || 0;
}

// Extract cluster name from kubeconfig context_name
// e.g. "arn:aws:eks:ap-northeast-2:123456789012:cluster/my-cluster" → "my-cluster"
function extractClusterName(ctx: string): string {
  if (!ctx) return '';
  const m = ctx.match(/\/([^/]+)$/);
  return m ? m[1] : ctx;
}

// Parse K8s memory to MiB
function parseMiB(mem: any): number {
  if (!mem) return 0;
  const s = String(mem);
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti)?$/i);
  if (!match) return parseInt(s) || 0;
  let v = parseFloat(match[1]);
  const u = (match[2] || '').toLowerCase();
  if (u === 'ki') v = v / 1024;
  else if (u === 'gi') v = v * 1024;
  else if (u === 'ti') v = v * 1024 * 1024;
  return Math.round(v);
}

// formatMem used by K9sClusterHeader via memory_capacity field

const tabConfig: Record<string, { query: string; label: string; columns: { key: string; label: string }[] }> = {
  pods: {
    query: k8sQ.podList,
    label: 'Pods',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'phase', label: 'STATUS' },
      { key: 'node_name', label: 'NODE' },
      { key: 'creation_timestamp', label: 'AGE' },
    ],
  },
  deployments: {
    query: k8sQ.deploymentList,
    label: 'Deploy',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'replicas', label: 'DESIRED' },
      { key: 'available_replicas', label: 'AVAILABLE' },
      { key: 'ready_replicas', label: 'READY' },
    ],
  },
  services: {
    query: k8sQ.serviceList,
    label: 'SVC',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'type', label: 'TYPE' },
      { key: 'cluster_ip', label: 'CLUSTER-IP' },
      { key: 'creation_timestamp', label: 'AGE' },
    ],
  },
  replicasets: {
    query: k8sQ.replicasetList,
    label: 'RS',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'replicas', label: 'DESIRED' },
      { key: 'ready_replicas', label: 'READY' },
      { key: 'available_replicas', label: 'AVAILABLE' },
    ],
  },
  daemonsets: {
    query: k8sQ.daemonsetList,
    label: 'DS',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'desired_number_scheduled', label: 'DESIRED' },
      { key: 'current_number_scheduled', label: 'CURRENT' },
      { key: 'number_ready', label: 'READY' },
    ],
  },
  statefulsets: {
    query: k8sQ.statefulsetList,
    label: 'STS',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'replicas', label: 'DESIRED' },
      { key: 'ready_replicas', label: 'READY' },
    ],
  },
  jobs: {
    query: k8sQ.jobList,
    label: 'Jobs',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'active', label: 'ACTIVE' },
      { key: 'succeeded', label: 'SUCCEEDED' },
      { key: 'failed', label: 'FAILED' },
    ],
  },
  configmaps: {
    query: k8sQ.configmapList,
    label: 'CM',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'creation_timestamp', label: 'AGE' },
    ],
  },
  secrets: {
    query: k8sQ.secretList,
    label: 'Sec',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'type', label: 'TYPE' },
      { key: 'creation_timestamp', label: 'AGE' },
    ],
  },
  pvcs: {
    query: k8sQ.pvcList,
    label: 'PVC',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'phase', label: 'STATUS' },
      { key: 'storage_class', label: 'STORAGECLASS' },
      { key: 'capacity', label: 'CAPACITY' },
    ],
  },
};

const TAB_KEYS = Object.keys(tabConfig);

export default function K8sExplorerPage() {
  const { t } = useLanguage();
  const { currentAccountId } = useAccountContext();

  const [activeTab, setActiveTab] = useState('pods');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [selectedRow, setSelectedRow] = useState<number | undefined>(undefined);
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showNodes, setShowNodes] = useState(false);
  const [clusterFilter, setClusterFilter] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const currentConfig = tabConfig[activeTab];
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            resources: currentConfig?.query ?? '',
            nodes: NODE_QUERY,
            podRequests: POD_REQUESTS_QUERY,
            eksClusters: k8sQ.eksClusterList,
          },
        }),
      });
      setData(await res.json());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, [activeTab, currentAccountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchData(), 30000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  // Reset selection on tab change
  useEffect(() => {
    setSelectedRow(undefined);
    setSelectedResource(null);
    setStatusFilter('');
    setNodeFilter('');
    setCurrentPage(1);
  }, [activeTab]);

  const resources = data.resources?.rows || [];

  // Aggregate pod requests per node / 노드별 Pod 요청 집계
  const podReqRows = data.podRequests?.rows || [];
  const reqMap: Record<string, { cpuReq: number; memReqMiB: number }> = {};
  podReqRows.forEach((r: any) => {
    if (clusterFilter && extractClusterName(r.context_name || '') !== clusterFilter) return;
    const node = String(r.node_name || '');
    if (!node) return;
    if (!reqMap[node]) reqMap[node] = { cpuReq: 0, memReqMiB: 0 };
    if (r.cpu_req) reqMap[node].cpuReq += parseCpu(r.cpu_req);
    if (r.mem_req) reqMap[node].memReqMiB += parseMiB(r.mem_req);
  });

  const allNodes = (data.nodes?.rows || []).map((n: any) => {
    const capCpu = parseCpu(n.cpu_capacity);
    const capMiB = parseMiB(n.memory_capacity);
    const req = reqMap[n.name] || { cpuReq: 0, memReqMiB: 0 };
    return {
      name: n.name,
      context_name: n.context_name || '',
      cpu_capacity: capCpu,
      memory_capacity: capMiB,
      cpu_percent: capCpu > 0 ? (req.cpuReq / capCpu) * 100 : 0,
      memory_percent: capMiB > 0 ? (req.memReqMiB / capMiB) * 100 : 0,
    };
  });
  const nodes = clusterFilter
    ? allNodes.filter(n => extractClusterName(n.context_name) === clusterFilter)
    : allNodes;

  // Extract unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set<string>();
    resources.forEach((r: any) => {
      if (r.namespace) nsSet.add(r.namespace);
    });
    return Array.from(nsSet).sort();
  }, [resources]);

  // Filter option lists / 필터 옵션 목록
  const statusList = useMemo(() => {
    const statuses = new Set<string>();
    resources.forEach((r: any) => {
      const s = r.phase || r.status || '';
      if (s) statuses.add(String(s));
    });
    return Array.from(statuses).sort();
  }, [resources]);
  const nodeList = useMemo(() => {
    const nds = new Set<string>();
    resources.forEach((r: any) => { if (r.node_name) nds.add(String(r.node_name)); });
    return Array.from(nds).sort();
  }, [resources]);

  // Client-side filtering / 클라이언트 필터링
  const filteredResources = useMemo(() => {
    let filtered = resources;
    if (clusterFilter) {
      filtered = filtered.filter((r: any) => extractClusterName(r.context_name || '') === clusterFilter);
    }
    if (selectedNamespace) {
      filtered = filtered.filter((r: any) => r.namespace === selectedNamespace);
    }
    if (statusFilter) {
      filtered = filtered.filter((r: any) => (r.phase || r.status || '') === statusFilter);
    }
    if (nodeFilter) {
      filtered = filtered.filter((r: any) => String(r.node_name || '') === nodeFilter);
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter((r: any) =>
        Object.values(r).some((v) =>
          String(v ?? '').toLowerCase().includes(lower)
        )
      );
    }
    return filtered;
  }, [resources, clusterFilter, selectedNamespace, statusFilter, nodeFilter, searchText]);

  const hasFilters = clusterFilter || selectedNamespace || statusFilter || nodeFilter || searchText;
  const clearAllFilters = () => { setClusterFilter(''); setSelectedNamespace(''); setStatusFilter(''); setNodeFilter(''); setSearchText(''); setCurrentPage(1); };

  // Pagination / 페이지네이션
  const totalPages = Math.max(1, Math.ceil(filteredResources.length / pageSize));
  const paginatedResources = filteredResources.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  // Reset page when filters change / 필터 변경 시 페이지 리셋
  useMemo(() => { setCurrentPage(1); }, [clusterFilter, selectedNamespace, statusFilter, nodeFilter, searchText]);

  const handleRowSelect = (row: any, index: number) => {
    if (selectedRow === index) {
      setSelectedRow(undefined);
      setSelectedResource(null);
    } else {
      setSelectedRow(index);
      setSelectedResource(row);
    }
  };

  const currentConfig = tabConfig[activeTab];

  return (
    <div className="min-h-screen bg-[#0a0e1a] font-mono text-gray-300 flex flex-col">
      {/* Top Bar with Cluster info / 클러스터 정보 포함 상단 바 */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d1220] border-b border-navy-700">
        <div className="flex items-center gap-3">
          <span className="text-accent-green font-bold text-lg tracking-wider">K9s</span>
          <span className="text-gray-600">|</span>
          <span className="text-accent-cyan text-sm">{t('k8s.explorer')}</span>
          <span className="text-gray-600">|</span>
          {/* Cluster selector / 클러스터 선택 */}
          {(data.eksClusters?.rows || []).length > 0 && (
            <select value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)}
              className="bg-navy-800 border border-navy-600 rounded px-2 py-0.5 text-xs text-accent-green font-mono focus:border-accent-cyan/50 focus:outline-none">
              <option value="">All Clusters ({(data.eksClusters?.rows || []).length})</option>
              {(data.eksClusters?.rows || []).map((c: any) => (
                <option key={c.cluster_name} value={c.cluster_name}>
                  {c.cluster_name} (v{c.version})
                </option>
              ))}
            </select>
          )}
          <span className="text-gray-500 text-xs">
            {filteredResources.length} resources
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              autoRefresh
                ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                : 'bg-navy-800 text-gray-500 border border-navy-600 hover:text-gray-300'
            }`}
          >
            {autoRefresh ? <Timer size={12} /> : <TimerOff size={12} />}
            {autoRefresh ? 'Auto 30s' : 'Auto Off'}
          </button>
          <button
            onClick={() => fetchData(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-navy-800 text-gray-400 border border-navy-600 hover:text-white transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Cluster Header — collapsible / 접을 수 있는 클러스터 헤더 */}
      <div className="px-4 py-1">
        <button onClick={() => setShowNodes(!showNodes)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full">
          <span className={`transition-transform ${showNodes ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-accent-green font-mono">{nodes.length} Nodes</span>
          <span className="text-gray-600">— click to {showNodes ? 'collapse' : 'expand'}</span>
        </button>
        {showNodes && (
          <div className="mt-2">
            <K9sClusterHeader context="kubernetes-cluster" nodes={nodes} />
          </div>
        )}
      </div>

      {/* Resource Tabs */}
      <div className="px-4 py-1 flex items-center gap-1 overflow-x-auto border-b border-navy-700">
        {TAB_KEYS.map((key) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs rounded-t transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-navy-700 text-accent-cyan border-t border-x border-accent-cyan/40 font-bold'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-navy-800'
              }`}
            >
              {tabConfig[key].label}
            </button>
          );
        })}
      </div>

      {/* Filters / 필터 */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-navy-700/50">
        {/* Search / 검색 */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search..."
            className="bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-300 font-mono placeholder-gray-600 w-44 focus:outline-none focus:border-accent-cyan/50" />
        </div>
        {/* Namespace / 네임스페이스 */}
        <NamespaceFilter namespaces={namespaces} selected={selectedNamespace} onChange={setSelectedNamespace} />
        {/* Status / 상태 */}
        {statusList.length > 0 && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-navy-800 border border-navy-600 rounded-lg px-2 py-1.5 text-xs text-gray-300 font-mono focus:border-accent-cyan/50">
            <option value="">All Status</option>
            {statusList.map(s => <option key={s} value={s}>{s} ({resources.filter((r: any) => (r.phase || r.status || '') === s).length})</option>)}
          </select>
        )}
        {/* Node / 노드 */}
        {nodeList.length > 0 && (
          <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}
            className="bg-navy-800 border border-navy-600 rounded-lg px-2 py-1.5 text-xs text-gray-300 font-mono focus:border-accent-cyan/50">
            <option value="">All Nodes</option>
            {nodeList.map(n => <option key={n} value={n}>{n.split('.')[0]} ({resources.filter((r: any) => String(r.node_name || '') === n).length})</option>)}
          </select>
        )}
        {/* Clear / 초기화 */}
        {hasFilters && (
          <button onClick={clearAllFilters} className="text-[10px] text-gray-500 hover:text-white transition-colors">Clear</button>
        )}
        <span className="text-gray-600 text-xs ml-auto">
          /{currentConfig?.label?.toLowerCase()} [{filteredResources.length}/{resources.length}]
        </span>
      </div>

      {/* Resource Table */}
      <div className="flex-1 overflow-auto px-4 py-2">
        {loading && resources.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw size={24} className="animate-spin text-accent-cyan mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Loading resources...</p>
            </div>
          </div>
        ) : (
          <K9sResourceTable
            columns={currentConfig?.columns ?? []}
            data={paginatedResources}
            onSelect={handleRowSelect}
            selectedRow={selectedRow}
          />
        )}
      </div>

      {/* Pagination / 페이지네이션 */}
      {filteredResources.length > pageSize && (
        <div className="px-4 py-1.5 border-t border-navy-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">Rows/page:</span>
            {[25, 50, 100, 200].map(size => (
              <button key={size} onClick={() => { setPageSize(size); setCurrentPage(1); }}
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${pageSize === size ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-gray-600 hover:text-gray-300'}`}>
                {size}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="text-[10px] px-2 py-0.5 rounded bg-navy-800 border border-navy-600 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-mono">
              ◀ Prev
            </button>
            <span className="text-[10px] text-gray-500 font-mono">
              {currentPage} / {totalPages} ({filteredResources.length} total)
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="text-[10px] px-2 py-0.5 rounded bg-navy-800 border border-navy-600 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-mono">
              Next ▶
            </button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="px-4 py-1.5 bg-[#0d1220] border-t border-navy-700 flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-4">
          <span>
            <span className="text-accent-cyan">Tab</span> Switch Resource
          </span>
          <span>
            <span className="text-accent-cyan">Enter</span> Select
          </span>
          <span>
            <span className="text-accent-cyan">Esc</span> Close Detail
          </span>
          <span>
            <span className="text-accent-cyan">/</span> Filter
          </span>
        </div>
        <div className="flex items-center gap-3">
          {autoRefresh && (
            <span className="text-accent-green">
              ● auto-refresh
            </span>
          )}
          <span>{activeTab}:{selectedNamespace || 'all'}</span>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedResource && (
        <K9sDetailPanel
          resource={selectedResource}
          type={currentConfig?.label ?? activeTab}
          onClose={() => {
            setSelectedRow(undefined);
            setSelectedResource(null);
          }}
        />
      )}
    </div>
  );
}
