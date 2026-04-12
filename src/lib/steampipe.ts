import { Pool } from 'pg';
import NodeCache from 'node-cache';
import { getConfig, isMultiAccount, getAccounts, ALL_ACCOUNTS } from '@/lib/app-config';
import type { AccountConfig } from '@/lib/app-config';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Steampipe 비밀번호: config에서 읽기, 환경변수 폴백
// Steampipe password: from config, env var fallback
function createPool(): Pool {
  const spPassword = getConfig().steampipePassword
    || process.env.STEAMPIPE_PASSWORD
    || 'steampipe';
  return new Pool({
    host: '127.0.0.1',
    port: 9193,
    database: 'steampipe',
    user: 'steampipe',
    password: spPassword,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  });
}

let pool = createPool();

// Kill zombie PostgreSQL connections on startup and periodically
// 앱 시작 시 + 주기적으로 좀비 PostgreSQL 연결 정리
const ZOMBIE_MAX_MINUTES = 5; // Kill queries running longer than 5 min / 5분 이상 실행 쿼리 종료
let zombieCleanupStarted = false;

async function cleanupZombieConnections(): Promise<number> {
  try {
    // Only kill connections from the app (client_addr = 127.0.0.1 with SELECT queries).
    // Exclude Steampipe internal FDW/plugin connections (client_addr IS NULL).
    // 앱 커넥션만 정리 — Steampipe 내부 FDW/플러그인 커넥션(client_addr IS NULL) 제외
    const result = await pool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE state = 'active'
        AND pid != pg_backend_pid()
        AND client_addr IS NOT NULL
        AND query LIKE 'SELECT %'
        AND query NOT LIKE '%pg_terminate%'
        AND query NOT LIKE '%pg_stat_activity%'
        AND query_start < NOW() - INTERVAL '${ZOMBIE_MAX_MINUTES} minutes'
    `);
    const killed = result.rowCount || 0;
    if (killed > 0) {
      console.log(`[Pool] Cleaned up ${killed} zombie connection(s) (>${ZOMBIE_MAX_MINUTES}min)`);
    }
    return killed;
  } catch {
    return 0;
  }
}

export function startZombieCleanup(): void {
  if (zombieCleanupStarted) return;
  zombieCleanupStarted = true;
  // Initial cleanup after 3s / 3초 후 초기 정리
  setTimeout(() => cleanupZombieConnections(), 3000);
  // Periodic cleanup every 2 minutes / 2분마다 주기적 정리
  setInterval(() => cleanupZombieConnections(), 2 * 60 * 1000);
}

const ALLOWED_PATTERN = /^\s*SELECT\s/i;

function validateQuery(sql: string): void {
  if (!ALLOWED_PATTERN.test(sql.trim())) {
    throw new Error('Only SELECT queries are allowed');
  }
  if (/[&`]/.test(sql) || /(?<!\|)\|(?!\|)/.test(sql)) {
    throw new Error('Query contains forbidden characters');
  }
}

