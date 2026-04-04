# Lambda 모듈 / Lambda Module

## 역할 / Role
AgentCore 게이트웨이 MCP 도구용 19개 Lambda 함수 + 1개 공유 모듈. 각 Lambda는 특정 AWS 서비스 작업을 구현.
(19 Lambda functions + 1 shared module for AgentCore Gateway MCP tools.)

## 주요 파일 / Key Files
- `create_targets.py` — 8개 게이트웨이에 걸쳐 20개 게이트웨이 타겟 생성 (Creates all 20 Gateway Targets across 8 Gateways, Python/boto3)
- `cross_account.py` — 크로스 어카운트 STS AssumeRole 헬퍼 (credential 캐싱 50분, ExternalId, 감사 로그) (Cross-account credential helper with caching, audit logging)

### Network Gateway (17 tools)
- `network_mcp.py` — VPC, TGW, VPN, ENI, Network Firewall (15 tools)
- `reachability.py` — Reachability Analyzer (1 tool)
- `flowmonitor.py` — VPC Flow Logs 조회/분석 (1 tool)

### Container Gateway (24 tools)
- `aws_eks_mcp.py` — EKS clusters, CloudWatch, IAM, troubleshooting (9 tools)
- `aws_ecs_mcp.py` — ECS clusters/services/tasks, troubleshooting (3 tools)
- `aws_istio_mcp.py` [VPC] — Istio CRDs via Steampipe K8s tables (12 tools)

### IaC Gateway (12 tools)
- `aws_iac_mcp.py` — CloudFormation/CDK validation, troubleshooting, docs (7 tools)
- `aws_terraform_mcp.py` — Provider docs, Registry module search (5 tools)

### Data Gateway (24 tools)
- `aws_dynamodb_mcp.py` — Tables, queries, data modeling, costs (6 tools)
- `aws_rds_mcp.py` — RDS/Aurora instances, SQL via Data API (6 tools)
- `aws_valkey_mcp.py` — ElastiCache clusters, replication groups (6 tools)
- `aws_msk_mcp.py` — MSK Kafka clusters, brokers, configs (6 tools)

### Security Gateway (14 tools)
- `aws_iam_mcp.py` — IAM users/roles/groups/policies, simulation (14 tools)

### Monitoring Gateway (24 tools)
- `aws_cloudwatch_mcp.py` — Metrics, alarms, Log Insights (11 tools)
- `aws_cloudtrail_mcp.py` — Event lookup, CloudTrail Lake (5 tools)
- `datasource_diag_mcp.py` — 데이터소스 연결 진단 (Datasource connectivity diagnostics, 8 tools: URL validation, DNS, NLB targets, SG analysis, network path, HTTP connectivity, K8s endpoints, full diagnosis)

### Cost Gateway (14 tools)
- `aws_cost_mcp.py` — Cost Explorer, Pricing, Budgets (9 tools)
- `aws_finops_mcp.py` — Compute Optimizer, RI/SP Recommendations, Cost Optimization Hub, Trusted Advisor (5 tools)

### Ops Gateway (9 tools)
- `aws_knowledge.py` — AWS Knowledge MCP 프록시 (Proxy to AWS Knowledge MCP, 5 tools)
- `aws_core_mcp.py` — 프롬프트 이해, AWS CLI 실행 (Prompt understanding, AWS CLI execution, 3 tools)
- `steampipe-query` — Steampipe SQL 쿼리 (1 tool, VPC Lambda)

## 규칙 / Rules
- 게이트웨이 타겟: Python/boto3 사용 필수 — CLI는 inlinePayload 문제 있음
  (Gateway Targets: must use Python/boto3 — CLI has inlinePayload issues)
- 모든 타겟에 `credentialProviderConfigurations: GATEWAY_IAM_ROLE` 필수
  (`credentialProviderConfigurations: GATEWAY_IAM_ROLE` required for all targets)
- VPC Lambda: psycopg2 대신 pg8000 사용 (steampipe-query, istio-mcp)
  (VPC Lambda: pg8000, not psycopg2)
- 모든 Lambda는 읽기 전용 — 도달성 경로 생성 외 쓰기 작업 없음
  (All Lambda read-only — no write operations except reachability path creation)
- 도구 스키마 형식: `inlinePayload: [{name, description, inputSchema: {type, properties, required}}]`
  (Tool schema format)
