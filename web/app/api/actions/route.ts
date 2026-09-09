// web/app/api/actions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { listCatalog, getAction, createPlan, recordAudit } from '@/lib/remediation';
import { redactEgress, assertChannelAllowed } from '@/lib/egress-dlp';
import { getEgressWriteAllowlist } from '@/lib/integrations';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user || !(await isAdmin(user))) return NextResponse.json({ message: 'admin required' }, { status: 403 });
  return NextResponse.json({ catalog: await listCatalog() });
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user || !(await isAdmin(user))) return NextResponse.json({ message: 'admin required' }, { status: 403 });
  let body: any;
  try { body = await readJsonBounded(req); }
  catch (e) { if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 }); return NextResponse.json({ message: 'invalid JSON' }, { status: 400 }); }
  const action = await getAction(String(body?.action ?? ''));
  if (!action) return NextResponse.json({ message: 'unknown action' }, { status: 400 });
  if (!action.enabled) return NextResponse.json({ message: 'action disabled (catalog enabled=false)' }, { status: 409 });
  let inputs = (body?.inputs && typeof body.inputs === 'object') ? body.inputs : {};
  for (const k of action.requiredInputs) if (!(k in inputs)) return NextResponse.json({ message: `missing input: ${k}` }, { status: 400 });
  // ADR-040/041 §2 — external DATA-write: enforce the destination (channel) allowlist + DLP-redact the
  // inputs AT PLAN TIME, so the stored dry-run/preview a human 4-eyes-reviews is already redacted, and a
  // disallowed destination is rejected before any plan exists. (AWS-resource actions are untouched.)
  if ((action.targetResourceType ?? '').startsWith('external:')) {
    const kind = (action.targetResourceType ?? '').split(':')[1] ?? '';
    const allowlist = await getEgressWriteAllowlist(kind);
    try { assertChannelAllowed(String((inputs as Record<string, unknown>).channel ?? ''), allowlist); }
    catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : 'channel not allowed' }, { status: 400 }); }
    inputs = redactEgress(inputs).payload as typeof inputs;
  }
  // Plan-time dry-run + paired rollback are computed here WITHOUT mutation. In this skeleton the
  // dry-run is a contract echo (the live dry-run runs in the SFN DryRunFirst state at execute time).
  const dryRun = { mode: 'plan', action: action.name, inputs, mutates: false };
  const rollbackPlan = { action: action.name, captured_at: new Date().toISOString(), inputs };
  // user.sub, NOT the email: created_by is read back by the 4-eyes gate, and an email is mutable, so
  // recording one meant the same human could hold two spellings — create under emailA, later approve
  // with verified emailB, and a key-set comparison still finds no match (codex stop-gate). The sub is
  // the one identifier that cannot change. Attribution for humans stays in the audit trail, which
  // records `principal` separately.
  const plan = await createPlan({ action: action.name, inputs, createdBy: user.sub, dryRun, rollbackPlan });
  await recordAudit({ planId: plan.planId, actionName: action.name, phase: 'plan', principal: user.email ?? user.sub, detail: { inputs } });
  return NextResponse.json({ ...plan, dryRun, rollbackPlan, status: 'planned' }, { status: 201 });
}
