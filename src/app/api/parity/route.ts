// ADR-030 Phase 1 dual-write parity check.
//
// During Phase 1, JSON is the source of truth and Aurora is a shadow write.
// This endpoint compares the two so the 7-day parity gate (zero drift) from
// the ADR can be measured before Phase 2 flips reads to Aurora.
//
// GET /api/parity                        → all sources, current drift snapshot
// GET /api/parity?source=agentcore_stats&hours=24
//                                        → 24h window comparison for one source
//
// Admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getConfig } from '@/lib/app-config';
import { isAuroraEnabled, checkDbHealth } from '@/lib/db';
import { getDriftCounters } from '@/lib/db/drift';
import { countAuroraCalls } from '@/lib/db/agentcore-stats-writer';
import { getStats } from '@/lib/agentcore-stats';
import { countJsonInventoryDays } from '@/lib/inventory-fs';
import { countAuroraInventoryRows } from '@/lib/db/inventory-writer';

function isAdminUser(req: NextRequest): boolean {
  const user = getUserFromRequest(req);
  const config = getConfig();
  if (!config.adminEmails || config.adminEmails.length === 0) return true;
  return config.adminEmails.includes(user.email);
}

interface AgentCoreStatsParity {
  source: 'agentcore_stats';
  windowHours: number;
  jsonRecentCalls: number;
  auroraCount: number;
  drift: number;
  note: string;
}

async function agentcoreStatsParity(hours: number): Promise<AgentCoreStatsParity> {
  const until = new Date();
  const since = new Date(until.getTime() - hours * 3_600_000);

  const jsonStats = getStats();
  const jsonRecentInWindow = jsonStats.recentCalls.filter((c) => {
    const t = new Date(c.timestamp).getTime();
    return t >= since.getTime() && t < until.getTime();
  }).length;

  const auroraCount = await countAuroraCalls(since, until);

  return {
    source: 'agentcore_stats',
    windowHours: hours,
    jsonRecentCalls: jsonRecentInWindow,
    auroraCount,
    drift: Math.abs(auroraCount - jsonRecentInWindow),
    note:
      'JSON side caps at 50 most-recent calls; comparison is exact only ' +
      'when call volume in the window < 50. Use the drift counter for ' +
      'cumulative write-failure visibility.',
  };
}

interface InventorySnapshotsParity {
  source: 'inventory_snapshots';
  inSync: boolean;
  jsonCount: number;
  auroraCount: number;
  drift: number;
  note: string;
}

async function inventorySnapshotsParity(): Promise<InventorySnapshotsParity> {
  // JSON layer: one file per (account, day). Aurora: many rows per snapshot
  // (one per resource_type). Use distinct (account_id, DATE(captured_at))
  // on Aurora so both sides count snapshot-days, not rows.
  const jsonCount = countJsonInventoryDays();
  const auroraCount = await countAuroraInventoryRows({ distinct: true });
  return {
    source: 'inventory_snapshots',
    inSync: jsonCount === auroraCount,
    jsonCount,
    auroraCount,
    drift: Math.abs(auroraCount - jsonCount),
    note:
      'Compares snapshot-days, not rows. Aurora stores N rows per snapshot ' +
      '(one per resource_type) so a row-count comparison would always show drift.',
  };
}

export async function GET(req: NextRequest) {
  if (!isAdminUser(req)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!isAuroraEnabled()) {
    return NextResponse.json({
      auroraEnabled: false,
      message:
        'Aurora not configured. Set AURORA_DATABASE_URL or AURORA_HOST/USER/PASSWORD/DB. ' +
        'See ADR-030 and scripts/13-deploy-aurora.sh.',
    });
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');
  const hours = Math.max(1, Math.min(168, Number(searchParams.get('hours') ?? '24')));

  let health: { ok: true; schemaVersion: number } | { ok: false; error: string };
  try {
    health = await checkDbHealth();
  } catch (err) {
    health = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const driftCounters = getDriftCounters();

  if (source === 'agentcore_stats') {
    return NextResponse.json({
      auroraEnabled: true,
      health,
      drift: driftCounters.filter((c) => c.source === source),
      parity: [await agentcoreStatsParity(hours)],
    });
  }
  if (source === 'inventory_snapshots') {
    return NextResponse.json({
      auroraEnabled: true,
      health,
      drift: driftCounters.filter((c) => c.source === source),
      parity: [await inventorySnapshotsParity()],
    });
  }

  return NextResponse.json({
    auroraEnabled: true,
    health,
    drift: driftCounters,
    parity: [await agentcoreStatsParity(hours), await inventorySnapshotsParity()],
    note:
      'Phase 1 dual-write — agentcore_stats + inventory_snapshots wired so far. ' +
      'Other sources (cost, memory, alerts, event-scaling, schedules) land in subsequent commits.',
  });
}
