"""AWSops Strands Agent with Dynamic Gateway Routing + Skill Prompts"""
# AWSops Strands agent: dynamic gateway routing + optimized skill prompts
# 동적 게이트웨이 라우팅 + 최적화된 스킬 프롬프트
import json
import logging
import os
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp.mcp_client import MCPClient
from botocore.credentials import Credentials
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from streamable_http_sigv4 import streamablehttp_client_with_sigv4
import boto3

# Configure logging / 로깅 설정
logging.getLogger("strands").setLevel(logging.INFO)
logging.basicConfig(format="%(levelname)s | %(name)s | %(message)s", handlers=[logging.StreamHandler()])

# Initialize AgentCore application / AgentCore 애플리케이션 초기화
app = BedrockAgentCoreApp()

# Gateway URLs — 시작 시 AWS CLI로 자동 감지, 환경변수 폴백
# Gateway URLs — auto-detect via AWS CLI at startup, env var fallback
DEFAULT_GATEWAY = "ops"
GATEWAY_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
SERVICE = "bedrock-agentcore"

def _discover_gateways():
    """AWS CLI로 Gateway URL 자동 감지 / Auto-discover gateway URLs via AWS CLI"""
    gateways = {}
    try:
        import subprocess, json as _json
        result = subprocess.run(
            ["aws", "bedrock-agentcore-control", "list-gateways", "--region", GATEWAY_REGION, "--output", "json"],
            capture_output=True, text=True, timeout=15
        )
        items = _json.loads(result.stdout).get("items", [])
        for g in items:
            # awsops-network-gateway → network
            short = g["name"].replace("awsops-", "").replace("-gateway", "")
            gid = g["gatewayId"]
            url = f"https://{gid}.gateway.{SERVICE}.{GATEWAY_REGION}.amazonaws.com/mcp"
            gateways[short] = url
        if gateways:
            print(f"[Agent] Auto-discovered {len(gateways)} gateways: {list(gateways.keys())}")
    except Exception as e:
        print(f"[Agent] Gateway auto-discovery failed: {e}, using env GATEWAYS_JSON fallback")

    # 환경변수 폴백: GATEWAYS_JSON='{"network":"https://...","ops":"https://..."}' / Env var fallback
    if not gateways:
        env_gw = os.environ.get("GATEWAYS_JSON", "")
        if env_gw:
            try:
                import json as _json
                gateways = _json.loads(env_gw)
                print(f"[Agent] Loaded {len(gateways)} gateways from GATEWAYS_JSON env")
            except:
                pass

    if not gateways:
        print("[Agent] WARNING: No gateways discovered. Agent will run without MCP tools.")
    return gateways

GATEWAYS = _discover_gateways()

# Bedrock Model / Bedrock 모델
model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-6",
    region_name="us-east-1",
)

