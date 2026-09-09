import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { getReport, canMutateReport } from '@/lib/diagnosis';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

// Proxy the worker-generated artifact bytes (md/docx/pdf) from S3. Proxying (not presigning) keeps
// @aws-sdk/s3-request-presigner out of the deps and turns a missing object into a clean 404 instead
// of S3's NoSuchKey XML. The web role already scopes s3:GetObject .../diagnosis/*.
const CONTENT_TYPE: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });

  const format = new URL(req.url).searchParams.get('format') || 'md';
  if (!(format in CONTENT_TYPE)) {
    return NextResponse.json({ message: 'unsupported format' }, { status: 400 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ message: 'invalid report id' }, { status: 400 });
  }
  const report = await getReport(id);
  if (!report || !report.artifact_uri) {
    return NextResponse.json({ message: 'not found' }, { status: 404 });
  }
  // pentest-remediation P2-1 (Finding 5): no ownership check existed here — any authenticated user
  // could download any report's full artifact by id.
  if (!(await canMutateReport(user, report))) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 });
  }
  // artifact_uri = s3://<bucket>/diagnosis/<id>.md → derive the sibling key for the requested format.
  const m = report.artifact_uri.match(/^s3:\/\/([^/]+)\/(diagnosis\/.+)\.md$/);
  if (!m) return NextResponse.json({ message: 'not found' }, { status: 404 });
  const [, bucket, base] = m;
  const key = `${base}.${format}`;

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await r.Body!.transformToByteArray();
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPE[format],
        'Content-Disposition': `attachment; filename="awsops-diagnosis-${params.id}.${format}"`,
      },
    });
  } catch {
    // object absent (generation failed / legacy report) → clean 404, not an S3 error doc.
    return NextResponse.json({ message: 'not found' }, { status: 404 });
  }
}
