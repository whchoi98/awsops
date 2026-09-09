import { NextResponse } from 'next/server';
import { verifyUser, matchesIdentity } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// pentest-remediation P2-1: no ownership check — any authenticated user could read any run's full
// CIS benchmark results (alarmed/failed controls, resource ids, regions) by id.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) {
    return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: 'invalid run id' }, { status: 400 });
  }
  try {
    const pool = getPool();
    const runR = await pool.query(
      `SELECT id, worker_job_id, benchmark, status, requested_by, pass_rate,
              total_controls, ok, alarm, info, skip, error, error_message, started_at, finished_at
       FROM compliance_runs WHERE id = $1`,
      [id],
    );
    if (runR.rows.length === 0) {
      return NextResponse.json({ message: 'run not found' }, { status: 404 });
    }
    const run = runR.rows[0];
    // round-6 review MAJOR: use matchesIdentity (also accepts a legacy row keyed by the raw sub,
    // written before the identity() switch), matching the LIST route and jobs/[id] — a direct
    // `!==` here let a legacy-sub-keyed run show up in LIST but 403 on this DETAIL route.
    if (!matchesIdentity(run.requested_by, user) && !(await isAdmin(user))) {
      return NextResponse.json({ message: 'forbidden' }, { status: 403 });
    }
    const resR = await pool.query(
      `SELECT control_id, title, section, status, reason, resource, region, severity
       FROM compliance_results WHERE run_id = $1
       ORDER BY section, control_id, status`,
      [id],
    );
    return NextResponse.json({ run: runR.rows[0], results: resR.rows });
  } catch (e) {
    return NextResponse.json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
