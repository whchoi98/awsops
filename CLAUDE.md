# AWSops 대시보드 - Claude 컨텍스트 / AWSops Dashboard - Claude Context

## 프로젝트 개요 / Project Overview
실시간 리소스 모니터링, 네트워크 문제 해결, CIS 컴플라이언스, AI 기반 분석을 제공하는 AWS + Kubernetes 운영 대시보드. Steampipe, Next.js, Amazon Bedrock AgentCore로 구축.
(AWS + Kubernetes operations dashboard with real-time resource monitoring, network troubleshooting, CIS compliance, and AI-powered analysis. Built with Steampipe, Next.js, and Amazon Bedrock AgentCore.)

## 아키텍처 / Architecture
- **프론트엔드 / Frontend**: Next.js 14 (App Router) + Tailwind CSS dark theme + Recharts + React Flow
- **데이터 / Data**: Steampipe embedded PostgreSQL (port 9193) — 380개 이상 AWS 테이블, 60개 이상 K8s 테이블 (380+ AWS tables, 60+ K8s tables)
- **AI 엔진 / AI**: Bedrock Sonnet/Opus 4.6 + AgentCore Runtime (Strands) + 8 Gateways (Network/Container/IaC/Data/Security/Monitoring/Cost/Ops) + 19 Lambda + 125개 MCP 도구 (125 MCP tools)
- **인증 / Auth**: Cognito User Pool + Lambda@Edge (Python 3.12, us-east-1) + CloudFront
- **인프라 / Infra**: CDK (`infra-cdk/`) → CloudFront (CACHING_DISABLED) → ALB (SG: CF prefix list, port 80-3000) → EC2 (t4g.2xlarge, Private Subnet)

## 필수 규칙 / Critical Rules

### 데이터 접근 / Data Access
- 모든 쿼리는 `src/lib/steampipe.ts`의 **pg Pool**을 통해 실행 — Steampipe CLI 사용 금지
  (ALL queries go through `src/lib/steampipe.ts` using **pg Pool** — NOT Steampipe CLI)
- 풀 설정: `max: 5, statement_timeout: 120s, batchQuery: 5 sequential`
  (Pool config: max 5 connections, 120s timeout, 5 sequential batch queries)
- 결과는 node-cache를 통해 5분간 캐싱
  (Results cached 5 minutes via node-cache)