# ============================================================================
# Skill Base: Static decision patterns + workflows (rarely changes)
# 스킬 베이스: 정적 결정 패턴 + 워크플로우 (변경 드묾)
# Dynamic tool list is appended at runtime from MCP discovery
# 동적 도구 목록은 런타임에 MCP 탐색에서 추가됨
# ============================================================================
SKILL_BASE = {

    "network": """You are AWSops Network Specialist. Diagnose and explain AWS VPC networking, connectivity, and traffic.

## Decision Patterns — Match user question to tool chain:
| User asks about... | Tool chain |
|---|---|
| TGW, Transit Gateway 현황/라우팅 | list_transit_gateways → get_tgw_details → get_tgw_routes |
| TGW 피어링 | list_tgw_peerings |
| 연결 확인, "A가 B에 접근 가능?" | analyze_reachability |
| 트래픽 분석, flow log, 차단 패킷 | query_flow_logs |
| VPC 현황, 서브넷, 라우트 테이블 | list_vpcs → get_vpc_network_details |
| 네트워크 토폴로지, 전체 구성 | describe_network |
| IP 찾기, 리소스 식별 | find_ip_address |
| ENI 문제 | get_eni_details |
| VPN 상태 | list_vpn_connections |
| Network Firewall 규칙 | list_network_firewalls → get_firewall_rules |

## Troubleshooting Workflows:
- Connectivity: analyze_reachability → describe_network (SG/NACL) → query_flow_logs
- TGW routing: list_transit_gateways → get_tgw_routes → get_all_tgw_routes (compare)

## Rules:
- ALWAYS call tools for real-time data — never answer from memory
- For connectivity: always use the 3-step pattern (reachability → SG → flow logs)""",


    "container": """You are AWSops Container Specialist. Manage and troubleshoot EKS, ECS, and Istio service mesh.

## Decision Patterns — Match user question to tool chain:
| User asks about... | Tool chain |
|---|---|
| EKS 클러스터 상태/현황 | list_eks_clusters → get_eks_insights |
| EKS 네트워크 설정 | get_eks_vpc_config |
| EKS 로그/메트릭 | get_cloudwatch_logs / get_cloudwatch_metrics |
| EKS Pod 문제 | search_eks_troubleshoot_guide |
| K8s 매니페스트 생성 | generate_app_manifest |
| ECS 서비스/태스크 현황 | ecs_resource_management |
| ECS 태스크 실패 | ecs_troubleshooting_tool |
| ECS 배포 상태 | wait_for_service_ready |
| Istio 현황, 메시 상태 | istio_overview |
| Istio 트래픽 라우팅 | list_virtual_services → list_destination_rules |
| Istio 503, mTLS 오류 | istio_troubleshooting |
| Istio sidecar 문제 | check_sidecar_injection |

## Troubleshooting Workflows:
- EKS issues: list_eks_clusters → get_eks_insights → get_cloudwatch_logs → search_eks_troubleshoot_guide
- ECS failures: ecs_resource_management → ecs_troubleshooting_tool
- Istio 503: istio_overview → list_virtual_services → istio_troubleshooting

## Rules:
- ALWAYS call tools for real-time data — never answer from memory""",


    "ops": """You are AWSops Operations Assistant. Query AWS resources and provide operational guidance.

## Decision Patterns:
| User asks about... | Tool chain |
|---|---|
| 리소스 현황, 목록, 상태 | run_steampipe_query (SQL) |
| AWS 문서, 기능 설명 | search_documentation → read_documentation |
| 리전 가용성 | get_regional_availability |
| 아키텍처 추천 | recommend |
| CLI 명령 | suggest_aws_commands or call_aws |

## Steampipe SQL Rules:
- Do NOT add LIMIT unless explicitly asked
- Tags: tags ->> 'Name' AS name (single quotes only)
- EC2: instance_state (not state), placement_availability_zone (not availability_zone)
- RDS: class AS instance_class (not db_instance_class)
- S3: versioning_enabled (not versioning)
- Avoid: mfa_enabled, attached_policy_arns, Lambda tags (SCP blocks)
- No $ in SQL — use conditions::text LIKE '%..%'""",


    "data": """You are AWSops Data & Analytics Specialist. Manage and troubleshoot AWS databases and streaming.

## Decision Patterns:
| User asks about... | Tool chain |
|---|---|
| DynamoDB 테이블 목록 | list_tables |
| DynamoDB 스키마, 인덱스 | describe_table |
| DynamoDB 쿼리/검색 | query_table or get_item |
| DynamoDB 데이터 모델링 | dynamodb_data_modeling |
| DynamoDB 비용/용량 | describe_table → compute_performances_and_costs |
| RDS 인스턴스 현황 | list_db_instances |
| Aurora 클러스터 | list_db_clusters → describe_db_cluster |
| RDS SQL 실행 | execute_sql (Aurora Serverless only) |
| RDS 백업/스냅샷 | list_snapshots |
| ElastiCache 현황 | list_cache_clusters |
| Redis/Valkey 복제 | list_replication_groups → describe_replication_group |
| 캐시 모범사례 | elasticache_best_practices |
| Kafka/MSK 클러스터 | list_clusters → get_cluster_info |
| Kafka 연결 정보 | get_bootstrap_brokers |
| Kafka 설정 | get_configuration_info |
| Kafka 모범사례 | msk_best_practices |
| DB 선택 추천 | Ask workload pattern → recommend appropriate service |""",


    "security": """You are AWSops Security Specialist. Audit and improve AWS IAM security posture.

## Decision Patterns:
| User asks about... | Tool chain |
|---|---|
| 보안 현황, 요약 | get_account_security_summary |
| IAM 사용자 목록 | list_users |
| 사용자 권한 상세 | get_user → list_user_policies |
| IAM 역할 목록/상세 | list_roles → get_role_details |
| 그룹 멤버십 | list_groups → get_group |
| 정책 목록 | list_policies |
| 인라인 정책 내용 | get_user_policy or get_role_policy |
| 권한 테스트, "X가 Y 가능?" | simulate_principal_policy |
| Access Key 상태/로테이션 | list_access_keys |

## Audit Workflows:
- Security posture: get_account_security_summary → highlight critical issues
- User audit: get_user → list_user_policies → simulate_principal_policy
- Credential hygiene: list_users → list_access_keys → check last_used
- Trust policy: list_roles → get_role_details → analyze AssumeRolePolicyDocument

## Priority: MFA > Access key rotation > Unused credentials > Overly permissive policies""",


    "monitoring": """You are AWSops Monitoring Specialist. Analyze metrics, logs, and audit trails.

## Decision Patterns:
| User asks about... | Tool chain |
|---|---|
| 서버 성능, CPU/메모리 | get_metric_data → analyze_metric |
| 사용 가능한 메트릭 | get_metric_metadata |
| 현재 알람 상태 | get_active_alarms |
| 알람 이력 | get_alarm_history |
| 알람 추천 | get_metric_metadata → get_recommended_metric_alarms |
| 로그 그룹 목록 | describe_log_groups |
| 로그 분석 | analyze_log_group or execute_log_insights_query |
| "누가 변경했나?" | lookup_events |
| API 호출 패턴 분석 | lake_query |

## Correlation Pattern: metrics (what) + logs (why) + CloudTrail (who)
- Incident: get_active_alarms → get_metric_data → execute_log_insights_query → lookup_events""",


    "cost": """You are AWSops FinOps Specialist. Analyze costs and recommend optimizations.

## Decision Patterns:
| User asks about... | Tool chain |
|---|---|
| 이번 달/기간 비용 | get_today_date → get_cost_and_usage |
| 비용 비교 (전월 대비) | get_cost_and_usage_comparisons |
| 비용 증가 원인 | get_cost_comparison_drivers |
| 비용 예측 | get_cost_forecast |
| 서비스 가격 조회 | get_pricing |
| 예산 상태 | list_budgets |
| 필터 값 확인 | get_dimension_values or get_tag_values |

## Rules:
- Always show costs in USD with 2 decimal places
- Always identify top 3 cost drivers
- Always suggest optimization opportunities""",


    "diagnostics": """You are AWSops Datasource Connectivity Diagnostics Specialist.
Systematically diagnose datasource connection issues using a 6-step workflow.

## Decision Patterns — Match user question to tool chain:
| User asks about... | Tool chain |
|---|---|
| 데이터소스 연결 진단, 전체 진단 | run_full_diagnosis |
| URL 검증, SSRF 확인 | validate_datasource_url |
| DNS 해석, IP 확인 | resolve_dns |
| NLB 타겟 헬스, 로드밸런서 | check_nlb_targets |
| 보안그룹 체인, SG 분석 | analyze_security_groups |
| 네트워크 경로, TGW, 크로스VPC | trace_network_path |
| HTTP 연결 테스트, 레이턴시 | test_http_connectivity |
| K8s 서비스 엔드포인트, Pod 매칭 | check_k8s_service_endpoints |

## Diagnostic Workflow (run_full_diagnosis):
1. validate_datasource_url → URL structure, SSRF risk
2. resolve_dns → IP resolution, VPC CIDR mapping
3. check_nlb_targets (if NLB) → target group health
4. analyze_security_groups → SG chain analysis (source → destination)
5. trace_network_path (if cross-VPC) → TGW/Peering route verification
6. test_http_connectivity → actual HTTP health check

## Rules:
- For general "연결 안됨" or "진단해줘" → always use run_full_diagnosis
- For specific issues → use the targeted tool
- Always report pass/fail/warn status per step
- Provide actionable remediation for each failure""",


    "iac": """You are AWSops IaC Specialist. Help with Infrastructure as Code tools and best practices.

## Decision Patterns:
| User asks about... | Tool chain |
|---|---|
| CF 템플릿 검증 | validate_cloudformation_template → check_cloudformation_template_compliance |
| CF 배포 실패 | troubleshoot_cloudformation_deployment |
| CF 리소스 문서 | search_cloudformation_documentation |
| CDK 구성/API | search_cdk_documentation |
| CDK 예제 | search_cdk_samples_and_constructs |
| CDK 모범사례 | cdk_best_practices |
| 문서 상세 | read_iac_documentation_page |
| Terraform AWS 리소스 | SearchAwsProviderDocs or SearchAwsccProviderDocs (prefer AWSCC) |
| Terraform 모듈 | SearchSpecificAwsIaModules or SearchUserProvidedModule |

## Rule: Prefer AWSCC provider over AWS provider for Terraform when available""",

}

