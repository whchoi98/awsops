# AWSops Dashboard - Claude Context

## Project Overview
AWS + Kubernetes operations dashboard with real-time resource monitoring, network troubleshooting, CIS compliance, and AI-powered analysis. Built with Steampipe, Next.js, and Amazon Bedrock AgentCore.

## Architecture
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS dark theme + Recharts + React Flow
- **Data**: Steampipe embedded PostgreSQL (port 9193) — 380+ AWS tables, 60+ K8s tables
- **AI**: Bedrock Sonnet/Opus 4.6 + AgentCore Runtime (Strands) + Gateway MCP (4 Lambda targets)
- **Auth**: Cognito User Pool + Lambda@Edge (Python 3.12, us-east-1) + CloudFront
- **Infra**: CDK (`infra-cdk/`) → CloudFront (CACHING_DISABLED) → ALB (SG: CF prefix list, port 80-3000) → EC2 (t4g.2xlarge, Private Subnet)

## Critical Rules

### Data Access
- ALL queries go through `src/lib/steampipe.ts` using **pg Pool** (NOT Steampipe CLI)
- Pool config: `max: 3, statement_timeout: 120s, batchQuery: 3 sequential`
- Results cached 5 minutes via node-cache
- Never use `steampipe query "SQL"` CLI — it's 660x slower

### Next.js
- `basePath: '/awsops'` in `next.config.mjs`
- ALL `fetch()` URLs must use `/awsops/api/*` prefix (basePath not auto-applied to fetch)
- ALL components use `export default` — import as `import X from '...'` (NOT `{ X }`)
- Production build only (`npm run build + start`, never `npm run dev` in production)

### Steampipe Queries
- Column names: verify with `information_schema.columns` before writing queries
- `versioning_enabled` not `versioning` (S3)
- `class` AS alias not `db_instance_class` (RDS)
- `trivy_scan_vulnerability` not `trivy_vulnerability`
- `"group"` AS alias (ECS, reserved word)
- Avoid in list queries: `mfa_enabled`, `attached_policy_arns`, Lambda `tags` (SCP blocks hydrate)
- No `$` in SQL — use `conditions::text LIKE '%..%'` instead of `jsonb_path_exists`

### AI Routing (`src/app/api/ai/route.ts`)
1. Code execution keywords → Code Interpreter
2. Network keywords (ENI, route, flow log) → AgentCore Runtime (Gateway MCP)
3. AWS resource keywords (EC2, VPC, RDS) → Steampipe + Bedrock Direct
4. General → AgentCore Runtime → Bedrock fallback

### Theme
- Navy: 900 (#0a0e1a), 800 (#0f1629), 700 (#151d30), 600 (#1a2540)
- Accents: cyan (#00d4ff), green (#00ff88), purple (#a855f7), orange (#f59e0b), red (#ef4444)
- StatsCard/LiveResourceCard `color` prop: use names ('cyan') not hex

## Key Files
- `src/lib/steampipe.ts` — pg Pool + batchQuery + cache
- `src/lib/queries/*.ts` — 16 SQL query files
- `src/app/api/ai/route.ts` — AI routing (4 routes + Code Interpreter)
- `src/components/layout/Sidebar.tsx` — Navigation (6 groups)
- `infra-cdk/lib/awsops-stack.ts` — CDK 인프라 (VPC, EC2, ALB, CloudFront)
- `infra-cdk/lib/cognito-stack.ts` — CDK Cognito (User Pool, Lambda@Edge)
- `scripts/ARCHITECTURE.md` — Full architecture documentation
- `docs/TROUBLESHOOTING.md` — 10 known issues + solutions

## Deployment Scripts (10 Steps)
```
Step 0:  00-deploy-infra.sh              CDK 인프라 (로컬에서 실행)
Step 1:  01-install-base.sh              Steampipe + Powerpipe
Step 2:  02-setup-nextjs.sh              Next.js + Steampipe 서비스
Step 3:  03-build-deploy.sh              Production 빌드
Step 5:  05-setup-cognito.sh             Cognito 인증
Step 6a: 06a-setup-agentcore-runtime.sh  Runtime (IAM, ECR, Docker, Endpoint)
Step 6b: 06b-setup-agentcore-gateway.sh  Gateway (MCP)
Step 6c: 06c-setup-agentcore-tools.sh    Tools (4 Lambda + 4 Gateway Targets)
Step 6d: 06d-setup-agentcore-interpreter.sh  Code Interpreter
Step 7:  07-setup-cloudfront-auth.sh     Lambda@Edge → CloudFront 연동
```
- `06-setup-agentcore.sh` — 6a→6b→6c→6d 일괄 실행 래퍼
- `install-all.sh` — Step 1→2→3→9 자동 실행 (EC2 내부)

## AgentCore Known Issues
- Gateway Target: CLI 대신 Python/boto3 사용 (`mcp.lambda` + `credentialProviderConfigurations`)
- Docker: arm64 필수 (`docker buildx --platform linux/arm64`)
- Code Interpreter 이름: 하이픈 불가, 언더스코어만 (`[a-zA-Z][a-zA-Z0-9_]`)
- CloudFront CachePolicy: TTL=0 시 HeaderBehavior 불가 → 관리형 CACHING_DISABLED 사용
- ALB SG: CloudFront prefix list 120+ IP → 포트 범위(80-3000) 단일 규칙으로 통합

## Adding New Pages
1. Check columns: `steampipe query "SELECT column_name FROM information_schema.columns WHERE table_name='TABLE'" --output json --input=false`
2. Create query file: `src/lib/queries/<service>.ts`
3. Create page: `src/app/<service>/page.tsx` ('use client', fetch pattern, detail panel)
4. Add to Sidebar: `src/components/layout/Sidebar.tsx` (appropriate navGroup)
5. Verify: `bash scripts/09-verify.sh`

---

## Auto-Sync Rules

Rules below are applied automatically after Plan mode exit and on major code changes.

### Post-Plan Mode Actions
After exiting Plan mode (`/plan`), before starting implementation:

1. **Architecture decision made** -> Update `docs/architecture.md`
2. **Technical choice/trade-off made** -> Create `docs/decisions/ADR-NNN-title.md`
3. **New module added** -> Create `CLAUDE.md` in that module directory
4. **Operational procedure defined** -> Create runbook in `docs/runbooks/`
5. **Changes needed in this file** -> Update relevant sections above

### Code Change Sync Rules
- New directory under `src/` -> Must create `CLAUDE.md` alongside
- API endpoint added/changed -> Update `src/app/CLAUDE.md`
- Query file added/changed -> Update `src/lib/CLAUDE.md`
- Component added/changed -> Update `src/components/CLAUDE.md`
- Infrastructure changed -> Update `docs/architecture.md` Infrastructure section

### ADR Numbering
Find the highest number in `docs/decisions/ADR-*.md` and increment by 1.
Format: `ADR-NNN-concise-title.md`
