import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ verifyUser: vi.fn() }));
vi.mock('@/lib/diagnosis', () => ({
  getReport: vi.fn(async (id: number) =>
    id === 1 ? { id: 1, tier: 'mid', status: 'succeeded', artifact_uri: null, requested_by: 'u@x.io' } : null,
  ),
  canMutateReport: vi.fn(),
  updateReportMeta: vi.fn(),
  softDeleteReport: vi.fn(),
}));

import { verifyUser } from '@/lib/auth';
import { canMutateReport, updateReportMeta, softDeleteReport } from '@/lib/diagnosis';
import { GET, PATCH, DELETE } from './route';

// PATCH now reads the body via readJsonBounded (pentest-remediation P0-2), which streams
// request.body directly — a real Request (not a hand-rolled { json: ... } stub) so that stream
// actually exists, matching the undici/App-Router runtime readJsonBounded's doc comment assumes.
const req = (body?: unknown) =>
  new Request('http://x/api/diagnosis/1', {
    method: 'PATCH',
    headers: { cookie: 'awsops_token=t' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
  (canMutateReport as any).mockResolvedValue(true);
});

describe('GET /api/diagnosis/[id]', () => {
  it('401 when unauthenticated', async () => {
    (verifyUser as any).mockResolvedValue(null);
    expect((await GET(req(), { params: { id: '1' } })).status).toBe(401);
  });
  it('400 on a non-numeric id', async () => {
    expect((await GET(req(), { params: { id: 'abc' } })).status).toBe(400);
  });
  it('404 for missing', async () => {
    expect((await GET(req(), { params: { id: '999' } })).status).toBe(404);
  });
  it('returns the report with can_edit', async () => {
    const r = await GET(req(), { params: { id: '1' } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.report.id).toBe(1);
    expect(j.report.can_edit).toBe(true);
  });
  // pentest-remediation P2-1 (Finding 5): canMutateReport() used to gate only the can_edit display
  // flag — the read itself was never gated, so any authenticated user could fetch any report.
  it('403 for a non-owner, non-admin (read path is now gated, not just can_edit)', async () => {
    (canMutateReport as any).mockResolvedValue(false);
    expect((await GET(req(), { params: { id: '1' } })).status).toBe(403);
  });
});

describe('PATCH /api/diagnosis/[id]', () => {
  it('200 for owner/admin and calls updateReportMeta (sanitized)', async () => {
    const r = await PATCH(req({ title: '  핵심 제목  ', tags: ['보안', '보안', ' 비용 '] }), { params: { id: '1' } });
    expect(r.status).toBe(200);
    const [, meta] = (updateReportMeta as any).mock.calls.at(-1);
    expect(meta.title).toBe('핵심 제목');           // trimmed
    expect(meta.tags).toEqual(['보안', '비용']);      // deduped + trimmed
  });
  it('403 for a stranger', async () => {
    (canMutateReport as any).mockResolvedValue(false);
    expect((await PATCH(req({ title: 'x' }), { params: { id: '1' } })).status).toBe(403);
    expect(updateReportMeta).not.toHaveBeenCalled();
  });
  it('401 unauthenticated', async () => {
    (verifyUser as any).mockResolvedValue(null);
    expect((await PATCH(req({ title: 'x' }), { params: { id: '1' } })).status).toBe(401);
  });
  it('404 missing report', async () => {
    expect((await PATCH(req({ title: 'x' }), { params: { id: '999' } })).status).toBe(404);
  });
  it('400 when tags is not an array', async () => {
    expect((await PATCH(req({ tags: 'nope' }), { params: { id: '1' } })).status).toBe(400);
  });
  it('400 when body has no title/tags', async () => {
    expect((await PATCH(req({ foo: 1 }), { params: { id: '1' } })).status).toBe(400);
  });
});

describe('DELETE /api/diagnosis/[id]', () => {
  it('200 for owner/admin and soft-deletes', async () => {
    const r = await DELETE(req(), { params: { id: '1' } });
    expect(r.status).toBe(200);
    expect(softDeleteReport).toHaveBeenCalledWith(1);
  });
  it('403 for a stranger', async () => {
    (canMutateReport as any).mockResolvedValue(false);
    expect((await DELETE(req(), { params: { id: '1' } })).status).toBe(403);
    expect(softDeleteReport).not.toHaveBeenCalled();
  });
});
