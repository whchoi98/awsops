import { verifyUser } from '@/lib/auth';
import { triggerSync, readResources, assertInventoryTypeAllowed } from '@/lib/inventory';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// pentest-remediation P2-2: this route only called verifyUser() — no type allowlist, no admin
// gate — so POST /api/inventory/iam_user/refresh returned the same IAM rows a non-admin is 403'd
// from on GET /api/inventory/iam_user. Now shares the GET route's gate via assertInventoryTypeAllowed.
export async function POST(request: Request, { params }: { params: { type: string } }) {
  const user = await verifyUser(request.headers.get('cookie'));
  if (!user) {
    return Response.json({ status: 'error', message: 'unauthenticated' }, { status: 401 });
  }
  const gate = await assertInventoryTypeAllowed(params.type, user);
  if (gate) return Response.json({ status: 'error', message: gate.message }, { status: gate.status });
  try {
    const sync = await triggerSync(params.type); // warm Steampipe -> Aurora (seconds); 'busy' if locked
    const page = await readResources(params.type, { limit: 100, offset: 0 });
    return Response.json({ ...page, sync });
  } catch (e) {
    return Response.json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