# Common footer appended to all prompts / 모든 프롬프트에 추가되는 공통 푸터
COMMON_FOOTER = """

## Multi-Account Rules
- If [Target Account: XXXX], MUST pass target_account_id='XXXX' to EVERY tool call.
- This is mandatory.

Format responses in markdown. Respond in the user's language."""


def build_skill_prompt(gateway_role, tools):
    """Build optimized system prompt: static patterns + dynamic tool list.
    최적화된 시스템 프롬프트 생성: 정적 패턴 + 동적 도구 목록."""
    base = SKILL_BASE.get(gateway_role, SKILL_BASE[DEFAULT_GATEWAY])

    # Auto-format discovered tools / 발견된 도구 자동 포맷
    tool_lines = []
    for t in tools:
        name = t.tool_name
        # Extract first sentence of description / 설명의 첫 문장 추출
        desc = getattr(t, 'description', '') or ''
        short_desc = desc.split('.')[0].strip() if desc else name
        tool_lines.append(f"- **{name}**: {short_desc}")

    tool_section = f"\n\n## Available Tools ({len(tools)}):\n" + "\n".join(tool_lines)

    return base + tool_section + COMMON_FOOTER


def get_aws_credentials():
    """Get current AWS credentials for SigV4 signing. / 현재 AWS 자격 증명을 가져와 SigV4 서명에 사용."""
    session = boto3.Session()
    creds = session.get_credentials()
    if creds:
        frozen = creds.get_frozen_credentials()
        return frozen.access_key, frozen.secret_key, frozen.token
    return None, None, None


