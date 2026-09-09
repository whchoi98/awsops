# 06. Async Worker Backbone — v2 Reference

## Purpose / 목적

**EN** — A managed async backbone that lifts heavy, long-running, or OOM-prone work off the
web request path. The web tier stays a thin BFF; a worker can OOM, hang, or crash without
affecting web availability. P2 shipped the backbone with a synthetic proof workload (`noop`/
`noop-heavy`); it now also carries real read/compute-only workloads — diagnosis report
rendering (`report`) and CIS compliance scans (`compliance`) — enqueued through their own
ownership-scoped routes (`POST /api/diagnosis`, `POST /api/compliance/run`). Every job type on
this backbone is read-only / computation-only and never mutates AWS resources; AWS-resource
mutation stays FROZEN per ADR-005 (do-not-enable) — any future async work stays within this
same read-only substrate, not an escalation path for mutating actions.

**KO** — 무겁거나 오래 걸리거나 OOM 위험이 있는 작업을 web 요청 경로에서 떼어내는 관리형 비동기
백본. web은 thin BFF로 유지되고, 워커가 OOM·행·크래시로 죽어도 web 가용성은 무영향. P2는 백본 +
합성 증명 워크로드(`noop`/`noop-heavy`)로 시작했고, 현재는 실제 read/compute-only 작업도 이 위에서
돈다 — 진단 리포트 렌더링(`report`)과 CIS 컴플라이언스 스캔(`compliance`)이 각자의 소유권-스코프
전용 라우트(`POST /api/diagnosis`, `POST /api/compliance/run`)로 enqueue된다. 이 백본의 모든 job
타입은 read-only/계산 전용이며 AWS 리소스를 변경하지 않는다 — AWS 리소스 변경은 ADR-005에 따라
영구 동결(FROZEN, do-not-enable)이며, 향후 추가되는 비동기 작업도 같은 read-only substrate 안에
머문다(mutate 작업으로 가는 확장 경로가 아니다).

## Current design / 현행 설계

**Flow / 흐름**

```
web POST /api/jobs (noop/noop-heavy only), POST /api/diagnosis, POST /api/compliance/run
  → lib/jobs.ts enqueueJob() → INSERT worker_jobs (status=queued) + SQS SendMessage {job_id, type, payload, dry_run}
  → SQS Event Source Mapping  ← THE KILL-SWITCH (enable/disable this ESM to pause/resume all dispatch)
  → dispatcher Lambda (no VPC; idempotent on job_id; type-guard: registry-only, mutate/unknown rejected)
  → Step Functions (STANDARD)
       Choice on $.runtime:
         ├─ RunLambda  → worker Lambda           (short jobs, <15min)
         └─ RunFargate → ecs:runTask.sync         (long / OOM-risk jobs, arm64)
       the worker itself: claims running → writes succeeded
       on any Catch → status_updater Lambda sets failed   ← SFN cannot write VPC-only Aurora
       → JobFailed
  reaper Lambda (EventBridge rate(5 min)) reconciles stale rows (running→failed; queued→failed when ESM enabled)
```

