# 프로젝트 인벤토리 / Project Inventory (자동 생성 / Auto-Generated)
> `.claude/hooks/post-save.sh`에 의해 자동 업데이트 — 수동 편집 금지.
> (Auto-updated by `.claude/hooks/post-save.sh` — do not edit manually.)
> 최종 업데이트: 2026-03-06 08:09 UTC (Last updated: 2026-03-06 08:09 UTC)

| 카테고리 (Category) | 수량 (Count) |
|----------|-------|
| 페이지 (Pages) | 24 |
| API 라우트 (API Routes) | 4 |
| 쿼리 파일 (Query Files) | 16 |
| 컴포넌트 (Components) | 14 |
| 스킬 (Skills) | 3 |
| 아키텍처 결정 기록 (ADRs) | 3 |
| 런북 (Runbooks) | 2 |
| 프롬프트 (Prompts) | 1 |
| 스크립트 (Scripts) | 11 |

## 페이지 / Pages
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

## API 라우트 / API Routes
- `/awsops/api/ai` → `src/app/api/ai/route.ts` (AI 라우팅)
- `/awsops/api/benchmark` → `src/app/api/benchmark/route.ts` (벤치마크)
- `/awsops/api/code` → `src/app/api/code/route.ts` (코드 실행)
- `/awsops/api/steampipe` → `src/app/api/steampipe/route.ts` (Steampipe 쿼리)

## 쿼리 파일 / Query Files
- `cloudtrail` (5개 쿼리 / 5 queries)
- `cloudwatch` (4개 쿼리 / 4 queries)
- `cost` (4개 쿼리 / 4 queries)
- `dynamodb` (3개 쿼리 / 3 queries)
- `ec2` (5개 쿼리 / 5 queries)
- `ecs` (5개 쿼리 / 5 queries)
- `elasticache` (6개 쿼리 / 6 queries)
- `iam` (5개 쿼리 / 5 queries)
- `k8s` (15개 쿼리 / 15 queries)
- `lambda` (4개 쿼리 / 4 queries)
- `metrics` (13개 쿼리 / 13 queries)
- `rds` (4개 쿼리 / 4 queries)
- `relationships` (8개 쿼리 / 8 queries)
- `s3` (4개 쿼리 / 4 queries)
- `security` (7개 쿼리 / 7 queries)
- `vpc` (17개 쿼리 / 17 queries)

## 컴포넌트 / Components
- `src/components/charts/BarChartCard.tsx` (막대 차트 카드)
- `src/components/charts/LineChartCard.tsx` (라인 차트 카드)
- `src/components/charts/PieChartCard.tsx` (파이 차트 카드)
- `src/components/dashboard/CategoryCard.tsx` (카테고리 카드)
- `src/components/dashboard/LiveResourceCard.tsx` (실시간 리소스 카드)
- `src/components/dashboard/StatsCard.tsx` (통계 카드)
- `src/components/dashboard/StatusBadge.tsx` (상태 배지)
- `src/components/k8s/K9sClusterHeader.tsx` (K9s 클러스터 헤더)
- `src/components/k8s/K9sDetailPanel.tsx` (K9s 상세 패널)
- `src/components/k8s/K9sResourceTable.tsx` (K9s 리소스 테이블)
- `src/components/k8s/NamespaceFilter.tsx` (네임스페이스 필터)
- `src/components/layout/Header.tsx` (헤더)
- `src/components/layout/Sidebar.tsx` (사이드바)
- `src/components/table/DataTable.tsx` (데이터 테이블)

## 스킬 / Skills
- `code-review` → `.claude/skills/code-review/SKILL.md` (코드 리뷰)
- `refactor` → `.claude/skills/refactor/SKILL.md` (리팩토링)
- `release` → `.claude/skills/release/SKILL.md` (릴리스)

## 아키텍처 결정 기록 / Architecture Decisions
- `001-steampipe-pg-pool.md` — ADR-001: Steampipe pg Pool 사용 결정 (Steampipe pg Pool over CLI)
- `002-ai-hybrid-routing.md` — ADR-002: AI 하이브리드 라우팅 (AI Hybrid Routing)
- `003-scp-column-handling.md` — ADR-003: SCP 차단 컬럼 처리 (SCP-Blocked Column Handling)

## 런북 / Runbooks
- `add-new-page.md` — Runbook: 새 대시보드 페이지 추가 (Add New Dashboard Page)
- `start-services.md` — Runbook: 서비스 시작 (Start Services)

## 프롬프트 / Prompts
- `analyze-resources.md` — Prompt: AWS 리소스 분석 (Analyze AWS Resources)

## 스크립트 / Scripts
- `00-deploy-infra.sh` — CloudFormation으로 EC2 인프라 배포 (Deploy EC2 Infrastructure via CloudFormation)
- `01-install-base.sh` — Steampipe + 플러그인 + Powerpipe 설치 (Steampipe + Plugins + Powerpipe Installation)
- `02-setup-nextjs.sh` — Next.js + Steampipe 서비스 설정 (Next.js + Steampipe Service Setup)
- `03-build-deploy.sh` — Next.js 프로덕션 빌드 및 배포 (Build & Deploy Next.js Production)
- `04-setup-alb.sh` — 대시보드용 ALB 리스너 설정 (ALB Listener Setup for Dashboard)
- `05-setup-cognito.sh` — Cognito 인증 설정 (Cognito Authentication Setup)
- `06-setup-agentcore.sh` — AgentCore 런타임 + 게이트웨이 설정 (AgentCore Runtime + Gateway Setup)
- `09-start-all.sh` — 전체 서비스 시작 (Start All Services)
- `10-stop-all.sh` — 전체 서비스 중지 (Stop All Services)
- `11-verify.sh` — 검증 및 상태 확인 (Verification & Health Check)
- `install-all.sh` — 전체 설치 (Full Installation)
