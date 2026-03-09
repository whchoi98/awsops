// AI routing API: Sonnet intent classification + conversation history / AI 라우팅 API: Sonnet 의도 분류 + 대화 히스토리
// Flow: classify intent → route to AgentCore Gateway → fallback to Bedrock Direct
// 흐름: 의도 분류 → AgentCore 게이트웨이 라우팅 → Bedrock 직접 호출 폴백
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

// Service configuration / 서비스 설정
const BEDROCK_REGION = 'us-east-1';
const AGENTCORE_REGION = 'ap-northeast-2';
const AGENT_RUNTIME_ARN = 'arn:aws:bedrock-agentcore:ap-northeast-2:605134447633:runtime/awsops_agent-zMwFdo9X4Y';
const CODE_INTERPRETER_ID = 'awsops_code_interpreter-pnEkzLpDfH';

// Available Bedrock models / 사용 가능한 Bedrock 모델
const MODELS: Record<string, string> = {
  'sonnet-4.6': 'us.anthropic.claude-sonnet-4-6',
  'opus-4.6': 'us.anthropic.claude-opus-4-6-v1',
};

// AWS SDK clients / AWS SDK 클라이언트
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const agentCoreClient = new BedrockAgentCoreClient({ region: AGENTCORE_REGION });

// Valid route types for intent classification / 의도 분류에 사용되는 유효한 라우트 타입
type RouteType = 'code' | 'infra' | 'iac' | 'data' | 'security' | 'monitoring' | 'cost' | 'aws-data' | 'general';

// Gateway mapping: route type → AgentCore gateway role / 라우트 타입 → AgentCore 게이트웨이 역할 매핑
const ROUTE_TO_GATEWAY: Record<string, string> = {
  'infra': 'infra',
  'iac': 'iac',
  'data': 'data',
  'security': 'security',
  'monitoring': 'monitoring',
  'cost': 'cost',
  'aws-data': 'ops',     // Steampipe SQL via Ops Gateway / Ops 게이트웨이의 steampipe-query 도구 사용
  'general': 'ops',
};

// Gateway display names for UI / UI 표시용 게이트웨이 이름
const ROUTE_DISPLAY: Record<string, string> = {
  'code': 'Code Interpreter',
  'infra': 'Infra Gateway (41 tools)',
  'iac': 'IaC Gateway (12 tools)',
  'data': 'Data Gateway (24 tools)',
  'security': 'Security Gateway (14 tools)',
  'monitoring': 'Monitoring Gateway (16 tools)',
  'cost': 'Cost Gateway (9 tools)',
  'aws-data': 'Ops Gateway → Steampipe SQL',
  'general': 'Ops Gateway (9 tools)',
};

const SYSTEM_PROMPT = `You are AWSops AI Assistant, an expert in AWS cloud operations.
You help users understand and manage their AWS infrastructure.
You have access to real-time AWS resource data via Steampipe queries.
When users ask about their resources, analyze the data provided.
Always be concise and provide actionable insights.
Format responses in markdown for readability.
When discussing security issues, prioritize them by severity.
Respond in the same language as the user's question.`;

// Intent classification prompt / 의도 분류 프롬프트
const CLASSIFICATION_PROMPT = `You are an intent classifier for an AWS operations dashboard.
Classify the user's question into exactly ONE route. Consider the FULL conversation context, not just the last message.

Routes:
- "code": Execute Python code, run calculations, generate scripts (keywords: 코드 실행, execute, run code, 계산, python)
- "infra": Networking (ENI, VPC flow logs, route tables, security groups, reachability), EKS/Kubernetes, ECS/Fargate, Istio/service mesh, VPN, troubleshooting connectivity
- "iac": Infrastructure as Code (CDK, CloudFormation, Terraform, Terragrunt, template validation, stack deployment)
- "data": Databases & streaming (DynamoDB, RDS, Aurora, MySQL, PostgreSQL, ElastiCache, Valkey, Redis, MSK, Kafka)
- "security": IAM users/roles/policies, access keys, MFA, trust policies, permission simulation, security posture
- "monitoring": CloudWatch metrics/alarms/logs, CloudTrail audit events, observability, CPU/memory/disk usage
- "cost": AWS billing, cost analysis, budget, pricing, forecast, savings, optimization, FinOps
- "aws-data": General AWS resource queries (list/describe EC2, S3, VPC, Lambda, RDS instances — when asking about resource inventory or status, NOT about infrastructure troubleshooting)
- "general": General AWS questions, documentation lookup, best practices, architecture advice

Important rules:
- If the user asks a follow-up question (e.g. "그중에서", "그건", "더 자세히"), use the PREVIOUS conversation context to determine the correct route.
- If the question spans multiple domains, pick the PRIMARY intent.
- "EC2 인스턴스 목록" → aws-data (resource listing), NOT infra
- "EC2 간 네트워크 연결 확인" → infra (connectivity troubleshooting)
- "EC2 비용" → cost (cost analysis)

Respond with ONLY a JSON object: {"route": "<route>"}`;

