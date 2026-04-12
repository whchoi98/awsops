# 에이전트 모듈 / Agent Module

## 역할 / Role
AgentCore 런타임용 Strands 에이전트. MCP 프로토콜을 통해 8개 역할 기반 게이트웨이에 연결.
(Strands Agent for AgentCore Runtime. Connects to 8 role-based Gateways via MCP protocol.)

## 주요 파일 / Key Files
- `agent.py` — 메인 진입점: `payload.gateway` 파라미터를 통한 동적 게이트웨이 선택 (Main entrypoint: dynamic Gateway selection via `payload.gateway` parameter)
- `streamable_http_sigv4.py` — AWS SigV4 서명을 사용한 MCP StreamableHTTP (MCP StreamableHTTP with AWS SigV4 signing)
- `Dockerfile` — Python 3.11-slim, arm64, port 8080
- `requirements.txt` — strands-agents, boto3, bedrock-agentcore, psycopg2-binary
- `lambda/` — 19개 Lambda 소스 파일 + 타겟 생성 스크립트 (19 Lambda source files + `create_targets.py`)

## 8 Gateways / 8개 게이트웨이

| Gateway | Tools | Description / 설명 |
|---------|-------|---------------------|
| **Network** | 17 | VPC, TGW, VPN, ENI, Reachability, Flow Logs |
| **Container** | 24 | EKS, ECS, ECR, Istio service mesh |
| **IaC** | 12 | CloudFormation, CDK, Terraform |
| **Data** | 24 | DynamoDB, RDS, ElastiCache, MSK |
| **Security** | 14 | IAM users/roles/policies, simulation |
| **Monitoring** | 24 | CloudWatch metrics/alarms/logs, CloudTrail, Datasource diagnostics |
| **Cost** | 9 | Cost Explorer, Pricing, Budgets |
| **Ops** | 9 | AWS docs, CLI, Steampipe SQL |
| **Total** | **133** | |

## 10 Routes (route.ts) / 10개 라우트

1. `code` — Code Interpreter (Python sandbox)
2. `network` — Network Gateway (VPC, TGW, VPN, ENI, Flow Logs)
3. `container` — Container Gateway (EKS, ECS, Istio)
4. `iac` — IaC Gateway (CloudFormation, CDK, Terraform)
5. `data` — Data Gateway (DynamoDB, RDS, ElastiCache, MSK)
6. `security` — Security Gateway (IAM, policies, simulation)
7. `monitoring` — Monitoring Gateway (CloudWatch, CloudTrail)
8. `cost` — Cost Gateway (Cost Explorer, Pricing, Budgets)
9. `aws-data` — Steampipe SQL + Bedrock (리소스 인벤토리 조회 / resource inventory)
10. `general` — Ops Gateway + Bedrock 폴백 (fallback)

## Multi-Route Support / 멀티 라우트 지원
- 분류기(classifier)가 1~3개 라우트를 반환 (Classifier returns 1-3 routes)
- 복수 게이트웨이 병렬 호출 + 결과 통합(synthesis) (Parallel gateway calls + synthesis)
- SSE 스트리밍으로 실시간 응답 전달 (Real-time response via SSE streaming)

## 규칙 / Rules
- Docker 이미지는 arm64 필수 (`docker buildx --platform linux/arm64`)
  (Docker image must be arm64)
- 게이트웨이 URL은 payload 기반으로 `GATEWAYS` 딕셔너리에서 동적 선택
  (Gateway URL selected dynamically from `GATEWAYS` dict based on payload)
- 시스템 프롬프트는 역할별로 다름: network/container/iac/data/security/monitoring/cost/ops
  (System prompt is role-specific)
- 폴백: MCP 연결 실패 시 도구 없이 실행 — Bedrock 직접 호출
  (Fallback: if MCP connection fails, run without tools — Bedrock direct)
