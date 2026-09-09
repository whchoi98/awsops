import { NextResponse } from 'next/server';
import { verifyUser, ownerKeysForRead } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// pentest-remediation P2-1: no requested_by filter — any authenticated user could list every
// account's CIS benchmark results (full security-posture data) regardless of who ran the scan.
export async function GET(req: Request) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) {
    return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  }
  try {
    const admin = await isAdmin(user);
    const cols = `id, worker_job_id, benchmark, status, requested_by, account, pass_rate,
              total_controls, ok, alarm, info, skip, error, error_message, started_at, finished_at`;
    // round-5 review MAJOR (parallel to /api/jobs list): also scope by the raw sub so a legacy
    // sub-keyed row still shows up in the LIST for its real owner.
    const r = admin
      ? await getPool().query(`SELECT ${cols} FROM compliance_runs ORDER BY started_at DESC LIMIT 50`)
      : await getPool().query(
          `SELECT ${cols} FROM compliance_runs WHERE requested_by = ANY($1) ORDER BY started_at DESC LIMIT 50`,
          [[...ownerKeysForRead(user)]],
        );
    return NextResponse.json({ runs: r.rows });
  } catch (e) {
    return NextResponse.json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
