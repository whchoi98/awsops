// ADR-030 Phase 1 dual-write — inventory_snapshots Aurora INSERT.
//
// Source of truth during Phase 1 remains data/inventory/<account>/<YYYY-MM-DD>.json.
// This module shadows each saveSnapshot() call. The schema emits one row per
// (account_id, captured_at, resource_type), so a snapshot fans out to N rows
// per save. Saves for the same (account_id, day) replace the previous rows
// so cache-warmer re-runs are idempotent.

import { getDb, isAuroraEnabled } from '@/lib/db';
import { recordWrite, recordFailure } from '@/lib/db/drift';
import type { InventorySnapshot } from '@/lib/resource-inventory';

const SOURCE = 'inventory_snapshots';

const DELETE_DAY_SQL = `
  DELETE FROM inventory_snapshots
  WHERE account_id = $1 AND captured_at >= $2 AND captured_at < $3
`;

const INSERT_SQL = `
  INSERT INTO inventory_snapshots (
    account_id, captured_at, resource_type, resource_count, payload
  ) VALUES ($1, $2, $3, $4, $5::jsonb)
`;

const COUNT_SQL = `SELECT COUNT(*)::text AS c FROM inventory_snapshots`;
const COUNT_DISTINCT_SQL = `
  SELECT COUNT(DISTINCT (account_id, DATE(captured_at)))::text AS c
  FROM inventory_snapshots
`;

function dayBounds(timestamp: string): { startOfDay: Date; nextDay: Date } {
  const t = new Date(timestamp);
  const startOfDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const nextDay = new Date(startOfDay.getTime() + 24 * 3_600_000);
  return { startOfDay, nextDay };
}

export async function shadowSaveInventorySnapshot(
  snapshot: InventorySnapshot,
  accountId?: string,
): Promise<void> {
  if (!isAuroraEnabled()) return;
  if (!accountId) return; // no account context, no shadow

  // `aws` is the Steampipe aggregator key — store it as `aggregate` so the
  // column never collides with a real 12-digit account id.
  const acctId = accountId === 'aws' ? 'aggregate' : accountId;

  const capturedAt = new Date(snapshot.timestamp);
  const { startOfDay, nextDay } = dayBounds(snapshot.timestamp);

  try {
    const db = await getDb();
    await db.query(DELETE_DAY_SQL, [acctId, startOfDay, nextDay]);
    for (const [resourceType, count] of Object.entries(snapshot.resources)) {
      await db.query(INSERT_SQL, [
        acctId,
        capturedAt,
        resourceType,
        Number(count) || 0,
        JSON.stringify({ date: snapshot.date, timestamp: snapshot.timestamp }),
      ]);
    }
    recordWrite(SOURCE);
  } catch (err) {
    recordFailure(SOURCE, err);
    throw err;
  }
}

export function fireAndForgetSaveInventorySnapshot(
  snapshot: InventorySnapshot,
  accountId?: string,
): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  shadowSaveInventorySnapshot(snapshot, accountId).catch(() => {
    // Drift counter already incremented inside shadowSaveInventorySnapshot.
  });
}

export async function countAuroraInventoryRows(
  opts: { distinct?: boolean } = {},
): Promise<number> {
  if (!isAuroraEnabled()) return 0;
  const db = await getDb();
  const r = await db.query<{ c: string }>(opts.distinct ? COUNT_DISTINCT_SQL : COUNT_SQL);
  return Number(r.rows[0]?.c ?? 0);
}
