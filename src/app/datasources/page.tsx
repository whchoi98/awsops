'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Database, Activity, FileText, Waypoints, Plus, Trash2, Edit3,
  Check, X, RefreshCw, TestTube, Shield, CheckCircle, XCircle, Settings, Lock,
  Radar, Gauge, Dog, Globe, Info, Stethoscope,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// --- Types / 타입 ---

type DatasourceType = 'prometheus' | 'loki' | 'tempo' | 'clickhouse' | 'jaeger' | 'dynatrace' | 'datadog';

interface DatasourceAuth {
  type: 'none' | 'basic' | 'bearer' | 'custom-header';
  username?: string;
  password?: string;
  token?: string;
  headerName?: string;
  headerValue?: string;
}

interface DatasourceSettings {
  timeout?: number;
  cacheTTL?: number;
  database?: string;
}

interface DatasourceEntry {
  id: string;
  name: string;
  type: DatasourceType;
  url: string;
  isDefault?: boolean;
  auth?: DatasourceAuth;
  settings?: DatasourceSettings;
  createdAt: string;
  updatedAt: string;
}

// --- Type icon/color registry / 타입 아이콘/색상 레지스트리 ---

const TYPE_ICONS: Record<DatasourceType, any> = {
  prometheus: Activity,
  loki: FileText,
  tempo: Waypoints,
  clickhouse: Database,
  jaeger: Radar,
  dynatrace: Gauge,
  datadog: Dog,
};

const TYPE_COLORS: Record<DatasourceType, string> = {
  prometheus: 'text-accent-orange',
  loki: 'text-accent-green',
  tempo: 'text-accent-cyan',
  clickhouse: 'text-accent-purple',
  jaeger: 'text-accent-cyan',
  dynatrace: 'text-accent-green',
  datadog: 'text-accent-purple',
};

const TYPE_BG_COLORS: Record<DatasourceType, string> = {
  prometheus: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  loki: 'bg-green-500/10 text-green-400 border-green-500/20',
  tempo: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  clickhouse: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  jaeger: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  dynatrace: 'bg-green-500/10 text-green-400 border-green-500/20',
  datadog: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const TYPE_LABELS: Record<DatasourceType, string> = {
  prometheus: 'Prometheus',
  loki: 'Loki',
  tempo: 'Tempo',
  clickhouse: 'ClickHouse',
  jaeger: 'Jaeger',
  dynatrace: 'Dynatrace',
  datadog: 'Datadog',
};

const TYPE_PLACEHOLDERS: Record<DatasourceType, string> = {
  prometheus: 'http://prometheus:9090',
  loki: 'http://loki:3100',
  tempo: 'http://tempo:3200',
  clickhouse: 'http://clickhouse:8123',
  jaeger: 'http://jaeger:16686',
  dynatrace: 'https://abc12345.live.dynatrace.com',
  datadog: 'https://api.datadoghq.com',
};

const AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'custom-header', label: 'Custom Header' },
] as const;

const ALL_TYPES: DatasourceType[] = ['prometheus', 'loki', 'tempo', 'clickhouse', 'jaeger', 'dynatrace', 'datadog'];

// --- Empty form state / 빈 폼 상태 ---

function emptyForm(): Omit<DatasourceEntry, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '',
    type: 'prometheus',
    url: '',
    isDefault: false,
    auth: { type: 'none' },
    settings: { timeout: 30000, cacheTTL: 60 },
  };
}

// ============================================================================
// Main page component / 메인 페이지 컴포넌트
// ============================================================================

