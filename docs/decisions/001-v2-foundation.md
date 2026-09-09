# ADR-001: v2 파운데이션 — Terraform + thin-BFF + 비동기 워커 (CDK→Terraform)
# ADR-001: v2 Foundation — Terraform + thin-BFF + Async Workers (CDK→Terraform)

## Status
Accepted (2026-06-22) — consolidated. consolidates: 005, 024, 030, 037 (+001 pg Pool 결정)

## Context / 컨텍스트

AWSops v1은 단일 EC2 호스트(`t4g.2xlarge`)에서 자원 프로파일이 충돌하는 워크로드를 함께 돌렸다: 지연에 민감한 Next.js 서버, 메모리를 쓰는 임베디드 Steampipe PostgreSQL, CPU/IO 버스트가 큰 AgentCore Docker 빌드 파이프라인. 이 "단일 호스트 build+run" 결합은 빌드 시 웹 지연 스파이크와 Steampipe FDW 타임아웃을 유발했고, 애플리케이션 상태가 EC2 로컬 `data/*.json`에 머물러 내구성이 없었다. IaC는 CDK 3-stack(Awsops/Cognito/AgentCore) 분할이었는데, 이는 Lambda@Edge가 `us-east-1`에만 묶이는 리전 제약과 CloudFormation 미지원인 AgentCore API를 우회하려는 v1 구조였다.

