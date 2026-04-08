# AWSops 대시보드 v1.8.0 — Claude 컨텍스트

## 프로젝트 개요
실시간 AWS/Kubernetes 리소스 모니터링, 네트워크 문제 해결, CIS 컴플라이언스, AI 기반 분석, 외부 데이터소스 연동, AI 종합 진단을 제공하는 운영 대시보드.
Steampipe, Next.js 14, Amazon Bedrock AgentCore로 구축.

## 아키텍처
- **프론트엔드**: Next.js 14 (App Router) + Tailwind CSS 다크 테마 + Recharts + React Flow
- **데이터**: Steampipe 내장 PostgreSQL (포트 9193) — AWS 380+ 테이블, K8s 60+ 테이블, 멀티 어카운트 Aggregator
- **외부 데이터소스**: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog (SSRF 방지 + allowlist)
- **AI 엔진**: Bedrock Sonnet/Opus 4.6 + AgentCore Runtime (Strands) + 8 Gateway (125 MCP 도구) + 19 Lambda
- **AI 진단**: 15섹션 Bedrock Opus 분석 + DOCX/MD/PDF 내보내기 + 자동 스케줄링
- **인증**: Cognito User Pool + Lambda@Edge (Python 3.12, us-east-1) + CloudFront
- **인프라**: CDK (`infra-cdk/`) → CloudFront (CACHING_DISABLED) → ALB → EC2 (t4g.2xlarge, Private Subnet)

## 현황 (v1.8.0)
| 항목 | 수치 |
|------|------|
| 페이지 | 40 (/datasources, /ai-diagnosis 추가) |
| 라우트 | 54 |
| SQL 쿼리 파일 | 25 |
| API 라우트 | 16 (datasources, k8s, report 추가) |
| 컴포넌트 | 18 (ReportMarkdown 추가) |
| MCP 도구 | 125 (8 Gateway, 19 Lambda) |
| AI 라우트 | 11 (datasource 라우트 추가) |
| ADR | 8 (001-008) |

## 필수 규칙

### 데이터 접근
- 모든 쿼리는 `src/lib/steampipe.ts`의 **pg Pool**을 통해 실행 — Steampipe CLI 사용 금지
- 풀 설정: `max: 5, statement_timeout: 120s, batchQuery: 5 sequential`
- 결과는 node-cache를 통해 5분간 캐싱 (멀티 어카운트: 캐시키에 accountId 접두사)
- `steampipe query "SQL"` CLI는 660배 느림 — 절대 사용 금지

### 멀티 어카운트
- `data/config.json`의 `accounts[]` 배열로 계정 관리 — 코드 수정 불필요
- Steampipe Aggregator 패턴: `aws` = 모든 계정 통합, `aws_123456789012` = 개별 계정
- `buildSearchPath(accountId)` → `public, aws_{id}, kubernetes, trivy`로 계정별 쿼리 스코핑
- 모든 페이지: `useAccount()` 훅 → `accountId: currentAccountId` 전달
- DataTable: `isMultiAccount && data[0].account_id` 감지 시 Account 컬럼 자동 추가
- Cost 쿼리: `runCostQueriesPerAccount()`로 계정별 실행 후 `account_id` 태깅 병합
- SQL 쿼리: AWS 테이블 `list` 쿼리에 `account_id` 컬럼 필수 포함

### Next.js 규칙
- `basePath: '/awsops'` — `next.config.mjs`에 설정
- 모든 `fetch()` URL에 `/awsops/api/*` 접두사 필수 (basePath가 fetch에 자동 적용 안 됨)
- 모든 컴포넌트는 `export default` — `{ X }` 형태 아닌 `import X from '...'`
- 프로덕션 빌드만 사용 (`npm run build + start`)

