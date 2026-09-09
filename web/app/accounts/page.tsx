'use client';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { useI18n } from '@/components/shell/LanguageProvider';
import { localeOf } from '@/lib/i18n';

// Admin-only multi-account registration. The /api/accounts route is the real admin gate
// (403 → denied here). Cross-account reads assume AWSopsReadOnlyRole in each target using its
// ExternalId (a confused-deputy guard, not a secret). See the onboarding guide below.

interface Account {
  accountId: string; alias: string; region: string; isHost: boolean;
  externalId: string | null; enabled: boolean; status: string; lastVerifiedAt: string | null;
}
interface AccountRegion { accountId: string; region: string; enabled: boolean }

const statusTone = (s: string): 'positive' | 'negative' | 'neutral' =>
  s === 'verified' ? 'positive' : s === 'error' ? 'negative' : 'neutral';

export default function AccountsPage() {
  const { lang } = useI18n();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [regions, setRegions] = useState<AccountRegion[]>([]);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ accountId: '', alias: '', region: 'ap-northeast-2', externalId: '', firstParty: false });
  const [regionForm, setRegionForm] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null); // v1-parity per-row connection re-test

  const load = useCallback(async () => {
    const [r, rr] = await Promise.all([fetch('/api/accounts'), fetch('/api/accounts/regions')]);
    if (r.status === 401 || r.status === 403) { setDenied(true); return; }
    const d = await r.json().catch(() => ({ accounts: [] }));
    setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
    const rd = rr.ok ? await rr.json().catch(() => ({ regions: [] })) : { regions: [] };
    setRegions(Array.isArray(rd.regions) ? rd.regions : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`실패: ${d.message || r.status}`); return; }
      setMsg('등록·검증 완료'); setForm({ accountId: '', alias: '', region: 'ap-northeast-2', externalId: '', firstParty: false });
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm(`${id} 계정을 제거할까요?`)) return;
    const r = await fetch(`/api/accounts?accountId=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(`삭제 실패: ${d.message || r.status}`); return; }
    await load();
  };

  // v1-parity connection test: re-assume the registered role and refresh status/lastVerifiedAt.
  const testConnection = async (accountId: string) => {
    setTesting(accountId); setMsg('');
    try {
      const r = await fetch('/api/accounts', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? `${accountId} 연결 확인됨 (verified)` : `${accountId} 연결 실패: ${d.message || r.status}`);
      await load(); // status badge + last_verified_at reflect the outcome either way
    } finally { setTesting(null); }
  };

  const addRegion = async (accountId: string) => {
    const region = (regionForm[accountId] || '').trim();
    if (!region) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/accounts/regions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, region }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`리전 추가 실패: ${d.message || r.status}`); return; }
      setMsg('리전 추가 완료');
      setRegionForm((prev) => ({ ...prev, [accountId]: '' }));
      await load();
    } finally { setBusy(false); }
  };

  // account_regions is keyed by the concrete account id (the host included — its real 12-digit id,
  // not the 'self' alias), so match on it directly.
  const regionsFor = (accountId: string) =>
    regions.filter((r) => r.enabled && r.accountId === accountId).map((r) => r.region);

  if (denied) {
    return (
      <div className="p-6">
        <PageHeader title="계정 관리" subtitle="Multi-account registration" />
        <Card className="p-6 text-[13px] text-ink-500">관리자만 접근할 수 있습니다 (Cognito ADMIN_GROUP 또는 SSM allowlist).</Card>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <PageHeader title="계정 관리" subtitle="연결된 AWS 계정 (크로스계정 read-only via AWSopsReadOnlyRole)" />

      <Card className="p-4">
        <div className="text-[13px] font-semibold text-ink-800 mb-3">등록된 계정</div>
        {accounts === null && <div className="text-[12px] text-ink-400">로딩 중…</div>}
        {accounts !== null && accounts.length === 0 && <div className="text-[12px] text-ink-400">등록된 계정이 없습니다.</div>}
        {accounts && accounts.length > 0 && (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-ink-400">
                <th className="py-1">Alias</th><th>Account ID</th><th>Regions</th><th>상태</th><th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.accountId} className="border-t border-ink-100">
                  <td className="py-1.5">{a.alias}{a.isHost && <span className="ml-1 text-ink-400">(host)</span>}</td>
                  <td className="font-mono">{a.accountId}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1">
                      {(regionsFor(a.accountId).length ? regionsFor(a.accountId) : [a.region]).map((region) => (
                        <span key={region} className="rounded border border-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">{region}</span>
                      ))}
                    </div>
                  </td>
                  <td title={a.lastVerifiedAt ? `마지막 검증: ${new Date(a.lastVerifiedAt).toLocaleString(localeOf(lang))}` : '검증 이력 없음'}>
                    <Badge tone={statusTone(a.status)} variant="soft">{a.status}</Badge>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        aria-label={`${a.alias} 연결 테스트`}
                        onClick={() => testConnection(a.accountId)}
                        disabled={testing !== null}
                        className="rounded border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                      >
                        {testing === a.accountId ? '테스트 중…' : '테스트'}
                      </button>
                      <input
                        aria-label={`${a.alias} 추가 리전`}
                        className="w-28 rounded border border-ink-200 bg-card px-1.5 py-1 text-[11px] text-ink-800"
                        placeholder="us-east-1"
                        value={regionForm[a.accountId] || ''}
                        onChange={(e) => setRegionForm({ ...regionForm, [a.accountId]: e.target.value.trim() })}
                      />
                      <button
                        aria-label={`${a.alias} 리전 추가`}
                        onClick={() => addRegion(a.accountId)}
                        disabled={busy}
                        className="rounded border border-ink-200 px-2 py-1 text-[11px] text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                      >
                        리전 추가
                      </button>
                      {!a.isHost && (
                        <button onClick={() => remove(a.accountId)} className="text-[11px] text-negative-600 hover:underline">제거</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        <div className="text-[13px] font-semibold text-ink-800">계정 추가</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="border border-ink-200 bg-card rounded px-2 py-1 text-[12px] font-mono text-ink-800" placeholder="Account ID (12 digits)" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value.trim() })} />
          <input className="border border-ink-200 bg-card rounded px-2 py-1 text-[12px] text-ink-800" placeholder="Alias" value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} />
          <input className="border border-ink-200 bg-card rounded px-2 py-1 text-[12px] text-ink-800" placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value.trim() })} />
          <input className="border border-ink-200 bg-card rounded px-2 py-1 text-[12px] text-ink-800" placeholder="ExternalId (optional, 1st-party)" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value.trim() })} />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-ink-500">
          <input type="checkbox" checked={form.firstParty} onChange={(e) => setForm({ ...form, firstParty: e.target.checked })} />
          1st-party 계정 (ExternalId 생략) — 대상 trust가 호스트 task-role ARN을 정확히 핀할 때만. 3rd-party는 ExternalId 필수.
        </label>
        <div className="flex items-center gap-3">
          <button onClick={add} disabled={busy} className="self-start rounded-md bg-brand-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {busy ? '검증 중…' : '추가 + 검증'}
          </button>
          {msg && <span className="text-[12px] text-ink-500">{msg}</span>}
        </div>
      </Card>

      <Card className="p-4 text-[12px] text-ink-600 flex flex-col gap-1">
        <div className="text-[13px] font-semibold text-ink-800 mb-1">타깃 계정 온보딩</div>
        <p>각 타깃 계정에 <code>AWSopsReadOnlyRole</code>을 배포해야 합니다 (호스트 web task role 신뢰 + ReadOnlyAccess). <strong>1st-party</strong>(같은 조직, trust가 호스트 task-role ARN을 정확히 핀)는 ExternalId를 생략할 수 있고, <strong>3rd-party/공유</strong> 계정은 ExternalId 조건이 필요합니다 (ADR-011).</p>
        <p>CloudFormation 템플릿: <code>infra/cfn/awsops-target-account-role.yaml</code> — 배포 가이드는 <code>docs/runbooks/onboard-target-account.md</code> 참조.</p>
        <p className="text-ink-400">배포 후 위 폼에 Account ID·Alias·Region을 입력하면 assume를 검증(상태=verified)한 뒤 등록합니다. ExternalId는 선택(1st-party는 생략 가능)이며 confused-deputy 가드일 뿐 비밀이 아닙니다.</p>
      </Card>
    </div>
  );
}
