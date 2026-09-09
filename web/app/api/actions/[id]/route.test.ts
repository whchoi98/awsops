import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyUser = vi.fn();
const isAdmin = vi.fn();
const getPlan = vi.fn();
const getAction = vi.fn();
const setApprovedAndExecuting = vi.fn();
const recordAudit = vi.fn();
const query = vi.fn();
const ssmSend = vi.fn();
const sqsSend = vi.fn();

vi.mock('@/lib/auth', () => ({
  verifyUser: (...a: unknown[]) => verifyUser(...a),
  // real behaviour: the 4-eyes gate depends on it, so a stub would test nothing
  identityKeys: (u: any) => (u.email ? [u.sub, u.email] : [u.sub]),
}));
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: (...a: unknown[]) => query(...a) }) }));
vi.mock('@/lib/remediation', () => ({
  getPlan: (...a: unknown[]) => getPlan(...a),
  getAction: (...a: unknown[]) => getAction(...a),
  setApprovedAndExecuting: (...a: unknown[]) => setApprovedAndExecuting(...a),
  recordAudit: (...a: unknown[]) => recordAudit(...a),
}));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class { send = (...a: unknown[]) => ssmSend(...a); },
  GetParameterCommand: class { constructor(public input: unknown) {} },
}));
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: class { send = (...a: unknown[]) => sqsSend(...a); },
  SendMessageCommand: class { constructor(public input: unknown) {} },
}));

