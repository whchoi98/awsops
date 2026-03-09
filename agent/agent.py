"""AWSops Strands Agent with Dynamic Gateway Routing"""
# AWSops Strands agent with dynamic gateway routing / AWSops Strands 에이전트 - 동적 게이트웨이 라우팅
import json
import logging
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp.mcp_client import MCPClient
from botocore.credentials import Credentials
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from streamable_http_sigv4 import streamablehttp_client_with_sigv4
import boto3

# Configure logging for Strands framework / Strands 프레임워크 로깅 설정
logging.getLogger("strands").setLevel(logging.INFO)
logging.basicConfig(format="%(levelname)s | %(name)s | %(message)s", handlers=[logging.StreamHandler()])

# Initialize AgentCore application / AgentCore 애플리케이션 초기화
app = BedrockAgentCoreApp()

# Gateway URLs by role (route.ts selects which one to use) / 역할별 게이트웨이 URL (route.ts에서 사용할 게이트웨이 선택)
# Each gateway connects to a dedicated MCP server with role-specific tools / 각 게이트웨이는 역할별 전용 MCP 도구가 있는 서버에 연결
GATEWAYS = {
    "infra": "https://awsops-infra-gateway-nipql9oohq.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",    # Network, EKS, ECS, Istio tools / 네트워크, EKS, ECS, Istio 도구
    "ops": "https://awsops-ops-gateway-ybcvjkwu71.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",        # Steampipe, AWS Knowledge, Core tools / Steampipe, AWS 지식, 코어 도구
    "iac": "https://awsops-iac-gateway-i0vlfltmwu.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",        # CDK, CloudFormation, Terraform tools / CDK, CloudFormation, Terraform 도구
    "cost": "https://awsops-cost-gateway-uanqtckgzm.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",      # Cost Explorer, Pricing, Budgets tools / 비용 탐색기, 가격, 예산 도구
    "monitoring": "https://awsops-monitoring-gateway-lal7vj9ozv.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",  # CloudWatch, CloudTrail tools / CloudWatch, CloudTrail 도구
    "security": "https://awsops-security-gateway-orxxph0a0s.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",      # IAM, Policy Simulation tools / IAM, 정책 시뮬레이션 도구
    "data": "https://awsops-data-gateway-vnm22bj3ji.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",              # DynamoDB, RDS, ElastiCache, MSK tools / DynamoDB, RDS, ElastiCache, MSK 도구
}
DEFAULT_GATEWAY = "ops"          # Default gateway when no specific role matched / 특정 역할이 매칭되지 않을 때 기본 게이트웨이
GATEWAY_REGION = "ap-northeast-2"  # AWS region for gateway endpoints / 게이트웨이 엔드포인트의 AWS 리전
SERVICE = "bedrock-agentcore"      # AWS service name for SigV4 signing / SigV4 서명에 사용할 AWS 서비스 이름

# Bedrock Model - Sonnet 4.6 in us-east-1 (cross-region inference) / Bedrock 모델 - us-east-1의 Sonnet 4.6 (교차 리전 추론)
model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-6",
    region_name="us-east-1",
)

