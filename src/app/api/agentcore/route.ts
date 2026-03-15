// AgentCore Status API — Runtime, Gateways, Code Interpreter status
// AgentCore 상태 API — 런타임, 게이트웨이, 코드 인터프리터 상태
// Note: Uses execSync with fixed CLI commands only (no user input) / 고정 CLI 명령만 사용 (사용자 입력 없음)
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getConfig } from '@/lib/app-config';

const REGION = 'ap-northeast-2';

function getRuntimeId(): string {
  const config = getConfig();
  const arn = config.agentRuntimeArn || '';
  // ARN에서 runtime ID 추출 / Extract runtime ID from ARN
  const match = arn.match(/runtime\/(.+)$/);
  return match ? match[1] : '';
}
function getCodeInterpreterName(): string {
  return getConfig().codeInterpreterName || '';
}

function awsCli(cmd: string): any {
  try {
    const output = execSync(`aws ${cmd} --region ${REGION} --output json 2>/dev/null`, { encoding: 'utf-8', timeout: 15000 });
    return JSON.parse(output);
  } catch { return null; }
}

export async function GET() {
  try {
    // Parallel fetch via CLI / CLI로 병렬 조회
    const [runtimeRaw, gatewaysRaw] = await Promise.all([
      Promise.resolve(awsCli(`bedrock-agentcore-control get-agent-runtime --agent-runtime-id ${getRuntimeId()}`)),
      Promise.resolve(awsCli('bedrock-agentcore-control list-gateways')),
    ]);

    // Runtime / 런타임
    const runtime = runtimeRaw ? {
      id: runtimeRaw.agentRuntimeId,
      status: runtimeRaw.status,
      version: runtimeRaw.agentRuntimeVersion,
      createdAt: runtimeRaw.createdAt,
      lastUpdatedAt: runtimeRaw.lastUpdatedAt,
    } : null;

    // Gateways / 게이트웨이
    const gateways: any[] = [];
    const gwItems = (gatewaysRaw?.items || []).filter((g: any) => g.name?.startsWith('awsops'));

    // Fetch target counts / 타겟 수 조회
    for (const g of gwItems) {
      let targets = 0;
      try {
        const tRaw = awsCli(`bedrock-agentcore-control list-gateway-targets --gateway-identifier ${g.gatewayId}`);
        targets = tRaw?.items?.length || 0;
      } catch {}
      gateways.push({
        id: g.gatewayId, name: g.name, status: g.status,
        description: g.description, targets,
      });
    }
    gateways.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({
      runtime, gateways,
      codeInterpreter: { id: getCodeInterpreterName() },
      region: REGION,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch AgentCore status' }, { status: 500 });
  }
}