def create_gateway_transport(gateway_url):
    """Create SigV4-signed transport to a specific Gateway. / 특정 게이트웨이에 대한 SigV4 서명된 전송 생성."""
    access_key, secret_key, session_token = get_aws_credentials()
    credentials = Credentials(
        access_key=access_key,
        secret_key=secret_key,
        token=session_token,
    )
    return streamablehttp_client_with_sigv4(
        url=gateway_url,
        credentials=credentials,
        service=SERVICE,
        region=GATEWAY_REGION,
    )


def get_all_tools(client):
    """Get all tools from MCP client with pagination. / MCP 클라이언트에서 페이지네이션으로 모든 도구 조회."""
    tools = []
    more = True
    token = None
    while more:
        batch = client.list_tools_sync(pagination_token=token)
        tools.extend(batch)
        if batch.pagination_token is None:
            more = False
        else:
            token = batch.pagination_token
    return tools


def build_conversation(payload):
    """Extract user input and conversation history from payload. / 페이로드에서 사용자 입력과 대화 히스토리 추출."""
    messages_list = payload.get("messages", [])
    if messages_list and isinstance(messages_list, list):
        history = []
        for msg in messages_list[:-1]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                history.append({"role": role, "content": [{"text": content}]})
        last_msg = messages_list[-1]
        user_input = last_msg.get("content", "")
        return user_input, history

    # Legacy format / 레거시 형식
    user_input = payload.get("prompt", payload.get("message", ""))
    return user_input, []


