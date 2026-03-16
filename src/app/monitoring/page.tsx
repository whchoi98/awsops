'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import LineChartCard from '@/components/charts/LineChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Activity, Cpu, HardDrive, Database, X, MemoryStick, Wifi, ArrowLeft, Calendar } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { queries as metQ } from '@/lib/queries/metrics';
import { useAccountContext } from '@/contexts/AccountContext';

type TabKey = 'ec2' | 'network' | 'memory' | 'ebs' | 'rds';

export default function MonitoringPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('ec2');
  const [selected, setSelected] = useState<any>(null);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailTitle, setDetailTitle] = useState('');
  const [networkData, setNetworkData] = useState<Record<string, any>>({});
  const [detailInstance, setDetailInstance] = useState<any>(null);
  const [detailMetrics, setDetailMetrics] = useState<Record<string, any[]>>({});
  const [detailMetricLoading, setDetailMetricLoading] = useState(false);
  const [dateRange, setDateRange] = useState('1h');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            ec2CpuLatest: metQ.ec2CpuLatest,
            ec2CpuHourly: metQ.ec2CpuHourly,
            ec2NetworkLatest: metQ.ec2NetworkLatest,
            ebsIopsLatest: metQ.ebsIopsLatest,
            ebsIopsHourly: metQ.ebsIopsHourly,
            rdsMetrics: metQ.rdsMetrics,
            rdsConnections: metQ.rdsConnections,
            rdsCpuDaily: metQ.rdsCpuDaily,
            k8sNodes: metQ.k8sNodeResources,
            k8sPodRes: metQ.k8sNodePodResources,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const DATE_RANGES = [
    { label: '1h', range: '1 hour', period: 300 },
    { label: '6h', range: '6 hours', period: 300 },
    { label: '24h', range: '1 day', period: 3600 },
    { label: '7d', range: '7 days', period: 86400 },
    { label: '30d', range: '30 days', period: 86400 },
  ];

  const fetchInstanceMetrics = useCallback(async (instance: any, range?: string) => {
    const r = range || dateRange;
    const config = DATE_RANGES.find(d => d.label === r) || DATE_RANGES[0];
    setDetailMetricLoading(true);
    setDetailInstance(instance);
    try {
      const sql = metQ.ec2DetailMetrics
        .replace('{instance_id}', instance.instance_id)
        .replace('{period}', String(config.period))
        .replace('{range}', config.range);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { metrics: sql } }),
      });
      const result = await res.json();
      const rows = result.metrics?.rows || [];
      const grouped: Record<string, any[]> = {};
      rows.forEach((m: any) => {
        if (!grouped[m.metric_name]) grouped[m.metric_name] = [];
        grouped[m.metric_name].push(m);
      });
      setDetailMetrics(grouped);
    } catch {} finally { setDetailMetricLoading(false); }
  }, [dateRange]);

  const handleDateRangeChange = (r: string) => {
    setDateRange(r);
    if (detailInstance) fetchInstanceMetrics(detailInstance, r);
  };

  const get = (key: string) => data[key]?.rows || [];

  const ec2Cpu = get('ec2CpuLatest');
  const ec2CpuHourly = get('ec2CpuHourly');
  const ebsLatest = get('ebsIopsLatest');
  const ebsHourly = get('ebsIopsHourly');
  const rdsMetrics = get('rdsMetrics');
  const rdsConns = get('rdsConnections');
  const rdsCpuDaily = get('rdsCpuDaily');
  const k8sNodes = get('k8sNodes');
  const k8sPodRes = get('k8sPodRes');
  const ec2Network = get('ec2NetworkLatest');

  // Summary stats
  const avgCpuAll = ec2Cpu.length > 0
    ? (ec2Cpu.reduce((s: number, r: any) => s + (Number(r.avg_cpu) || 0), 0) / ec2Cpu.length).toFixed(1) : '0';
  const maxCpuInstance = ec2Cpu.reduce((max: any, r: any) => (Number(r.max_cpu) > Number(max?.max_cpu || 0) ? r : max), ec2Cpu[0]);
  const highCpuCount = ec2Cpu.filter((r: any) => Number(r.avg_cpu) > 80).length;

  // K8s memory
  const parseKi = (v: string) => { if (!v) return 0; return parseInt(v.replace('Ki', '')) / 1048576; }; // to GB
  const totalCapMem = k8sNodes.reduce((s: number, n: any) => s + parseKi(n.cap_mem), 0);
  const totalAllocMem = k8sNodes.reduce((s: number, n: any) => s + parseKi(n.alloc_mem), 0);

  const ec2CpuBar = [...ec2Cpu]
    .sort((a: any, b: any) => Number(b.avg_cpu) - Number(a.avg_cpu))
    .slice(0, 15)
    .map((r: any) => ({ name: (r.name || r.instance_id.slice(-8)).slice(0, 15), value: Number(r.avg_cpu) }));

  // RDS combined
  const rdsCombined = useMemo(() => {
    const map: Record<string, any> = {};
    rdsMetrics.forEach((r: any) => { map[r.db_instance_identifier] = { ...r }; });
    rdsConns.forEach((r: any) => {
      if (map[r.db_instance_identifier]) {
        map[r.db_instance_identifier].avg_connections = r.avg_connections;
        map[r.db_instance_identifier].max_connections = r.max_connections;
      }
    });
    return Object.values(map);
  }, [rdsMetrics, rdsConns]);

  // Network 탭 활성화 시 모든 인스턴스의 In/Out 자동 조회
  // Auto-fetch NetworkIn/Out for all instances when Network tab is active
  const [networkLoading, setNetworkLoading] = useState(false);
  useEffect(() => {
    if (activeTab !== 'network' || ec2Network.length === 0) return;
    const unfetched = ec2Network.filter((r: any) => !networkData[r.instance_id]);
    if (unfetched.length === 0) return;
    setNetworkLoading(true);
    const fetchAll = async () => {
      for (const inst of unfetched.slice(0, 20)) {
        const id = inst.instance_id;
        try {
          const inSql = metQ.ec2NetworkDetail.replace('{metric}', 'NetworkIn').replace('{instance_id}', id);
          const outSql = metQ.ec2NetworkDetail.replace('{metric}', 'NetworkOut').replace('{instance_id}', id);
          const res = await fetch('/awsops/api/steampipe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries: { netIn: inSql, netOut: outSql } }),
          });
          const result = await res.json();
          const cached = { netIn: result.netIn?.rows || [], netOut: result.netOut?.rows || [] };
          setNetworkData((prev: any) => ({ ...prev, [id]: cached }));
        } catch {}
      }
      setNetworkLoading(false);
    };
    fetchAll();
  }, [activeTab, ec2Network.length]);

  // 네트워크 데이터가 있는 인스턴스의 최신 In/Out 값 계산
  // Calculate latest In/Out for instances with cached network data
  const ec2NetworkWithStats = useMemo(() => {
    return ec2Network.map((inst: any) => {
      const nd = networkData[inst.instance_id];
      if (!nd) return { ...inst, net_in_mb: null, net_out_mb: null };
      const latestIn = nd.netIn?.[0]?.avg_mb || 0;
      const latestOut = nd.netOut?.[0]?.avg_mb || 0;
      return { ...inst, net_in_mb: Number(latestIn), net_out_mb: Number(latestOut) };
    });
  }, [ec2Network, networkData]);

  // Fetch network data for a specific instance
  const fetchNetwork = async (instanceId: string) => {
    if (networkData[instanceId]) {
      showNetworkDetail(instanceId, networkData[instanceId]);
      return;
    }
    setSelected({ instanceId, type: 'network' });
    setDetailData([]);
    setDetailTitle(`${instanceId} - Loading...`);
    try {
      const inSql = metQ.ec2NetworkDetail.replace('{metric}', 'NetworkIn').replace('{instance_id}', instanceId);
      const outSql = metQ.ec2NetworkDetail.replace('{metric}', 'NetworkOut').replace('{instance_id}', instanceId);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { netIn: inSql, netOut: outSql } }),
      });
      const result = await res.json();
      const cached = { netIn: result.netIn?.rows || [], netOut: result.netOut?.rows || [] };
      setNetworkData((prev: any) => ({ ...prev, [instanceId]: cached }));
      showNetworkDetail(instanceId, cached);
    } catch {
      setDetailTitle(`${instanceId} - Error loading network data`);
    }
  };

  const showNetworkDetail = (instanceId: string, nd: any) => {
    setSelected({ instanceId, type: 'network' });
    const combined = nd.netIn.slice(0, 24).reverse().map((r: any) => ({
      name: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: Number(r.avg_mb) || 0,
    }));
    setDetailData(combined);
    setDetailTitle(`${instanceId} - Network In (MB/h)`);
  };

  const showDetail = (instanceId: string, type: string) => {
    setSelected({ instanceId, type });
    if (type === 'ec2') {
      const hourly = ec2CpuHourly.filter((r: any) => r.instance_id === instanceId);
      setDetailData(hourly.slice(0, 24).reverse().map((r: any) => ({
        name: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: Number(r.avg_cpu),
      })));
      setDetailTitle(`${instanceId} - CPU Utilization (Hourly)`);
    } else if (type === 'ebs') {
      const hourly = ebsHourly.filter((r: any) => r.volume_id === instanceId);
      setDetailData(hourly.slice(0, 24).reverse().map((r: any) => ({
        name: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: Number(r.read_iops) || 0,
      })));
      setDetailTitle(`${instanceId} - Read IOPS (Hourly)`);
    } else if (type === 'rds') {
      const daily = rdsCpuDaily.filter((r: any) => r.db_instance_identifier === instanceId);
      setDetailData(daily.slice(0, 14).reverse().map((r: any) => ({
        name: new Date(r.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        value: Number(r.avg_cpu),
      })));
      setDetailTitle(`${instanceId} - CPU Utilization (Daily)`);
    }
  };

  const fetchRdsMemory = async (dbId: string) => {
    setSelected({ instanceId: dbId, type: 'rdsmem' });
    setDetailData([]);
    setDetailTitle(`${dbId} - FreeableMemory (Loading...)`);
    try {
      const sql = metQ.rdsMemoryDetail.replace('{db_id}', dbId);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { mem: sql } }),
      });
      const result = await res.json();
      const rows = result.mem?.rows || [];
      setDetailData(rows.slice(0, 24).reverse().map((r: any) => ({
        name: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: Number(r.avg_free_mem_gb) || 0,
      })));
      setDetailTitle(`${dbId} - FreeableMemory (GB, Hourly)`);
    } catch {
      setDetailTitle(`${dbId} - Error loading memory data`);
    }
  };

  const showNodeDetail = (nodeName: string) => {
    const podRes = k8sPodRes.find((r: any) => r.node_name === nodeName);
    const node = k8sNodes.find((r: any) => r.name === nodeName);
    if (!node) return;

    const capMem = parseKi(node.cap_mem);
    const allocMem = parseKi(node.alloc_mem);
    const reservedMem = capMem - allocMem;

    setSelected({ instanceId: nodeName.split('.')[0], type: 'k8snode' });
    // Show memory breakdown as bar chart
    setDetailData([
      { name: 'Capacity', value: Number(capMem.toFixed(1)) },
      { name: 'Allocatable', value: Number(allocMem.toFixed(1)) },
      { name: 'Reserved', value: Number(reservedMem.toFixed(1)) },
    ]);
    setDetailTitle(`${nodeName.split('.')[0]} - Memory (GB) | Pods: ${podRes?.pod_count || '?'} | CPU Req: ${podRes?.total_cpu_req_m || '?'}m`);
  };

  const cpuColor = (v: number) => v > 80 ? 'text-accent-red' : v > 50 ? 'text-accent-orange' : 'text-accent-green';

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'ec2', label: `EC2 CPU (${ec2Cpu.length})`, icon: Cpu },
    { key: 'network', label: `Network (${ec2Network.length})`, icon: Wifi },
    { key: 'memory', label: `Memory (${k8sNodes.length} nodes)`, icon: MemoryStick },
    { key: 'ebs', label: `EBS IOPS (${ebsLatest.length})`, icon: HardDrive },
    { key: 'rds', label: `RDS (${rdsMetrics.length})`, icon: Database },
  ];

  // Instance detail view / 인스턴스 상세 메트릭 뷰
  if (detailInstance) {
    const formatVal = (name: string, v: number) => {
      if (name === 'CPUUtilization') return `${v.toFixed(1)}%`;
      if (name === 'NetworkIn' || name === 'NetworkOut') return `${(v / 1024 / 1024).toFixed(2)} MB`;
      if (name === 'NetworkPacketsIn' || name === 'NetworkPacketsOut') return `${(v / 1000).toFixed(1)}K`;
      return v.toFixed(0);
    };
    const metricColor: Record<string, string> = {
      CPUUtilization: '#ef4444', NetworkIn: '#00d4ff', NetworkOut: '#a855f7',
      DiskReadOps: '#f59e0b', DiskWriteOps: '#ec4899',
      NetworkPacketsIn: '#00ff88', NetworkPacketsOut: '#f59e0b',
    };

    return (
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Back + Instance info / 뒤로가기 + 인스턴스 정보 */}
        <div className="flex items-center gap-4">
          <button onClick={() => { setDetailInstance(null); setDetailMetrics({}); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-800 border border-navy-600 text-gray-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="text-lg font-bold text-white font-mono">{detailInstance.name || detailInstance.instance_id}</h1>
            <p className="text-xs text-gray-500">
              {isMultiAccount && detailInstance.account_id && <span className="text-accent-cyan">{detailInstance.account_id} · </span>}
              {detailInstance.instance_id} · {detailInstance.instance_type} · CPU: {detailInstance.avg_cpu}%
            </p>
          </div>
          {/* Date Range / 기간 필터 */}
          <div className="ml-auto flex items-center gap-1">
            <Calendar size={14} className="text-gray-500" />
            {DATE_RANGES.map(d => (
              <button key={d.label} onClick={() => handleDateRangeChange(d.label)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${dateRange === d.label ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40' : 'bg-navy-800 text-gray-400 border border-navy-600 hover:text-white'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {detailMetricLoading && (
          <div className="w-full h-1 bg-navy-700 rounded-full overflow-hidden">
            <div className="h-full bg-accent-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        )}

        {/* Metric Charts / 메트릭 차트 */}
        {Object.keys(detailMetrics).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(detailMetrics).map(([name, points]) => {
              const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              const latest = points[0];
              const chartData = sorted.map(p => ({
                name: dateRange === '7d' || dateRange === '30d'
                  ? new Date(p.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: Math.round((Number(p.average) || 0) * 100) / 100,
              }));
              return (
                <div key={name} className="bg-navy-800 rounded-lg border border-navy-600 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">{name}</h3>
                    <div className="text-xs font-mono text-gray-400">
                      Avg: <span className="text-white">{formatVal(name, Number(latest?.average) || 0)}</span>
                      <span className="mx-1">·</span>
                      Max: <span className="text-accent-orange">{formatVal(name, Number(latest?.maximum) || 0)}</span>
                    </div>
                  </div>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} width={45} />
                        <RTooltip contentStyle={{ background: '#0f1629', border: '1px solid #1a2540', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#6b7280' }} />
                        <Line type="monotone" dataKey="value" stroke={metricColor[name] || '#00d4ff'} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !detailMetricLoading ? (
          <div className="text-center text-gray-500 py-10">
            <Activity size={32} className="mx-auto mb-3 text-gray-600" />
            <p>No metric data available for this instance.</p>
            <p className="text-xs mt-1">CloudWatch detailed monitoring may not be enabled.</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Performance Monitor" subtitle="CPU, Memory, Network, Disk I/O Metrics" onRefresh={() => fetchData(true)} />

      {/* Loading progress bar / 로딩 프로그레스 바 */}
      {loading && (
        <div className="w-full h-1 bg-navy-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Avg CPU (EC2)" value={`${avgCpuAll}%`} icon={Cpu}
          color={Number(avgCpuAll) > 80 ? 'red' : Number(avgCpuAll) > 50 ? 'orange' : 'green'} />
        <StatsCard label="High CPU (>80%)" value={highCpuCount} icon={Activity}
          color={highCpuCount > 0 ? 'red' : 'green'} />
        <StatsCard label="Peak CPU" value={maxCpuInstance ? `${maxCpuInstance.max_cpu}%` : '--'} icon={Cpu} color="orange"
          change={maxCpuInstance?.name?.slice(0, 20) || maxCpuInstance?.instance_id?.slice(-8)} />
        <StatsCard label="K8s Memory" value={`${totalCapMem.toFixed(0)} GB`} icon={MemoryStick} color="purple"
          change={`${totalAllocMem.toFixed(0)} GB allocatable`} />
        <StatsCard label="K8s Nodes" value={k8sNodes.length} icon={Activity} color="cyan" />
        <StatsCard label="Monitored" value={ec2Cpu.length + ebsLatest.length + rdsMetrics.length} icon={Activity} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChartCard title="EC2 CPU Utilization (Top 15)" data={ec2CpuBar} color="#00d4ff" />
        {k8sNodes.length > 0 && (
          <BarChartCard title="K8s Node Memory Capacity (GB)" data={k8sNodes.map((n: any) => ({
            name: n.name.split('.')[0].slice(0, 15),
            value: Number(parseKi(n.cap_mem).toFixed(1)),
          }))} color="#a855f7" />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-navy-800 rounded-lg border border-navy-600 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-gray-400 hover:text-white hover:bg-navy-700'
            }`}>
            <tab.icon size={14} />{tab.label}
          </button>
        ))}
      </div>

      {/* EC2 CPU */}
      {activeTab === 'ec2' && (
        <DataTable columns={[
          { key: 'name', label: 'Instance', render: (v: string, row: any) => v || row.instance_id?.slice(-12) },
          { key: 'instance_type', label: 'Type' },
          { key: 'avg_cpu', label: 'Avg CPU %', render: (v: number) => <span className={`font-mono font-bold ${cpuColor(v)}`}>{v}%</span> },
          { key: 'max_cpu', label: 'Max CPU %', render: (v: number) => <span className={`font-mono ${cpuColor(v)}`}>{v}%</span> },
          { key: 'timestamp', label: 'Time', render: (v: string) => v ? new Date(v).toLocaleTimeString() : '--' },
        ]} data={loading && !ec2Cpu.length ? undefined : ec2Cpu}
           onRowClick={(row) => fetchInstanceMetrics(row)} />
      )}

      {/* Network In/Out */}
      {activeTab === 'network' && (
        <>
          <p className="text-xs text-gray-500">
            {networkLoading ? '네트워크 데이터 로딩 중... / Loading network data...' : '인스턴스별 Network In/Out (MB/h). 클릭하면 시계열 그래프 표시. / Per-instance Network In/Out. Click for time series.'}
          </p>
          <DataTable columns={[
            { key: 'name', label: 'Instance', render: (v: string, row: any) => v || row.instance_id?.slice(-12) },
            { key: 'instance_type', label: 'Type' },
            { key: 'private_ip_address', label: 'Private IP' },
            { key: 'net_in_mb', label: 'Net In (MB/h)', render: (v: any) => (
              v !== null && v !== undefined ? <span className="font-mono text-accent-cyan">{Number(v).toFixed(2)}</span> : <span className="text-gray-600 text-xs">{networkLoading ? '...' : '-'}</span>
            )},
            { key: 'net_out_mb', label: 'Net Out (MB/h)', render: (v: any) => (
              v !== null && v !== undefined ? <span className="font-mono text-accent-green">{Number(v).toFixed(2)}</span> : <span className="text-gray-600 text-xs">{networkLoading ? '...' : '-'}</span>
            )},
            { key: 'instance_id', label: 'Detail', render: (_v: string, row: any) => (
              <button className="text-xs text-accent-cyan hover:underline font-medium" onClick={(e) => { e.stopPropagation(); fetchNetwork(row.instance_id); }}>
                Chart
              </button>
            )},
          ]} data={loading && !ec2NetworkWithStats.length ? undefined : ec2NetworkWithStats}
             onRowClick={(row) => fetchNetwork(row.instance_id)} />
        </>
      )}

      {/* Memory */}
      {activeTab === 'memory' && (
        <>
          {k8sNodes.length > 0 && (<>
            <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider">K8s Node Resources (click for detail)</h3>
            <DataTable columns={[
              { key: 'name', label: 'Node', render: (v: string) => v.split('.')[0] },
              { key: 'cap_cpu', label: 'CPU Cap' },
              { key: 'alloc_cpu', label: 'CPU Alloc' },
              { key: 'cap_mem', label: 'Mem Cap', render: (v: string) => `${parseKi(v).toFixed(1)} GB` },
              { key: 'alloc_mem', label: 'Mem Alloc', render: (v: string) => `${parseKi(v).toFixed(1)} GB` },
              { key: 'cap_pods', label: 'Pods' },
              { key: 'cap_mem', label: 'Reserved %', render: (v: string, row: any) => {
                const cap = parseKi(v);
                const alloc = parseKi(row.alloc_mem);
                const reserved = cap - alloc;
                const pct = cap > 0 ? ((reserved / cap) * 100).toFixed(0) : '0';
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2.5 bg-navy-900 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${Number(pct) > 80 ? 'bg-accent-red' : Number(pct) > 50 ? 'bg-accent-orange' : 'bg-accent-green'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-gray-400">{pct}%</span>
                  </div>
                );
              }},
            ]} data={k8sNodes}
               onRowClick={(row) => showNodeDetail(row.name)} />
          </>)}

          {rdsCombined.length > 0 && (<>
            <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mt-4">RDS Memory (click for FreeableMemory graph)</h3>
            <DataTable columns={[
              { key: 'db_instance_identifier', label: 'Instance' },
              { key: 'engine', label: 'Engine' },
              { key: 'db_instance_class', label: 'Class' },
              { key: 'avg_cpu', label: 'CPU %', render: (v: number) => <span className={`font-mono ${cpuColor(v)}`}>{v}%</span> },
              { key: 'avg_connections', label: 'Connections', render: (v: any) => v ?? '--' },
            ]} data={rdsCombined}
               onRowClick={(row) => fetchRdsMemory(row.db_instance_identifier)} />
          </>)}

          {k8sNodes.length === 0 && rdsCombined.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <MemoryStick size={40} className="mx-auto mb-3 text-gray-600" />
              <p>No memory data available.</p>
              <p className="text-xs mt-1">EC2 memory requires CloudWatch Agent. K8s and RDS memory shown when available.</p>
            </div>
          )}
        </>
      )}

      {/* EBS IOPS */}
      {activeTab === 'ebs' && (
        <DataTable columns={[
          { key: 'name', label: 'Volume', render: (v: string, row: any) => v || row.volume_id?.slice(-12) },
          { key: 'volume_type', label: 'Type' },
          { key: 'size', label: 'Size (GB)' },
          { key: 'state', label: 'State' },
          { key: 'read_iops', label: 'Read IOPS', render: (v: number) => <span className="font-mono text-accent-cyan">{v}</span> },
          { key: 'timestamp', label: 'Time', render: (v: string) => v ? new Date(v).toLocaleTimeString() : '--' },
        ]} data={loading && !ebsLatest.length ? undefined : ebsLatest}
           onRowClick={(row) => showDetail(row.volume_id, 'ebs')} />
      )}

      {/* RDS */}
      {activeTab === 'rds' && (
        <DataTable columns={[
          { key: 'db_instance_identifier', label: 'Instance' },
          { key: 'engine', label: 'Engine' },
          { key: 'db_instance_class', label: 'Class' },
          { key: 'avg_cpu', label: 'Avg CPU %', render: (v: number) => <span className={`font-mono font-bold ${cpuColor(v)}`}>{v}%</span> },
          { key: 'max_cpu', label: 'Max CPU %', render: (v: number) => <span className={`font-mono ${cpuColor(v)}`}>{v}%</span> },
          { key: 'avg_connections', label: 'Avg Conns', render: (v: any) => <span className="font-mono text-accent-purple">{v ?? '--'}</span> },
          { key: 'max_connections', label: 'Max Conns' },
        ]} data={loading && !rdsCombined.length ? undefined : rdsCombined}
           onRowClick={(row) => showDetail(row.db_instance_identifier, 'rds')} />
      )}

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{selected.instanceId}</h2>
                <p className="text-sm text-gray-400">{detailTitle}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Network: show both In and Out */}
              {selected.type === 'network' && networkData[selected.instanceId] && (
                <>
                  <LineChartCard
                    title="Network In (MB/hour)"
                    data={networkData[selected.instanceId].netIn.slice(0, 24).reverse().map((r: any) => ({
                      name: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      value: Number(r.avg_mb) || 0,
                    }))}
                    color="#00d4ff"
                  />
                  <LineChartCard
                    title="Network Out (MB/hour)"
                    data={networkData[selected.instanceId].netOut.slice(0, 24).reverse().map((r: any) => ({
                      name: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      value: Number(r.avg_mb) || 0,
                    }))}
                    color="#00ff88"
                  />
                  {/* Network summary stats */}
                  {(() => {
                    const inData = networkData[selected.instanceId].netIn;
                    const outData = networkData[selected.instanceId].netOut;
                    const inTotal = inData.reduce((s: number, r: any) => s + (Number(r.total_mb) || 0), 0);
                    const outTotal = outData.reduce((s: number, r: any) => s + (Number(r.total_mb) || 0), 0);
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                          <p className="text-xs text-gray-500 uppercase">Total In (24h)</p>
                          <p className="text-xl font-bold font-mono text-accent-cyan">{inTotal.toFixed(1)} MB</p>
                        </div>
                        <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                          <p className="text-xs text-gray-500 uppercase">Total Out (24h)</p>
                          <p className="text-xl font-bold font-mono text-accent-green">{outTotal.toFixed(1)} MB</p>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* K8s Node Memory Detail */}
              {selected.type === 'k8snode' && detailData.length > 0 && (
                <>
                  <BarChartCard title="Memory Breakdown (GB)" data={detailData} color="#a855f7" />
                  <div className="grid grid-cols-3 gap-4">
                    {detailData.map((d, i) => (
                      <div key={i} className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                        <p className="text-xs text-gray-500 uppercase">{d.name}</p>
                        <p className="text-xl font-bold font-mono text-accent-purple">{d.value} GB</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* RDS FreeableMemory Detail */}
              {selected.type === 'rdsmem' && detailData.length > 0 && (
                <>
                  <LineChartCard title="FreeableMemory (GB, Hourly)" data={detailData} color="#ec4899" />
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                      <p className="text-xs text-gray-500 uppercase">Average</p>
                      <p className="text-xl font-bold font-mono text-accent-pink">
                        {(detailData.reduce((s, d) => s + d.value, 0) / detailData.length).toFixed(3)} GB
                      </p>
                    </div>
                    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                      <p className="text-xs text-gray-500 uppercase">Maximum</p>
                      <p className="text-xl font-bold font-mono text-accent-green">
                        {Math.max(...detailData.map(d => d.value)).toFixed(3)} GB
                      </p>
                    </div>
                    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                      <p className="text-xs text-gray-500 uppercase">Minimum</p>
                      <p className="text-xl font-bold font-mono text-accent-orange">
                        {Math.min(...detailData.map(d => d.value)).toFixed(3)} GB
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* CPU / IOPS charts */}
              {!['network', 'k8snode', 'rdsmem'].includes(selected.type) && detailData.length > 0 && (
                <>
                  <LineChartCard title={detailTitle} data={detailData}
                    color={selected.type === 'ec2' ? '#00d4ff' : selected.type === 'ebs' ? '#00ff88' : '#a855f7'} />
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                      <p className="text-xs text-gray-500 uppercase">Average</p>
                      <p className="text-xl font-bold font-mono text-accent-cyan">
                        {(detailData.reduce((s, d) => s + d.value, 0) / detailData.length).toFixed(1)}
                        {selected.type !== 'ebs' ? '%' : ''}
                      </p>
                    </div>
                    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                      <p className="text-xs text-gray-500 uppercase">Maximum</p>
                      <p className="text-xl font-bold font-mono text-accent-orange">
                        {Math.max(...detailData.map(d => d.value)).toFixed(1)}{selected.type !== 'ebs' ? '%' : ''}
                      </p>
                    </div>
                    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4 text-center">
                      <p className="text-xs text-gray-500 uppercase">Minimum</p>
                      <p className="text-xl font-bold font-mono text-accent-green">
                        {Math.min(...detailData.map(d => d.value)).toFixed(1)}{selected.type !== 'ebs' ? '%' : ''}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {!['network'].includes(selected.type) && detailData.length === 0 && (
                <p className="text-gray-500 text-center py-10">Loading or no data available...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
