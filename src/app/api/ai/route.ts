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

const BEDROCK_REGION = 'us-east-1';
const AGENTCORE_REGION = 'ap-northeast-2';
const AGENT_RUNTIME_ARN = 'arn:aws:bedrock-agentcore:ap-northeast-2:605134447633:runtime/awsops_agent-zMwFdo9X4Y';
const CODE_INTERPRETER_ID = 'awsops_code_interpreter-pnEkzLpDfH';

const MODELS: Record<string, string> = {
  'sonnet-4.6': 'us.anthropic.claude-sonnet-4-6',
  'opus-4.6': 'us.anthropic.claude-opus-4-6-v1',
};

const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const agentCoreClient = new BedrockAgentCoreClient({ region: AGENTCORE_REGION });

const SYSTEM_PROMPT = `You are AWSops AI Assistant, an expert in AWS cloud operations.
You help users understand and manage their AWS infrastructure.
You have access to real-time AWS resource data via Steampipe queries.
When users ask about their resources, analyze the data provided.
Always be concise and provide actionable insights.
Format responses in markdown for readability.
When discussing security issues, prioritize them by severity.
Respond in the same language as the user's question.`;

async function queryAWS(sql: string): Promise<string> {
  try {
    const result = await runQuery(sql);
    if (result.error) return `Query error: ${result.error}`;
    if (result.rows.length === 0) return 'No results found.';
    return JSON.stringify(result.rows.slice(0, 20), null, 2);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function detectQueries(message: string): Record<string, string> {
  const queries: Record<string, string> = {};
  const lower = message.toLowerCase();
  if (lower.includes('ec2') || lower.includes('instance') || lower.includes('서버'))
    queries.ec2 = "SELECT instance_id, tags ->> 'Name' AS name, instance_type, instance_state, private_ip_address, public_ip_address FROM aws_ec2_instance ORDER BY instance_state";
  if (lower.includes('s3') || lower.includes('bucket') || lower.includes('스토리지'))
    queries.s3 = "SELECT name, region, versioning_enabled, bucket_policy_is_public FROM aws_s3_bucket";
  if (lower.includes('rds') || lower.includes('database') || lower.includes('db') || lower.includes('데이터베이스'))
    queries.rds = "SELECT db_instance_identifier, engine, engine_version, class AS instance_class, status, allocated_storage, multi_az FROM aws_rds_db_instance";
  if (lower.includes('vpc') || lower.includes('network') || lower.includes('네트워크'))
    queries.vpc = "SELECT vpc_id, cidr_block, state, tags ->> 'Name' AS name FROM aws_vpc";
  if (lower.includes('lambda') || lower.includes('함수') || lower.includes('serverless'))
    queries.lambda = "SELECT name, runtime, memory_size, timeout FROM aws_lambda_function";
  if (lower.includes('security') || lower.includes('보안') || lower.includes('sg'))
    queries.security = "SELECT group_id, group_name, vpc_id FROM aws_vpc_security_group LIMIT 20";
  if (lower.includes('iam') || lower.includes('user') || lower.includes('role') || lower.includes('사용자'))
    queries.iam = "SELECT name, arn, create_date FROM aws_iam_user UNION ALL SELECT name, arn, create_date FROM aws_iam_role LIMIT 20";
  if (lower.includes('cost') || lower.includes('비용') || lower.includes('billing'))
    queries.cost = "SELECT service AS name, ROUND(CAST(SUM(unblended_cost_amount) AS numeric), 2) AS value FROM aws_cost_by_service_monthly WHERE period_start >= (CURRENT_DATE - INTERVAL '1 month') GROUP BY service HAVING SUM(unblended_cost_amount) > 0 ORDER BY value DESC LIMIT 15";
  if (lower.includes('k8s') || lower.includes('kubernetes') || lower.includes('eks') || lower.includes('pod'))
    queries.k8s = "SELECT name, namespace, phase, node_name FROM kubernetes_pod WHERE phase = 'Running' LIMIT 20";
  if (lower.includes('elb') || lower.includes('load balancer') || lower.includes('로드밸런서'))
    queries.elb = "SELECT name, type, scheme, state_code, vpc_id, dns_name FROM aws_ec2_application_load_balancer";
  if (Object.keys(queries).length === 0 && (lower.includes('현황') || lower.includes('overview') || lower.includes('summary') || lower.includes('리소스') || lower.includes('전체')))
    queries.overview = "SELECT 'EC2' AS resource, COUNT(*) AS count FROM aws_ec2_instance UNION ALL SELECT 'VPC', COUNT(*) FROM aws_vpc UNION ALL SELECT 'RDS', COUNT(*) FROM aws_rds_db_instance UNION ALL SELECT 'Lambda', COUNT(*) FROM aws_lambda_function UNION ALL SELECT 'S3', COUNT(*) FROM aws_s3_bucket";
  return queries;
}

// Code execution keywords → route to Code Interpreter
function needsCodeInterpreter(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = ['코드 실행', 'execute', 'run code', '계산'];
  return keywords.some(k => lower.includes(k));
}

// Extract python code blocks from AI response text
function extractPythonCode(text: string): string | null {
  const match = text.match(/```python\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

// Execute code via Code Interpreter
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

// Infrastructure keywords → route to Infra Gateway (network + EKS)
function needsInfra(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = ['eni','reachability','연결 확인','경로 분석','flow log','플로우','route table',
    '라우트','라우팅','security group rule','sg rule','보안그룹 규칙','vpn','트러블슈팅','troubleshoot',
    'network path','네트워크 경로','connectivity','연결성','find ip','ip 찾','ip 검색',
    'eks','kubernetes','k8s cluster','클러스터','node group','pod log','container insight',
    'ecs','fargate','task definition','태스크','서비스 이벤트','ecr','컨테이너'];
  return keywords.some(k => lower.includes(k));
}

// Monitoring keywords → route to Monitoring Gateway (CloudWatch + CloudTrail)
function needsMonitoring(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = ['cloudwatch','metric','메트릭','alarm','알람','경보','log group','로그 그룹',
    'log insights','cloudtrail','이벤트 조회','api 호출','audit','감사','누가','who did',
    'cpu utilization','memory utilization','disk','네트워크 트래픽'];
  return keywords.some(k => lower.includes(k));
}

// Cost keywords → route to Cost Gateway
function needsCost(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = ['cost','비용','billing','청구','forecast','예측','budget','예산',
    'pricing','가격','spend','지출','savings','절감','optimization','최적화',
    'cost explorer','월별','monthly cost','daily cost'];
  return keywords.some(k => lower.includes(k));
}

// IaC keywords → route to IaC Gateway (CDK, CloudFormation, Terraform)
function needsIaC(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = ['cdk','cloudformation','cfn','terraform','terragrunt','checkov',
    'infrastructure as code','iac','스택','template','모듈','module','provider',
    'cdk best practice','validate template','deploy stack'];
  return keywords.some(k => lower.includes(k));
}

// AWS resource overview keywords → Steampipe + Bedrock direct
function needsAWSData(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = ['ec2','s3','rds','vpc','lambda','iam','security','k8s','elb',
    'instance','bucket','서버','네트워크','보안','데이터베이스','현황','리소스','pod'];
  return keywords.some(k => lower.includes(k));
}

// AgentCore Runtime invoke with gateway selection
async function invokeAgentCore(message: string, gateway: 'infra' | 'ops' | 'iac' | 'cost' | 'monitoring' = 'ops'): Promise<string | null> {
  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: AGENT_RUNTIME_ARN,
      qualifier: 'DEFAULT',
      payload: JSON.stringify({ prompt: message, gateway }),
    });
    const response = await agentCoreClient.send(command);
    const sessionId = response.runtimeSessionId;
    const body = await streamToString(response.response);
    const text = body.startsWith('"') ? JSON.parse(body) : body;

    // Stop session to release microVM
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
  // AWS SDK v3 Streaming Blob
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

export async function POST(request: NextRequest) {
  try {
    const { messages, model: modelKey } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0)
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });

    const lastMessage = messages[messages.length - 1]?.content || '';
    const useCodeInterpreter = needsCodeInterpreter(lastMessage);
    const useInfra = needsInfra(lastMessage);
    const useIaC = needsIaC(lastMessage);
    const useMonitoring = needsMonitoring(lastMessage);
    const useCost = needsCost(lastMessage);
    const needsData = needsAWSData(lastMessage);

    // Route Code: Code execution request → Code Interpreter + AI analysis
    if (useCodeInterpreter) {
      // First, get AI to generate or process the code request
      const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
      const codeSystemPrompt = SYSTEM_PROMPT + `\n\nThe user wants to execute code. If they provide code, wrap it in a \`\`\`python code block. If they describe a task, generate Python code to accomplish it and wrap it in a \`\`\`python code block. Always include print statements to show results.`;

      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: codeSystemPrompt,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      });

      const aiResponse = await bedrockClient.send(new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body),
      }));

      const aiResult = JSON.parse(new TextDecoder().decode(aiResponse.body));
      const aiText = aiResult.content?.[0]?.text || '';

      // Extract and execute any Python code from the AI response
      const pythonCode = extractPythonCode(aiText) || extractPythonCode(lastMessage);
      if (pythonCode) {
        const codeResult = await executeCodeInterpreter(pythonCode);
        const executionBlock = `\n\n---\n**Code Execution Result** (exit code: ${codeResult.exitCode}):\n\`\`\`\n${codeResult.output}\n\`\`\``;

        return NextResponse.json({
          content: aiText + executionBlock,
          model: modelKey || 'sonnet-4.6',
          via: 'Bedrock + Code Interpreter',
          queriedResources: ['code-interpreter'],
          codeExecution: {
            output: codeResult.output,
            exitCode: codeResult.exitCode,
          },
        });
      }

      // No code block found, return AI response as-is
      return NextResponse.json({
        content: aiText,
        model: modelKey || 'sonnet-4.6',
        via: 'Bedrock (code request - no executable code generated)',
        queriedResources: [],
      });
    }

    // Route 0: Infrastructure (network + EKS) → AgentCore Runtime (Infra Gateway)
    if (useInfra) {
      const agentResponse = await invokeAgentCore(lastMessage, 'infra');
      if (agentResponse) {
        return NextResponse.json({
          content: agentResponse,
          model: 'sonnet-4.6',
          via: 'AgentCore Runtime → Infra Gateway (12 tools)',
          queriedResources: ['infra-gateway'],
        });
      }
      // Fall through to Bedrock if AgentCore fails
    }

    // Route 0.5: IaC questions → AgentCore Runtime (IaC Gateway)
    if (useIaC) {
      const agentResponse = await invokeAgentCore(lastMessage, 'iac');
      if (agentResponse) {
        return NextResponse.json({
          content: agentResponse,
          model: 'sonnet-4.6',
          via: 'AgentCore Runtime → IaC Gateway (16 tools)',
          queriedResources: ['iac-gateway'],
        });
      }
    }

    // Route 1: Monitoring → AgentCore Runtime (Monitoring Gateway)
    if (useMonitoring) {
      const agentResponse = await invokeAgentCore(lastMessage, 'monitoring');
      if (agentResponse) {
        return NextResponse.json({
          content: agentResponse,
          model: 'sonnet-4.6',
          via: 'AgentCore Runtime → Monitoring Gateway (16 tools)',
          queriedResources: ['monitoring-gateway'],
        });
      }
    }

    // Route 2: Cost questions → AgentCore Runtime (Cost Gateway)
    if (useCost) {
      const agentResponse = await invokeAgentCore(lastMessage, 'cost');
      if (agentResponse) {
        return NextResponse.json({
          content: agentResponse,
          model: 'sonnet-4.6',
          via: 'AgentCore Runtime → Cost Gateway (9 tools)',
          queriedResources: ['cost-gateway'],
        });
      }
    }

    // Route 2: AWS resource questions → Bedrock Direct + Steampipe data
    if (needsData) {
      const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
      const autoQueries = detectQueries(lastMessage);
      let contextData = '';

      if (Object.keys(autoQueries).length > 0) {
        const results: string[] = [];
        for (const [key, sql] of Object.entries(autoQueries)) {
          const data = await queryAWS(sql);
          results.push(`### ${key.toUpperCase()} Data:\n\`\`\`json\n${data}\n\`\`\``);
        }
        contextData = '\n\n--- LIVE AWS RESOURCE DATA ---\n' + results.join('\n\n');
      }

      const bedrockMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));
      if (contextData) bedrockMessages[bedrockMessages.length - 1].content += contextData;

      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: bedrockMessages,
      });

      const response = await bedrockClient.send(new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body),
      }));

      const result = JSON.parse(new TextDecoder().decode(response.body));
      const responseText = result.content?.[0]?.text || 'No response';

      // Check if response contains Python code that could be executed
      const pythonCodeInResponse = extractPythonCode(responseText);
      const codeInterpreterHint = pythonCodeInResponse
        ? '\n\n> **Tip**: This response contains Python code. Send a message with "코드 실행" or "execute" to run it.'
        : '';

      return NextResponse.json({
        content: responseText + codeInterpreterHint,
        model: modelKey || 'sonnet-4.6',
        via: 'Bedrock + Steampipe',
        queriedResources: Object.keys(autoQueries),
        hasExecutableCode: !!pythonCodeInResponse,
      });
    }

    // Route 2: General questions → AgentCore Runtime (Ops Gateway)
    const agentResponse = await invokeAgentCore(lastMessage, 'ops');
    if (agentResponse) {
      return NextResponse.json({
        content: agentResponse,
        model: 'sonnet-4.6',
        via: 'AgentCore Runtime → Ops Gateway (9 tools)',
        queriedResources: ['ops-gateway'],
      });
    }

    // Route 3: Fallback → Bedrock Direct
    const modelId = MODELS[modelKey || 'sonnet-4.6'] || MODELS['sonnet-4.6'];
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    });

    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId, contentType: 'application/json', accept: 'application/json',
      body: new TextEncoder().encode(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(response.body));
    return NextResponse.json({
      content: result.content?.[0]?.text || 'No response',
      model: modelKey || 'sonnet-4.6',
      via: 'Bedrock Direct',
      queriedResources: [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 });
  }
}
