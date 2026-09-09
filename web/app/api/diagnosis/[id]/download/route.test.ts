import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockSend })),
  GetObjectCommand: vi.fn((args) => args),
}));
vi.mock('@/lib/auth', () => ({ verifyUser: vi.fn() }));
vi.mock('@/lib/diagnosis', () => ({ getReport: vi.fn(), canMutateReport: vi.fn() }));

import { GET } from './route';
import { verifyUser } from '@/lib/auth';
import { getReport, canMutateReport } from '@/lib/diagnosis';

const req = (id: string, format?: string) =>
  new Request(`http://x/api/diagnosis/${id}/download${format ? `?format=${format}` : ''}`);
const ctx = (id: string) => ({ params: { id } });

beforeEach(() => {
  vi.clearAllMocks();
  (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
  (getReport as any).mockResolvedValue({ id: 7, artifact_uri: 's3://b/diagnosis/7.md' });
  (canMutateReport as any).mockResolvedValue(true);
  mockSend.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
});

describe('GET /api/diagnosis/[id]/download', () => {
  it('401 when unauthenticated', async () => {
    (verifyUser as any).mockResolvedValue(null);
    expect((await GET(req('7', 'pdf'), ctx('7'))).status).toBe(401);
  });

  it('400 on an unsupported format', async () => {
    expect((await GET(req('7', 'exe'), ctx('7'))).status).toBe(400);
  });

  it('400 on a non-numeric id', async () => {
    expect((await GET(req('abc', 'pdf'), ctx('abc'))).status).toBe(400);
  });

  it('404 when the report or artifact_uri is missing', async () => {
    (getReport as any).mockResolvedValue(null);
    expect((await GET(req('7', 'pdf'), ctx('7'))).status).toBe(404);
  });

  // pentest-remediation P2-1 (Finding 5): this route had NO ownership check — any authenticated
  // user could download any report's full artifact by id.
  it('403 for a non-owner, non-admin', async () => {
    (canMutateReport as any).mockResolvedValue(false);
    expect((await GET(req('7', 'pdf'), ctx('7'))).status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('serves DOCX with the right content-type + attachment filename', async () => {
    const res = await GET(req('7', 'docx'), ctx('7'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('wordprocessingml.document');
    expect(res.headers.get('content-disposition')).toContain('awsops-diagnosis-7.docx');
    // requested the sibling key, not the .md
    expect((mockSend.mock.calls[0][0] as any).Key).toBe('diagnosis/7.docx');
  });

  it('serves PDF', async () => {
    const res = await GET(req('7', 'pdf'), ctx('7'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect((mockSend.mock.calls[0][0] as any).Key).toBe('diagnosis/7.pdf');
  });

  it('defaults to md', async () => {
    const res = await GET(req('7'), ctx('7'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect((mockSend.mock.calls[0][0] as any).Key).toBe('diagnosis/7.md');
  });

  it('404 when the object is absent (S3 throws)', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    expect((await GET(req('7', 'pdf'), ctx('7'))).status).toBe(404);
  });
});
