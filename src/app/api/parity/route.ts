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
import { getConversations } from '@/lib/agentcore-memory';
import { countAuroraMemory } from '@/lib/db/agentcore-memory-writer';

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

interface AgentCoreMemoryParity {
  source: 'agentcore_memory';
  inSync: boolean;
  jsonCount: number;
  auroraCount: number;
  drift: number;
  note: string;
}

async function agentcoreMemoryParity(): Promise<AgentCoreMemoryParity> {
  // JSON layer caps at MAX_CONVERSATIONS=100 most-recent records; pass a
  // large limit so we exercise the full retained set for parity.
  const jsonCount = (await getConversations(10_000)).length;
  const auroraCount = await countAuroraMemory();
  return {
    source: 'agentcore_memory',
    inSync: jsonCount === auroraCount,
    jsonCount,
    auroraCount,
    drift: Math.abs(auroraCount - jsonCount),
    note:
      'JSON side keeps the last 100 conversations only; Aurora keeps them until ' +
      'expires_at (365 days). Exact parity is meaningful only when conversation ' +
      'volume in the JSON window < 100.',
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
  if (source === 'agentcore_memory') {
    return NextResponse.json({
      auroraEnabled: true,
      health,
      drift: driftCounters.filter((c) => c.source === source),
      parity: [await agentcoreMemoryParity()],
    });
  }

  return NextResponse.json({
    auroraEnabled: true,
    health,
    drift: driftCounters,
    parity: [await agentcoreStatsParity(hours), await agentcoreMemoryParity()],
    note:
      'Phase 1 dual-write — agentcore_stats + agentcore_memory wired so far. ' +
      'Other sources (inventory, cost, alerts, event-scaling, schedules) land in subsequent commits.',
  });
}
