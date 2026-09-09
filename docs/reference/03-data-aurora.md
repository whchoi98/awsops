# 03. Data / Aurora — v2 Reference

## Purpose / 목적

AWSops v2의 **애플리케이션 상태 저장 계층**. v1이 `data/*.json` 파일로 관리하던
상태(인벤토리/비용 스냅샷, AgentCore 메모리·통계, 알림 진단, 이벤트 스케일링 플랜,
리포트 스케줄)를 Aurora PostgreSQL로 이전한다. **Steampipe 대체가 아니라 v1 JSON
상태 계층의 대체**다 — v2에 **라이브 Steampipe는 없다**(라이브 AWS 조회는 AgentCore
MCP Lambda). 단, 인벤토리 적재용 **flag-gated warm Steampipe Fargate→Aurora 배치
sync**(`var.steampipe_enabled`, 기본 off, `steampipe.tf`)는 존재한다 — 상시
Service Connect 라이브 쿼리 데몬이 아닌 배치 로더다. (ADR-001 참조.)

The v2 **application-state store**. It replaces v1's `data/*.json` state layer
(inventory/cost snapshots, AgentCore memory + stats, alert diagnosis, event-scaling
plans, report schedules) with Aurora PostgreSQL. It replaces the **v1 JSON state
layer, NOT Steampipe**. v2 has **no *live* Steampipe** (live AWS queries go through
AgentCore MCP Lambda tools); the only Steampipe is a **flag-gated warm
inventory-sync batch** (`var.steampipe_enabled`, default off, `steampipe.tf`) that
loads inventory into Aurora — not a Service-Connect live-query daemon. (See ADR-001.)

## Current design / 현행 설계

- **Cluster**: Aurora Serverless v2 `awsops-v2-aurora`, **PostgreSQL 17.9**,
  `engine_mode = provisioned`, scaling **0.5–4 ACU**, single writer instance
  (`awsops-v2-aurora-1`, `db.serverless`).
- **Database**: `awsops`. **Endpoint**:
  `awsops-v2-aurora.cluster-ch0io48c0dqx.ap-northeast-2.rds.amazonaws.com:5432`.
- **Encryption**: KMS CMK (`alias/awsops-v2-aurora`) for both storage
  (`storage_encrypted`) and the master-user secret.
- **Credentials**: RDS-managed master secret (`manage_master_user_password = true`,
  master username `awsops_admin`) in Secrets Manager — exposed as output
  `aurora_secret_arn`. The app reads this in P1d.
- **Network**: lives in the reused `mgmt-vpc` private subnets (DB subnet group
  `awsops-v2-aurora`). SG `awsops-v2-aurora-sg` allows **:5432 from the app/Fargate
  service SG**, plus an optional VPC-CIDR ingress (gated by `var.allow_vpc_db_access`)
  for in-VPC schema migration from the deploy host.
- **Backups**: 7-day retention. `deletion_protection = false` + `skip_final_snapshot = true`
  (dev-only — flip both for prod).
- **Schema**: the **ADR-001 baseline schema** (Phase-1 7-table baseline, **frozen**; expanded since via ULID `migrations/*` — current table count per `schema.sql`, incl. incident/k8s/integrations/topology/ai_usage/accounts) + a P2 `worker_jobs` table, applied via
  `psql` from an in-VPC deploy host. Tracked by a `schema_migrations` table.
  Idempotent (`CREATE TABLE IF NOT EXISTS` throughout).
- **App access**: **node-pg** (`web/lib/db.ts`). No *live* Steampipe in v2 — live AWS
  queries go through AgentCore MCP Lambda tools; a flag-gated warm Steampipe→Aurora
  inventory-sync batch (default off) is the only Steampipe usage (ADR-001).

### ADR-001 schema tables / 스키마 테이블

