# AWSops Dashboard - Claude Context

## Project Overview
AWS + Kubernetes operations dashboard with real-time resource monitoring, network troubleshooting, CIS compliance, and AI-powered analysis. Built with Steampipe, Next.js, and Amazon Bedrock AgentCore.

## Architecture
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS dark theme + Recharts + React Flow
- **Data**: Steampipe embedded PostgreSQL (port 9193) — 380+ AWS tables, 60+ K8s tables
- **AI**: Bedrock Sonnet/Opus 4.6 + AgentCore Runtime (Strands) + Gateway MCP (20 tools)
- **Auth**: Cognito + Lambda@Edge + CloudFront
- **Infra**: CloudFormation / CDK → CloudFront → ALB → EC2 (t4g.2xlarge)

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
- `scripts/ARCHITECTURE.md` — Full architecture documentation
- `docs/TROUBLESHOOTING.md` — 10 known issues + solutions

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
