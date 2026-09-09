# Datasource Diagnostic Signals — 설계 (Design)

> 작성일: 2026-06-24 · 브랜치: `feat/v2-datasource-diag-signals` · 상태: Draft (owner 리뷰 대기)
> 범위(v1): **Prometheus / Mimir** 외부 datasource. ClickHouse/Loki/Tempo/Datadog은 후속.

## 1. 문제 (Problem)

AI 진단 리포트가 외부 관측성 datasource(Prometheus 등)의 **실제 클라우드 상태**(컨테이너 스로틀링, OOM, 노드 메모리/디스크, 네트워크 PPS, Pod 라이트사이징 등)를 반영하지 못한다.

현재 `scripts/v2/workers/diagnosis/sources.py`의 `collect_datasources()` + `_plan_queries()`는:
- **제네릭**하다 — Prom은 정규식 매칭 메트릭에 `topk(rate(...))`, ClickHouse는 `SELECT count() FROM <table>` 수준이라 구체적 진단 신호를 만들지 못한다.
- 매 진단마다 스키마에서 쿼리를 즉석 계획한다 — 무거운 쿼리 빌드를 진단기 안에서 반복.
- 게이트 OFF / 연결된 datasource 없음일 때 `data={"instances":[],"queried":0}`을 반환 → 리포트 커버리지 노트가 이를 **"empty (no data returned)"**로 뭉뚱그리고 실제 사유(`notes`)는 버려진다 → "외부 datasource 활용 여부"가 리포트에서 **불투명**하다.

또한 운영자는 Explore에서 자주 쓰는 진단 쿼리를 **매번 직접 입력**해야 한다(v1엔 전용 datasource-query가 있었음).

## 2. 목표 (Goals) / 비목표 (Non-goals)

**Goals**
- 큐레이션된 **진단 신호 카탈로그**(intent → 표준 PromQL)를 두고, datasource의 **캐시된 스키마에 필요 메트릭이 존재하는 신호만** 실행 가능한 쿼리로 미리 빌드해 DB에 저장한다.
- 빌드는 **datasource 추가 시점 + 스키마 변경 감지 시 재빌드**되는 파이프라인이다 (1회성 아님).
- AI 진단 워커는 저장된 ready 쿼리를 **실행만** 하고(LLM·계획 없음), 신호를 리포트의 전용 섹션 + 커버리지 노트("활용 여부")에 포함한다.
- 같은 저장 쿼리를 Explore UI에서 **클릭 가능한 "자주 쓰는 쿼리" 버튼**으로 노출한다(이중 소비자).

**Non-goals (v1)**
- ClickHouse/Loki/Tempo/Datadog 신호 (후속). Datadog query connector 신규 추가도 후속.
- LLM 기반 쿼리 생성(접근 B/C) — 결정론 카탈로그(접근 A)만.
- AWS 리소스 변경/자율 — 전부 read-only (ADR-005 FROZEN 무관, ADR-007 governed egress 하).
- 사용자 정의 저장 쿼리(카탈로그 외) — 후속.

## 3. 아키텍처 결정 (Decisions, 확정)

| # | 결정 | 비고 |
|---|------|------|
| D1 | v1 범위 = Prometheus/Mimir | 나열 신호 대부분이 표준 node-exporter·cadvisor·kube-state 메트릭 |
| D2 | 접근 A — 결정론 카탈로그 (LLM 0) | Prom 표준 메트릭은 정형 → 신뢰도·비용·테스트성 우수 |
| D3 | 빌드 로직 **워커 단일화 (Python)** | 주기적 재빌드 = egress+스케줄 → 워커 티어가 자연스러운 단일 홈 (기존 `reaper`/`schedule_dispatcher` 패턴) |
| D4 | 이중 소비자가 한 테이블(`datasource_diag_signals`)을 read | 워커=실행, 웹 BFF=Explore 버튼 |
| D5 | Explore 버튼은 **Explore 페이지**에만 (Integration 페이지 아님) | Integration=가끔 등록, Explore=자주 쿼리 |
| D6 | 스키마 해시 비교로 **변경 시에만** 재빌드 | 버전 업그레이드의 메트릭 추가/제거/개명 흡수 |

