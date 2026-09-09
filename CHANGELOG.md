# Changelog

[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#korean)

---

<a id="english"></a>

# English

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added


## [0.9.0] - 2026-08-22

### Added

- Add a topology diagram + resilience assessment to the Direct Connect page (modeled on aws-samples/sample-network-resilience-agent, fitted to the house React Flow conventions): an on-premises → DX location → connection/LAG → VIF → DX Gateway → TGW/VGW layered graph (dagre layout, state-colored nodes/edges — down connections and BGP-down VIFs in red, degraded LAGs and non-associated gateway links in amber/dashed, unattached VIFs dashed), node click opens the existing side detail panel, and a resilience card scoring the AWS Direct Connect SLA tier (Maximum 99.99% = 2+ connections at each of 2+ locations · High 99.9% = 2+ locations · Single 95%) with a critical/warn checklist (connection/VIF health, location redundancy, per-location dual connections, unassociated DXGWs, unattached VIFs) — built entirely from data the page already fetches, no new AWS API calls; 4-language i18n.

## [0.8.0] - 2026-08-19

### Added

- Make the dashboard installable as an iPhone/iPad home-screen app (PWA): web app manifest (standalone display, root scope) + Apple meta tags (apple-touch-icon, apple-mobile-web-app-capable) + 4 generated icons (180 full-bleed apple-touch, 192/512 rounded, 512 maskable), all served without the auth cookie via new Lambda@Edge public-allowlist entries (iOS fetches manifest/icons credential-less — a 3-way lockstep test pins manifest ↔ public/ files ↔ edge allowlist). Safe-area handling for notch devices (viewport-fit=cover with top/bottom/left/right env() padding on the mobile shell, scroll-gap compensation for the grown tab bar), and the browser theme-color meta now tracks the runtime theme (cobalt/teal/dark) instead of tinting dark screens cobalt. No service worker by design: live authenticated ops data gains nothing from offline caching, and iOS install does not require one.
- Rework the Network Firewall rule-hit table for readability and interactivity: the hand-rolled table is replaced with the shared MetricTable (header-click sort on every string/number column, text search, per-element action facets, danger-rows-only toggle), clicking a row opens the rule in the standard side detail panel (SID, rule groups, tri-state hit basis and why-n/a note), and two hit-count charts are added — an action-distribution donut fed by the untruncated per-action aggregation (matches the card badges) and a top-10 rule hits bar with an explicit notice when the top-100 SID aggregation is truncated. MetricTable itself gains three opt-in props reused here: multi-value facets (element-level matching so filtering 'blocked' also matches 'drop, blocked' rows), a render-stage row cap that keeps search/sort operating on the full set while preserving idle rules, and a per-row class hook (restores the idle-rule dimming).
- Add stateful rule hit counts to the Network Firewall page (the 2026-08 AWS feature, which aggregates existing Alert logs rather than exposing a new API — verified against the API reference, latest botocore, and CloudWatch): the Alert-log card now aggregates hits per (SID, signature, action) over the CloudWatch Logs destination (limit 100) and joins them with the SIDs parsed server-side from configured stateful rule groups (sid/msg/action only — rule bodies still never leave the server), surfacing configured rules with zero matches in range (policy blind spots / shadow rules); pass rules are honestly rendered n/a since they emit no alert log entries, and unknown SIDs (managed rule groups) are labeled as such.
- Add security group usage analysis to the Security Group inventory page (`/api/sg`): usage detection (attached via ENI `Groups` + cross-referenced as a source by other SGs → flags unused cleanup candidates), rule source/destination identification (sg-references resolved to names, CIDRs matched to inventory VPC names, `0.0.0.0/0`·`::/0` → whole-internet, `pl-` → managed prefix-list names), and per-SG traffic **hit matching** on row click — VPC Flow Logs (CloudWatch Logs destination, default-format parse, exact per-rule matches with ACCEPT/REJECT) with an NFM fallback (top-contributors over all categories, 1h cap) that identifies traffic peers only — NFM aggregates bytes bidirectionally so hits are never attributed to rules (no false idle signals), honestly labeled; idle inbound rules (no match in range) surfaced; KPI tiles + attached-kind donut; read-only `ec2:DescribeSecurityGroups`/`DescribeManagedPrefixLists`/`DescribeFlowLogs` IAM (applied, terraform in lockstep); 4-language i18n.
- Add a Network Firewall page (`/network-firewall`, Network group): firewall / policy / rule group inventory with per-region fan-out and `AWS/NetworkFirewall` traffic aggregation over the selected range (received / passed / dropped / rejected packets and drop rate; only the 3-dimension `(AZ, Engine, FirewallName)` metric variant is summed — the `EndpointName` variant is published in parallel and would double-count), plus five analysis lenses — protection settings off (delete / subnet change / policy change), ALERT-logging gaps (no threat visibility; a denied describe call renders as “unknown”, distinct from “off” — observed with an SCP-style deny that hits only the task role), `aws:pass` stateless default actions (traffic bypasses the stateful engine), rule group capacity (immutable after creation, flagged at 80%+) and unassociated rule groups (cleanup candidates), and per-AZ endpoint / config-sync health; KPI tiles, type/capacity charts, a firewall-checks card, three tables with sectioned detail panels; rule bodies (`RulesSource`) are deliberately excluded from responses; read-only `network-firewall:List*`/`Describe*` IAM grant (applied, terraform in lockstep); 4-language i18n. Per the owner's monitoring guide the page also covers the log and audit layers: TLS-inspection metric counters, an Alert-log Insights card (which rule/sid blocked what — top signatures/sources/destinations, CloudWatch Logs destinations only with a prefix-discovery fallback when the logging describe is denied), a Flow-log Insights card (top talkers, protocol distribution), a CloudTrail change-audit card (who changed policies/rules, write events first), and a 4-language collapsible diagnosis guide (metrics / logs / complementary sources with per-goal priorities).

## [0.7.0] - 2026-08-05

### Added

- Add a Direct Connect page (`/direct-connect`, Network group): connection / VIF / DX gateway inventory with per-region fan-out (gateways are global, fetched once) and `AWS/DX` CloudWatch analysis — down detection over the selected range (`ConnectionState`/`VirtualInterfaceBgpStatus` minimums), per-VIF monitoring numbers (average/peak Bps, average Pps, peak utilization from the percent-published `VirtualInterfaceUtilization*` metrics with a peak-bps ÷ bandwidth fallback covering LAG bandwidth, and latest `BgpPrefixesAccepted`/`Advertised` counts — hosted sub-1G connections only publish VIF-level Bps), BGP route visibility via the 2026-07 `ListVirtualInterfaceRoutes` API (accepted/advertised routes with AS path, communities, installed time; 200-route cap per VIF, honest degrade where unsupported), and a location-redundancy lens that flags a single-location single point of failure (Resiliency Toolkit recommends 2+ locations); KPI tiles, VIF type/traffic charts, four tables with sectioned detail panels; BGP secrets (`authKey`, `customerRouterConfig`) are stripped and never leave the server; read-only `directconnect:Describe*`+`ListVirtualInterfaceRoutes` IAM grant (applied, terraform in lockstep); 4-language i18n.

## [0.6.0] - 2026-08-03

### Added

- Add a VPC Endpoints page (`/vpc-endpoints`, Network group): all-region endpoint inventory with three analysis lenses — unused Interface endpoints via `AWS/PrivateLinkEndpoints` BytesProcessed (idle endpoints bill hourly per ENI/AZ, shown as an est. $0.0126/h), security signals (full-access policies, private DNS off), and per-VPC S3/DynamoDB Gateway coverage gaps; KPI tiles, type/service charts, a faceted table with sectioned detail; read-only `ec2:DescribeVpcEndpoints` IAM grant; 4-language i18n.
- Add the aws-data chat route (v1 parity): route listing/count/config questions to a BFF-local handler that generates SQL with the codegen model, runs it against the live Steampipe listener (single-statement SELECT-only guard, 200-row cap), self-corrects once on error, streams the SQL preview in status frames, then streams an analysis grounded in the rows; fail-open at every step — Steampipe unreachable degrades to normal routing, double SQL failure falls back to Bedrock with an explicit no-live-data notice.
- Add auto-collect analysis chat routes (v1 parity): 6 registry-based collectors — idle-scan, eks-optimize, db-optimize, msk-optimize, trace-analyze, incident — each collects live context (Steampipe SQL, CloudWatch, CloudTrail; missing sources are marked unavailable instead of failing) and streams a grounded analysis with per-step status frames; total collection failure falls back to Bedrock with an honest notice.
- Activate the container and iac chat sections: EKS/ECS/Istio and CFN/CDK/Terraform questions now route to their gateways instead of the inactive notice (all 9 gateways have READY MCP targets).
- Add EKS fleet-node drilldown: `/eks/nodes` rows open the same rich drilldown as the overview (CPU/Memory tri-split, pods on node, ENI) via a shared `NodeDrilldownPanel` — the overview reuses it too.

### Fixed

- `opencost_config` — read-only OpenCost install config (cluster-scoped helm version/values)
- `prevention_insights` — ADR-032 Phase 4 cross-incident proactive-prevention tier
- `eks_registrations` — EKS runtime registration (in-app query onboarding; EventBridge auto-register)
- `worker_jobs.requested_by` — server-derived requester identity on every enqueue, used to scope
  `GET /api/jobs`(`/[id]`) to the caller's own jobs (2026-07-22 pentest report remediation)
- `worker_jobs` idempotency-per-requester — adds two partial unique indexes (per-requester, plus a
  NULL-requester bucket for internal enqueues) **alongside** the existing global
  `UNIQUE(idempotency_key)` (that column-level constraint is NOT dropped in this PR). This is
  Phase 1 of a two-phase rollout — dropping the old global constraint is deliberately deferred to
  a separate, later PR once this deploy is confirmed stable (round-5 review: shipping both phases
  in one PR would race `make deploy`'s migrate-then-roll-out ordering and cause a guaranteed
  enqueue outage)

### Security

- Ownership is now enforced on the diagnosis and compliance read paths too, not just jobs:
  `GET /api/diagnosis` (list), `GET /api/diagnosis/[id]`, `GET /api/diagnosis/[id]/download`, and
  `GET /api/compliance/runs` (list) + `GET /api/compliance/runs/[id]` all gate on owner-or-admin.
  Before this, any authenticated user could read or download another user's diagnosis report and
  read another user's CIS compliance run (kiro review: the security changelog omitted these)
- `POST /api/jobs` now requires auth and enforces ownership on `GET /api/jobs`(`/[id]`); the
  generic `report`/`compliance` job types were removed from its allowlist entirely — those job
  types trust client-supplied `report_id`/`run_id`/`requested_by` with no ownership check, so
  reaching them via the generic route was a cross-user IDOR write. They're only enqueueable via
  `/api/diagnosis` and `/api/compliance/run`, which compute `requestedBy` server-side
- Idempotency-key conflict lookup (`lib/jobs.ts`) is now scoped to the requesting user — a
  guessable, deterministic key (e.g. a diagnosis report key derived from the victim's email) could
  otherwise return another user's `job_id`/status and attach the attacker's payload to it
- `enqueueJob` now catches a `23505` unique_violation raised by the legacy global
  `UNIQUE(idempotency_key)` constraint above (it isn't the `ON CONFLICT` arbiter, so Postgres
  still enforces it independently) and falls back to the same requester-scoped lookup: a
  same-requester retry still dedupes cleanly, and a genuine cross-requester key collision now
  fails with a clean `409` (`IdempotencyKeyCollisionError`) instead of an opaque `500`. This
  **mitigates** the cross-user idempotency-key collision as an interim measure — full closure
  still requires the follow-up PR that drops the legacy global constraint (see the Phase 1/Phase 2
  note above; PR #195 round-6 review)
- `POST /api/jobs` now namespaces a caller-supplied `idempotency_key` as `u:<requester>:<key>`
  before it reaches the ledger. Because the legacy global `UNIQUE(idempotency_key)` is still
  enforced during Phase 1, an authenticated attacker could otherwise POST a victim's deterministic
  diagnosis key (`report:<email>:<tier>:<model>:<scope>:<hour>` — guessable from the email) to squat
  it, making the victim's own `POST /api/diagnosis` hit `23505`, fail its requester-scoped recovery
  lookup, and `409` + `markReportFailed` for that whole hour bucket. Namespacing makes squatting
  structurally impossible (a caller can only collide with their own keys) and closes the DoS
  **within this PR**, independent of the Phase 2 constraint drop. Server-minted keys (diagnosis,
  compliance) are unchanged — they already derive from the requester's own identity (PR #195
  round-7 review)
- `GET /api/compliance/runs/[id]` now uses the same dual-key (`identity()` + raw `sub`) ownership
  check as the list route and `GET /api/jobs/[id]`, instead of a direct `requested_by !==`
  comparison — a legacy sub-keyed run was visible in the list but 403'd on this detail route
  (PR #195 round-6 review)
- `/api/eks/[cluster]/register` now returns 413 (not a silent default-registration fallback) when
  the request body exceeds the size cap
- Request-body size caps (`readJsonBounded`) on several routes that previously read unbounded JSON
- Stabilize the aws-data route (4 fixes): raise the Steampipe statement timeout to 35s (cold multi-region wide scans exceeded the previous 15s) and the chat route `maxDuration` to 180s (a cold scan plus one self-correction plus a long analysis stream overran 60s); read all text blocks from the codegen response (a leading thinking block made the SQL parser return empty) and raise codegen `max_tokens` to 1024 and analysis `maxTokens` to 8192 (full listings were truncated); drop assistant turns starting with the fallback marker from codegen history (poisoned history); log SQL-generation and per-attempt failure reasons so fail-open never hides the cause.
- Stop aws-data answers claiming rows are missing and restore natural streaming: move the analysis context from a 2k-char JSON slice to compact TSV under a 24k-char budget with an explicit shown/total note, and drain SSE deltas through an adaptive typewriter buffer.
- Restore the eks-optimize collector: the curated Steampipe read policy had no EKS actions, so `aws_eks_cluster` got AccessDenied and collection returned zero rows — grant read-only `eks:Describe*`/`eks:List*` and log the per-leg collection summary on total failure.
- Resolve each Transit Gateway's region from inventory before querying: default-region clients silently returned nothing for off-region TGWs — the detail and metrics paths now fan out per-region clients with per-region degrade (partial results kept).

## [0.5.0] - 2026-08-02

First release of the **v2 line** (versioned independently from the v1 1.x line, starting at 0.5).

### Added

- **Platform — Terraform MSA, private edge & auth**
  - Rebuild the stack as a Terraform MSA (ADR-001): single `terraform/v2/foundation/` root, partial S3 backend, feature-flag gates on every large feature (default false → `plan` = No changes) — CDK dropped.
  - Serve a fully private edge path: CloudFront (TLS) → VPC Origin `https-only:443` → internal ALB HTTPS:443 (regional ACM) → Fargate `awsops-v2-web` (arm64, root path — no basePath); no public ALB.
  - Authenticate at the edge (ADR-002): Cognito User Pool + Lambda@Edge RS256 JWKS verification (iss/aud/token_use) + PKCE public client; self-hosted `/login` form (BFF `InitiateAuth` mints a 12h `awsops_token`); keep the Hosted UI PKCE flow as a dark fallback.
  - Run web as a Next.js 14 thin-BFF exposing 80 API routes — enqueue heavy work, never run it inline.
  - Add the async worker backbone (ADR-009): `POST /api/jobs` → `worker_jobs` ledger + SQS → ESM (kill-switch) → idempotent dispatcher Lambda → Step Functions `$.runtime` Choice → Lambda (short) or `ecs:runTask.sync` Fargate (long/OOM) → status_updater + 5-minute reaper.
  - Ship a Makefile deployment flow: `make configure` (interactive TUI) / `deploy` / `agentcore` / `workers` / `migrate` / `upgrade`.
- **Data — Aurora & migrations**
  - Persist all app state in Aurora Serverless v2 (PG 17.9, 0.5–4 ACU, KMS CMK, RDS-managed master secret) via node-pg — replaces v1 `data/*.json`.
  - Add the v2 DB migration framework (`make migrate`): collision-free ULID files, advisory-locked, fail-loud, version-stamped `app_version` ledger; `make migrate-status`; `scripts/v2/upgrade.sh` (`make upgrade`): RDS snapshot → migrate → idempotency check → deploy (PREVIEW unless `CONFIRM=go`). Migrations in this line include `opencost_config`, `prevention_insights`, `eks_registrations`.
  - Feed inventory through a flag-gated warm Steampipe Fargate (FDW) + sync Lambda → Aurora pipeline (`steampipe_enabled`); back-fill v1 history via `backfill-*.mjs`.
- **Inventory — 41 resource types**
  - Compute (6): EC2, Lambda, ECS Clusters, ECS Services, ECS Tasks, ECR.
  - Storage & DB (11): S3, EBS Volumes, EBS Snapshots, RDS, DynamoDB, ElastiCache, ElastiCache Replication Groups, OpenSearch, OpenSearch Serverless, MSK, Neptune.
  - Network (17): VPC, Subnet, Route Table, NAT Gateway, Internet Gateway, Transit Gateway, Security Group, Route53 Records, CloudFront, CloudFront VPC Origins, ALB, NLB, Target Group, ALB Listener Rules, API Gateway (HTTP), API GW Integrations, API GW Routes.
  - Security (6): IAM Roles, IAM Users, IAM Policies, WAF Web ACLs, CloudTrail Trails, S3 Public Access.
  - Monitoring (1): CloudWatch Alarms.
  - Give every type facet filters with live counts, a state SegmentedControl, tailored highlight KPI cards, distribution donuts + Top-N bars, and a sectioned DetailPanel; flag EOL Lambda runtimes; add CloudTrail event lookup, summary + daily-trend APIs (up to 90 days), and per-type refresh (Steampipe → Aurora sync trigger).
- **EKS suite**
  - Overview with cluster filter + node drilldown; fleet pages for nodes/pods/deployments/services (server-side live aggregation; per-cluster failures degrade to `reachable:false`).
  - K9s-style read-only in-cluster explorer with per-object describe (secrets excluded).
  - Container cost via OpenCost: saved per-cluster config, 1-day allocation (KPI + per-pod cost), install-bundle download (values.yaml + install.sh, run out-of-band), install-status badge.
  - Cluster register/unregister + Access Entry status with onboarding guidance (Terraform grants Access Entry + AmazonEKSAdminViewPolicy, read-only); control-plane + Container Insights metrics; per-instance-type ENI IPv4 limits.
- **Diagnosis tiers — 12 services**
  - Provide range-scoped CloudWatch metric tables for EC2, RDS, ElastiCache, OpenSearch, MSK (broker nodes), DynamoDB, S3, EBS, Lambda, ALB, NLB, and EKS (layered: control plane / nodes / workloads / addons).
  - Attach collapsible per-service diagnosis guides in all 4 UI languages; add a Target Group health table and TGW detail section.
- **Network tools**
  - Network Flow Monitor: live NFM top-contributor queries (pod-level endpoints, 1-hour API window), End-to-End hop-path visualization, onboarding-aware menu gating.
  - DNS query logs: Route53 Resolver + CoreDNS analysis via Logs Insights aggregation (RCODE/type/top domains/NXDOMAIN/sources/firewall; resolver comparison with honest latency gaps).
  - IP addresses: ENI-based IP→resource lookup (15+ owner kinds), unused-EIP / detached-ENI detection, EKS pod-IP join.
  - Topology: read-only graph API (flow/infra classes, `?from=` subgraphs) with infra / resource / services views; AWS-console-style VPC Resource Map.
- **AI**
  - AI assistant: hybrid routing (regex fast-path + Haiku classifier, ADR-003) across 9 chat sections (network/container/data/security/cost/monitoring/iac/ops/observability) with cross-domain auto-synthesis; SSE streaming (markdown renders while streaming); thread history with search, per-thread and delete-all; slash menu, preset chips, follow-up suggestions, session stats bar, floating 🤖 launcher; Bedrock Sonnet 5 / Opus 4.8 / Haiku 4.5.
  - AgentCore (ADR-004): 9 section gateways (8 AWS domains + external-obs) + shared Strands Runtime + Memory + Code Interpreter, provisioned idempotently via boto3 with SSM as config source of truth; control-plane status page.
  - AI comprehensive diagnosis (ADR-008): 15-section parallel Bedrock rendering (bounded concurrency, per-section timeout isolation, `partial` degrade), md/docx/pdf artifacts via S3 proxy download, Intent Engine (`architecture_intent`), report management UI.
  - AI insights: cached insight cards on the Overview dashboard + admin-gated regeneration enqueue (fail-closed when the flag is off, duplicate-job dedup).
  - K8sGPT read-only in-cluster diagnosis per cluster (GET-only Result reads, admin + cluster allowlist, `k8sgpt_enabled`-gated).
  - Agent Space customization: skills/agents catalog CRUD with routing keywords and gateway/model/language selection (admin).
- **Cost**
  - Cost overview: 1m/3m/6m/12m period filter, per-service detail, Cost Explorer availability probe (1h cache, `?force=1`).
  - Container cost: OpenCost per-pod EKS cost incl. NFM per-pod transfer cost; Fargate daily/monthly cost estimates on ECS tasks and MTD cost on ECS clusters in inventory.
  - Bedrock cost: app token spend from `ai_usage_daily` aggregates + per-model usage metrics (client fan-out for "All accounts") on the Bedrock page.
- **Security & compliance**
  - Security findings: Public S3, open security-group ingress, unencrypted EBS, IAM users without MFA — derived read-only in the BFF from `inventory_resources`, with a re-sync endpoint.
  - Container-image CVE findings from ECR image scanning (v2-native successor to v1's Trivy CVE tab).
  - CIS compliance: run Powerpipe benchmarks as async Fargate `compliance` jobs with `compliance_runs`/`compliance_results` history and a static benchmark allowlist.
- **Integrations**
  - External datasources (8 kinds): Prometheus, Mimir, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog — instance CRUD + credential storage (admin), SSRF-guarded connection test, per-kind default selection, read-only query execution, natural-language query drafting (review-only, never auto-executed), predefined diagnosis signals.
  - Integration registry under ADR-007 governance: egress connectors + ingress webhook sources, single Secrets Manager secret keyed by kind slug, schema introspection/cache.
  - Multi-account (ADR-011): account CRUD with `GetCallerIdentity` anti-spoof verification, per-account region enable/disable, STS AssumeRole read-only fan-out, account/scope selectors in the shell.
- **Operations**
  - Async job queue UI: enqueue/list jobs with per-job status lookup.
  - Per-user auto-diagnosis schedules executed by the worker `schedule_dispatcher`.
  - Diagnosis-completion email notifications via SNS with subscriber management (LIVE under ADR-007 governance).
  - Incident lifecycle (flag-gated, analysis-only per ADR-006): HMAC-signed webhook ingest with active/standby secret rotation, manual trigger, detail views, cross-incident prevention insights.
  - Actions framework (kill-switch gated): list/detail/execute split between integrations-write and mutating-actions gates, fail-closed on empty action names.
  - Operational self-healing (ADR-015, default-off): Aurora secret-rotation event → `ecs:UpdateService force-new-deployment` on the host's own web service only.
- **UI/UX**
  - 4-language UI (Korean/English/Chinese/Japanese) with a language toggle; per-language diagnosis guides.
  - 3 themes (Cobalt/Teal/Dark) with a theme toggle and theme-aware chart colors.
  - Sidebar IA: collapsible groups + 2-level subgroups + per-group overview pages with attention splits; CommandPalette; mobile bottom-tab bar and mobile nav.
  - Reusable UI kit: sortable DataTable, sectioned DetailPanel, StatCard / StatTile / Meter / StatePill / SegmentedControl, resizable panels.
  - Changelog modal + sidebar version display fed by the bilingual CHANGELOG.md.
- **Observability**
  - Monitoring hub: EC2/RDS fleet tabs + single-resource time series with range selection; CloudWatch alarm inventory page.
  - Chat/AgentCore operational telemetry: per-gateway call volume, success rate, and average latency surfaced in the UI.

### Changed

- **BREAKING:** v1 (CDK/EC2/Steampipe monolith, `/awsops` basePath) is decommissioned per ADR-016 —
  v2 serves at the root path with its own auth and data plane.

### Security

- AWS-resource mutation + autonomy frozen (ADR-005); BFF never proxies secrets; in-cluster reads are
  GET-only; auth tokens are write-only in the registration API.

## [1.9.0] - 2026-05-27

### Added

- Event-driven pre-scaling — Phase 1+2 (ADR-010) ([#13](https://github.com/whchoi98/awsops/pull/13))
  - New `/event-scaling` admin page: register events, collect historical CloudWatch metrics (ASG/RDS/MSK/EBS/ALB), Bedrock Sonnet 4.6 multi-phase warmup plan via `PLAN_JSON` marker, downloadable bash scripts per resource type (KEDA/HPA, Aurora reader, MSK partition expansion, ASG warm pool, EBS IOPS)
  - **Review-then-run**: scripts are downloaded for operator review; the dashboard never executes mutating actions
  - New API route `/api/event-scaling` (GET/POST/PUT/DELETE, admin-only)
  - New SQL query file `event-scaling.ts` with CloudWatch GetMetricData batch + resource-state queries
  - 3 new libraries: `event-scaling.ts` (data model + JSON persistence), `event-scaling-prompts.ts`, `event-scaling-scripts.ts`
- ADR-029 (Proposed): Mutating Action Framework — gate model for any future write actions (ADR-010 Phase 3 dependency)
- ADR-030 (Accepted): ECS Fargate + Aurora App State + Dual-Tier ECR
  - **Phase 1 foundation** (this release): `AwsopsDataStack` CDK stack provisioning Aurora Serverless v2 PostgreSQL 15.5 (0.5–4 ACU, writer + reader, KMS-encrypted, IAM auth, private subnets), idempotent 7-table schema (`infra-cdk/data/schema.sql`), app-side pg Pool (`src/lib/db.ts`) with DSN/discrete env var resolution, and deploy script `scripts/13-deploy-aurora.sh` (deploy / schema / status / dsn subcommands)
  - Gated behind `cdk deploy AwsopsDataStack -c enableAurora=true` — default-off, doesn't affect existing single-host deployments
  - **Phase 1 dual-write** (next release): 7 source files will gain Aurora write alongside the current `data/*.json` write; reads stay on JSON until 7-day parity gate clears
- AI code-review workflow ([#12](https://github.com/whchoi98/awsops/pull/12)) — automated PR reviews via GitHub Actions invoking Claude
- Test coverage analysis and improvement plan ([#11](https://github.com/whchoi98/awsops/pull/11)) — `docs/TEST-COVERAGE-PLAN.md` with current gaps and prioritized targets

### Fixed

- Zombie connection cleanup hardened to survive Steampipe FDW hangs — uses a dedicated short-lived `Client` (not pool) so it works even when the pool is exhausted; threshold lowered to 90s for Cost Explorer / IAM summary FDW paths
- CIS benchmark fails with `relation does not exist` in single-account mode — schema resolution fixed for non-aggregator setups
- Benchmark parameter validated against allowlist before shell invocation (prevents command injection)
- `global.anthropic.claude-sonnet-4-6` model ID used for alert diagnosis (was returning a 4xx with the regional ID)

### Infrastructure

- New CDK stack `AwsopsDataStack` (`infra-cdk/lib/awsops-data-stack.ts`) — opt-in via `enableAurora` context flag
- `infra-cdk/data/schema.sql` is source-controlled (negation rule added to `.gitignore`)
- 4 CDK stacks total: `AwsopsStack`, `AwsopsCognitoStack`, `AwsopsAgentCoreStack`, `AwsopsDataStack`

### Documentation

- ADR-029 (Proposed), ADR-030 (Accepted) — 2 new ADRs (29 → 30)
- `docs/architecture.md` — Future: ECS Fargate + Aurora Migration section, data-layer description for Aurora

## [1.8.1] - 2026-04-23

### Added

- Alert-triggered AI diagnosis pipeline (ADR-009): automatic root cause analysis from external alert sources ([#10](https://github.com/whchoi98/awsops/pull/10))
  - Webhook endpoint (`/api/alert-webhook`) for CloudWatch Alarms (SNS), Prometheus Alertmanager, Grafana Alerting, SQS, and generic webhooks
  - Alert correlation engine: groups related alerts into incidents (30s buffer, time/service/resource matching, dedup, severity escalation)
  - Investigation orchestrator: auto-selects collectors + datasource queries based on alert context, change detection (CloudTrail + K8s rollouts)
  - Bedrock Sonnet root cause analysis with structured output (timeline, remediation, prevention)
  - `AlertContext` scopes collector queries to firing alert's services/resources/namespaces (±10min window)
  - Slack notification client (Block Kit, severity-based channel routing, thread updates for webhook + bot modes, resolved state)
  - Knowledge base with monthly summary persistence (`data/alert-diagnosis/summary-YYYY-MM.json`) and past incident similarity search
  - SQS background poller, Alert Settings admin page (`/alert-settings`)
  - HMAC-SHA256 webhook authentication and rate limiting
  - Active incidents exposed via `GET /api/alert-webhook`; header badge + home card poll every 30s
- Documentation expansion:
  - 18 new ADRs (011-028) covering datasources, SNS, reports, Bedrock model, cache warmer, Cognito, SSE, HMAC, adminEmails, CDK split, multi-route, i18n, code interpreter, CloudFront
  - 5 new runbooks: alert pipeline, cache warmer, Cognito auth, deploy flow, multi-account
  - 11 new module CLAUDE.md files (docs/, runbooks/, decisions/, agent/, scripts/, tests/, infra-cdk/, ai-diagnosis/, alert-settings/, k8s/, collectors/)
  - Web guide: new `monitoring/ai-diagnosis.md` and `monitoring/alerts.md` pages (KO+EN), intro/FAQ updates
- `LICENSE` file (MIT)

### Fixed

- Report download buttons use proxy URLs instead of raw S3 presigned URLs (STS session expiry fix)
- SSRF protection for SNS SubscribeURL, admin auth for alert config, PromQL/LogQL injection prevention
- Alert correlation: bounded retry, timer cleanup, dedup map cap, rate limit hardening
- Collector dynamic import restricted to code files via `webpackInclude` magic comment (prevents CLAUDE.md from breaking build)
- `global.anthropic.claude-sonnet-4-6` model ID used for alert diagnosis
- Duplicate AI diagnosis menu item removed from sidebar
- Unused `batchTopics` variable removed; env var replacement fixed
- Dynamic `reportBucket` config restored; 30min stale timeout
- SNS→SQS queue + DLQ + SNS subscription auto-created in `setup-alert-pipeline`
- SNS email notifications strip markdown to plaintext

### Security

- `.gitignore` tracks `.env` + `.env.*`; `.env.example` allowlisted

## [1.8.0] - 2026-04-07

### Added

- External datasource integration with 7 observability platforms: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog ([#10](https://github.com/whchoi98/awsops/pull/10))
- Datasource management page (`/datasources`) with CRUD, connection test, and auth configuration
- Datasource Explore page (`/datasources/explore`) with direct query execution and AI query generation (natural language to PromQL/LogQL/TraceQL/SQL)
- Multi-datasource AI correlation: cross-analyze external metrics with AWS resources via `datasource` route
- AI routing expanded from 10 to 11 routes (added `datasource` route for external platform queries)
- EKS Access Entry status display and kubeconfig registration ([#11](https://github.com/whchoi98/awsops/pull/11))
- EKS Service Resources tab with clickable navigation and node ENI traffic metrics
- AI comprehensive diagnosis with 15-section Bedrock Opus analysis ([#13](https://github.com/whchoi98/awsops/pull/13))
- Diagnosis report export to DOCX, Markdown, and browser Print-to-PDF
- Scheduled auto-diagnosis (weekly/biweekly/monthly) via report scheduler
- Print-friendly report page (`/ai-diagnosis/report`) with A4 page breaks
- SSRF protection with allowlist-based private network access and defense-in-depth URL validation
- Converse Stream API for multi-route synthesis with real-time SSE streaming
- Typing effect simulation for AgentCore gateway responses
- Automatic zombie PostgreSQL connection cleanup (queries running longer than 5 minutes)
- App version displayed in sidebar, auto-read from package.json

### Fixed

- Exclude Steampipe internal FDW connections (`client_addr IS NULL`) from zombie cleanup
- Remove monitoring queries from cache warmer to prevent pg pool exhaustion from slow CloudWatch FDW calls
- Add time range filters to all monitoring metric queries to prevent unbounded query execution
- Prevent AI chat bubble width jump during SSE streaming ([#8](https://github.com/whchoi98/awsops/pull/8))
- SQL injection prevention: sanitize nodeName and validate ENI IDs before SQL interpolation in EKS pages
- Add missing `involved_object_kind`, `involved_object_name`, `count` columns to warningEvents query
- Fix undefined `errorFile` variable in benchmark route
- Add missing `ClipboardCheck` icon import in Sidebar

### Security

- SSRF defense in depth: URL validation in `datasource-client.ts` protects all outbound fetch paths including AI route
- Admin-only access enforced on datasource query and AI query generation actions
- IPv6 private/link-local address detection added (`fc00::/7`, `fe80::/10`)
- Regex capture groups for safe Tempo/Jaeger trace ID URL insertion
- Remove hardcoded S3 bucket with account ID from report route, read from `config.reportBucket`

## [1.7.0] - 2026-03-24

### Added

- Multi-account support with Steampipe Aggregator pattern (`aws` = all accounts, `aws_{id}` = single account)
- Account management page (`/accounts`) with add/remove/test functionality (admin-only via `adminEmails` config)
- `AccountSelector` dropdown and `AccountBadge` component for per-account navigation
- `buildSearchPath(accountId)` for per-account query scoping and `runCostQueriesPerAccount()` for cost data merging
- `account_id` column added to all 25 SQL query files for multi-account filtering
- Cross-account IAM role setup script (`scripts/11-setup-multi-account.sh`)
- Real-time Bedrock streaming via `InvokeModelWithResponseStreamCommand` with SSE chunk events
- Background cache pre-warming (`cache-warmer.ts`) for dashboard queries on 4-minute interval
- Cache warmer status bar displayed on dashboard, monitoring, and AgentCore pages
- Configurable customer logo in sidebar (`customerLogo`, `customerName`, `customerLogoBg` in config)

### Changed

- All 35 pages integrated with `useAccountContext()` for multi-account awareness
- DataTable auto-adds Account column when multi-account data detected
- Cache key format changed to `sp:{accountId}:{sql}` for per-account cache isolation
- Config `accounts[]` array manages accounts without code changes
- Deployment scripts expanded to 11 steps (Step 11: multi-account setup)

### Fixed

- Pool exhaustion prevention with `RESET search_path` failure handling and connection destruction

### Security

- **CRITICAL**: AssumeRole audit logging with structured JSON for CloudWatch tracking
- **CRITICAL**: ExternalId required for cross-account AssumeRole (Confused Deputy prevention)
- **HIGH**: Admin endpoint rate limiting (5 req/min/user, HTTP 429)
- **HIGH**: Alias/Region input validation (64-char limit, regex pattern)
- **HIGH**: Replace `execSync` with `execFileSync` to prevent shell injection ([#6](https://github.com/whchoi98/awsops/pull/6))

## [1.6.0] - 2026-03-21

### Added

- i18n support with Korean/English language toggle (React Context + localStorage)
- 500+ translation keys in `translations/en.json` and `ko.json`
- AI responses follow language setting (English or Korean output)
- Bedrock monitoring page (`/bedrock`) with per-model usage dashboard (CloudWatch + AWSops token tracking)
- Account Total vs AWSops usage comparison charts
- Token cost display in AI chat (input/output tokens, USD cost)
- ECS container cost page (`/container-cost`) with Fargate pricing and Container Insights metrics
- EKS container cost page (`/eks-container-cost`) with OpenCost API and request-based fallback
- OpenCost installation script (`06f-setup-opencost.sh`) for Prometheus + OpenCost on EKS
- AgentCore Memory Store for conversation history persistence (365-day retention, per-user isolation)
- Conversation history toggle panel at bottom of AI Assistant page

### Changed

- Default Bedrock dashboard time range from 24 hours to 7 days
- Cross-region model IDs added to Bedrock pricing map

## [1.5.2] - 2026-03-15

### Added

- EBS page (`/ebs`) with volumes, snapshots, encryption status, EC2 attachment mapping, idle volume detection
- MSK page (`/msk`) with Kafka clusters, broker node metrics table (CPU/Memory/Network), KRaft controllers
- OpenSearch page (`/opensearch`) with domains, encryption (N2N/At-Rest), VPC config, cluster metrics
- Resource Inventory page (`/inventory`) with 18 resource count trends, multi-line chart, cost impact estimation ([#1](https://github.com/whchoi98/awsops/pull/1))
- CloudWatch metrics tables for MSK, RDS, ElastiCache, and OpenSearch (progress bars + metric values)
- Valkey engine support in ElastiCache with color-coded engine badges
- Cost Explorer MSP/Direct Payer auto-detection at install time
- Cost snapshot fallback showing last known data on query failure
- AgentCore config externalized to `data/config.json` (no hardcoded account ARNs)
- MCP tool usage inference from response keywords displayed as badges in AI chat
- AgentCore Memory with auto-save (question/summary/route/tools/response time per conversation)

### Changed

- Dashboard cards expanded with EBS, MSK, OpenSearch in Network & Storage row
- Pool max connections increased from 3 to 5, batch size from 3 to 5
- Multi-route fallback to Bedrock Direct added, timeout increased from 60s to 90s
- Sign Out moved from Header to Sidebar (next to logo)

### Fixed

- HttpOnly cookie sign-out via server-side API (`POST /api/auth`) instead of client-side deletion

## [1.4.0] - 2026-03-13

### Added

- Multi-route AI classification: 1-3 gateways called in parallel with Bedrock response synthesis
- AgentCore dashboard page (`/agentcore`) with Runtime status, 8 Gateway cards, 125 tool inventory
- AgentCore status API (`/api/agentcore`) for Runtime/Gateway state queries
- CloudFront page (`/cloudfront-cdn`) with distributions, origins, aliases, WAF, protocol settings
- WAF page (`/waf`) with Web ACL list, rules, IP sets
- ECR page (`/ecr`) with repositories, scan config, encryption, tag mutability
- Sign Out button in Header with cookie deletion and Cognito re-authentication
- S3 Bucket TreeMap visualization by region with Public/Versioned/Standard color coding
- S3 IAM Roles section showing roles with S3 access
- RDS Security Groups with inbound rules and chained resource display
- RDS CloudWatch metrics: CPU, Memory, Connections, IOPS, Storage mini-charts
- ElastiCache Security Groups and CloudWatch metrics
- Monitoring instance detail view with full-screen metrics and date range filter (1h/6h/24h/7d/30d)
- Resource Topology redesign: Infrastructure Graph/Map views + Kubernetes 4-column resource map
- VPC Resource Map with AWS Console-style 4-column layout and click highlight
- EKS node cards with CPU/Memory progress bars and ENI detail view
- Cost Explorer period filter, service filter, projected monthly cost, and MoM change

### Changed

- Dashboard layout redesigned to 18 cards (6x3) with 1:1 sidebar mapping
- CIS Compliance updated to v4.0.0 baseline
- AI Assistant header styled to match EC2/VPC pages with ONLINE badge

### Fixed

- PieChart/BarChart Steampipe bigint string to `Number()` conversion across 8 pages
- Cost query `COALESCE(unblended, blended, 0)` for accounts with null blended_cost
- Multi-route build TypeScript implicit any type errors

## [1.3.0] - 2026-03-12

### Added

- 18 dashboard StatsCards (6x3 layout) with 1:1 sidebar menu mapping and sub-metrics
- CIS Compliance pass rate display with alarm/skip/error breakdown
- Monthly Cost sub-metrics: daily average, last month comparison, MoM change
- SSE streaming in AI Assistant with real-time progress indicators
- Response time display, clipboard copy, and follow-up question suggestions in AI chat
- EC2 memory/network info via `aws_ec2_instance_type` JOIN
- Multi-filter support in EC2: text search + State + Instance Type + VPC dropdown
- K8s Overview node cards with CPU/Memory usage progress bars
- K8s node detail view with ENI cards, per-ENI traffic, and Pods table
- EKS Explorer: Status/Node filters, pagination (25/50/100/200), cluster selector
- Route Table tab in VPC with associations, routes, and target/state details
- TGW Route Tables and Attachment detail views

### Changed

- Sidebar font size increased (`text-sm` to `text-[15px]`), icon size 16px to 18px
- StatsCard auto-shrink for long values, unified `h-full` card height

### Fixed

- RDS/ElastiCache metric chart overlap resolved with direct Recharts rendering
- Monitoring EC2 detail chart sizing with dedicated Recharts components
- K8s `parseMiB` const hoisting issue resolved by moving function outside component
- AgentCore `bedrock-agentcore:*` permission and `<tool_call>` tag cleanup
- Bedrock region changed from us-east-1 to ap-northeast-2 (global.* inference)
- Cognito custom domain `SupportedIdentityProviders` and callback URL path fixes

## [1.2.0] - 2026-03-11

### Added

- Network Gateway (17 tools) split from Infra Gateway for VPC, TGW, VPN, ENI, Firewall, Reachability, Flow Logs
- Container Gateway (24 tools) split from Infra Gateway for EKS, ECS, Istio
- AI test script `scripts/test-ai-routes.py` with interactive menu, 104 questions, 9 categories, content validation
- Test guide `docs/AI_TEST_GUIDE.md` with usage, output interpretation, and troubleshooting

### Changed

- **BREAKING:** Infra Gateway (41 tools) split into Network (17) + Container (24) for 54% faster container responses
- Gateway count increased from 7 to 8, route count from 9 to 10
- Bedrock region changed to ap-northeast-2 with global.* inference profile for ~20% latency reduction
- Benchmark route Steampipe password changed from hardcoded to dynamic lookup

### Fixed

- AgentCore permission failure with missing `bedrock-agentcore:*` in IAM role
- EKS access entry `arn:aws:sts::` to `arn:aws:iam::` format conversion
- K8s PVC `capacity`/`access_modes` JSONB serialization error with `::text` casting
- AgentCore response `<tool_call>` tag exposure cleaned with regex removal
- Cognito custom domain `SupportedIdentityProviders` and callback URL path

## [1.1.0] - 2026-03-07

### Added

- 7 role-based AgentCore Gateways replacing single gateway (Network/IaC/Data/Security/Monitoring/Cost/Ops)
- 19 Lambda functions as MCP tool targets with 125 total tools
- Dynamic gateway routing via `payload.gateway` parameter in `agent.py`
- 9-route priority keyword-based routing in `route.ts`
- Role-specific system prompts for each gateway specialist
- `create_targets.py` script for automated Gateway Target creation
- All 16 Lambda source files version controlled under `agent/lambda/`

### Changed

- **BREAKING:** Single gateway (29 tools) replaced with 7 specialized gateways (125 tools) for improved tool selection accuracy
- `network-mcp` rewritten from 1 tool (693B) to 15 tools (17KB)
- `steampipe-query` upgraded from boto3 keyword fallback to real SQL via pg8000
- Legacy gateway (`awsops-gateway-g0ihtogknw`) removed

## [1.0.1] - 2026-03-07

### Added

- CDK infrastructure stack (`awsops-stack.ts`) with VPC, EC2, ALB, CloudFront
- Cognito User Pool with OAuth2 Authorization Code flow
- Lambda@Edge (Python 3.12, us-east-1) for CloudFront JWT authentication
- AgentCore Runtime with Strands agent (arm64 Docker, ECR)
- AgentCore Gateway with MCP protocol and Code Interpreter
- 4 sub-step AgentCore scripts: Runtime (6a), Gateway (6b), Tools (6c), Interpreter (6d)
- Claude Code project scaffolding with auto-sync hooks and module documentation
- Git commit-msg hook to auto-strip Co-Authored-By lines

### Fixed

- CloudFront CachePolicy TTL=0 rejection resolved with managed `CACHING_DISABLED`
- ALB Security Group rules limit with CloudFront prefix list 120+ IPs consolidated to port range
- EC2 UserData Steampipe installation running as root instead of ec2-user
- Steampipe listen mode changed from `local` to `network` for VPC Lambda access
- Gateway Target API structure corrected to `mcp.lambda` with `credentialProviderConfigurations`
- Code Interpreter naming restriction: hyphens changed to underscores
- psycopg2 Lambda incompatibility resolved by switching to pg8000

## [1.0.0] - 2026-03-07

### Added

- AWSops Dashboard with 21 pages and 5 API routes
- Next.js 14 (App Router) with Tailwind CSS dark navy theme
- Steampipe embedded PostgreSQL integration (380+ AWS tables, 60+ K8s tables)
- Recharts metrics visualization and React Flow network topology
- Powerpipe CIS v1.5~v4.0 benchmarks
- AI routing: Code Interpreter, AgentCore, Steampipe+Bedrock, Bedrock Direct
- Bedrock Claude Sonnet/Opus 4.6 integration

[Unreleased]: https://github.com/whchoi98/awsops/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/whchoi98/awsops/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/whchoi98/awsops/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/whchoi98/awsops/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/whchoi98/awsops/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/whchoi98/awsops/releases/tag/v0.5.0
[1.8.1]: https://github.com/whchoi98/awsops/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/whchoi98/awsops/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/whchoi98/awsops/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/whchoi98/awsops/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/whchoi98/awsops/compare/v1.4.0...v1.5.2
[1.4.0]: https://github.com/whchoi98/awsops/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/whchoi98/awsops/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/whchoi98/awsops/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/awsops/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/whchoi98/awsops/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/whchoi98/awsops/releases/tag/v1.0.0

---

<a id="korean"></a>

# 한국어

이 프로젝트의 모든 주요 변경 사항은 이 파일에 기록됩니다.
이 문서는 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 기반으로 하며,
[Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 따릅니다.

## [Unreleased]

### Added


## [0.9.0] - 2026-08-22

### Added

- Direct Connect 페이지에 구성도 + 복원력 평가 추가(aws-samples/sample-network-resilience-agent 참조, 앱의 React Flow 관례에 맞춤): 온프레미스 → DX 로케이션 → 커넥션/LAG → VIF → DX Gateway → TGW/VGW 계층 그래프(dagre 레이아웃, 상태 색상 — 다운 커넥션·BGP 다운 VIF는 빨강, 성능 저하 LAG·미연결 게이트웨이 링크는 주황/점선, 미연결 VIF는 점선), 노드 클릭 시 기존 사이드 상세 패널, AWS Direct Connect SLA 티어(최대 복원력 99.99% = 2개 로케이션 × 각 2개 이상 커넥션 · 높은 복원력 99.9% = 2개 이상 로케이션 · 단일 연결 95%)와 critical/warn 체크리스트(커넥션/VIF 상태·로케이션 이중화·로케이션당 이중 커넥션·미연결 DXGW·미연결 VIF)를 판정하는 복원력 카드 — 페이지가 이미 가진 데이터만 사용, 신규 AWS 호출 없음; 4개 언어 i18n.

## [0.8.0] - 2026-08-19

### Added

- 아이폰/아이패드 홈 화면 앱 설치(PWA) 지원: 웹 앱 manifest(standalone, 루트 스코프) + Apple 메타 태그(apple-touch-icon, apple-mobile-web-app-capable) + 생성 아이콘 4종(180 풀블리드 apple-touch, 192/512 라운드, 512 maskable). iOS는 manifest·아이콘을 인증 쿠키 없이 fetch하므로 Lambda@Edge 공개 allowlist에 등록(3자 lockstep 테스트로 manifest ↔ public/ 파일 ↔ edge allowlist 고정). 노치 기기 안전영역 처리(viewport-fit=cover + 모바일 셸 상/하/좌/우 env() 패딩, 커진 탭바만큼 스크롤 보정), 브라우저 theme-color meta가 런타임 테마(cobalt/teal/dark)를 추적(다크 화면 코발트 틴트 해소). Service Worker는 의도적으로 미도입 — 인증 쿠키 뒤 라이브 운영 데이터는 오프라인 캐시 이득이 없고 iOS 설치에 SW가 필요하지 않음.
- Network Firewall 룰 히트 테이블을 가독성·상호작용 중심으로 재구성: 수제 테이블을 공용 MetricTable로 교체(모든 문자열/숫자 컬럼 헤더 클릭 정렬, 텍스트 검색, 액션 원소 단위 facet, 문제만 토글), 행 클릭 시 표준 사이드 상세 패널에서 룰 상세(SID·룰 그룹·3-state 히트 근거·n/a 사유) 표시, 히트 카운트 그래프 2종 추가 — 액션 분포 도넛은 잘림 없는 액션별 전량 집계 사용(카드 배지와 수치 일치), 룰별 히트 Top 10 바는 top-100 SID 집계 잘림 시 명시 고지. MetricTable에는 여기서 재사용하는 opt-in prop 3종 추가: 다중값 facet(원소 단위 매칭 — 'blocked' 필터가 'drop, blocked' 행도 포함), 렌더 단계 행 상한(검색·정렬은 전체 행에서 동작, idle 룰 보존), per-row 클래스 훅(idle 룰 디밍 복원).
- Network Firewall 페이지에 stateful 룰 히트 카운트 추가(2026-08 AWS 신기능 — 신규 API가 아니라 기존 Alert 로그 집계 방식임을 API 레퍼런스·최신 botocore·CloudWatch로 검증): Alert 로그 카드가 CloudWatch Logs 대상에서 (SID, signature, action)별 히트를 집계(limit 100)하고, 설정 stateful 룰 그룹에서 서버 측 파싱한 SID(sid/msg/action만 — 룰 본문은 여전히 미탑재)와 조인해 기간 내 매칭 0인 설정 룰(정책 사각지대/셰도우 룰)을 표면화; pass 룰은 Alert 로그를 남기지 않으므로 n/a로 정직 표기, 미파악 SID(관리형 룰 그룹)는 별도 표시.
- Security Group 인벤토리 페이지에 보안 그룹 사용 분석 추가(`/api/sg`): 사용 유무 감지(ENI `Groups` 부착 + 다른 SG가 소스로 상호참조 → 미사용 정리 후보 표면화), 룰 소스/목적지 식별(sg 참조는 이름으로, CIDR은 인벤토리 VPC 이름 매칭, `0.0.0.0/0`·`::/0` → 인터넷 전체, `pl-` → 관리형 프리픽스 리스트 이름), 행 클릭 시 SG별 트래픽 **히트 매칭** — VPC Flow Logs(CloudWatch Logs 대상, 기본 포맷 parse, 룰별 정확 매칭 + ACCEPT/REJECT) 우선, Flow Logs 없으면 NFM 폴백(전 카테고리 top-contributor, 1h 상한)은 트래픽 상대 식별 전용 — NFM은 양방향 바이트 집계라 룰 귀속을 하지 않음(거짓 idle 신호 방지), 정직 표기; 기간 내 매칭 없는 인바운드 룰 표시; KPI 타일 + 부착 리소스 종류 도넛; read-only `ec2:DescribeSecurityGroups`/`DescribeManagedPrefixLists`/`DescribeFlowLogs` IAM(적용됨, terraform lockstep); 4개 언어 i18n.
- Network Firewall 페이지(`/network-firewall`, Network 그룹) 추가: 방화벽/정책/룰 그룹 인벤토리(리전 fan-out) + 선택 기간의 `AWS/NetworkFirewall` 트래픽 집계(수신/통과/드롭/거부 패킷·드롭율 — `(AZ, Engine, FirewallName)` 3차원 메트릭만 합산, `EndpointName` 포함 변형은 동시 발행되어 이중 집계됨), 분석 렌즈 5종 — 보호 설정 off(삭제/서브넷 변경/정책 변경), ALERT 로깅 갭(위협 가시성 없음; 로깅 구성 조회가 거부되면 “확인 불가”로 표시 — “미설정”과 구분, 태스크 롤만 거부되는 SCP류 환경 실측), stateless 기본 액션 `aws:pass`(스테이트풀 엔진 우회), 룰 그룹 용량(생성 후 변경 불가, 80% 이상 플래그)·미연결 룰 그룹(정리 후보), AZ별 엔드포인트/구성 동기화 상태; KPI 타일·타입/용량 차트·방화벽 점검 카드·섹션형 상세 패널이 있는 테이블 3종; 룰 본문(`RulesSource`)은 의도적으로 응답에서 제외; read-only `network-firewall:List*`/`Describe*` IAM 권한(적용됨, terraform lockstep); 4개 언어 i18n. owner 모니터링 가이드에 따라 로그·감사 계층까지 포함: TLS 검사 메트릭, Alert 로그 Insights 카드(어떤 규칙(sid)이 무엇을 차단했는지 — Top 시그니처/소스/목적지, CloudWatch Logs 대상만·로깅 조회 거부 시 접두사 발견 폴백), Flow 로그 Insights 카드(Top talker·프로토콜 분포), CloudTrail 변경 감사 카드(누가 정책/룰을 바꿨는지, write 우선), 4개 언어 접이식 진단 가이드(지표/로그/보완 소스 + 목적별 우선순위).

## [0.7.0] - 2026-08-05

### Added

- Direct Connect 페이지(`/direct-connect`, Network 그룹) 추가: 커넥션/VIF/DX Gateway 인벤토리(리전 fan-out, 게이트웨이는 글로벌 1회 조회) + `AWS/DX` CloudWatch 분석 — 선택 기간 내 다운 감지(`ConnectionState`/`VirtualInterfaceBgpStatus` 최소값), VIF별 모니터링 수치(평균/피크 Bps, 평균 Pps, 퍼센트로 발행되는 `VirtualInterfaceUtilization*` 메트릭 기반 피크 사용률 — 없으면 피크 bps ÷ 대역폭 폴백(LAG 대역폭 포함), `BgpPrefixesAccepted`/`Advertised` 최신값 — 1G 미만 호스티드 커넥션은 VIF 레벨 Bps만 발행), 2026-07 신규 `ListVirtualInterfaceRoutes` API 기반 BGP 라우트 가시성(수신/광고 라우트의 AS 경로·커뮤니티·설치 시각, VIF당 200건 캡, 미지원 시 정직 강등), 단일 로케이션 단일 장애점을 표시하는 로케이션 이중화 렌즈(Resiliency Toolkit은 2개 이상 로케이션 권장); KPI 타일·VIF 타입/트래픽 차트·섹션형 상세 패널이 있는 테이블 4종; BGP 시크릿(`authKey`, `customerRouterConfig`)은 서버에서 제거되어 절대 응답에 실리지 않음; read-only `directconnect:Describe*`+`ListVirtualInterfaceRoutes` IAM 권한(적용됨, terraform lockstep); 4개 언어 i18n.

## [0.6.0] - 2026-08-03

### Added

- VPC 엔드포인트 페이지(`/vpc-endpoints`, Network 그룹) 추가: 전 리전 엔드포인트 인벤토리 + 분석 렌즈 3종 — `AWS/PrivateLinkEndpoints` BytesProcessed 기반 미사용 Interface 엔드포인트(유휴 엔드포인트도 ENI/AZ당 시간 과금, $0.0126/h 추정치 표기), 보안 시그널(full-access 정책, private DNS off), VPC별 S3/DynamoDB Gateway 커버리지 갭; KPI 타일·타입/서비스 차트·섹션형 상세 포함 facet 테이블; read-only `ec2:DescribeVpcEndpoints` IAM 권한; 4개 언어 i18n.
- aws-data 챗 라우트 추가(v1 패리티): 목록/카운트/구성 질문을 BFF 로컬 핸들러로 라우팅 — codegen 모델로 SQL 생성, 라이브 Steampipe 리스너에서 실행(단일 문장 SELECT 전용 가드, 200행 상한), 오류 시 1회 자기수정, SQL 프리뷰 status frame 스트리밍 후 행 기반 분석 스트리밍; 전 단계 fail-open — Steampipe 불가 시 일반 라우팅으로 degrade, SQL 2회 실패 시 no-live-data 고지와 함께 Bedrock 폴백.
- auto-collect 분석 챗 라우트 추가(v1 패리티): 레지스트리 기반 콜렉터 6종 — idle-scan, eks-optimize, db-optimize, msk-optimize, trace-analyze, incident — 라이브 컨텍스트 수집(Steampipe SQL, CloudWatch, CloudTrail; 누락 소스는 실패 대신 unavailable 표기) + 단계별 status frame과 함께 근거 기반 분석 스트리밍; 전체 수집 실패 시 고지와 함께 Bedrock 폴백.
- container·iac 챗 섹션 활성화: EKS/ECS/Istio 및 CFN/CDK/Terraform 질문이 비활성 안내 대신 해당 게이트웨이로 라우팅(9개 게이트웨이 전부 READY MCP 타겟 보유).
- EKS 플릿 노드 드릴다운 추가: `/eks/nodes` 행에서 개요와 동일한 리치 드릴다운(CPU/Memory 3분할, 노드 내 파드, ENI) 오픈 — 공유 `NodeDrilldownPanel`로 추출(개요도 동일 컴포넌트 재사용).

- `opencost_config` — read-only OpenCost 설치 설정(클러스터별 helm 버전/values)
- `prevention_insights` — ADR-032 Phase 4 교차-인시던트 사전예방 티어
- `eks_registrations` — EKS 런타임 등록(인앱 조회 온보딩; EventBridge 자동등록)
- `worker_jobs.requested_by` — 모든 enqueue에 서버 측에서 유도한 요청자 identity 기록. `GET /api/jobs`(`/[id]`)를
  호출자 본인 작업으로 범위 제한하는 데 사용(2026-07-22 pentest 리포트 후속 조치)
- `worker_jobs` 요청자별 idempotency — 기존 단일 글로벌 `UNIQUE(idempotency_key)`는 그대로 유지한 채,
  그 **옆에** 부분 유니크 인덱스 2개(요청자별 + 내부 enqueue용 NULL-요청자 버킷)를 **추가**(이 PR에서는
  기존 컬럼 제약을 삭제하지 않음). 이번 PR은 2단계 롤아웃 중 Phase 1이며, 옛 글로벌 제약 삭제는 이번
  배포가 안정적으로 확인된 뒤 별도 후속 PR로 의도적으로 미룸(round-5 리뷰: 두 단계를 한 PR에 같이
  실으면 `make deploy`의 migrate-then-roll-out 순서와 경합해 enqueue 장애가 확정적으로 발생)

### 보안

- 소유권 검증이 jobs 뿐 아니라 **진단·컴플라이언스 read 경로**에도 적용된다: `GET /api/diagnosis`(목록),
  `GET /api/diagnosis/[id]`, `GET /api/diagnosis/[id]/download`, `GET /api/compliance/runs`(목록),
  `GET /api/compliance/runs/[id]` 전부 owner-or-admin 게이트를 통과해야 한다. 이전에는 인증된 사용자
  누구나 **다른 사용자의 진단 리포트를 열람·다운로드**하고 다른 사용자의 CIS 컴플라이언스 실행 결과를
  읽을 수 있었다 (EN 섹션에만 있던 항목 — KO/EN 대칭 규약 위반이라 보충)
- `POST /api/jobs`에 인증 요구 + `GET /api/jobs`(`/[id]`)에 소유권 검증 추가. 범용 `report`/`compliance`
  잡 타입은 허용 목록에서 완전히 제거 — 해당 타입은 클라이언트가 넘긴 `report_id`/`run_id`/`requested_by`를
  소유권 검증 없이 신뢰하므로, 범용 라우트로 도달 가능한 상태는 cross-user IDOR 쓰기였음. 이제
  `requestedBy`를 서버에서 계산하는 `/api/diagnosis`, `/api/compliance/run`을 통해서만 enqueue 가능
- idempotency-key 충돌 조회(`lib/jobs.ts`)를 요청자 기준으로 범위 제한 — 예측 가능한 idempotency key(예:
  피해자 이메일에서 파생된 진단 리포트 키)를 알면 다른 사용자의 `job_id`/status를 조회하고 공격자의
  payload를 그 작업에 붙일 수 있었음
- `enqueueJob`이 위의 옛 글로벌 `UNIQUE(idempotency_key)` 제약이 던지는 `23505` unique_violation을
  이제 catch — 이 제약은 `ON CONFLICT`의 arbiter가 아니라서 Postgres가 별도로 계속 강제하며, catch 시
  동일한 요청자 범위 조회로 fallback한다: 동일 요청자의 재시도는 여전히 깨끗하게 dedupe되고, 진짜
  다른 요청자 간의 key 충돌은 opaque `500` 대신 깨끗한 `409`(`IdempotencyKeyCollisionError`)로 실패.
  이는 cross-user idempotency-key 충돌을 **완화**하는 중간 조치이며, 완전한 해결은 위 Phase 1/Phase 2
  노트에 언급된 옛 글로벌 제약 삭제 후속 PR이 나가야 함(PR #195 round-6 리뷰)
- `POST /api/jobs`가 클라이언트가 준 `idempotency_key`를 ledger에 쓰기 전에 `u:<요청자>:<key>`로
  네임스페이싱. Phase 1 동안에는 옛 글로벌 `UNIQUE(idempotency_key)`가 여전히 강제되므로, 그렇지
  않으면 인증된 공격자가 피해자의 결정적 진단 키(`report:<email>:<tier>:<model>:<scope>:<hour>` —
  이메일만 알면 추측 가능)를 이 라우트로 선점할 수 있었고, 그 결과 피해자 본인의
  `POST /api/diagnosis`가 `23505` → 요청자 범위 복구 조회 무소득 → `409` + `markReportFailed`로
  해당 hour 버킷 내내 진단 불가 상태가 됨. 네임스페이싱으로 선점이 구조적으로 불가능해지고(자기 키와만
  충돌 가능) Phase 2 제약 삭제와 무관하게 **이 PR 안에서** DoS가 닫힘. 서버에서 생성되는 키(진단,
  컴플라이언스)는 이미 요청자 신원에서 파생되므로 변경 없음(PR #195 round-7 리뷰)
- `GET /api/compliance/runs/[id]`가 목록 라우트·`GET /api/jobs/[id]`와 동일한 dual-key(`identity()` +
  raw `sub`) 소유권 검증을 쓰도록 변경 — 기존에는 `requested_by !==` 직접 비교라서, 레거시 sub-키 run이
  목록에는 보였지만 상세 라우트에서는 403이 나는 불일치가 있었음(PR #195 round-6 리뷰)
- `/api/eks/[cluster]/register`가 요청 본문이 크기 상한을 넘을 때 조용히 기본값으로 등록하지 않고 413을 반환
- 이전에는 무제한 JSON을 읽던 여러 라우트에 요청 본문 크기 상한(`readJsonBounded`) 적용
### Fixed

- aws-data 라우트 안정화(fix 4건): Steampipe statement timeout 35초 상향(콜드 멀티 리전 광역 스캔이 기존 15초 초과) + 챗 라우트 `maxDuration` 180초 상향(콜드 스캔 + 자기수정 1회 + 장문 분석 스트림이 60초 초과); codegen 응답의 모든 text 블록 읽기(선행 thinking 블록으로 SQL 파서가 빈 문자열 반환) + codegen `max_tokens` 1024·분석 `maxTokens` 8192 상향(전량 목록 답변 절단 해결); fallback 마커로 시작하는 assistant 턴을 codegen 히스토리에서 제외(오염된 히스토리); SQL 생성·시도별 실패 사유 로깅으로 fail-open이 원인을 숨기지 않도록 수정.
- aws-data 답변의 "데이터 없음" 오판 및 스트리밍 체감 수정: 분석 컨텍스트를 2k자 JSON 슬라이스에서 24k자 예산의 압축 TSV(표시/전체 건수 명시)로 전환, SSE 델타를 적응형 typewriter 버퍼로 방출.
- eks-optimize 콜렉터 수집 전면 실패 복구: Steampipe read 정책에 EKS 액션이 없어 `aws_eks_cluster`가 AccessDenied → 수집 0건 — read-only `eks:Describe*`/`eks:List*` 부여 + 전면 실패 시 leg별 수집 요약 로깅.
- Transit Gateway 조회 전 리전을 인벤토리에서 해석하도록 수정: 기본 리전 클라이언트가 타 리전 TGW에 대해 조용히 빈 결과 반환 — 상세·메트릭 경로가 리전별 클라이언트로 fan-out(리전별 degrade로 부분 결과 유지).

## [0.5.0] - 2026-08-02

**v2 라인**의 첫 릴리스입니다 (v1 1.x 라인과 독립적으로 0.5부터 시작).

### Added

- **플랫폼 — Terraform MSA·비공개 엣지·인증**
  - Terraform MSA로 스택 재구축(ADR-001): 단일 `terraform/v2/foundation/` 루트, partial S3 backend, 모든 대형 기능에 기능 플래그 게이트(기본 false → `plan` = No changes) — CDK 폐기.
  - 완전 비공개 엣지 경로 제공: CloudFront(TLS) → VPC Origin `https-only:443` → 내부 ALB HTTPS:443(리전 ACM) → Fargate `awsops-v2-web`(arm64, 루트 경로 — basePath 없음); 공개 ALB 없음.
  - 엣지 인증(ADR-002): Cognito User Pool + Lambda@Edge RS256 JWKS 검증(iss/aud/token_use) + PKCE public client; 자체 `/login` 폼(BFF `InitiateAuth`가 12h `awsops_token` 발급); Hosted UI PKCE 플로우는 다크 폴백으로 보존.
  - web을 Next.js 14 thin-BFF로 운영 — API 라우트 80개, 무거운 작업은 인라인 실행 없이 큐잉.
  - 비동기 워커 백본 추가(ADR-009): `POST /api/jobs` → `worker_jobs` ledger + SQS → ESM(킬스위치) → 멱등 dispatcher Lambda → Step Functions `$.runtime` Choice → Lambda(짧음) 또는 `ecs:runTask.sync` Fargate(긺/OOM) → status_updater + 5분 reaper.
  - Makefile 배포 플로우 제공: `make configure`(대화형 TUI) / `deploy` / `agentcore` / `workers` / `migrate` / `upgrade`.
- **데이터 — Aurora·마이그레이션**
  - 모든 앱 상태를 Aurora Serverless v2(PG 17.9, 0.5–4 ACU, KMS CMK, RDS-관리 master secret)에 node-pg로 영속화 — v1 `data/*.json` 대체.
  - v2 DB 마이그레이션 프레임워크(`make migrate`): 충돌 없는 ULID 파일, advisory-lock, fail-loud, 버전 스탬프(`app_version` ledger); `make migrate-status`; `scripts/v2/upgrade.sh`(`make upgrade`): RDS 스냅샷 → migrate → 멱등 검증 → deploy(`CONFIRM=go` 아니면 PREVIEW). 이 라인의 마이그레이션: `opencost_config`, `prevention_insights`, `eks_registrations`.
  - flag-gated warm Steampipe Fargate(FDW) + sync Lambda → Aurora 인벤토리 파이프라인(`steampipe_enabled`); `backfill-*.mjs`로 v1 이력 백필.
- **인벤토리 — 리소스 41종**
  - Compute (6): EC2, Lambda, ECS Clusters, ECS Services, ECS Tasks, ECR.
  - Storage & DB (11): S3, EBS Volumes, EBS Snapshots, RDS, DynamoDB, ElastiCache, ElastiCache Replication Groups, OpenSearch, OpenSearch Serverless, MSK, Neptune.
  - Network (17): VPC, Subnet, Route Table, NAT Gateway, Internet Gateway, Transit Gateway, Security Group, Route53 Records, CloudFront, CloudFront VPC Origins, ALB, NLB, Target Group, ALB Listener Rules, API Gateway (HTTP), API GW Integrations, API GW Routes.
  - Security (6): IAM Roles, IAM Users, IAM Policies, WAF Web ACLs, CloudTrail Trails, S3 Public Access.
  - Monitoring (1): CloudWatch Alarms.
  - 전 타입 공통: 라이브 카운트 facet 필터, 상태 SegmentedControl, 타입 맞춤 하이라이트 KPI 카드, 분포 도넛 + Top-N 바, 섹션형 DetailPanel; Lambda EOL 런타임 배지; CloudTrail 이벤트 조회, 요약 + 일별 추세 API(최대 90일), 타입별 refresh(Steampipe → Aurora sync 트리거).
- **EKS 스위트**
  - 클러스터 필터 + 노드 드릴다운 개요; 노드/파드/디플로이먼트/서비스 플릿 페이지(서버측 라이브 집계, 클러스터별 실패는 `reachable:false`로 degrade).
  - K9s 스타일 읽기 전용 in-cluster 탐색기 + 오브젝트 단위 describe(secrets 제외).
  - OpenCost 컨테이너 비용: 클러스터별 저장 설정, 1-day allocation(KPI + 파드별 비용), 설치 번들 다운로드(values.yaml + install.sh, out-of-band 실행), 설치 상태 배지.
  - 클러스터 등록/해제 + Access Entry 상태·온보딩 가이드(Terraform이 Access Entry + AmazonEKSAdminViewPolicy 부여, read-only); 컨트롤플레인 + Container Insights 메트릭; 인스턴스 타입별 ENI IPv4 한도.
- **진단 계층 — 12개 서비스**
  - EC2, RDS, ElastiCache, OpenSearch, MSK(브로커 노드), DynamoDB, S3, EBS, Lambda, ALB, NLB, EKS(계층별: 컨트롤 플레인/노드/워크로드/애드온)의 기간 선택 CloudWatch 메트릭 테이블 제공.
  - 서비스별 접이식 진단 가이드를 UI 4개 언어 전부로 제공; Target Group 헬스 테이블 + TGW 상세 섹션 추가.
- **네트워크 도구**
  - Network Flow Monitor: 라이브 NFM top-contributors 조회(파드 수준 엔드포인트, 1시간 API 한도), End-to-End 홉 경로 시각화, 온보딩 인지형 메뉴 게이트.
  - DNS 쿼리 로그: Route53 Resolver + CoreDNS를 Logs Insights 집계로 분석(RCODE/타입/Top 도메인/NXDOMAIN/소스/방화벽; 지연 공백을 정직 표기하는 리졸버 비교).
  - IP 주소: ENI 기반 IP→리소스 조회(소유자 15+종 분류), 미사용 EIP/미부착 ENI 탐지, EKS 파드 IP 조인.
  - 토폴로지: read-only 그래프 API(flow/infra 클래스, `?from=` 서브그래프) + infra/resource/services 뷰; AWS 콘솔 스타일 VPC 리소스 맵.
- **AI**
  - AI 어시스턴트: 9개 챗 섹션(network/container/data/security/cost/monitoring/iac/ops/observability)에 대한 하이브리드 라우팅(정규식 fast-path + Haiku 분류기, ADR-003) + 교차도메인 자동 합성; SSE 스트리밍(스트리밍 중 마크다운 렌더); 대화 이력(검색, 개별/전체 삭제); 슬래시 메뉴·프리셋 칩·후속 질문 제안·세션 통계 바·플로팅 🤖 런처; Bedrock Sonnet 5 / Opus 4.8 / Haiku 4.5.
  - AgentCore(ADR-004): 9 섹션 게이트웨이(8 AWS 도메인 + external-obs) + 공유 Strands Runtime + Memory + Code Interpreter, boto3 멱등 프로비저닝 + SSM 설정 source of truth; 컨트롤플레인 상태 페이지.
  - AI 종합 진단(ADR-008): 15섹션 병렬 Bedrock 렌더(동시성 제한, 섹션별 타임아웃 격리, `partial` degrade), md/docx/pdf 산출물 S3 프록시 다운로드, Intent Engine(`architecture_intent`), 리포트 관리 UI.
  - AI 인사이트: Overview 대시보드용 캐시 인사이트 카드 + admin 게이트 재생성 enqueue(플래그 off 시 fail-closed, 중복 job dedup).
  - K8sGPT 클러스터별 read-only in-cluster 진단(GET 전용 Result 조회, admin + 클러스터 allowlist, `k8sgpt_enabled` 게이트).
  - Agent Space 커스터마이제이션: 라우팅 키워드·게이트웨이/모델/언어 선택이 가능한 스킬/에이전트 카탈로그 CRUD(admin).
- **비용**
  - 비용 개요: 1m/3m/6m/12m 기간 필터, 서비스별 상세, Cost Explorer 가용성 probe(1h 캐시, `?force=1`).
  - 컨테이너 비용: OpenCost 기반 EKS 파드별 비용(NFM 파드별 전송 비용 포함); 인벤토리의 ECS 태스크 Fargate 일간/월간 비용 추정 + ECS 클러스터 MTD 비용.
  - Bedrock 비용: `ai_usage_daily` 집계 기반 앱 토큰 비용 + 모델별 사용량 메트릭("All accounts"는 클라이언트 fan-out) — Bedrock 페이지.
- **보안·컴플라이언스**
  - 보안 findings: Public S3, 개방 보안그룹 ingress, 미암호화 EBS, MFA 미설정 IAM 사용자 — `inventory_resources`에서 BFF read-only 파생 + 재동기화 엔드포인트.
  - ECR 이미지 스캔 기반 컨테이너 이미지 CVE findings(v1 Trivy CVE 탭의 v2 네이티브 후속).
  - CIS 컴플라이언스: Powerpipe 벤치마크를 비동기 Fargate `compliance` job으로 실행 — `compliance_runs`/`compliance_results` 이력 + 정적 벤치마크 allowlist.
- **통합**
  - 외부 데이터소스 8종: Prometheus, Mimir, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog — 인스턴스 CRUD + 크리덴셜 저장(admin), SSRF 가드 연결 테스트, kind별 기본 인스턴스 지정, read-only 쿼리 실행, 자연어 쿼리 초안 생성(리뷰 전용 — 절대 자동 실행 안 함), 사전 정의 진단 시그널.
  - ADR-007 거버넌스 하의 통합 레지스트리: egress 커넥터 + ingress 웹훅 소스, kind slug 키의 단일 Secrets Manager secret, 스키마 introspect/캐시.
  - 멀티 어카운트(ADR-011): `GetCallerIdentity` anti-spoof 검증 포함 계정 CRUD, 계정별 리전 활성/비활성, STS AssumeRole read-only fan-out, 셸의 계정/스코프 셀렉터.
- **운영**
  - 비동기 작업 큐 UI: 작업 enqueue/목록 + 작업별 상태 조회.
  - 사용자별 자동 진단 스케줄 — 실행은 워커 `schedule_dispatcher` 담당.
  - SNS 기반 진단 완료 이메일 알림 + 구독자 관리(ADR-007 거버넌스 하 LIVE).
  - 인시던트 라이프사이클(flag 게이트, ADR-006 analysis-only): HMAC 서명 웹훅 수신(active/standby 시크릿 로테이션), 수동 트리거, 상세 뷰, 교차 인시던트 예방 인사이트.
  - 액션 프레임워크(킬스위치 게이트): integrations-write / mutating-actions 게이트 분기의 목록/상세/실행, 빈 액션 이름 fail-closed.
  - 운영 자가치유(ADR-015, 기본 off): Aurora 시크릿 회전 이벤트 → 자기 web 서비스 한정 `ecs:UpdateService force-new-deployment`.
- **UI/UX**
  - 4개 언어 UI(한국어/영어/중국어/일본어) + 언어 토글; 언어별 진단 가이드.
  - 3종 테마(Cobalt/Teal/Dark) + 테마 토글 + 테마 연동 차트 색상.
  - 사이드바 IA: 접이식 그룹 + 2단계 서브그룹 + attention split 포함 그룹별 개요 페이지; CommandPalette; 모바일 하단 탭 바 + 모바일 내비.
  - 재사용 UI 킷: 정렬형 DataTable, 섹션형 DetailPanel, StatCard / StatTile / Meter / StatePill / SegmentedControl, 크기 조절 패널.
  - 이중언어 CHANGELOG.md 기반 변경 이력 모달 + 사이드바 버전 표시.
- **관측성**
  - 모니터링 허브: EC2/RDS 플릿 탭 + 기간 선택 단일 리소스 시계열; CloudWatch 알람 인벤토리 페이지.
  - 챗/AgentCore 운영 텔레메트리: 게이트웨이별 호출량·성공률·평균 지연을 UI에 표시.

### Changed

- **BREAKING:** v1(CDK/EC2/Steampipe 모놀리식, `/awsops` basePath)은 ADR-016에 따라 폐기 —
  v2는 루트 경로에서 자체 인증·데이터 플레인으로 서비스.

### Security

- AWS 리소스 변경 + 자율 실행 동결(ADR-005); BFF는 시크릿을 프록시하지 않음; 인-클러스터 조회는
  GET 전용; 인증 토큰은 등록 API에서 쓰기 전용.

## [1.9.0] - 2026-05-27

### Added

- 이벤트 기반 사전 스케일링 — Phase 1+2 (ADR-010) ([#13](https://github.com/whchoi98/awsops/pull/13))
  - 신규 `/event-scaling` 관리자 페이지: 이벤트 등록 → 과거 CloudWatch 메트릭 수집(ASG/RDS/MSK/EBS/ALB) → Bedrock Sonnet 4.6 다단계 워밍업 플랜(`PLAN_JSON` 마커) → 자원 타입별 bash 스크립트 다운로드(KEDA/HPA, Aurora 리더, MSK 파티션 확장, ASG warm pool, EBS IOPS)
  - **검토-후-실행**: 스크립트는 운영자 검토용으로 다운로드만 제공 — 대시보드는 변경 작업을 직접 실행하지 않음
  - 신규 API 라우트 `/api/event-scaling` (GET/POST/PUT/DELETE, admin 전용)
  - 신규 SQL 쿼리 `event-scaling.ts` (CloudWatch GetMetricData 배치 + 자원 상태 쿼리)
  - 라이브러리 3개 추가: `event-scaling.ts` (데이터 모델 + JSON 영속화), `event-scaling-prompts.ts`, `event-scaling-scripts.ts`
- ADR-029 (Proposed): 변경 작업 프레임워크 — 향후 모든 쓰기 작업의 게이트 모델 (ADR-010 Phase 3 선행 조건)
- ADR-030 (Accepted): ECS Fargate + Aurora 앱 상태 + 이중 ECR
  - **Phase 1 기반** (본 릴리스): `AwsopsDataStack` CDK 스택 — Aurora Serverless v2 PostgreSQL 15.5(0.5–4 ACU, Writer + Reader, KMS 암호화, IAM 인증, Private Subnet) 프로비저닝, 7개 테이블 idempotent 스키마(`infra-cdk/data/schema.sql`), 앱 측 pg Pool(`src/lib/db.ts`) DSN/개별 환경변수 지원, 배포 스크립트 `scripts/13-deploy-aurora.sh` (deploy / schema / status / dsn 서브커맨드)
  - `cdk deploy AwsopsDataStack -c enableAurora=true` 컨텍스트 플래그 뒤로 가드 — 기본 off, 기존 단일 호스트 배포는 영향 없음
  - **Phase 1 이중 쓰기** (다음 릴리스): 7개 소스 파일이 기존 `data/*.json` 쓰기와 함께 Aurora 쓰기 추가, 7일 패리티 게이트 통과 전까지 읽기는 JSON 유지
- AI 코드 리뷰 워크플로 ([#12](https://github.com/whchoi98/awsops/pull/12)) — GitHub Actions에서 Claude를 호출해 PR 자동 리뷰
- 테스트 커버리지 분석 및 개선 계획 ([#11](https://github.com/whchoi98/awsops/pull/11)) — `docs/TEST-COVERAGE-PLAN.md`에 현재 갭과 우선순위 정리

### Fixed

- 좀비 연결 정리가 Steampipe FDW 행에서도 살아남도록 강화 — 풀이 아닌 전용 단명 `Client` 사용으로 풀 고갈 상태에서도 동작; Cost Explorer/IAM 요약 FDW 경로용 임계값을 90초로 단축
- 단일 어카운트 모드에서 CIS 벤치마크 `relation does not exist` 오류 — non-aggregator 환경에서 스키마 해석 수정
- 벤치마크 파라미터를 셸 호출 전 allowlist로 검증 (커맨드 인젝션 방지)
- 알림 진단에 `global.anthropic.claude-sonnet-4-6` 모델 ID 사용 (리전 ID로 4xx 반환되던 문제 해결)

### Infrastructure

- 신규 CDK 스택 `AwsopsDataStack` (`infra-cdk/lib/awsops-data-stack.ts`) — `enableAurora` 컨텍스트 플래그로 opt-in
- `infra-cdk/data/schema.sql`은 소스 관리 대상 (`.gitignore`에 negation 규칙 추가)
- CDK 스택 총 4개: `AwsopsStack`, `AwsopsCognitoStack`, `AwsopsAgentCoreStack`, `AwsopsDataStack`

### Documentation

- ADR-029(Proposed), ADR-030(Accepted) 신규 — ADR 29건 → 30건
- `docs/architecture.md` — Future: ECS Fargate + Aurora Migration 섹션, Aurora 데이터 계층 설명 추가

## [1.8.1] - 2026-04-23

### Added

- 알림 트리거 AI 자동 진단 파이프라인 (ADR-009): 외부 알림 소스에서 자동 근본 원인 분석 ([#10](https://github.com/whchoi98/awsops/pull/10))
  - 웹훅 엔드포인트(`/api/alert-webhook`): CloudWatch Alarm(SNS), Prometheus Alertmanager, Grafana, SQS, Generic 지원
  - 알림 상관 분석 엔진: 30초 버퍼링, 시간/서비스/리소스 매칭, 중복 제거, 심각도 에스컬레이션
  - 조사 오케스트레이터: 알림 컨텍스트 기반 컬렉터/데이터소스 자동 선택, 변경 감지(CloudTrail + K8s Rollout)
  - Bedrock Sonnet 근본 원인 분석 (타임라인, 대응 조치, 예방 방안)
  - `AlertContext`로 컬렉터 쿼리를 발화 알림의 서비스/리소스/네임스페이스(±10분)로 스코프 제한
  - Slack 알림 (Block Kit, 심각도별 채널 라우팅, 웹훅·Bot 모드 스레드 업데이트, 해결 상태 포함)
  - 지식 베이스: 월간 요약 영구 저장(`data/alert-diagnosis/summary-YYYY-MM.json`), 과거 인시던트 유사도 검색
  - SQS 백그라운드 폴러, 알림 설정 관리 페이지(`/alert-settings`)
  - HMAC-SHA256 웹훅 인증 + Rate Limiting
  - `GET /api/alert-webhook`으로 활성 인시던트 조회, 헤더 배지 + 홈 카드에서 30초 주기 폴링
- 문서 확장:
  - ADR 18건 신규(011-028): 데이터소스, SNS, 리포트, Bedrock 모델, 캐시 워머, Cognito, SSE, HMAC, adminEmails, CDK 분리, 멀티 라우트, i18n, Code Interpreter, CloudFront
  - 런북 5건 신규: 알림 파이프라인, 캐시 워머, Cognito 인증, 배포 플로우, 멀티 어카운트
  - 모듈 CLAUDE.md 11개 신규: docs/, runbooks/, decisions/, agent/, scripts/, tests/, infra-cdk/, ai-diagnosis/, alert-settings/, k8s/, collectors/
  - Web 가이드: `monitoring/ai-diagnosis.md`, `monitoring/alerts.md` 페이지 신규 (KO+EN), intro/FAQ 업데이트
- `LICENSE` 파일 (MIT)

### Fixed

- 리포트 다운로드 버튼이 S3 presigned URL 대신 프록시 URL 사용 (STS 세션 만료 해결)
- SNS SubscribeURL SSRF 방지, 알림 설정 admin 인증, PromQL/LogQL 인젝션 방지
- 상관 분석: 재시도 제한, 타이머 정리, dedup map 제한, Rate Limit 강화
- 컬렉터 동적 import를 `webpackInclude` 매직 코멘트로 코드 파일로 제한 (CLAUDE.md 포함 시 빌드 실패 방지)
- 알림 진단에 `global.anthropic.claude-sonnet-4-6` 모델 ID 사용
- 사이드바의 중복된 AI 진단 메뉴 항목 제거
- 미사용 `batchTopics` 변수 제거; env var 치환 수정
- `reportBucket` config 동적 읽기 복원; 30분 stale timeout
- `setup-alert-pipeline`에서 SNS→SQS 큐 + DLQ + SNS 구독 자동 생성
- SNS 이메일 알림 마크다운 → 평문 변환

### Security

- `.gitignore`에 `.env` + `.env.*` 추적; `.env.example`은 allowlist

## [1.8.0] - 2026-04-07

### Added

- 7종 외부 관측성 플랫폼 연동: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog ([#10](https://github.com/whchoi98/awsops/pull/10))
- 데이터소스 관리 페이지(`/datasources`) — CRUD, 연결 테스트, 인증 설정
- 데이터소스 Explore 페이지(`/datasources/explore`) — 직접 쿼리 실행 + AI 쿼리 생성 (자연어 → PromQL/LogQL/TraceQL/SQL)
- 멀티 데이터소스 AI 상관 분석: `datasource` 라우트로 외부 메트릭과 AWS 리소스 교차 분석
- AI 라우팅 10개 → 11개로 확장 (외부 플랫폼 쿼리용 `datasource` 라우트 추가)
- EKS Access Entry 상태 표시 및 kubeconfig 등록 ([#11](https://github.com/whchoi98/awsops/pull/11))
- EKS Service Resources 탭 — 클릭 네비게이션, 노드 ENI 트래픽 메트릭
- AI 종합 진단 — 15섹션 Bedrock Opus 분석 ([#13](https://github.com/whchoi98/awsops/pull/13))
- 진단 리포트 DOCX, Markdown, 브라우저 Print-to-PDF 내보내기
- 자동 진단 스케줄러 (weekly/biweekly/monthly)
- 인쇄용 리포트 페이지(`/ai-diagnosis/report`) — A4 페이지 브레이크
- SSRF 방지: allowlist 기반 사설 네트워크 접근 제어 + 심층 방어 URL 검증
- 멀티 라우트 합성에 Converse Stream API 적용 (실시간 SSE 스트리밍)
- AgentCore 게이트웨이 응답에 타이핑 효과 시뮬레이션 추가
- 좀비 PostgreSQL 연결 자동 정리 (5분 이상 실행 쿼리 종료)
- 사이드바 앱 버전 표시 (package.json에서 자동 읽기)

### Fixed

- Steampipe 내부 FDW 연결(`client_addr IS NULL`)을 좀비 정리 대상에서 제외
- CloudWatch FDW의 느린 API 호출로 인한 pg 풀 고갈 방지를 위해 캐시 워머에서 모니터링 쿼리 제거
- 모든 모니터링 메트릭 쿼리에 시간 범위 필터 추가 (무제한 쿼리 실행 방지)
- AI 채팅 버블이 SSE 스트리밍 중 폭이 점프하는 현상 수정 ([#8](https://github.com/whchoi98/awsops/pull/8))
- EKS 페이지 SQL Injection 방지: nodeName sanitize + ENI ID 정규식 검증
- warningEvents 쿼리에 `involved_object_kind`, `involved_object_name`, `count` 컬럼 추가
- 벤치마크 라우트 `errorFile` 변수 미선언 수정
- Sidebar `ClipboardCheck` 아이콘 import 누락 수정

### Security

- SSRF 심층 방어: `datasource-client.ts`에 URL 검증 추가 (AI route 포함 모든 outbound fetch 보호)
- 데이터소스 쿼리 및 AI 쿼리 생성 액션에 관리자 전용 접근 적용
- IPv6 사설/링크로컬 주소 차단 추가 (`fc00::/7`, `fe80::/10`)
- Tempo/Jaeger trace ID URL 삽입에 정규식 캡처 그룹 사용
- 리포트 라우트에서 계정 ID 하드코딩된 S3 버킷 제거, `config.reportBucket`에서 읽기

## [1.7.0] - 2026-03-24

### Added

- Steampipe Aggregator 패턴 기반 멀티 어카운트 지원 (`aws` = 전체 통합, `aws_{id}` = 개별 계정)
- 계정 관리 페이지(`/accounts`) — 추가/삭제/테스트 기능 (관리자 전용, `adminEmails` 설정)
- `AccountSelector` 드롭다운 및 `AccountBadge` 컴포넌트 (계정별 네비게이션)
- `buildSearchPath(accountId)` 계정별 쿼리 스코핑 및 `runCostQueriesPerAccount()` 비용 데이터 병합
- 25개 전체 SQL 쿼리 파일에 `account_id` 컬럼 추가
- 교차 계정 IAM 역할 설정 스크립트 (`scripts/11-setup-multi-account.sh`)
- `InvokeModelWithResponseStreamCommand` 기반 실시간 Bedrock 스트리밍 (SSE 청크 이벤트)
- 대시보드 쿼리 백그라운드 캐시 프리워밍 (`cache-warmer.ts`, 4분 주기)
- 대시보드/모니터링/AgentCore 페이지에 캐시 워머 상태 바 표시
- 사이드바에 고객 로고 설정 (`customerLogo`, `customerName`, `customerLogoBg`)

### Changed

- 35개 전체 페이지에 `useAccountContext()` 통합 (멀티 어카운트 인식)
- DataTable에서 멀티 어카운트 데이터 감지 시 Account 컬럼 자동 추가
- 캐시 키 형식을 `sp:{accountId}:{sql}`로 변경 (계정별 캐시 분리)
- `config.json`의 `accounts[]` 배열로 코드 수정 없이 계정 관리
- 배포 스크립트 11단계로 확장 (Step 11: 멀티 어카운트 설정)

### Fixed

- `RESET search_path` 실패 시 커넥션 파괴로 풀 고갈 방지

### Security

- **CRITICAL**: AssumeRole 감사 로그 (JSON 구조화, CloudWatch 추적 가능)
- **CRITICAL**: 교차 계정 AssumeRole에 ExternalId 필수화 (Confused Deputy 방지)
- **HIGH**: 관리자 엔드포인트 Rate Limiting (5 req/min/user, HTTP 429)
- **HIGH**: Alias/Region 입력 검증 강화 (64자 제한, 정규식 패턴)
- **HIGH**: `execSync`를 `execFileSync`로 교체 (Shell Injection 방지) ([#6](https://github.com/whchoi98/awsops/pull/6))

## [1.6.0] - 2026-03-21

### Added

- 한국어/영어 전환 다국어(i18n) 지원 (React Context + localStorage)
- `translations/en.json`, `ko.json`에 500+ 번역 키
- AI 응답이 언어 설정에 따라 한국어/영어로 출력
- Bedrock 모니터링 페이지(`/bedrock`) — 모델별 사용량 대시보드 (CloudWatch + AWSops 토큰 추적)
- Account Total vs AWSops 사용량 비교 차트
- AI 채팅에 토큰 비용 표시 (입력/출력 토큰, USD 비용)
- ECS 컨테이너 비용 페이지(`/container-cost`) — Fargate 가격 + Container Insights 메트릭
- EKS 컨테이너 비용 페이지(`/eks-container-cost`) — OpenCost API + Request 기반 폴백
- OpenCost 설치 스크립트(`06f-setup-opencost.sh`) — Prometheus + OpenCost (EKS)
- AgentCore Memory Store 대화 이력 영구 저장 (365일 보관, 사용자별 분리)
- AI Assistant 하단에 대화 이력 토글 패널

### Changed

- Bedrock 대시보드 기본 시간 범위를 24시간에서 7일로 변경
- Bedrock 가격 맵에 교차 리전 모델 ID 추가

## [1.5.2] - 2026-03-15

### Added

- EBS 페이지(`/ebs`) — 볼륨/스냅샷, 암호화 상태, EC2 어태치먼트 매핑, Idle 볼륨 감지
- MSK 페이지(`/msk`) — Kafka 클러스터, 브로커 노드 메트릭 테이블 (CPU/Memory/Network), KRaft 컨트롤러
- OpenSearch 페이지(`/opensearch`) — 도메인, 암호화 (N2N/At-Rest), VPC 구성, 클러스터 메트릭
- Resource Inventory 페이지(`/inventory`) — 18종 리소스 수량 추이, 멀티라인 차트, 비용 영향 추정 ([#1](https://github.com/whchoi98/awsops/pull/1))
- MSK/RDS/ElastiCache/OpenSearch CloudWatch 메트릭 테이블 (프로그레스 바 + 수치)
- ElastiCache Valkey 엔진 지원 (엔진별 색상 배지)
- 설치 시 Cost Explorer MSP/Direct Payer 자동 판별
- Cost 쿼리 실패 시 마지막 스냅샷 데이터 폴백 표시
- AgentCore 설정을 `data/config.json`으로 외부화 (하드코딩 ARN 제거)
- 응답 내용 키워드 매칭으로 MCP 도구 사용 추론 → AI 채팅에 배지 표시
- AgentCore Memory 자동 저장 (질문/요약/라우트/도구/응답시간)

### Changed

- 대시보드에 EBS/MSK/OpenSearch 카드 추가 (Network & Storage 행, 9열)
- pg Pool max 3 → 5, 배치 크기 3 → 5로 확대
- 멀티 라우트 실패 시 Bedrock Direct 폴백 추가, 타임아웃 60초 → 90초로 확대
- Sign Out 버튼을 Header에서 Sidebar 상단(로고 옆)으로 이동

### Fixed

- HttpOnly 쿠키 로그아웃을 서버 사이드 API(`POST /api/auth`)로 변경 (클라이언트 삭제 불가 수정)

## [1.4.0] - 2026-03-13

### Added

- 멀티 라우트 AI 분류 — 복합 질문 시 1-3개 Gateway 병렬 호출 + Bedrock 응답 합성
- AgentCore 대시보드 페이지(`/agentcore`) — Runtime 상태, 8 Gateway 카드, 125 도구 목록
- AgentCore 상태 API(`/api/agentcore`) — Runtime/Gateway 상태 조회
- CloudFront 페이지(`/cloudfront-cdn`) — Distribution, Origins, Aliases, WAF, Protocol
- WAF 페이지(`/waf`) — Web ACL 목록, Rules, IP Sets
- ECR 페이지(`/ecr`) — Repository, Scan 설정, Encryption, Tag Mutability
- Header에 Sign Out 버튼 (쿠키 삭제 → Cognito 재인증)
- S3 Bucket TreeMap 시각화 (리전별, Public/Versioned/Standard 색상 구분)
- S3 IAM Roles 섹션 (S3 접근 가능 역할 표시)
- RDS Security Groups 인바운드 규칙 및 체이닝 리소스 표시
- RDS CloudWatch 메트릭 — CPU, Memory, Connections, IOPS, Storage 미니 차트
- ElastiCache Security Groups 및 CloudWatch 메트릭
- Monitoring 인스턴스 상세 메트릭 뷰 (전체 화면 차트, 날짜 범위 필터 1h/6h/24h/7d/30d)
- Resource Topology 재설계 — Infrastructure Graph/Map 전환 + Kubernetes 4컬럼 리소스 맵
- VPC Resource Map — AWS 콘솔 스타일 4컬럼 레이아웃, 클릭 하이라이트
- EKS 노드 카드에 CPU/Memory 프로그레스 바 및 ENI 상세 뷰
- Cost Explorer 기간/서비스 필터, Projected 월말 비용, MoM 변화율

### Changed

- 대시보드 레이아웃 18 카드(6x3)로 재설계, 사이드바 메뉴와 1:1 매핑
- CIS Compliance 기준을 v4.0.0으로 갱신
- AI Assistant 헤더를 EC2/VPC 페이지와 동일 스타일로 통일 (ONLINE 배지)

### Fixed

- 8개 페이지에서 PieChart/BarChart Steampipe bigint 문자열 → `Number()` 변환
- Cost 쿼리 `COALESCE(unblended, blended, 0)` — blended_cost null 계정 지원
- 멀티 라우트 빌드 TypeScript implicit any 타입 오류

## [1.3.0] - 2026-03-12

### Added

- 대시보드 18개 StatsCards (6x3 레이아웃), 사이드바 메뉴와 1:1 매핑, 카드별 sub-metrics
- CIS Compliance Pass Rate 표시 (alarm/skip/error 세부 분류)
- Monthly Cost sub-metrics — 일평균, 전월 대비, MoM 변화율
- AI Assistant SSE 스트리밍 (실시간 진행 상태 표시)
- AI 채팅에 응답 시간, 클립보드 복사, 연관 추천 질문 기능
- EC2 메모리/네트워크 정보 (`aws_ec2_instance_type` JOIN)
- EC2 다중 필터 — 텍스트 검색 + State + Instance Type + VPC 드롭다운
- K8s Overview 노드 카드에 CPU/Memory 사용량 프로그레스 바
- K8s 노드 상세 뷰 — ENI 카드, ENI별 트래픽, Pod 테이블
- EKS Explorer — Status/Node 필터, 페이지네이션 (25/50/100/200), 클러스터 선택기
- VPC Route Table 탭 (Associations, Routes, target/state 상세)
- TGW Route Tables 및 Attachment 상세 뷰

### Changed

- 사이드바 글씨 크기 확대 (`text-sm` → `text-[15px]`), 아이콘 16px → 18px
- StatsCard 긴 값 자동 축소, `h-full` 카드 높이 통일

### Fixed

- RDS/ElastiCache 메트릭 차트 겹침 — 직접 Recharts 렌더링으로 해결
- Monitoring EC2 상세 차트 크기 — 전용 Recharts 컴포넌트로 수정
- K8s `parseMiB` const hoisting 문제 — 컴포넌트 밖 함수로 이동
- AgentCore `bedrock-agentcore:*` 권한 추가 및 `<tool_call>` 태그 정리
- Bedrock 리전 us-east-1 → ap-northeast-2 변경 (global.* inference)
- Cognito custom domain `SupportedIdentityProviders` 및 콜백 URL 경로 수정

## [1.2.0] - 2026-03-11

### Added

- Infra Gateway에서 Network Gateway(17 도구) 분리 — VPC, TGW, VPN, ENI, Firewall, Reachability, Flow Logs
- Infra Gateway에서 Container Gateway(24 도구) 분리 — EKS, ECS, Istio
- AI 테스트 스크립트 `scripts/test-ai-routes.py` — 대화형 메뉴, 104개 질문, 9 카테고리, 내용 검증
- 테스트 가이드 `docs/AI_TEST_GUIDE.md` — 사용법, 출력 해석, 트러블슈팅

### Changed

- **BREAKING:** Infra Gateway(41 도구) → Network(17) + Container(24) 분리 (Container 54% 속도 개선)
- Gateway 7개 → 8개, 라우트 9개 → 10개로 확장
- Bedrock 리전을 ap-northeast-2로 변경 (global.* inference profile, ~20% 지연 감소)
- 벤치마크 라우트 Steampipe 비밀번호를 하드코딩에서 동적 조회로 변경

### Fixed

- AgentCore IAM 역할에 `bedrock-agentcore:*` 누락으로 Gateway 호출 실패
- EKS access entry `arn:aws:sts::` → `arn:aws:iam::` 형식 변환
- K8s PVC `capacity`/`access_modes` JSONB 직렬화 오류 (`::text` 캐스팅)
- AgentCore 응답에 `<tool_call>` 태그 노출 (regex 제거)
- Cognito custom domain `SupportedIdentityProviders` 및 콜백 URL 경로

## [1.1.0] - 2026-03-07

### Added

- 단일 게이트웨이를 7개 역할 기반 AgentCore Gateway로 교체 (Network/IaC/Data/Security/Monitoring/Cost/Ops)
- MCP 도구 타겟으로 19개 Lambda 함수 추가 (총 125 도구)
- `agent.py`에서 `payload.gateway` 파라미터 기반 동적 게이트웨이 라우팅
- `route.ts`에 9단계 우선순위 키워드 기반 라우팅
- 게이트웨이별 전문가 역할 시스템 프롬프트
- Gateway Target 자동 생성 스크립트 `create_targets.py`
- 16개 Lambda 소스 파일 `agent/lambda/`에 버전 관리

### Changed

- **BREAKING:** 단일 게이트웨이(29 도구) → 7개 전문 게이트웨이(125 도구)로 전환 (도구 선택 정확도 향상)
- `network-mcp` 1개 도구(693B) → 15개 도구(17KB)로 재작성
- `steampipe-query` boto3 키워드 폴백에서 pg8000 실제 SQL로 업그레이드
- 레거시 게이트웨이(`awsops-gateway-g0ihtogknw`) 삭제

## [1.0.1] - 2026-03-07

### Added

- CDK 인프라 스택(`awsops-stack.ts`) — VPC, EC2, ALB, CloudFront
- Cognito User Pool + OAuth2 Authorization Code 인증 흐름
- Lambda@Edge(Python 3.12, us-east-1) CloudFront JWT 인증
- AgentCore Runtime (Strands 에이전트, arm64 Docker, ECR)
- AgentCore Gateway (MCP 프로토콜) 및 Code Interpreter
- 4개 하위 단계 AgentCore 스크립트: Runtime(6a), Gateway(6b), Tools(6c), Interpreter(6d)
- Claude Code 프로젝트 스캐폴딩 (자동 동기화 hooks + 모듈 문서)
- Git commit-msg 훅 (Co-Authored-By 자동 제거)

### Fixed

- CloudFront CachePolicy TTL=0 거부 — managed `CACHING_DISABLED`로 해결
- ALB 보안 그룹 규칙 제한 (CloudFront prefix list 120+ IP) — 포트 범위로 통합
- EC2 UserData Steampipe 설치를 ec2-user 대신 root로 실행
- Steampipe 수신 모드 `local` → `network` 변경 (VPC Lambda 접근 허용)
- Gateway Target API 구조를 `mcp.lambda` + `credentialProviderConfigurations`로 수정
- Code Interpreter 이름에 하이픈 사용 불가 — 언더스코어로 변경
- Lambda에서 psycopg2 호환 불가 — pg8000(순수 Python)으로 전환

## [1.0.0] - 2026-03-07

### Added

- AWSops 대시보드 21개 페이지 + 5개 API 라우트
- Next.js 14 (App Router) + Tailwind CSS 다크 네이비 테마
- Steampipe 내장 PostgreSQL 연동 (380+ AWS 테이블, 60+ K8s 테이블)
- Recharts 메트릭 시각화 및 React Flow 네트워크 토폴로지
- Powerpipe CIS v1.5~v4.0 벤치마크
- AI 라우팅: Code Interpreter, AgentCore, Steampipe+Bedrock, Bedrock Direct
- Bedrock Claude Sonnet/Opus 4.6 통합

[Unreleased]: https://github.com/whchoi98/awsops/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/whchoi98/awsops/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/whchoi98/awsops/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/whchoi98/awsops/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/whchoi98/awsops/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/whchoi98/awsops/releases/tag/v0.5.0
[1.8.1]: https://github.com/whchoi98/awsops/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/whchoi98/awsops/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/whchoi98/awsops/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/whchoi98/awsops/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/whchoi98/awsops/compare/v1.4.0...v1.5.2
[1.4.0]: https://github.com/whchoi98/awsops/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/whchoi98/awsops/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/whchoi98/awsops/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/awsops/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/whchoi98/awsops/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/whchoi98/awsops/releases/tag/v1.0.0
