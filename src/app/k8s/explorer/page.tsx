'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RefreshCw, Search, Timer, TimerOff } from 'lucide-react';
import K9sClusterHeader from '@/components/k8s/K9sClusterHeader';
import K9sResourceTable from '@/components/k8s/K9sResourceTable';
import K9sDetailPanel from '@/components/k8s/K9sDetailPanel';
import NamespaceFilter from '@/components/k8s/NamespaceFilter';
import { queries as k8sQ } from '@/lib/queries/k8s';

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

const NODE_QUERY = `
  SELECT
    name, capacity_cpu as cpu_capacity, capacity_memory as memory_capacity
  FROM kubernetes_node
`;

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
  const [activeTab, setActiveTab] = useState('pods');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedRow, setSelectedRow] = useState<number | undefined>(undefined);
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const currentConfig = tabConfig[activeTab];
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            resources: currentConfig?.query ?? '',
            nodes: NODE_QUERY,
          },
        }),
      });
      setData(await res.json());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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
  }, [activeTab]);

  const resources = data.resources?.rows || [];
  const nodes = (data.nodes?.rows || []).map((n: any) => ({
    name: n.name,
    cpu_capacity: Number(n.cpu_capacity) || 0,
    memory_capacity: Number(n.memory_capacity) || 0,
  }));

  // Extract unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set<string>();
    resources.forEach((r: any) => {
      if (r.namespace) nsSet.add(r.namespace);
    });
    return Array.from(nsSet).sort();
  }, [resources]);

  // Client-side filtering
  const filteredResources = useMemo(() => {
    let filtered = resources;
    if (selectedNamespace) {
      filtered = filtered.filter((r: any) => r.namespace === selectedNamespace);
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
  }, [resources, selectedNamespace, searchText]);

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
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d1220] border-b border-navy-700">
        <div className="flex items-center gap-3">
          <span className="text-accent-green font-bold text-lg tracking-wider">K9s</span>
          <span className="text-gray-600">|</span>
          <span className="text-accent-cyan text-sm">Explorer</span>
          <span className="text-gray-600">|</span>
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

      {/* Cluster Header */}
      <div className="px-4 py-2">
        <K9sClusterHeader context="kubernetes-cluster" nodes={nodes} />
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

      {/* Filters */}
      <div className="px-4 py-2 flex items-center gap-3 border-b border-navy-700/50">
        <NamespaceFilter
          namespaces={namespaces}
          selected={selectedNamespace}
          onChange={setSelectedNamespace}
        />
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filter resources..."
            className="w-full bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 font-mono placeholder-gray-600 focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20"
          />
        </div>
        <span className="text-gray-600 text-xs ml-auto">
          /{currentConfig?.label?.toLowerCase()} [{filteredResources.length}]
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
            data={filteredResources}
            onSelect={handleRowSelect}
            selectedRow={selectedRow}
          />
        )}
      </div>

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