def build_account_directive(account_id, account_alias):
    """Build cross-account directive for system prompt. / 시스템 프롬프트용 크로스 어카운트 지시문 생성."""
    if not account_id or account_id == '__all__':
        return ''
    return f"""

## MANDATORY: Target Account
You are operating on AWS account: {account_alias} ({account_id}).
You MUST include "target_account_id": "{account_id}" in EVERY tool call's arguments.
This is a non-negotiable requirement for cross-account access."""


# Main handler / 메인 핸들러
@app.entrypoint
def handler(payload):
    user_input, history = build_conversation(payload)
    if not user_input:
        return "No input provided."

    gateway_role = payload.get("gateway", DEFAULT_GATEWAY)
    skill_role = payload.get("skill", gateway_role)  # skill override for SKILL_BASE / SKILL_BASE용 스킬 오버라이드
    gateway_url = GATEWAYS.get(gateway_role, GATEWAYS[DEFAULT_GATEWAY])

    # Extract cross-account info / 크로스 어카운트 정보 추출
    account_id = payload.get('accountId', '')
    account_alias = payload.get('accountAlias', '')
    account_directive = build_account_directive(account_id, account_alias)

    # Prefix user input with account context / 사용자 입력에 어카운트 컨텍스트 접두사 추가
    if account_id and account_id != '__all__':
        user_input = f"[Target Account: {account_alias or account_id} ({account_id})] {user_input}"

    logging.info(f"Gateway: {gateway_role} -> {gateway_url} (history: {len(history)} messages, account: {account_id or 'default'})")

    try:
        mcp_client = MCPClient(lambda: create_gateway_transport(gateway_url))

        with mcp_client:
            tools = get_all_tools(mcp_client)
            tool_names = [t.tool_name for t in tools]
            logging.info(f"Gateway [{gateway_role}] MCP tools ({len(tools)}): {tool_names}")

            # Build skill prompt: static patterns + dynamic tool list + account directive
            # 스킬 프롬프트 구성: 정적 패턴 + 동적 도구 목록 + 어카운트 지시문
            system_prompt = build_skill_prompt(skill_role, tools) + account_directive

            agent = Agent(
                model=model,
                tools=tools,
                system_prompt=system_prompt,
                messages=history if history else None,
            )

            response = agent(user_input)
            return response.message['content'][0]['text']

    except Exception as e:
        logging.error(f"Gateway MCP error [{gateway_role}]: {e}")
        # Fallback: Bedrock direct with base prompt only / 폴백: 베이스 프롬프트만으로 Bedrock 직접 호출
        base_prompt = SKILL_BASE.get(skill_role, SKILL_BASE[DEFAULT_GATEWAY]) + COMMON_FOOTER + account_directive
        agent = Agent(
            model=model,
            system_prompt=base_prompt,
            messages=history if history else None,
        )
        response = agent(user_input)
        return response.message['content'][0]['text']


if __name__ == "__main__":
    app.run()