| Table | Replaces (v1) | Notes |
|-------|---------------|-------|
| `schema_migrations` | — | applied-version tracker; seeded with version 1 |
| `inventory_snapshots` | `data/inventory/<account>/*.json` | `(account_id, captured_at)` indexes; JSONB `payload` |
| `cost_snapshots` | `data/cost/<account>/*.json` | UPSERT on `(account, period, granularity)` |
| `agentcore_memory` | `data/memory/<user>/*.json` | per-user, 365-day TTL via `expires_at` (ADR-004) |
| `agentcore_stats` | `data/agentcore-stats.json` | append-only event log; token columns |
| `alert_diagnosis` | `data/alert-diagnosis/*.json` | GIN indexes on `services`/`resources` arrays |
| `event_scaling_plans` | `data/event-scaling/*.json` | `status` CHECK mirrors `EventStatus` (ADR-010) |
| `report_schedules` | `data/report-schedule.json` | unique per `(user_sub, schedule_type)`, **and at most one ENABLED row per user** — `uq_schedule_one_active`, a partial unique index `(user_sub) WHERE enabled` (migration 01KZ3C7Q). The dispatcher fires every enabled row, so two would double the diagnosis; `upsertSchedule()` disables the other frequencies in the same transaction |
| `worker_jobs` (P2) | — | async worker job ledger; orthogonal to the 7 app-state tables |

`updated_at` auto-touch triggers cover `cost_snapshots`, `event_scaling_plans`,
`report_schedules`, and `worker_jobs`.

## Decisions (ADRs) / 결정

- **ADR-001** — Aurora replaces the v1 `data/*.json` state layer (NOT Steampipe).
  Defines the Phase 1 7-table schema and the ECS Fargate + Aurora split.
  See [`../../decisions/001-v2-foundation.md`](../../decisions/001-v2-foundation.md).

## Key files / 핵심 파일

- `terraform/v2/foundation/data.tf` — KMS key + alias, DB subnet group, SG,
  Aurora cluster + writer instance, RDS-managed master secret.
- `terraform/v2/foundation/data/schema.sql` — ADR-001 7-table schema + `schema_migrations`
  + P2 `worker_jobs` (idempotent).
- The root `.gitignore` `data/` rule has a `!terraform/v2/foundation/data/` carve-out,
  so `schema.sql` is source-controlled (same pattern as `infra-cdk/data/`).
- `web/lib/db.ts` — node-pg connection (consumed in P1d, not P1c).

## Status / 상태

- **P1c** ✅ — cluster provisioned + 7-table schema applied.
- **PostgreSQL 15 → 17.9 major in-place upgrade** ✅ — Serverless v2 retained,
  endpoint and master secret unchanged.

## Learnings & gotchas / 학습·함정

**Major-upgrade procedure (reuse-critical) / 메이저 업그레이드 절차 (재사용 핵심):**

1. Set the **EXACT minor** (`engine_version = "17.9"`, not `"17"`) +
   `allow_major_version_upgrade = true` + `apply_immediately = true`.
2. **Apply FIRST** — this performs the upgrade (a synchronous reboot, not deferred
   to a maintenance window).
3. **THEN** add `lifecycle { ignore_changes = [engine_version] }` to **BOTH** the
   `aws_rds_cluster` and the `aws_rds_cluster_instance` — this absorbs future AWS
   auto-MINOR upgrades (17.x→17.y) without surfacing Terraform drift.

**Other gotchas / 기타 함정:**

- Pinning just `"17"` **misbehaves on `aws_rds_cluster`** — the provider's prefix
  diff-suppress is implemented only for `aws_db_instance`. Use the exact minor.
- SG `description` is **immutable** — changing it forces a replace.
- `deletion_protection = false` + `skip_final_snapshot = true` are **dev-only** —
  flip both (and set `final_snapshot_identifier`) for prod.
- A **pre-upgrade manual snapshot is the rollback anchor** — a major in-place
  *downgrade* is impossible.
- The schema is idempotent and applied via `psql` from an in-VPC deploy host; if
  the host can't reach Aurora, confirm the VPC-CIDR ingress + that the host is in
  `mgmt-vpc`.

## Source / 출처

- `docs/superpowers/archive/2026-05-31-awsops-v2-p1c-aurora.md` (archived P1c plan).
- Verified against `terraform/v2/foundation/data.tf`,
  `terraform/v2/foundation/data/schema.sql`, and the root `CLAUDE.md` Aurora-upgrade
  gotcha ("알려진 이슈" / known issues).
