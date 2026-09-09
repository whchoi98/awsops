import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifyUser, matchesIdentity } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// pentest-remediation P0-1: this route had NO auth at all — any UUID returned that job's full
// result/artifact_uri/error to anyone. Now: authenticate, then require ownership (requested_by
// matches the caller) or admin. requested_by IS NULL (internal-only enqueues) is admin-only.
// Also (P1-review MAJOR-2, merged from #199): because Lambda@Edge only checks JWT signature/expiry
// and knows nothing about session_revocations, an unauthenticated route here also bypassed
// revocation entirely — verifyUser() is revocation-aware, so this one call closes both.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  const id = params.id;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ message: 'invalid job id' }, { status: 400 });
  }
  try {
    const r = await getPool().query(
      `SELECT job_id, type, runtime, status, result, artifact_uri, error, dry_run, attempt,
              requested_by, created_at, updated_at
       FROM worker_jobs WHERE job_id = $1`,
      [id],
    );
    if (r.rows.length === 0) {
      return NextResponse.json({ message: 'job not found' }, { status: 404 });
    }
    const row = r.rows[0];
    // PR #195 round-4 review MAJOR #1: matchesIdentity also accepts a legacy row keyed by the raw
    // sub (written before the identity() switch), not just identity(user).
    if (!matchesIdentity(row.requested_by, user) && !(await isAdmin(user))) {
      return NextResponse.json({ message: 'forbidden' }, { status: 403 });
    }
    delete row.requested_by; // internal field, not part of the response contract
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json(
      { status: 'error', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