export default function DatasourcesPage() {
  const { t } = useLanguage();
  const router = useRouter();

  // --- State ---
  const [datasources, setDatasources] = useState<DatasourceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);

  // Panel state / 패널 상태
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  // Test connection / 연결 테스트
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Save/delete state / 저장/삭제 상태
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Allowed networks state / 허용 네트워크 상태
  const [allowedNetworks, setAllowedNetworks] = useState<string[]>([]);
  const [newNetwork, setNewNetwork] = useState('');
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [networkSaving, setNetworkSaving] = useState(false);

  // --- Data loading / 데이터 로딩 ---

  const loadDatasources = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch('/awsops/api/datasources?action=list');
      if (res.status === 403) {
        setIsAdmin(false);
        setAccessChecked(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setDatasources(data.datasources || []);
      if (data.isAdmin !== undefined) setIsAdmin(data.isAdmin);
      setAccessChecked(true);
    } catch {
      setPageError('Failed to load datasources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDatasources(); }, [loadDatasources]);

  // Load allowed networks (admin-only) / 허용 네트워크 로딩 (관리자 전용)
  const loadAllowedNetworks = useCallback(async () => {
    try {
      const res = await fetch('/awsops/api/datasources?action=allowlist');
      if (res.ok) {
        const data = await res.json();
        setAllowedNetworks(data.allowedNetworks || []);
      }
    } catch { /* non-admin or error — ignore */ }
  }, []);

  useEffect(() => { if (isAdmin) loadAllowedNetworks(); }, [isAdmin, loadAllowedNetworks]);

  // --- Stats / 통계 ---

  const stats = useMemo(() => {
    const total = datasources.length;
    const byType = (type: DatasourceType) => datasources.filter(d => d.type === type).length;
    return { total, prometheus: byType('prometheus'), loki: byType('loki'), tempo: byType('tempo'), clickhouse: byType('clickhouse') };
  }, [datasources]);

  // --- Panel helpers / 패널 헬퍼 ---

  const openAddPanel = () => {
    setEditingId(null);
    setForm(emptyForm());
    setTestResult(null);
    setPanelOpen(true);
  };

  const openEditPanel = (ds: DatasourceEntry) => {
    setEditingId(ds.id);
    setForm({
      name: ds.name,
      type: ds.type,
      url: ds.url,
      isDefault: ds.isDefault || false,
      auth: ds.auth || { type: 'none' },
      settings: {
        timeout: ds.settings?.timeout || 30000,
        cacheTTL: ds.settings?.cacheTTL || 60,
        database: ds.settings?.database || '',
      },
    });
    setTestResult(null);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingId(null);
    setTestResult(null);
  };

  // --- Test connection / 연결 테스트 ---

  const handleTest = async () => {
    if (!form.url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/awsops/api/datasources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          datasource: {
            name: form.name || 'test',
            type: form.type,
            url: form.url,
            auth: form.auth,
            settings: form.settings,
          },
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: 'Request failed' });
    } finally {
      setTesting(false);
    }
  };

  // --- Save / 저장 ---

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    setPageError(null);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId
        ? { id: editingId, ...form }
        : { action: 'create', datasource: form };

      const res = await fetch('/awsops/api/datasources', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setPageError(data.error);
      } else {
        setDatasources(data.datasources || []);
        closePanel();
      }
    } catch {
      setPageError('Failed to save datasource');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete / 삭제 ---

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmDelete(null);
    setPageError(null);
    try {
      const res = await fetch(`/awsops/api/datasources?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        setPageError(data.error);
      } else {
        setDatasources(data.datasources || []);
      }
    } catch {
      setPageError('Failed to delete datasource');
    } finally {
      setDeleting(null);
    }
  };

  // --- Form updaters / 폼 업데이터 ---

  const updateForm = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));
  const updateAuth = (patch: Partial<DatasourceAuth>) =>
    setForm(prev => ({ ...prev, auth: { ...prev.auth!, ...patch } }));
  const updateSettings = (patch: Partial<DatasourceSettings>) =>
    setForm(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }));

  // --- Allowed networks handlers / 허용 네트워크 핸들러 ---

  const handleAddNetwork = async () => {
    const trimmed = newNetwork.trim();
    if (!trimmed) return;
    if (allowedNetworks.includes(trimmed)) {
      setNetworkError('Already in the list');
      return;
    }
    setNetworkSaving(true);
    setNetworkError(null);
    try {
      const updated = [...allowedNetworks, trimmed];
      const res = await fetch('/awsops/api/datasources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-allowlist', networks: updated }),
      });
      const data = await res.json();
      if (data.error) {
        setNetworkError(data.error);
      } else {
        setAllowedNetworks(data.allowedNetworks || updated);
        setNewNetwork('');
      }
    } catch {
      setNetworkError('Failed to update');
    } finally {
      setNetworkSaving(false);
    }
  };

  const handleRemoveNetwork = async (entry: string) => {
    setNetworkSaving(true);
    setNetworkError(null);
    try {
      const updated = allowedNetworks.filter(n => n !== entry);
      const res = await fetch('/awsops/api/datasources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-allowlist', networks: updated }),
      });
      const data = await res.json();
      if (data.error) {
        setNetworkError(data.error);
      } else {
        setAllowedNetworks(data.allowedNetworks || updated);
      }
    } catch {
      setNetworkError('Failed to update');
    } finally {
      setNetworkSaving(false);
    }
  };

  // --- Access denied / 접근 거부 ---

  if (accessChecked && !isAdmin && datasources.length === 0) {
    return (
      <div className="p-6 animate-fade-in">
        <Header title={t('datasources.title') !== 'datasources.title' ? t('datasources.title') : 'Datasource Management'} subtitle={t('datasources.subtitle') !== 'datasources.subtitle' ? t('datasources.subtitle') : 'Manage external datasource connections'} />
        <div className="flex flex-col items-center justify-center mt-20">
          <Shield size={48} className="text-accent-red mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm text-center max-w-md">
            You do not have permission to manage datasources.<br />
            Contact your administrator to request access.
          </p>
          <p className="text-gray-500 text-xs mt-4 font-mono">
            Admin access is configured via <code className="text-accent-cyan">adminEmails</code> in data/config.json
          </p>
        </div>
      </div>
    );
  }

  // --- Table columns / 테이블 컬럼 ---

  const columns = [
    {
      key: 'name',
      label: t('datasources.name') !== 'datasources.name' ? t('datasources.name') : 'Name',
      render: (value: string, row: DatasourceEntry) => {
        const Icon = TYPE_ICONS[row.type] || Database;
        const colorCls = TYPE_COLORS[row.type] || 'text-gray-400';
        return (
          <div className="flex items-center gap-2.5">
            <Icon size={16} className={colorCls} />
            <span className="text-white font-medium">{value}</span>
          </div>
        );
      },
    },
    {
      key: 'type',
      label: t('datasources.type') !== 'datasources.type' ? t('datasources.type') : 'Type',
      render: (value: DatasourceType) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_BG_COLORS[value] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
          {TYPE_LABELS[value] || value}
        </span>
      ),
    },
    {
      key: 'url',
      label: 'URL',
      render: (value: string) => (
        <span className="font-mono text-xs text-gray-400 truncate max-w-[280px] inline-block" title={value}>
          {value}
        </span>
      ),
    },
    {
      key: 'isDefault',
      label: t('datasources.default') !== 'datasources.default' ? t('datasources.default') : 'Default',
      render: (value: boolean) =>
        value ? <Check size={16} className="text-accent-green" /> : <span className="text-gray-700">--</span>,
    },
    ...(isAdmin
      ? [{
          key: '_actions',
          label: t('datasources.actions') !== 'datasources.actions' ? t('datasources.actions') : 'Actions',
          render: (_: any, row: DatasourceEntry) => (
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const msg = encodeURIComponent(`${row.name} (${row.url}) 연결을 진단해줘`);
                  router.push(`/awsops/ai?message=${msg}`);
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                title={t('datasources.diagnose') !== 'datasources.diagnose' ? t('datasources.diagnose') : 'Diagnose'}
              >
                <Stethoscope size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openEditPanel(row); }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
              >
                <Edit3 size={12} />
                {/* Edit / 편집 */}
              </button>
              {confirmDelete === row.id ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                  Delete?
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                    disabled={deleting === row.id}
                    className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                    className="px-2 py-1 rounded text-xs bg-navy-600 text-gray-400 border border-navy-500 hover:bg-navy-500 transition-colors"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(row.id); }}
                  disabled={deleting === row.id}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ),
        }]
      : []),
  ];

  // --- Render / 렌더 ---

  return (
    <div className="flex flex-col h-screen bg-navy-900 overflow-hidden">
      <Header
        title={t('datasources.title') !== 'datasources.title' ? t('datasources.title') : 'Datasource Management'}
        subtitle={t('datasources.subtitle') !== 'datasources.subtitle' ? t('datasources.subtitle') : 'Manage external datasource connections'}
        onRefresh={loadDatasources}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Error banner / 에러 배너 */}
        {pageError && (
          <div className="px-4 py-3 rounded-lg flex items-center gap-2 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle size={16} />
            {pageError}
            <button onClick={() => setPageError(null)} className="ml-auto text-red-400 hover:text-red-300">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Stats cards / 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            label={t('datasources.totalDatasources') !== 'datasources.totalDatasources' ? t('datasources.totalDatasources') : 'Total Datasources'}
            value={stats.total}
            icon={Database}
            color="cyan"
          />
          <StatsCard
            label="Prometheus"
            value={stats.prometheus}
            icon={Activity}
            color="orange"
          />
          <StatsCard
            label="Loki"
            value={stats.loki}
            icon={FileText}
            color="green"
          />
          <StatsCard
            label="ClickHouse"
            value={stats.clickhouse}
            icon={Database}
            color="purple"
          />
        </div>

        {/* Allowed Networks (admin-only) / 허용 네트워크 (관리자 전용) */}
        {isAdmin && (
          <div className="bg-navy-800 rounded-xl border border-navy-600 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={16} className="text-accent-cyan" />
              <h3 className="text-sm font-semibold text-white">
                {t('datasources.allowedNetworks') !== 'datasources.allowedNetworks' ? t('datasources.allowedNetworks') : 'Allowed Networks'}
              </h3>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {t('datasources.allowedNetworksDesc') !== 'datasources.allowedNetworksDesc'
                ? t('datasources.allowedNetworksDesc')
                : 'Allowlist for accessing datasources inside VPC (e.g. Private NLB). Route 53 Private Hosted Zone domains recommended.'}
            </p>

            {/* Current entries / 현재 항목 */}
            {allowedNetworks.length > 0 ? (
              <div className="space-y-1.5 mb-3">
                {allowedNetworks.map((entry) => (
                  <div key={entry} className="flex items-center justify-between px-3 py-2 rounded-lg bg-navy-900 border border-navy-600 group">
                    <span className="font-mono text-sm text-gray-300">{entry}</span>
                    <button
                      onClick={() => handleRemoveNetwork(entry)}
                      disabled={networkSaving}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                      title={t('datasources.removeNetwork') !== 'datasources.removeNetwork' ? t('datasources.removeNetwork') : 'Remove'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 mb-3 italic">
                {t('datasources.allowedNetworksEmpty') !== 'datasources.allowedNetworksEmpty'
                  ? t('datasources.allowedNetworksEmpty')
                  : 'No allowed networks configured'}
              </p>
            )}

            {/* Add new entry / 새 항목 추가 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newNetwork}
                onChange={(e) => { setNewNetwork(e.target.value); setNetworkError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNetwork(); }}
                placeholder={t('datasources.allowedNetworksPlaceholder') !== 'datasources.allowedNetworksPlaceholder'
                  ? t('datasources.allowedNetworksPlaceholder')
                  : '10.0.1.0/24 or prometheus.corp.internal'}
                className="flex-1 bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none font-mono text-sm placeholder-gray-600"
              />
              <button
                onClick={handleAddNetwork}
                disabled={networkSaving || !newNetwork.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30 transition-colors disabled:opacity-50"
              >
                {t('datasources.addNetwork') !== 'datasources.addNetwork' ? t('datasources.addNetwork') : 'Add'}
              </button>
            </div>

            {networkError && (
              <p className="text-xs text-red-400 mt-2">{networkError}</p>
            )}

            <div className="flex items-start gap-1.5 mt-3">
              <Info size={12} className="text-gray-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-500">
                {t('datasources.allowedNetworksHint') !== 'datasources.allowedNetworksHint'
                  ? t('datasources.allowedNetworksHint')
                  : 'Supports CIDR, IP address, hostname pattern (*.example.com)'}
              </p>
            </div>
          </div>
        )}

        {/* Add button + table header / 추가 버튼 + 테이블 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {t('datasources.registeredDatasources') !== 'datasources.registeredDatasources' ? t('datasources.registeredDatasources') : 'Registered Datasources'}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {stats.total} datasource{stats.total !== 1 ? 's' : ''} configured
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={openAddPanel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30 transition-colors"
            >
              <Plus size={16} />
              {t('datasources.addDatasource') !== 'datasources.addDatasource' ? t('datasources.addDatasource') : 'Add Datasource'}
            </button>
          )}
        </div>

        {/* Datasource table / 데이터소스 테이블 */}
        <DataTable
          columns={columns}
          data={loading ? undefined : datasources}
          onRowClick={isAdmin ? (row) => openEditPanel(row) : undefined}
        />

        {/* Empty state hint / 빈 상태 안내 */}
        {!loading && datasources.length === 0 && (
          <div className="bg-navy-800 rounded-xl border border-navy-600 p-8 text-center">
            <Database size={40} className="text-gray-600 mx-auto mb-3" />
            <h3 className="text-white font-semibold mb-1">No datasources configured</h3>
            <p className="text-gray-400 text-sm mb-4">
              Connect external datasources like Prometheus, Loki, Jaeger, Dynatrace, Datadog, or ClickHouse to enable advanced monitoring and querying.
            </p>
            {isAdmin && (
              <button
                onClick={openAddPanel}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30 transition-colors"
              >
                <Plus size={16} />
                Add your first datasource
              </button>
            )}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Slide-in Panel / 슬라이드인 패널 */}
      {/* ================================================================== */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={closePanel}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header / 패널 헤더 */}
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {editingId
                    ? (t('datasources.editDatasource') !== 'datasources.editDatasource' ? t('datasources.editDatasource') : 'Edit Datasource')
                    : (t('datasources.addDatasource') !== 'datasources.addDatasource' ? t('datasources.addDatasource') : 'Add Datasource')
                  }
                </h2>
                <p className="text-sm text-gray-400">
                  {editingId ? 'Modify datasource configuration' : 'Configure a new external datasource'}
                </p>
              </div>
              <button
                onClick={closePanel}
                className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">

              {/* Type selector (add mode only) / 타입 선택 (추가 모드만) */}
              {!editingId && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2 font-medium">
                    {t('datasources.selectType') !== 'datasources.selectType' ? t('datasources.selectType') : 'Datasource Type'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {ALL_TYPES.map(type => {
                      const Icon = TYPE_ICONS[type];
                      const colorCls = TYPE_COLORS[type];
                      const isSelected = form.type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            updateForm({ type, url: '' });
                            setTestResult(null);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                            isSelected
                              ? 'border-accent-cyan bg-accent-cyan/10 ring-1 ring-accent-cyan/30'
                              : 'border-navy-600 bg-navy-900 hover:border-navy-500 hover:bg-navy-700/50'
                          }`}
                        >
                          <Icon size={20} className={colorCls} />
                          <div className="text-left">
                            <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                              {TYPE_LABELS[type]}
                            </p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                              {{ prometheus: 'PromQL', loki: 'LogQL', tempo: 'TraceQL', clickhouse: 'SQL', jaeger: 'Traces', dynatrace: 'Metrics', datadog: 'Query' }[type]}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Name input / 이름 입력 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  {t('datasources.name') !== 'datasources.name' ? t('datasources.name') : 'Name'}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder={`e.g., Production ${TYPE_LABELS[form.type]}`}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                />
              </div>

              {/* URL input / URL 입력 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">URL</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => { updateForm({ url: e.target.value }); setTestResult(null); }}
                  placeholder={TYPE_PLACEHOLDERS[form.type]}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none font-mono text-sm placeholder-gray-600"
                />
              </div>

              {/* Auth section / 인증 섹션 */}
              <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={14} className="text-accent-cyan" />
                  <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">
                    {t('datasources.authentication') !== 'datasources.authentication' ? t('datasources.authentication') : 'Authentication'}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Auth Type</label>
                    <select
                      value={form.auth?.type || 'none'}
                      onChange={(e) => updateAuth({ type: e.target.value as DatasourceAuth['type'] })}
                      className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm"
                    >
                      {AUTH_TYPES.map(at => (
                        <option key={at.value} value={at.value}>{at.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Basic auth fields / 기본 인증 필드 */}
                  {form.auth?.type === 'basic' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Username</label>
                        <input
                          type="text"
                          value={form.auth.username || ''}
                          onChange={(e) => updateAuth({ username: e.target.value })}
                          className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                          placeholder="user"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Password</label>
                        <input
                          type="password"
                          value={form.auth.password || ''}
                          onChange={(e) => updateAuth({ password: e.target.value })}
                          className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                          placeholder="********"
                        />
                      </div>
                    </div>
                  )}

                  {/* Bearer token field / 베어러 토큰 필드 */}
                  {form.auth?.type === 'bearer' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Token</label>
                      <input
                        type="password"
                        value={form.auth.token || ''}
                        onChange={(e) => updateAuth({ token: e.target.value })}
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm font-mono placeholder-gray-600"
                        placeholder="eyJhbGciOi..."
                      />
                    </div>
                  )}

                  {/* Custom header fields / 커스텀 헤더 필드 */}
                  {form.auth?.type === 'custom-header' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Header Name</label>
                        <input
                          type="text"
                          value={form.auth.headerName || ''}
                          onChange={(e) => updateAuth({ headerName: e.target.value })}
                          className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                          placeholder="X-API-Key"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Header Value</label>
                        <input
                          type="password"
                          value={form.auth.headerValue || ''}
                          onChange={(e) => updateAuth({ headerValue: e.target.value })}
                          className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                          placeholder="secret-value"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Settings section / 설정 섹션 */}
              <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings size={14} className="text-accent-cyan" />
                  <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">
                    {t('datasources.settings') !== 'datasources.settings' ? t('datasources.settings') : 'Settings'}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Timeout (ms)</label>
                      <input
                        type="number"
                        value={form.settings?.timeout || 30000}
                        onChange={(e) => updateSettings({ timeout: parseInt(e.target.value) || 30000 })}
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Cache TTL (s)</label>
                      <input
                        type="number"
                        value={form.settings?.cacheTTL || 60}
                        onChange={(e) => updateSettings({ cacheTTL: parseInt(e.target.value) || 60 })}
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm font-mono"
                      />
                    </div>
                  </div>

                  {/* ClickHouse database / 클릭하우스 데이터베이스 */}
                  {form.type === 'clickhouse' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Database</label>
                      <input
                        type="text"
                        value={form.settings?.database || ''}
                        onChange={(e) => updateSettings({ database: e.target.value })}
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none text-sm placeholder-gray-600"
                        placeholder="default"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Default toggle / 기본값 토글 */}
              <div
                className="flex items-center justify-between bg-navy-900 rounded-lg border border-navy-600 px-4 py-3 cursor-pointer hover:bg-navy-700/50 transition-colors"
                onClick={() => updateForm({ isDefault: !form.isDefault })}
              >
                <div>
                  <p className="text-sm text-gray-200">
                    {t('datasources.setAsDefault') !== 'datasources.setAsDefault' ? t('datasources.setAsDefault') : 'Set as Default'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Default datasource for {TYPE_LABELS[form.type]} queries
                  </p>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative ${form.isDefault ? 'bg-accent-green' : 'bg-navy-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.isDefault ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              {/* Test connection button / 연결 테스트 버튼 */}
              <button
                onClick={handleTest}
                disabled={!form.url || testing}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-navy-700 text-gray-200 border border-navy-600 hover:bg-navy-600 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <TestTube size={14} />
                )}
                {t('datasources.testConnection') !== 'datasources.testConnection' ? t('datasources.testConnection') : 'Test Connection'}
              </button>

              {/* Test result / 테스트 결과 */}
              {testResult && (
                <div className={`px-4 py-3 rounded-lg flex items-center gap-2 text-sm ${
                  testResult.ok
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  <span>
                    {testResult.ok
                      ? `Connection successful (${testResult.latency}ms)`
                      : `Connection failed: ${testResult.error}`
                    }
                  </span>
                </div>
              )}

              {/* Save / Cancel buttons / 저장 / 취소 버튼 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim() || !form.url.trim() || saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {editingId
                    ? (t('datasources.save') !== 'datasources.save' ? t('datasources.save') : 'Save Changes')
                    : (t('datasources.add') !== 'datasources.add' ? t('datasources.add') : 'Add Datasource')
                  }
                </button>
                <button
                  onClick={closePanel}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium bg-navy-700 text-gray-400 border border-navy-600 hover:bg-navy-600 hover:text-gray-200 transition-colors"
                >
                  {t('datasources.cancel') !== 'datasources.cancel' ? t('datasources.cancel') : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
