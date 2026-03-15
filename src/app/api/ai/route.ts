// AI routing API: Tool-based route registry + Sonnet intent classification + conversation history
// AI 라우팅 API: 도구 기반 라우트 레지스트리 + Sonnet 의도 분류 + 대화 히스토리
// Flow: classify intent (from registry) → route to handler → fallback
// 흐름: 의도 분류 (레지스트리 기반) → 핸들러 라우팅 → 폴백
import { NextRequest, NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
  StopRuntimeSessionCommand,
  StartCodeInterpreterSessionCommand,
  InvokeCodeInterpreterCommand,
  StopCodeInterpreterSessionCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { runQuery } from '@/lib/steampipe';
import { getConfig } from '@/lib/app-config';

// Service configuration — config 파일에서 읽거나 자동 감지
// Service config — read from data/config.json or auto-detect
const BEDROCK_REGION = 'ap-northeast-2';
const AGENTCORE_REGION = 'ap-northeast-2';

// 런타임에 config에서 AgentCore 설정 로드 / Load AgentCore config at runtime
function getAgentRuntimeArn(): string {
  const config = getConfig();
  return config.agentRuntimeArn || '';
}
function getCodeInterpreterName(): string {
  const config = getConfig();
  return config.codeInterpreterName || '';
}

// Available Bedrock models / 사용 가능한 Bedrock 모델
// Seoul region uses global.* prefix for cross-region inference / 서울 리전은 global.* 접두사 사용
const MODELS: Record<string, string> = {
  'sonnet-4.6': 'global.anthropic.claude-sonnet-4-6',
  'opus-4.6': 'global.anthropic.claude-opus-4-6-v1',
};

// AWS SDK clients / AWS SDK 클라이언트
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const agentCoreClient = new BedrockAgentCoreClient({ region: AGENTCORE_REGION });

// ============================================================================
// Route Registry: Single source of truth for all routing decisions
// 라우트 레지스트리: 모든 라우팅 결정의 단일 소스
// Adding a tool here automatically updates classification, display, and gateway mapping
// 여기에 도구를 추가하면 분류, 표시, 게이트웨이 매핑이 자동 업데이트됨
// ============================================================================
interface RouteConfig {
  gateway: string;             // AgentCore gateway role / AgentCore 게이트웨이 역할
  display: string;             // UI display name / UI 표시 이름
  description: string;         // What this route handles / 이 라우트가 처리하는 것
  tools: string[];             // Available tool capabilities / 사용 가능한 도구 기능
  examples?: string[];         // Classification examples / 분류 예시
  handler?: 'code' | 'sql';   // Special handler type / 특수 핸들러 타입 (code: Code Interpreter, sql: pg Pool 직접)
}

const ROUTE_REGISTRY: Record<string, RouteConfig> = {
  code: {
    gateway: '',
    display: 'Code Interpreter',
    description: 'Python code execution and calculations',
    tools: ['Python 코드 실행', '계산/분석/시각화', '스크립트 생성'],
    examples: ['"코드 실행해줘" → code', '"이 데이터를 파이썬으로 분석" → code'],
    handler: 'code',
  },
  network: {
    gateway: 'network',
    display: 'Network Gateway (17 tools)',
    description: 'AWS VPC networking, Transit Gateway, VPN, and traffic analysis',
    tools: [
      'VPC/Subnet/ENI/Security Group 조회 및 분석',
      'Transit Gateway(TGW) 목록/상세/라우트/피어링',
      'VPN 연결 상태, Network Firewall 규칙',
      'NAT Gateway, Internet Gateway, Route Table',
      'Reachability Analyzer (네트워크 경로 분석, 연결 확인)',
      'VPC Flow Logs 조회 및 트래픽 분석',
    ],
    examples: [
      '"TGW 현황" → network', '"VPN 연결 확인" → network',
      '"EC2 간 통신 가능한지 확인" → network', '"보안그룹 규칙 확인" → network',
      '"플로우 로그 조회" → network', '"VPC 현황" → network',
      '"서브넷 구성" → network', '"라우트 테이블" → network',
    ],
  },
  container: {
    gateway: 'container',
    display: 'Container Gateway (24 tools)',
    description: 'EKS, ECS, and Istio service mesh',
    tools: [
      'EKS 클러스터/노드/Pod/로그/메트릭/IAM/트러블슈팅',
      'ECS 클러스터/서비스/태스크/ECR/Fargate 트러블슈팅',
      'Istio VirtualService/DestinationRule/Gateway/mTLS/EnvoyFilter',
    ],
    examples: [
      '"EKS 클러스터 상태" → container', '"ECS 서비스 현황" → container',
      '"Istio 현황" → container', '"Pod 상태 확인" → container',
      '"컨테이너 로그" → container', '"EKS 노드 메트릭" → container',
    ],
  },
  iac: {
    gateway: 'iac',
    display: 'IaC Gateway (12 tools)',
    description: 'Infrastructure as Code tools',
    tools: [
      'CloudFormation 템플릿 검증/컴플라이언스/배포 트러블슈팅',
      'CDK 문서/샘플/모범사례 검색',
      'Terraform AWS/AWSCC 프로바이더 문서, 모듈 검색',
    ],
    examples: ['"CDK 모범사례" → iac', '"CloudFormation 스택 오류" → iac', '"Terraform 모듈 검색" → iac'],
  },
  data: {
    gateway: 'data',
    display: 'Data Gateway (24 tools)',
    description: 'AWS databases and streaming services',
    tools: [
      'DynamoDB 테이블 목록/상세/쿼리/스캔/데이터 모델링/비용 추정',
      'RDS/Aurora 인스턴스/클러스터 목록/상세/SQL 실행(Data API)',
      'ElastiCache/Valkey 클러스터/복제 그룹/서버리스/모범사례',
      'MSK Kafka 클러스터/브로커/설정/엔드포인트/모범사례',
    ],
    examples: ['"DynamoDB 테이블 조회" → data', '"RDS 인스턴스 상태" → data', '"Kafka 클러스터 정보" → data'],
  },
  security: {
    gateway: 'security',
    display: 'Security Gateway (14 tools)',
    description: 'AWS IAM and security posture',
    tools: [
      'IAM 사용자/역할/그룹/정책 목록 및 상세',
      'Access Key 목록/상태, MFA 상태',
      'Policy Simulation (권한 테스트)',
      'Account Security Summary (계정 보안 요약)',
      'Trust Policy 분석, 인라인 정책 조회',
    ],
    examples: ['"IAM 사용자 목록" → security', '"권한 시뮬레이션" → security', '"보안 요약" → security'],
  },
  monitoring: {
    gateway: 'monitoring',
    display: 'Monitoring Gateway (16 tools)',
    description: 'AWS observability and audit',
    tools: [
      'CloudWatch 메트릭 데이터/메타데이터/추세 분석',
      'CloudWatch 알람 목록/이력/추천',
      'CloudWatch 로그 그룹/분석/Log Insights 쿼리',
      'CloudTrail API 이벤트 조회/Lake SQL 분석',
    ],
    examples: ['"CPU 사용량 확인" → monitoring', '"CloudTrail 이벤트 조회" → monitoring', '"알람 목록" → monitoring'],
  },
  cost: {
    gateway: 'cost',
    display: 'Cost Gateway (9 tools)',
    description: 'AWS billing, cost optimization, and FinOps',
    tools: [
      'Cost Explorer (비용/사용량 분석, 기간 비교, 비용 동인 분석)',
      'Cost Forecast (비용 예측)',
      'Pricing (AWS 서비스 가격 조회)',
      'Budgets (예산 상태 확인)',
    ],
    examples: ['"이번 달 비용" → cost', '"EC2 비용 분석" → cost', '"비용 예측" → cost'],
  },
  'aws-data': {
    gateway: 'ops',
    display: 'Bedrock + Steampipe SQL',
    description: 'General AWS resource inventory and status queries via SQL',
    tools: [
      'Steampipe SQL (580+ AWS 테이블 직접 쿼리)',
      'EC2/S3/VPC/Lambda/RDS/IAM 등 리소스 목록/현황 조회',
    ],
    examples: [
      '"EC2 인스턴스 목록" → aws-data', '"S3 버킷 현황" → aws-data',
      '"Lambda 함수 목록" → aws-data', '"전체 리소스 요약" → aws-data',
    ],
    handler: 'sql',
  },
  general: {
    gateway: 'ops',
    display: 'Ops Gateway (9 tools)',
    description: 'General AWS questions, documentation, and best practices',
    tools: [
      'AWS 문서 검색/리전 가용성 확인',
      'AWS CLI 명령 실행/제안',
      'Steampipe SQL (580+ 테이블)',
    ],
    examples: ['"AWS 모범사례 알려줘" → general', '"이 서비스가 서울 리전에서 사용 가능한지" → general'],
  },
};

// Derived values from registry / 레지스트리에서 파생된 값
type RouteType = keyof typeof ROUTE_REGISTRY;
const VALID_ROUTES = Object.keys(ROUTE_REGISTRY) as RouteType[];

// Build classification prompt from registry / 레지스트리에서 분류 프롬프트 자동 생성
function buildClassificationPrompt(): string {
  const routeDescriptions = Object.entries(ROUTE_REGISTRY)
    .map(([key, r]) => {
      const toolList = r.tools.join(', ');
      return `- "${key}": ${r.description}\n  Tools: ${toolList}`;
    })
    .join('\n');

  const examples = Object.entries(ROUTE_REGISTRY)
    .flatMap(([, r]) => r.examples || [])
    .map(e => `- ${e}`)
    .join('\n');

  return `You are an intent classifier for an AWS operations dashboard.
Classify the user's question into 1-3 routes. Consider the FULL conversation context, not just the last message.
Choose the route(s) whose TOOLS can best answer the question.

Routes:
${routeDescriptions}

Classification rules:
- Most questions need only 1 route. Use multiple routes ONLY when the question explicitly asks about different domains.
- Examples of multi-route: "VPC 보안그룹과 비용을 분석해줘" → ["network", "cost"], "보안 점검하고 IAM 사용자도 확인" → ["security"]
- If the user asks a follow-up ("그중에서", "그건", "더 자세히"), use PREVIOUS context to determine the route.
- Prefer specialized routes (network, container, data, security, monitoring, cost) over general ones (aws-data, general).
- "aws-data" is ONLY for simple resource listing/counting via SQL. If dedicated tools exist, use that route instead.
- "code" and "aws-data" should NOT be combined with other routes.

Examples:
${examples}

Respond with ONLY a JSON object: {"routes": ["<route>"]} or {"routes": ["<route1>", "<route2>"]}`;
}

const CLASSIFICATION_PROMPT = buildClassificationPrompt();

const SYSTEM_PROMPT = `You are AWSops AI Assistant, an expert in AWS cloud operations.
You help users understand and manage their AWS infrastructure.
You have access to real-time AWS resource data via Steampipe queries.
When users ask about their resources, analyze the data provided.
Always be concise and provide actionable insights.
Format responses in markdown for readability.
When discussing security issues, prioritize them by severity.
Respond in the same language as the user's question.`;

// ============================================================================
// Intent classification / 의도 분류
// ============================================================================
async function classifyIntent(messages: Array<{role: string; content: string}>): Promise<RouteType[]> {
  try {
    const recentMessages = messages.slice(-10);
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 100,
      system: CLASSIFICATION_PROMPT,
      messages: recentMessages.map(m => ({ role: m.role, content: m.content })),
    });

    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId: MODELS['sonnet-4.6'],
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(response.body));
    const text = result.content?.[0]?.text || '';

    // Parse multi-route: {"routes": ["network", "cost"]} / 멀티 라우트 파싱
    const multiMatch = text.match(/\{[^}]*"routes"\s*:\s*\[([^\]]+)\][^}]*\}/);
    if (multiMatch) {
      const routes = multiMatch[1].match(/"([^"]+)"/g)?.map((s: string) => s.replace(/"/g, '')) || [];
      const valid = routes.filter((r: string) => VALID_ROUTES.includes(r as RouteType)).slice(0, 3) as RouteType[];
      if (valid.length > 0) {
        console.log(`[Intent] Classified as: ${valid.join(', ')}`);
        return valid;
      }
    }

    // Fallback: single route {"route": "xxx"} / 폴백: 단일 라우트
    const singleMatch = text.match(/\{[^}]*"route"\s*:\s*"([^"]+)"[^}]*\}/);
    if (singleMatch && VALID_ROUTES.includes(singleMatch[1] as RouteType)) {
      console.log(`[Intent] Classified as: ${singleMatch[1]}`);
      return [singleMatch[1] as RouteType];
    }

    console.warn(`[Intent] Could not parse: ${text}, fallback to general`);
    return ['general'];
  } catch (err: any) {
    console.error(`[Intent] Failed: ${err.message}, fallback to general`);
    return ['general'];
  }
}

