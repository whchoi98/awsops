# AWSops Developer Onboarding

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **AWS CLI** v2 configured with appropriate credentials
- **Steampipe** installed with AWS + Kubernetes plugins
- **EC2 Access** via SSM Session Manager (dev: 10.254.2.31, prod: 10.254.2.165)

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd awsops
npm install

# 2. Configure Steampipe (if not already running)
steampipe service start --database-listen network

# 3. Create local config
cp .env.example .env.local
# Edit data/config.json with your account details

# 4. Development build (not recommended — use production build)
npm run build && npm run start

# 5. Access at http://localhost:3000/awsops/
```

## Key Concepts

### Data Flow
All AWS data is queried through **Steampipe's embedded PostgreSQL** (port 9193), not the AWS SDK directly. This gives us SQL access to 380+ AWS tables and 60+ K8s tables.

### Architecture Layers
1. **Frontend**: Next.js 14 App Router + Tailwind dark theme
2. **Data**: Steampipe pg Pool → node-cache (5min TTL)
3. **AI**: Bedrock AgentCore → 8 Gateways → 125 MCP tools
4. **Auth**: Cognito + Lambda@Edge + CloudFront

### Critical Rules
- **Never use Steampipe CLI** for queries — use `runQuery()` / `batchQuery()` from `src/lib/steampipe.ts`
- **All fetch URLs** must include `/awsops/api/*` prefix
- **All components** use `export default`
- **Verify column names** via `information_schema.columns` before writing SQL

## Project Structure

```
src/
  app/          36 pages + 13 API routes
  lib/          Core libraries (steampipe, queries, config, cache)
  components/   17 shared components
  contexts/     React contexts (Account, Language)
agent/          Strands agent + 19 Lambda tools
infra-cdk/      CDK infrastructure (3 stacks)
scripts/        22 deployment scripts (steps 0-11)
data/           Runtime config + snapshots
docs/           Architecture, ADRs, runbooks
```

## Deployment

See `scripts/ARCHITECTURE.md` for the full 11-step deployment flow.
Quick deploy: `bash scripts/03-build-deploy.sh`

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npx next lint` | Run ESLint |
| `npx tsc --noEmit` | Type check |
| `bash tests/run-all.sh` | Run project structure tests |

## Getting Help

- **Architecture**: `docs/architecture.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING.md`
- **ADRs**: `docs/decisions/` (8 architecture decisions documented)
- **Runbooks**: `docs/runbooks/` (start-services, add-new-page)
