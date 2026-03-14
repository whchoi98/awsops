# 라이브러리 모듈 / Lib Module

## 역할 / Role
핵심 라이브러리: Steampipe 데이터베이스 연결, SQL 쿼리 정의, 공유 유틸리티.
(Core libraries: Steampipe database connection, SQL query definitions, and shared utilities.)

## 주요 파일 / Key Files
- `steampipe.ts` — pg 풀 연결: 최대 5개, 120초 타임아웃, 배치 쿼리, 5분 TTL 캐시, Cost Explorer 가용성 probe
  (pg Pool connection: max 5, 120s timeout, batchQuery, node-cache 5 min TTL, checkCostAvailability)
- `resource-inventory.ts` — 리소스 인벤토리 스냅샷 저장/조회/추이 계산 (data/inventory/, 추가 쿼리 0건)
  (Resource inventory snapshot save/load/trend calculation, zero additional queries)
- `cost-snapshot.ts` — Cost Explorer 데이터 스냅샷 저장/조회 (data/cost/, 폴백용)
  (Cost Explorer data snapshot save/load for fallback)
- `app-config.ts` — 앱 설정 파일 읽기/쓰기 (data/config.json, costEnabled 등)
  (App config file read/write, costEnabled etc.)
- `queries/*.ts` — 19개 SQL 쿼리 파일 — AWS/K8s 서비스별 1개
  (19 SQL query files — one per AWS/K8s service)

## 규칙 / Rules
- 모든 데이터베이스 접근은 `steampipe.ts`의 `runQuery()` 또는 `batchQuery()`를 통해 수행
  (ALL database access goes through `steampipe.ts` `runQuery()` or `batchQuery()`)
- Steampipe CLI 사용 금지 — pg Pool이 660배 빠름
  (Never use Steampipe CLI — pg Pool is 660x faster)
- Steampipe는 `--database-listen network`으로 실행 — VPC Lambda가 :9193으로 접근
  (Steampipe runs with `--database-listen network` — VPC Lambda access on :9193)
- 쿼리 작성 전 `information_schema.columns`로 컬럼명 확인
  (Verify column names against `information_schema.columns` before writing queries)
- SQL에서 `$` 사용 금지 — `jsonb_path_exists` 대신 `conditions::text LIKE '%..%'` 사용
  (No `$` in SQL — use `conditions::text LIKE '%..%'` instead of `jsonb_path_exists`)
- 목록 쿼리에서 SCP 차단 컬럼 사용 금지: `mfa_enabled`, `attached_policy_arns`, Lambda `tags`
  (Avoid SCP-blocked columns in list queries)
- 컬럼명 주의사항은 루트 CLAUDE.md의 "Steampipe Queries" 섹션 참조
  (See CLAUDE.md root "Steampipe Queries" section for column name gotchas)
