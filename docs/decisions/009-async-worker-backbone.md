# ADR-009: 비동기 워커 백본 (SQS + Step Functions + Lambda/Fargate) / Async Worker Backbone

## Status / 상태

**Accepted (2026-06-22) — consolidated.**

> **Consolidates:** ADR-037 (worker tier 부분 — 비동기 워커 티어 결정). 본 ADR은 문서 리셋의 통합 ADR로, 037의 워커 백본 결정만 승계한다(037의 thin-BFF/엣지/Terraform 파운데이션 결정은 별개 통합 ADR 소관). v1 ADR-010(이벤트 사전 스케일링)은 v2에 **미구현**(2026-06-21 현실 감사 parity-18)이므로 본 ADR에 포함하지 않는다 — v1-only로 남긴다.
>
> **Consolidates:** the worker-tier decision of ADR-037 only. The v1 ADR-010 event pre-scaling backbone is **not built in v2** (audit parity-18) and is excluded here (kept v1-only).

## Context / 컨텍스트

v2 웹은 **thin-BFF**다 — 무겁고/길고/OOM 위험이 있는 작업을 요청 경로에서 인라인 실행하면 Fargate web 태스크가 OOM·타임아웃으로 죽고 요청 지연이 커진다. 진단 리포트 렌더, CIS 컴플라이언스 스캔(Powerpipe) 같은 장기 read-only 작업에는 **내구성 있는 비동기 실행 spine**이 필요하다. 동시에 v2는 read-only 운영 대시보드이므로 이 spine은 AWS-리소스를 변경하지 않는 작업만 실행해야 한다.

The v2 web service is a **thin-BFF**: heavy / long / OOM-risk work cannot run inline on the request path without killing the Fargate web task (OOM, timeout) and inflating latency. Long-running read-only jobs — diagnosis report rendering, CIS compliance scans (Powerpipe) — need a **durable async execution spine**. Because v2 is a read-only ops dashboard, that spine must run only non-mutating jobs.

## Decision / 결정

`workers_enabled`-게이트(기본 false → `plan` = No changes, $0)의 단일 내구 오케스트레이션 spine을 채택한다. 현행 net 플로우:

A single `workers_enabled`-gated durable orchestration spine (default false → idle cost $0). Current net flow:

```
POST /api/jobs (noop/noop-heavy only) · POST /api/diagnosis (report) · POST /api/compliance/run (compliance)
  → lib/jobs.ts enqueueJob() → worker_jobs (Aurora, status=queued; ledger-first)
  → SQS
  → ESM (Event Source Mapping, kill-switch)
  → dispatcher Lambda (idempotent on job_id)
  → Step Functions Standard
       └─ Choice on $.runtime
            ├─ RunLambda            (short jobs)
            └─ ecs:runTask.sync     (long / OOM-risk → Fargate worker)
  → worker writes running / succeeded directly to Aurora
  → on Catch: status_updater Lambda sets failed
       (SFN itself can't write the VPC-private Aurora)
  → reaper (EventBridge, 5 min) reconciles stale rows
```

핵심 규약 / Invariants:

- **Ledger-first**: web가 먼저 `worker_jobs`에 queued 행을 기록한 뒤 SQS로 enqueue → 진실 원천은 Aurora.
- **dispatcher 멱등성**: `job_id` 기준으로 중복 메시지를 흡수(at-least-once SQS 대응).
- **`$.runtime` Choice**: 짧은 작업은 RunLambda, 길거나 OOM 위험이 있는 작업은 `ecs:runTask.sync` Fargate 워커로 분기.
- **상태 기록 분리**: 워커가 running/succeeded를 직접 Aurora에 기록. SFN은 VPC-private Aurora에 쓸 수 없으므로 실패 경로만 status_updater Lambda(Catch)가 failed로 표기.
- **reaper**: EventBridge 5분 주기로 stale 행을 정합화(워커가 죽어 상태를 못 남긴 경우 보정).
- **킬스위치**: ESM을 비활성화하면 전체 워커 파이프라인이 즉시 정지(롤백/사고 차단).
- **Fargate 워커 = `CMD`** (ENTRYPOINT 금지) — SFN `containerOverrides.command`는 CMD를 대체하지만 exec-form ENTRYPOINT엔 append되어 argv 중복 → argparse 실패.
- **Single Status**: 본 ADR은 단일 Status(Accepted)만 가진다.

