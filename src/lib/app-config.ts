import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const CONFIG_PATH = resolve(process.cwd(), 'data/config.json');

export interface FargatePricing {
  region?: string;        // Region these prices apply to / 가격 적용 리전
  vcpuPerHour?: number;   // Fargate vCPU price per hour / Fargate vCPU 시간당 가격
  gbMemPerHour?: number;  // Fargate GB memory price per hour / Fargate GB 메모리 시간당 가격
  storagePerGbHour?: number; // Ephemeral storage price / 임시 스토리지 가격
}

// Multi-account support / 멀티 어카운트 지원
export const ALL_ACCOUNTS = '__all__';

export interface AccountFeatures {
  costEnabled: boolean;
  eksEnabled: boolean;
  k8sEnabled: boolean;
}

export interface AccountConfig {
  accountId: string;       // 12-digit AWS account ID
  alias: string;           // Human-readable name ("Production", "Staging")
  connectionName: string;  // Steampipe connection name ("aws_123456789012")
  region: string;          // Primary region
  isHost: boolean;         // Is this the host account (where AWSops runs)
  features: AccountFeatures;
  profile?: string;        // AWS CLI profile for cross-account access
}

// External datasource types (Grafana-style) / 외부 데이터소스 타입 (Grafana 스타일)
export type DatasourceType = 'prometheus' | 'loki' | 'tempo' | 'clickhouse' | 'jaeger' | 'dynatrace' | 'datadog';

export interface DatasourceAuth {
  type: 'none' | 'basic' | 'bearer' | 'custom-header';
  username?: string;
  password?: string;
  token?: string;
  headerName?: string;
  headerValue?: string;
}

export interface DatasourceSettings {
  timeout?: number;        // ms, default 30000
  cacheTTL?: number;       // seconds, default 60
  database?: string;       // ClickHouse database name
  customHeaders?: Record<string, string>;
}

export interface DatasourceConfig {
  id: string;              // UUID
  name: string;            // "Production Prometheus"
  type: DatasourceType;
  url: string;             // "http://prometheus:9090"
  isDefault?: boolean;     // Default datasource per type / 타입별 기본 데이터소스
  auth?: DatasourceAuth;
  settings?: DatasourceSettings;
  createdAt: string;       // ISO timestamp
  updatedAt: string;
}

export interface AppConfig {
  costEnabled: boolean;
  agentRuntimeArn?: string;
  codeInterpreterName?: string;
  memoryId?: string;
  memoryName?: string;
  steampipePassword?: string;
  fargatePricing?: FargatePricing;
  opencostEndpoint?: string;   // OpenCost API endpoint (Phase 2) / OpenCost API 엔드포인트 (2단계)
  customerLogo?: string;       // Customer logo path in public/logos/ (e.g. "autoever.png") / 고객 로고 경로
  customerName?: string;       // Customer name displayed next to logo / 로고 옆에 표시할 고객명
  customerLogoBg?: string;     // Logo background: "light" (white bg) or "dark" (transparent) / 로고 배경: light=흰색, dark=투명
  adminEmails?: string[];      // Admin user emails allowed to access /accounts / 계정 관리 접근 허용 이메일
  accounts?: AccountConfig[];
  datasources?: DatasourceConfig[];  // External datasources / 외부 데이터소스
  datasourceAllowedNetworks?: string[];  // Allowed private CIDRs/hostnames for datasource SSRF allowlist
}

const DEFAULT_CONFIG: AppConfig = {
  costEnabled: true,
  fargatePricing: {
    region: 'ap-northeast-2',
    vcpuPerHour: 0.04048,
    gbMemPerHour: 0.004445,
    storagePerGbHour: 0.000111,
  },
};

// 캐시된 config (60초 TTL) / Cached config with 60s TTL
let _configCache: AppConfig | null = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 60000;

export function getConfig(): AppConfig {
  const now = Date.now();
  if (_configCache && now - _configCacheTime < CONFIG_CACHE_TTL) return _configCache;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed: AppConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    _configCache = parsed;
    _configCacheTime = now;
    return parsed;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<AppConfig>): void {
  const current = getConfig();
  const merged = { ...current, ...config };
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  _configCache = merged as AppConfig;
  _configCacheTime = Date.now();
}

// --- Multi-account utilities ---

export function validateAccountId(id: string): boolean {
  return /^\d{12}$/.test(id);
}

export function getAccounts(): AccountConfig[] {
  return getConfig().accounts || [];
}

export function getAccountById(id: string): AccountConfig | undefined {
  return getAccounts().find(a => a.accountId === id);
}

export function isMultiAccount(): boolean {
  return getAccounts().length > 1;
}

export function getHostAccount(): AccountConfig | undefined {
  return getAccounts().find(a => a.isHost);
}

// --- Datasource utilities / 데이터소스 유틸리티 ---

export function getDatasources(): DatasourceConfig[] {
  return getConfig().datasources || [];
}

export function getDatasourceById(id: string): DatasourceConfig | undefined {
  return getDatasources().find(d => d.id === id);
}

export function getDefaultDatasource(type: DatasourceType): DatasourceConfig | undefined {
  const byType = getDatasources().filter(d => d.type === type);
  return byType.find(d => d.isDefault) || byType[0];
}

export function getDatasourcesByType(type: DatasourceType): DatasourceConfig[] {
  return getDatasources().filter(d => d.type === type);
}

export function getDatasourceAllowedNetworks(): string[] {
  return getConfig().datasourceAllowedNetworks || [];
}
