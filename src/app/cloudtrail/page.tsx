'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import DataTable from '@/components/table/DataTable';
import { FileSearch, X, Shield, Settings, Tag, HardDrive } from 'lucide-react';
import { queries as ctQ } from '@/lib/queries/cloudtrail';
import { useAccountContext } from '@/contexts/AccountContext';

type TabKey = 'trails' | 'events' | 'writes';

export default function CloudTrailPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('trails');
  const [selected, setSelected] = useState<any>(null);
  const [detailType, setDetailType] = useState<'trail' | 'event'>('trail');
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      // Only load trails on initial load (events are slow - lazy load on tab click)
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: { summary: ctQ.summary, trailList: ctQ.trailList },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  const [eventsLoaded, setEventsLoaded] = useState(false);
  const fetchEvents = useCallback(async () => {
    if (eventsLoaded && !loading) return;
    try {
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: { recentEvents: ctQ.recentEvents, writeEvents: ctQ.writeEvents },
        }),
      });
      const result = await res.json();
      setData((prev: any) => ({ ...prev, ...result }));
      setEventsLoaded(true);
    } catch {}
  }, [eventsLoaded, loading]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if ((tab === 'events' || tab === 'writes') && !eventsLoaded) {
      fetchEvents();
    }
  };

  const fetchTrailDetail = async (name: string) => {
    setDetailLoading(true);
    setDetailType('trail');
    try {
      const sql = ctQ.trailDetail.replace('{name}', name);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) setSelected(result.detail.rows[0]);
    } catch {} finally { setDetailLoading(false); }
  };

  const showEventDetail = (event: any) => {
    setDetailType('event');
    setSelected(event);
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const summary = getFirst('summary') as any;

  const trails = get('trailList');
  const events = get('recentEvents');
  const writes = get('writeEvents');
  // eventSources loaded lazily with events

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'trails', label: `Trails (${trails.length})` },
    { key: 'events', label: `Recent Events (${events.length})` },
    { key: 'writes', label: `Write Events (${writes.length})` },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="CloudTrail" subtitle="API Activity & Audit Logs" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Trails" value={Number(summary?.total_trails) || 0} icon={FileSearch} color="cyan" />
        <StatsCard label="Active" value={Number(summary?.active_trails) || 0} icon={FileSearch} color="green" />
        <StatsCard label="Multi-Region" value={Number(summary?.multi_region_trails) || 0} icon={FileSearch} color="purple" />
        <StatsCard label="Log Validated" value={Number(summary?.log_validated_trails) || 0} icon={FileSearch} color="orange" />
      </div>

      {/* Charts loaded when event tabs are accessed */}

      <div className="flex gap-1 bg-navy-800 rounded-lg border border-navy-600 p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-gray-400 hover:text-white hover:bg-navy-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'trails' && (
        <DataTable columns={[
          { key: 'name', label: 'Trail Name' },
          { key: 'home_region', label: 'Home Region' },
          { key: 'is_logging', label: 'Logging', render: (v: boolean) => <StatusBadge status={v ? 'active' : 'stopped'} /> },
          { key: 'is_multi_region_trail', label: 'Multi-Region', render: (v: boolean) => v ? <span className="text-accent-green">Yes</span> : 'No' },
          { key: 'log_file_validation_enabled', label: 'Validation', render: (v: boolean) => v ? <span className="text-accent-green">Yes</span> : <span className="text-accent-red">No</span> },
          { key: 's3_bucket_name', label: 'S3 Bucket' },
          { key: 'latest_delivery_time', label: 'Last Delivery', render: (v: string) => v ? new Date(v).toLocaleString() : '--' },
        ]} data={loading && !trails.length ? undefined : trails}
           onRowClick={(row) => fetchTrailDetail(row.name)} />
      )}

      {activeTab === 'events' && (
        <DataTable columns={[
          { key: 'event_time', label: 'Time', render: (v: string) => v ? new Date(v).toLocaleString() : '--' },
          { key: 'event_name', label: 'Event' },
          { key: 'event_source', label: 'Source' },
          { key: 'username', label: 'User' },
          { key: 'resource_type', label: 'Resource Type' },
          { key: 'resource_name', label: 'Resource' },
          { key: 'read_only', label: 'Read Only', render: (v: string) => v === 'true' ? <span className="text-gray-400">Read</span> : <span className="text-accent-orange font-medium">Write</span> },
        ]} data={loading && !events.length ? undefined : events}
           onRowClick={(row) => showEventDetail(row)} />
      )}

      {activeTab === 'writes' && (
        <DataTable columns={[
          { key: 'event_time', label: 'Time', render: (v: string) => v ? new Date(v).toLocaleString() : '--' },
          { key: 'event_name', label: 'Event' },
          { key: 'event_source', label: 'Source' },
          { key: 'username', label: 'User' },
          { key: 'resource_type', label: 'Resource Type' },
          { key: 'resource_name', label: 'Resource' },
        ]} data={loading && !writes.length ? undefined : writes}
           onRowClick={(row) => showEventDetail(row)} />
      )}

      {/* Trail Detail Panel */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{detailType === 'event' ? (selected?.event_name || 'Loading...') : (selected?.name || 'Loading...')}</h2>
                <p className="text-sm text-gray-400">{detailType === 'event' ? 'CloudTrail Event' : 'CloudTrail Trail'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                {/* Trail Detail */}
                {detailType === 'trail' && (<>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={selected.is_logging ? 'active' : 'stopped'} />
                    {selected.is_multi_region_trail && <span className="text-xs bg-accent-purple/10 text-accent-purple px-2 py-0.5 rounded-full">Multi-Region</span>}
                    {selected.is_organization_trail && <span className="text-xs bg-accent-cyan/10 text-accent-cyan px-2 py-0.5 rounded-full">Organization</span>}
                  </div>
                  <Section title="Trail" icon={FileSearch}>
                    {selected.account_id && isMultiAccount && (
                      <Row label="Account" value={selected.account_id} />
                    )}
                    <Row label="Name" value={selected.name} />
                    <Row label="ARN" value={selected.arn} />
                    <Row label="Home Region" value={selected.home_region} />
                    <Row label="Logging" value={selected.is_logging ? 'Yes' : 'No'} />
                    <Row label="Multi-Region" value={selected.is_multi_region_trail ? 'Yes' : 'No'} />
                    <Row label="Organization Trail" value={selected.is_organization_trail ? 'Yes' : 'No'} />
                    <Row label="Global Events" value={selected.include_global_service_events ? 'Yes' : 'No'} />
                  </Section>
                  <Section title="Storage" icon={HardDrive}>
                    <Row label="S3 Bucket" value={selected.s3_bucket_name} />
                    <Row label="S3 Prefix" value={selected.s3_key_prefix || '--'} />
                    <Row label="SNS Topic" value={selected.sns_topic_arn || '--'} />
                    <Row label="KMS Key" value={selected.kms_key_id || '--'} />
                  </Section>
                  <Section title="CloudWatch" icon={Settings}>
                    <Row label="Log Group" value={selected.log_group_arn || '--'} />
                    <Row label="CW Role" value={selected.cloudwatch_logs_role_arn || '--'} />
                    <Row label="CW Last Delivery" value={selected.latest_cloudwatch_logs_delivery_time ? new Date(selected.latest_cloudwatch_logs_delivery_time).toLocaleString() : '--'} />
                  </Section>
                  <Section title="Validation" icon={Shield}>
                    <Row label="Log Validation" value={selected.log_file_validation_enabled ? 'Enabled' : 'Disabled'} />
                    <Row label="Last Delivery" value={selected.latest_delivery_time ? new Date(selected.latest_delivery_time).toLocaleString() : '--'} />
                    <Row label="Start Logging" value={selected.start_logging_time ? new Date(selected.start_logging_time).toLocaleString() : '--'} />
                  </Section>
                  {selected.tags && (
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
                      ) : <p className="text-gray-500 text-sm">No tags</p>}
                    </Section>
                  )}
                </>)}

                {/* Event Detail */}
                {detailType === 'event' && (<>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selected.read_only === 'true' ? 'bg-gray-500/10 text-gray-400' : 'bg-accent-orange/10 text-accent-orange'}`}>
                      {selected.read_only === 'true' ? 'Read' : 'Write'}
                    </span>
                    <span className="text-sm font-mono text-gray-400">{selected.event_source}</span>
                  </div>
                  <Section title="Event" icon={FileSearch}>
                    <Row label="Event ID" value={selected.event_id} />
                    <Row label="Event Name" value={selected.event_name} />
                    <Row label="Event Source" value={selected.event_source} />
                    <Row label="Time" value={selected.event_time ? new Date(selected.event_time).toLocaleString() : '--'} />
                    <Row label="User" value={selected.username} />
                    <Row label="Access Key" value={selected.access_key_id || '--'} />
                    <Row label="Read Only" value={selected.read_only} />
                  </Section>
                  <Section title="Resource" icon={Shield}>
                    <Row label="Resource Type" value={selected.resource_type || '--'} />
                    <Row label="Resource Name" value={selected.resource_name || '--'} />
                  </Section>
                  {selected.cloud_trail_event && (
                    <Section title="Raw Event" icon={Settings}>
                      <pre className="text-xs font-mono text-gray-300 bg-navy-800 rounded p-3 overflow-x-auto max-h-96">
                        {(() => {
                          try {
                            const parsed = typeof selected.cloud_trail_event === 'string'
                              ? JSON.parse(selected.cloud_trail_event)
                              : selected.cloud_trail_event;
                            return JSON.stringify(parsed, null, 2);
                          } catch { return String(selected.cloud_trail_event); }
                        })()}
                      </pre>
                    </Section>
                  )}
                </>)}
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
