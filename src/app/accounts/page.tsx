'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import DataTable from '@/components/table/DataTable';
import { Building2, Plus, Trash2, Shield, ExternalLink, Copy, Check, X, Loader2 } from 'lucide-react';

interface Account {
  accountId: string;
  alias: string;
  connectionName: string;
  profile?: string;
  region: string;
  isHost?: boolean;
  features: { costEnabled: boolean; eksEnabled: boolean; k8sEnabled: boolean };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ accountId: '', alias: '', region: 'ap-northeast-2', roleArn: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hostAccountId, setHostAccountId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; identity?: string } | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/awsops/api/steampipe?action=accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
      const host = (data.accounts || []).find((a: Account) => a.isHost);
      if (host) setHostAccountId(host.accountId);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleTest = async () => {
    if (!/^\d{12}$/.test(addForm.accountId)) { setTestResult({ success: false, message: '12자리 Account ID를 입력하세요' }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/awsops/api/steampipe?action=test-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: addForm.accountId,
          roleArn: addForm.roleArn || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: 'AssumeRole 성공', identity: data.identity });
      } else {
        setTestResult({ success: false, message: data.error || 'AssumeRole 실패' });
      }
    } catch (err: unknown) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Network error' });
    } finally { setTesting(false); }
  };

  const handleAdd = async () => {
    if (!/^\d{12}$/.test(addForm.accountId)) { setAddError('12자리 AWS Account ID를 입력하세요'); return; }
    if (!addForm.alias.trim()) { setAddError('별칭(Alias)을 입력하세요'); return; }

    setAdding(true);
    setAddError('');
    setAddSuccess('');
    try {
      const res = await fetch('/awsops/api/steampipe?action=add-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          roleArn: addForm.roleArn || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || 'Failed to add account');
        return;
      }
      setAddSuccess(`${addForm.alias} (${addForm.accountId}) 추가 완료. 빌드 후 적용됩니다.`);
      setAddForm({ accountId: '', alias: '', region: 'ap-northeast-2', roleArn: '' });
      setTestResult(null);
      setShowAdd(false);
      fetchAccounts();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Network error');
    } finally { setAdding(false); }
  };

  const handleRemove = async (accountId: string, alias: string) => {
    if (!confirm(`${alias} (${accountId}) 어카운트를 제거하시겠습니까?`)) return;
    setRemoving(accountId);
    try {
      await fetch('/awsops/api/steampipe?action=remove-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      fetchAccounts();
    } catch {} finally { setRemoving(null); }
  };

  const cfnCommand = `aws cloudformation deploy \\
  --template-file infra-cdk/cfn-target-account-role.yaml \\
  --stack-name awsops-target-role \\
  --parameter-overrides HostAccountId=${hostAccountId || '<HOST_ACCOUNT_ID>'} \\
  --capabilities CAPABILITY_NAMED_IAM`;

  const copyCommand = () => {
    navigator.clipboard.writeText(cfnCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hostCount = accounts.filter(a => a.isHost).length;
  const targetCount = accounts.filter(a => !a.isHost).length;
  const costCount = accounts.filter(a => a.features.costEnabled).length;
  const _eksCount = accounts.filter(a => a.features.eksEnabled).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Account Management" subtitle="멀티 어카운트 관리 — Cross-Account IAM Role 기반" onRefresh={fetchAccounts} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard label="Total Accounts" value={accounts.length} icon={Building2} color="cyan" />
        <StatsCard label="Host Account" value={hostCount} icon={Shield} color="green" />
        <StatsCard label="Target Accounts" value={targetCount} icon={ExternalLink} color="purple" />
        <StatsCard label="Cost Enabled" value={`${costCount} / ${accounts.length}`} icon={Building2} color="orange" />
      </div>

      {/* Account List */}
      <div className="bg-navy-800 rounded-lg border border-navy-600 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-600">
          <h2 className="text-sm font-semibold text-white">Registered Accounts</h2>
          <button
            onClick={() => { setShowAdd(!showAdd); setAddError(''); setAddSuccess(''); }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/20 transition-colors"
          >
            <Plus size={14} />
            Add Account
          </button>
        </div>

        <DataTable
          columns={[
            { key: 'alias', label: 'Alias', render: (v: string, row: Account) => (
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{v}</span>
                {row.isHost && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green border border-accent-green/20">HOST</span>
                )}
              </div>
            )},
            { key: 'accountId', label: 'Account ID', render: (v: string) => (
              <span className="font-mono text-xs">{v}</span>
            )},
            { key: 'region', label: 'Region' },
            { key: 'connectionName', label: 'Connection', render: (v: string) => (
              <span className="font-mono text-xs text-gray-400">{v}</span>
            )},
            { key: 'features', label: 'Features', render: (_: unknown, row: Account) => (
              <div className="flex items-center gap-1.5">
                {row.features.costEnabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-orange/10 text-accent-orange">Cost</span>}
                {row.features.eksEnabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple">EKS</span>}
                {row.features.k8sEnabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan">K8s</span>}
                {!row.features.costEnabled && !row.features.eksEnabled && !row.features.k8sEnabled && (
                  <span className="text-[9px] text-gray-600">Basic</span>
                )}
              </div>
            )},
            { key: 'profile', label: 'Access', render: (v: string | undefined, row: Account) => (
              row.isHost ? <StatusBadge status="local" /> : <StatusBadge status={v ? 'ready' : 'pending'} />
            )},
            { key: '_actions', label: '', render: (_: unknown, row: Account) => (
              !row.isHost ? (
                <button
                  onClick={() => handleRemove(row.accountId, row.alias)}
                  disabled={removing === row.accountId}
                  className="p-1 text-gray-600 hover:text-accent-red transition-colors disabled:opacity-50"
                  title="Remove account"
                >
                  {removing === row.accountId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              ) : null
            )},
          ]}
          data={loading ? undefined : accounts}
        />
      </div>

      {/* Add Account Form */}
      {showAdd && (
        <div className="bg-navy-800 rounded-lg border border-accent-cyan/30 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Plus size={16} className="text-accent-cyan" />
              Add Target Account
            </h3>
            <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {/* Prerequisites */}
          <div className="bg-navy-900 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-accent-orange">Prerequisites — Target 어카운트에서 먼저 실행</p>
            <div className="relative">
              <pre className="text-[11px] text-gray-400 font-mono bg-navy-700 rounded p-3 overflow-x-auto whitespace-pre-wrap">{cfnCommand}</pre>
              <button
                onClick={copyCommand}
                className="absolute top-2 right-2 p-1 rounded bg-navy-600 text-gray-400 hover:text-white transition-colors"
              >
                {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-600">
              또는 AWS 콘솔 &gt; CloudFormation &gt; Create Stack &gt; Upload: <code className="text-accent-cyan">infra-cdk/cfn-target-account-role.yaml</code>
            </p>
          </div>

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Account ID *</label>
              <input
                type="text"
                placeholder="123456789012"
                value={addForm.accountId}
                onChange={e => { setAddForm({ ...addForm, accountId: e.target.value.replace(/\D/g, '').slice(0, 12) }); setTestResult(null); }}
                className="w-full px-3 py-2 text-sm rounded-lg bg-navy-700 border border-navy-600 text-white placeholder-gray-500 focus:border-accent-cyan/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Alias *</label>
              <input
                type="text"
                placeholder="e.g., Dev, Staging, Production"
                value={addForm.alias}
                onChange={e => setAddForm({ ...addForm, alias: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-navy-700 border border-navy-600 text-white placeholder-gray-500 focus:border-accent-cyan/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Role ARN</label>
              <input
                type="text"
                placeholder={`arn:aws:iam::${addForm.accountId || '123456789012'}:role/AWSopsReadOnlyRole`}
                value={addForm.roleArn}
                onChange={e => { setAddForm({ ...addForm, roleArn: e.target.value }); setTestResult(null); }}
                className="w-full px-3 py-2 text-sm rounded-lg bg-navy-700 border border-navy-600 text-white placeholder-gray-500 focus:border-accent-cyan/50 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-600 mt-1">비워두면 기본값: arn:aws:iam::{'{AccountID}'}:role/AWSopsReadOnlyRole</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Region</label>
              <input
                type="text"
                placeholder="ap-northeast-2"
                value={addForm.region}
                onChange={e => setAddForm({ ...addForm, region: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-navy-700 border border-navy-600 text-white placeholder-gray-500 focus:border-accent-cyan/50 outline-none"
              />
            </div>
          </div>

          {/* Connection Test */}
          <div className="bg-navy-900 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">Connection Test</p>
              <button
                onClick={handleTest}
                disabled={testing || !addForm.accountId}
                className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-navy-700 border border-navy-600 text-gray-300 hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                {testing ? 'Testing...' : 'Test AssumeRole'}
              </button>
            </div>
            {testResult && (
              <div className={`flex items-start gap-2 px-3 py-2 rounded-lg ${
                testResult.success ? 'bg-accent-green/10 border border-accent-green/20' : 'bg-accent-red/10 border border-accent-red/20'
              }`}>
                {testResult.success ? <Check size={14} className="text-accent-green mt-0.5" /> : <X size={14} className="text-accent-red mt-0.5" />}
                <div>
                  <p className={`text-xs ${testResult.success ? 'text-accent-green' : 'text-accent-red'}`}>{testResult.message}</p>
                  {testResult.identity && (
                    <p className="text-[10px] text-gray-500 font-mono mt-1">{testResult.identity}</p>
                  )}
                </div>
              </div>
            )}
            {!testResult && !testing && (
              <p className="text-[10px] text-gray-600">Account ID와 Role ARN을 입력한 후 테스트를 실행하세요. 어카운트 추가 전에 연결 확인을 권장합니다.</p>
            )}
          </div>

          {addError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-red/10 border border-accent-red/20">
              <X size={14} className="text-accent-red" />
              <p className="text-xs text-accent-red">{addError}</p>
            </div>
          )}

          {addSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-green/10 border border-accent-green/20">
              <Check size={14} className="text-accent-green" />
              <p className="text-xs text-accent-green">{addSuccess}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-xs rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/20 transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {adding ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </div>
      )}

      {/* Architecture Info */}
      <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
        <h3 className="text-xs font-semibold text-gray-400 mb-3">Architecture</h3>
        <pre className="text-[11px] text-gray-500 font-mono leading-relaxed">{`
  Target Account                    Host Account (${hostAccountId || 'this'})
  ┌─────────────────────┐                 ┌──────────────────────────────┐
  │ AWSopsReadOnlyRole  │◄── AssumeRole ──│ EC2 Instance Role            │
  │  ReadOnlyAccess     │                 │  + sts:AssumeRole            │
  │  + Cost Explorer    │                 │                              │
  │  + CloudWatch       │                 │ Steampipe (search_path)      │
  │                     │                 │  aws_XXXX ──► Target data    │
  │  Trust Policy:      │                 │  aws (aggregator) ──► All    │
  │  Host Account       │                 └──────────────────────────────┘
  └─────────────────────┘
        `.trim()}</pre>
      </div>
    </div>
  );
}
