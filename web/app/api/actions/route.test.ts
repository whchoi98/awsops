import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyUser = vi.fn();
const isAdmin = vi.fn();
const listCatalog = vi.fn();
const getAction = vi.fn();
const createPlan = vi.fn();
const recordAudit = vi.fn();
vi.mock('@/lib/auth', () => ({ verifyUser: (...a: unknown[]) => verifyUser(...a) }));
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }));
vi.mock('@/lib/remediation', () => ({
  listCatalog: (...a: unknown[]) => listCatalog(...a),
  getAction: (...a: unknown[]) => getAction(...a),
  createPlan: (...a: unknown[]) => createPlan(...a),
  recordAudit: (...a: unknown[]) => recordAudit(...a),
}));

function get(cookie = 'awsops_token=t') {
  return new Request('http://x/api/actions', { headers: { cookie } }) as any;
}
function post(body: unknown, cookie = 'awsops_token=t') {
  return new Request('http://x/api/actions', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }) as any;
}

beforeEach(() => {
  verifyUser.mockReset(); isAdmin.mockReset(); listCatalog.mockReset(); getAction.mockReset(); createPlan.mockReset(); recordAudit.mockReset();
  verifyUser.mockResolvedValue({ sub: 'a', email: 'admin@x', groups: ['admins'] });
  isAdmin.mockResolvedValue(true);
  listCatalog.mockResolvedValue([]);
});

const enabledAction = { name: 'ec2-create-tags', description: 'd', executorType: 'ssm', targetResourceType: 'ec2:instance', approvalMode: 'change_manager', requiredInputs: ['resourceArn'], enabled: true };

describe('GET /api/actions (catalog read, admin-gated)', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockResolvedValue(false);
    const { GET } = await import('./route');
    expect((await GET(get())).status).toBe(403);
  });
  it('403 when unauthenticated', async () => {
    verifyUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(get())).status).toBe(403);
  });
  it('200 catalog for admin', async () => {
    listCatalog.mockResolvedValue([enabledAction]);
    const { GET } = await import('./route');
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect((await res.json()).catalog[0].name).toBe('ec2-create-tags');
  });
});

describe('POST /api/actions (plan; admin-gated; NEVER mutates)', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockResolvedValue(false);
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'ec2-create-tags' }))).status).toBe(403);
  });
  it('400 unknown action', async () => {
    getAction.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'nope' }))).status).toBe(400);
  });
  it('409 disabled action (enabled=false)', async () => {
    getAction.mockResolvedValue({ ...enabledAction, enabled: false });
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'ec2-create-tags', inputs: { resourceArn: 'x' } }))).status).toBe(409);
  });
  it('400 missing required input', async () => {
    getAction.mockResolvedValue(enabledAction);
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'ec2-create-tags', inputs: {} }))).status).toBe(400);
  });
  it('201 valid plan: dryRun.mutates=false, token+expiry, audit("plan")', async () => {
    getAction.mockResolvedValue(enabledAction);
    createPlan.mockResolvedValue({ planId: 'p1', idempotencyToken: 'tok', expiresAt: '2026-06-10T00:05:00Z' });
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'ec2-create-tags', inputs: { resourceArn: 'arn:aws:ec2:::instance/i-1' } }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.dryRun.mutates).toBe(false);
    expect(j.idempotencyToken).toBe('tok');
    expect(j.expiresAt).toBe('2026-06-10T00:05:00Z');
    expect(j.status).toBe('planned');
    // the SUB, not the email: created_by feeds the 4-eyes comparison and an email is mutable
    expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ action: 'ec2-create-tags', createdBy: 'a' }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'plan' }));
  });
  it('400 external action: channel allowlist fail-closed (no allowlist → deny-all), no plan created', async () => {
    delete process.env.AURORA_ENDPOINT; // getEgressWriteAllowlist → [] → assertChannelAllowed throws
    getAction.mockResolvedValue({ name: 'slack.post_message', description: 'd', executorType: 'lambda', targetResourceType: 'external:slack', approvalMode: 'four_eyes', requiredInputs: ['channel', 'text'], enabled: true });
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'slack.post_message', inputs: { channel: '#random', text: 'hi' } }));
    expect(res.status).toBe(400);
    expect(createPlan).not.toHaveBeenCalled();
  });
});
