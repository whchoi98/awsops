# AWSops Dashboard - Kiro Rules

## Project Overview
AWS + Kubernetes operations dashboard powered by Steampipe, Next.js, and Amazon Bedrock AgentCore.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts, React Flow
- **Backend**: Steampipe (embedded PostgreSQL on port 9193), Powerpipe (CIS benchmarks)
- **AI**: Amazon Bedrock (Sonnet/Opus 4.6), AgentCore Runtime (Strands Agent), AgentCore Gateway (MCP)
- **Auth**: Amazon Cognito + CloudFront Lambda@Edge
- **Infra**: CloudFormation → CloudFront → ALB → EC2 (t4g.2xlarge)

## Architecture Rules

### Data Flow
- All AWS/K8s data comes from Steampipe via pg Pool (NOT CLI)
- steampipe.ts: `Pool({ host: '127.0.0.1', port: 9193, max: 3, statement_timeout: 120000 })`
- batchQuery runs 3 queries concurrently in sequential batches
- Results cached for 5 minutes via node-cache

### Next.js Configuration
- basePath: `/awsops` (set in next.config.mjs)
- All fetch() URLs MUST use `/awsops/api/steampipe` prefix (basePath not auto-applied to fetch)
- All components use `export default` (NOT named exports)
- Import: `import Header from '@/components/layout/Header'` (NOT `{ Header }`)

### Steampipe Queries
- Use `trivy_scan_vulnerability` (NOT `trivy_vulnerability`)
- S3 uses `versioning_enabled` (NOT `versioning`)
- RDS uses `class` AS alias (NOT `db_instance_class` directly)
- Avoid `mfa_enabled`, `attached_policy_arns`, Lambda `tags` in list queries (SCP blocks hydrate)
- K8s node status: use `conditions::text LIKE '%"type":"Ready"%'` (NOT `jsonb_path_exists` with `$`)

### AI Routing
- Network keywords (ENI, route table, reachability) → AgentCore Runtime (Gateway MCP tools)
- AWS resource keywords (EC2, VPC, RDS) → Steampipe query + Bedrock Direct
- General questions → AgentCore Runtime (Strands)
- Fallback → Bedrock Direct

### Dark Theme Colors
- Background: navy-900 (#0a0e1a), navy-800 (#0f1629), navy-700 (#151d30)
- Border: navy-600 (#1a2540)
- Accents: cyan (#00d4ff), green (#00ff88), purple (#a855f7), orange (#f59e0b), red (#ef4444), pink (#ec4899)
- StatsCard/LiveResourceCard color prop: use names ('cyan', 'green') NOT hex

### Component Patterns
- Detail panels: fixed right overlay, bg-black/50 backdrop, max-w-2xl, animate-fade-in
- Section/Row helpers at bottom of each page file
- DataTable: sortable columns, skeleton loading, onRowClick for detail
- Charts: PieChartCard, BarChartCard, LineChartCard (Recharts wrappers)

## File Structure
```
src/
├── app/                    # Next.js App Router pages (21 pages)
├── components/             # Shared UI components
│   ├── layout/            # Sidebar, Header
│   ├── dashboard/         # StatsCard, StatusBadge, LiveResourceCard
│   ├── charts/            # PieChartCard, BarChartCard, LineChartCard
│   ├── table/             # DataTable
│   └── k8s/               # K9s-style components
├── lib/
│   ├── steampipe.ts       # pg Pool connection + batchQuery
│   └── queries/           # SQL query strings (12 files)
└── types/
    └── aws.ts             # TypeScript type definitions
```
