'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useAccountContext } from '@/contexts/AccountContext';
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Shield, Copy } from 'lucide-react';

interface AccountEntry {
  accountId: string;
  alias: string;
  connectionName: string;
  region: string;
  isHost: boolean;
  features: { costEnabled: boolean; eksEnabled: boolean; k8sEnabled: boolean };
  profile?: string;
}

const REGIONS = [
  'ap-northeast-2',
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'ap-northeast-1',
  'ap-southeast-1',
  'eu-central-1',
  'us-east-2',
  'ap-south-1',
  'sa-east-1',
];

const ALIAS_PATTERN = /^[\w\s-]+$/;

export default function AccountsPage() {
  const { refetchAccounts } = useAccountContext();
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Form states
  const [newAccountId, setNewAccountId] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newRegion, setNewRegion] = useState('ap-northeast-2');
  const [newRoleName, setNewRoleName] = useState('AWSopsReadOnlyRole');

  // Test/add states
  const [testing, setTesting] = useState<string | null>(null);
  const [tableTestResult, setTableTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [formTestResult, setFormTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hostAlias, setHostAlias] = useState('Host');
  const [initingHost, setInitingHost] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch('/awsops/api/steampipe?action=accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {
      setPageError('Failed to load accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Admin access check / 관리자 접근 확인
  useEffect(() => {
    fetch('/awsops/api/steampipe?action=admin-check')
      .then(r => r.json())
      .then(d => {
        if (!d.isAdmin) setAccessDenied(true);
      })
      .catch(() => setAccessDenied(true));
  }, []);

  useEffect(() => {
    if (!accessDenied) fetchAccounts();
  }, [fetchAccounts, accessDenied]);

  // Access denied screen / 접근 거부 화면
  if (accessDenied) {
    return (
      <div className="p-6 animate-fade-in">
        <Header title="Account Management" subtitle="Multi-account configuration" />
        <div className="flex flex-col items-center justify-center mt-20">
          <Shield size={48} className="text-accent-red mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm text-center max-w-md">
            You do not have permission to access this page.<br />
            Contact your administrator to request access.
          </p>
          <p className="text-gray-500 text-xs mt-4 font-mono">
            Admin access is configured via <code className="text-accent-cyan">adminEmails</code> in data/config.json
          </p>
        </div>
      </div>
    );
  }

  const testConnection = async (accountId: string, source: 'table' | 'form') => {
    setTesting(accountId);
    if (source === 'table') setTableTestResult(null);
    else setFormTestResult(null);
    try {
      const res = await fetch('/awsops/api/steampipe?action=test-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, roleName: newRoleName }),
      });
      const data = await res.json();
      if (source === 'table') setTableTestResult(data);
      else setFormTestResult(data);
    } catch {
      const result = { success: false, message: 'Request failed' };
      if (source === 'table') setTableTestResult(result);
      else setFormTestResult(result);
    } finally {
      setTesting(null);
    }
  };

  const addAccount = async () => {
    if (!/^\d{12}$/.test(newAccountId) || !newAlias.trim()) return;
    if (!ALIAS_PATTERN.test(newAlias.trim())) {
      setFormTestResult({ success: false, message: 'Alias contains invalid characters. Use only letters, numbers, spaces, underscores, and hyphens.' });
      return;
    }
    setAdding(true);
    setPageError(null);
    try {
      const res = await fetch('/awsops/api/steampipe?action=add-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newAccountId,
          alias: newAlias,
          region: newRegion,
        }),
      });
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
        setNewAccountId('');
        setNewAlias('');
        setFormTestResult(null);
        await refetchAccounts();
      } else if (data.error) {
        setFormTestResult({ success: false, message: data.error });
      }
    } catch {
      setFormTestResult({ success: false, message: 'Failed to add account' });
    } finally {
      setAdding(false);
    }
  };

  const removeAccount = async (accountId: string) => {
    setRemoving(accountId);
    setConfirmingRemove(null);
    setPageError(null);
    try {
      const res = await fetch('/awsops/api/steampipe?action=remove-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
        await refetchAccounts();
      }
    } catch {
      setPageError('Failed to remove account. Please try again.');
    } finally {
      setRemoving(null);
    }
  };

  const initHost = async () => {
    setInitingHost(true);
    setPageError(null);
    try {
      const res = await fetch('/awsops/api/steampipe?action=init-host', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: hostAlias }),
      });
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
        await refetchAccounts();
      }
      if (data.error) setPageError(data.error);
    } catch {
      setPageError('Failed to initialize host account. Please try again.');
    } finally {
      setInitingHost(false);
    }
  };

  const hostAccountId = accounts.find(a => a.isHost)?.accountId || '<HOST_ACCOUNT_ID>';

  const cfnCommand = `aws cloudformation deploy \\
  --template-file infra-cdk/cfn-target-account-role.yaml \\
  --stack-name awsops-target-role \\
  --parameter-overrides HostAccountId=${hostAccountId} \\
  --capabilities CAPABILITY_NAMED_IAM`;

  const copyCommand = () => {
    navigator.clipboard.writeText(cfnCommand).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const aliasInvalid = newAlias.length > 0 && !ALIAS_PATTERN.test(newAlias);
  const isFormValid = /^\d{12}$/.test(newAccountId) && newAlias.trim().length > 0 && !aliasInvalid;

  return (
    <div className="flex flex-col h-screen bg-navy-900 overflow-hidden">
      <Header title="Account Management" subtitle="Manage AWS accounts for cross-account monitoring" onRefresh={fetchAccounts} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Page-level error banner */}
        {pageError && (
          <div className="px-4 py-3 rounded-lg flex items-center gap-2 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle size={16} />
            {pageError}
          </div>
        )}

        {/* Host Account Registration — only if no host */}
        {!accounts.some(a => a.isHost) && (
          <div className="bg-navy-800 rounded-lg border border-amber-500/30 p-6 mb-6">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-400 mb-1">Host Account Setup Required</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Register the host account (where AWSops is running) to enable multi-account monitoring.
                  The host account will be auto-detected from the EC2 instance credentials.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={hostAlias}
                    onChange={e => setHostAlias(e.target.value)}
                    placeholder="Host account alias (e.g., Production)"
                    className="px-3 py-2 bg-navy-700 border border-navy-600 rounded-lg text-sm text-gray-200 focus:border-cyan-500 focus:outline-none w-64"
                  />
                  <button
                    onClick={initHost}
                    disabled={initingHost}
                    className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-sm hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                  >
                    {initingHost ? 'Detecting...' : 'Detect & Register Host'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Current Accounts Table */}
        <div className="bg-navy-800 rounded-xl border border-navy-600 overflow-hidden">
          <div className="px-6 py-4 border-b border-navy-600">
            <h2 className="text-lg font-semibold text-white">Registered Accounts</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {accounts.length} account{accounts.length !== 1 ? 's' : ''} configured
            </p>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-gray-500">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No accounts configured. Add your first account below.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-navy-600">
                    <th className="px-6 py-3">Alias</th>
                    <th className="px-6 py-3">Account ID</th>
                    <th className="px-6 py-3">Region</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Features</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.accountId} className="border-b border-navy-700 hover:bg-navy-700/30 transition-colors">
                      <td className="px-6 py-3">
                        <span className="text-gray-200 font-medium">{acc.alias}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-gray-400 font-mono text-sm">{acc.accountId}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-gray-400 text-sm">{acc.region}</span>
                      </td>
                      <td className="px-6 py-3">
                        {acc.isHost ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            <Shield size={10} />
                            Host
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Target
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1.5">
                          {acc.features.costEnabled && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20">Cost</span>
                          )}
                          {acc.features.eksEnabled && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">EKS</span>
                          )}
                          {acc.features.k8sEnabled && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">K8s</span>
                          )}
                          {!acc.features.costEnabled && !acc.features.eksEnabled && !acc.features.k8sEnabled && (
                            <span className="text-[10px] text-gray-600">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => testConnection(acc.accountId, 'table')}
                            disabled={testing === acc.accountId}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
                          >
                            {testing === acc.accountId ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            Test
                          </button>
                          {!acc.isHost && (
                            confirmingRemove === acc.accountId ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                                Remove {acc.alias}?
                                <button
                                  onClick={() => removeAccount(acc.accountId)}
                                  disabled={removing === acc.accountId}
                                  className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmingRemove(null)}
                                  className="px-2 py-1 rounded text-xs bg-navy-600 text-gray-400 border border-navy-500 hover:bg-navy-500 transition-colors"
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmingRemove(acc.accountId)}
                                disabled={removing === acc.accountId}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                              >
                                <Trash2 size={12} />
                                Remove
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Test result banner for table */}
          {tableTestResult && testing === null && (
            <div className={`mx-6 mb-4 mt-2 px-4 py-3 rounded-lg flex items-center gap-2 text-sm ${
              tableTestResult.success
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {tableTestResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {tableTestResult.message}
            </div>
          )}
        </div>

        {/* Add Account Form */}
        <div className="bg-navy-800 rounded-xl border border-navy-600 overflow-hidden">
          <div className="px-6 py-4 border-b border-navy-600">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Plus size={18} className="text-cyan-400" />
              Add New Account
            </h2>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Account ID */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Account ID</label>
                <input
                  type="text"
                  value={newAccountId}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setNewAccountId(v);
                  }}
                  placeholder="123456789012"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none font-mono text-sm placeholder-gray-600"
                />
                {newAccountId.length > 0 && newAccountId.length !== 12 && (
                  <p className="text-xs text-red-400 mt-1">Must be exactly 12 digits ({newAccountId.length}/12)</p>
                )}
              </div>

              {/* Alias */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Alias</label>
                <input
                  type="text"
                  value={newAlias}
                  onChange={e => setNewAlias(e.target.value)}
                  placeholder="e.g., Production, Staging, Dev"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                />
                {aliasInvalid && (
                  <p className="text-xs text-red-400 mt-1">Alias can only contain letters, numbers, spaces, underscores, and hyphens.</p>
                )}
              </div>

              {/* Region */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Region</label>
                <select
                  value={newRegion}
                  onChange={e => setNewRegion(e.target.value)}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm"
                >
                  {REGIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Role Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Role Name</label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  placeholder="AWSopsReadOnlyRole"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => testConnection(newAccountId, 'form')}
                disabled={!/^\d{12}$/.test(newAccountId) || testing !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Test Connection
              </button>

              <button
                onClick={addAccount}
                disabled={!isFormValid || adding}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {adding ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Add Account
              </button>
            </div>

            {/* Test result for form */}
            {formTestResult && (
              <div className={`px-4 py-3 rounded-lg flex items-center gap-2 text-sm ${
                formTestResult.success
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {formTestResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {formTestResult.message}
              </div>
            )}
          </div>
        </div>

        {/* CFN Deploy Instructions */}
        <div className="bg-navy-800 rounded-xl border border-navy-600 overflow-hidden">
          <div className="px-6 py-4 border-b border-navy-600">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Shield size={18} className="text-orange-400" />
              Target Account Setup
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Deploy the IAM role in the target account before adding it here
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-300">
                Run this CloudFormation command in the <span className="text-cyan-400">target account</span> to create the cross-account IAM role:
              </p>

              <div className="relative">
                <pre className="bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-sm text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                  {cfnCommand}
                </pre>
                <button
                  onClick={copyCommand}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-navy-700 border border-navy-600 text-gray-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="bg-navy-900/50 border border-navy-600 rounded-lg px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</p>
              <ol className="text-sm text-gray-400 space-y-1.5 list-decimal list-inside">
                <li>Deploy the CloudFormation stack in the target account</li>
                <li>Enter the target account ID and alias above</li>
                <li>Click <span className="text-cyan-400">Test Connection</span> to verify AssumeRole access</li>
                <li>Click <span className="text-green-400">Add Account</span> to register the account</li>
                <li>Configure Steampipe connection for the new account</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