// ============================================================================
// SQL generation for aws-data route / aws-data 라우트용 SQL 생성
// ============================================================================
const SQL_GEN_PROMPT = `You are a Steampipe SQL expert. Generate a PostgreSQL SELECT query for the user's AWS resource question.

Rules:
- Return ONLY the SQL query, no explanation, no markdown, no code blocks.
- Do NOT add LIMIT unless the user explicitly asks for a specific number.
- Use single quotes for string values: tags ->> 'Name'
- No $ in SQL — use conditions::text LIKE '%..%' instead of jsonb_path_exists
- Always include key identifying columns: ID, name/tags, type, state/status
- Avoid: mfa_enabled, attached_policy_arns, Lambda tags columns (SCP blocks hydrate)

EXACT column names for key tables (use ONLY these, not guessed names):

aws_ec2_instance:
  instance_id, instance_type, instance_state, private_ip_address, public_ip_address,
  placement_availability_zone (NOT availability_zone), vpc_id, subnet_id, key_name,
  launch_time, image_id, platform, monitoring_state, security_groups,
  tags ->> 'Name' AS name (for resource name)

aws_s3_bucket:
  name, region, versioning_enabled (NOT versioning), bucket_policy_is_public, creation_date

aws_vpc:
  vpc_id, cidr_block, state, is_default, tags ->> 'Name' AS name

aws_rds_db_instance:
  db_instance_identifier, engine, engine_version, class AS instance_class (NOT db_instance_class),
  status, allocated_storage, multi_az, availability_zone, vpc_id

aws_lambda_function:
  name, runtime, handler, memory_size, timeout, last_modified

aws_iam_user:
  name, arn, create_date, password_last_used

aws_iam_role:
  name, arn, create_date, max_session_duration

aws_vpc_security_group:
  group_id, group_name, vpc_id, description

aws_ec2_application_load_balancer:
  name, type, scheme, state_code, vpc_id, dns_name

kubernetes_pod:
  name, namespace, phase, node_name, creation_timestamp

Examples:
- "EC2 현황" → SELECT instance_id, tags ->> 'Name' AS name, instance_type, instance_state, placement_availability_zone AS az, private_ip_address, launch_time FROM aws_ec2_instance ORDER BY instance_state
- "S3 버킷 목록" → SELECT name, region, versioning_enabled, bucket_policy_is_public FROM aws_s3_bucket ORDER BY name
- "전체 리소스 요약" → SELECT 'EC2' AS resource, COUNT(*) AS count FROM aws_ec2_instance UNION ALL SELECT 'VPC', COUNT(*) FROM aws_vpc UNION ALL SELECT 'RDS', COUNT(*) FROM aws_rds_db_instance UNION ALL SELECT 'Lambda', COUNT(*) FROM aws_lambda_function UNION ALL SELECT 'S3', COUNT(*) FROM aws_s3_bucket`;

