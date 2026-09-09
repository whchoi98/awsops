import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyUser = vi.fn();
const isAdmin = vi.fn();
const listIntents = vi.fn();
const proposeCandidates = vi.fn();
const promoteIntent = vi.fn();
const rejectIntent = vi.fn();

vi.mock('@/lib/auth', () => ({ verifyUser: (...a: unknown[]) => verifyUser(...a), identity: (u: any) => u.email || u.sub }));
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }));
vi.mock('@/lib/intent', () => ({
  listIntents: (...a: unknown[]) => listIntents(...a),
  proposeCandidates: (...a: unknown[]) => proposeCandidates(...a),
  promoteIntent: (...a: unknown[]) => promoteIntent(...a),
  rejectIntent: (...a: unknown[]) => rejectIntent(...a),
}));

function get(cookie = 'awsops_token=t') {
  return new Request('http://x/api/diagnosis/intent', { headers: { cookie } }) as any;
}
function post(body: unknown, cookie = 'awsops_token=t') {
  return new Request('http://x/api/diagnosis/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.resetModules();
  verifyUser.mockReset(); isAdmin.mockReset(); listIntents.mockReset();
  proposeCandidates.mockReset(); promoteIntent.mockReset(); rejectIntent.mockReset();
  verifyUser.mockResolvedValue({ sub: 'a', email: 'a', groups: ['admins'] });
  isAdmin.mockResolvedValue(true);
  listIntents.mockResolvedValue([{ id: 1, kind: 'private_only', status: 'draft' }]);
  proposeCandidates.mockResolvedValue([{ kind: 'private_only', target: 'rds' }]);
  promoteIntent.mockResolvedValue(7);
  rejectIntent.mockResolvedValue(undefined);
});

describe('GET /api/diagnosis/intent (auth, list)', () => {
  it('401 when unauthenticated', async () => {
    verifyUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(get())).status).toBe(401);
  });
  it('200 lists intents for an authenticated user (read-only; not admin-gated)', async () => {
    isAdmin.mockResolvedValue(false);
    const { GET } = await import('./route');
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect((await res.json()).intents[0].id).toBe(1);
  });
});

describe('POST /api/diagnosis/intent (admin-gated)', () => {
  it('403 for non-admin', async () => {
    isAdmin.mockResolvedValue(false);
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'propose' }))).status).toBe(403);
    expect(proposeCandidates).not.toHaveBeenCalled();
  });

  it('401 when unauthenticated', async () => {
    verifyUser.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'propose' }))).status).toBe(403);
  });

  it('propose → returns drafts', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'propose' }));
    expect(res.status).toBe(200);
    expect(proposeCandidates).toHaveBeenCalledWith('a');
    expect((await res.json()).candidates.length).toBe(1);
  });

  it('promote → flips a draft to active and returns the id', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'promote', id: 7, edits: { kind: 'private_only', target: 'rds', severity: 'warning' } }));
    expect(res.status).toBe(200);
    expect(promoteIntent).toHaveBeenCalledWith(7, expect.objectContaining({ kind: 'private_only' }), 'a');
    expect((await res.json()).id).toBe(7);
  });

  it('promote with an invalid predicate → 422 (promoteIntent returned null)', async () => {
    promoteIntent.mockResolvedValue(null);
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'promote', id: 7, edits: { kind: 'bogus' } }));
    expect(res.status).toBe(422);
  });

  it('reject → sets rejected', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'reject', id: 9 }));
    expect(res.status).toBe(200);
    expect(rejectIntent).toHaveBeenCalledWith(9);
  });

  it('§8R3: bulk-promote (array of ids) for a CRITICAL candidate is rejected with 400', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'promote', ids: [1, 2, 3], edits: { kind: 'private_only', target: 'rds', severity: 'critical' } }));
    expect(res.status).toBe(400);
    expect(promoteIntent).not.toHaveBeenCalled();
  });

  it('§8R3: a single critical promote is allowed (explicit id)', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ action: 'promote', id: 5, edits: { kind: 'private_only', target: 'rds', severity: 'critical' } }));
    expect(res.status).toBe(200);
    expect(promoteIntent).toHaveBeenCalledWith(5, expect.objectContaining({ severity: 'critical' }), 'a');
  });

  it('unknown action → 400', async () => {
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'nuke' }))).status).toBe(400);
  });

  it('promote without an id → 400', async () => {
    const { POST } = await import('./route');
    expect((await POST(post({ action: 'promote', edits: { kind: 'private_only', target: 'rds' } }))).status).toBe(400);
    expect(promoteIntent).not.toHaveBeenCalled();
  });
});
