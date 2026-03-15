// AgentCore 사용 통계 저장/조회 — data/agentcore-stats.json
// AgentCore usage stats: save/load from data/agentcore-stats.json
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const STATS_PATH = resolve(process.cwd(), 'data/agentcore-stats.json');

export interface AgentCoreCallRecord {
  timestamp: string;
  route: string;
  gateway: string;
  responseTimeMs: number;
  usedTools: string[];
  success: boolean;
  via: string;
}

export interface AgentCoreStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgResponseTimeMs: number;
  totalToolsUsed: number;
  uniqueToolsUsed: string[];
  callsByGateway: Record<string, number>;
  callsByRoute: Record<string, number>;
  recentCalls: AgentCoreCallRecord[];  // 최근 50건 / last 50 calls
  lastUpdated: string;
}

const DEFAULT_STATS: AgentCoreStats = {
  totalCalls: 0, successCalls: 0, failedCalls: 0,
  avgResponseTimeMs: 0, totalToolsUsed: 0, uniqueToolsUsed: [],
  callsByGateway: {}, callsByRoute: {},
  recentCalls: [], lastUpdated: new Date().toISOString(),
};

function ensureDir(): void {
  const dir = dirname(STATS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function getStats(): AgentCoreStats {
  try {
    if (existsSync(STATS_PATH)) {
      return { ...DEFAULT_STATS, ...JSON.parse(readFileSync(STATS_PATH, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULT_STATS };
}

export function recordCall(record: AgentCoreCallRecord): void {
  ensureDir();
  const stats = getStats();

  stats.totalCalls++;
  if (record.success) stats.successCalls++;
  else stats.failedCalls++;

  // 평균 응답 시간 갱신 / Update average response time
  const prevTotal = stats.avgResponseTimeMs * (stats.totalCalls - 1);
  stats.avgResponseTimeMs = Math.round((prevTotal + record.responseTimeMs) / stats.totalCalls);

  // 도구 사용 통계 / Tool usage stats
  stats.totalToolsUsed += record.usedTools.length;
  const uniqueSet = new Set(stats.uniqueToolsUsed);
  record.usedTools.forEach(t => uniqueSet.add(t));
  stats.uniqueToolsUsed = Array.from(uniqueSet);

  // 게이트웨이별 호출 수 / Calls by gateway
  if (record.gateway) {
    stats.callsByGateway[record.gateway] = (stats.callsByGateway[record.gateway] || 0) + 1;
  }

  // 라우트별 호출 수 / Calls by route
  if (record.route) {
    stats.callsByRoute[record.route] = (stats.callsByRoute[record.route] || 0) + 1;
  }

  // 최근 50건 유지 / Keep last 50 records
  stats.recentCalls.unshift(record);
  if (stats.recentCalls.length > 50) stats.recentCalls = stats.recentCalls.slice(0, 50);

  stats.lastUpdated = new Date().toISOString();

  writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), 'utf-8');
}
