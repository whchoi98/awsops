# Project Inventory (Auto-Generated)
> Auto-updated by `.claude/hooks/post-save.sh` — do not edit manually.
> Last updated: 2026-03-06 08:09 UTC

| Category | Count |
|----------|-------|
| Pages | 24 |
| API Routes | 4 |
| Query Files | 16 |
| Components | 14 |
| Skills | 3 |
| ADRs | 3 |
| Runbooks | 2 |
| Prompts | 1 |
| Scripts | 11 |

## Pages
- `/awsops/ai` → `src/app/ai/page.tsx`
- `/awsops/cloudtrail` → `src/app/cloudtrail/page.tsx`
- `/awsops/cloudwatch` → `src/app/cloudwatch/page.tsx`
- `/awsops/compliance` → `src/app/compliance/page.tsx`
- `/awsops/cost` → `src/app/cost/page.tsx`
- `/awsops/dynamodb` → `src/app/dynamodb/page.tsx`
- `/awsops/ec2` → `src/app/ec2/page.tsx`
- `/awsops/ecs` → `src/app/ecs/page.tsx`
- `/awsops/elasticache` → `src/app/elasticache/page.tsx`
- `/awsops/iam` → `src/app/iam/page.tsx`
- `/awsops/k8s/deployments` → `src/app/k8s/deployments/page.tsx`
- `/awsops/k8s/explorer` → `src/app/k8s/explorer/page.tsx`
- `/awsops/k8s/nodes` → `src/app/k8s/nodes/page.tsx`
- `/awsops/k8s` → `src/app/k8s/page.tsx`
- `/awsops/k8s/pods` → `src/app/k8s/pods/page.tsx`
- `/awsops/k8s/services` → `src/app/k8s/services/page.tsx`
- `/awsops/lambda` → `src/app/lambda/page.tsx`
- `/awsops/monitoring` → `src/app/monitoring/page.tsx`
- `/awsops/` → `src/app/page.tsx`
- `/awsops/rds` → `src/app/rds/page.tsx`
- `/awsops/s3` → `src/app/s3/page.tsx`
- `/awsops/security` → `src/app/security/page.tsx`
- `/awsops/topology` → `src/app/topology/page.tsx`
- `/awsops/vpc` → `src/app/vpc/page.tsx`

## API Routes
- `/awsops/api/ai` → `src/app/api/ai/route.ts`
- `/awsops/api/benchmark` → `src/app/api/benchmark/route.ts`
- `/awsops/api/code` → `src/app/api/code/route.ts`
- `/awsops/api/steampipe` → `src/app/api/steampipe/route.ts`

## Query Files
- `cloudtrail` (5 queries)
- `cloudwatch` (4 queries)
- `cost` (4 queries)
- `dynamodb` (3 queries)
- `ec2` (5 queries)
- `ecs` (5 queries)
- `elasticache` (6 queries)
- `iam` (5 queries)
- `k8s` (15 queries)
- `lambda` (4 queries)
- `metrics` (13 queries)
- `rds` (4 queries)
- `relationships` (8 queries)
- `s3` (4 queries)
- `security` (7 queries)
- `vpc` (17 queries)

## Components
- `src/components/charts/BarChartCard.tsx`
- `src/components/charts/LineChartCard.tsx`
- `src/components/charts/PieChartCard.tsx`
- `src/components/dashboard/CategoryCard.tsx`
- `src/components/dashboard/LiveResourceCard.tsx`
- `src/components/dashboard/StatsCard.tsx`
- `src/components/dashboard/StatusBadge.tsx`
- `src/components/k8s/K9sClusterHeader.tsx`
- `src/components/k8s/K9sDetailPanel.tsx`
- `src/components/k8s/K9sResourceTable.tsx`
- `src/components/k8s/NamespaceFilter.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/table/DataTable.tsx`

## Skills
- `code-review` → `.claude/skills/code-review/SKILL.md`
- `refactor` → `.claude/skills/refactor/SKILL.md`
- `release` → `.claude/skills/release/SKILL.md`

## Architecture Decisions
- `001-steampipe-pg-pool.md` — ADR-001: Steampipe pg Pool over CLI
- `002-ai-hybrid-routing.md` — ADR-002: AI Hybrid Routing
- `003-scp-column-handling.md` — ADR-003: SCP-Blocked Column Handling

## Runbooks
- `add-new-page.md` — Runbook: Add New Dashboard Page
- `start-services.md` — Runbook: Start Services

## Prompts
- `analyze-resources.md` — Prompt: Analyze AWS Resources

## Scripts
- `00-deploy-infra.sh` — Deploy EC2 Infrastructure (CloudFormation)
- `01-install-base.sh` — Steampipe + Plugins + Powerpipe Installation
- `02-setup-nextjs.sh` — Next.js + Steampipe Service Setup
- `03-build-deploy.sh` — Build & Deploy Next.js (Production)
- `04-setup-alb.sh` — ALB Listener Setup for Dashboard
- `05-setup-cognito.sh` — Cognito Authentication Setup
- `06-setup-agentcore.sh` — AgentCore Runtime + Gateway Setup
- `07-start-all.sh` — Start All Services
- `08-stop-all.sh` — Stop All Services
- `09-verify.sh` — Verification & Health Check
- `install-all.sh` — Full Installation