# Role-specific system prompts: each gateway role has a tailored prompt / 역할별 시스템 프롬프트: 각 게이트웨이 역할에 맞춤형 프롬프트 제공
# The prompt tells the AI what tools are available and how to behave / 프롬프트는 AI에게 사용 가능한 도구와 동작 방식을 알려줌
SYSTEM_PROMPTS = {
    # Infrastructure specialist: network, EKS, ECS, Istio / 인프라 전문가: 네트워크, EKS, ECS, Istio
    "infra": """You are AWSops Infrastructure Specialist, an expert in AWS networking, EKS, and infrastructure troubleshooting.
You have MCP tools for:
- VPC Reachability Analyzer: analyze network paths between resources
- Flow Monitor: query VPC flow logs for traffic analysis
- Network MCP: describe security groups, NACLs, route tables, subnets, VPCs
- EKS MCP: list clusters, VPC config, insights, CloudWatch logs/metrics, IAM roles, app manifests, troubleshooting
- ECS MCP: list/describe clusters, services, tasks, task definitions, ECR repos, troubleshoot (events, failures, logs, network, image pull)
- Istio MCP: VirtualService, DestinationRule, Gateway, ServiceEntry, AuthorizationPolicy, PeerAuthentication, sidecar injection, EnvoyFilter, CRDs, troubleshooting (503, mTLS, connectivity)
Always be concise, provide actionable insights. Format in markdown. Respond in the user's language.""",

    # Operations assistant: Steampipe SQL, AWS docs, CLI / 운영 어시스턴트: Steampipe SQL, AWS 문서, CLI
    "ops": """You are AWSops Operations Assistant, an expert in AWS cloud operations.
You have MCP tools for:
- Steampipe Query: execute SQL against 580+ AWS resource tables
- AWS Knowledge: search documentation, check regional availability
- Core MCP: execute AWS CLI commands, get solution design guidance
Always be concise, provide actionable insights. Format in markdown. Respond in the user's language.""",

    # Data & analytics specialist: DynamoDB, RDS, ElastiCache, MSK / 데이터 및 분석 전문가: DynamoDB, RDS, ElastiCache, MSK
    "data": """You are AWSops Data & Analytics Specialist, an expert in AWS databases and streaming.
You have MCP tools for:
- DynamoDB: list/describe tables, query/scan, data modeling guidance, cost estimation
- RDS: list/describe instances and clusters (MySQL/PostgreSQL/Aurora), SQL via Data API
- ElastiCache/Valkey: clusters, replication groups, serverless caches, best practices
- MSK Kafka: clusters, brokers, configurations, bootstrap endpoints, best practices
Always recommend the right database for the workload. Format in markdown. Respond in the user's language.""",

    # Security specialist: IAM, policy simulation / 보안 전문가: IAM, 정책 시뮬레이션
    "security": """You are AWSops Security Specialist, an expert in AWS IAM and security.
You have MCP tools for:
- IAM: list/get users, roles, groups, policies, access keys, MFA status
- Policy Simulation: test permissions before applying
- Security Summary: account-level IAM security posture
Focus on least-privilege, MFA enforcement, unused credentials, and overly permissive policies.
Format in markdown. Respond in the user's language.""",

    # Monitoring specialist: CloudWatch metrics/logs, CloudTrail audit / 모니터링 전문가: CloudWatch 메트릭/로그, CloudTrail 감사
    "monitoring": """You are AWSops Monitoring Specialist, an expert in AWS observability and troubleshooting.
You have MCP tools for:
- CloudWatch: get metric data/metadata, analyze trends, active alarms, alarm history, log groups, log analysis, Log Insights queries
- CloudTrail: lookup API events by user/resource/time, CloudTrail Lake SQL analytics
Always correlate metrics with events for root cause analysis. Format in markdown. Respond in the user's language.""",

    # FinOps specialist: cost analysis, pricing, budgets / FinOps 전문가: 비용 분석, 가격, 예산
    "cost": """You are AWSops FinOps Specialist, an expert in AWS cost optimization and financial operations.
You have MCP tools for:
- Cost Explorer: get cost/usage data, compare periods, analyze cost drivers, forecast
- Pricing: look up AWS service pricing
- Budgets: check budget status and forecasted spend
Always provide costs in USD with 2 decimal places. Identify optimization opportunities.
Format in markdown. Respond in the user's language.""",

    # IaC specialist: CDK, CloudFormation, Terraform / IaC 전문가: CDK, CloudFormation, Terraform
    "iac": """You are AWSops IaC Specialist, an expert in Infrastructure as Code.
You have MCP tools for:
- CloudFormation: validate templates, check compliance, troubleshoot deployments, search docs
- CDK: search documentation, samples, constructs, best practices
- Terraform: search AWS/AWSCC provider docs, analyze Registry modules, best practices
Always be concise, provide actionable insights. Format in markdown. Respond in the user's language.""",

}


def get_aws_credentials():
    """Get current AWS credentials for SigV4 signing. / 현재 AWS 자격 증명을 가져와 SigV4 서명에 사용."""
    session = boto3.Session()
    creds = session.get_credentials()
    if creds:
        # Freeze credentials to get immutable snapshot / 불변 스냅샷을 얻기 위해 자격 증명 고정
        frozen = creds.get_frozen_credentials()
        return frozen.access_key, frozen.secret_key, frozen.token
    return None, None, None


def create_gateway_transport(gateway_url):
    """Create SigV4-signed transport to a specific Gateway. / 특정 게이트웨이에 대한 SigV4 서명된 전송 생성."""
    # Retrieve current AWS credentials / 현재 AWS 자격 증명 조회
    access_key, secret_key, session_token = get_aws_credentials()
    # Build botocore Credentials object for SigV4 signing / SigV4 서명을 위한 botocore Credentials 객체 구성
    credentials = Credentials(
        access_key=access_key,
        secret_key=secret_key,
        token=session_token,
    )
    # Return MCP StreamableHTTP transport with SigV4 authentication / SigV4 인증이 포함된 MCP StreamableHTTP 전송 반환
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
    # Paginate through all available MCP tools / 사용 가능한 모든 MCP 도구를 페이지 단위로 순회
    while more:
        batch = client.list_tools_sync(pagination_token=token)
        tools.extend(batch)
        # Check if there are more pages / 추가 페이지가 있는지 확인
        if batch.pagination_token is None:
            more = False
        else:
            token = batch.pagination_token
    return tools


