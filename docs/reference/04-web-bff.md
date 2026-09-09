# 04. Web thin-BFF — v2 Reference

## Purpose / 목적

**EN** — The v2 web tier: a deliberately **thin** Backend-for-Frontend. It serves the UI (SSR) plus a light `/api/*` layer and nothing heavy. Any long-running, memory-hungry, or fan-out work is **enqueued as a job**, never executed inline on the request path, so the web container stays small and fast to roll.

**KO** — v2 웹 계층은 의도적으로 **얇은** BFF다. UI(SSR)와 가벼운 `/api/*` 계층만 담당하고 무거운 작업은 하지 않는다. 장시간·고메모리·팬아웃 작업은 요청 경로에서 인라인 실행하지 않고 **잡(job)으로 큐잉**하여, 웹 컨테이너를 가볍고 빠르게 롤아웃 가능한 상태로 유지한다.

## Current design / 현행 설계

**EN**

- **Framework**: Next.js 14 thin-BFF in `web/`, App Router, `output: 'standalone'`, built for **arm64**.
- **Path**: served at the **root path `/`** — there is **no `basePath`** (v1's `/awsops` prefix is gone in v2).
- **Routes**:
  - `/api/health` — **public** liveness; the deploy smoke target and the health-check path for both the container and the ALB target group.
  - `/api/stream` — **SSE** stream (heartbeat ~15s, comfortably under the LB/CloudFront read timeouts).
  - `/api/db` — **Aurora ping** via the shared node-`pg` pool (`getPool` in `web/lib/db.ts`); returns a `public_tables` count or an `unconfigured` (503) response when `AURORA_ENDPOINT` is unset.
  - `/api/jobs` (+ `/api/jobs/[id]`) — **P2 async** job submission/lookup, but the *generic* route only accepts `noop`/`noop-heavy`. Heavy/long/OOM-risk work is never run inline — it's enqueued via `web/lib/jobs.ts` `enqueueJob()` (durable Aurora ledger row, then best-effort SQS), but on user-facing paths `report`/`compliance` are reachable only through their own ownership-scoped routes, `POST /api/diagnosis` and `POST /api/compliance/run`, which compute `requestedBy` server-side; the trusted `schedule_dispatcher.py` direct enqueue is an internal exception for scheduled reports. The generic route deliberately rejects those two types: they'd otherwise trust a client-supplied `report_id`/`run_id`/`requested_by` with no ownership check — a cross-user IDOR write closed in the PR #195 pentest remediation.
- **Image distribution — dual-tier ECR**: dev-private `awsops-v2-web` and prod-public `public.ecr.aws/r7z4t3s6/awsops-v2-web`.
- **Deploy loop**: `make deploy` → `scripts/v2/deploy.mjs`: ECR login → `buildx` arm64 build+push → ECS `force-new-deployment` → `aws ecs wait services-stable` → smoke `GET /api/health`.
- **Secret wiring**: the Aurora master secret is injected via the ECS task definition `secrets` `valueFrom` (`AURORA_USER`/`AURORA_PASSWORD`), resolved by the **execution role** at task start.

**KO**

- **프레임워크**: `web/`의 Next.js 14 얇은 BFF, App Router, `output: 'standalone'`, **arm64** 빌드.
- **경로**: **루트 경로 `/`** 에서 서비스 — **`basePath` 없음** (v1의 `/awsops` 접두사는 v2에서 제거).
- **라우트**: `/api/health`(공개 liveness, 배포 스모크 + 컨테이너/타깃그룹 헬스 경로), `/api/stream`(SSE, ~15s 하트비트), `/api/db`(node-`pg` 공유 풀 `getPool`로 Aurora ping), `/api/jobs`(+`/[id]`, P2 비동기 — 단 범용 라우트는 `noop`/`noop-heavy`만 허용). 무거운 작업은 인라인 실행 없이 `web/lib/jobs.ts`의 `enqueueJob()`으로 큐잉되지만, 사용자 경로 기준 `report`/`compliance`는 범용 라우트가 아니라 각자의 소유권-스코프 전용 라우트(`POST /api/diagnosis`, `POST /api/compliance/run`, 둘 다 `requestedBy`를 서버 측에서 계산)로만 도달 가능하며 예약 리포트의 신뢰된 `schedule_dispatcher.py` 내부 직접 enqueue는 예외다 — 클라이언트가 넘긴 `report_id`/`run_id`/`requested_by`를 소유권 검증 없이 신뢰하면 cross-user IDOR write가 되므로(PR #195 pentest-remediation에서 차단) 범용 라우트는 이 두 타입을 거부한다.
- **이미지 배포 — 듀얼 티어 ECR**: dev-private `awsops-v2-web`, prod-public `public.ecr.aws/r7z4t3s6/awsops-v2-web`.
- **배포 루프**: `make deploy` → `scripts/v2/deploy.mjs` (login → buildx arm64 push → ECS force-new-deployment → wait stable → `/api/health` 스모크).
- **시크릿 주입**: Aurora 마스터 시크릿을 ECS task def의 `secrets` `valueFrom`(`AURORA_USER`/`AURORA_PASSWORD`)로 주입 — **실행 역할(execution role)** 이 태스크 시작 시 해석.

## Decisions (ADRs) / 결정

- **ADR-001** — v2 foundation: ECS Fargate workload + Aurora split (the v2 workload topology this component runs on). → [`../../decisions/001-v2-foundation.md`](../../decisions/001-v2-foundation.md)
- **ADR-024 (legacy → consolidated into ADR-001)** — CDK three-stack split (v1 precedent; **superseded** by the Terraform-based v2 foundation). → [`../../decisions/001-v2-foundation.md`](../../decisions/001-v2-foundation.md)

## Key files / 핵심 파일

| File | Role |
|------|------|
| `web/app/api/health/route.ts` | Public liveness; smoke + health-check target |
| `web/app/api/stream/route.ts` | SSE stream (heartbeat ~15s) |
| `web/app/api/db/route.ts` | Aurora ping via `getPool` |
| `web/app/api/jobs/route.ts` | P2 async job submit/list (`noop`/`noop-heavy` only) + ledger write + SQS enqueue |
| `web/app/api/jobs/[id]/route.ts` | P2 async job lookup by id (ownership-gated) |
| `web/lib/jobs.ts` | `enqueueJob()` — durable ledger write + best-effort SQS send, shared by `/api/jobs`, `/api/diagnosis`, `/api/compliance/run` |
| `web/app/api/diagnosis/route.ts` | Diagnosis report job submission — computes `requestedBy` server-side, not client-supplied |
| `web/app/api/compliance/run/route.ts` | CIS compliance scan job submission — computes `requestedBy` server-side, not client-supplied |
| `web/lib/db.ts` | Shared node-`pg` Pool (`getPool`) |
| `web/Dockerfile` | Multi-stage standalone arm64 build (sets `HOSTNAME=0.0.0.0`) |
| `terraform/v2/foundation/workload.tf` | ECS cluster/service/task def, ALB, TG, IAM roles, secret injection |
| `terraform/v2/foundation/ecr.tf` | Dual-tier ECR (dev-private repo + prod-public repo) |
| `scripts/v2/deploy.mjs` | `make deploy` loop: build → push → roll → wait → smoke |

## Status / 상태

**P1d ✅ GREEN.** — Web image live, dual-tier ECR, `make deploy` loop, Aurora secret wired, container + ALB health on `/api/health`.

## Learnings & gotchas / 학습·함정

Reuse-critical, in priority order:

1. **`HOSTNAME=0.0.0.0` must be a runtime env in the ECS task def — not just an image ENV.** An image-level `ENV HOSTNAME=0.0.0.0` is **overwritten by ECS** with the container's ENI IP. Next.js standalone then binds **only the ENI IP**, so the `127.0.0.1` container healthcheck fails → circuit-breaker rolls the deploy back. Set `HOSTNAME=0.0.0.0` explicitly in the task definition's container `environment`.
   - **KO** — 이미지 레벨 `ENV HOSTNAME`은 ECS가 컨테이너 ENI IP로 덮어쓴다. standalone이 ENI IP에만 바인딩 → `127.0.0.1` 컨테이너 헬스체크 실패 → 서킷 브레이커 롤백. **task def `environment`에 `HOSTNAME=0.0.0.0`를 명시**해야 한다.

2. **Health path must be `/api/health` in BOTH places** — the container healthcheck command AND the ALB target-group health path. A mismatch fails health checks and circuit-breaker-loops the rollout.

3. **ECS `secrets` `valueFrom` needs perms on the EXECUTION role, not the task role.** The execution role resolves secrets at task start; missing `secretsmanager:GetSecretValue` / `kms:Decrypt` there causes `ResourceInitializationError`.

4. **`web/` was previously a Docusaurus guide site.** It was relocated to `docs-site/` before the v2 web app went in. Always `ls` a directory before declaring it "new" — the original plan hadn't inspected `web/`, which forced an unplanned relocation task.

## Source / 출처

- Plan (to be archived): `docs/superpowers/archive/2026-05-31-awsops-v2-p1d-web-cicd-auth.md` (currently at `docs/superpowers/plans/2026-05-31-awsops-v2-p1d-web-cicd-auth.md`).
- Readiness / cross-AI review: [`docs/reviews/v2-p1d-readiness-architecture-review.md`](../../reviews/v2-p1d-readiness-architecture-review.md).
- Root `CLAUDE.md` — HOSTNAME / arm64 deployment gotchas.