(AWSops v1 co-located conflicting workloads on one EC2 host — a latency-sensitive Next.js server, a memory-heavy embedded Steampipe PostgreSQL, and a bursty AgentCore Docker build pipeline. This "single-host build+run" coupling caused web latency spikes and Steampipe FDW timeouts during builds, and application state lived in non-durable local `data/*.json`. The IaC was a CDK three-stack split (Awsops/Cognito/AgentCore), a v1 shape that routed around Lambda@Edge's `us-east-1` regional pin and the lack of stable CloudFormation for AgentCore.)

v2는 이 모놀리식을 Terraform 기반 MSA로 재구축한다. 옛 결정들의 net: ① 앱 상태를 Aurora로 이전(JSON 상태 계층 대체)하고 이중 ECR로 OSS 배포 경계를 만든다는 ADR-030의 **의도**는 유효하나, ② ADR-030이 기술한 구체 메커니즘(4개 ECS 서비스 + Service Connect Steampipe 데몬 + CDK 리팩터)은 그렇게 구현된 적이 없다. ③ v1의 라이브 Steampipe(pg Pool over CLI — ADR-001 / VPC Lambda + pg8000 — ADR-005)는 v2에서 라이브 조회 경로가 아니며, 라이브 AWS 조회는 AgentCore MCP Lambda 도구가 담당한다.

(v2 rebuilds this monolith as a Terraform-based MSA. The net of the legacy decisions: (1) ADR-030's **intent** — move app state to Aurora (replacing the JSON state layer) and create a dual-tier ECR boundary for OSS distribution — holds, but (2) ADR-030's described mechanism (four ECS services + a Service-Connect Steampipe daemon + a CDK refactor) was never built that way, and (3) v1's live Steampipe (pg Pool over CLI — ADR-001 / VPC Lambda + pg8000 — ADR-005) is not a live-query path in v2; live AWS queries go through AgentCore MCP Lambda tools.)

## Decision / 결정

1. **IaC = Terraform** — 단일 루트 `terraform/v2/foundation/` + **partial S3 backend**(`backend.hcl`, 버킷 `awsops-v2-tfstate`, `use_lockfile` — DynamoDB 잠금 테이블 없음). TF ≥ 1.15, provider `~> 6.0`. CDK는 v2에서 폐기. 공유 인프라 apply는 saved tfplan(`apply tfplan`) — `-auto-approve` 금지.
   (Terraform single root + partial S3 backend with `use_lockfile` (no DynamoDB). CDK retired for v2; shared-infra applies use a saved tfplan, no `-auto-approve`.)

2. **컴퓨트 = ECS Fargate (arm64)** — **thin-BFF 웹 서비스**(`awsops-v2-web`, Next.js 14 standalone, 루트 경로) + **flag-gated 비동기 워커 티어**. 무겁고·긴·OOM 위험 작업은 인라인 실행하지 않고 큐로 enqueue한다. v1의 `awsops-steampipe`/`awsops-alert-poller`/`awsops-jobs` 상시 컨테이너는 없으며, 그 책임은 워커 티어 또는 AgentCore로 매핑된다.
   (ECS Fargate (arm64): a thin-BFF web service + a flag-gated async worker tier. Heavy/long/OOM-risk work is enqueued, not run inline. No long-lived `awsops-steampipe`/`awsops-alert-poller`/`awsops-jobs` containers — their responsibilities map onto the worker tier or AgentCore.)

3. **비동기 워커 백본** — enqueue(범용 `POST /api/jobs` 는 `noop` 계열만, 도메인 작업은 소유권-스코프 라우트 `POST /api/diagnosis`·`POST /api/compliance/run`, 그 외는 내부 전용 — ADR-009) → `worker_jobs`(Aurora, ledger-first) + SQS → ESM 킬스위치 → dispatcher Lambda(멱등) → **Step Functions Standard**(`$.runtime` Choice) → Lambda(짧음) 또는 `ecs:runTask.sync` Fargate(긺/OOM) → 워커가 직접 running/succeeded 기록 → Catch 시 status_updater가 failed → reaper(5분)가 stale 정합화. 이것이 단일 내구 오케스트레이션 spine이다.
   (Async worker backbone: an enqueue — generic `POST /api/jobs` for `noop` types, ownership-scoped `POST /api/diagnosis` / `POST /api/compliance/run` for domain work, internal-only otherwise (ADR-009) — → `worker_jobs` (ledger-first) + SQS → ESM kill-switch → idempotent dispatcher Lambda → Step Functions Standard (`$.runtime` Choice) → Lambda (short) or `ecs:runTask.sync` Fargate (long/OOM) → worker writes running/succeeded; on Catch status_updater sets failed; reaper (5 min) reconciles stale. This is the single durable orchestration spine.)

4. **앱 상태 = Aurora Serverless v2 (PG 17.9)** — node-pg(`web/lib/db.ts`)로 접근, KMS CMK, RDS-관리 master secret, RDS Data API 활성. 스키마는 베이스라인 `terraform/v2/foundation/data/schema.sql`(v9 동결) + ULID 마이그레이션(`migrations/<ULID>_*.sql`, `make migrate`); schema.sql이 테이블 수의 source of truth. `data/*.json`(v1 패턴)은 미사용.
   (App state = Aurora Serverless v2 (PG 17.9) via node-pg, KMS CMK, RDS-managed master secret, RDS Data API enabled. Schema = baseline `data/schema.sql` (frozen at v9) + ULID migrations; schema.sql is the source of truth for table count. `data/*.json` is not used.)

5. **라이브 AWS 조회 = AgentCore MCP Lambda 도구.** v2에 라이브 Steampipe는 없다. flag-gated warm Steampipe 인벤토리 sync(Fargate + sync Lambda → Aurora)는 배치 로더로만 존재하며 기본 off다. v1의 pg-Pool/VPC-Lambda 호스트 가정(ADR-001/005)은 v2에서 무의미.
   (Live AWS queries = AgentCore MCP Lambda tools. No live Steampipe in v2. A flag-gated warm Steampipe inventory-sync (Fargate + sync Lambda → Aurora) exists as a batch loader only, default off. The v1 pg-Pool / VPC-Lambda host assumptions (ADR-001/005) are moot in v2.)

6. **엣지 = 비공개.** CloudFront(TLS) → **VPC Origin `https-only:443`** → **내부 ALB HTTPS:443**(리전 ACM) → HTTP → Fargate. 공개 ALB 없음. ALB SG는 CloudFront 관리형 SG에서 443 허용.
   (Edge = private. CloudFront (TLS) → VPC Origin `https-only:443` → internal ALB HTTPS:443 (regional ACM) → Fargate. No public ALB. ALB SG allows 443 from the CloudFront managed SG.)

7. **설정 출처 = SSM.** AgentCore(`/ops/awsops-v2/agentcore/*`)와 admin allowlist(`web/lib/admin.ts` — Cognito group 또는 SSM email list)가 SSM 기반. 부트스트랩/런타임 설정은 SSM/env이며 마운트된 `data/config.json`이 아니다.
   (Config source-of-truth = SSM for AgentCore and the admin allowlist. Bootstrap/runtime config is SSM/env, not a mounted `data/config.json`.)

8. **이중 ECR + flag 게이트.** dev-private / prod-public 이중 ECR(OSS 배포). 신규 대형 기능은 count/flag 게이트(`agentcore_enabled`, `workers_enabled`, `steampipe_enabled` 등 — 기본 false → `plan` = No changes, $0).
   (Dual-tier ECR (dev-private / prod-public) for OSS distribution. New large features are count/flag-gated — all default false → `plan` = No changes, $0 until toggled.)

## Consequences / 영향

### Positive / 긍정적
- v2 파운데이션의 단일 권위 기록 — 하위 ADR이 더 이상 존재하지 않는 CDK/EC2/Service-Connect-Steampipe 기반을 참조하지 않는다.
  (One authoritative record of the v2 foundation; downstream ADRs no longer reference a CDK/EC2/Service-Connect-Steampipe substrate that no longer exists.)
- thin-BFF + 워커 분리로 요청 경로가 경량·OOM-안전하고, 단일 내구 spine이 모든 비동기 작업을 처리한다.
  (The thin-BFF + worker split keeps the request path fast and OOM-safe; one durable spine serves all async jobs.)
- flag 게이트로 유휴 비용 0, 기능 롤아웃 가역.
  (Flag-gating keeps idle cost at $0 and makes feature rollout reversible.)

### Negative / 부정적
- DynamoDB 잠금 부재 → `use_lockfile`(S3 조건부 쓰기)에 의존하므로 동시 apply는 운영적으로 직렬화해야 한다.
  (No DynamoDB lock → relies on `use_lockfile` (S3 conditional writes); concurrent applies must be serialized operationally.)
- Steampipe가 기본 off라 인벤토리 페이지는 명시적 opt-in(`steampipe_enabled=true` + sync 실행)에 의존한다.
  (Steampipe default-off means inventory pages depend on an explicit opt-in.)
- Fargate는 EC2-backed ECS 대비 vCPU-시간 단가가 높고, Aurora Serverless v2는 유휴에도 최소 과금(0.5 ACU)이 발생한다.
  (Fargate has a higher per-vCPU-hour cost than EC2-backed ECS, and Aurora Serverless v2 incurs a minimum charge even when idle.)

### 주의 / Caveats
- v2는 **루트 경로(`/`)** 서빙 — v1의 `/awsops` basePath 규칙은 적용 안 됨(fetch는 `/api/*`).
  (v2 is served at the root path — the v1 `/awsops` basePath rule does not apply.)
- 운영 함정: SG `description` 불변(변경 시 SG replace가 ALB 의존성으로 hang) · ECS `secrets` valueFrom은 **실행 역할** 권한 필요 · Next.js standalone은 `HOSTNAME=0.0.0.0`을 런타임 env로 명시 · Fargate 워커 Dockerfile은 `CMD`(ENTRYPOINT 금지).
  (Operational traps: SG `description` is immutable; ECS `secrets` valueFrom needs the execution role; Next.js standalone needs `HOSTNAME=0.0.0.0` as a runtime env; Fargate worker Dockerfiles use `CMD`, not ENTRYPOINT.)

## 6 Pillars / 6 기둥

- **운영 우수성 (Operational Excellence)**: 단일 Terraform 루트 + saved-tfplan 게이트로 변경을 추적·검토 가능. 단일 워커 spine이 비동기 작업을 일관되게 오케스트레이션하고 reaper가 stale을 정합화한다.
  (One Terraform root + saved-tfplan gate makes change auditable; one worker spine orchestrates async work, reaper reconciles stale.)
- **안정성 (Reliability)**: 앱 상태를 내구성 있는 Aurora로 이전(ephemeral 로컬 JSON 폐기), 비공개 엣지 + 내부 ALB 헬스체크, SFN Catch + reaper로 실패 작업 정합화.
  (Durable Aurora state replaces ephemeral local JSON; private edge + internal ALB health checks; SFN Catch + reaper reconcile failures.)
- **보안 (Security)**: 비공개 엣지(공개 ALB 없음, CF 관리형 SG만 443 허용), TLS end-to-end, KMS CMK + RDS-관리 secret, SSM 설정 출처, ECS secrets는 실행 역할 최소권한.
  (Private edge (no public ALB), end-to-end TLS, KMS CMK + RDS-managed secret, SSM config source, least-privilege execution-role secrets.)
- **성능 효율 (Performance Efficiency)**: thin-BFF가 요청 경로를 가볍게 유지하고 무거운 작업은 워커로 분리, Aurora Serverless v2 0.5–4 ACU 자동 스케일, arm64 Graviton.
  (thin-BFF keeps the request path light, heavy work offloaded to workers; Aurora Serverless v2 0.5–4 ACU autoscale; arm64 Graviton.)
- **비용 최적화 (Cost Optimization)**: 모든 신규 기능 flag 게이트(기본 off → 유휴 $0), Aurora Serverless 자동 스케일, arm64 단가 우위.
  (All new features flag-gated (default off → idle $0); Aurora Serverless autoscale; arm64 cost advantage.)
- **지속 가능성 (Sustainability)**: arm64 Graviton + Serverless 자동 스케일·scale-to-floor로 유휴 자원 최소화.
  (arm64 Graviton + Serverless autoscale / scale-to-floor minimize idle resource use.)
