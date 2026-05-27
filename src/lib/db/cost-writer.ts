// ADR-030 Phase 1 dual-write — cost_snapshots Aurora UPSERT.
//
// Source of truth during Phase 1 remains data/cost/<account>/<YYYY-MM-DD>.json.
// This module shadows each saveCostSnapshot() call. The JSON layer stores a
// single mixed-granularity snapshot per (account, day) bundling monthly +
// daily + per-service cost; we mirror that 1-to-1 in Aurora.
//
// Granularity is set to 'SNAPSHOT' (a literal we own) so it can't collide
// with a future Cost-Explorer-native ingestion that uses 'DAILY' / 'MONTHLY'.
// UPSERT on (account_id, period_start, period_end, granularity) makes a
// re-run within the same day replace the previous row.

import { getDb, isAuroraEnabled } from '@/lib/db';
import { recordWrite, recordFailure } from '@/lib/db/drift';
import type { CostSnapshot } from '@/lib/cost-snapshot';

const SOURCE = 'cost_snapshots';
const GRANULARITY_SENTINEL = 'SNAPSHOT';

const UPSERT_SQL = `
  INSERT INTO cost_snapshots (
    account_id, period_start, period_end, granularity, payload
  ) VALUES ($1, $2, $3, $4, $5::jsonb)
  ON CONFLICT (account_id, period_start, period_end, granularity) DO UPDATE SET
    payload = EXCLUDED.payload
`;

const COUNT_SQL = `SELECT COUNT(*)::text AS c FROM cost_snapshots`;

export async function shadowSaveCostSnapshot(
  snapshot: CostSnapshot,
  accountId?: string,
): Promise<void> {
  if (!isAuroraEnabled()) return;
  if (!accountId) return; // no account context, no shadow

  const acctId = accountId === 'aws' ? 'aggregate' : accountId;
  const payload = JSON.stringify({
    monthlyCost: snapshot.monthlyCost,
    dailyCost: snapshot.dailyCost,
    serviceCost: snapshot.serviceCost,
    capturedAt: snapshot.timestamp,
  });

  try {
    const db = await getDb();
    await db.query(UPSERT_SQL, [
      acctId,
      snapshot.date,
      snapshot.date,
      GRANULARITY_SENTINEL,
      payload,
    ]);
    recordWrite(SOURCE);
  } catch (err) {
    recordFailure(SOURCE, err);
    throw err;
  }
}

export function fireAndForgetSaveCostSnapshot(
  snapshot: CostSnapshot,
  accountId?: string,
): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  shadowSaveCostSnapshot(snapshot, accountId).catch(() => {
    // Drift counter already incremented inside shadowSaveCostSnapshot.
  });
}

export async function countAuroraCostSnapshots(): Promise<number> {
  if (!isAuroraEnabled()) return 0;
  const db = await getDb();
  const r = await db.query<{ c: string }>(COUNT_SQL);
  return Number(r.rows[0]?.c ?? 0);
}
