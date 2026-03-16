import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const CONFIG_PATH = resolve(process.cwd(), 'data/config.json');

export interface AccountFeatures {
  costEnabled: boolean;
  eksEnabled: boolean;
  k8sEnabled: boolean;
}

export interface AccountConfig {
  accountId: string;
  alias: string;
  connectionName: string;
  profile?: string;
  region: string;
  features: AccountFeatures;
}

export interface FargatePricing {
  region?: string;        // Region these prices apply to / 가격 적용 리전
  vcpuPerHour?: number;   // Fargate vCPU price per hour / Fargate vCPU 시간당 가격
  gbMemPerHour?: number;  // Fargate GB memory price per hour / Fargate GB 메모리 시간당 가격
  storagePerGbHour?: number; // Ephemeral storage price / 임시 스토리지 가격
}

export interface AppConfig {
  costEnabled: boolean;
  agentRuntimeArn?: string;
  codeInterpreterName?: string;
  memoryId?: string;
  memoryName?: string;
  steampipePassword?: string;
  accounts?: AccountConfig[];
  fargatePricing?: FargatePricing;
  opencostEndpoint?: string;   // OpenCost API endpoint (Phase 2) / OpenCost API 엔드포인트 (2단계)
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

export const ALL_ACCOUNTS = '__all__';

export function getAccounts(): AccountConfig[] {
  return getConfig().accounts || [];
}

export function isMultiAccount(): boolean {
  return getAccounts().length > 1;
}

export function getAccountFeatures(accountId: string): AccountFeatures {
  const accounts = getAccounts();
  if (!accounts.length) {
    return { costEnabled: getConfig().costEnabled, eksEnabled: true, k8sEnabled: true };
  }
  if (accountId === ALL_ACCOUNTS) {
    return {
      costEnabled: accounts.some(a => a.features.costEnabled),
      eksEnabled: accounts.some(a => a.features.eksEnabled),
      k8sEnabled: accounts.some(a => a.features.k8sEnabled),
    };
  }
  const account = accounts.find(a => a.accountId === accountId);
  return account?.features || { costEnabled: false, eksEnabled: false, k8sEnabled: false };
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
