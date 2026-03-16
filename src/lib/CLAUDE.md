# 라이브러리 모듈

## 역할
핵심 라이브러리: Steampipe 데이터베이스 연결, SQL 쿼리 정의, 인벤토리, 설정 관리.

## 주요 파일
- `steampipe.ts` — pg 풀 연결 (max 5, 120s 타임아웃, 5분 TTL 캐시, Cost 가용성 probe)
- `resource-inventory.ts` — 리소스 인벤토리 스냅샷 (data/inventory/, 추가 쿼리 0건)
- `cost-snapshot.ts` — Cost 데이터 스냅샷 폴백 (data/cost/)
- `app-config.ts` — 앱 설정 (costEnabled, agentRuntimeArn, codeInterpreterName, memoryId)
- `agentcore-stats.ts` — AgentCore 호출 통계 (data/agentcore-stats.json)
- `agentcore-memory.ts` — 대화 이력 저장/검색, 사용자별 분리 (data/memory/)
- `auth-utils.ts` — Cognito JWT에서 사용자 정보 추출 (Lambda@Edge 검증 후 payload 디코딩)
- `queries/*.ts` — 23개 SQL 쿼리 파일 (ebs, msk, opensearch, container-cost 포함)

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
- `steampipe.ts` — pg Pool (max 5, 120s timeout, 5min TTL cache, checkCostAvailability)
- `resource-inventory.ts` — Resource inventory snapshots (data/inventory/, zero extra queries)
- `cost-snapshot.ts` — Cost data snapshot fallback (data/cost/)
- `app-config.ts` — App config (costEnabled, agentRuntimeArn, codeInterpreterName, memoryId)
- `agentcore-stats.ts` — AgentCore call stats (data/agentcore-stats.json)
- `agentcore-memory.ts` — Conversation history save/search, per-user isolation (data/memory/)
- `auth-utils.ts` — Extract Cognito user from JWT (payload decode after Lambda@Edge verification)
- `queries/*.ts` — 23 SQL query files (incl. ebs, msk, opensearch, container-cost)

## Rules
- ALL database access through `runQuery()` or `batchQuery()` in steampipe.ts
- Never use Steampipe CLI — pg Pool is 660x faster
- Steampipe runs with `--database-listen network` (VPC Lambda access on :9193)
- Verify column names via `information_schema.columns` before writing queries
- Watch JSONB nesting: MSK `provisioned`, OpenSearch `encryption_at_rest_options`, ElastiCache `cache_nodes`
- No `$` in SQL. Avoid SCP-blocked columns in list queries.
