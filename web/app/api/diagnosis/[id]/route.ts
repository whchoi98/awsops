import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { getReport, canMutateReport, updateReportMeta, softDeleteReport } from '@/lib/diagnosis';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

// strip control chars; the values are rendered as plain JSX text (React-escaped), never as HTML.
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim();

async function readArtifact(uri: string): Promise<string | null> {
  const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  // [PR#37 review MINOR] defense-in-depth: only read keys under the diagnosis/ prefix (matches the
  // web role's IAM scope s3:GetObject .../diagnosis/*). An injected URI returns null → clean 404,
  // not an opaque AWS AccessDenied.
  if (!m[2].startsWith('diagnosis/')) return null;
  const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  const r = await s3.send(new GetObjectCommand({ Bucket: m[1], Key: m[2] }));
  return (await r.Body?.transformToString()) ?? null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ message: 'invalid report id' }, { status: 400 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ message: 'not found' }, { status: 404 });
  // pentest-remediation P2-1: canMutateReport() was only ever used to compute the can_edit display
  // flag — the read itself was never gated, so any authenticated user could fetch any report
  // (including its full markdown body) by iterating sequential ids. Reuse the same owner-or-admin
  // check to gate the response, not just the flag.
  const can_edit = await canMutateReport(user, report);
  if (!can_edit) return NextResponse.json({ message: 'forbidden' }, { status: 403 });
  let markdown: string | null = null;
  if (report.artifact_uri) {
    try {
      markdown = await readArtifact(report.artifact_uri);
    } catch {
      markdown = null;
    }
  }
  return NextResponse.json({ report: { ...report, can_edit }, markdown });
}

const MAX_TITLE = 200;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 40;

// Validate + clamp the PATCH body. Returns the sanitized partial, or null on a bad shape.
function sanitizeMeta(body: any): { title?: string | null; tags?: string[] } | null {
  const out: { title?: string | null; tags?: string[] } = {};
  if ('title' in body) {
    if (body.title === null) out.title = null;
    else if (typeof body.title === 'string') out.title = clean(body.title).slice(0, MAX_TITLE);
    else return null;
  }
  if ('tags' in body) {
    if (!Array.isArray(body.tags)) return null;
    if (body.tags.length > MAX_TAGS) return null;
    const tags = (body.tags as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => clean(t).slice(0, MAX_TAG_LEN))
      .filter((t) => t.length > 0);
    out.tags = Array.from(new Set<string>(tags)).slice(0, MAX_TAGS);
  }
  if (!('title' in out) && !('tags' in out)) return null; // nothing to update
  return out;
}

async function loadMutable(req: Request, params: { id: string }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return { err: NextResponse.json({ message: 'unauthenticated' }, { status: 401 }) };
  const id = Number(params.id);
  if (!Number.isInteger(id)) return { err: NextResponse.json({ message: 'invalid report id' }, { status: 400 }) };
  const report = await getReport(id);
  if (!report) return { err: NextResponse.json({ message: 'not found' }, { status: 404 }) };
  if (!(await canMutateReport(user, report))) {
    return { err: NextResponse.json({ message: 'forbidden' }, { status: 403 }) };
  }
  return { id };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await loadMutable(req, params);
  if (g.err) return g.err;
  let body: any = {};
  try {
    // pentest-remediation P0-2: raw req.json() buffers the whole body into the heap before any size
    // check runs; middleware.ts only rejects on a present, honest Content-Length, so a chunked
    // request with no Content-Length sailed through unbounded (Finding 8). Bound before parse.
    body = await readJsonBounded(req, 65_536);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 });
    return NextResponse.json({ message: 'invalid body' }, { status: 400 });
  }
  const meta = sanitizeMeta(body);
  if (!meta) return NextResponse.json({ message: 'invalid title/tags' }, { status: 400 });
  await updateReportMeta(g.id!, meta);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const g = await loadMutable(req, params);
  if (g.err) return g.err;
  await softDeleteReport(g.id!);
  return NextResponse.json({ ok: true });
}
