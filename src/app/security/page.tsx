'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { ShieldCheck, X, Database, Shield, HardDrive, Bug, Users } from 'lucide-react';
import { queries as secQ } from '@/lib/queries/security';

type SecurityTab = 'publicBuckets' | 'mfa' | 'openSGs' | 'unencrypted' | 'cve';

export default function SecurityPage() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SecurityTab>('publicBuckets');
  const [selected, setSelected] = useState<any>(null);
  const [detailType, setDetailType] = useState<string>('');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            summary: secQ.summary,
            publicBuckets: secQ.publicBuckets,
            mfaStatus: secQ.mfaStatus,
            openSecurityGroups: secQ.openSecurityGroups,
            unencryptedVolumes: secQ.unencryptedVolumes,
            trivyVulnerabilities: secQ.trivyVulnerabilities,
            trivySummary: secQ.trivySummary,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showDetail = (type: string, row: any) => {
    setDetailType(type);
    setSelected(row);
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('summary') as any;
  const publicBuckets = get('publicBuckets');
  const mfaStatus = get('mfaStatus');
  const openSGs = get('openSecurityGroups');
  const unencryptedVols = get('unencryptedVolumes');
  const trivyVulns = get('trivyVulnerabilities');
  const trivySummary = get('trivySummary') as { name: string; value: number }[];

  const publicBucketCount = Number(summary?.public_buckets) || 0;
  const mfaIssues = Number(summary?.mfa_not_enabled) || 0;
  const openSGCount = Number(summary?.open_sgs) || 0;
  const unencryptedCount = Number(summary?.unencrypted_volumes) || 0;
  const criticalCVE = trivySummary.find(s => s.name === 'CRITICAL')?.value || 0;
  const highCVE = trivySummary.find(s => s.name === 'HIGH')?.value || 0;

  const severityColors: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#a855f7', LOW: '#00d4ff', UNKNOWN: '#6b7280' };
  const cvePieData = trivySummary.map(s => ({ name: s.name, value: s.value, color: severityColors[s.name] || '#6b7280' }));
  const securityIssuesBar = [
    { name: 'Public Buckets', value: publicBucketCount },
    { name: 'MFA Issues', value: mfaIssues },
    { name: 'Open SGs', value: openSGCount },
    { name: 'Unencrypted', value: unencryptedCount },
    { name: 'CVE Critical', value: Number(criticalCVE) },
    { name: 'CVE High', value: Number(highCVE) },
  ].filter(d => d.value > 0);

  const tabs: { key: SecurityTab; label: string; count: number }[] = [
    { key: 'publicBuckets', label: 'Public Buckets', count: publicBuckets.length },
    { key: 'mfa', label: 'MFA Status', count: mfaStatus.length },
    { key: 'openSGs', label: 'Open SGs', count: openSGs.length },
    { key: 'unencrypted', label: 'Unencrypted Volumes', count: unencryptedVols.length },
    { key: 'cve', label: 'CVE Vulnerabilities', count: trivyVulns.length },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Security Overview" subtitle="Security Posture & Vulnerabilities" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Public Buckets" value={publicBucketCount} icon={ShieldCheck} color="red" change={publicBucketCount > 0 ? 'Exposed!' : undefined} />
        <StatsCard label="MFA Issues" value={mfaIssues} icon={ShieldCheck} color="red" />
        <StatsCard label="Open SGs" value={openSGCount} icon={ShieldCheck} color="orange" change={openSGCount > 0 ? '0.0.0.0/0 ingress' : undefined} />
        <StatsCard label="Unencrypted Vols" value={unencryptedCount} icon={ShieldCheck} color="orange" />
        <StatsCard label="CVE Critical" value={Number(criticalCVE)} icon={ShieldCheck} color="red" />
        <StatsCard label="CVE High" value={Number(highCVE)} icon={ShieldCheck} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="CVE Severity Distribution" data={cvePieData} />
        <BarChartCard title="Security Issues Summary" data={securityIssuesBar} color="#ef4444" />
      </div>

      <div className="flex gap-1 bg-navy-800 rounded-lg border border-navy-600 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-gray-400 hover:text-white hover:bg-navy-700'
            }`}>{tab.label} ({tab.count})</button>
        ))}
      </div>

      {activeTab === 'publicBuckets' && (
        <DataTable columns={[
          { key: 'name', label: 'Bucket Name' },
          { key: 'region', label: 'Region' },
          { key: 'bucket_policy_is_public', label: 'Policy Public', render: (v: boolean) => <span className={v ? 'text-accent-red font-medium' : 'text-gray-500'}>{v ? 'PUBLIC' : 'No'}</span> },
          { key: 'block_public_acls', label: 'Block ACLs', render: (v: boolean) => <span className={v ? 'text-accent-green' : 'text-accent-red'}>{v ? 'Yes' : 'No'}</span> },
          { key: 'block_public_policy', label: 'Block Policy', render: (v: boolean) => <span className={v ? 'text-accent-green' : 'text-accent-red'}>{v ? 'Yes' : 'No'}</span> },
        ]} data={loading && !publicBuckets.length ? undefined : publicBuckets}
           onRowClick={(row) => showDetail('bucket', row)} />
      )}

      {activeTab === 'mfa' && (
        <DataTable columns={[
          { key: 'name', label: 'Username' },
          { key: 'user_id', label: 'User ID' },
          { key: 'create_date', label: 'Created', render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
          { key: 'password_last_used', label: 'Password Last Used', render: (v: string) => v ? new Date(v).toLocaleDateString() : <span className="text-gray-600">Never</span> },
        ]} data={loading && !mfaStatus.length ? undefined : mfaStatus}
           onRowClick={(row) => showDetail('user', row)} />
      )}

      {activeTab === 'openSGs' && (
        <DataTable columns={[
          { key: 'group_id', label: 'Group ID' },
          { key: 'group_name', label: 'Group Name' },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'ip_protocol', label: 'Protocol' },
          { key: 'from_port', label: 'From Port' },
          { key: 'to_port', label: 'To Port' },
          { key: 'cidr_ipv4', label: 'CIDR', render: (v: string) => <span className={v === '0.0.0.0/0' ? 'text-accent-red font-medium' : ''}>{v}</span> },
        ]} data={loading && !openSGs.length ? undefined : openSGs}
           onRowClick={(row) => showDetail('sg', row)} />
      )}

      {activeTab === 'unencrypted' && (
        <DataTable columns={[
          { key: 'volume_id', label: 'Volume ID' },
          { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'volume_type', label: 'Type' },
          { key: 'size', label: 'Size (GB)' },
          { key: 'state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
          { key: 'availability_zone', label: 'AZ' },
        ]} data={loading && !unencryptedVols.length ? undefined : unencryptedVols}
           onRowClick={(row) => showDetail('volume', row)} />
      )}

      {activeTab === 'cve' && (
        <DataTable columns={[
          { key: 'vulnerability_id', label: 'CVE ID' },
          { key: 'severity', label: 'Severity', render: (v: string) => {
            const cm: Record<string, string> = { CRITICAL: 'bg-accent-red/10 text-accent-red', HIGH: 'bg-accent-orange/10 text-accent-orange', MEDIUM: 'bg-accent-purple/10 text-accent-purple', LOW: 'bg-accent-cyan/10 text-accent-cyan' };
            return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cm[v] || 'bg-gray-500/10 text-gray-400'}`}>{v}</span>;
          }},
          { key: 'pkg_name', label: 'Package' },
          { key: 'installed_version', label: 'Installed' },
          { key: 'fixed_version', label: 'Fixed', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'title', label: 'Title', render: (v: string) => <span className="text-xs max-w-xs truncate block" title={v}>{v ? (v.length > 50 ? v.slice(0, 50) + '...' : v) : '--'}</span> },
        ]} data={loading && !trivyVulns.length ? undefined : trivyVulns}
           onRowClick={(row) => showDetail('cve', row)} />
      )}

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">
                  {selected.name || selected.group_id || selected.volume_id || selected.vulnerability_id || '--'}
                </h2>
                <p className="text-sm text-gray-400 capitalize">{detailType} Detail</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Public Bucket Detail */}
              {detailType === 'bucket' && (<>
                <Section title="S3 Bucket" icon={Database}>
                  <Row label="Name" value={selected.name} />
                  <Row label="Region" value={selected.region} />
                  <Row label="Created" value={selected.creation_date ? new Date(selected.creation_date).toLocaleString() : '--'} />
                </Section>
                <Section title="Public Access" icon={ShieldCheck}>
                  <Row label="Policy Public" value={selected.bucket_policy_is_public ? 'YES - PUBLIC' : 'No'} />
                  <Row label="Block Public ACLs" value={selected.block_public_acls ? 'Yes' : 'No'} />
                  <Row label="Block Public Policy" value={selected.block_public_policy ? 'Yes' : 'No'} />
                  <Row label="Ignore Public ACLs" value={selected.ignore_public_acls ? 'Yes' : 'No'} />
                  <Row label="Restrict Public Buckets" value={selected.restrict_public_buckets ? 'Yes' : 'No'} />
                </Section>
              </>)}

              {/* User Detail */}
              {detailType === 'user' && (<>
                <Section title="IAM User" icon={Users}>
                  <Row label="Name" value={selected.name} />
                  <Row label="User ID" value={selected.user_id} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Created" value={selected.create_date ? new Date(selected.create_date).toLocaleString() : '--'} />
                  <Row label="Password Last Used" value={selected.password_last_used ? new Date(selected.password_last_used).toLocaleString() : 'Never'} />
                </Section>
              </>)}

              {/* Open SG Detail */}
              {detailType === 'sg' && (<>
                <Section title="Security Group Rule" icon={Shield}>
                  <Row label="Group ID" value={selected.group_id} />
                  <Row label="Group Name" value={selected.group_name} />
                  <Row label="VPC" value={selected.vpc_id} />
                  <Row label="Direction" value={selected.type} />
                  <Row label="Protocol" value={selected.ip_protocol === '-1' ? 'All Traffic' : selected.ip_protocol} />
                  <Row label="Port Range" value={selected.from_port === selected.to_port ? selected.from_port : `${selected.from_port}-${selected.to_port}`} />
                  <Row label="CIDR" value={selected.cidr_ipv4} />
                  {selected.name && <Row label="Tag Name" value={selected.name} />}
                </Section>
                <div className="bg-accent-red/5 border border-accent-red/20 rounded-lg p-3">
                  <p className="text-xs text-accent-red font-medium">This security group allows inbound traffic from 0.0.0.0/0</p>
                  <p className="text-xs text-gray-400 mt-1">Consider restricting the source CIDR to specific IP ranges.</p>
                </div>
              </>)}

              {/* Unencrypted Volume Detail */}
              {detailType === 'volume' && (<>
                <Section title="EBS Volume" icon={HardDrive}>
                  <Row label="Volume ID" value={selected.volume_id} />
                  <Row label="Name" value={selected.name || '--'} />
                  <Row label="Type" value={selected.volume_type} />
                  <Row label="Size" value={`${selected.size} GB`} />
                  <Row label="State" value={selected.state} />
                  <Row label="Encrypted" value="No" />
                  <Row label="AZ" value={selected.availability_zone} />
                  <Row label="Created" value={selected.create_time ? new Date(selected.create_time).toLocaleString() : '--'} />
                </Section>
                <div className="bg-accent-orange/5 border border-accent-orange/20 rounded-lg p-3">
                  <p className="text-xs text-accent-orange font-medium">This volume is not encrypted at rest</p>
                  <p className="text-xs text-gray-400 mt-1">Create an encrypted snapshot and restore to enable encryption.</p>
                </div>
              </>)}

              {/* CVE Detail */}
              {detailType === 'cve' && (<>
                <div className="flex items-center gap-2">
                  {(() => {
                    const cm: Record<string, string> = { CRITICAL: 'bg-accent-red/10 text-accent-red', HIGH: 'bg-accent-orange/10 text-accent-orange', MEDIUM: 'bg-accent-purple/10 text-accent-purple', LOW: 'bg-accent-cyan/10 text-accent-cyan' };
                    return <span className={`px-3 py-1 rounded-full text-sm font-medium ${cm[selected.severity] || 'bg-gray-500/10 text-gray-400'}`}>{selected.severity}</span>;
                  })()}
                </div>
                <Section title="Vulnerability" icon={Bug}>
                  <Row label="CVE ID" value={selected.vulnerability_id} />
                  <Row label="Title" value={selected.title} />
                  <Row label="Severity" value={selected.severity} />
                  <Row label="Package" value={selected.pkg_name} />
                  <Row label="Installed Version" value={selected.installed_version} />
                  <Row label="Fixed Version" value={selected.fixed_version || 'No fix available'} />
                  <Row label="Target" value={selected.target || '--'} />
                  <Row label="Class" value={selected.class || '--'} />
                </Section>
                {selected.description && (
                  <Section title="Description" icon={ShieldCheck}>
                    <p className="text-xs text-gray-300 leading-relaxed">{selected.description}</p>
                  </Section>
                )}
              </>)}
            </div>
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