### Steampipe 쿼리 규칙
- 컬럼명은 반드시 `information_schema.columns`로 확인 후 쿼리 작성
- JSONB 중첩 컬럼 주의: MSK는 `provisioned` JSONB, OpenSearch는 `encryption_at_rest_options`
- `versioning_enabled` (S3), `class` AS alias (RDS), `trivy_scan_vulnerability`, `"group"` (ECS 예약어)
- 목록 쿼리에서 사용 금지: `mfa_enabled`, `attached_policy_arns`, Lambda `tags` (SCP 차단)
- SQL에서 `$` 사용 금지 — `conditions::text LIKE '%..%'` 사용

### AI 라우팅 (`src/app/api/ai/route.ts`)
11단계 우선순위 — 목록/현황 질문은 `aws-data` (Steampipe SQL), 트러블슈팅/진단은 전문 Gateway, 외부 메트릭은 `datasource`로 분류:

| 우선순위 | 라우트 | 대상 |
|----------|--------|------|
| 1 | code | 코드 인터프리터 (Python sandbox) |
| 2 | network | Network Gateway — Reachability, Flow Logs, TGW, VPN, Firewall |
| 3 | container | Container Gateway — EKS, ECS, Istio 트러블슈팅 |
| 4 | iac | IaC Gateway — CDK, CloudFormation, Terraform |
| 5 | data | Data Gateway — DynamoDB, RDS, ElastiCache, MSK |
| 6 | security | Security Gateway — IAM, 정책 시뮬레이션 |
| 7 | monitoring | Monitoring Gateway — CloudWatch, CloudTrail |
| 8 | cost | Cost Gateway — 비용 분석, 예측, 예산 |
| 9 | datasource | 외부 데이터소스 — Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog |
| 10 | aws-data | Steampipe SQL + Bedrock 분석 (목록/현황/구성 분석) |
| 11 | general | Ops Gateway → Bedrock 폴백 |

- AgentCore 설정은 `data/config.json`에서 읽음 — 계정별 하드코딩 없음
- AgentCore 응답에서 도구 사용 내역을 키워드 매칭으로 추론하여 UI에 표시