## 4. 데이터 모델 (Data Model)

신규 테이블 — ULID 마이그레이션(`terraform/v2/foundation/migrations/<ULID>_datasource_diag_signals.sql`), `schema.sql` append 아님.

```sql
CREATE TABLE IF NOT EXISTS datasource_diag_signals (
  account_id      text        NOT NULL DEFAULT 'self',
  integration_id  bigint      NOT NULL,         -- datasource_schemas.integration_id(BIGINT)와 정합
  signal_key      text        NOT NULL,         -- 'container_cpu_throttling' …
  title           text        NOT NULL,         -- 버튼 라벨 ("컨테이너 CPU 스로틀링")
  status          text        NOT NULL,         -- 'ready' | 'unavailable'
  query           jsonb,                         -- ready: {tool, args}  (실행/버튼용)
  missing_metrics jsonb,                         -- unavailable: ["metric_a", …]  → 활용여부 사유
  meta            jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- {pillar, threshold, kind, unit}
  schema_version  text,                          -- 빌드에 쓰인 스키마 해시 (변경감지)
  built_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, integration_id, signal_key)
);
CREATE INDEX IF NOT EXISTS dds_instance_idx ON datasource_diag_signals (account_id, integration_id, status);
```

- `query.tool` = 기존 connector 도구(`prometheus_query` | `mimir_query`), `query.args` = `{query: "<PromQL>"}` 등.
- `meta.threshold` = 결정론 플래그 임계값(예: throttling ratio 0.25). 워커가 결과 평가 시 적용.
- mark-sweep: 재빌드 시 해당 instance의 이번 빌드에 없는 `signal_key` 행 삭제(카탈로그 축소/스키마 변화 반영).

## 5. 신호 카탈로그 (Signal Catalog, v1)

`scripts/v2/workers/diagnosis/signal_catalog.py` — 순수 데이터 + 빌드 함수(connector 헬퍼가 있는 `sources.py` 옆). `datasource_index` 잡 핸들러는 기존 `scripts/v2/workers/handlers.py` 디스패치에 신규 분기로 추가. 각 항목:
`{key, title, pillar, kind∈{prometheus,mimir}, required_metrics[], query_template, threshold, unit}`.

| key | 제목 (기둥) | PromQL (요지) | required_metrics | threshold |
|-----|-----------|--------------|------------------|-----------|
| `container_cpu_throttling` | 컨테이너 CPU 스로틀링 (Performance) | `topk(10, sum by(namespace,pod)(rate(container_cpu_cfs_throttled_periods_total[5m])) / clamp_min(sum by(namespace,pod)(rate(container_cpu_cfs_periods_total[5m])),1))` | container_cpu_cfs_throttled_periods_total, container_cpu_cfs_periods_total | ratio>0.25 |
| `oom_kills` | OOM Kill (Reliability) | `topk(10, sum by(namespace,pod)(max_over_time(kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}[1h])))` (gauge→윈도 max) | kube_pod_container_status_last_terminated_reason | >0 |
| `node_memory_pressure` | 노드 메모리 압박 (Reliability) | `topk(10, 1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))` | node_memory_MemAvailable_bytes, node_memory_MemTotal_bytes | >0.85 |
| `node_disk_usage` | 노드 디스크 사용률 (Reliability) | `topk(10, 1 - (node_filesystem_avail_bytes{fstype!~"tmpfs\|overlay"} / node_filesystem_size_bytes))` | node_filesystem_avail_bytes, node_filesystem_size_bytes | >0.85 |
| `network_pps` | 네트워크 PPS·드롭 (Performance) | **멀티쿼리**: pps `topk(10, rate(node_network_receive_packets_total[5m]))` + drop `topk(10, rate(node_network_receive_drop_total[5m]))` | node_network_receive_packets_total, node_network_receive_drop_total | drop>0 |
| `pod_right_sizing` | Pod 라이트사이징 (Cost) | **멀티쿼리**: usage `topk(10, quantile_over_time(0.95, (sum by(namespace,pod)(container_memory_working_set_bytes))[1h:5m]))` + requests `sum by(namespace,pod)(kube_pod_container_resource_requests{resource="memory"})` (서브쿼리 괄호 필수) | container_memory_working_set_bytes, kube_pod_container_resource_requests | usage<30%req(과대)·>90%(과소) |
| `cpu_saturation` | 노드 CPU 포화 (Performance) | `topk(10, 1 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])))` | node_cpu_seconds_total | >0.85 |
| `pod_restarts` | Pod 재시작 (Reliability) | `topk(10, sum by(namespace,pod)(increase(kube_pod_container_status_restarts_total[1h])))` | kube_pod_container_status_restarts_total | >3/h |

