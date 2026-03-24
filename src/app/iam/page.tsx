'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Users, AlertTriangle, X, Shield, Tag, Clock } from 'lucide-react';
import { queries as iamQ } from '@/lib/queries/iam';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAccountContext } from '@/contexts/AccountContext';

export default function IAMPage() {
  const { t } = useLanguage();
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailType, setDetailType] = useState<'user' | 'role'>('user');
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Admin access check / 관리자 접근 확인
  useEffect(() => {
    fetch('/awsops/api/steampipe?action=admin-check')
      .then(r => r.json())
      .then(d => { if (!d.isAdmin) setAccessDenied(true); })
      .catch(() => setAccessDenied(true));
  }, []);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: { summary: iamQ.summary, userList: iamQ.userList, roleList: iamQ.roleList },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (type: 'user' | 'role', name: string) => {
    setDetailLoading(true);
    setDetailType(type);
    try {
      const template = type === 'user' ? iamQ.userDetail : iamQ.roleDetail;
      const sql = template.replace('{name}', name);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: currentAccountId, queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) setSelected(result.detail.rows[0]);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const summary = getFirst('summary') as any;
  const userList = get('userList');
  const roleList = get('roleList');

  const totalUsers = Number(summary?.total_users) || 0;
  const totalRoles = Number(summary?.total_roles) || 0;
  const customPolicies = Number(summary?.custom_policies) || 0;
  const mfaNotEnabled = Number(summary?.mfa_not_enabled) || 0;

  const mfaData = [
    { name: 'MFA Enabled', value: totalUsers - mfaNotEnabled, color: '#00ff88' },
    { name: 'MFA Not Enabled', value: mfaNotEnabled, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  const parseArray = (val: any) => {
    if (!val) return [];
    if (typeof val === 'string') try { return JSON.parse(val); } catch { return []; }
    return Array.isArray(val) ? val : [];
  };

  const parseJson = (val: any) => {
    if (!val) return null;
    if (typeof val === 'string') try { return JSON.parse(val); } catch { return null; }
    return typeof val === 'object' ? val : null;
  };

  if (accessDenied) {
    return (
      <div className="p-6 animate-fade-in">
        <Header title={t('iam.title')} subtitle={t('iam.subtitle')} />
        <div className="flex flex-col items-center justify-center mt-20">
          <Shield size={48} className="text-accent-red mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm text-center max-w-md">
            You do not have permission to access this page.<br />
            Contact your administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title={t('iam.title')} subtitle={t('iam.subtitle')} onRefresh={() => fetchData(true)} />

      {mfaNotEnabled > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-accent-red/10 border border-accent-red/30">
          <AlertTriangle size={20} className="text-accent-red flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-accent-red">{mfaNotEnabled} IAM user{mfaNotEnabled > 1 ? 's' : ''} without MFA</p>
            <p className="text-xs text-gray-400 mt-0.5">MFA should be enabled for all users.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label={t('iam.totalUsers')} value={totalUsers} icon={Users} color="cyan" />
        <StatsCard label={t('iam.totalRoles')} value={totalRoles} icon={Users} color="purple" />
        <StatsCard label={t('iam.policies')} value={customPolicies} icon={Users} color="green" />
        <StatsCard label={t('iam.mfaNotEnabled')} value={mfaNotEnabled} icon={Users} color="red" />
      </div>

      <PieChartCard title="MFA Status" data={mfaData} />

      <div>
        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">{t('iam.users')}</h3>
        <DataTable columns={[
          { key: 'name', label: t('iam.userName') },
          { key: 'user_id', label: t('common.id') },
          { key: 'create_date', label: t('iam.createDate'), render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
          { key: 'password_last_used', label: t('iam.passwordLastUsed'), render: (v: string) => v ? new Date(v).toLocaleDateString() : <span className="text-gray-600">Never</span> },
        ]} data={loading && !userList.length ? undefined : userList}
           onRowClick={(row) => fetchDetail('user', row.name)} />
      </div>

      <div>
        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">{t('iam.roles')}</h3>
        <DataTable columns={[
          { key: 'name', label: t('iam.roleName') },
          { key: 'role_id', label: t('common.id') },
          { key: 'path', label: t('iam.path') },
          { key: 'description', label: t('common.description'), render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'create_date', label: t('iam.createDate'), render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
          { key: 'max_session_duration', label: t('iam.maxSession'), render: (v: number) => v ? `${v / 3600}h` : '--' },
        ]} data={loading && !roleList.length ? undefined : roleList}
           onRowClick={(row) => fetchDetail('role', row.name)} />
      </div>

      {/* Detail Panel */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{selected?.name || 'Loading...'}</h2>
                <p className="text-sm text-gray-400">IAM {detailType === 'user' ? 'User' : 'Role'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                {/* User Detail */}
                {detailType === 'user' && (<>
                  <Section title="User" icon={Users}>
                    {selected.account_id && isMultiAccount && (
                      <Row label="Account" value={selected.account_id} />
                    )}
                    <Row label="Name" value={selected.name} />
                    <Row label="User ID" value={selected.user_id} />
                    <Row label="ARN" value={selected.arn} />
                    <Row label="Path" value={selected.path} />
                    <Row label="Created" value={selected.create_date ? new Date(selected.create_date).toLocaleString() : '--'} />
                    <Row label="Password Last Used" value={selected.password_last_used ? new Date(selected.password_last_used).toLocaleString() : 'Never'} />
                  </Section>
                </>)}

                {/* Role Detail */}
                {detailType === 'role' && (<>
                  <Section title="Role" icon={Shield}>
                    {selected.account_id && isMultiAccount && (
                      <Row label="Account" value={selected.account_id} />
                    )}
                    <Row label="Name" value={selected.name} />
                    <Row label="Role ID" value={selected.role_id} />
                    <Row label="ARN" value={selected.arn} />
                    <Row label="Path" value={selected.path} />
                    <Row label="Description" value={selected.description || '--'} />
                    <Row label="Created" value={selected.create_date ? new Date(selected.create_date).toLocaleString() : '--'} />
                    <Row label="Max Session" value={selected.max_session_duration ? `${selected.max_session_duration / 3600}h` : '--'} />
                    {selected.permissions_boundary_arn && <Row label="Permissions Boundary" value={selected.permissions_boundary_arn} />}
                  </Section>

                  <Section title="Last Used" icon={Clock}>
                    <Row label="Date" value={selected.role_last_used_date ? new Date(selected.role_last_used_date).toLocaleString() : 'Never'} />
                    <Row label="Region" value={selected.role_last_used_region || '--'} />
                  </Section>

                  {parseArray(selected.instance_profile_arns).length > 0 && (
                    <Section title="Instance Profiles" icon={Users}>
                      <div className="space-y-1">
                        {parseArray(selected.instance_profile_arns).map((arn: string, i: number) => (
                          <div key={i} className="text-xs font-mono text-gray-300 pl-2 border-l border-navy-600">
                            {arn.split('/').pop() || arn}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Trust Policy" icon={Shield}>
                    {(() => {
                      const policy = parseJson(selected.assume_role_policy_document);
                      if (policy) {
                        return (
                          <pre className="text-xs font-mono text-gray-300 bg-navy-800 rounded p-3 overflow-x-auto max-h-64">
                            {JSON.stringify(policy, null, 2)}
                          </pre>
                        );
                      }
                      return <p className="text-gray-500 text-sm">--</p>;
                    })()}
                  </Section>
                </>)}

                {/* Tags (common) */}
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
