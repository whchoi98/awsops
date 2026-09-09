import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: (...a: unknown[]) => query(...a) }) }));

beforeEach(() => {
  query.mockReset();
  process.env.AURORA_ENDPOINT = 'h';
});

describe('remediation data layer', () => {
  it('listCatalog returns [] when AURORA unconfigured (degrade-safe)', async () => {
    delete process.env.AURORA_ENDPOINT;
    const { listCatalog } = await import('./remediation');
    expect(await listCatalog()).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('listCatalog SELECTs action_catalog and maps snake→camel', async () => {
    query.mockResolvedValue({ rows: [{ name: 'ec2-create-tags', description: 'd', executor_type: 'ssm',
      target_resource_type: 'ec2:instance', approval_mode: 'change_manager', required_inputs: ['resourceArn'], enabled: false }] });
    const { listCatalog } = await import('./remediation');
    const rows = await listCatalog();
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/FROM action_catalog/);
    expect(rows[0]).toMatchObject({ name: 'ec2-create-tags', executorType: 'ssm', targetResourceType: 'ec2:instance',
      approvalMode: 'change_manager', requiredInputs: ['resourceArn'], enabled: false });
  });

  it('createPlan inserts a 5-min expiry plan and returns tokens', async () => {
    query.mockResolvedValue({ rows: [{ expires_at: '2026-06-10T00:05:00Z' }] });
    const { createPlan } = await import('./remediation');
    const r = await createPlan({ action: 'a', inputs: { x: 1 }, createdBy: 'admin@x',
      dryRun: { mutates: false }, rollbackPlan: { action: 'a' } });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/INSERT INTO action_plans/);
    expect(sql).toMatch(/NOW\(\) \+ INTERVAL '5 minutes'/);
    expect(sql).toMatch(/'planned'/);
    expect(r.planId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.idempotencyToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.expiresAt).toBe('2026-06-10T00:05:00Z');
  });

  it('setApprovedAndExecuting SQL enforces 4-eyes + not-expired + planned status', async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const { setApprovedAndExecuting } = await import('./remediation');
    const ok = await setApprovedAndExecuting('p', 'approver@x', 'job1', ['sub-a', 'approver@x']);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/status='executing'/);
    expect(sql).toMatch(/created_by <> ALL\(\$4::text\[\]\)/);   // 4-eyes against EVERY approver key
    expect(sql).toMatch(/expires_at > NOW\(\)/); // not expired
    expect(sql).toMatch(/status='planned'/);     // only from planned
    expect(ok).toBe(true);
  });

  it('setApprovedAndExecuting returns false when no row updated (rowCount 0)', async () => {
    query.mockResolvedValue({ rowCount: 0 });
    const { setApprovedAndExecuting } = await import('./remediation');
    expect(await setApprovedAndExecuting('p', 'a', 'j')).toBe(false);
  });

  it('recordAudit is a no-op when AURORA unconfigured', async () => {
    delete process.env.AURORA_ENDPOINT;
    const { recordAudit } = await import('./remediation');
    await recordAudit({ phase: 'plan', principal: 'admin@x' });
    expect(query).not.toHaveBeenCalled();
  });
});