async function generateSQL(messages: Array<{role: string; content: string}>): Promise<string | null> {
  try {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      system: SQL_GEN_PROMPT,
      messages: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
    });
    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId: MODELS['sonnet-4.6'],
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    }));
    const result = JSON.parse(new TextDecoder().decode(response.body));
    let sql = (result.content?.[0]?.text || '').trim();
    sql = sql.replace(/^```(?:sql)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    if (!sql.toLowerCase().startsWith('select')) return null;
    return sql;
  } catch (err: any) {
    console.error('[SQL Gen] Failed:', err.message);
    return null;
  }
}

async function queryAWS(sql: string): Promise<{ data: string; rowCount: number; error?: string }> {
  try {
    const result = await runQuery(sql);
    if (result.error) return { data: `Query error: ${result.error}`, rowCount: 0, error: result.error };
    if (result.rows.length === 0) return { data: 'No results found.', rowCount: 0 };
    return { data: JSON.stringify(result.rows, null, 2), rowCount: result.rows.length };
  } catch (e: any) {
    return { data: `Error: ${e.message}`, rowCount: 0, error: e.message };
  }
}

// ============================================================================
// Code Interpreter / 코드 인터프리터
// ============================================================================
function extractPythonCode(text: string): string | null {
  const match = text.match(/```python\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

async function executeCodeInterpreter(code: string): Promise<{ output: string; exitCode: number }> {
  let sessionId: string | undefined;
  try {
    const startResp = await agentCoreClient.send(
      new StartCodeInterpreterSessionCommand({ codeInterpreterIdentifier: getCodeInterpreterName() })
    );
    sessionId = startResp.sessionId;
    if (!sessionId) throw new Error('No sessionId returned');

    const invokeResp = await agentCoreClient.send(
      new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: getCodeInterpreterName(),
        sessionId,
        name: 'executeCode',
        arguments: { code, language: 'python' } as any,
      })
    );

    let output = '';
    let exitCode = 0;
    if (invokeResp.stream) {
      for await (const event of invokeResp.stream) {
        if (event.result) {
          const content = event.result.content;
          if (Array.isArray(content)) {
            for (const block of content) { if (block.text) output += block.text; }
          }
        }
        if ('error' in event) { output += `Error: ${JSON.stringify((event as any).error)}`; exitCode = 1; }
      }
    }

    await agentCoreClient.send(
      new StopCodeInterpreterSessionCommand({ codeInterpreterIdentifier: getCodeInterpreterName(), sessionId })
    ).catch(() => {});
    return { output: output || '(no output)', exitCode };
  } catch (err: any) {
    if (sessionId) {
      await agentCoreClient.send(
        new StopCodeInterpreterSessionCommand({ codeInterpreterIdentifier: getCodeInterpreterName(), sessionId })
      ).catch(() => {});
    }
    return { output: `Code execution failed: ${err.message}`, exitCode: 1 };
  }
}

