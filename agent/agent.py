"""AWSops Strands Agent with Dynamic Gateway Routing"""
import json
import logging
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp.mcp_client import MCPClient
from botocore.credentials import Credentials
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from streamable_http_sigv4 import streamablehttp_client_with_sigv4
import boto3

logging.getLogger("strands").setLevel(logging.INFO)
logging.basicConfig(format="%(levelname)s | %(name)s | %(message)s", handlers=[logging.StreamHandler()])

app = BedrockAgentCoreApp()

# Gateway URLs by role (route.ts selects which one to use)
GATEWAYS = {
    "infra": "https://awsops-network-gateway-oimomguf7x.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",
    "ops": "https://awsops-ops-gateway-ybcvjkwu71.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",
    "iac": "https://awsops-iac-gateway-i0vlfltmwu.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",
    "cost": "https://awsops-cost-gateway-uanqtckgzm.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",
    "monitoring": "https://awsops-monitoring-gateway-lal7vj9ozv.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",
}
DEFAULT_GATEWAY = "ops"
GATEWAY_REGION = "ap-northeast-2"
SERVICE = "bedrock-agentcore"

# Bedrock Model - Sonnet 4.6 in us-east-1
model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-6",
    region_name="us-east-1",
)

# Role-specific system prompts
SYSTEM_PROMPTS = {
    "infra": """You are AWSops Infrastructure Specialist, an expert in AWS networking, EKS, and infrastructure troubleshooting.
You have MCP tools for:
- VPC Reachability Analyzer: analyze network paths between resources
- Flow Monitor: query VPC flow logs for traffic analysis
- Network MCP: describe security groups, NACLs, route tables, subnets, VPCs
- EKS MCP: list clusters, VPC config, insights, CloudWatch logs/metrics, IAM roles, app manifests, troubleshooting
- ECS MCP: list/describe clusters, services, tasks, task definitions, ECR repos, troubleshoot (events, failures, logs, network, image pull)
Always be concise, provide actionable insights. Format in markdown. Respond in the user's language.""",

    "ops": """You are AWSops Operations Assistant, an expert in AWS cloud operations.
You have MCP tools for:
- Steampipe Query: execute SQL against 580+ AWS resource tables
- AWS Knowledge: search documentation, check regional availability
- Core MCP: execute AWS CLI commands, get solution design guidance
Always be concise, provide actionable insights. Format in markdown. Respond in the user's language.""",

    "monitoring": """You are AWSops Monitoring Specialist, an expert in AWS observability and troubleshooting.
You have MCP tools for:
- CloudWatch: get metric data/metadata, analyze trends, active alarms, alarm history, log groups, log analysis, Log Insights queries
- CloudTrail: lookup API events by user/resource/time, CloudTrail Lake SQL analytics
Always correlate metrics with events for root cause analysis. Format in markdown. Respond in the user's language.""",

    "cost": """You are AWSops FinOps Specialist, an expert in AWS cost optimization and financial operations.
You have MCP tools for:
- Cost Explorer: get cost/usage data, compare periods, analyze cost drivers, forecast
- Pricing: look up AWS service pricing
- Budgets: check budget status and forecasted spend
Always provide costs in USD with 2 decimal places. Identify optimization opportunities.
Format in markdown. Respond in the user's language.""",

    "iac": """You are AWSops IaC Specialist, an expert in Infrastructure as Code.
You have MCP tools for:
- CloudFormation: validate templates, check compliance, troubleshoot deployments, search docs
- CDK: search documentation, samples, constructs, best practices
- Terraform: search AWS/AWSCC provider docs, analyze Registry modules, best practices
Always be concise, provide actionable insights. Format in markdown. Respond in the user's language.""",

}


def get_aws_credentials():
    """Get current AWS credentials for SigV4 signing."""
    session = boto3.Session()
    creds = session.get_credentials()
    if creds:
        frozen = creds.get_frozen_credentials()
        return frozen.access_key, frozen.secret_key, frozen.token
    return None, None, None


def create_gateway_transport(gateway_url):
    """Create SigV4-signed transport to a specific Gateway."""
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
    """Get all tools from MCP client with pagination."""
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


@app.entrypoint
def handler(payload):
    user_input = payload.get("prompt", payload.get("message", ""))
    if not user_input:
        return "No input provided."

    # Select gateway based on payload (route.ts sets this)
    gateway_role = payload.get("gateway", DEFAULT_GATEWAY)
    gateway_url = GATEWAYS.get(gateway_role, GATEWAYS[DEFAULT_GATEWAY])
    system_prompt = SYSTEM_PROMPTS.get(gateway_role, SYSTEM_PROMPTS[DEFAULT_GATEWAY])

    logging.info(f"Gateway: {gateway_role} -> {gateway_url}")

    try:
        mcp_client = MCPClient(lambda: create_gateway_transport(gateway_url))

        with mcp_client:
            tools = get_all_tools(mcp_client)
            tool_names = [t.tool_name for t in tools]
            logging.info(f"Gateway [{gateway_role}] MCP tools ({len(tools)}): {tool_names}")

            agent = Agent(
                model=model,
                tools=tools,
                system_prompt=system_prompt,
            )

            response = agent(user_input)
            return response.message['content'][0]['text']

    except Exception as e:
        logging.error(f"Gateway MCP error [{gateway_role}]: {e}")
        # Fallback: run without MCP tools
        agent = Agent(model=model, system_prompt=system_prompt)
        response = agent(user_input)
        return response.message['content'][0]['text']


if __name__ == "__main__":
    app.run()
