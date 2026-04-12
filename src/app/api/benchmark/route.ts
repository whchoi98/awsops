import { NextRequest, NextResponse } from 'next/server';
import { execSync, exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { validateAccountId, getAccountById } from '@/lib/app-config';

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
  const accountIdParam = searchParams.get('accountId') || undefined;
  const account = accountIdParam && validateAccountId(accountIdParam) ? getAccountById(accountIdParam) : undefined;
  const searchPathArgs = account ? `--search-path "public,${account.connectionName},kubernetes,trivy"` : '';

  // Include accountId in file names for per-account results / 계정별 결과를 위해 파일명에 accountId 포함
  const fileSuffix = account ? `_${account.accountId}` : '';
  const resultFile = join(RESULTS_DIR, `${benchmark}${fileSuffix}.json`);
  const statusFile = join(RESULTS_DIR, `${benchmark}${fileSuffix}.status`);
  const errorFile = join(RESULTS_DIR, `${benchmark}${fileSuffix}.err`);

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
    const tmpFile = `${resultFile}.tmp`;
    // Powerpipe exits with code 2 when controls have alarms — this is expected.
    // Check output file validity instead of relying on exit code.
    const cmd = `powerpipe mod install --mod-location "${MOD_DIR}" > /dev/null 2>&1; powerpipe benchmark run aws_compliance.benchmark.${benchmark} --mod-location "${MOD_DIR}" ${searchPathArgs} --output json --progress=false > "${tmpFile}" 2>"${errorFile}"; if [ -s "${tmpFile}" ]; then mv "${tmpFile}" "${resultFile}" && echo "done" > "${statusFile}"; else rm -f "${tmpFile}" && echo "error" > "${statusFile}"; fi`;
    // Note: exec() is used here intentionally — the command requires shell features
    // (pipes, redirects, &&/||). All parameters (benchmark, dbUrl, MOD_DIR) are
    // server-controlled values, not user input. No user input is interpolated.
    exec(cmd, { env: { ...process.env, POWERPIPE_DATABASE: dbUrl } }, () => {
      // Send SNS notification on benchmark completion (best-effort)
      try {
        const st = existsSync(statusFile) ? readFileSync(statusFile, 'utf-8').trim() : 'error';
        if (st === 'done') {
          let totalControls = 0, alarmCount = 0, okCount = 0;
          try {
            const raw = readFileSync(resultFile, 'utf-8');
            const result = JSON.parse(raw);
            const groups = result?.groups || [];
            for (const g of groups) {
              totalControls += g?.summary?.control?.total || 0;
              alarmCount += g?.summary?.control?.alarm || 0;
              okCount += g?.summary?.control?.ok || 0;
            }
          } catch { /* parse error — send without counts */ }

          import('@/lib/sns-notification').then(({ notifyBenchmarkCompleted }) => {
            notifyBenchmarkCompleted({ benchmark, accountAlias: account?.alias, totalControls, alarmCount, okCount });
          }).catch(() => {});
        }
      } catch { /* notification is best-effort */ }
    });

    return NextResponse.json({ status: 'started', message: 'Benchmark started' });
  }

  if (action === 'status') {
    const status = existsSync(statusFile) ? readFileSync(statusFile, 'utf-8').trim() : 'none';
    const hasResult = existsSync(resultFile);
    return NextResponse.json({ status, hasResult });
  }

  if (action === 'result') {
    // Check status first — if errored or still running, don't attempt to parse
    const currentStatus = existsSync(statusFile) ? readFileSync(statusFile, 'utf-8').trim() : 'none';
    if (currentStatus === 'error') {
      const errorDetail = existsSync(errorFile) ? readFileSync(errorFile, 'utf-8').trim() : '';
      return NextResponse.json({
        error: 'Benchmark failed. Check that powerpipe is installed and Steampipe is running.',
        detail: errorDetail
      }, { status: 502 });
    }
    if (currentStatus === 'running') {
      return NextResponse.json({ error: 'Benchmark still running.' }, { status: 202 });
    }
    if (!existsSync(resultFile)) {
      return NextResponse.json({ error: 'No results available. Run the benchmark first.' }, { status: 404 });
    }
    try {
      const raw = readFileSync(resultFile, 'utf-8');
      if (!raw.trim()) {
        return NextResponse.json({ error: 'Benchmark produced empty results. Check powerpipe installation.' }, { status: 502 });
      }
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
