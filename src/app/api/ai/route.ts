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

// AgentCore Runtime invoke with conversation history / 대화 히스토리를 포함한 AgentCore Runtime 호출
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
    return text;
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

    // AgentCore Gateway routes (infra, iac, data, security, monitoring, cost, aws-data, general)
    // AgentCore 게이트웨이 라우트 (인프라, IaC, 데이터, 보안, 모니터링, 비용, AWS데이터, 일반)
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
