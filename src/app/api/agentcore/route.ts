// AgentCore Status API — Runtime, Gateways, Code Interpreter status
// AgentCore 상태 API — 런타임, 게이트웨이, 코드 인터프리터 상태
// Note: Uses execSync with fixed CLI commands only (no user input) / 고정 CLI 명령만 사용 (사용자 입력 없음)
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import NodeCache from 'node-cache';
import { getConfig } from '@/lib/app-config';
import { getStats } from '@/lib/agentcore-stats';
import { getConversations, searchConversations, getMemoryStats, listSessions, getSession } from '@/lib/agentcore-memory';
import { getUserFromRequest } from '@/lib/auth-utils';

const REGION = 'ap-northeast-2';
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5min TTL / 5분 캐시
const CACHE_KEY = 'agentcore:status';

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

// Safe CLI execution with execFileSync (no shell injection) / 안전한 CLI 실행
function awsCli(args: string[]): any {
  try {
    const output = execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], {
      encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch { return null; }
}

// Fetch AgentCore status (cached) / AgentCore 상태 조회 (캐시)
async function getAgentCoreStatus(bustCache = false): Promise<any> {
  if (!bustCache) {
    const cached = cache.get(CACHE_KEY);
    if (cached) return { ...(cached as any), fromCache: true };
  }

  const start = Date.now();

  // Parallel fetch via CLI / CLI로 병렬 조회
  const [runtimeRaw, gatewaysRaw] = await Promise.all([
    Promise.resolve(awsCli(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', getRuntimeId()])),
    Promise.resolve(awsCli(['bedrock-agentcore-control', 'list-gateways'])),
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
      const tRaw = awsCli(['bedrock-agentcore-control', 'list-gateway-targets', '--gateway-identifier', g.gatewayId]);
      targets = tRaw?.items?.length || 0;
    } catch {}
    gateways.push({
      id: g.gatewayId, name: g.name, status: g.status,
      description: g.description, targets,
    });
  }
  gateways.sort((a: any, b: any) => a.name.localeCompare(b.name));

  const result = {
    runtime, gateways,
    codeInterpreter: { id: getCodeInterpreterName() },
    region: REGION,
    timestamp: new Date().toISOString(),
    fetchDurationSec: Math.round((Date.now() - start) / 100) / 10,
  };

  cache.set(CACHE_KEY, result);
  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const bustCache = searchParams.get('bustCache') === 'true';

  // 통계 조회 / Stats query
  if (action === 'stats') {
    return NextResponse.json(getStats());
  }

  // 대화 이력 조회 (사용자별) / Conversation history (per user)
  if (action === 'conversations') {
    const limit = parseInt(searchParams.get('limit') || '20');
    const user = getUserFromRequest(request);
    const conversations = await getConversations(limit, user.email);
    return NextResponse.json({ conversations, user: user.email });
  }

  // 대화 검색 (사용자별) / Search conversations (per user)
  if (action === 'search') {
    const query = searchParams.get('q') || '';
    const user = getUserFromRequest(request);
    const conversations = await searchConversations(query, 10, user.email);
    return NextResponse.json({ conversations, user: user.email });
  }

  // 세션 목록 (사용자별) / Session list (per user)
  if (action === 'sessions') {
    const limit = parseInt(searchParams.get('limit') || '30');
    const user = getUserFromRequest(request);
    const sessions = await listSessions(user.email, limit);
    return NextResponse.json({ sessions, user: user.email });
  }

  // 세션 상세 조회 / Get full session
  if (action === 'session') {
    const id = searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Missing session id' }, { status: 400 });
    const session = await getSession(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({ session });
  }

  // 메모리 통계 / Memory stats
  if (action === 'memory-stats') {
    return NextResponse.json(getMemoryStats());
  }

  // 캐시 상태 / Cache status
  if (action === 'cache-status') {
    const cached = cache.get(CACHE_KEY) as any;
    return NextResponse.json({
      isCached: !!cached,
      cachedAt: cached?.timestamp || null,
      fetchDurationSec: cached?.fetchDurationSec || null,
      ttlRemaining: cached ? Math.round((cache.getTtl(CACHE_KEY)! - Date.now()) / 1000) : 0,
    });
  }

  try {
    const result = await getAgentCoreStatus(bustCache);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch AgentCore status' }, { status: 500 });
  }
}