# Build Strands messages from conversation history / 대화 히스토리에서 Strands 메시지 구성
# Converts route.ts messages array to Strands Agent format / route.ts 메시지 배열을 Strands Agent 형식으로 변환
def build_conversation(payload):
    """Extract user input and conversation history from payload. / 페이로드에서 사용자 입력과 대화 히스토리 추출.
    Supports both new format (messages array) and legacy format (prompt string). / 새 형식 (messages 배열)과 레거시 형식 (prompt 문자열) 모두 지원."""
    messages_list = payload.get("messages", [])
    if messages_list and isinstance(messages_list, list):
        # New format: full conversation history / 새 형식: 전체 대화 히스토리
        # Build history (all except last) + current user input (last message) / 히스토리 (마지막 제외) + 현재 사용자 입력 (마지막 메시지)
        history = []
        for msg in messages_list[:-1]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                history.append({"role": role, "content": [{"text": content}]})
        last_msg = messages_list[-1]
        user_input = last_msg.get("content", "")
        return user_input, history

    # Legacy format: single prompt string / 레거시 형식: 단일 프롬프트 문자열
    user_input = payload.get("prompt", payload.get("message", ""))
    return user_input, []


# Main handler: AgentCore Runtime entrypoint / 메인 핸들러: AgentCore Runtime 진입점
# Receives payload from route.ts with messages array and gateway role / route.ts에서 메시지 배열과 게이트웨이 역할이 포함된 페이로드 수신
@app.entrypoint
def handler(payload):
    # Extract conversation history and current input / 대화 히스토리와 현재 입력 추출
    user_input, history = build_conversation(payload)
    if not user_input:
        return "No input provided."

    # Select gateway based on payload (route.ts sets this) / 페이로드 기반으로 게이트웨이 선택 (route.ts에서 설정)
    gateway_role = payload.get("gateway", DEFAULT_GATEWAY)
    # Look up the gateway URL and system prompt for the selected role / 선택된 역할에 대한 게이트웨이 URL과 시스템 프롬프트 조회
    gateway_url = GATEWAYS.get(gateway_role, GATEWAYS[DEFAULT_GATEWAY])
    system_prompt = SYSTEM_PROMPTS.get(gateway_role, SYSTEM_PROMPTS[DEFAULT_GATEWAY])

    logging.info(f"Gateway: {gateway_role} -> {gateway_url} (history: {len(history)} messages)")

    try:
        # Create MCP client with SigV4-signed transport to the selected gateway / 선택된 게이트웨이에 SigV4 서명 전송으로 MCP 클라이언트 생성
        mcp_client = MCPClient(lambda: create_gateway_transport(gateway_url))

        with mcp_client:
            # Discover all available tools from the gateway / 게이트웨이에서 사용 가능한 모든 도구 탐색
            tools = get_all_tools(mcp_client)
            tool_names = [t.tool_name for t in tools]
            logging.info(f"Gateway [{gateway_role}] MCP tools ({len(tools)}): {tool_names}")

            # Create Strands Agent with model, tools, role-specific prompt, and history / 모델, 도구, 역할별 프롬프트, 히스토리로 Strands Agent 생성
            agent = Agent(
                model=model,
                tools=tools,
                system_prompt=system_prompt,
                messages=history if history else None,
            )

            # Invoke the agent with current user input / 현재 사용자 입력으로 에이전트 호출
            response = agent(user_input)
            return response.message['content'][0]['text']

    except Exception as e:
        logging.error(f"Gateway MCP error [{gateway_role}]: {e}")
        # Fallback: run without MCP tools (Bedrock direct) / 폴백: MCP 도구 없이 실행 (Bedrock 직접 호출)
        agent = Agent(
            model=model,
            system_prompt=system_prompt,
            messages=history if history else None,
        )
        response = agent(user_input)
        return response.message['content'][0]['text']


if __name__ == "__main__":
    # Start the AgentCore Runtime application / AgentCore Runtime 애플리케이션 시작
    app.run()
