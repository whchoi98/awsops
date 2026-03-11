'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Server, X, Cpu, HardDrive, Network, Shield, Tag } from 'lucide-react';
import { queries as ec2Q } from '@/lib/queries/ec2';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function EC2Page() {
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            summary: ec2Q.summary,
            statusCount: ec2Q.statusCount,
            typeDistribution: ec2Q.typeDistribution,
            list: ec2Q.list,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (instanceId: string) => {
    setDetailLoading(true);
    try {
      const sql = ec2Q.detail.replace('{instance_id}', instanceId);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) {
        setSelected(result.detail.rows[0]);
      }
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('summary') as Record<string, unknown>;
  const statusData = get('statusCount').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }));
  const typeData = get('typeDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }));
  const list = get('list');

  const running = Number(summary?.running_instances) || 0;
  const total = Number(summary?.total_instances) || 0;
  const stopped = total - running;
  const totalVcpus = Number(summary?.total_vcpus) || 0;

  const parseSGs = (sgs: any) => {
    if (!sgs) return [];
    if (typeof sgs === 'string') try { return JSON.parse(sgs); } catch { return []; }
    return Array.isArray(sgs) ? sgs : [];
  };

  const parseBlockDevices = (bd: any) => {
    if (!bd) return [];
    if (typeof bd === 'string') try { return JSON.parse(bd); } catch { return []; }
    return Array.isArray(bd) ? bd : [];
  };

  const parseNICs = (nics: any) => {
    if (!nics) return [];
    if (typeof nics === 'string') try { return JSON.parse(nics); } catch { return []; }
    return Array.isArray(nics) ? nics : [];
  };

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="EC2 Instances" subtitle="Elastic Compute Cloud" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Running" value={running} icon={Server} color="green" />
        <StatsCard label="Stopped" value={stopped} icon={Server} color="red" />
        <StatsCard label="Total vCPUs" value={totalVcpus} icon={Server} color="cyan" />
        <StatsCard label="Instance Types" value={typeData.length} icon={Server} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Instance Type Distribution" data={typeData.slice(0, 8)} />
        <BarChartCard title="Instance Status" data={statusData} color="#00d4ff" />
      </div>

      <DataTable
        columns={[
          { key: 'instance_id', label: 'Instance ID' },
          { key: 'name', label: 'Name' },
          { key: 'instance_type', label: 'Type' },
          { key: 'instance_state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
          { key: 'public_ip_address', label: 'Public IP', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'private_ip_address', label: 'Private IP' },
          { key: 'launch_time', label: 'Launch Time', render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
          { key: 'region', label: 'Region' },
        ]}
        data={loading && !list.length ? undefined : list}
        onRowClick={(row) => fetchDetail(row.instance_id)}
      />

      {/* Detail Panel */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Detail Header */}
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">
                  {selected?.instance_id || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-400">{selected?.tags?.Name || selected?.instance_id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">
                {[1,2,3,4,5].map(i => <div key={i} className="h-12 skeleton rounded" />)}
              </div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <StatusBadge status={selected.instance_state || 'unknown'} />
                  <span className="text-sm text-gray-400 font-mono">{selected.instance_type}</span>
                </div>

                {/* Instance Info */}
                <Section title="Instance" icon={Server}>
                  <Row label="Instance ID" value={selected.instance_id} />
                  <Row label="Image (AMI)" value={selected.image_id} />
                  <Row label="Architecture" value={selected.architecture} />
                  <Row label="Platform" value={selected.platform_details} />
                  <Row label="Virtualization" value={selected.virtualization_type} />
                  <Row label="Key Pair" value={selected.key_name || '--'} />
                  <Row label="IAM Role" value={selected.iam_instance_profile_arn?.split('/')?.pop() || '--'} />
                  <Row label="Monitoring" value={selected.monitoring_state} />
                  <Row label="EBS Optimized" value={selected.ebs_optimized ? 'Yes' : 'No'} />
                  <Row label="ENA Support" value={selected.ena_support || '--'} />
                  <Row label="Launch Time" value={selected.launch_time ? new Date(selected.launch_time).toLocaleString() : '--'} />
                </Section>

                {/* Compute + Memory / 컴퓨팅 + 메모리 */}
                <Section title="Compute" icon={Cpu}>
                  <Row label="Instance Type" value={selected.instance_type} />
                  <Row label="vCPUs" value={`${(Number(selected.cpu_options_core_count) || 0) * (Number(selected.cpu_options_threads_per_core) || 1)}`} />
                  <Row label="Cores" value={selected.cpu_options_core_count} />
                  <Row label="Threads/Core" value={selected.cpu_options_threads_per_core} />
                  <Row label="Memory" value={selected.memory_mib ? `${(Number(selected.memory_mib) / 1024).toFixed(1)} GiB` : '--'} />
                  <Row label="Network" value={selected.network_performance || '--'} />
                  <Row label="Max ENIs" value={selected.max_enis || '--'} />
                  <Row label="Instance Storage" value={selected.instance_storage_supported === 'true' ? 'Yes' : 'No'} />
                </Section>

                {/* Network */}
                <Section title="Network" icon={Network}>
                  <Row label="VPC" value={selected.vpc_id} />
                  <Row label="Subnet" value={selected.subnet_id} />
                  <Row label="AZ" value={selected.placement_availability_zone} />
                  <Row label="Private IP" value={selected.private_ip_address} />
                  <Row label="Private DNS" value={selected.private_dns_name} />
                  <Row label="Public IP" value={selected.public_ip_address || '--'} />
                  <Row label="Public DNS" value={selected.public_dns_name || '--'} />
                  {parseNICs(selected.network_interfaces).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 uppercase mb-1">Network Interfaces</p>
                      {parseNICs(selected.network_interfaces).map((nic: any, i: number) => (
                        <div key={i} className="text-xs font-mono text-gray-400 pl-2 border-l border-navy-600 mb-1">
                          {nic.NetworkInterfaceId || nic.network_interface_id} - {nic.PrivateIpAddress || nic.private_ip_address}
                          {nic.Association?.PublicIp && ` (${nic.Association.PublicIp})`}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Security Groups */}
                <Section title="Security Groups" icon={Shield}>
                  {parseSGs(selected.security_groups).length > 0 ? (
                    <div className="space-y-1">
                      {parseSGs(selected.security_groups).map((sg: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-accent-cyan font-mono text-xs">{sg.GroupId || sg.group_id}</span>
                          <span className="text-gray-400">{sg.GroupName || sg.group_name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No security groups</p>
                  )}
                </Section>

                {/* Storage */}
                <Section title="Storage" icon={HardDrive}>
                  <Row label="Root Device" value={`${selected.root_device_name} (${selected.root_device_type})`} />
                  {parseBlockDevices(selected.block_device_mappings).length > 0 && (
                    <div className="mt-2 space-y-2">
                      {parseBlockDevices(selected.block_device_mappings).map((bd: any, i: number) => (
                        <div key={i} className="bg-navy-900 rounded p-2 text-xs font-mono">
                          <span className="text-gray-300">{bd.DeviceName || bd.device_name}</span>
                          <span className="text-gray-500 ml-2">
                            {bd.Ebs?.VolumeId || bd.ebs?.volume_id}
                          </span>
                          {(bd.Ebs?.DeleteOnTermination ?? bd.ebs?.delete_on_termination) && (
                            <span className="text-accent-orange ml-2">DeleteOnTermination</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Tags */}
                <Section title="Tags" icon={Tag}>
                  {Object.keys(parseTags(selected.tags)).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(parseTags(selected.tags)).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-sm">
                          <span className="text-accent-purple font-mono text-xs min-w-[120px]">{k}</span>
                          <span className="text-gray-300">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No tags</p>
                  )}
                </Section>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-accent-cyan" />
        <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-gray-500 min-w-[130px] shrink-0">{label}</span>
      <span className="text-gray-200 font-mono text-xs break-all">{value ?? '--'}</span>
    </div>
  );
}