**EN** — `POST /api/jobs` accepts only `noop`/`noop-heavy` (the generic route rejects `report`/
`compliance`: those trust a client-supplied `report_id`/`run_id`/`requested_by` with no ownership
check — pentest-remediation, PR #195). Diagnosis reports go through `POST /api/diagnosis` and
compliance scans through `POST /api/compliance/run`, both of which call the same `lib/jobs.ts`
`enqueueJob()` used by `/api/jobs`, computing `requestedBy` server-side. Whichever route calls it,
`enqueueJob()` writes the durable ledger row first (source of truth), then best-effort
SQS send. The dispatcher Lambda runs outside the VPC (reaches SQS/SFN APIs directly), validates
the job type against the `handlers.py` registry (read/compute only — mutate/unknown rejected per
ADR-005), and calls `StartExecution(name=job_id)` — the execution name gives transport-level
idempotency (`ExecutionAlreadyExists` is treated as success). Step Functions Standard routes on
`$.runtime`: a `RunLambda` state for short jobs, or `ecs:runTask.sync` Fargate for long/OOM-risk
jobs. The worker claims `running` and writes `succeeded` itself. Because SFN cannot issue SQL to
VPC-only Aurora (RDS Data API not adopted), the `Catch` path invokes a VPC-attached
`status_updater` Lambda to set `failed`. A reaper (EventBridge, every 5 min) reconciles orphaned
rows. **Everything is gated by `workers_enabled` (default false → `terraform plan` = No changes,
$0 idle).**

**KO** — `POST /api/jobs`는 `noop`/`noop-heavy`만 허용(범용 라우트는 `report`/`compliance`를 거부 —
클라이언트가 넘긴 `report_id`/`run_id`/`requested_by`를 소유권 검증 없이 신뢰하게 되므로,
pentest-remediation PR #195). 진단 리포트는 `POST /api/diagnosis`, 컴플라이언스 스캔은
`POST /api/compliance/run`을 통하며, 둘 다 `/api/jobs`와 동일한 `lib/jobs.ts`의 `enqueueJob()`을
호출하고 `requestedBy`는 서버 측에서 계산한다. 어느 라우트를 거치든 `enqueueJob()`이 내구성 있는
ledger 행을 먼저 쓰고(권위), 그 다음 best-effort SQS send. 디스패처 Lambda는 VPC 밖에서 동작(SQS/SFN API 직접 접근)하고 `handlers.py` 레지스트리로 타입을
검증(read/compute만 — mutate/unknown 거부, ADR-005)한 뒤 `StartExecution(name=job_id)` 호출 —
실행명이 transport 멱등을 제공(`ExecutionAlreadyExists`는 성공 처리). Step Functions Standard가
`$.runtime`으로 라우팅: 짧은 잡은 `RunLambda`, 길거나 OOM 위험인 잡은 `ecs:runTask.sync` Fargate.
워커가 직접 `running`을 claim하고 `succeeded`를 쓴다. SFN은 VPC-only Aurora에 직접 SQL을 못 쓰므로
(RDS Data API 미채택), `Catch` 경로가 VPC-attached `status_updater` Lambda를 호출해 `failed`로
전이한다. reaper(EventBridge, 5분마다)가 고아 행을 보정. **모든 것이 `workers_enabled`로 게이트됨
(기본 false → `terraform plan` = No changes, 유휴 $0).**

## Decisions (ADRs) / 결정

- **[ADR-005 — AWS mutation & autonomy (FROZEN)](../../decisions/005-aws-mutation-autonomy-frozen.md)** — P2
  implements the *safety hooks* (idempotency token, kill-switch, mutate/unknown-type guard, dry-run
  pass-through) as a dark/inactive substrate for a potential future mutate-action registry — this is
  architecturally reserved, not an implicit escalation path. AWS-resource mutation stays FROZEN per
  ADR-005; turning any of this into live mutating operations (approval workflow, first-class rollback,
  the mutate-action registry itself) requires a new ADR decision, not just implementation work.
  / P2가 구현한 안전 훅(멱등 토큰·킬스위치·mutate/unknown 타입 가드·dry-run 통과)은 향후 있을 수 있는
  mutate-action 레지스트리를 위해 architecturally 예약된 dark/inactive substrate일 뿐, 암묵적 확장
  경로가 아니다. AWS 리소스 변경은 ADR-005에 따라 계속 FROZEN이며, 이를 실제 mutate 작업(승인
  워크플로·1급 롤백·mutate-action 레지스트리 자체)으로 전환하려면 구현이 아니라 새 ADR 결정이
  필요하다.
- **[ADR-001 — v2 foundation (ECS/Fargate + Aurora split)](../../decisions/001-v2-foundation.md)** — the job
  ledger is the Aurora `worker_jobs` table (an infra table orthogonal to the 7 app-state tables); the
  worker_jobs row, not the SFN execution status, is the source of truth.
  / 잡 ledger는 Aurora `worker_jobs` 테이블(7개 app-state 테이블과 직교하는 인프라 테이블); 권위는
  SFN 실행 상태가 아니라 worker_jobs 행.

## Key files / 핵심 파일

| File / 파일 | Role / 역할 |
|---|---|
| `terraform/v2/foundation/workers.tf` | All P2 infra, gated on `var.workers_enabled` (SQS+DLQ, S3 results, SFN Standard, 4 Lambdas, Fargate task def, ECR, IAM, reaper schedule, kill-switch ESM, web SQS grant) |
| `scripts/v2/workers/db.py` | Shared Aurora access (pg8000) + `worker_jobs` CRUD with conditional, terminal-immutable transitions |
| `scripts/v2/workers/dispatcher.py` | SQS-triggered: type guard + `StartExecution` (`ExecutionAlreadyExists`=ok) + `ReportBatchItemFailures` |
| `scripts/v2/workers/handlers.py` | Job-type registry (read/compute only; `noop`→lambda, `noop-heavy`→fargate) |
| `scripts/v2/workers/worker_lambda.py` | SFN-invoked short worker: claim running → run handler → succeeded/failed |
| `scripts/v2/workers/status_updater.py` | SFN Catch-invoked: set `failed`+error conditionally (the SFN→VPC-Aurora bridge) |
| `scripts/v2/workers/reaper.py` | EventBridge-scheduled stale-job reconciliation (running→failed; queued→failed when ESM enabled) |
| `scripts/v2/workers/fargate_worker.py` | Fargate entrypoint `--job-id [--oom]`; long task / OOM demo |
| `scripts/v2/workers/sfn.asl.json` | Step Functions ASL (Choice lambda/fargate, Retry, Catch→status_updater); Terraform `templatefile` vars |
| `web/app/api/jobs/route.ts` | `POST` enqueue for `noop`/`noop-heavy` only; `GET` lists the caller's own jobs (admins see all) |
| `web/app/api/jobs/[id]/route.ts` | `GET` job status/result by id, owner-or-admin only |
| `web/lib/jobs.ts` | Shared `enqueueJob()` (ledger insert + SQS send; `ON CONFLICT` idempotency dedup) — used by `/api/jobs`, `/api/diagnosis`, `/api/compliance/run` |
| `web/lib/db.ts` | Shared `getPool()` (node-postgres) used by jobs routes |
| `scripts/v2/workers.mjs` | `make workers`: build+push the arm64 Fargate worker image |

## Status / 상태

**P2 ✅ — W9 GREEN, 5/5 verified.**

1. Lambda path: `noop` job → executed off the web path → `succeeded`.
2. Fargate path: `noop-heavy` job → `succeeded`.
3. OOM isolation (core criterion): Fargate `--oom` via SFN → exit 137 → `Catch` → status_updater
   sets `failed`, **web (ECS awsops-v2-web) stays healthy/serving — unaffected.**
4. Kill-switch: disable the SQS→dispatcher ESM → jobs stay `queued` (no dispatch); re-enable → resume.
5. Idempotency: duplicate `job_id` / `idempotency_key` → single job.

**Outputs:** `jobs_queue_url`, `workers_state_machine_arn`, `dispatcher_esm_uuid`, `worker_ecr_uri`.

## Learnings & gotchas / 학습·함정

These are reuse-critical — re-read before extending the backbone.

- **Fargate Dockerfile must use `CMD`, not exec-form `ENTRYPOINT`.** SFN
  `containerOverrides.command` **REPLACES** a `CMD` but is **APPENDED** to an `ENTRYPOINT` →
  argv doubles → argparse dies → every Fargate job fails. / SFN의 command override는 CMD를
  치환하지만 ENTRYPOINT엔 덧붙음 → argv 중복 → argparse 실패.
- **SQS ESM disable has ~1–2 min poller-drain latency.** A kill-switch test must wait ~120 s after
  `State=Disabled` before asserting "stays queued." / ESM disable는 폴러 드레인에 ~1–2분 → 킬스위치
  테스트는 Disabled 후 ~120초 대기 후 assert.
- **`pg8000` is vendored as a Lambda layer** (pure-python, arch-agnostic) — attached to
  worker/status/reaper only; dispatcher needs no DB. / `pg8000`은 Lambda 레이어로 벤더링(순수 파이썬,
  아키텍처 무관); 디스패처는 DB 불요.
- **Reuse the existing `aws_security_group.service`** for the worker Lambdas + Fargate. The P1c
  Aurora SG uses inline ingress that already allows `service`; adding a standalone SG/ingress rule
  causes a perpetual diff. / 기존 `aws_security_group.service` 재사용 — Aurora SG 인라인 ingress가
  이미 허용; 별도 SG/규칙 추가 시 영구 drift.
- **Put `lifecycle { ignore_changes = [enabled] }` on the dispatcher ESM** so an out-of-band
  kill-switch pause survives later `terraform apply`. / ESM에 `ignore_changes=[enabled]` — 수동
  킬스위치 정지가 이후 apply에도 유지되도록.
- **The reaper `RUNNING_STALE_MIN` (75) must EXCEED the Fargate SFN `TimeoutSeconds` (3600 s =
  60 min)** or a ~60-min job races reap-vs-finish (reaper marks `failed`, the later `succeeded` is
  silently dropped by terminal-immutability). / reaper `RUNNING_STALE_MIN`(75)은 Fargate SFN
  `TimeoutSeconds`(3600s=60분)를 초과해야 함 — 아니면 ~60분 잡이 reap-vs-finish 경합.
- **SFN `.sync` briefly shows RUNNING after the worker already wrote `succeeded`** (task-stop
  polling lag). The `worker_jobs` ledger is the source of truth, not the SFN status. / SFN `.sync`는
  워커가 succeeded를 쓴 뒤에도 잠시 RUNNING 표시(task-stop 폴링 지연); 권위는 worker_jobs ledger.

## Source / 출처

Consolidated from the archived P2 design + plan (cite the future `archive/` paths):

- `docs/superpowers/archive/2026-06-02-awsops-v2-p2-async-worker-backbone-design.md`
- `docs/superpowers/archive/2026-06-02-awsops-v2-p2-async-worker-backbone.md`
