// web/lib/remediation.ts
// ADR-029+036 — Aurora data layer for the remediation substrate. Plan creation is dry-run-only
// (NO mutation); execute enqueues into the P2 ledger. Degrade-safe when AURORA unconfigured.
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db';

export interface CatalogRow { name: string; description: string; executorType: 'ssm'|'lambda'|'fargate'; targetResourceType: string; approvalMode: string; requiredInputs: string[]; enabled: boolean; }

export async function listCatalog(): Promise<CatalogRow[]> {
  if (!process.env.AURORA_ENDPOINT) return [];
  const { rows } = await getPool().query(
    `SELECT name, description, executor_type, target_resource_type, approval_mode, required_inputs, enabled
     FROM action_catalog ORDER BY name`);
  return rows.map((r: Record<string, unknown>) => ({
    name: r.name as string, description: r.description as string,
    executorType: r.executor_type as CatalogRow['executorType'],
    targetResourceType: r.target_resource_type as string, approvalMode: r.approval_mode as string,
    requiredInputs: (r.required_inputs as string[]) ?? [], enabled: r.enabled as boolean }));
}

export async function getAction(name: string): Promise<CatalogRow | null> {
  const all = await listCatalog();
  return all.find((a) => a.name === name) ?? null;
}

// Plan = capture a dry-run + a PAIRED rollback artifact + a 5-min idempotency token. NO mutation.
export async function createPlan(input: { action: string; inputs: Record<string, unknown>; createdBy: string;
  dryRun: Record<string, unknown>; rollbackPlan: Record<string, unknown>; }): Promise<{ planId: string; idempotencyToken: string; expiresAt: string }> {
  const planId = randomUUID();
  const idempotencyToken = randomUUID();
  const { rows } = await getPool().query(
    `INSERT INTO action_plans (plan_id, action_name, idempotency_token, inputs, dry_run, rollback_plan, status, created_by, expires_at)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,'planned',$7, NOW() + INTERVAL '5 minutes')
     RETURNING expires_at`,
    [planId, input.action, idempotencyToken, JSON.stringify(input.inputs), JSON.stringify(input.dryRun),
     JSON.stringify(input.rollbackPlan), input.createdBy]);
  return { planId, idempotencyToken, expiresAt: rows[0].expires_at };
}

export async function getPlan(planId: string) {
  const { rows } = await getPool().query(
    `SELECT plan_id, action_name, status, created_by, approved_by, job_id, dry_run, rollback_plan,
            expires_at, (expires_at < NOW()) AS expired, created_at, updated_at
     FROM action_plans WHERE plan_id = $1`, [planId]);
  return rows[0] ?? null;
}

// approverKeys, not just approvedBy: created_by may hold the approver's EMAIL (that is what
// /api/actions writes) while their current token only yields a sub — so a single-string `<>` compares
// two different spellings of one human and lets them approve their own plan. The SQL guard has to
// reject every key the approver could have been recorded under (PR #203 review MAJOR).
export async function setApprovedAndExecuting(
  planId: string, approvedBy: string, jobId: string, approverKeys: string[] = [approvedBy],
): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE action_plans SET status='executing', approved_by=$2, job_id=$3
     WHERE plan_id=$1 AND status='planned' AND expires_at > NOW()
       AND created_by <> ALL($4::text[])`, // 4-eyes + not expired
    [planId, approvedBy, jobId, approverKeys]);
  return (rowCount ?? 0) > 0;
}

export async function recordAudit(a: { planId?: string; jobId?: string; actionName?: string; phase: string;
  principal: string; decision?: string; detail?: Record<string, unknown>; }): Promise<void> {
  if (!process.env.AURORA_ENDPOINT) return;
  await getPool().query(
    `INSERT INTO remediation_audit (plan_id, job_id, action_name, phase, principal, decision, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [a.planId ?? null, a.jobId ?? null, a.actionName ?? null, a.phase, a.principal, a.decision ?? null, JSON.stringify(a.detail ?? {})]);
}
