variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "project" {
  type    = string
  default = "awsops-v2"
}

variable "domain_name" {
  type        = string
  description = "Public FQDN served by CloudFront, e.g. v2.example.com"
}

variable "hosted_zone_name" {
  type        = string
  description = "Route53 public hosted zone, e.g. example.com"
}

variable "extra_domain_aliases" {
  type        = list(string)
  default     = []
  description = "Additional FQDNs to accept as CloudFront aliases (ADR-016 v1 domain cutover). Each must resolve in hosted_zone_name."
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "azs" {
  type        = list(string)
  description = "Two AZs for subnets"
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "image_tag" {
  type        = string
  description = "Web image tag in ECR"
  default     = "web-latest"
}

variable "allow_vpc_db_access" {
  type    = bool
  default = true
}

variable "create_network" {
  type        = bool
  description = "true=create new VPC/subnets/NAT; false=reuse existing (set existing_* below)"
  default     = true
}

variable "existing_vpc_id" {
  type        = string
  description = "Existing VPC ID to reuse when create_network=false"
  default     = ""
}

variable "existing_private_subnet_ids" {
  type        = list(string)
  description = "Existing private subnets (>=2 AZ, NAT egress) for Fargate tasks when create_network=false"
  default     = []
}

variable "existing_public_subnet_ids" {
  type        = list(string)
  description = "Existing public subnets (>=2 AZ, IGW route) for the internet-facing ALB when create_network=false"
  default     = []
}

variable "create_edge" {
  type        = bool
  description = "Create the CloudFront edge (distribution + cert validation wait + alias record). Requires the ACM DNS validation record to be live in the authoritative zone first. Leave false to build the ALB/compute/data plane, flip true once DNS is in place."
  default     = true
}

variable "existing_acm_certificate_arn" {
  type        = string
  description = "Pre-issued us-east-1 ACM certificate ARN covering domain_name (e.g. a *.example.com wildcard). When set, the edge skips creating + DNS-validating its own certificate — useful when this account's hosted zone is a shadow copy so the validation CNAME can never be published from here. Empty (default) = create and DNS-validate a dedicated certificate."
  default     = ""
}

variable "cognito_domain_prefix" {
  type        = string
  description = "Globally-unique Cognito Hosted-UI domain prefix (no 'aws', no symbols)."
  # NOTE: Cognito rejects any domain prefix containing the reserved string
  # 'aws', so the fork's original default "awsops-v2-auth" fails at apply.
  # Default set to a valid, 'aws'-free value; override per environment for
  # global uniqueness (e.g. "a-ops-v2-auth-<account-id>").
  default = "a-ops-v2-auth"
  validation {
    condition     = !can(regex("aws", var.cognito_domain_prefix))
    error_message = "cognito_domain_prefix must not contain the reserved string 'aws'."
  }
}

variable "admin_email" {
  type        = string
  description = "Initial Cognito admin user email"
}

variable "admin_password" {
  type        = string
  description = "Initial admin permanent password (>=8, upper+lower+number)"
  sensitive   = true
}

variable "k8sgpt_enabled" {
  type        = bool
  description = "ADR-035 K8sGPT in-cluster diagnosis (AWSops-side substrate) gate. false (default) = 0 gated infra ($0), the /api/eks/[cluster]/k8sgpt route is dark (503), NO cluster read, NO narration. The always-present k8s_findings/k8s_scan_runs tables (migration v7) are harmless when off. The K8sGPT OPERATOR install is OUT-OF-BAND (docs/runbooks/k8sgpt-operator-install.md) — AWSops NEVER writes to the EKS cluster. REQUIRES onboard_eks_clusters non-empty + agentcore_enabled (narration rides the Container agent)."
  default     = false
}

variable "k8sgpt_monthly_bedrock_budget_usd" {
  type        = number
  description = "ADR-035 Rule 11 cost cap: monthly Bedrock spend budget (USD) for the K8sGPT narration. Alarm only (no enforcement). Tunable."
  default     = 50
}

variable "aurora_engine_version" {
  type        = string
  description = "Aurora PostgreSQL engine version (Serverless v2). Exact minor for a deterministic major upgrade; future minor auto-upgrades are absorbed by ignore_changes on the cluster/instance (not by a major-only pin — that mis-fires on aws_rds_cluster)."
  default     = "17.9"
}
variable "aurora_min_acu" {
  type    = number
  default = 0.5
}
variable "aurora_max_acu" {
  type    = number
  default = 4
}

variable "workers_enabled" {
  type        = bool
  description = "P2 async worker backbone gate. false (default) = 0 worker resources/cost. Enable in P2 W9."
  default     = false
}

variable "graph_rebuild_interval_mins" {
  type        = number
  description = "Minutes between web-instrumentation topology graph-rebuilds (flow/infra/trace layers, ADR-043 + 2026-06-25 trace-topology design). 0 (default) = the interval never starts; the manual `scripts/v2/graph-rebuild.mjs` path is unaffected either way. No new AWS resource — runs in the existing web task using perms it already holds. Recommended: 15 (matches steampipe.tf's inventory-sync cadence)."
  default     = 0
  validation {
    # Must be 0 (off) or a whole minute ≥1 — a fractional/zero-ish positive value (e.g. 0.01) would
    # produce an unintended, tightly-spinning Node setInterval. Capped at 1 day: this is a lightweight
    # in-process timer, not a real schedule — anything longer belongs in the EventBridge upgrade path
    # noted in instrumentation.ts, not this variable.
    condition     = var.graph_rebuild_interval_mins == 0 || (var.graph_rebuild_interval_mins == floor(var.graph_rebuild_interval_mins) && var.graph_rebuild_interval_mins >= 1 && var.graph_rebuild_interval_mins <= 1440)
    error_message = "graph_rebuild_interval_mins must be 0 (off) or a whole number of minutes between 1 and 1440."
  }
}

variable "ecs_cost_tag_active" {
  type        = bool
  description = "Activates aws:ecs:clusterName as a Cost Explorer cost-allocation tag (feeds the /inventory/ecs_cluster MTD-cost column via GroupBy TAG). AWS only allows activating a tag key once tagged usage has appeared in billing (~24h after the enable_ecs_managed_tags rollout) — flip this on in a second apply, not the same one. false (default) = 0 resources, $0, tag stays inactive (CE just returns no data for it)."
  default     = false
}

variable "ai_cost_tracking_enabled" {
  type        = bool
  description = "Scheduled awsops-only Bedrock-cost aggregator (Logs Insights /aws/bedrock/invocation-logs -> ai_usage_daily). Requires workers_enabled (reuses the worker role/pg8000 layer/VPC). false (default) = 0 resources, $0, no behavior change."
  default     = false
}

variable "datasource_diagnosis_enabled" {
  type        = bool
  description = "AI-diagnosis external-observability collector gate (ADR-039/041 governed egress). When true (requires workers_enabled), grants the worker role lambda:InvokeFunction on the 5 connector Lambdas and sets DIAG_DATASOURCES_ENABLED/HOST_ACCOUNT_ID/PROJECT on the worker so collect_datasources can fan out. false (default) = 0 resources/IAM, $0, collector stays disabled (no AccessDenied degrade)."
  default     = false
  validation {
    condition     = !var.datasource_diagnosis_enabled || (var.workers_enabled && var.agentcore_enabled && var.integrations_enabled)
    error_message = "datasource_diagnosis_enabled=true requires workers_enabled, agentcore_enabled, and integrations_enabled."
  }
}

variable "graph_querygen_enabled" {
  type        = bool
  description = "Hybrid LLM fallback for the registry-driven graph-sources design (2026-07-08): when a ClickHouse datasource's schema doesn't match graph_catalog.py's standard OTel-exporter shape, ask Bedrock (Haiku) to generate a candidate query, validated by a static read-only check, a best-effort AgentCore Code Interpreter sandbox check (skipped if no interpreter is provisioned), and a live LIMIT-1 dry run — only a query that survives all checks is cached (provenance='generated'). Requires datasource_diagnosis_enabled (runs inside the same datasource_index job). bedrock:InvokeModel is already granted via worker_lambda_diagnosis; this flag adds only the GRAPH_QUERYGEN_ENABLED env + the Code Interpreter session IAM (requires agentcore_enabled). false (default) = 0 resources/IAM, $0, the catalog's deterministic 'unavailable' row stands."
  default     = false
  validation {
    condition     = !var.graph_querygen_enabled || var.datasource_diagnosis_enabled
    error_message = "graph_querygen_enabled requires datasource_diagnosis_enabled (it runs inside the same datasource_index job and needs the same PROJECT/connector-invoke plumbing)."
  }
}

variable "diagnosis_schedule_enabled" {
  type        = bool
  description = "Scheduled auto-diagnosis dispatcher (v1 report-scheduler parity): hourly EventBridge -> Lambda scans report_schedules for due rows and enqueues read-only AI-diagnosis report jobs. Requires workers_enabled (reuses the worker role/pg8000 layer/VPC + jobs queue; adds only sqs:SendMessage). false (default) = 0 resources, $0, no scheduled runs."
  default     = false
}

variable "diagnosis_notify_enabled" {
  type        = bool
  description = "Email the scheduled-diagnosis mailing list (v1 report-scheduler parity): provisions one SNS topic; the worker publishes a summary+link to it when a SCHEDULED report finishes, and the web BFF manages its email subscriptions (/api/diagnosis/subscribers, admin-only). Governed external-comms write (ADR-040/041), IAM-scoped to the single topic ARN — NOT AWS-resource mutation. Worker publish needs workers_enabled. false (default) = 0 resources/IAM, $0, no topic, app treats it as disabled."
  default     = false
}

variable "ai_insights_enabled" {
  type        = bool
  description = "AI Insights dashboard panel: a daily worker collects K8s events + CloudWatch alarms + cost anomalies (all read-only) and an LLM synthesizes 3-5 prioritized admin bullets, cached in ai_insights and shown on the Overview dashboard with manual refresh. Requires workers_enabled (reuses worker role/pg8000/VPC + jobs queue; adds read-only cloudwatch:DescribeAlarms/GetMetricData, ce:GetCostAndUsage, eks:DescribeCluster, sqs:SendMessage). K8s events also need the worker role's EKS access entry, registered out-of-band (scripts/v2/eks/register-insight-access.sh). false (default) = 0 resources/IAM, $0, runtime fail-closed (AI_INSIGHTS_ENABLED unset)."
  default     = false
  validation {
    condition     = !var.ai_insights_enabled || var.workers_enabled
    error_message = "ai_insights_enabled requires workers_enabled (reuses the worker role/pg8000 layer/VPC + jobs queue)."
  }
}

variable "worker_image_tag" {
  type        = string
  description = "Worker Fargate image tag in the worker ECR repo."
  default     = "worker-latest"
}

variable "remediation_enabled" {
  type        = bool
  description = "ADR-029+036 remediation/mutation substrate gate. ⛔ DECISION REVERSED 2026-06-11 (3-AI consensus; docs/reviews/2026-06-11-high-risk-adr-reversal-consensus.md) — DO NOT ENABLE. The mutating direction is abandoned (AWSops stays read-only; mutation = operator's SSM/Change Manager/IaC). Stays false permanently; the flag-OFF substrate is frozen, not deleted. false = 0 mutating resources, 0 cost, ZERO live AWS mutation; the always-present catalog/plan/audit tables (migration v4) are harmless when off."
  default     = false
}

variable "integrations_write_enabled" {
  type        = bool
  description = "ADR-040/041 external knowledge/comms DATA-write gate (Slack/Notion/Jira records). Reuses the action_catalog facade + SM + executor but on a FULLY-INDEPENDENT control plane (own flag env, own kill-switch under ops/<project>/integrations-write/enabled, own no-AWS-mutation IAM) so enabling it can NEVER enable AWS-resource mutation (which stays remediation_enabled-frozen). NON-AWS-resource only. false (default) = 0 resources, zero cost, no behavior change. Ships flag-OFF; owner enables (requires agentcore/integrations + workers enabled)."
  default     = false
  validation {
    # The shared executor infra (re_or_iw) reuses workers_enabled resources (worker_lambda role, pg8000
    # layer, worker task def, status_updater); the Slack secret uses the integrations CMK (agentcore_enabled
    # && integrations_enabled). Without them, enabling this flag fails plan-time with an index error deep in
    # remediation.tf — fail LOUDLY here instead (matches rca_writeback_enabled / eks_auto_register_enabled).
    condition     = !var.integrations_write_enabled || (var.workers_enabled && var.integrations_enabled && var.agentcore_enabled)
    error_message = "integrations_write_enabled=true requires workers_enabled, integrations_enabled, and agentcore_enabled (the shared executor infra + integrations CMK)."
  }
}

variable "hybrid_routing_enabled" {
  type        = bool
  description = "ADR-038 hybrid chat routing gate. false (default) = legacy regex-only routing, no classifier Bedrock calls, no extra IAM. Enable only after the golden-set gate (scripts/v2/routing-accuracy.mjs) passes >=85% and >= +15pp over the regex baseline."
  default     = false
}

variable "multi_route_synthesis_enabled" {
  type        = bool
  description = "ADR-044 cross-domain auto-synthesis gate (web/lib/synthesize.ts, MULTI_ROUTE_SYNTHESIS_ENABLED). false (default) = single-route chat only, no direct Sonnet Bedrock call from the web task, no extra IAM. PR #153 review: the web task role previously had no bedrock:InvokeModel grant covering the Sonnet model synthesize.ts calls directly (only the ADR-038 Haiku classifier policy existed) — this flag gates the matching IAM statement."
  default     = false
}

variable "incident_lifecycle_enabled" {
  type        = bool
  description = "ADR-032 incident lifecycle gate. ⚠️ DOWNGRADED 2026-06-11 (3-AI consensus) — the autonomous mitigation/action path is abandoned (it routed through the reversed ADR-029/036). If ever enabled, it is ANALYSIS-ONLY (read-only Triage/investigation/RCA, recommendation-only, NO mutation routing). false (default) = 0 lifecycle infra, 0 cost, ZERO autonomous triggers; the always-present incident_* tables (migration v5) are harmless when off. REQUIRES workers_enabled=true to enable."
  default     = false
}

variable "rca_writeback_enabled" {
  type        = bool
  description = "ADR-034 RCA write-back gate (observability-write tier). false (default) = 0 write-back infra, 0 cost, ZERO OpsCenter/Incident-Manager write. The always-present incident_writeback table (migration v6) is harmless when off. REQUIRES incident_lifecycle_enabled=true (adds a stage to the incident SM, reads incidents.rca) AND remediation_enabled=true (reuses the opscenter-create-opsitem catalog action + action_opscenter_write per-action role from remediation.tf — frozen-substrate reuse, so decoupling onto a self-contained role is a prerequisite before activation; the validation below enforces this fail-loud). The webhook marker-drop filter is ALWAYS-ON (a harmless safety filter independent of this flag)."
  default     = false

  validation {
    # ADR-034 vs 029/036 reversal: the write-back currently reuses the frozen substrate's
    # action_opscenter_write role (count = remediation_enabled). Enabling rwb alone would
    # hit an index-out-of-range deep in incidents.tf — fail here with the real story instead.
    condition     = !var.rca_writeback_enabled || var.remediation_enabled
    error_message = "rca_writeback_enabled currently requires remediation_enabled (frozen substrate role reuse — see ADR-034 banner). remediation_enabled is DO-NOT-ENABLE (2026-06-11 reversal): to activate write-back, first decouple it onto a self-contained role."
  }
}

variable "steampipe_enabled" {
  type        = bool
  description = "D1 inventory data layer (warm Steampipe Fargate + sync Lambda). false (default) = 0 resources/cost."
  default     = false
}

variable "steampipe_image_tag" {
  type        = string
  description = "Steampipe service image tag."
  default     = "steampipe-latest"
}

variable "eks_auto_register_enabled" {
  type        = bool
  description = "EKS auto-register gate: EventBridge(CloudTrail AssociateAccessPolicy/DeleteAccessEntry for the task role) -> Lambda -> eks_registrations. Observe-only toward AWS (no resource mutation). Requires workers_enabled (pg8000 layer reuse). false (default) = 0 resources."
  default     = false

  # PR #36 review: enabling this without workers_enabled used to silently produce
  # zero resources (local.ear = enabled && workers_enabled) — fail loudly at plan instead.
  validation {
    condition     = !var.eks_auto_register_enabled || var.workers_enabled
    error_message = "eks_auto_register_enabled requires workers_enabled=true (pg8000 layer + VPC plumbing)."
  }
}

# ADR-009 — see workload.tf's LEGACY_EMAIL_OWNER_MATCH env. Default true keeps legacy email-keyed rows
# accessible to their owners — through EVERY matchesIdentity() gate, which is reads AND report
# PATCH/DELETE (canMutateReport), not reads alone. `make backfill-owner-sub` only PLANS, so a clean plan
# is not the condition: set false only once a `--apply` has succeeded and no legacy email-keyed rows
# remain (a zero-row plan also satisfies this — there was nothing to rewrite). Flipping it early makes
# those rows inaccessible to everyone but an admin.
variable "legacy_email_owner_match" {
  type        = bool
  default     = true
  description = "Accept the legacy email-keyed ownership match on read. Set false only after the owner-sub backfill reports a clean run."
}
