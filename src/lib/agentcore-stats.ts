// AgentCore 호출 통계 — 인메모리 캐시 + 디바운스 flush
// AgentCore call stats — in-memory cache with debounced disk flush
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
  inputTokens?: number;   // Bedrock input tokens / 입력 토큰
  outputTokens?: number;  // Bedrock output tokens / 출력 토큰
  model?: string;         // Model used / 사용 모델
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
  recentCalls: AgentCoreCallRecord[];
  lastUpdated: string;
  // AWSops token usage tracking / AWSops 토큰 사용량 추적
  totalInputTokens: number;
  totalOutputTokens: number;
  tokensByModel: Record<string, { inputTokens: number; outputTokens: number; calls: number }>;
}

const DEFAULT_STATS: AgentCoreStats = {
  totalCalls: 0, successCalls: 0, failedCalls: 0,
  avgResponseTimeMs: 0, totalToolsUsed: 0, uniqueToolsUsed: [],
  callsByGateway: {}, callsByRoute: {},
  recentCalls: [], lastUpdated: new Date().toISOString(),
  totalInputTokens: 0, totalOutputTokens: 0, tokensByModel: {},
};

// 인메모리 캐시 — 디스크 읽기 최소화 / In-memory cache to minimize disk reads
let _stats: AgentCoreStats | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY = 5000; // 5초 디바운스 / 5s debounce

function loadFromDisk(): AgentCoreStats {
  try {
    const raw = readFileSync(STATS_PATH, 'utf-8');
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

function flushToDisk(): void {
  if (!_stats) return;
  try {
    const dir = dirname(STATS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATS_PATH, JSON.stringify(_stats, null, 2), 'utf-8');
  } catch {}
}

function scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushToDisk, FLUSH_DELAY);
}

export function getStats(): AgentCoreStats {
  if (!_stats) _stats = loadFromDisk();
  return _stats;
}

export function recordCall(record: AgentCoreCallRecord): void {
  if (!_stats) _stats = loadFromDisk();

  _stats.totalCalls++;
  if (record.success) _stats.successCalls++;
  else _stats.failedCalls++;

  const prevTotal = _stats.avgResponseTimeMs * (_stats.totalCalls - 1);
  _stats.avgResponseTimeMs = Math.round((prevTotal + record.responseTimeMs) / _stats.totalCalls);

  _stats.totalToolsUsed += record.usedTools.length;
  const uniqueSet = new Set(_stats.uniqueToolsUsed);
  record.usedTools.forEach(t => uniqueSet.add(t));
  // uniqueToolsUsed 최대 200개 / Cap at 200
  _stats.uniqueToolsUsed = Array.from(uniqueSet).slice(0, 200);

  if (record.gateway) {
    _stats.callsByGateway[record.gateway] = (_stats.callsByGateway[record.gateway] || 0) + 1;
  }
  if (record.route) {
    _stats.callsByRoute[record.route] = (_stats.callsByRoute[record.route] || 0) + 1;
  }

  _stats.recentCalls.unshift(record);
  if (_stats.recentCalls.length > 50) _stats.recentCalls = _stats.recentCalls.slice(0, 50);

  // Token usage tracking / 토큰 사용량 추적
  if (record.inputTokens || record.outputTokens) {
    _stats.totalInputTokens = (_stats.totalInputTokens || 0) + (record.inputTokens || 0);
    _stats.totalOutputTokens = (_stats.totalOutputTokens || 0) + (record.outputTokens || 0);
    if (record.model) {
      if (!_stats.tokensByModel) _stats.tokensByModel = {};
      const m = _stats.tokensByModel[record.model] || { inputTokens: 0, outputTokens: 0, calls: 0 };
      m.inputTokens += record.inputTokens || 0;
      m.outputTokens += record.outputTokens || 0;
      m.calls++;
      _stats.tokensByModel[record.model] = m;
    }
  }

  _stats.lastUpdated = new Date().toISOString();

  // 디바운스 flush — 매 호출마다 디스크 쓰기 안 함 / Debounced flush, not every call
  scheduleFlush();
}