// Build search_path for account-scoped queries / 계정별 search_path 생성
function buildSearchPath(accountId?: string): string {
  if (!accountId || accountId === ALL_ACCOUNTS) return '';
  if (!isMultiAccount()) return '';
  const sanitized = accountId.replace(/[^0-9]/g, '');
  if (sanitized.length !== 12) return '';
  const accounts = getAccounts();
  if (!accounts.some(a => a.accountId === sanitized)) return '';
  return `public, aws_${sanitized}, kubernetes, trivy`;
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  opts?: boolean | { bustCache?: boolean; accountId?: string; ttl?: number }
): Promise<{ rows: T[]; error?: string }> {
  const { bustCache = false, accountId, ttl } = typeof opts === 'boolean'
    ? { bustCache: opts, accountId: undefined, ttl: undefined }
    : (opts || {});
  const cacheKey = `sp:${accountId || ALL_ACCOUNTS}:${sql}`;

  if (!bustCache) {
    const cached = cache.get<{ rows: T[] }>(cacheKey);
    if (cached) return cached;
  }

  try {
    validateQuery(sql);
    const searchPath = buildSearchPath(accountId);

    let rows: T[];
    if (searchPath) {
      // Dedicated client for account-scoped search_path / 계정별 search_path 전용 클라이언트
      const client = await pool.connect();
      let released = false;
      try {
        await client.query(`SET search_path TO ${searchPath}`);
        const result = await client.query(sql);
        rows = result.rows || [];
        await client.query('RESET search_path');
      } catch (queryErr) {
        // Attempt to reset before releasing; if RESET fails, destroy the connection
        try {
          await client.query('RESET search_path');
        } catch {
          client.release(true);
          released = true;
        }
        throw queryErr;
      } finally {
        if (!released) client.release();
      }
    } else {
      const result = await pool.query(sql);
      rows = result.rows || [];
    }

    const data = { rows };
    if (ttl) {
      cache.set(cacheKey, data, ttl);
    } else {
      cache.set(cacheKey, data);
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { rows: [], error: message };
  }
}

export async function batchQuery(
  queries: Record<string, string>,
  opts?: boolean | { bustCache?: boolean; accountId?: string; ttl?: number }
): Promise<Record<string, { rows: unknown[]; error?: string }>> {
  const normalizedOpts = typeof opts === 'boolean'
    ? { bustCache: opts }
    : (opts || {});

  const results: Record<string, { rows: unknown[]; error?: string }> = {};
  const entries = Object.entries(queries);

  // Run in sequential batches of 8 (leaves 2 pool slots for other requests)
  // 8개씩 병렬 실행 (다른 요청을 위해 풀 슬롯 2개 여유)
  const BATCH_SIZE = 8;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(([, sql]) => runQuery(sql, normalizedOpts))
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
const COST_CACHE_TTL = 3600; // 1시간

export async function checkCostAvailability(
  bustCache = false,
  accountId?: string
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

  const costCacheKey = `cost:available:${accountId || ALL_ACCOUNTS}`;

  if (!bustCache) {
    const cached = cache.get<{ available: boolean; reason?: string; checkedAt?: string }>(costCacheKey);
    if (cached) return cached;
  }

  const searchPath = buildSearchPath(accountId);
  let client;
  try {
    client = await pool.connect();
    if (searchPath) {
      await client.query(`SET search_path TO ${searchPath}`);
    }
    await client.query("SET statement_timeout = '10000'"); // 10초 전용 타임아웃
    await client.query('SELECT 1 FROM aws_cost_by_service_monthly LIMIT 1');
    const result = { available: true, checkedAt: new Date().toISOString() };
    cache.set(costCacheKey, result, COST_CACHE_TTL);
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
    cache.set(costCacheKey, result, COST_CACHE_TTL);
    return result;
  } finally {
    if (client) {
      let released = false;
      try {
        await client.query('RESET statement_timeout');
      } catch {
        client.release(true);
        released = true;
      }
      if (!released && searchPath) {
        try { await client.query('RESET search_path'); } catch { client.release(true); released = true; }
      }
      if (!released) client.release();
    }
  }
}

// Run cost queries per-account, merge results with account tags / 계정별 비용 쿼리 실행 후 결과 병합
export async function runCostQueriesPerAccount(
  queries: Record<string, string>,
  accounts?: AccountConfig[]
): Promise<Record<string, { rows: unknown[]; error?: string }>> {
  const accts = (accounts || getAccounts()).filter(a => a.features.costEnabled);
  if (accts.length === 0) return batchQuery(queries);

  const ACCOUNT_BATCH_SIZE = 2;
  const perAccountResults: PromiseSettledResult<Record<string, { rows: unknown[]; error?: string }>>[] = [];
  for (let i = 0; i < accts.length; i += ACCOUNT_BATCH_SIZE) {
    const chunk = accts.slice(i, i + ACCOUNT_BATCH_SIZE);
    const chunkResults = await Promise.allSettled(
      chunk.map(acc => batchQuery(queries, { accountId: acc.accountId }))
    );
    perAccountResults.push(...chunkResults);
  }

  const merged: Record<string, { rows: unknown[]; error?: string }> = {};
  for (const key of Object.keys(queries)) {
    merged[key] = { rows: [] };
  }

  const failedAccounts: string[] = [];
  perAccountResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const { accountId, alias } = accts[i];
      for (const [key, val] of Object.entries(result.value)) {
        if (val.rows) {
          const tagged = val.rows.map((r: unknown) => ({ ...(r as Record<string, unknown>), account_id: accountId, account_alias: alias }));
          (merged[key].rows as unknown[]).push(...tagged);
        }
      }
    } else {
      failedAccounts.push(accts[i].accountId);
    }
  });

  if (failedAccounts.length > 0) {
    for (const key of Object.keys(queries)) {
      merged[key].error = `Partial: failed accounts ${failedAccounts.join(', ')}`;
    }
  }

  return merged;
}

// Reset pool and flush cache / 풀 리셋 및 캐시 초기화
export async function resetPool(): Promise<void> {
  try { await pool.end(); } catch { /* ignore */ }
  pool = createPool();
  cache.flushAll();
  for (let i = 0; i < 15; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
}
