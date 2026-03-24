# AWSops Dashboard — Agent Context

## Identity
AWSops Dashboard v1.7.0 — AWS + Kubernetes 운영 대시보드.
Steampipe, Next.js 14, Amazon Bedrock AgentCore 기반 실시간 모니터링 + AI 분석 플랫폼.

## Architecture (Single EC2)
```
Browser → CloudFront (Lambda@Edge JWT) → ALB → EC2 t4g.2xlarge (Private Subnet)
  ├─ Next.js :3000 (34 pages, 12 API routes, 49 routes)
  ├─ Steampipe :9193 (embedded PG, aws/k8s/trivy plugins)
  ├─ Powerpipe (CIS v1.5~v4.0, 431 controls)
  ├─ code-server :8888 (VSCode)
  └─ Docker: awsops-agent (Strands, arm64) → ECR → AgentCore Runtime
```

## Tech Stack
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS (dark navy), Recharts, React Flow
- Data: Steampipe embedded PostgreSQL (380+ AWS, 60+ K8s tables), pg Pool (max 5, 120s timeout), node-cache 5min TTL
- AI: Bedrock Claude Sonnet/Opus 4.6, AgentCore Runtime (Strands), 8 Gateways (125 MCP tools), Code Interpreter
- Auth: Cognito + Lambda@Edge (JWT cookie)
- IaC: CDK TypeScript (infra-cdk/)
- Region: ap-northeast-2 (Lambda@Edge: us-east-1)

## Critical Rules
1. **Data**: 모든 AWS/K8s 데이터는 Steampipe pg Pool 경유 — CLI 사용 금지
2. **basePath**: `/awsops` — 모든 fetch URL에 `/awsops/api/*` 접두사 필수
3. **Exports**: 모든 컴포넌트 `export default` — named export 금지
4. **Colors**: StatsCard/LiveResourceCard color prop은 이름('cyan') — hex 금지
5. **SQL**: `$` 사용 금지, SCP 차단 컬럼 금지 (mfa_enabled, attached_policy_arns, Lambda tags)
6. **Docker**: arm64 필수 (`docker buildx --platform linux/arm64`)

## AI Routing (10 Routes)
사용자 질문 → 분류기 → 1~3개 Gateway 병렬 호출 → 결과 통합 (SSE streaming)

| Route | Backend | Tools |
|-------|---------|-------|
| code | Bedrock + Code Interpreter | Python sandbox |
| network | AgentCore Gateway | 17 (VPC, TGW, VPN, ENI, Flow Logs) |
| container | AgentCore Gateway | 24 (EKS, ECS, Istio) |
| iac | AgentCore Gateway | 12 (CFn, CDK, Terraform) |
| data | AgentCore Gateway | 24 (DynamoDB, RDS, ElastiCache, MSK) |
| security | AgentCore Gateway | 14 (IAM, policy simulation) |
| monitoring | AgentCore Gateway | 16 (CloudWatch, CloudTrail) |
| cost | AgentCore Gateway | 9 (Cost Explorer, Budgets) |
| aws-data | Steampipe SQL + Bedrock | Resource inventory |
| general | Ops Gateway + Bedrock fallback | 9 |

## Key File Locations
- Pages: `src/app/{service}/page.tsx` (34 pages)
- API: `src/app/api/{ai,steampipe,auth,msk,rds,elasticache,opensearch,agentcore,code,benchmark,container-cost,eks-container-cost}/route.ts` (12 routes)
- Queries: `src/lib/queries/*.ts` (24 files — ec2, ebs, msk, opensearch, vpc, s3, rds, k8s, container-cost, eks-container-cost...)
- Lib: `src/lib/steampipe.ts`, `src/lib/resource-inventory.ts`, `src/lib/cost-snapshot.ts`, `src/lib/app-config.ts`
- Components: `src/components/{layout,dashboard,charts,table,k8s}/` (14 components)
- Agent: `agent/agent.py` (Strands), `agent/lambda/` (19 Lambdas)
- Infra: `infra-cdk/lib/awsops-stack.ts`, `infra-cdk/lib/cognito-stack.ts`
- Scripts: `scripts/0{0-9}*.sh`, `scripts/install-all.sh` (17 scripts)