**빌드 규칙**: `required_metrics ⊆ schema.metrics` 이면 `status=ready` + 해석된 query 저장. 아니면 `status=unavailable` + `missing_metrics=[부재 메트릭]`. (메트릭명은 카탈로그 상수 — 스키마는 존재성만 검증, 주입 없음.)

## 6. 빌드/재빌드 파이프라인 (Build & Rebuild Pipeline)

워커 잡 `datasource_index` (신규 job type). 처리 단위 = 한 instance.

1. enabled egress-read datasource 중 v1 대상(`kind ∈ {prometheus,mimir}`) 선택.
2. `datasource_schemas.schema` **캐시를 read**(재introspect 아님 — 캐시는 `web/lib/datasource-schema.ts upsertSchema`가 BFF refresh/add 시 기록; `schema.metrics` 사용). 워커는 introspection 로직을 재구현하지 않는다.
3. `schema_version = sha256(json.dumps(sorted(set(metrics)),separators=(',',':')) + "|" + CATALOG_VERSION)[:16]` 계산 (Python `hash()` 금지 — 프로세스마다 salt됨; catalog 변경도 재빌드 트리거).
4. 해당 instance의 기존 `datasource_diag_signals.schema_version`와 비교.
5. **변경됐거나 신호가 없으면** 카탈로그로 재빌드 → `datasource_diag_signals` upsert + 이번 빌드에 없는 signal_key mark-sweep.
6. bounded·idempotent·never-raise (기존 워커 컨벤션).