// ============================================================================
// AgentCore Runtime / AgentCore 런타임
// ============================================================================
const AGENTCORE_TIMEOUT_MS = 60000;

async function invokeAgentCore(
  messages: Array<{role: string; content: string}>,
  gateway: string
): Promise<string | null> {
  try {
    const recentMessages = messages.slice(-10);
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: getAgentRuntimeArn(),
      qualifier: 'DEFAULT',
      payload: JSON.stringify({ messages: recentMessages, gateway }),
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => { console.warn(`[AgentCore] Timeout after ${AGENTCORE_TIMEOUT_MS}ms for gateway=${gateway}`); resolve(null); }, AGENTCORE_TIMEOUT_MS)
    );

    const agentPromise = (async () => {
      const response = await agentCoreClient.send(command);
      const sessionId = response.runtimeSessionId;
      const body = await streamToString(response.response);
      const text = body.startsWith('"') ? JSON.parse(body) : body;
      if (sessionId) {
        try {
          await agentCoreClient.send(new StopRuntimeSessionCommand({
            agentRuntimeArn: getAgentRuntimeArn(), runtimeSessionId: sessionId, qualifier: 'DEFAULT',
          }));
        } catch {}
      }
      return text as string;
    })();

    return await Promise.race([agentPromise, timeoutPromise]);
  } catch (err: any) {
    console.error('[AgentCore Error]', err?.message || err);
    return null;
  }
}