- `steampipe query "SQL"` CLI 사용 금지 — 660배 느림
  (Never use `steampipe query "SQL"` CLI — it's 660x slower)

### Next.js 규칙 / Next.js
- `next.config.mjs`에 `basePath: '/awsops'` 설정
  (`basePath: '/awsops'` in `next.config.mjs`)
- 모든 `fetch()` URL에 `/awsops/api/*` 접두사 필수 — basePath가 fetch에 자동 적용되지 않음
  (ALL `fetch()` URLs must use `/awsops/api/*` prefix — basePath not auto-applied to fetch)
- 모든 컴포넌트는 `export default` 사용 — `{ X }` 형태 아닌 `import X from '...'`로 임포트
  (ALL components use `export default` — import as `import X from '...'` NOT `{ X }`)
- 프로덕션 빌드만 사용 — 프로덕션에서 `npm run dev` 사용 금지
  (Production build only: `npm run build + start`, never `npm run dev` in production)

### Steampipe 쿼리 규칙 / Steampipe Queries
- 컬럼명: 쿼리 작성 전 `information_schema.columns`로 확인
  (Column names: verify with `information_schema.columns` before writing queries)
- `versioning_enabled` not `versioning` (S3)
- `class` AS alias not `db_instance_class` (RDS)
- `trivy_scan_vulnerability` not `trivy_vulnerability`
- `"group"` AS alias (ECS 예약어 / ECS reserved word)
- 목록 쿼리에서 사용 금지: `mfa_enabled`, `attached_policy_arns`, Lambda `tags` — SCP가 hydrate 차단
  (Avoid in list queries: `mfa_enabled`, `attached_policy_arns`, Lambda `tags` — SCP blocks hydrate)
- SQL에서 `$` 사용 금지 — `jsonb_path_exists` 대신 `conditions::text LIKE '%..%'` 사용
  (No `$` in SQL — use `conditions::text LIKE '%..%'` instead of `jsonb_path_exists`)

### AI 라우팅 / AI Routing (`src/app/api/ai/route.ts`)
1. 코드 실행 키워드 → 코드 인터프리터 (Code execution keywords → Code Interpreter)
2. 네트워크 키워드 → Network Gateway (ENI, reachability, flow log, VPN)
3. 컨테이너 키워드 → Container Gateway (EKS, ECS, Fargate, Istio)
4. IaC 키워드 → IaC Gateway (CDK, CloudFormation, Terraform)
5. 데이터 키워드 → Data Gateway (DynamoDB, RDS, ElastiCache, MSK)
6. 보안 키워드 → Security Gateway (IAM, policy, MFA, access key)
7. 모니터링 키워드 → Monitoring Gateway (CloudWatch, CloudTrail)
8. 비용 키워드 → Cost Gateway (billing, forecast, budget)
9. AWS 데이터 키워드 → Steampipe + Bedrock 직접 (EC2, S3, VPC, Lambda)
10. 일반 → Ops Gateway → Bedrock 폴백 (General → Ops Gateway → Bedrock fallback)

### 테마 / Theme
- Navy: 900 (#0a0e1a), 800 (#0f1629), 700 (#151d30), 600 (#1a2540)
- 강조색 / Accents: cyan (#00d4ff), green (#00ff88), purple (#a855f7), orange (#f59e0b), red (#ef4444)
- StatsCard/LiveResourceCard의 `color` 속성: hex가 아닌 이름('cyan') 사용
  (StatsCard/LiveResourceCard `color` prop: use names ('cyan') not hex)

## 주요 파일 / Key Files
- `src/lib/steampipe.ts` — pg 풀 + 배치 쿼리 + 캐시 + Cost 가용성 probe (pg Pool + batchQuery + cache + checkCostAvailability)
- `src/lib/queries/*.ts` — 22개 SQL 쿼리 파일 (22 SQL query files)
- `src/lib/resource-inventory.ts` — 리소스 인벤토리 스냅샷 (Resource inventory snapshots)
- `src/lib/cost-snapshot.ts` — Cost 데이터 스냅샷 폴백 (Cost data snapshot fallback)
- `src/lib/app-config.ts` — 앱 설정 (costEnabled 등) (App config)
- `src/app/api/ai/route.ts` — AI 라우팅 (AI routing, 10 routes + Code Interpreter)
- `src/components/layout/Sidebar.tsx` — 네비게이션, 6개 그룹 (Navigation, 6 groups)
- `infra-cdk/lib/awsops-stack.ts` — CDK 인프라 (VPC, EC2, ALB, CloudFront)
- `infra-cdk/lib/cognito-stack.ts` — CDK Cognito (User Pool, Lambda@Edge)
- `agent/lambda/create_targets.py` — 게이트웨이 타겟 생성 스크립트 (Gateway target creation script)
- `agent/lambda/*.py (19 Lambda sources)` — AgentCore Lambda 함수 소스 (AgentCore Lambda function sources)
- `scripts/ARCHITECTURE.md` — 전체 아키텍처 문서 (Full architecture documentation)
- `docs/TROUBLESHOOTING.md` — 10개 알려진 이슈 + 해결방법 (10 known issues + solutions)

## 배포 스크립트 (10단계) / Deployment Scripts (10 Steps)
```
Step 0:  00-deploy-infra.sh              CDK 인프라 (로컬에서 실행)
Step 1:  01-install-base.sh              Steampipe + Powerpipe
Step 2:  02-setup-nextjs.sh              Next.js + Steampipe 서비스
Step 3:  03-build-deploy.sh              Production 빌드
Step 5:  05-setup-cognito.sh             Cognito 인증
Step 6a: 06a-setup-agentcore-runtime.sh  Runtime (IAM, ECR, Docker, Endpoint)
Step 6b: 06b-setup-agentcore-gateway.sh  Gateway (MCP)
Step 6c: 06c-setup-agentcore-tools.sh    Tools (19 Lambda + 8 Gateways, 125 tools)
Step 6d: 06d-setup-agentcore-interpreter.sh  Code Interpreter
Step 7:  07-setup-cloudfront-auth.sh     Lambda@Edge → CloudFront 연동
```
- `06-setup-agentcore.sh` — 6a→6b→6c→6d 일괄 실행 래퍼 (batch execution wrapper)
- `install-all.sh` — Step 1→2→3→9 자동 실행, EC2 내부 (auto execution inside EC2)

## AgentCore 알려진 이슈 / AgentCore Known Issues
- Gateway Target: CLI 대신 Python/boto3 사용 (`mcp.lambda` + `credentialProviderConfigurations`)
  (Use Python/boto3 instead of CLI)
- Docker: arm64 필수 (`docker buildx --platform linux/arm64`)
  (arm64 required)
- Code Interpreter 이름: 하이픈 불가, 언더스코어만 (`[a-zA-Z][a-zA-Z0-9_]`)
  (No hyphens, underscores only)
- CloudFront CachePolicy: TTL=0 시 HeaderBehavior 불가 → 관리형 CACHING_DISABLED 사용
  (HeaderBehavior not allowed with TTL=0 → use managed CACHING_DISABLED)
- ALB SG: CloudFront prefix list 120+ IP → 포트 범위(80-3000) 단일 규칙으로 통합
  (CloudFront prefix list 120+ IPs → consolidated into single port range rule 80-3000)
- psycopg2 → pg8000: VPC Lambda용, 네이티브 바이너리 의존성 없음
  (psycopg2 → pg8000 for VPC Lambda, no native binary dependency)

## 새 페이지 추가 / Adding New Pages
1. 컬럼 확인 / Check columns: `steampipe query "SELECT column_name FROM information_schema.columns WHERE table_name='TABLE'" --output json --input=false`
2. 쿼리 파일 생성 / Create query file: `src/lib/queries/<service>.ts`
3. 페이지 생성 / Create page: `src/app/<service>/page.tsx` ('use client', fetch pattern, detail panel)
4. 사이드바 추가 / Add to Sidebar: `src/components/layout/Sidebar.tsx` (적절한 네비게이션 그룹 / appropriate navGroup)
5. 검증 / Verify: `bash scripts/09-verify.sh`

---

## 자동 동기화 규칙 / Auto-Sync Rules

아래 규칙은 Plan 모드 종료 후 및 주요 코드 변경 시 자동으로 적용됩니다.
(Rules below are applied automatically after Plan mode exit and on major code changes.)

### Plan 모드 이후 작업 / Post-Plan Mode Actions
Plan 모드(`/plan`) 종료 후, 구현 시작 전:
(After exiting Plan mode (`/plan`), before starting implementation:)

1. **아키텍처 결정 / Architecture decision made** -> Update `docs/architecture.md`
2. **기술적 선택/트레이드오프 결정 / Technical choice/trade-off made** -> Create `docs/decisions/ADR-NNN-title.md`
3. **새 모듈 추가 / New module added** -> 해당 모듈 디렉토리에 `CLAUDE.md` 생성 (Create `CLAUDE.md` in that module directory)
4. **운영 절차 정의 / Operational procedure defined** -> `docs/runbooks/`에 런북 생성 (Create runbook in `docs/runbooks/`)
5. **이 파일 변경 필요 / Changes needed in this file** -> 위 관련 섹션 업데이트 (Update relevant sections above)

### 코드 변경 동기화 규칙 / Code Change Sync Rules
- `src/` 아래 새 디렉토리 → `CLAUDE.md` 반드시 생성
  (New directory under `src/` -> Must create `CLAUDE.md` alongside)
- API 엔드포인트 추가/변경 → `src/app/CLAUDE.md` 업데이트
  (API endpoint added/changed -> Update `src/app/CLAUDE.md`)
- 쿼리 파일 추가/변경 → `src/lib/CLAUDE.md` 업데이트
  (Query file added/changed -> Update `src/lib/CLAUDE.md`)
- 컴포넌트 추가/변경 → `src/components/CLAUDE.md` 업데이트
  (Component added/changed -> Update `src/components/CLAUDE.md`)
- 인프라 변경 → `docs/architecture.md` 인프라 섹션 업데이트
  (Infrastructure changed -> Update `docs/architecture.md` Infrastructure section)

### ADR 번호 매기기 / ADR Numbering
`docs/decisions/ADR-*.md`에서 가장 높은 번호를 찾아 1 증가.
(Find the highest number in `docs/decisions/ADR-*.md` and increment by 1.)
Format: `ADR-NNN-concise-title.md`
