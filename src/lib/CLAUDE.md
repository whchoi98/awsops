# 라이브러리 모듈

## 역할
핵심 라이브러리: Steampipe 데이터베이스 연결, SQL 쿼리 정의, 인벤토리, 설정 관리.

## 주요 파일
- `steampipe.ts` — pg 풀 + 배치 쿼리 + 캐시 + Cost 가용성 + buildSearchPath + runCostQueriesPerAccount
- `resource-inventory.ts` — 리소스 인벤토리 스냅샷 (data/inventory/, 계정별 디렉토리)
- `cost-snapshot.ts` — Cost 데이터 스냅샷 폴백 (data/cost/, 계정별)
- `app-config.ts` — 앱 설정 (costEnabled, agentRuntimeArn, accounts[], customerLogo, adminEmails 등)
- `cache-warmer.ts` — 백그라운드 캐시 프리워밍 (대시보드 23 + 모니터링 10 쿼리, 4분 주기, lazy-init)
- `agentcore-stats.ts` — AgentCore 호출 통계 + 모델별 토큰 사용량 추적 (data/agentcore-stats.json)
- `agentcore-memory.ts` — 대화 이력 저장/검색, 사용자별 분리 (data/memory/)
- `auth-utils.ts` — Cognito JWT에서 사용자 정보 추출 (Lambda@Edge 검증 후 payload 디코딩)
- `eks-optimize-queries.ts` — EKS 리소스 최적화 (Prometheus 메트릭 디스커버리 + K8s 리소스 수집 + 비용 분석 프롬프트)
- `report-pptx.ts` — PPTX 리포트 생성 (WADD 스타일: 타이틀바, 요약바, 2컬럼/카드 레이아웃, 인라인 테이블, 마크다운 파싱)
- `report-docx.ts` — DOCX 리포트 생성 (docx 패키지, A4/라이트 테마, TOC, 마크다운→문단/테이블/블릿 변환, 헤더/푸터/페이지 번호)
- `report-scheduler.ts` — 리포트 스케줄러 (주기적 자동 진단, weekly/biweekly/monthly, KST 기준, data/report-schedule.json)
- `queries/*.ts` — 25개 SQL 쿼리 파일 (ebs, msk, opensearch, container-cost, eks-container-cost, bedrock 포함)

## 규칙
- 모든 DB 접근은 `steampipe.ts`의 `runQuery()` 또는 `batchQuery()`를 통해 수행
- Steampipe CLI 사용 금지 — pg Pool이 660배 빠름
- Steampipe는 `--database-listen network`으로 실행 (VPC Lambda :9193 접근)
- 쿼리 작성 전 `information_schema.columns`로 컬럼명 확인
- JSONB 중첩 주의: MSK `provisioned`, OpenSearch `encryption_at_rest_options`, ElastiCache `cache_nodes`
- SQL에서 `$` 사용 금지
- 목록 쿼리에서 SCP 차단 컬럼 사용 금지

---

# Lib Module (English)

## Role
Core libraries: Steampipe database connection, SQL query definitions, inventory, config management.

## Key Files
- `steampipe.ts` — pg Pool + batchQuery + cache + Cost probe + buildSearchPath + runCostQueriesPerAccount
- `resource-inventory.ts` — Resource inventory snapshots (data/inventory/, per-account directories)
- `cost-snapshot.ts` — Cost data snapshot fallback (data/cost/, per-account)
- `app-config.ts` — App config (costEnabled, agentRuntimeArn, accounts[], customerLogo, adminEmails, etc.)
- `cache-warmer.ts` — Background cache pre-warming (dashboard 23 + monitoring 10 queries, 4-min interval, lazy-init)
- `agentcore-stats.ts` — AgentCore call stats + per-model token usage tracking (data/agentcore-stats.json)
- `agentcore-memory.ts` — Conversation history save/search, per-user isolation (data/memory/)
- `auth-utils.ts` — Extract Cognito user from JWT (payload decode after Lambda@Edge verification)
- `eks-optimize-queries.ts` — EKS resource optimization (Prometheus metric discovery + K8s resource collection + cost analysis prompt)
- `report-pptx.ts` — PPTX report generation (WADD-style: title bars, summary bars, 2-column/card layouts, inline tables, markdown parsing)
- `report-docx.ts` — DOCX report generation (docx package, A4/light theme, TOC, markdown→paragraph/table/bullet conversion, header/footer/page numbers)
- `report-scheduler.ts` — Report scheduler (periodic auto-diagnosis, weekly/biweekly/monthly, KST-based, data/report-schedule.json)
- `queries/*.ts` — 25 SQL query files (incl. ebs, msk, opensearch, container-cost, eks-container-cost, bedrock)

## Rules
- ALL database access through `runQuery()` or `batchQuery()` in steampipe.ts
- Never use Steampipe CLI — pg Pool is 660x faster
- Steampipe runs with `--database-listen network` (VPC Lambda access on :9193)
- Verify column names via `information_schema.columns` before writing queries
- Watch JSONB nesting: MSK `provisioned`, OpenSearch `encryption_at_rest_options`, ElastiCache `cache_nodes`
- No `$` in SQL. Avoid SCP-blocked columns in list queries.
