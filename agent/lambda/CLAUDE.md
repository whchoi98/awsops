# Lambda Module

## Role
19 Lambda functions for AgentCore Gateway MCP tools. Each Lambda implements specific AWS service operations.

## Key Files
- `create_targets.py` — Creates all 19 Gateway Targets across 7 Gateways (Python/boto3)
- `network_mcp.py` — VPC, TGW, VPN, ENI, Network Firewall (15 tools)
- `aws_eks_mcp.py` — EKS clusters, CloudWatch, IAM, troubleshooting (9 tools)
- `aws_ecs_mcp.py` — ECS clusters/services/tasks, troubleshooting (3 tools)
- `aws_istio_mcp.py` [VPC] — Istio CRDs via Steampipe K8s tables (12 tools)
- `aws_iac_mcp.py` — CloudFormation/CDK validation, troubleshooting, docs (7 tools)
- `aws_terraform_mcp.py` — Provider docs, Registry module search (5 tools)
- `aws_iam_mcp.py` — IAM users/roles/groups/policies, simulation (14 tools)
- `aws_cloudwatch_mcp.py` — Metrics, alarms, Log Insights (11 tools)
- `aws_cloudtrail_mcp.py` — Event lookup, CloudTrail Lake (5 tools)
- `aws_cost_mcp.py` — Cost Explorer, Pricing, Budgets (9 tools)
- `aws_dynamodb_mcp.py` — Tables, queries, data modeling, costs (6 tools)
- `aws_rds_mcp.py` — RDS/Aurora instances, SQL via Data API (6 tools)
- `aws_valkey_mcp.py` — ElastiCache clusters, replication groups (6 tools)
- `aws_msk_mcp.py` — MSK Kafka clusters, brokers, configs (6 tools)
- `aws_knowledge.py` — Proxy to AWS Knowledge MCP (5 tools)
- `aws_core_mcp.py` — Prompt understanding, AWS CLI execution (3 tools)

## Rules
- Gateway Targets: must use Python/boto3 (CLI has inlinePayload issues)
- `credentialProviderConfigurations: GATEWAY_IAM_ROLE` required for all targets
- VPC Lambda (steampipe-query, istio-mcp): pg8000, not psycopg2
- All Lambda read-only (no write operations except reachability path creation)
- Tool schemas: `inlinePayload: [{name, description, inputSchema: {type, properties, required}}]`