**트리거**
- **추가/갱신(즉시)**: datasource 추가/스키마-refresh BFF 라우트가 해당 instance에 `datasource_index` job 을 **서버측에서** enqueue 한다(`enqueueDatasourceIndex()`, admin 전용 `POST /api/integrations/schema`·`POST /api/datasources/manage` 경유). **범용 `POST /api/jobs` 로는 제출할 수 없다** — 그 라우트의 allowlist 는 `noop` 계열만 허용하므로 이 문서를 그대로 따르면 400 이 난다(ADR-009, PR #195 리뷰 MAJOR). UI는 완료까지 "indexing…" 표시(폴링) 후 버튼 노출.
- **주기(능동)**: 일일 EventBridge → **`datasource_index_dispatcher`**(신규, 기존 `schedule_dispatcher` 패턴)가 enabled prom/mimir instance를 조회해 각각 `datasource_index` job enqueue. (EventBridge 단독으론 DB 조회·per-instance enqueue 불가 → dispatcher 필수.) Explore 방문 없이도 캐시 변경 반영.

**게이트**: 파이프라인(빌드 + 진단 시 connector egress)은 기존 `datasource_diagnosis_enabled`(workers_enabled 필요, ADR-039/041 egress IAM 동반) 하에 둔다. 기본 OFF → $0, 신호 테이블 비어 Explore 버튼도 미노출. (버튼 전용 별도 게이트는 후속.)

## 7. 진단 통합 + 활용 여부 (Diagnosis Integration & Utilization)

- `collect_datasources(conn)` 개편: prom/mimir는 `datasource_diag_signals`의 `status='ready'` 행을 읽어 저장된 query 실행. **(구현 결정)** 제네릭 `_plan_queries`는 **제거하지 않고 유지** — loki/tempo/clickhouse는 계속 제네릭, prom/mimir도 신호 미빌드 시 제네릭으로 폴백(인덱스 파이프라인 decoupling; `test_no_signal_rows_falls_back_to_generic_planner`). 기존 fan-out·deadline·byte-cap·**PII redaction**(원시 샘플/라벨 값 미반출) 그대로 재사용. `meta.threshold`로 **결정론 플래그**(임계 초과 namespace/pod/node만 강조).
- 리포트:
  - 신규 섹션 `external_obs_signals`("외부 관측성 신호") — `sections.py`에 추가, sources=`["datasources_obs"]`. 신호별 상위 N + 플래그를 서술. 데이터 없으면 "데이터 불가"(환각 금지 규칙 준수).
  - **커버리지 노트 개선**(`report.py:_coverage_note`): `datasources_obs`에 한해 `empty` 분기에서도 `notes`를 출력 → `사용(신호 N, 인스턴스 M)` / `비활성(게이트 OFF)` / `연결 없음` / `unavailable(metric X 없음)`를 명시. 현재의 "empty 뭉뚱그림" 해소 = "활용 여부 체크".

## 8. Explore "자주 쓰는 쿼리" 버튼 (UI)

- BFF 라우트(예: `GET /api/datasources/[id]/diag-signals`)가 `datasource_diag_signals`를 읽어 `{ready:[{key,title,query}], unavailable:[{key,title,missing_metrics}]}` 반환(DB read, egress 없음).
- Explore 페이지: ready 신호를 **칩/버튼 행**으로 렌더 → 클릭 시 쿼리창에 채우고 실행(기존 Explore 실행 경로 재사용). unavailable = 비활성 칩 + 툴팁("metric X 없음 — Refresh schema").
- Integration 페이지에는 추가하지 않는다(D5).

## 9. 단위 경계 (Units / Interfaces)

| 단위 | 책임 | 의존 | 테스트 |
|------|------|------|--------|
| `signal_catalog.py` | 카탈로그 데이터 + 순수 `build_signals(schema)->rows` | 없음(순수) | 스키마 fixture→ready/unavailable 기대 |
| `datasource_index` 잡 핸들러 | 스키마캐시 read→해시비교→upsert/sweep | DB | DB 주입 |
| `collect_datasources` (개편) | ready 쿼리 실행+요약+플래그 | DB, connector | 기존 패턴 + 신규 |
| `_coverage_note` (개선) | datasource 활용여부 표면화 | — | empty+notes 출력 검증 |
| BFF diag-signals 라우트 | 테이블 read→JSON | DB | 라우트 테스트 |
| Explore 버튼 컴포넌트 | 칩 렌더+클릭 실행 | 라우트 | 컴포넌트 테스트 |

## 10. 테스트 전략 (Testing)

- 카탈로그 빌드: 메트릭 존재/부재 스키마 fixture → ready/unavailable, missing_metrics 정확성, mark-sweep.
- 해시/재빌드: 동일 스키마=재빌드 스킵, 메트릭 변동=재빌드.
- 진단 실행: connector 주입으로 ready 쿼리 실행·요약·PII 미반출·플래그.
- 커버리지 노트: 게이트 OFF / 연결 없음 / unavailable / 사용 — 4상태 문구.
- BFF 라우트 + Explore 버튼: ready/unavailable 렌더, 클릭 실행.

## 11. 마이그레이션 / 배포 (Migration / Deploy)

- ULID 마이그레이션 1건(`datasource_diag_signals`).
- 신규 워커 job type + 일일 EventBridge 스케줄(terraform, `datasource_diagnosis_enabled` 게이트).
- `make workers`(arm64 워커 이미지) + targeted terraform apply + `make deploy`(web).
- 전부 게이트 하 — 기본 OFF면 $0/무변경.

## 12. 리스크 / 오픈 (Risks / Open)

- **비표준 클러스터**(relabel/커스텀 exporter)는 일부 신호 `unavailable` → 후속 하이브리드(접근 C, 추가시점 1회 LLM 폴백)로 보완 가능. v1은 명시적 unavailable로 투명 처리.
- **동시 세션**이 `web/lib/datasource-schema.ts` / `datasources/generate` 라우트를 수정 중 → 구현 시 reconcile 필요.
- 버튼 전용 게이트 분리(진단 게이트와 독립)는 후속.
