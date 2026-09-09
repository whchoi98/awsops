import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.AURORA_ENDPOINT) {
    return NextResponse.json({ status: 'unconfigured', message: 'AURORA_ENDPOINT not set' }, { status: 503 });
  }
  try {
    const r = await getPool().query(
      "SELECT count(*)::int AS public_tables FROM pg_tables WHERE schemaname = 'public'",
    );
    return NextResponse.json({
      status: 'ok',
      public_tables: r.rows[0].public_tables,
    });
  } catch (e) {
    // This route is in the edge `is_public()` allowlist, so it answers unauthenticated callers.
    // Returning the raw driver message leaked host/database/schema detail from connection and
    // query errors, and the database name was echoed on the success path — ADR-002 §2-4 documented
    // that as "non-sensitive", which is a weaker claim than it should be for an unauthenticated
    // route. Log the detail, return a generic message (kiro review, PR #199).
    console.warn(
      JSON.stringify({ evt: 'db_ping_failed', err: e instanceof Error ? e.message : String(e) }),
    );
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
