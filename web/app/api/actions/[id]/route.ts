// web/app/api/actions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { getPool } from '@/lib/db';
import { verifyUser, identityKeys } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getPlan, getAction, setApprovedAndExecuting, recordAudit } from '@/lib/remediation';
import { redactEgress } from '@/lib/egress-dlp';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ssm: SSMClient | null = null; let sqs: SQSClient | null = null;
// ADR-040/041 §4: the kill-switch param is branched by the caller — external DATA-writes read the
// SEPARATE integrations-write switch, AWS-resource the mutating-actions switch. Empty name ⇒ fail-closed.
async function killSwitchOn(name: string | undefined): Promise<boolean> {
  if (!name) return false; // fail-closed
  if (!ssm) ssm = new SSMClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  try { const r = await ssm.send(new GetParameterCommand({ Name: name })); return (r.Parameter?.Value ?? '').toLowerCase() === 'true'; }
  catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user || !(await isAdmin(user))) return NextResponse.json({ message: 'admin required' }, { status: 403 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ message: 'invalid plan id' }, { status: 400 });
  const plan = await getPlan(params.id);
  return plan ? NextResponse.json(plan) : NextResponse.json({ message: 'plan not found' }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user || !(await isAdmin(user))) return NextResponse.json({ message: 'admin required' }, { status: 403 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ message: 'invalid plan id' }, { status: 400 });
  let body: any;
  try { body = await readJsonBounded(req); }
  catch (e) { if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 }); return NextResponse.json({ message: 'invalid JSON' }, { status: 400 }); }
  const op = body?.op;
  const plan = await getPlan(params.id);
  if (!plan) return NextResponse.json({ message: 'plan not found' }, { status: 404 });
  const approver = user.email ?? user.sub;
  // Both spellings this token could appear under. `approver` alone is one of them, and created_by may
  // hold the other — /api/actions writes `user.email ?? user.sub`, and after the email_verified gate the
  // same human's later token can yield only the sub. Comparing one string against one string let them
  // approve their own plan (PR #203 review MAJOR).
  const approverKeys = identityKeys(user);

  if (op === 'cancel') {
    await getPool().query(`UPDATE action_plans SET status='canceled' WHERE plan_id=$1 AND status IN ('planned','approved')`, [params.id]);
    await recordAudit({ planId: params.id, phase: 'approve', principal: approver, decision: 'canceled' });
    return NextResponse.json({ status: 'canceled' });
  }
  if (op !== 'execute') return NextResponse.json({ message: 'op must be execute|cancel' }, { status: 400 });

  // ADR-040/041 §4 — branch the control plane by the action's target_resource_type. An `external:`
  // action is a DATA-write (Slack/Notion/…) gated by the INTEGRATIONS_WRITE plane; everything else is
  // an AWS-resource action gated by the (frozen) REMEDIATION plane. (getAction may be unset in early
  // gates → treated as non-external = the AWS plane, preserving legacy behavior.)
  const action = await getAction(plan.action_name);
  const isExternal = (action?.targetResourceType ?? '').startsWith('external:');
  const flagName = isExternal ? 'INTEGRATIONS_WRITE_ENABLED' : 'REMEDIATION_ENABLED';
  const ksParam = isExternal ? process.env.INTEGRATIONS_WRITE_SSM : process.env.MUTATING_ACTIONS_SSM;

  // ---- Hard gates: flag (env) + kill-switch (SSM) + 4-eyes (different approver) + not expired ----
  if (process.env[flagName] !== 'true') {
    await recordAudit({ planId: params.id, phase: 'execute', principal: approver, decision: 'flag_off' });
    return NextResponse.json({ message: `${isExternal ? 'integrations-write' : 'remediation'} disabled (flag off)` }, { status: 503 });
  }
  if (!(await killSwitchOn(ksParam))) {
    await recordAudit({ planId: params.id, phase: 'execute', principal: approver, decision: 'killswitch_blocked' });
    return NextResponse.json({ message: 'kill-switch is off' }, { status: 403 });
  }
  if (plan.expired) return NextResponse.json({ message: 'plan expired (>5 min)' }, { status: 410 });
  if (approverKeys.includes(plan.created_by)) {
    await recordAudit({ planId: params.id, phase: 'execute', principal: approver, decision: 'denied_self_approval' });
    return NextResponse.json({ message: '4-eyes: approver must differ from creator' }, { status: 403 });
  }
  // An email-keyed created_by cannot be compared to a token identity at all: emails are mutable and
  // reassignable, so "not one of my current keys" does not mean "not me" (it could be an address this
  // same sub used before). Plans are now written with the sub, and they expire after 5 minutes, so the
  // only email-keyed plans that can exist are ones created seconds before this deploy. Refuse those
  // rather than guess — a security gate that cannot prove distinctness must not assume it.
  if (plan.created_by.includes('@')) {
    await recordAudit({ planId: params.id, phase: 'execute', principal: approver, decision: 'denied_unprovable_4eyes' });
    return NextResponse.json({
      message: '4-eyes cannot be verified: this plan was created under an email-keyed identity and your '
        + 'token carries no verified email. Verify your address (or have another admin approve).',
    }, { status: 403 });
  }
  if (!action || !action.enabled) return NextResponse.json({ message: 'action disabled' }, { status: 409 });

  const jobId = randomUUID();
  const ok = await setApprovedAndExecuting(params.id, approver, jobId, approverKeys); // atomic 4-eyes + not-expired guard in SQL
  if (!ok) return NextResponse.json({ message: 'plan not in an approvable state (re-fetch)' }, { status: 409 });

  // Enqueue into the P2 ledger (worker_jobs) + SQS — the dispatcher routes 'action' to the remediation SM.
  // ADR-040 §2 defense-in-depth: re-redact the inputs for an external DATA-write before they leave the web
  // layer (the executor re-redacts again — never trust upstream). AWS-resource inputs pass through.
  const rawInputs = plan.dry_run?.inputs ?? {};
  const inputs = isExternal ? redactEgress(rawInputs).payload : rawInputs;
  await getPool().query(
    `INSERT INTO worker_jobs (job_id, type, payload, dry_run, status, plan_id) VALUES ($1,'action',$2::jsonb,false,'queued',$3)`,
    [jobId, JSON.stringify({ rollback_plan: plan.rollback_plan, ...plan.dry_run, inputs }), params.id]);
  const queueUrl = process.env.JOBS_QUEUE_URL;
  if (queueUrl) {
    if (!sqs) sqs = new SQSClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({
      job_id: jobId, type: 'action', action: plan.action_name, executor_type: action.executorType,
      plan_id: params.id, payload: { rollback_plan: plan.rollback_plan, ...inputs }, dry_run: false }) }));
  }
  await recordAudit({ planId: params.id, jobId, actionName: plan.action_name, phase: 'execute', principal: approver, decision: 'approved' });
  return NextResponse.json({ status: 'executing', job_id: jobId, approved_by: approver }, { status: 202 });
}