const ID = '11111111-1111-1111-1111-111111111111';
function get(id = ID, cookie = 'awsops_token=t') {
  return [new Request(`http://x/api/actions/${id}`, { headers: { cookie } }) as any, { params: { id } }] as const;
}
function post(id: string, body: unknown, cookie = 'awsops_token=t') {
  return [new Request(`http://x/api/actions/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }) as any, { params: { id } }] as const;
}

const enabledAction = { name: 'ec2-create-tags', executorType: 'ssm', enabled: true } as any;
function plannedPlan(over: Record<string, unknown> = {}) {
  return { plan_id: ID, action_name: 'ec2-create-tags', status: 'planned', created_by: 'sub-creator',
    dry_run: { inputs: { resourceArn: 'arn' } }, rollback_plan: { action: 'ec2-create-tags' }, expired: false, ...over };
}

beforeEach(() => {
  verifyUser.mockReset(); isAdmin.mockReset(); getPlan.mockReset(); getAction.mockReset();
  setApprovedAndExecuting.mockReset(); recordAudit.mockReset(); query.mockReset(); ssmSend.mockReset(); sqsSend.mockReset();
  verifyUser.mockResolvedValue({ sub: 'a', email: 'approver@x', groups: ['admins'] });
  isAdmin.mockResolvedValue(true);
  delete process.env.REMEDIATION_ENABLED;
  delete process.env.MUTATING_ACTIONS_SSM;
  delete process.env.JOBS_QUEUE_URL;
});

describe('GET /api/actions/[id] (status)', () => {
  it('403 non-admin', async () => {
    isAdmin.mockResolvedValue(false);
    const { GET } = await import('./route');
    expect((await GET(...get())).status).toBe(403);
  });
  it('400 invalid plan id', async () => {
    const { GET } = await import('./route');
    expect((await GET(...get('not-a-uuid'))).status).toBe(400);
  });
  it('404 plan not found', async () => {
    getPlan.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(...get())).status).toBe(404);
  });
  it('200 returns plan', async () => {
    getPlan.mockResolvedValue(plannedPlan());
    const { GET } = await import('./route');
    const res = await GET(...get());
    expect(res.status).toBe(200);
    expect((await res.json()).plan_id).toBe(ID);
  });
});

describe('POST /api/actions/[id] execute — hard gates', () => {
  it('503 + flag_off audit when REMEDIATION_ENABLED!=true', async () => {
    getPlan.mockResolvedValue(plannedPlan());
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(503);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'execute', decision: 'flag_off' }));
    expect(setApprovedAndExecuting).not.toHaveBeenCalled();
  });

  it('403 when kill-switch off (flag on but SSM != true)', async () => {
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = '/ops/awsops-v2/remediation/mutating_enabled';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'false' } });
    getPlan.mockResolvedValue(plannedPlan());
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(403);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ decision: 'killswitch_blocked' }));
  });

  it('403 self-approval (4-eyes: creator == approver)', async () => {
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    getPlan.mockResolvedValue(plannedPlan({ created_by: 'approver@x' }));
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(403);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ decision: 'denied_self_approval' }));
    expect(setApprovedAndExecuting).not.toHaveBeenCalled();
  });

  it('403 self-approval when the plan holds the approver\'s EMAIL and the token yields the sub', async () => {
    // The bypass this closes: /api/actions writes `user.email ?? user.sub`, so created_by can be an
    // email, while after the email_verified gate the same human's later token carries only the sub.
    // `created_by === approver` compared two spellings of one person and let them self-approve
    // (PR #203 review MAJOR). The keys must be compared as a set.
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    verifyUser.mockResolvedValue({ sub: 'a', email: 'approver@x', groups: ['admins'] });
    getPlan.mockResolvedValue(plannedPlan({ created_by: 'a' }));  // recorded under the sub
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(403);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ decision: 'denied_self_approval' }));
    expect(setApprovedAndExecuting).not.toHaveBeenCalled();
  });

  it('403 when 4-eyes cannot be proven (any email-keyed creator — emails are mutable)', async () => {
    // Not just "the approver has no email": an email-keyed created_by cannot be compared to a token
    // identity at all, because the address may be one this same sub used earlier (codex stop-gate).
    // Plans are written with the sub and expire in 5 minutes, so such rows only exist across a deploy.
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    verifyUser.mockResolvedValue({ sub: 'b', email: 'other@x', groups: ['admins'] });
    getPlan.mockResolvedValue(plannedPlan({ created_by: 'someone@x' }));
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(403);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ decision: 'denied_unprovable_4eyes' }));
    expect(setApprovedAndExecuting).not.toHaveBeenCalled();
  });

  it('passes every approver key to the SQL guard, not just the display name', async () => {
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    process.env.JOBS_QUEUE_URL = 'https://sqs.example/q';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    getPlan.mockResolvedValue(plannedPlan({ created_by: 'sub-creator' }));
    getAction.mockResolvedValue(enabledAction);
    setApprovedAndExecuting.mockResolvedValue(true);
    query.mockResolvedValue({ rowCount: 1 });
    sqsSend.mockResolvedValue({});
    const { POST } = await import('./route');
    await POST(...post(ID, { op: 'execute' }));
    expect(setApprovedAndExecuting).toHaveBeenCalledWith(ID, 'approver@x', expect.any(String),
      ['a', 'approver@x']);
  });

  it('410 expired plan', async () => {
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    getPlan.mockResolvedValue(plannedPlan({ expired: true }));
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'execute' }))).status).toBe(410);
  });

  it('202 happy path (different approver, flag on, kill-switch on, enabled): worker_jobs insert + SQS send + approved audit', async () => {
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    process.env.JOBS_QUEUE_URL = 'https://sqs/q';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    getPlan.mockResolvedValue(plannedPlan());
    getAction.mockResolvedValue(enabledAction);
    setApprovedAndExecuting.mockResolvedValue(true);
    query.mockResolvedValue({ rowCount: 1 });
    sqsSend.mockResolvedValue({});
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(202);
    const j = await res.json();
    expect(j.status).toBe('executing');
    expect(j.job_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(j.approved_by).toBe('approver@x');
    expect(setApprovedAndExecuting).toHaveBeenCalled();
    // worker_jobs ledger insert
    expect(String(query.mock.calls[0][0])).toMatch(/INSERT INTO worker_jobs/);
    expect(sqsSend).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'execute', decision: 'approved' }));
  });

  it('409 when setApprovedAndExecuting loses the atomic race', async () => {
    process.env.REMEDIATION_ENABLED = 'true';
    process.env.MUTATING_ACTIONS_SSM = 'p';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    getPlan.mockResolvedValue(plannedPlan());
    getAction.mockResolvedValue(enabledAction);
    setApprovedAndExecuting.mockResolvedValue(false);
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'execute' }))).status).toBe(409);
  });
});

describe('POST /api/actions/[id] cancel + validation', () => {
  it('cancel → canceled', async () => {
    getPlan.mockResolvedValue(plannedPlan());
    query.mockResolvedValue({ rowCount: 1 });
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'cancel' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('canceled');
    expect(String(query.mock.calls[0][0])).toMatch(/status='canceled'/);
  });
  it('400 invalid op', async () => {
    getPlan.mockResolvedValue(plannedPlan());
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'bogus' }))).status).toBe(400);
  });
  it('400 invalid plan id', async () => {
    const { POST } = await import('./route');
    expect((await POST(...post('bad', { op: 'execute' }))).status).toBe(400);
  });
  it('404 when plan missing', async () => {
    getPlan.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'execute' }))).status).toBe(404);
  });
});

// ADR-040/041 §4 — the data-write plane is FULLY decoupled from the AWS-resource plane. The invariant:
// enabling INTEGRATIONS_WRITE can NEVER enable an AWS-resource action, and vice-versa.
describe('POST execute — external DATA-write decoupling (ADR-040/041)', () => {
  const slackAction = { name: 'slack.post_message', executorType: 'lambda', targetResourceType: 'external:slack', enabled: true } as any;
  const slackPlan = (over = {}) => plannedPlan({ action_name: 'slack.post_message', dry_run: { inputs: { channel: '#ops', text: 'hi' } }, ...over });
  beforeEach(() => { delete process.env.INTEGRATIONS_WRITE_ENABLED; delete process.env.INTEGRATIONS_WRITE_SSM; });

  it('external action gates on INTEGRATIONS_WRITE_ENABLED (503), NOT REMEDIATION_ENABLED', async () => {
    getPlan.mockResolvedValue(slackPlan()); getAction.mockResolvedValue(slackAction);
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(503);
    expect((await res.json()).message).toMatch(/integrations-write/);
  });

  it('AWS-resource flag ON does NOT enable an external action (still 503)', async () => {
    process.env.REMEDIATION_ENABLED = 'true'; process.env.MUTATING_ACTIONS_SSM = 'p';
    // INTEGRATIONS_WRITE_ENABLED stays off
    getPlan.mockResolvedValue(slackPlan()); getAction.mockResolvedValue(slackAction);
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'execute' }))).status).toBe(503);
  });

  it('ADVERSARIAL: external flag ON does NOT enable an AWS-resource action (still 503 on REMEDIATION)', async () => {
    process.env.INTEGRATIONS_WRITE_ENABLED = 'true'; process.env.INTEGRATIONS_WRITE_SSM = 'pi';
    // REMEDIATION_ENABLED stays off — an AWS-resource action (no external: prefix) must still be denied
    getPlan.mockResolvedValue(plannedPlan()); getAction.mockResolvedValue(enabledAction);
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'execute' }))).status).toBe(503);
  });

  it('external action with its own kill-switch OFF → 403 (separate from the AWS kill-switch)', async () => {
    process.env.INTEGRATIONS_WRITE_ENABLED = 'true'; process.env.INTEGRATIONS_WRITE_SSM = 'pi';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'false' } });
    getPlan.mockResolvedValue(slackPlan()); getAction.mockResolvedValue(slackAction);
    const { POST } = await import('./route');
    expect((await POST(...post(ID, { op: 'execute' }))).status).toBe(403);
  });

  it('external happy path: own flag+kill-switch on, 4-eyes → 202 with lambda executor_type', async () => {
    process.env.INTEGRATIONS_WRITE_ENABLED = 'true'; process.env.INTEGRATIONS_WRITE_SSM = 'pi';
    process.env.JOBS_QUEUE_URL = 'https://sqs/q';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'true' } });
    getPlan.mockResolvedValue(slackPlan()); getAction.mockResolvedValue(slackAction);
    setApprovedAndExecuting.mockResolvedValue(true); query.mockResolvedValue({ rowCount: 1 }); sqsSend.mockResolvedValue({});
    const { POST } = await import('./route');
    const res = await POST(...post(ID, { op: 'execute' }));
    expect(res.status).toBe(202);
    const sent = JSON.parse((sqsSend.mock.calls[0][0] as { input: { MessageBody: string } }).input.MessageBody);
    expect(sent.executor_type).toBe('lambda');
  });
});
