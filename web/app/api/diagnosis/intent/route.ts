// web/app/api/diagnosis/intent/route.ts
// Plan-2 Intent Engine — architecture_intent reads (auth) + admin-gated write actions.
// Mirrors the admin-gate + force-dynamic idiom of web/app/api/incidents/route.ts.
//
// SAFETY / anti-fabrication (§8R3):
//   - GET (list) is READ-ONLY; any authenticated user may view intents.
//   - POST is ADMIN-ONLY (isAdmin) — propose/promote/reject. The LLM never activates an invariant;
//     promotion to 'active' is a deliberate human (admin) action.
//   - A `severity:'critical'` candidate may ONLY be promoted via an explicit SINGLE `id` — a bulk
//     accept (`ids: [...]`) of a critical item is rejected (400). Forces per-item review of the
//     high-blast-radius invariants.
//   - Operator-supplied `edits` text is stored as DATA via the parameterized CRUD; it is never
//     echoed into any prompt as instructions.
import { NextRequest, NextResponse } from 'next/server';
import { verifyUser, identity } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { listIntents, proposeCandidates, promoteIntent, rejectIntent } from '@/lib/intent';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') ?? undefined;
  return NextResponse.json({ intents: await listIntents(status) });
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user || !(await isAdmin(user))) {
    return NextResponse.json({ message: 'admin required' }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await readJsonBounded(req); // bound BEFORE parse (OOM guard)
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 });
    return NextResponse.json({ message: 'invalid JSON' }, { status: 400 });
  }

  const action = String(body?.action ?? '');
  const createdBy = user.sub;   // immutable ownership key — see the note in app/api/jobs/route.ts

  if (action === 'propose') {
    const candidates = await proposeCandidates(createdBy);
    return NextResponse.json({ candidates }, { status: 200 });
  }

  if (action === 'promote') {
    const edits = (body?.edits ?? {}) as Record<string, unknown>;
    const isCritical = edits?.severity === 'critical';

    // §8R3: no bulk accept of critical items — require an explicit single id.
    if (Array.isArray(body?.ids)) {
      if (isCritical || body.ids.length > 1) {
        return NextResponse.json(
          { message: 'bulk promote is not allowed for critical/multiple items — promote one id at a time' },
          { status: 400 },
        );
      }
    }
    const id = Number(body?.id ?? (Array.isArray(body?.ids) ? body.ids[0] : undefined));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ message: 'promote requires a single numeric id' }, { status: 400 });
    }
    const promoted = await promoteIntent(id, edits, createdBy);
    if (promoted == null) {
      return NextResponse.json(
        { message: 'invalid predicate or not a promotable draft' },
        { status: 422 },
      );
    }
    return NextResponse.json({ id: promoted, status: 'active' }, { status: 200 });
  }

  if (action === 'reject') {
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ message: 'reject requires a numeric id' }, { status: 400 });
    }
    await rejectIntent(id);
    return NextResponse.json({ id, status: 'rejected' }, { status: 200 });
  }

  return NextResponse.json({ message: `unknown action: ${action}` }, { status: 400 });
}
