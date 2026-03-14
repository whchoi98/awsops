import { Pool } from 'pg';
import NodeCache from 'node-cache';
import { getConfig } from '@/lib/app-config';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const pool = new Pool({
  host: '127.0.0.1',
  port: 9193,
  database: 'steampipe',
  user: 'steampipe',
  password: '6bbf_4c5e_89bb',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 120000,
});

const ALLOWED_PATTERN = /^\s*SELECT\s/i;

function validateQuery(sql: string): void {
  if (!ALLOWED_PATTERN.test(sql.trim())) {
    throw new Error('Only SELECT queries are allowed');
  }
  if (/[|&`]/.test(sql)) {
    throw new Error('Query contains forbidden characters');
  }
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  bustCache = false
): Promise<{ rows: T[]; error?: string }> {
  const cacheKey = `sp:${sql}`;

  if (!bustCache) {
    const cached = cache.get<{ rows: T[] }>(cacheKey);
    if (cached) return cached;
  }

  try {
    validateQuery(sql);
    const result = await pool.query(sql);
    const rows: T[] = result.rows || [];
    const data = { rows };
    cache.set(cacheKey, data);
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { rows: [], error: message };
  }
}

export async function batchQuery(
  queries: Record<string, string>,
  bustCache = false
): Promise<Record<string, { rows: unknown[]; error?: string }>> {
  const results: Record<string, { rows: unknown[]; error?: string }> = {};
  const entries = Object.entries(queries);

  // Run in sequential batches of 5 (matches pool max) / 풀 크기에 맞춰 5개씩 병렬 실행
  const BATCH_SIZE = 5;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(([, sql]) => runQuery(sql, bustCache))
    );
    batch.forEach(([key], j) => {
      const s = settled[j];
      if (s.status === 'fulfilled') {
        results[key] = s.value;
      } else {
        results[key] = { rows: [], error: s.reason?.message || 'Query failed' };
      }
    });
  }

  return results;
}

export function clearCache(): void {
  cache.flushAll();
}

// Cost Explorer availability probe / Cost Explorer 가용성 확인
// 설치 시 config로 MSP 판별 → 런타임에 Steampipe 쿼리 스킵
const COST_CACHE_KEY = 'cost:available';
const COST_CACHE_TTL = 3600; // 1시간

export async function checkCostAvailability(
  bustCache = false
): Promise<{ available: boolean; reason?: string; checkedAt?: string }> {
  // 설치 시 판별된 config 확인 — MSP Payer면 쿼리 없이 즉시 반환
  const config = getConfig();
  if (!config.costEnabled) {
    return {
      available: false,
      reason: 'Cost Explorer disabled (MSP/Payer account — configured at install)',
      checkedAt: new Date().toISOString(),
    };
  }

  if (!bustCache) {
    const cached = cache.get<{ available: boolean; reason?: string; checkedAt?: string }>(COST_CACHE_KEY);
    if (cached) return cached;
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("SET LOCAL statement_timeout = '10000'"); // 10초 전용 타임아웃
    await client.query('SELECT 1 FROM aws_cost_by_service_monthly LIMIT 1');
    const result = { available: true, checkedAt: new Date().toISOString() };
    cache.set(COST_CACHE_KEY, result, COST_CACHE_TTL);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const reason = /permission denied|AccessDenied|not authorized/i.test(message)
      ? 'Cost Explorer access denied (MSP/SCP restriction)'
      : /timeout|canceling statement/i.test(message)
        ? 'Cost Explorer query timed out'
        : /does not exist/i.test(message)
          ? 'Cost Explorer not enabled'
          : `Cost Explorer unavailable: ${message}`;
    const result = { available: false, reason, checkedAt: new Date().toISOString() };
    cache.set(COST_CACHE_KEY, result, COST_CACHE_TTL);
    return result;
  } finally {
    if (client) client.release();
  }
}