async function streamToString(stream: any): Promise<string> {
  if (!stream) return '';
  if (typeof stream === 'string') return stream;
  if (typeof stream.transformToString === 'function') return stream.transformToString();
  if (typeof stream.transformToByteArray === 'function') {
    const bytes = await stream.transformToByteArray();
    return new TextDecoder().decode(bytes);
  }
  if (typeof stream.read === 'function') return stream.read().toString('utf-8');
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    }
    return chunks.join('');
  }
  return String(stream);
}

// ============================================================================
// SSE helpers / SSE 헬퍼
// ============================================================================
function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ============================================================================
// POST handler — SSE streaming with step-by-step progress events
// POST 핸들러 — 단계별 진행 이벤트를 포함한 SSE 스트리밍
// ============================================================================
export async function POST(request: NextRequest) {
  const reqBody = await request.json();
  const { messages, model: modelKey, stream: useStream } = reqBody;

  if (!messages || !Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'Messages required' }, { status: 400 });

  // Non-streaming mode: return JSON (backward compatible for test scripts)
  // 비스트리밍 모드: JSON 반환 (테스트 스크립트 하위 호환)
  if (!useStream) {
    return handleNonStreaming(messages, modelKey);
  }

  // Streaming mode: SSE events / 스트리밍 모드: SSE 이벤트
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        // Step 1: Classify intent (multi-route) / 1단계: 의도 분류 (멀티 라우트)
        send('status', { step: 'classifying', message: '🔍 질문 분석 중...' });
        const routes = await classifyIntent(messages);
        const route = routes[0];
        const config = ROUTE_REGISTRY[route];
        const lastMessage = messages[messages.length - 1]?.content || '';
        const isMulti = routes.length > 1;
        if (isMulti) {
          send('status', { step: 'classified', route, routes, message: `📡 멀티 라우트: ${routes.map(r => ROUTE_REGISTRY[r]?.display).join(' + ')}` });
        } else {
          send('status', { step: 'classified', route, display: config.display, message: `📡 ${config.display} 연결 중...` });
        }

        // Step 2: Route to handler / 2단계: 핸들러로 라우팅

        // Handler: Code Interpreter / 핸들러: 코드 인터프리터
        if (config.handler === 'code') {
          send('status', { step: 'generating', message: '💻 코드 생성 중...' });
          const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
          const codeSystemPrompt = SYSTEM_PROMPT + `\n\nThe user wants to execute code. If they provide code, wrap it in a \`\`\`python code block. If they describe a task, generate Python code to accomplish it and wrap it in a \`\`\`python code block. Always include print statements to show results.`;
          const body = JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: codeSystemPrompt,
            messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
          });
          const aiResponse = await bedrockClient.send(new InvokeModelCommand({
            modelId, contentType: 'application/json', accept: 'application/json', body: encoder.encode(body),
          }));
          const aiText = JSON.parse(new TextDecoder().decode(aiResponse.body)).content?.[0]?.text || '';
          const pythonCode = extractPythonCode(aiText) || extractPythonCode(lastMessage);

          if (pythonCode) {
            send('status', { step: 'executing', message: '⚡ 코드 실행 중...' });
            const codeResult = await executeCodeInterpreter(pythonCode);
            const executionBlock = `\n\n---\n**Code Execution Result** (exit code: ${codeResult.exitCode}):\n\`\`\`\n${codeResult.output}\n\`\`\``;
            send('done', {
              content: aiText + executionBlock, model: modelKey || 'sonnet-4.6',
              via: `Bedrock + ${config.display}`, queriedResources: ['code-interpreter'], route,
            });
          } else {
            send('done', {
              content: aiText, model: modelKey || 'sonnet-4.6',
              via: 'Bedrock (code request)', queriedResources: [], route,
            });
          }
          controller.close();
          return;
        }

        // Handler: SQL (aws-data) / SQL 핸들러
        if (config.handler === 'sql') {
          send('status', { step: 'sql-generating', message: '📝 SQL 생성 중...' });
          const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
          let sql = await generateSQL(messages);
          let queryResult: { data: string; rowCount: number; error?: string } | null = null;

          for (let attempt = 0; attempt < 2 && sql; attempt++) {
            send('status', { step: 'sql-querying', message: `🔎 Steampipe 쿼리 실행 중...${attempt > 0 ? ' (재시도)' : ''}`, sql });
            queryResult = await queryAWS(sql);
            if (!queryResult.error) break;
            if (attempt === 0) {
              send('status', { step: 'sql-retrying', message: '🔄 SQL 수정 후 재시도...' });
              const fixMessages = [
                ...messages.slice(-4),
                { role: 'assistant' as const, content: `I generated this SQL: ${sql}` },
                { role: 'user' as const, content: `That SQL failed with error: ${queryResult.error}. Fix the SQL using only valid column names.` },
              ];
              sql = await generateSQL(fixMessages);
            }
          }

          if (sql && queryResult && !queryResult.error) {
            send('status', { step: 'analyzing', message: `📊 ${queryResult.rowCount}건 데이터 분석 중...` });
            const contextData = `\n\n--- LIVE AWS RESOURCE DATA (${queryResult.rowCount} rows) ---\nSQL: ${sql}\n\`\`\`json\n${queryResult.data}\n\`\`\``;
            const bedrockMessages = messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content }));
            bedrockMessages[bedrockMessages.length - 1].content += contextData;
            const body = JSON.stringify({
              anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: SYSTEM_PROMPT, messages: bedrockMessages,
            });
            const response = await bedrockClient.send(new InvokeModelCommand({
              modelId, contentType: 'application/json', accept: 'application/json', body: encoder.encode(body),
            }));
            const result = JSON.parse(new TextDecoder().decode(response.body));
            send('done', {
              content: result.content?.[0]?.text || 'No response', model: modelKey || 'sonnet-4.6',
              via: `${config.display} (${queryResult.rowCount} rows)`, queriedResources: ['steampipe'], route,
            });
            controller.close();
            return;
          }
          send('status', { step: 'sql-fallback', message: '⚠️ SQL 실패, AgentCore로 전환...' });
        }

        // Handler: AgentCore Gateway — single or multi / AgentCore 게이트웨이 — 단일 또는 멀티
        if (isMulti) {
          // Multi-route: parallel calls + synthesis / 멀티 라우트: 병렬 호출 + 합성
          send('status', { step: 'multi-call', message: `🤖 ${routes.length}개 Gateway 병렬 호출 중...` });
          const results = await Promise.allSettled(
            routes.map(r => handleSingleRoute(r, messages, modelKey))
          );
          const successful: { route: string; content: string; via: string }[] = [];
          const allResources: string[] = [];
          results.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value) {
              successful.push({ route: routes[i], content: r.value.content, via: r.value.via });
              allResources.push(...r.value.queriedResources);
            }
          });

          if (successful.length > 1) {
            send('status', { step: 'synthesizing', message: `📊 ${successful.length}개 응답 합성 중...` });
            const lastMsg = messages[messages.length - 1]?.content || '';
            const synthesized = await synthesizeResponses(lastMsg, successful, modelKey);
            const viaList = successful.map(s => s.via).join(' + ');
            send('done', {
              content: synthesized, model: modelKey || 'sonnet-4.6',
              via: `Multi-Route: ${viaList}`, queriedResources: allResources, route, routes,
            });
          } else if (successful.length === 1) {
            send('done', {
              content: successful[0].content, model: modelKey || 'sonnet-4.6',
              via: successful[0].via, queriedResources: allResources, route, routes,
            });
          } else {
            send('error', { error: 'All routes failed' });
          }
          controller.close();
          return;
        }

        // Single route: existing logic / 단일 라우트: 기존 로직
        const gateway = config.gateway || 'ops';
        send('status', { step: 'agentcore', message: `🤖 ${config.display} 도구 호출 중...` });
        const agentResponse = await invokeAgentCore(messages, gateway);

        if (agentResponse) {
          const cleanedResponse = agentResponse
            .replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '')
            .replace(/<tool_response>[\s\S]*?<\/tool_response>\s*/g, '')
            .trim();
          send('done', {
            content: cleanedResponse || agentResponse, model: 'sonnet-4.6',
            via: `AgentCore → ${config.display}`, queriedResources: [`${gateway}-gateway`], route, routes,
          });
          controller.close();
          return;
        }

        // Fallback: Bedrock Direct / 폴백: Bedrock 직접
        send('status', { step: 'fallback', message: '🔄 Bedrock Direct 폴백...' });
        const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
        const body = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: SYSTEM_PROMPT,
          messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
        });
        const response = await bedrockClient.send(new InvokeModelCommand({
          modelId, contentType: 'application/json', accept: 'application/json', body: encoder.encode(body),
        }));
        const result = JSON.parse(new TextDecoder().decode(response.body));
        send('done', {
          content: result.content?.[0]?.text || 'No response', model: modelKey || 'sonnet-4.6',
          via: `Bedrock Direct (fallback from ${config.display})`, queriedResources: [], route,
        });
      } catch (err: any) {
        send('error', { error: err.message || 'AI request failed' });
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ============================================================================
// Single route handler / 단일 라우트 핸들러
// ============================================================================
async function handleSingleRoute(
  route: RouteType, messages: Array<{role: string; content: string}>, modelKey?: string
): Promise<{ content: string; via: string; queriedResources: string[] } | null> {
  const config = ROUTE_REGISTRY[route];
  const lastMessage = messages[messages.length - 1]?.content || '';

  // Code handler / 코드 핸들러
  if (config.handler === 'code') {
    const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
    const codeSystemPrompt = SYSTEM_PROMPT + `\n\nThe user wants to execute code. If they provide code, wrap it in a \`\`\`python code block. If they describe a task, generate Python code to accomplish it and wrap it in a \`\`\`python code block. Always include print statements to show results.`;
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: codeSystemPrompt,
      messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
    });
    const aiResponse = await bedrockClient.send(new InvokeModelCommand({
      modelId, contentType: 'application/json', accept: 'application/json',
      body: new TextEncoder().encode(body),
    }));
    const aiText = JSON.parse(new TextDecoder().decode(aiResponse.body)).content?.[0]?.text || '';
    const pythonCode = extractPythonCode(aiText) || extractPythonCode(lastMessage);
    if (pythonCode) {
      const codeResult = await executeCodeInterpreter(pythonCode);
      const executionBlock = `\n\n---\n**Code Execution Result** (exit code: ${codeResult.exitCode}):\n\`\`\`\n${codeResult.output}\n\`\`\``;
      return { content: aiText + executionBlock, via: `Bedrock + ${config.display}`, queriedResources: ['code-interpreter'] };
    }
    return { content: aiText, via: 'Bedrock (code)', queriedResources: [] };
  }

  // SQL handler / SQL 핸들러
  if (config.handler === 'sql') {
    const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
    let sql = await generateSQL(messages);
    let queryResult: { data: string; rowCount: number; error?: string } | null = null;
    for (let attempt = 0; attempt < 2 && sql; attempt++) {
      queryResult = await queryAWS(sql);
      if (!queryResult.error) break;
      if (attempt === 0) {
        const fixMessages = [...messages.slice(-4),
          { role: 'assistant' as const, content: `I generated this SQL: ${sql}` },
          { role: 'user' as const, content: `That SQL failed with error: ${queryResult.error}. Fix the SQL using only valid column names.` },
        ];
        sql = await generateSQL(fixMessages);
      }
    }
    if (sql && queryResult && !queryResult.error) {
      const contextData = `\n\n--- LIVE AWS RESOURCE DATA (${queryResult.rowCount} rows) ---\nSQL: ${sql}\n\`\`\`json\n${queryResult.data}\n\`\`\``;
      const bedrockMessages = messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content }));
      bedrockMessages[bedrockMessages.length - 1].content += contextData;
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: SYSTEM_PROMPT, messages: bedrockMessages,
      });
      const response = await bedrockClient.send(new InvokeModelCommand({
        modelId, contentType: 'application/json', accept: 'application/json',
        body: new TextEncoder().encode(body),
      }));
      const result = JSON.parse(new TextDecoder().decode(response.body));
      return { content: result.content?.[0]?.text || '', via: `${config.display} (${queryResult.rowCount} rows)`, queriedResources: ['steampipe'] };
    }
  }

  // AgentCore Gateway / AgentCore 게이트웨이
  const gateway = config.gateway || 'ops';
  const agentResponse = await invokeAgentCore(messages, gateway);
  if (agentResponse) {
    const cleaned = agentResponse.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '').replace(/<tool_response>[\s\S]*?<\/tool_response>\s*/g, '').trim();
    return { content: cleaned || agentResponse, via: `AgentCore → ${config.display}`, queriedResources: [`${gateway}-gateway`] };
  }
  return null;
}

