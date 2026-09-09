import { describe, it, expect, vi, beforeEach } from 'vitest';
const verifyUser = vi.fn();
const readResources = vi.fn();
const assertInventoryTypeAllowed = vi.fn();
vi.mock('@/lib/auth', () => ({ verifyUser: (...a: unknown[]) => verifyUser(...a) }));
vi.mock('@/lib/inventory', () => ({
  readResources: (...a: unknown[]) => readResources(...a),
  assertInventoryTypeAllowed: (...a: unknown[]) => assertInventoryTypeAllowed(...a),
}));
const req = (url = 'http://x/api/inventory/ec2', cookie = 'awsops_token=t') => new Request(url, { headers: { cookie } });
const ctx = { params: { type: 'ec2' } };
beforeEach(() => {
  verifyUser.mockReset(); readResources.mockReset(); assertInventoryTypeAllowed.mockReset();
  verifyUser.mockResolvedValue({ sub: 'u' });
  assertInventoryTypeAllowed.mockResolvedValue(null);
  readResources.mockResolvedValue({ rows: [{ resource_id: 'i-1' }], run: { status: 'succeeded' } });
});

describe('GET /api/inventory/[type]', () => {
  it('401 unauth', async () => {
    verifyUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(req(), ctx)).status).toBe(401);
  });
  it('200 with rows+run', async () => {
    const { GET } = await import('./route');
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).rows[0].resource_id).toBe('i-1');
  });
  // pentest-remediation P2-2: the admin/type gate now lives in one place (assertInventoryTypeAllowed)
  // shared with the refresh route — this just proves GET delegates to it and honors its verdict.
  it('403 when assertInventoryTypeAllowed rejects (e.g. non-admin on iam_user)', async () => {
    assertInventoryTypeAllowed.mockResolvedValue({ status: 403, message: '관리자 전용 메뉴입니다 (IAM)' });
    const { GET } = await import('./route');
    const res = await GET(req('http://x/api/inventory/iam_user'), { params: { type: 'iam_user' } });
    expect(res.status).toBe(403);
    expect(readResources).not.toHaveBeenCalled();
  });

  describe('scope query params', () => {
    it('no params → regions "__all__", includeGlobal true (unchanged default)', async () => {
      const { GET } = await import('./route');
      await GET(req(), ctx);
      expect(readResources).toHaveBeenCalledWith('ec2', { limit: 100, offset: 0, regions: '__all__', includeGlobal: true, accounts: ['self'] });
    });
    it('regions=ap-northeast-2,us-east-1 → parsed to an array', async () => {
      const { GET } = await import('./route');
      await GET(req('http://x/api/inventory/ec2?regions=ap-northeast-2,us-east-1'), ctx);
      expect(readResources).toHaveBeenCalledWith('ec2', { limit: 100, offset: 0, regions: ['ap-northeast-2', 'us-east-1'], includeGlobal: true, accounts: ['self'] });
    });
    it('regions=__all__ explicit → same as unset', async () => {
      const { GET } = await import('./route');
      await GET(req('http://x/api/inventory/ec2?regions=__all__'), ctx);
      expect(readResources).toHaveBeenCalledWith('ec2', { limit: 100, offset: 0, regions: '__all__', includeGlobal: true, accounts: ['self'] });
    });
    it('includeGlobal=0 → false', async () => {
      const { GET } = await import('./route');
      await GET(req('http://x/api/inventory/ec2?includeGlobal=0'), ctx);
      expect(readResources).toHaveBeenCalledWith('ec2', { limit: 100, offset: 0, regions: '__all__', includeGlobal: false, accounts: ['self'] });
    });
    it('regions= (explicit empty) → [] , not "__all__"', async () => {
      const { GET } = await import('./route');
      await GET(req('http://x/api/inventory/ec2?regions=&includeGlobal=0'), ctx);
      expect(readResources).toHaveBeenCalledWith('ec2', { limit: 100, offset: 0, regions: [], includeGlobal: false, accounts: ['self'] });
    });
  });
});
