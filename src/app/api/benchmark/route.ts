import { NextRequest, NextResponse } from 'next/server';
import { execSync, exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const RESULTS_DIR = '/tmp/powerpipe-results';
const MOD_DIR = '/home/ec2-user/awsops/powerpipe';

// Dynamically get Steampipe password (avoid hardcoded mismatch across deployments)
// Steampipe 비밀번호를 동적으로 가져옴 (배포 환경별 불일치 방지)
let cachedDbUrl: string | null = null;
function getDbUrl(): string {
  if (cachedDbUrl) return cachedDbUrl;
  try {
    const output = execSync('steampipe service status --show-password 2>/dev/null', { encoding: 'utf-8' });
    const match = output.match(/postgres:\/\/steampipe:[^@]+@127\.0\.0\.1:9193\/steampipe/);
    if (match) {
      cachedDbUrl = match[0];
      return cachedDbUrl;
    }
  } catch {}
  // Fallback: use default connection string / 폴백: 기본 연결 문자열
  cachedDbUrl = 'postgres://steampipe:steampipe@127.0.0.1:9193/steampipe';
  return cachedDbUrl;
}

function ensureDir() {
  try { execSync(`mkdir -p ${RESULTS_DIR}`); } catch {}
}

export async function GET(request: NextRequest) {
  ensureDir();
  const { searchParams } = new URL(request.url);
  const benchmark = searchParams.get('benchmark') || 'cis_v300';
  const action = searchParams.get('action') || 'status';
  const accountId = searchParams.get('accountId');

  // Account-scoped file names (backward compat: no accountId = original name)
  const filePrefix = accountId && accountId !== '__all__' ? `${accountId}_${benchmark}` : benchmark;
  const resultFile = join(RESULTS_DIR, `${filePrefix}.json`);
  const statusFile = join(RESULTS_DIR, `${filePrefix}.status`);

  if (action === 'run') {
    // Start benchmark in background
    if (existsSync(statusFile)) {
      const status = readFileSync(statusFile, 'utf-8').trim();
      if (status === 'running') {
        return NextResponse.json({ status: 'running', message: 'Benchmark already in progress' });
      }
    }

    writeFileSync(statusFile, 'running', 'utf-8');

    const dbUrl = getDbUrl();
    const searchPathArg = accountId && accountId !== '__all__'
      ? ` --search-path "public,aws_${accountId.replace(/[^0-9]/g, '')},kubernetes,trivy"`
      : '';
    const cmd = `powerpipe benchmark run aws_compliance.benchmark.${benchmark} --database "${dbUrl}" --mod-location "${MOD_DIR}"${searchPathArg} --output json --progress=false > "${resultFile}" 2>/dev/null && echo "done" > "${statusFile}" || echo "error" > "${statusFile}"`;
    exec(cmd);

    return NextResponse.json({ status: 'started', message: 'Benchmark started' });
  }

  if (action === 'status') {
    const status = existsSync(statusFile) ? readFileSync(statusFile, 'utf-8').trim() : 'none';
    const hasResult = existsSync(resultFile);
    return NextResponse.json({ status, hasResult });
  }

  if (action === 'result') {
    if (!existsSync(resultFile)) {
      return NextResponse.json({ error: 'No results available. Run the benchmark first.' }, { status: 404 });
    }
    try {
      const raw = readFileSync(resultFile, 'utf-8');
      const data = JSON.parse(raw);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: 'Failed to parse results' }, { status: 500 });
    }
  }

  // List available benchmarks
  if (action === 'list') {
    return NextResponse.json({
      benchmarks: [
        { id: 'cis_v300', name: 'CIS AWS v3.0.0', description: 'CIS Amazon Web Services Foundations Benchmark v3.0.0' },
        { id: 'cis_v200', name: 'CIS AWS v2.0.0', description: 'CIS Amazon Web Services Foundations Benchmark v2.0.0' },
        { id: 'cis_v150', name: 'CIS AWS v1.5.0', description: 'CIS Amazon Web Services Foundations Benchmark v1.5.0' },
        { id: 'cis_v400', name: 'CIS AWS v4.0.0', description: 'CIS Amazon Web Services Foundations Benchmark v4.0.0' },
      ],
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