// Classify user intent using Sonnet / Sonnet을 사용한 사용자 의도 분류
async function classifyIntent(messages: Array<{role: string; content: string}>): Promise<RouteType> {
  try {
    // Build conversation summary for classification / 분류를 위한 대화 요약 구성
    const recentMessages = messages.slice(-10);
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 50,
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

    // Parse JSON response / JSON 응답 파싱
    const match = text.match(/\{[^}]*"route"\s*:\s*"([^"]+)"[^}]*\}/);
    if (match) {
      const route = match[1] as RouteType;
      const validRoutes: RouteType[] = ['code', 'infra', 'iac', 'data', 'security', 'monitoring', 'cost', 'aws-data', 'general'];
      if (validRoutes.includes(route)) {
        console.log(`[Intent] Classified as: ${route}`);
        return route;
      }
    }

    console.warn(`[Intent] Could not parse classification: ${text}, falling back to general`);
    return 'general';
  } catch (err: any) {
    console.error(`[Intent] Classification failed: ${err.message}, falling back to general`);
    return 'general';
  }
}

// SQL generation prompt for aws-data route / aws-data 라우트용 SQL 생성 프롬프트
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

// Generate SQL from user question using Sonnet / Sonnet으로 사용자 질문에서 SQL 생성
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
    // Strip markdown code block if present / 마크다운 코드 블록 제거
    sql = sql.replace(/^```(?:sql)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    if (!sql.toLowerCase().startsWith('select')) return null;
    return sql;
  } catch (err: any) {
    console.error('[SQL Gen] Failed:', err.message);
    return null;
  }
}

// Execute Steampipe query via pg Pool / pg Pool을 통해 Steampipe 쿼리 실행
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

// Extract python code blocks from AI response text / AI 응답 텍스트에서 Python 코드 블록 추출
function extractPythonCode(text: string): string | null {
  const match = text.match(/```python\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

// Execute code via Code Interpreter / 코드 인터프리터를 통해 코드 실행
async function executeCodeInterpreter(code: string): Promise<{ output: string; exitCode: number }> {
  let sessionId: string | undefined;
  try {
    const startResp = await agentCoreClient.send(
      new StartCodeInterpreterSessionCommand({
        codeInterpreterIdentifier: CODE_INTERPRETER_ID,
      })
    );
    sessionId = startResp.sessionId;
    if (!sessionId) throw new Error('No sessionId returned');

    const invokeResp = await agentCoreClient.send(
      new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: CODE_INTERPRETER_ID,
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
            for (const block of content) {
              if (block.text) output += block.text;
            }
          }
        }
        if ('error' in event) {
          output += `Error: ${JSON.stringify((event as any).error)}`;
          exitCode = 1;
        }
      }
    }

    await agentCoreClient.send(
      new StopCodeInterpreterSessionCommand({
        codeInterpreterIdentifier: CODE_INTERPRETER_ID,
        sessionId,
      })
    ).catch(() => {});

    return { output: output || '(no output)', exitCode };
  } catch (err: any) {
    if (sessionId) {
      await agentCoreClient.send(
        new StopCodeInterpreterSessionCommand({
          codeInterpreterIdentifier: CODE_INTERPRETER_ID,
          sessionId,
        })
      ).catch(() => {});
    }
    return { output: `Code execution failed: ${err.message}`, exitCode: 1 };
  }
}

