import { Pool } from 'pg';
import NodeCache from 'node-cache';

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