// ============================================================================
// Synthesize multi-route responses / 멀티 라우트 응답 합성
// ============================================================================
async function synthesizeResponses(
  question: string, responses: { route: string; content: string; via: string }[], modelKey?: string
): Promise<string> {
  const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
  const parts = responses.map(r => `--- ${r.via} ---\n${r.content}`).join('\n\n');
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    system: SYSTEM_PROMPT + `\n\nYou are synthesizing answers from multiple AWS service agents. Combine them into one coherent, well-structured response. Do not repeat information. Use the user's language.`,
    messages: [
      { role: 'user', content: `Question: ${question}\n\nMultiple agents responded:\n\n${parts}\n\nPlease synthesize into one comprehensive answer.` },
    ],
  });
  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId, contentType: 'application/json', accept: 'application/json',
    body: new TextEncoder().encode(body),
  }));
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content?.[0]?.text || responses.map(r => r.content).join('\n\n---\n\n');
}

// ============================================================================
// Non-streaming handler — supports multi-route / 비스트리밍 — 멀티 라우트 지원
// ============================================================================
async function handleNonStreaming(messages: Array<{role: string; content: string}>, modelKey?: string) {
  try {
    const routes = await classifyIntent(messages);
    const primaryRoute = routes[0];
    const _primaryConfig = ROUTE_REGISTRY[primaryRoute];

    // Single route (most common) / 단일 라우트 (일반적)
    if (routes.length === 1) {
      const result = await handleSingleRoute(primaryRoute, messages, modelKey);
      if (result) {
        return NextResponse.json({
          content: result.content, model: modelKey || 'sonnet-4.6',
          via: result.via, queriedResources: result.queriedResources,
          route: primaryRoute, routes,
        });
      }
      // Fallback / 폴백
      const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: SYSTEM_PROMPT,
        messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      });
      const response = await bedrockClient.send(new InvokeModelCommand({
        modelId, contentType: 'application/json', accept: 'application/json',
        body: new TextEncoder().encode(body),
      }));
      const fallbackResult = JSON.parse(new TextDecoder().decode(response.body));
      return NextResponse.json({
        content: fallbackResult.content?.[0]?.text || 'No response', model: modelKey || 'sonnet-4.6',
        via: `Bedrock Direct (fallback)`, queriedResources: [], route: primaryRoute, routes,
      });
    }

    // Multi-route: parallel execution + synthesis / 멀티 라우트: 병렬 실행 + 합성
    console.log(`[Multi-Route] ${routes.join(' + ')}`);
    const results = await Promise.allSettled(
      routes.map(r => handleSingleRoute(r, messages, modelKey))
    );

    const successful: { route: string; content: string; via: string }[] = [];
    const allResources: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        successful.push({ route: routes[i], content: r.value.content, via: r.value.via });
        allResources.push(...r.value.queriedResources);
      }
    });

    if (successful.length === 0) {
      return NextResponse.json({
        content: 'All routes failed. Please try again.', model: modelKey || 'sonnet-4.6',
        via: 'Multi-route (all failed)', queriedResources: [], route: primaryRoute, routes,
      });
    }

    // Single success → return directly / 1개만 성공 → 직접 반환
    if (successful.length === 1) {
      return NextResponse.json({
        content: successful[0].content, model: modelKey || 'sonnet-4.6',
        via: successful[0].via, queriedResources: allResources, route: primaryRoute, routes,
      });
    }

    // Multiple successes → synthesize / 복수 성공 → 합성
    const lastMsg = messages[messages.length - 1]?.content || '';
    const synthesized = await synthesizeResponses(lastMsg, successful, modelKey);
    const viaList = successful.map(s => s.via).join(' + ');

    return NextResponse.json({
      content: synthesized, model: modelKey || 'sonnet-4.6',
      via: `Multi-Route: ${viaList}`, queriedResources: allResources, route: primaryRoute, routes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 });
  }
}