### 테마
- Navy: 900 (#0a0e1a), 800 (#0f1629), 700 (#151d30), 600 (#1a2540)
- 강조색: cyan (#00d4ff), green (#00ff88), purple (#a855f7), orange (#f59e0b), red (#ef4444)
- StatsCard `color` 속성: hex가 아닌 이름('cyan') 사용

## 주요 파일

### 핵심 라이브러리 (`src/lib/`)
- `steampipe.ts` — pg 풀 + 배치 쿼리 + 캐시 + Cost 가용성 probe + buildSearchPath + runCostQueriesPerAccount
- `queries/*.ts` — 25개 SQL 쿼리 파일 (ebs, msk, opensearch, container-cost, eks-container-cost, bedrock 포함)
- `resource-inventory.ts` — 리소스 인벤토리 스냅샷 (data/inventory/, 추가 쿼리 0건)
- `cost-snapshot.ts` — Cost 데이터 스냅샷 폴백 (data/cost/)
- `app-config.ts` — 앱 설정 (costEnabled, agentRuntimeArn, codeInterpreterName, memoryId, accounts[], customerLogo, adminEmails)
- `agentcore-stats.ts` — AgentCore 호출 통계 (총 호출, 평균 응답시간, 게이트웨이별, 모델별 토큰 사용량)
- `agentcore-memory.ts` — 대화 이력 영구 저장/검색 (사용자별 분리, data/memory/)
- `auth-utils.ts` — Cognito JWT에서 사용자 정보 추출 (email, sub)
- `cache-warmer.ts` — 백그라운드 캐시 프리워밍 (대시보드 23개 쿼리, 4분 주기)
- `datasource-client.ts` — 외부 데이터소스 HTTP 클라이언트 (7종: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog)
- `datasource-registry.ts` — 데이터소스 타입 레지스트리 (헬스체크 엔드포인트, 쿼리 언어)
- `datasource-prompts.ts` — 데이터소스 AI 쿼리 생성 프롬프트
- `report-generator.ts` — 종합 진단 데이터 수집 오케스트레이터
- `report-prompts.ts` — 15섹션 진단 프롬프트 정의
- `report-docx.ts` — DOCX 리포트 생성 (A4, TOC, 마크다운 변환)
- `report-pptx.ts` — PPTX 리포트 생성 (WADD 스타일)
- `report-scheduler.ts` — 자동 진단 스케줄러 (weekly/biweekly/monthly)

### API 라우트 (`src/app/api/`, 16개)
- `ai/route.ts` — AI 라우팅 (11 routes, 멀티 라우트, SSE 스트리밍, 도구 추론, datasource 라우트)
- `steampipe/route.ts` — Steampipe 쿼리 + Cost 가용성 + 인벤토리 (POST/GET/PUT)
- `auth/route.ts` — 로그아웃 (HttpOnly 쿠키 서버 사이드 삭제)
- `msk/route.ts` — MSK 브로커 노드 + CloudWatch 메트릭
- `rds/route.ts` — RDS 인스턴스 CloudWatch 메트릭
- `elasticache/route.ts` — ElastiCache 노드 CloudWatch 메트릭
- `opensearch/route.ts` — OpenSearch 도메인 CloudWatch 메트릭
- `agentcore/route.ts` — AgentCore Runtime/Gateway 상태 (config 기반)
- `code/route.ts` — 코드 인터프리터
- `benchmark/route.ts` — CIS 컴플라이언스 벤치마크
- `container-cost/route.ts` — ECS 컨테이너 비용 (CloudWatch Container Insights + Fargate 가격)
- `eks-container-cost/route.ts` — EKS 컨테이너 비용 (OpenCost API + Request 기반 폴백)
- `bedrock-metrics/route.ts` — Bedrock 모델 사용량 메트릭 (CloudWatch + AWSops 앱 토큰 통계)
- `datasources/route.ts` — 외부 데이터소스 CRUD + 쿼리 실행 + AI 쿼리 생성 (SSRF 방지)
- `k8s/route.ts` — EKS kubeconfig 등록
- `report/route.ts` — AI 종합 진단 리포트 생성 + S3 저장 + 스케줄링

### 인프라
- `infra-cdk/lib/awsops-stack.ts` — CDK 인프라 (VPC, EC2, ALB, CloudFront)
- `infra-cdk/lib/cognito-stack.ts` — CDK Cognito (User Pool, Lambda@Edge)
- `agent/agent.py` — Strands Agent 소스 (EC2에서 Docker 빌드 → ECR 푸시 → AgentCore Runtime에서 실행)
- `agent/lambda/*.py` — 19개 Lambda 소스 + `create_targets.py`
- ※ EC2에서는 Docker 이미지 **빌드만** 수행. 실행은 AgentCore 관리형 서비스에서 컨테이너로 실행됨.

### 설정 파일 (`data/config.json`)
```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID",
  "codeInterpreterName": "awsops_code_interpreter-XXXXX",
  "memoryId": "awsops_memory-XXXXX",
  "memoryName": "awsops_memory",
  "accounts": [
    { "accountId": "111111111111", "alias": "Host", "connectionName": "aws_111111111111", "region": "ap-northeast-2", "isHost": true, "features": { "costEnabled": true, "eksEnabled": true, "k8sEnabled": true } },
    { "accountId": "222222222222", "alias": "Staging", "connectionName": "aws_222222222222", "region": "ap-northeast-2", "isHost": false, "features": { "costEnabled": false, "eksEnabled": false, "k8sEnabled": false } }
  ]
}
```
계정별 배포 시 이 파일만 변경 — 코드 수정 불필요. `accounts` 배열은 `scripts/12-setup-multi-account.sh`로 관리.

## 배포 스크립트 (11단계)
```
Step 0:  00-deploy-infra.sh              CDK 인프라 (로컬에서 실행)
Step 1:  01-install-base.sh              Steampipe + Powerpipe
Step 2:  02-setup-nextjs.sh              Next.js + Steampipe 서비스 + MSP 판별
Step 3:  03-build-deploy.sh              프로덕션 빌드
Step 5:  05-setup-cognito.sh             Cognito 인증
Step 6a: 06a-setup-agentcore-runtime.sh  Runtime (IAM, ECR, Docker, Endpoint)
Step 6b: 06b-setup-agentcore-gateway.sh  8 Gateway (MCP)
Step 6c: 06c-setup-agentcore-tools.sh    19 Lambda + 8 Gateway, 125 도구
Step 6d: 06d-setup-agentcore-interpreter.sh  Code Interpreter
Step 6e: 06e-setup-agentcore-config.sh   AgentCore 설정 적용 (ARN, Gateway URL)
Step 6f: 06f-setup-agentcore-memory.sh   Memory Store (대화 이력, 365일 보관)
Step 7:  07-setup-opencost.sh            Prometheus + OpenCost (EKS 비용 분석)
Step 8:  08-setup-cloudfront-auth.sh     Lambda@Edge → CloudFront 연동
Step 9:  09-start-all.sh                 전체 서비스 시작
Step 10: 10-stop-all.sh                  전체 서비스 중지
Step 11: 11-verify.sh                    검증 (헬스체크)
Step 12: 12-setup-multi-account.sh       멀티 어카운트 설정 (선택, Aggregator + 교차 계정 IAM 역할)
```

## AgentCore 알려진 이슈
- Gateway Target: CLI 대신 Python/boto3 사용 (`mcp.lambda` + `credentialProviderConfigurations`)
- Docker: arm64 필수 (`docker buildx --platform linux/arm64 --load`)
- Code Interpreter 이름: 하이픈 불가, 언더스코어만
- Runtime 업데이트 시 `--role-arn` + `--network-configuration` 필수
- agent.py GATEWAYS: 계정별 Gateway URL로 업데이트 후 Docker 재빌드 필요
- AgentCore 응답: 최종 텍스트만 반환 → 응답 내용 키워드로 도구 추론
- Memory 이름: 하이픈 불가, 언더스코어만 (`awsops_memory`). `eventExpiryDuration` 최대 365일.
- Sign Out: HttpOnly 쿠키는 `document.cookie`로 삭제 불가 → `POST /api/auth`로 서버 사이드 삭제

## 새 페이지 추가
1. `information_schema.columns`로 컬럼명 확인 (JSONB 중첩 구조도 확인)
2. 쿼리 파일 생성: `src/lib/queries/<service>.ts`
3. 페이지 생성: `src/app/<service>/page.tsx`
4. 사이드바 추가: `src/components/layout/Sidebar.tsx`
5. (선택) 대시보드 카드, CloudWatch 메트릭 API, Resource Inventory 매핑
6. 빌드 검증 후 문서 업데이트

## 자동 동기화 규칙
- `src/` 아래 새 디렉토리 → `CLAUDE.md` 생성
- API 엔드포인트 변경 → `src/app/CLAUDE.md` 업데이트
- 쿼리 파일 변경 → `src/lib/CLAUDE.md`, `src/lib/queries/CLAUDE.md` 업데이트
- 컴포넌트 변경 → `src/components/CLAUDE.md` 업데이트
- ADR 번호: `docs/decisions/ADR-*.md`에서 가장 높은 번호 + 1

---

# AWSops Dashboard v1.8.0 — Claude Context (English)

## Project Overview
AWS + Kubernetes operations dashboard with real-time resource monitoring, network troubleshooting, CIS compliance, AI-powered analysis, external datasource integration, and AI comprehensive diagnosis. Built with Steampipe, Next.js 14, and Amazon Bedrock AgentCore.

## Architecture
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS dark theme + Recharts + React Flow
- **Data**: Steampipe embedded PostgreSQL (port 9193) — 380+ AWS tables, 60+ K8s tables, multi-account Aggregator
- **External Datasources**: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog (SSRF-protected + allowlist)
- **AI**: Bedrock Sonnet/Opus 4.6 + AgentCore Runtime (Strands) + 8 Gateways (125 MCP tools) + 19 Lambda
- **AI Diagnosis**: 15-section Bedrock Opus analysis + DOCX/MD/PDF export + auto-scheduling
- **Auth**: Cognito User Pool + Lambda@Edge (Python 3.12, us-east-1) + CloudFront
- **Infra**: CDK → CloudFront (CACHING_DISABLED) → ALB → EC2 (t4g.2xlarge, Private Subnet)

## Stats (v1.8.0)
| Item | Count |
|------|-------|
| Pages | 40 (incl. /datasources, /ai-diagnosis) |
| Routes | 54 |
| SQL Query Files | 25 |
| API Routes | 16 (incl. datasources, k8s, report) |
| Components | 18 (incl. ReportMarkdown) |
| MCP Tools | 125 (8 Gateways, 19 Lambda) |
| AI Routes | 11 (incl. datasource route) |
| ADRs | 8 (001-008) |

## Critical Rules

### Data Access
- ALL queries through `src/lib/steampipe.ts` pg Pool — NOT Steampipe CLI
- Pool: max 5, 120s timeout, 5 sequential batch. Cache: 5min TTL (node-cache, accountId-prefixed keys)
- Never use `steampipe query "SQL"` CLI — it's 660x slower

### Multi-Account
- Accounts managed via `accounts[]` array in `data/config.json` — no code changes
- Steampipe Aggregator pattern: `aws` = all accounts merged, `aws_123456789012` = single account
- `buildSearchPath(accountId)` returns `public, aws_{id}, kubernetes, trivy` for per-account query scoping
- All pages: `useAccount()` hook passes `accountId: currentAccountId` in fetch calls
- DataTable: auto-adds Account column when `isMultiAccount && data[0].account_id` detected
- Cost queries: `runCostQueriesPerAccount()` runs per-account then merges with `account_id` tags
- SQL queries: AWS table `list` queries must include `account_id` column

### Next.js
- `basePath: '/awsops'` in `next.config.mjs`
- ALL `fetch()` URLs must use `/awsops/api/*` prefix (basePath not auto-applied)
- ALL components use `export default`. Production build only.

### Steampipe Queries
- Always verify column names via `information_schema.columns` before writing queries
- Watch JSONB nesting: MSK uses `provisioned` JSONB, OpenSearch uses `encryption_at_rest_options`
- `versioning_enabled` (S3), `class` AS alias (RDS), `"group"` (ECS reserved word)
- Avoid SCP-blocked columns in list queries: `mfa_enabled`, `attached_policy_arns`, Lambda `tags`
- No `$` in SQL — use `conditions::text LIKE '%..%'`

### AI Routing (`src/app/api/ai/route.ts`)
11-route priority. Listing/status → `aws-data` (Steampipe SQL). Troubleshooting → specialized Gateway. External metrics → `datasource`.

| Priority | Route | Target |
|----------|-------|--------|
| 1 | code | Code Interpreter (Python sandbox) |
| 2 | network | Network Gateway — Reachability, Flow Logs, TGW, VPN, Firewall |
| 3 | container | Container Gateway — EKS, ECS, Istio troubleshooting |
| 4 | iac | IaC Gateway — CDK, CloudFormation, Terraform |
| 5 | data | Data Gateway — DynamoDB, RDS, ElastiCache, MSK |
| 6 | security | Security Gateway — IAM, policy simulation |
| 7 | monitoring | Monitoring Gateway — CloudWatch, CloudTrail |
| 8 | cost | Cost Gateway — billing, forecast, budget |
| 9 | datasource | External datasources — Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog |
| 10 | aws-data | Steampipe SQL + Bedrock analysis (listing/status/config analysis) |
| 11 | general | Ops Gateway → Bedrock fallback |

- AgentCore config from `data/config.json` — no hardcoded account ARNs
- Tool usage inferred from response content keywords and shown in UI

### Theme
- Navy: 900 (#0a0e1a), 800 (#0f1629), 700 (#151d30), 600 (#1a2540)
- Accents: cyan (#00d4ff), green (#00ff88), purple (#a855f7), orange (#f59e0b), red (#ef4444)
- StatsCard `color` prop: use names ('cyan') not hex

## Key Files

### Core Libraries (`src/lib/`)
- `steampipe.ts` — pg Pool + batchQuery + cache + checkCostAvailability + buildSearchPath + runCostQueriesPerAccount
- `queries/*.ts` — 25 SQL query files (incl. ebs, msk, opensearch, container-cost, eks-container-cost, bedrock)
- `resource-inventory.ts` — Resource inventory snapshots (data/inventory/, zero extra queries)
- `cost-snapshot.ts` — Cost data snapshot fallback (data/cost/)
- `app-config.ts` — App config (costEnabled, agentRuntimeArn, codeInterpreterName, memoryId, accounts[])
- `agentcore-stats.ts` — AgentCore call stats (total calls, avg time, per-gateway, per-model token usage)
- `agentcore-memory.ts` — Conversation history persistence/search (per-user, data/memory/)
- `auth-utils.ts` — Extract Cognito user info from JWT (email, sub)
- `cache-warmer.ts` — Background cache pre-warming (dashboard 23 queries, 4-min interval)
- `datasource-client.ts` — External datasource HTTP client (7 platforms: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog)
- `datasource-registry.ts` — Datasource type registry (health endpoints, query languages)
- `datasource-prompts.ts` — AI query generation prompts per datasource type
- `report-generator.ts` — Diagnosis report data collection orchestrator
- `report-prompts.ts` — 15-section diagnosis prompt definitions
- `report-docx.ts` — DOCX report generation (A4, TOC, markdown conversion)
- `report-pptx.ts` — PPTX report generation (WADD-style)
- `report-scheduler.ts` — Auto-diagnosis scheduler (weekly/biweekly/monthly)

### API Routes (`src/app/api/`, 16 routes)
- `ai/route.ts` — AI routing (11 routes, multi-route, SSE streaming, tool inference, datasource route)
- `steampipe/route.ts` — Steampipe queries + Cost availability + Inventory (POST/GET/PUT)
- `auth/route.ts` — Logout (server-side HttpOnly cookie deletion)
- `msk/route.ts` — MSK broker nodes + CloudWatch metrics
- `rds/route.ts` — RDS instance CloudWatch metrics
- `elasticache/route.ts` — ElastiCache node CloudWatch metrics
- `opensearch/route.ts` — OpenSearch domain CloudWatch metrics
- `agentcore/route.ts` — AgentCore Runtime/Gateway status (config-based)
- `code/route.ts` — Code Interpreter
- `benchmark/route.ts` — CIS compliance benchmark
- `container-cost/route.ts` — ECS Container Cost (CloudWatch Container Insights + Fargate pricing)
- `eks-container-cost/route.ts` — EKS Container Cost (OpenCost API + request-based fallback)
- `bedrock-metrics/route.ts` — Bedrock model usage metrics (CloudWatch + AWSops app token stats)
- `datasources/route.ts` — External datasource CRUD + query execution + AI query generation (SSRF-protected)
- `k8s/route.ts` — EKS kubeconfig registration
- `report/route.ts` — AI diagnosis report generation + S3 storage + scheduling

### Infrastructure
- `infra-cdk/lib/awsops-stack.ts` — CDK infra (VPC, EC2, ALB, CloudFront)
- `infra-cdk/lib/cognito-stack.ts` — CDK Cognito (User Pool, Lambda@Edge)
- `agent/agent.py` — Strands Agent source (Docker build on EC2 → ECR push → runs on AgentCore Runtime)
- Note: EC2 only **builds** the Docker image. Execution happens on AgentCore managed service.
- `agent/lambda/*.py` — 19 Lambda sources + `create_targets.py`

### Config File (`data/config.json`)
```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID",
  "codeInterpreterName": "awsops_code_interpreter-XXXXX",
  "memoryId": "awsops_memory-XXXXX",
  "memoryName": "awsops_memory",
  "accounts": [
    { "accountId": "111111111111", "alias": "Host", "connectionName": "aws_111111111111", "region": "ap-northeast-2", "isHost": true, "features": { "costEnabled": true, "eksEnabled": true, "k8sEnabled": true } },
    { "accountId": "222222222222", "alias": "Staging", "connectionName": "aws_222222222222", "region": "ap-northeast-2", "isHost": false, "features": { "costEnabled": false, "eksEnabled": false, "k8sEnabled": false } }
  ]
}
```
Per-account deployment: only change this file — no code changes needed. `accounts` array managed by `scripts/12-setup-multi-account.sh`.

## Deployment Scripts (11 Steps)
```
Step 0:  00-deploy-infra.sh              CDK infrastructure (run locally)
Step 1:  01-install-base.sh              Steampipe + Powerpipe
Step 2:  02-setup-nextjs.sh              Next.js + Steampipe service + MSP detection
Step 3:  03-build-deploy.sh              Production build
Step 5:  05-setup-cognito.sh             Cognito auth
Step 6a: 06a-setup-agentcore-runtime.sh  Runtime (IAM, ECR, Docker, Endpoint)
Step 6b: 06b-setup-agentcore-gateway.sh  8 Gateways (MCP)
Step 6c: 06c-setup-agentcore-tools.sh    19 Lambda + 8 Gateways, 125 tools
Step 6d: 06d-setup-agentcore-interpreter.sh  Code Interpreter
Step 6e: 06e-setup-agentcore-config.sh   AgentCore config apply (ARN, Gateway URL)
Step 6f: 06f-setup-agentcore-memory.sh   Memory Store (conversation history, 365-day retention)
Step 7:  07-setup-opencost.sh            Prometheus + OpenCost (EKS cost analysis)
Step 8:  08-setup-cloudfront-auth.sh     Lambda@Edge → CloudFront integration
Step 9:  09-start-all.sh                 Start all services
Step 10: 10-stop-all.sh                  Stop all services
Step 11: 11-verify.sh                    Verification (health check)
Step 12: 12-setup-multi-account.sh       Multi-account setup (optional, Aggregator + cross-account IAM role)
```

## AgentCore Known Issues
- Gateway Targets: use Python/boto3 (CLI has inlinePayload issues)
- Docker: arm64 required (`docker buildx --platform linux/arm64 --load`)
- Code Interpreter name: underscores only, no hyphens
- Runtime update requires `--role-arn` + `--network-configuration`
- agent.py GATEWAYS: update per-account gateway URLs then rebuild Docker
- AgentCore response: final text only (no tool_call tags) → tools inferred from keywords
- Memory name: no hyphens, underscores only (`awsops_memory`). `eventExpiryDuration` max 365 days.
- Sign Out: HttpOnly cookie requires server-side deletion via `POST /api/auth`

## Adding New Pages
1. Verify columns via `information_schema.columns` (check JSONB nesting too)
2. Create query file: `src/lib/queries/<service>.ts`
3. Create page: `src/app/<service>/page.tsx`
4. Add to Sidebar: `src/components/layout/Sidebar.tsx`
5. (Optional) Dashboard card, CloudWatch metrics API, Resource Inventory mapping
6. Build verification and documentation update

## Auto-Sync Rules
- New directory under `src/` → create `CLAUDE.md`
- API endpoint changed → update `src/app/CLAUDE.md`
- Query file changed → update `src/lib/CLAUDE.md`, `src/lib/queries/CLAUDE.md`
- Component changed → update `src/components/CLAUDE.md`
- ADR numbering: highest in `docs/decisions/ADR-*.md` + 1