**소유권 스코프 (PR #195):** `worker_jobs`·`diagnosis_reports`·`compliance_runs` 의 **개별 행** 읽기(목록·상세·다운로드)는 소유자 본인 또는 admin 만 가능하다. `requested_by IS NULL` 행은 end-user principal 이 없는 내부 enqueue 이므로 읽기에서 admin 전용이다.

**집계 carve-out:** 귀속 불가능한 **집계**는 인증 사용자 전원에게 열려 있다 — `GET /api/overview` 의 status 별 job 개수와 최신 succeeded CIS run 의 pass_rate/alarm/finished_at. 조직 공용 운영 대시보드의 목적이 함대 전체 상태 표시이므로 이를 요청자 스코프로 줄이면 타일이 무의미해진다. 경계는 **귀속 가능성**이다: 개수·비율은 누가 무엇을 돌렸는지 드러내지 않고, `requested_by`·job_id·리포트 내용 같은 행 식별 정보는 이 carve-out 에 포함되지 않는다.
- 결과적으로 non-admin 은 대시보드 타일에서 조직 전체 pass_rate 를 보면서 `/compliance` 목록에는 자기 실행만 본다. 이는 버그가 아니라 위 경계의 의도된 귀결이다(리뷰 MAJOR: 세 화면이 서로 다른 답을 주는 것이 문서화 없이는 모순으로 읽힌다).
- **미해결 제품 질문**: `compliance_runs` 는 요청자 개인 데이터라기보다 **계정 단위 posture** 에 가깝다. 그렇다면 per-requester 스코핑 자체가 옳은 모델인지 재검토 대상이며, 후속에서 결정한다 — 이 PR 은 "전원이 전원의 것을 본다" 를 닫는 데 그친다.

**Ownership scope (PR #195, EN):** reading an individual `worker_jobs` / `diagnosis_reports` /
`compliance_runs` row (list, detail, download) requires being its owner, or an admin. A
`requested_by IS NULL` row came from an internal enqueue with no end-user principal, so reads treat
it as admin-only. **Aggregate carve-out:** non-attributable aggregates stay open to any
authenticated user — `GET /api/overview`'s job counts by status and the latest succeeded CIS run's
pass_rate/alarm/finished_at. A shared ops dashboard exists to show fleet-wide health, so scoping
those tiles per requester would make them meaningless. The boundary is **attributability**: counts
and rates do not reveal who ran what, and row-identifying fields (`requested_by`, job_id, report
contents) are not covered.

**한 job 당 live link 1개 / One LIVE LINK per job (PR #203):** — 패자를 어떻게 처리하는지가 두 갈래이니 먼저 구분한다: **payload 가 지목하지 않은** report(= ledger 판정에서 진 쪽)는 아무도 렌더하지 않으므로 **soft-delete** 하고, **payload 가 지목한** report 는 링크 경합에서 졌더라도 워커가 그 행을 렌더하므로 **보존하고 링크만 포기**한다. 아래 서술은 이 구분을 전제로 읽는다. 이름은 "one report per job" 이지만 index 가
실제로 보장하는 것은 그것이 아니다(codex stop-gate). predicate 가 `deleted_at IS NULL` 이므로 **어느 시점에나
링크를 든 살아있는 report 가 하나**일 뿐, 한 job 의 생애 동안 여러 report 가 차례로 링크를 들었을 수 있다(앞선
것들이 soft-delete 된 경우). 그리고 링크 경합에서 진 report 는 **삭제되지 않는다** — payload 가 지목하면 워커가
그 행을 렌더하므로, 링크 없이 남는다. 링크는 조회·lineage 용 편의이고 **payload 가 ledger 다.** 동시 같은-key 요청은 사전조회를 둘 다 통과한다
(그 조회는 `worker_job_id` 를 경유하고 그 값은 link 전까지 NULL 이다). 승자는 **ledger payload** 가 정한다 —
워커가 `payload.report_id` 를 실행하므로 link 순서로 정하면 워커가 쓰는 대상과 어긋난다. 마이그레이션
`01KZ2A4M…` 의 partial unique index(`worker_job_id IS NOT NULL AND deleted_at IS NULL`)가 DB 층에서
받쳐준다. **ledger 패자**(payload 가 지목하지 않은 report)는 soft-delete 한다 — 실행된 적이 없으므로 `failed` 로 표시하면 오보다. **링크 경합 패자 중 payload 가 지목한 report 는 삭제하지 않는다**(위 항목): 워커가 그 행을 렌더하므로 링크만 포기하고 보존한다. ledger 가 가리키는
report 가 이미 삭제됐다면 202 로 404 나는 id 를 돌려주는 대신 409 로 사실을 말한다.

**One report per job (EN):** concurrent same-key requests both pass the pre-check (it joins through
`worker_job_id`, NULL until the link). The **ledger payload** decides the winner — the worker runs
`payload.report_id`, so deciding by link order diverges from what the worker actually writes to. The
partial unique index in migration `01KZ2A4M…` (`worker_job_id IS NOT NULL AND deleted_at IS NULL`)
backs this at the DB layer; `deleted_at` is in the predicate so a soft-deleted loser does not keep
occupying the slot. The LEDGER loser — the report the payload does not name — is soft-deleted, not marked `failed`: it never
ran, so `failed` misreports it. A report that merely lost the LINK while the payload names it is NOT
deleted (see the bullet above); the worker renders it, so it keeps its row and gives up only the link. If the report the ledger names has itself been deleted, the route returns 409 stating
that rather than a 202 pointing at an id that 404s.

### 소유권 키 계약 / Ownership key contract (PR #203)

- **쓰기 키 = immutable `sub`(단일)** — 사용자 경로 enqueue 는 전부 `user.sub` 를 기록한다
  (`/api/jobs`, `/api/diagnosis`, `/api/compliance/run`). `/api/diagnosis/intent` 는 enqueue 가 아니라
  admin CRUD 이며 `created_by` 에 같은 키를 쓴다. `report_schedules` 와 그 dispatcher 도 sub 다. 단 **`created_by` 계열(`skills`·`agents`·`architecture_intent`)은 이 컷오버 대상이 아니다** — 그 writer 들이 의도적으로 email 을 쓰는 admin 귀속 값이라 재작성해도 새 행이 다시 email 이 된다. `action_plans.created_by` 는 예외로 **sub 로 전환했다**(`/api/actions`): 이 값은 4-eyes 자기승인 판정이 되읽는 인가 키이고 email 은 mutable 이라, emailA 로 만들고 나중에 verified emailB 로 승인하면 키 집합 비교로도 못 잡는다. 즉 **부정 판정에 mutable 속성을 쓰면 안 된다.** 비교는 `identityKeys()`(flag 비의존, email+sub 집합)로 하고, 그럼에도 **email 형태의 `created_by` 는 아예 거부한다** — 그 주소가 같은 sub 의 과거 주소일 수 있어 "내 현재 키가 아님"이 "내가 아님"을 뜻하지 않기 때문이다(plan 은 5분 만료라 배포 경계에서만 존재). **사용자당 활성 스케줄 1개는 이제 DB 가 강제한다** (partial unique index `uq_schedule_one_active`, migration 01KZ3C7Q…) — `upsertSchedule()` 안에만 있던 불변식이라 backfill 이 다른 주기의 활성 행 위로 소유자를 옮겨도 아무 제약이 걸리지 않았다. 트랜잭션 내 검사도 시도했지만 PG 17 실측에서 SERIALIZABLE 스냅샷이 동시 커밋을 가려 검사를 통과시켰다 — 읽기 검사로는 막을 수 없다는 신호였고, 그래서 인덱스로 옮겼다. lineage 서브쿼리는 **2단(COALESCE)** 이다: (1) 링크나 payload 로 job 이 확인되는 **attributed** 행 — 이 경우 account 가 반드시 일치해야 하며 계정 경계를 넘지 않는다. (2) 1단이 비었을 때만, **어떤 job 으로도 귀속되지 않는** 행(`NOT EXISTS`). `_report` handler 가 스스로 만든 report 는 `worker_job_id` NULL 이고 payload 에 id 를 쓰지 않으므로 영구히 2단에만 해당한다 — 1단만 있으면 그런 이력만 가진 사용자의 `parent_report_id` 가 조용히 NULL 이 되고 INSERT 시점 확정이라 복구 불가였다(review MAJOR, PG 17 재현). 순서와 조건이 핵심이다. 2단은 **account 를 지정하지 않은 호출에서만** 쓴다(`$5 IS NULL`) — account 를 지정한 호출에서 귀속 불가 행을 baseline 으로 쓰면 그 행이 그 계정 것인지 알 수 없고, **틀린 계정의 baseline 은 없는 것보다 나쁘다**(일어나지 않은 regression 을 diff 가 보고하고, `parent_report_id` 는 INSERT 시 확정된다). 두 리뷰가 반대 방향으로 밀었고, **오해를 낳는 출력이 없는 출력보다 나쁘다**는 쪽으로 정했다. 대가는 명시한다: 이력이 전부 귀속 불가인 사용자는 account 지정 진단에서 baseline 이 없다 — 현재 코드로 만든 report 가 하나 생기면(항상 귀속된다) 해소된다.
  **Write key = the immutable `sub`, single** — every user-path enqueue records `user.sub`
  (`/api/jobs`, `/api/diagnosis`, `/api/compliance/run`); `/api/diagnosis/intent` is admin CRUD, not
  an enqueue path, and records the same key as `created_by`. `report_schedules` and its dispatcher
  use the sub as well.
- **dual-key = legacy 전용, 종료 예정** — 두 형태를 수용하는 곳은 `matchesIdentity()` 를 쓰는 게이트다:
  읽기(`ownerKeysForRead()`)뿐 아니라 **`canMutateReport()`(리포트 PATCH/DELETE)도 포함**한다. 즉 legacy
  email match 의 노출 범위는 읽기에 그치지 않는다(PR #203 리뷰 MAJOR). 컷오버 이전에 기록된 email-keyed
  행 때문이며, 플래그를 내리면 이들이 함께 sub-only 로 좁아진다. diff lineage(`createReport()` 의
  `parent_report_id` 서브쿼리)는 **BFF 에서만** dual key(`ownerKeysForRead()`)를 쓴다 — `schedule_dispatcher`
  는 sub 단독이며(아래 "비대칭" 항목), 리뷰 시점에는 BFF lineage 가 owner 키를 아예 쓰지 않아 경로별로
  baseline 이 달라졌던 것을 같은 PR 에서 정합화했다.
  **One report per job means one LINK per job.** A report whose link lost that race is still the row the
worker renders — the payload names it — so it is never deleted and it stays eligible as a lineage
baseline: both lineage subqueries reach worker_jobs through the link OR the payload, and
reportForIdempotencyKey resolves the payload first. The link is a convenience; the payload is the
ledger.

  **Dual keys = legacy only, time-limited** — both forms are accepted wherever `matchesIdentity()`
  gates access, which is **not only reads** (`ownerKeysForRead()`) but also `canMutateReport()`, the
  report PATCH/DELETE gate — so the legacy email match's blast radius includes mutation (PR #203
  review MAJOR). It exists for rows written before the cut-over, and turning the flag off narrows all
  of them to sub-only together. Diff lineage (`createReport()`'s `parent_report_id` subquery) uses the
  dual key **in the BFF only** — `schedule_dispatcher` is sub-only, see the "Asymmetry" bullet below;
  before this PR the BFF lineage used no owner key at all, so the two paths disagreed on the baseline.
- **리스크(명시)** — email 은 mutable 이다. 변경되면 옛 email-keyed 행이 진짜 소유자에게서 잠기고,
  **재할당되면** 새 보유자가 전 소유자의 행과 일치한다. **이것은 admin 전용 조작이 아니다**: Cognito 는
  사용자가 자기 email 을 직접 바꿀 수 있게 하므로 원래 self-service 였다(PR #203 리뷰 MAJOR, 2개 모델).
  두 컨트롤로 닫았다 — `verifyUser()` 가 `email_verified === true` 일 때만 email claim 을 채택하고,
  user pool client 의 `write_attributes` 에서 `email`·`email_verified` 를 제거했다(후자가 중요하다:
  verified 플래그를 쓸 수 있으면 토큰 검사가 무의미해진다).
  **Risk, stated** — email is mutable. A change locks the real owner out of old email-keyed rows, and
  a REASSIGNED address makes the new holder match the previous owner's. This is NOT an admin-only
  action: Cognito lets a user change their own email, so it was self-service until two controls
  landed — `verifyUser()` adopts the `email` claim only when `email_verified === true`, and the pool
  client's `write_attributes` no longer includes `email` or `email_verified` (the latter matters: a
  writable verified flag would make the token check meaningless).
- **종료 절차(순서 고정)** / **Termination procedure (ordered)**:
  1. 신규 write 를 `sub` 로 — 완료(PR #195). / New writes on `sub` — done (PR #195).
  2. `make backfill-owner-sub` 가 **계획만** 쓴다(아무것도 바꾸지 않음). 운영자가 확신할 수 없는 항목을
     지운 뒤 `--apply <plan.json>` 로 계획에 남은 행 id 만 재작성한다. Cognito 는 "행이 기록된 시점에
     이 주소를 소유한 sub" 를 답할 수 없으므로 **추론하지 않는다** — 계획에서 항목을 지우는 것이 거부다.
     매핑 대상은 **`email_verified` 가 true 인 사용자만**이다 — unverified 주소는 계획에 들어가지 않는다(읽기에서 unverified email 을 거부하면서 backfill 이 그것을 신뢰하면, 되돌릴 수 없는 방향으로 그 수정을 무효화한다: rewrite 는 행을 그 sub 로 영구 이전하고 이후 sub-keyed 행은 전적으로 신뢰된다). 매핑되지 않는 주소(삭제된 사용자, 또는 unverified)는 계획에 넣지 않고 사유를 구분해 보고한다. `email_verified` 는 **지속적 통제가 아니다** — 사용자는 자기 계정에 설정된 주소를 스스로 verified 로 만들 수 있으므로(ADR-002/런북) 이 조건은 "지금 verified 인가" 일 뿐이다. 재할당 주소로 계정을 얻은 사람이 스스로 verified 를 만드는 경로에서, 이 도구가 자동으로 막을 수 있는 것은 **계정이 행보다 나중에 생성된 경우뿐**이다(아래 게이트). 계정이 행보다 먼저 존재했고 나중에 그 주소를 얻은 경우는 자동으로 구분되지 않으며, 그때 결정하는 것은 **plan 항목별 운영자 승인**이다 — 그래서 plan 의 evidence 가 행 기록 구간과 계정 생성 시각을 함께 보여주고, 지우는 것이 거부다. 그리고 **런타임** 노출(legacy email 매칭으로 읽기·mutation)은 backfill 게이트와 무관하다 — 그건 컷오버 완료 후 `legacy_email_owner_match=false` 로만 닫힌다. **계정 나이 게이트(fail-closed)**: Cognito 계정 생성 시각이 그 주소로 쓰인 가장 오래된 행보다 뒤면 그 계정은 그 행들을 쓸 수 없었으므로(= 재할당 mailbox 인수) 거부한다. 두 시각 중 하나라도 없거나 파싱 불가면 "판정 불가"로 역시 거부한다 — 되돌릴 수 없는 이전에서 '모르겠다'가 '괜찮다'로 읽히면 안 된다. apply 도 같은 검사를 재실행한다. 이는 signup 차단(`allow_admin_create_user_only`)이 **이미 존재하는** self-registered 계정에는 아무것도 하지 못한다는 잔여 위험에 대한 코드 측 통제다(운영 측 통제는 런북의 1회 명부 대조). lowercase 후 두 명 이상이 걸리는 주소(`ambiguous`)와, 대상 sub 가 이미 같은 타입 schedule 을 가진 `report_schedules` 행(`UNIQUE (user_sub, schedule_type)` 이라 병합 불가 + 둘 다 enabled 면 이중 실행)도 같은 이유로 제외하고 사유를 따로 보고한다. **대상 테이블은 `worker_jobs`·`diagnosis_reports`·`compliance_runs`·`report_schedules` 넷이다** — `report_schedules.user_sub` 는 컬럼명과 달리 round-2 pentest fix 당시 `identity()`(email 우선) 값을 저장했으므로 legacy 행이 email 일 수 있고, 빠뜨리면 dispatcher 가 backfill 이후에도 email-keyed 리포트를 계속 만든다. 적용 시점에는 DB(행이 계획 당시 값을 아직 들고 있는가)와 **Cognito(주소가 여전히 계획된 sub 로, verified 상태로 해석되는가)** 를 둘 다 다시 확인하고, 불일치가 하나라도 있으면 아무것도 쓰지 않고 거부한다 — 계획은 특정 *행* 에 대한 운영자 승인이지 주소 뒤의 *신원* 이 그대로라는 보증이 아니다. 쓰기는 **단일 트랜잭션**이다 — 항목별 개별 커밋이면 중간 실패가 절반만 이전된 소유권 테이블을 남기고, 그건 아예 안 한 것보다 나쁘다. 실패 시 전부 ROLLBACK 한다. apply 동안에는 **`awsops-v2-schedule-dispatcher` 를 정지**한다 — `disable-rule` 은 신규 호출만 막고 **이미 실행 중인 호출은 멈추지 않으므로**, 타임아웃(120s)이 지나기를 기다리고 최근 5분 Invocations 가 0 임을 확인한 뒤 apply 한다(명령은 스크립트가 출력한다). 그리고 잔여 검사가 0 을 읽은 뒤에만 다시 켠다 — dispatcher 는 owner 값을 읽어두고 나중에 report/job 을 INSERT 하므로, apply 중 in-flight 호출이 "잔여 0" 보고 *이후에* 새 email-keyed 행을 만들 수 있고 step 3 을 진행하면 그 행이 소유자에게서 숨는다(시간당 1회라 창은 좁지만 없지는 않다). 쓰기 **전에** 행 id 단위 journal 을 남기고(UPDATE 후엔 이전 값이 사라진다) 결과를 `status`(attempting/committed/rolled-back/**unknown**)로 스탬프한다 — 롤백된 실행이 남긴 "-applied" 파일은 거짓이기 때문이다. `unknown` 은 COMMIT 을 보냈지만 그 응답을 받지 못한 경우다(연결 단절 등): 커밋됐는지 알 수 없으므로 `rolled-back` 이라 쓰면 거짓이 되고, 운영자가 DB 재조회로 확정해야 한다. journal 은 계획된 id 가 아니라 **실제로 바뀐 행 id**(`UPDATE … RETURNING`)를 담는다 — 커밋된 실행에서는 계획 id 하나라도 값이 바뀌었으면 전체가 ROLLBACK 되므로 둘이 같지만(그래서 committed journal 에서는 일치한다), 되돌릴 때 계획 id 를 쓰면 이 실행이 바꾸지 않은 행을 덮어쓸 수 있으므로 실제 변경 id 가 기록의 기준이다. **되돌릴 때는 반드시 그 실제 변경 id 로 스코프한다** — `WHERE requested_by = <sub>` 같은 형태는 그 sub 를 정당하게 보유한 행(컷오버 이후의 모든 신규 write, 그리고 같은 사람에게 다른 주소를 매핑한 다른 항목)까지 함께 되돌린다. 행 id 가 유일하게 안전한 스코프다. 커밋 이후의 보고 단계(journal 쓰기, 잔여 행 검사) 실패는 **재작성 실패로 보고하지 않는다** — 감사 기록을 잃는 것보다 일어난 재작성을 부정하는 것이 나쁘다.
     `make backfill-owner-sub` writes a PLAN only and changes nothing; an operator deletes any entry
     they cannot vouch for, then `--apply <plan.json>` rewrites just the planned row ids. Cognito
     cannot say which sub owned an address *when a row was written*, so nothing is inferred —
     deleting a plan entry is how you refuse it. Only users whose Cognito `email_verified` is true are eligible — an unverified address never
     enters the plan, because honouring one here would undo verifyUser()'s check in the
     irreversible direction (the rewrite moves rows onto that sub permanently, and sub-keyed
     rows are fully trusted afterwards). Unmapped addresses (deleted OR unverified) are
     excluded from the plan and reported with the cause distinguished — as are addresses that more
     than one Cognito user maps to once lowercased (picking one would be a guess) and
     `report_schedules` rows whose target sub already has a schedule of that type (UNIQUE
     (user_sub, schedule_type) cannot merge them, and both enabled means the diagnosis runs twice).
     `--apply` re-checks both the DB and Cognito, then writes in a SINGLE TRANSACTION: if any planned
     row no longer holds its planned value, NOTHING is written and the whole apply rolls back — a
     half-transferred ownership table is worse than an untouched one. **Quiesce `awsops-v2-schedule-dispatcher` for the duration of the apply** — `disable-rule` stops
     new invocations but does NOT stop one already running, so wait past its 120s timeout and confirm
     zero Invocations in the last 5 minutes before applying (the script prints the commands), and re-enable it only after the residual check reads 0: the dispatcher reads an owner
     value, then INSERTs reports/jobs later, so a call in flight during the apply can create a fresh
     email-keyed row *after* the tool reported none were left — and step 3 would then hide it from
     its owner. Hourly schedule, so the window is narrow, not absent. Apply journals row ids BEFORE
     writing, since an UPDATE destroys the old value, and stamps the outcome
     (attempting/committed/rolled-back/unknown — `unknown` is a COMMIT whose response was lost, which
     must not be recorded as a rollback). Reverse ONLY by the journalled changed ids: `WHERE
     requested_by = <sub>` would also revert rows that legitimately hold that sub.
  3. `LEGACY_EMAIL_OWNER_MATCH=false` 로 배포(Terraform `legacy_email_owner_match`, 기본 **true**).
     Deploy with `LEGACY_EMAIL_OWNER_MATCH=false` (Terraform `legacy_email_owner_match`, default
     **true**).
- **비대칭 하나를 명시한다** — `schedule_dispatcher` 는 dual-key 를 쓸 수 **없다**: BFF 는 호출자 토큰이
  있어 email 을 알지만 dispatcher 는 `report_schedules.user_sub` 만 갖는다. 따라서 LEGACY 창 동안 예약
  진단의 `parent_report_id` 가 NULL 로 stamp 될 수 있고, 그 값은 INSERT 시 확정이라 이후 backfill 로도
  복구되지 않는다 → **예약 regression diff 를 신뢰하기 전에 backfill 을 먼저 돌린다.** dispatcher 가 이
  상황을 로그로 남기므로 조용히 사라지지는 않는다(사용자에게는 실패가 아니라 "변화 없음"으로 보인다).
  **Asymmetry, stated** — `schedule_dispatcher` CANNOT use the dual key: the BFF holds the caller's
  token and therefore their email, while the dispatcher has only `report_schedules.user_sub`. So
  during the legacy window a scheduled diagnosis can stamp `parent_report_id = NULL`, and that is
  fixed at INSERT, so no later backfill repairs it → **run the backfill before relying on scheduled
  regression diffs.** The dispatcher logs the situation so it does not vanish silently (to the user
  it otherwise reads as "no change" rather than "no baseline").
- **문서화로 닫히지 않는다** — 위 2·3 단계가 닫는다. / **Documentation does not close this** — steps 2
  and 3 do.

**Job 타입 (전부 read-only):** `noop`/`noop-heavy`(범용 `POST /api/jobs`) · `report`(진단 리포트 렌더, 사용자 경로 기준 `POST /api/diagnosis` 전용 — EventBridge `schedule_dispatcher.py`의 신뢰된 내부 직접 enqueue는 예외이며, 클라이언트가 넘긴 report_id로 다른 사용자 리포트를 위조/덮어쓸 수 있어 범용 라우트에서는 거부) · `compliance`(Powerpipe CIS 스캔, `POST /api/compliance/run` 전용, 동일 사유) · `datasource_index`(datasource index 갱신 — 범용 `POST /api/jobs` 로는 **제출 불가**, admin 전용 `POST /api/integrations/schema`·`POST /api/datasources/manage` 가 trigger) · `insight`(AI insight 생성 — 동일하게 범용 라우트 제출 불가, admin 전용 `POST /api/insights/refresh` 가 trigger) · **`incident_stage`**(인시던트 라이프사이클 단계 — 같은 `worker_jobs`+SQS spine 을 타지만 `dispatcher.py` 가 sibling 인시던트 Step Functions 로 라우팅. `incident_lifecycle_enabled` 게이트(ADR-032), 범용 라우트 제출 불가). 모든 job은 AWS-리소스를 변경하지 않는다.

**Job types (all read-only):** `noop`/`noop-heavy` (generic `POST /api/jobs`) · `report` (diagnosis report render — user-facing path `POST /api/diagnosis` only; the generic route rejects it since a client-supplied report_id could forge/overwrite another user's report) · `compliance` (Powerpipe CIS scan — `POST /api/compliance/run` only, same reason) · `datasource_index` (datasource index refresh — **not submittable** via the generic `POST /api/jobs`; triggered by the admin-only `POST /api/integrations/schema` and `POST /api/datasources/manage`) · `insight` (AI insight generation — likewise not via the generic route; triggered by the admin-only `POST /api/insights/refresh`) · **`incident_stage`** (incident-lifecycle stage — rides the same worker_jobs+SQS spine but `dispatcher.py` routes it to the sibling incident Step Functions; `incident_lifecycle_enabled`-gated per ADR-032, not submittable via the generic route). No job mutates AWS resources. `scripts/v2/workers/schedule_dispatcher.py` (EventBridge-triggered) enqueues `report` jobs directly for scheduled auto-diagnosis — a distinct, trusted internal path, not the user-facing `/api/diagnosis` route, so it doesn't go through the route's request-derived `requestedBy`.

**실행 substrate의 *mutating* 분기는 ADR-005가 관할하며 영구 동결(FROZEN, do-not-enable)이다.** 동일 spine 위에 설계됐던 AWS-리소스 변경 경로는 flag-OFF로 동결되어 있고 본 ADR의 범위가 아니다.

The *mutating* branch of this execution substrate is owned by ADR-005 and stays **permanently FROZEN (do-not-enable)** — it is out of scope for this ADR.

## Consequences / 결과

### Positive / 긍정

- thin-BFF + 워커 분리로 요청 경로가 경량·OOM 안전. 단일 내구 spine이 모든 비동기 read-only 작업을 처리.
- ledger-first + 멱등 dispatcher + reaper로 at-least-once 전달과 워커 크래시에도 상태가 결국 정합.
- `$.runtime` Choice로 짧은 작업(Lambda)과 긴/OOM 작업(Fargate)을 비용·안정성 최적으로 분리.
- `workers_enabled` 게이트로 유휴 비용 $0·기능 롤아웃 가역. ESM 킬스위치로 즉시 정지 가능.

### Negative / 부정

- 단일 spine을 여러 job 타입이 공유 → job 타입 추가 시 dispatcher 라우팅/Fargate 이미지 회귀 위험.
- SFN이 Aurora에 직접 쓸 수 없어 실패 경로가 status_updater Lambda + reaper의 2단 보정에 의존(직접 단순 경로 대비 복잡).
- at-least-once 전달이므로 모든 신규 job 핸들러는 멱등이어야 함(설계 제약).

### 6 Pillars — 안정성 · 운영 우수성 / Reliability · Operational Excellence

- **Reliability**: ledger-first 진실 원천(Aurora), 멱등 dispatcher(중복 흡수), Catch→status_updater(실패 표기), reaper 5분 정합(stale 보정) — 4중 안전망으로 작업이 유실되거나 영구 unknown 상태에 빠지지 않는다. `ecs:runTask.sync`로 OOM 위험 작업을 web 태스크에서 격리.
- **Operational Excellence**: `workers_enabled` 게이트(유휴 $0·가역 롤아웃) + ESM 킬스위치(즉시 정지) + EventBridge reaper(자동 정합) + Fargate `CMD` 규약(argv 회귀 방지)로 운영 가시성·통제·안전한 배포를 확보.

## References / 참조

- 컴포넌트 현행 출처: `docs/reference/06-workers.md`
- 코드: `scripts/v2/workers/{db,dispatcher,handlers,reaper,status_updater,worker_lambda,fargate_worker}.py` + `sfn.asl.json`, `terraform/v2/foundation/workers.tf`
- 현실 감사: `docs/reviews/2026-06-21-docs-reality-audit.md` §B6 (worker-01~19)
- 동결 substrate: ADR-005 (mutating 분기, FROZEN)