// AgentCore Runtime invoke with conversation history and timeout / 대화 히스토리와 타임아웃을 포함한 AgentCore Runtime 호출
const AGENTCORE_TIMEOUT_MS = 60000; // 60 seconds max for AgentCore / AgentCore 최대 60초

async function invokeAgentCore(
  messages: Array<{role: string; content: string}>,
  gateway: string
): Promise<string | null> {
  try {
    // Send full conversation history (last 10 turns) + gateway role / 전체 대화 히스토리 (최근 10턴) + 게이트웨이 역할 전송
    const recentMessages = messages.slice(-10);
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: AGENT_RUNTIME_ARN,
      qualifier: 'DEFAULT',
      payload: JSON.stringify({ messages: recentMessages, gateway }),
    });

    // Race between AgentCore call and timeout / AgentCore 호출과 타임아웃 경쟁
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => { console.warn(`[AgentCore] Timeout after ${AGENTCORE_TIMEOUT_MS}ms for gateway=${gateway}`); resolve(null); }, AGENTCORE_TIMEOUT_MS)
    );

    const agentPromise = (async () => {
      const response = await agentCoreClient.send(command);
      const sessionId = response.runtimeSessionId;
      const body = await streamToString(response.response);
      const text = body.startsWith('"') ? JSON.parse(body) : body;

      // Stop session to release microVM / microVM 해제를 위해 세션 중지
      if (sessionId) {
        try {
          await agentCoreClient.send(new StopRuntimeSessionCommand({
            agentRuntimeArn: AGENT_RUNTIME_ARN,
            runtimeSessionId: sessionId,
            qualifier: 'DEFAULT',
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

// POST handler: Sonnet intent classification → AgentCore routing / POST 핸들러: Sonnet 의도 분류 → AgentCore 라우팅
export async function POST(request: NextRequest) {
  try {
    const { messages, model: modelKey } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0)
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });

    // Step 1: Classify intent using Sonnet (full conversation context) / 1단계: Sonnet으로 의도 분류 (전체 대화 컨텍스트)
    const route = await classifyIntent(messages);
    const lastMessage = messages[messages.length - 1]?.content || '';

    // Step 2: Route based on classification / 2단계: 분류 결과에 따라 라우팅
    // Code Interpreter route / 코드 인터프리터 라우트
    if (route === 'code') {
      const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
      const codeSystemPrompt = SYSTEM_PROMPT + `\n\nThe user wants to execute code. If they provide code, wrap it in a \`\`\`python code block. If they describe a task, generate Python code to accomplish it and wrap it in a \`\`\`python code block. Always include print statements to show results.`;

      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: codeSystemPrompt,
        messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      });

      const aiResponse = await bedrockClient.send(new InvokeModelCommand({
        modelId, contentType: 'application/json', accept: 'application/json',
        body: new TextEncoder().encode(body),
      }));

      const aiResult = JSON.parse(new TextDecoder().decode(aiResponse.body));
      const aiText = aiResult.content?.[0]?.text || '';

      const pythonCode = extractPythonCode(aiText) || extractPythonCode(lastMessage);
      if (pythonCode) {
        const codeResult = await executeCodeInterpreter(pythonCode);
        const executionBlock = `\n\n---\n**Code Execution Result** (exit code: ${codeResult.exitCode}):\n\`\`\`\n${codeResult.output}\n\`\`\``;
        return NextResponse.json({
          content: aiText + executionBlock,
          model: modelKey || 'sonnet-4.6',
          via: `Bedrock + ${ROUTE_DISPLAY[route]}`,
          queriedResources: ['code-interpreter'],
          route,
          codeExecution: { output: codeResult.output, exitCode: codeResult.exitCode },
        });
      }

      return NextResponse.json({
        content: aiText,
        model: modelKey || 'sonnet-4.6',
        via: 'Bedrock (code request - no executable code generated)',
        queriedResources: [],
        route,
      });
    }

    // AWS Data route: Sonnet generates SQL → pg Pool executes → Sonnet analyzes results
    // AWS 데이터 라우트: Sonnet이 SQL 생성 → pg Pool 실행 → Sonnet이 결과 분석
    // Includes auto-retry on SQL errors (wrong column names, etc.) / SQL 오류 시 자동 재시도 포함
    if (route === 'aws-data') {
      const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
      let sql = await generateSQL(messages);
      let queryResult: { data: string; rowCount: number; error?: string } | null = null;

      // Try up to 2 times: initial + 1 retry on SQL error / 최대 2회 시도: 초기 + SQL 오류 시 1회 재시도
      for (let attempt = 0; attempt < 2 && sql; attempt++) {
        console.log(`[AWS-Data] Attempt ${attempt + 1}, SQL: ${sql}`);
        queryResult = await queryAWS(sql);

        if (!queryResult.error) break;

        // On error, ask Sonnet to fix the SQL / 오류 시 Sonnet에게 SQL 수정 요청
        if (attempt === 0) {
          console.warn(`[AWS-Data] SQL error: ${queryResult.error}, retrying with fix`);
          const fixMessages = [
            ...messages.slice(-4),
            { role: 'assistant' as const, content: `I generated this SQL: ${sql}` },
            { role: 'user' as const, content: `That SQL failed with error: ${queryResult.error}. Fix the SQL using only valid column names.` },
          ];
          sql = await generateSQL(fixMessages);
        }
      }

      if (sql && queryResult && !queryResult.error) {
        // Build context with query results for AI analysis / AI 분석을 위해 쿼리 결과로 컨텍스트 구성
        const contextData = `\n\n--- LIVE AWS RESOURCE DATA (${queryResult.rowCount} rows) ---\nSQL: ${sql}\n\`\`\`json\n${queryResult.data}\n\`\`\``;
        const bedrockMessages = messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content }));
        bedrockMessages[bedrockMessages.length - 1].content += contextData;

        const body = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: bedrockMessages,
        });

        const response = await bedrockClient.send(new InvokeModelCommand({
          modelId, contentType: 'application/json', accept: 'application/json',
          body: new TextEncoder().encode(body),
        }));

        const result = JSON.parse(new TextDecoder().decode(response.body));
        return NextResponse.json({
          content: result.content?.[0]?.text || 'No response',
          model: modelKey || 'sonnet-4.6',
          via: `Bedrock + Steampipe (${queryResult.rowCount} rows)`,
          queriedResources: ['steampipe'],
          route,
        });
      }
      // SQL generation/execution failed, fall through to AgentCore / SQL 생성/실행 실패 시 AgentCore로 폴스루
      console.warn(`[AWS-Data] SQL failed after retries, falling through to AgentCore`);
    }

    // AgentCore Gateway routes (infra, iac, data, security, monitoring, cost, general)
    // AgentCore 게이트웨이 라우트 (인프라, IaC, 데이터, 보안, 모니터링, 비용, 일반)
    const gateway = ROUTE_TO_GATEWAY[route] || 'ops';
    const agentResponse = await invokeAgentCore(messages, gateway);

    if (agentResponse) {
      return NextResponse.json({
        content: agentResponse,
        model: 'sonnet-4.6',
        via: `AgentCore Runtime → ${ROUTE_DISPLAY[route]}`,
        queriedResources: [`${gateway}-gateway`],
        route,
      });
    }

    // Step 3: Fallback → Bedrock Direct (no tools) / 3단계: 폴백 → Bedrock 직접 호출 (도구 없음)
    console.warn(`[Fallback] AgentCore failed for route=${route}, falling back to Bedrock Direct`);
    const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
    });

    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId, contentType: 'application/json', accept: 'application/json',
      body: new TextEncoder().encode(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(response.body));
    return NextResponse.json({
      content: result.content?.[0]?.text || 'No response',
      model: modelKey || 'sonnet-4.6',
      via: `Bedrock Direct (fallback from ${ROUTE_DISPLAY[route]})`,
      queriedResources: [],
      route,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 });
  }
}
