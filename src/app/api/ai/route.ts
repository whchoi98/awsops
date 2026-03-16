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
import { recordCall } from '@/lib/agentcore-stats';
import { saveConversation } from '@/lib/agentcore-memory';
import { getUserFromRequest } from '@/lib/auth-utils';

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
      '"TGW 라우트 분석" → network', '"VPN 연결 상태 진단" → network',
      '"EC2 간 통신 가능한지 확인" → network', '"네트워크 경로 분석" → network',
      '"플로우 로그 조회" → network', '"VPC 피어링 트러블슈팅" → network',
      '"Reachability Analyzer 실행" → network', '"방화벽 규칙 확인" → network',
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
      'Container Cost (ECS/EKS 워크로드별 비용 분석)',
    ],
    examples: ['"이번 달 비용" → cost', '"EC2 비용 분석" → cost', '"비용 예측" → cost', '"컨테이너 비용" → cost', '"ECS Task 비용" → cost', '"Pod 비용 분석" → cost', '"네임스페이스별 비용" → cost'],
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
      '"VPC 목록" → aws-data', '"VPC 현황" → aws-data',
      '"VPC 네트워크 구성 분석" → aws-data', '"VPC 구성을 분석해줘" → aws-data',
      '"서브넷 리스트" → aws-data', '"보안그룹 목록" → aws-data',
      '"RDS 인스턴스 몇개" → aws-data', '"EKS 노드 목록" → aws-data',
      '"네트워크 현황" → aws-data', '"인프라 구성 보여줘" → aws-data',
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
- Prefer specialized routes for ANALYSIS, TROUBLESHOOTING, and TOOL-based operations.
- "aws-data" is for simple resource LISTING, COUNTING, STATUS queries (e.g. "VPC 목록", "EC2 현황", "S3 버킷 몇개", "서브넷 리스트").
- Use "network" ONLY for specific tool-based operations: reachability analyzer, flow log queries, TGW route analysis, firewall rule checks, VPN troubleshooting. NOT for "VPC 구성 분석", "네트워크 현황", or any resource listing.
- Use "container" ONLY for specific tool operations: EKS troubleshooting, Istio mesh config, ECS task troubleshooting. NOT for simple EKS/ECS/Pod listing.
- When user asks "XX 구성 분석해줘" or "XX 현황 분석" → use "aws-data" (Steampipe SQL gives real data, then Bedrock analyzes). "network"/"container" gateways are for specialized tool execution only.
- "code" and "aws-data" should NOT be combined with other routes.
- Keywords like "목록", "리스트", "현황", "몇개", "list", "count", "show" → prefer "aws-data"
- Keywords like "분석", "진단", "문제", "확인해줘", "troubleshoot", "analyze" → prefer specialized route

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
- All AWS tables have an 'account_id' column. Account scoping is handled automatically via search_path — do NOT add WHERE account_id filters unless the user explicitly asks to compare or filter by account.

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
- "전체 리소스 요약" → SELECT 'EC2' AS resource, COUNT(*) AS count FROM aws_ec2_instance UNION ALL SELECT 'VPC', COUNT(*) FROM aws_vpc UNION ALL SELECT 'RDS', COUNT(*) FROM aws_rds_db_instance UNION ALL SELECT 'Lambda', COUNT(*) FROM aws_lambda_function UNION ALL SELECT 'S3', COUNT(*) FROM aws_s3_bucket
- "VPC 네트워크 구성 분석" → SELECT v.vpc_id, v.tags ->> 'Name' AS name, v.cidr_block, v.is_default, v.state, (SELECT COUNT(*) FROM aws_vpc_subnet s WHERE s.vpc_id = v.vpc_id) AS subnet_count, (SELECT COUNT(*) FROM aws_vpc_route_table r WHERE r.vpc_id = v.vpc_id) AS route_table_count, (SELECT COUNT(DISTINCT group_id) FROM aws_vpc_security_group sg WHERE sg.vpc_id = v.vpc_id) AS sg_count FROM aws_vpc v ORDER BY v.tags ->> 'Name'
- "서브넷 구성" → SELECT subnet_id, tags ->> 'Name' AS name, vpc_id, cidr_block, availability_zone, map_public_ip_on_launch, available_ip_address_count FROM aws_vpc_subnet ORDER BY vpc_id, availability_zone`;

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

async function queryAWS(sql: string, accountId?: string): Promise<{ data: string; rowCount: number; error?: string }> {
  try {
    const result = await runQuery(sql, { accountId });
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
const AGENTCORE_TIMEOUT_MS = 90000; // 90초 — Gateway 도구 실행 시간 고려 / 90s for tool execution

async function invokeAgentCore(
  messages: Array<{role: string; content: string}>,
  gateway: string,
  targetAccountId?: string
): Promise<string | null> {
  try {
    const recentMessages = messages.slice(-10);
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: getAgentRuntimeArn(),
      qualifier: 'DEFAULT',
      payload: JSON.stringify({ messages: recentMessages, gateway, targetAccountId }),
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
// Tool usage extraction / 사용된 도구 추출
// ============================================================================
// 알려진 MCP 도구 이름 (125개 중 주요 도구) / Known MCP tool names for matching
const KNOWN_TOOLS = new Set([
  // Network (17)
  'get_path_trace_methodology', 'find_ip_address', 'get_eni_details', 'list_vpcs',
  'get_vpc_network_details', 'get_vpc_flow_logs', 'describe_network', 'list_transit_gateways',
  'get_tgw_details', 'get_tgw_routes', 'get_all_tgw_routes', 'list_tgw_peerings',
  'list_vpn_connections', 'list_network_firewalls', 'get_firewall_rules',
  'analyze_reachability', 'query_flow_logs',
  // Container (24)
  'list_eks_clusters', 'get_eks_vpc_config', 'get_eks_insights', 'get_cloudwatch_logs',
  'get_cloudwatch_metrics', 'get_eks_metrics_guidance', 'get_policies_for_role',
  'search_eks_troubleshoot_guide', 'generate_app_manifest',
  'ecs_resource_management', 'ecs_troubleshooting_tool', 'wait_for_service_ready',
  'istio_overview', 'list_virtual_services', 'list_destination_rules', 'list_istio_gateways',
  'list_service_entries', 'list_authorization_policies', 'list_peer_authentications',
  'check_sidecar_injection', 'list_envoy_filters', 'list_istio_crds', 'istio_troubleshooting', 'query_istio_resource',
  // IaC (12)
  'validate_cloudformation_template', 'check_cloudformation_template_compliance',
  'troubleshoot_cloudformation_deployment', 'search_cdk_documentation',
  'search_cloudformation_documentation', 'cdk_best_practices', 'read_iac_documentation_page',
  'SearchAwsProviderDocs', 'SearchAwsccProviderDocs', 'SearchSpecificAwsIaModules',
  'SearchUserProvidedModule', 'terraform_best_practices',
  // Data (24)
  'list_tables', 'describe_table', 'query_table', 'get_item', 'dynamodb_data_modeling', 'compute_performances_and_costs',
  'list_db_instances', 'list_db_clusters', 'describe_db_instance', 'describe_db_cluster', 'execute_sql', 'list_snapshots',
  'list_cache_clusters', 'describe_cache_cluster', 'list_replication_groups', 'describe_replication_group',
  'list_serverless_caches', 'elasticache_best_practices',
  'list_clusters', 'get_cluster_info', 'get_configuration_info', 'get_bootstrap_brokers', 'list_nodes', 'msk_best_practices',
  // Security (14)
  'list_users', 'get_user', 'list_roles', 'get_role_details', 'list_groups', 'get_group',
  'list_policies', 'list_user_policies', 'list_role_policies', 'get_user_policy', 'get_role_policy',
  'list_access_keys', 'simulate_principal_policy', 'get_account_security_summary',
  // Monitoring (16)
  'get_metric_data', 'get_metric_metadata', 'analyze_metric', 'get_recommended_metric_alarms',
  'get_active_alarms', 'get_alarm_history', 'describe_log_groups', 'analyze_log_group',
  'execute_log_insights_query', 'get_logs_insight_query_results', 'cancel_logs_insight_query',
  'lookup_events', 'list_event_data_stores', 'lake_query', 'get_query_status', 'get_query_results',
  // Cost (9)
  'get_today_date', 'get_cost_and_usage', 'get_cost_and_usage_comparisons',
  'get_cost_comparison_drivers', 'get_cost_forecast', 'get_dimension_values',
  'get_tag_values', 'get_pricing', 'list_budgets',
  // Ops (9)
  'search_documentation', 'read_documentation', 'recommend', 'list_regions',
  'get_regional_availability', 'prompt_understanding', 'call_aws', 'suggest_aws_commands', 'run_steampipe_query',
]);

// 응답 내용 기반 도구 추론 매핑 / Infer tools from response content keywords
const TOOL_KEYWORD_MAP: Record<string, string[]> = {
  // Security
  'list_users': ['IAM 사용자', 'IAM user', 'iam user', '사용자 목록', 'user list'],
  'get_user': ['사용자 상세', 'user detail'],
  'list_roles': ['IAM 역할', 'IAM role', '역할 목록', 'role list'],
  'get_role_details': ['역할 상세', 'role detail', 'trust policy'],
  'list_access_keys': ['액세스 키', 'access key', 'AccessKey'],
  'simulate_principal_policy': ['시뮬레이션', 'simulate', 'permission test'],
  'get_account_security_summary': ['보안 요약', 'security summary', 'MFA', 'mfa_enabled'],
  'list_policies': ['정책 목록', 'policy list', 'AdministratorAccess'],
  'list_user_policies': ['사용자 정책', 'user policy', '인라인 정책'],
  'list_role_policies': ['역할 정책', 'role policy'],
  // Network
  'list_vpcs': ['VPC 목록', 'vpc_id', 'VPC ID', 'cidr_block'],
  'get_vpc_network_details': ['서브넷', 'subnet', '라우트 테이블', 'route table', 'NACL'],
  'list_transit_gateways': ['Transit Gateway', 'TGW', 'tgw-'],
  'get_tgw_routes': ['TGW 라우트', 'tgw route'],
  'list_vpn_connections': ['VPN', 'vpn-'],
  'analyze_reachability': ['Reachability', 'reachability', '도달성'],
  'query_flow_logs': ['Flow Log', 'flow log', '플로우 로그'],
  'list_network_firewalls': ['Network Firewall', 'firewall'],
  'describe_network': ['네트워크 구성', 'network describe'],
  // Container
  'list_eks_clusters': ['EKS 클러스터', 'eks cluster'],
  'ecs_resource_management': ['ECS 서비스', 'ecs service', 'ECS 태스크'],
  'istio_overview': ['Istio', 'istio', '서비스 메시'],
  // Monitoring
  'get_metric_data': ['메트릭', 'metric', 'CPU 사용', 'cpu utilization'],
  'get_active_alarms': ['알람', 'alarm', 'CloudWatch alarm'],
  'lookup_events': ['CloudTrail', 'cloudtrail', 'API 이벤트', 'api event'],
  'execute_log_insights_query': ['Log Insights', 'log insights', '로그 분석'],
  'describe_log_groups': ['로그 그룹', 'log group'],
  // Cost
  'get_cost_and_usage': ['비용', 'cost', 'billing', '청구'],
  'get_cost_forecast': ['예측', 'forecast'],
  'list_budgets': ['예산', 'budget'],
  'get_pricing': ['가격', 'pricing', '단가'],
  // Data
  'list_tables': ['DynamoDB', 'dynamodb', '테이블 목록'],
  'list_db_instances': ['RDS', 'rds', 'DB 인스턴스'],
  'list_cache_clusters': ['ElastiCache', 'elasticache', 'Redis', 'Valkey'],
  'list_clusters': ['MSK', 'Kafka', 'kafka'],
};

function extractUsedTools(rawResponse: string): string[] {
  const tools = new Set<string>();
  let m: RegExpExecArray | null;
  // 1. <tool_call> 태그 / <tool_call> tags
  const callRegex = /<tool_call>\s*\{[^}]*"name"\s*:\s*"([^"]+)"/g;
  while ((m = callRegex.exec(rawResponse)) !== null) tools.add(m[1]);
  // 2. "tool_name" 필드 / "tool_name" field
  const useRegex = /"tool_name"\s*:\s*"([^"]+)"/g;
  while ((m = useRegex.exec(rawResponse)) !== null) tools.add(m[1]);
  // 3. 백틱으로 감싼 도구 이름 / Backtick-wrapped tool names
  const backtickRegex = /`([a-zA-Z][a-zA-Z0-9_]+)`/g;
  while ((m = backtickRegex.exec(rawResponse)) !== null) {
    if (KNOWN_TOOLS.has(m[1])) tools.add(m[1]);
  }
  // 4. 백틱 없이 텍스트에 등장하는 알려진 도구 이름 / Known tool names in plain text
  Array.from(KNOWN_TOOLS).forEach(toolName => {
    if (toolName.length > 6 && rawResponse.includes(toolName)) tools.add(toolName);
  });
  // 5. 응답 내용 키워드로 도구 추론 / Infer tools from response content keywords
  Object.entries(TOOL_KEYWORD_MAP).forEach(([tool, keywords]) => {
    if (keywords.some(kw => rawResponse.includes(kw))) tools.add(tool);
  });
  return Array.from(tools);
}

// ============================================================================
// SSE helpers / SSE 헬퍼
// ============================================================================
function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ============================================================================
// Helper: 통계 기록 + 대화 저장을 한 번에 / Record stats + save conversation in one call
function recordAndSave(p: {
  route: string; gateway: string; responseTimeMs: number; usedTools: string[];
  success: boolean; via: string; question: string; summary: string; userId: string;
}): void {
  recordCall({ timestamp: new Date().toISOString(), route: p.route, gateway: p.gateway, responseTimeMs: p.responseTimeMs, usedTools: p.usedTools, success: p.success, via: p.via });
  saveConversation({ id: `${Date.now()}`, userId: p.userId, timestamp: new Date().toISOString(), route: p.route, gateway: p.gateway, question: p.question.slice(0, 100), summary: p.summary.slice(0, 200), usedTools: p.usedTools, responseTimeMs: p.responseTimeMs, via: p.via }).catch(() => {});
}

// POST handler — SSE streaming with step-by-step progress events
// POST 핸들러 — 단계별 진행 이벤트를 포함한 SSE 스트리밍
// ============================================================================
export async function POST(request: NextRequest) {
  const reqBody = await request.json();
  const { messages, model: modelKey, stream: useStream, accountId } = reqBody;

  if (!messages || !Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'Messages required' }, { status: 400 });

  // Cognito 사용자 정보 추출 / Extract Cognito user from JWT
  const currentUser = getUserFromRequest(request);

  // Non-streaming mode: return JSON (backward compatible for test scripts)
  // 비스트리밍 모드: JSON 반환 (테스트 스크립트 하위 호환)
  if (!useStream) {
    return handleNonStreaming(messages, modelKey, accountId);
  }

  // Streaming mode: SSE events / 스트리밍 모드: SSE 이벤트
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };
      const callStartTime = Date.now();

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
            queryResult = await queryAWS(sql, accountId);
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
            const sqlContent = result.content?.[0]?.text || 'No response';
            const sqlTools = extractUsedTools(sqlContent);
            if (sql) sqlTools.push(`steampipe: ${sql.match(/FROM\s+(\w+)/i)?.[1] || 'query'}`);
            const sqlTimeMs = Date.now() - callStartTime;
            recordAndSave({ route, gateway: 'steampipe', responseTimeMs: sqlTimeMs, usedTools: sqlTools, success: true, via: `${config.display} (${queryResult.rowCount} rows)`, question: lastMessage, summary: sqlContent, userId: currentUser.email });
            send('done', {
              content: sqlContent, model: modelKey || 'sonnet-4.6',
              via: `${config.display} (${queryResult.rowCount} rows)`, queriedResources: ['steampipe'], route,
              usedTools: sqlTools,
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

          // Keepalive for multi-route / 멀티 라우트 keepalive
          let multiKeepCount = 0;
          const multiKeepInterval = setInterval(() => {
            multiKeepCount++;
            send('status', { step: 'multi-call', message: `🤖 ${routes.length}개 Gateway 실행 중... (${multiKeepCount * 15}s)` });
          }, 15000);

          const results = await Promise.allSettled(
            routes.map(r => handleSingleRoute(r, messages, modelKey))
          );
          clearInterval(multiKeepInterval);
          const successful: { route: string; content: string; via: string }[] = [];
          const allResources: string[] = [];
          const allUsedTools: string[] = [];
          results.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value) {
              successful.push({ route: routes[i], content: r.value.content, via: r.value.via });
              allResources.push(...r.value.queriedResources);
              if (r.value.usedTools) allUsedTools.push(...r.value.usedTools);
            }
          });
          // 합성 응답에서도 도구 추출 / Also extract tools from synthesized content
          const dedupedTools = Array.from(new Set(allUsedTools));

          if (successful.length > 1) {
            send('status', { step: 'synthesizing', message: `📊 ${successful.length}개 응답 합성 중...` });
            const lastMsg = messages[messages.length - 1]?.content || '';
            const synthesized = await synthesizeResponses(lastMsg, successful, modelKey);
            // 합성된 응답에서도 추가 도구 추출 / Extract additional tools from synthesized response
            const synthesizedTools = extractUsedTools(synthesized);
            const finalTools = Array.from(new Set([...dedupedTools, ...synthesizedTools]));
            const viaList = successful.map(s => s.via).join(' + ');
            const multiTimeMs = Date.now() - callStartTime;
            recordAndSave({ route, gateway: `multi:${routes.join('+')}`, responseTimeMs: multiTimeMs, usedTools: finalTools, success: true, via: `Multi-Route: ${viaList}`, question: lastMsg, summary: synthesized, userId: currentUser.email });
            send('done', {
              content: synthesized, model: modelKey || 'sonnet-4.6',
              via: `Multi-Route: ${viaList}`, queriedResources: allResources, route, routes,
              usedTools: finalTools,
            });
          } else if (successful.length === 1) {
            send('done', {
              content: successful[0].content, model: modelKey || 'sonnet-4.6',
              via: successful[0].via, queriedResources: allResources, route, routes,
              usedTools: dedupedTools,
            });
          } else {
            // 모든 Gateway 실패 → Bedrock Direct 폴백 / All gateways failed → Bedrock Direct fallback
            send('status', { step: 'fallback', message: '🔄 Gateway 타임아웃, Bedrock Direct로 전환...' });
            const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
            const fallbackBody = JSON.stringify({
              anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, system: SYSTEM_PROMPT,
              messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
            });
            try {
              const fallbackResp = await bedrockClient.send(new InvokeModelCommand({
                modelId, contentType: 'application/json', accept: 'application/json',
                body: encoder.encode(fallbackBody),
              }));
              const fallbackResult = JSON.parse(new TextDecoder().decode(fallbackResp.body));
              const mfContent = fallbackResult.content?.[0]?.text || 'No response';
              const mfTools = extractUsedTools(mfContent);
              send('done', {
                content: mfContent, model: modelKey || 'sonnet-4.6',
                via: `Bedrock Direct (multi-route fallback: ${routes.join('+')} timed out)`, queriedResources: [], route, routes,
                usedTools: mfTools,
              });
            } catch {
              send('error', { error: 'All routes and fallback failed' });
            }
          }
          controller.close();
          return;
        }

        // Single route: existing logic / 단일 라우트: 기존 로직
        const gateway = config.gateway || 'ops';
        send('status', { step: 'agentcore', message: `🤖 ${config.display} 도구 호출 중...` });

        // Keepalive: send periodic status during AgentCore call to prevent CloudFront timeout
        // Keepalive: AgentCore 호출 중 주기적 상태 전송으로 CloudFront 타임아웃 방지
        let keepaliveCount = 0;
        const keepaliveInterval = setInterval(() => {
          keepaliveCount++;
          send('status', { step: 'agentcore', message: `🤖 ${config.display} 도구 실행 중... (${keepaliveCount * 15}s)` });
        }, 15000);

        const agentResponse = await invokeAgentCore(messages, gateway, accountId);
        clearInterval(keepaliveInterval);

        if (agentResponse) {
          const usedTools = extractUsedTools(agentResponse);
          const cleanedResponse = agentResponse
            .replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '')
            .replace(/<tool_response>[\s\S]*?<\/tool_response>\s*/g, '')
            .trim();
          const responseTimeMs = Date.now() - callStartTime;
          const finalContent = cleanedResponse || agentResponse;
          recordAndSave({ route, gateway, responseTimeMs, usedTools, success: true, via: `AgentCore → ${config.display}`, question: lastMessage, summary: finalContent, userId: currentUser.email });
          send('done', {
            content: finalContent, model: 'sonnet-4.6',
            via: `AgentCore → ${config.display}`, queriedResources: [`${gateway}-gateway`], route, routes,
            usedTools,
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
        const fallbackContent = result.content?.[0]?.text || 'No response';
        const fallbackTools = extractUsedTools(fallbackContent);
        const fbTimeMs = Date.now() - callStartTime;
        recordAndSave({ route, gateway: 'bedrock-fallback', responseTimeMs: fbTimeMs, usedTools: fallbackTools, success: false, via: `Bedrock Direct (fallback)`, question: lastMessage, summary: fallbackContent, userId: currentUser.email });
        send('done', {
          content: fallbackContent, model: modelKey || 'sonnet-4.6',
          via: `Bedrock Direct (fallback from ${config.display})`, queriedResources: [], route,
          usedTools: fallbackTools,
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
  route: RouteType, messages: Array<{role: string; content: string}>, modelKey?: string, accountId?: string
): Promise<{ content: string; via: string; queriedResources: string[]; usedTools?: string[] } | null> {
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
      queryResult = await queryAWS(sql, accountId);
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
  const agentResponse = await invokeAgentCore(messages, gateway, accountId);
  if (agentResponse) {
    const usedTools = extractUsedTools(agentResponse);
    const cleaned = agentResponse.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '').replace(/<tool_response>[\s\S]*?<\/tool_response>\s*/g, '').trim();
    return { content: cleaned || agentResponse, via: `AgentCore → ${config.display}`, queriedResources: [`${gateway}-gateway`], usedTools };
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
async function handleNonStreaming(messages: Array<{role: string; content: string}>, modelKey?: string, accountId?: string) {
  try {
    const routes = await classifyIntent(messages);
    const primaryRoute = routes[0];
    const _primaryConfig = ROUTE_REGISTRY[primaryRoute];

    // Single route (most common) / 단일 라우트 (일반적)
    if (routes.length === 1) {
      const result = await handleSingleRoute(primaryRoute, messages, modelKey, accountId);
      if (result) {
        return NextResponse.json({
          content: result.content, model: modelKey || 'sonnet-4.6',
          via: result.via, queriedResources: result.queriedResources,
          usedTools: result.usedTools || [], route: primaryRoute, routes,
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
