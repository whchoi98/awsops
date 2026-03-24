# AWSops Dashboard v1.7.0 — Kiro Rules

## Project Overview
AWS + Kubernetes 운영 대시보드 (Steampipe, Next.js 14, Amazon Bedrock AgentCore).
34 pages, 49 routes, 12 API routes, 24 query files, 8 AgentCore Gateways (125 MCP tools), 19 Lambda functions, 14 components.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS (dark navy), Recharts, React Flow
- **Data**: Steampipe embedded PostgreSQL :9193 (380+ AWS, 60+ K8s, trivy), pg Pool (max 5, 120s timeout), node-cache 5min
- **AI**: Bedrock Claude Sonnet/Opus 4.6 (global.* cross-region), AgentCore Runtime (Strands), 8 Gateways, Code Interpreter
- **Auth**: Cognito + Lambda@Edge (JWT cookie, Python 3.12, us-east-1)
- **Infra**: CDK TypeScript → CloudFront → ALB → EC2 t4g.2xlarge (Private Subnet)

## Architecture Rules

### Data Flow
- 모든 AWS/K8s 데이터: Steampipe pg Pool 경유 — CLI 사용 금지
- steampipe.ts: `Pool({ host: '127.0.0.1', port: 9193, max: 5, statement_timeout: 120000 })`
- batchQuery: 3개 쿼리 동시 실행 (순차 배치)
- node-cache 5분 TTL 캐싱

### Next.js
- basePath: `/awsops` — 모든 fetch URL에 `/awsops/api/*` 접두사 필수
- 모든 컴포넌트: `export default` — named export 금지
- import: `import X from '...'` — `{ X }` 금지
- 모든 페이지: `'use client'`로 시작

### Steampipe SQL
- 쿼리 전 `information_schema.columns`로 컬럼명 확인
- `$` 사용 금지 → `conditions::text LIKE '%..%'` 사용
- SCP 차단 컬럼 금지 (list 쿼리): `mfa_enabled`, `attached_policy_arns`, Lambda `tags`
- 컬럼명 주의: `versioning_enabled` (S3), `class` alias (RDS), `trivy_scan_vulnerability`, `"group"` (ECS)

### AI Routing (10 Routes)
- 분류기가 1~3개 route 반환 → 병렬 Gateway 호출 → Bedrock 응답 합성
- code → Code Interpreter | network/container/iac/data/security/monitoring/cost → AgentCore Gateway
- aws-data → Steampipe + Bedrock Direct | general → Ops Gateway + Bedrock fallback
- Models: Sonnet 4.6 (`global.anthropic.claude-sonnet-4-6`), Opus 4.6 (`global.anthropic.claude-opus-4-6-v1`)

### Dark Theme Colors
- BG: navy-900 `#0a0e1a`, navy-800 `#0f1629`, navy-700 `#151d30`
- Border: navy-600 `#1a2540`
- Accents: cyan `#00d4ff`, green `#00ff88`, purple `#a855f7`, orange `#f59e0b`, red `#ef4444`, pink `#ec4899`
- StatsCard/LiveResourceCard color prop: 이름('cyan') — hex 금지

### Component Patterns
- Detail panel: fixed right overlay, bg-black/50, max-w-2xl, animate-fade-in
- Section/Row helpers: 각 페이지 파일 하단
- DataTable: sortable columns, skeleton loading, onRowClick
- Charts: PieChartCard, BarChartCard, LineChartCard (Recharts wrappers)

### Agent / Docker
- arm64 필수: `docker buildx --platform linux/arm64`
- Gateway URL: payload 기반 `GATEWAYS` dict에서 동적 선택
- 시스템 프롬프트: 역할별 (network/container/iac/data/security/monitoring/cost/ops)
- 폴백: MCP 연결 실패 시 Bedrock Direct

## File Structure
```
src/app/           # 34 pages + 12 API routes (49 routes total)
src/components/    # 14 shared components (layout, dashboard, charts, table, k8s)
src/lib/           # steampipe.ts, resource-inventory.ts, cost-snapshot.ts, app-config.ts + queries/ (24 SQL files)
src/types/         # TypeScript types
agent/             # Strands agent + 19 Lambda sources
infra-cdk/         # CDK (AwsopsStack, CognitoStack)
scripts/           # 17 install/ops scripts
docs/              # Guides, ADRs, Runbooks
```

## References
- `.kiro/AGENT.md` — 에이전트 컨텍스트
- `.kiro/steering/` — 코딩 표준, 아키텍처 결정, 프로젝트 구조
- `.kiro/docs/` — 데이터 흐름, 트러블슈팅
- `docs/TROUBLESHOOTING.md` — 상세 문제 해결
- `docs/decisions/` — ADR 전문
