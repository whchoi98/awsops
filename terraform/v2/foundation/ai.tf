# AWSops v2 — P1f AgentCore provisioner (Terraform-native parts).
# AgentCore control-plane resources (Runtime/Gateway/Target/Memory/Interpreter) are NOT
# Terraform-native — they are created by scripts/v2/agentcore/provision.py after apply.
# Everything here is gated on var.agentcore_enabled (default false → no-op).

variable "agentcore_enabled" {
  type        = bool
  description = "Provision the AgentCore skeleton (ECR/IAM/Lambda/SSM). Written by `make configure`."
  default     = false
}

variable "integrations_enabled" {
  type        = bool
  description = "ADR-039 P2-infra inc2: grant the AgentCore runtime scoped Secrets Manager + KMS for egress integration credentials. Requires agentcore_enabled. Default false → no-op ($0, plan = No changes). PERSIST in live terraform.tfvars so a later full apply does not destroy these."
  default     = false
}

variable "opensearch_vpc_enabled" {
  type        = bool
  description = "Attach the opensearch-mcp Lambda to the private subnets so it can reach a VPC-only OpenSearch domain. Requires agentcore_enabled. Default false → no-op ($0); off = non-VPC (reaches public-endpoint + IAM domains via sigv4). PERSIST in live terraform.tfvars."
  default     = false
}

variable "clickhouse_vpc_enabled" {
  type        = bool
  description = "Attach the clickhouse-mcp Lambda to the private subnets so it can reach an in-VPC ClickHouse endpoint. Requires agentcore_enabled + integrations_enabled. Default false → no-op ($0); off = non-VPC (reaches a public-auth endpoint). PERSIST in live terraform.tfvars."
  default     = false
}

variable "prometheus_vpc_enabled" {
  type        = bool
  description = "Attach the prometheus-mcp Lambda to the private subnets so it can reach an in-cluster Prometheus endpoint. Requires agentcore_enabled + integrations_enabled. Default false → no-op ($0); off = non-VPC. PERSIST in live terraform.tfvars."
  default     = false
}

variable "loki_vpc_enabled" {
  type        = bool
  description = "Attach the loki-mcp Lambda to the private subnets so it can reach an in-cluster Loki endpoint. Requires agentcore_enabled + integrations_enabled. Default false → no-op ($0); off = non-VPC. PERSIST in live terraform.tfvars."
  default     = false
}

variable "tempo_vpc_enabled" {
  type        = bool
  description = "Attach the tempo-mcp Lambda to the private subnets so it can reach an in-cluster Tempo endpoint. Requires agentcore_enabled + integrations_enabled. Default false → no-op ($0); off = non-VPC. PERSIST in live terraform.tfvars."
  default     = false
}

variable "mimir_vpc_enabled" {
  type        = bool
  description = "Attach the mimir-mcp Lambda to the private subnets so it can reach an in-cluster Mimir endpoint. Requires agentcore_enabled + integrations_enabled. Default false → no-op ($0); off = non-VPC. PERSIST in live terraform.tfvars."
  default     = false
}

variable "istio_vpc_enabled" {
  type        = bool
  description = "Attach the istio-read Lambda to the private subnets so it can reach a PRIVATE-ONLY EKS API endpoint. Requires agentcore_enabled. Default false → no-op ($0); off = non-VPC (reaches a public/public+private cluster endpoint). PERSIST in live terraform.tfvars."
  default     = false
}

locals {
  ac_count    = var.agentcore_enabled ? 1 : 0
  integ_count = var.agentcore_enabled && var.integrations_enabled ? 1 : 0
  # AgentCore runtime name — a FIXED product-level constant (like v1's `awsops_agent`), NOT
  # project-derived. MUST stay in sync with RUNTIME_NAME in scripts/v2/agentcore/provision.py
  # ("awsops_v2_agent"); the provisioner appends a control-plane-generated `-<id>` suffix. IAM
  # resource ARNs that scope runtime invoke must match THIS name — deriving it from var.project
  # (e.g. "awsops_v2_stg_agent") produces an ARN that never matches the real runtime, so the web
  # task role gets AccessDenied on bedrock-agentcore:InvokeAgentRuntime and chat fails.
  agent_runtime_name = "awsops_v2_agent"
}

# ---- dual-tier ECR for the agent runtime image (mirrors ecr.tf) ----
resource "aws_ecr_repository" "agentcore" {
  count                = local.ac_count
  name                 = "${var.project}-agentcore"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  force_delete = true
}

resource "aws_ecrpublic_repository" "agentcore" {
  count           = local.ac_count
  provider        = aws.use1
  repository_name = "${var.project}-agentcore"
  catalog_data {
    about_text    = "AWSops v2 AgentCore runtime (Strands agent on AgentCore Runtime)."
    architectures = ["ARM 64"]
    description   = "AWSops v2 AgentCore agent image."
  }
}

# ---- AgentCore role: used by BOTH the Runtime (model invoke + gateway calls) and the
#      Gateways (GATEWAY_IAM_ROLE → invoke target Lambdas). Least-privilege per 3-AI Finding 6. ----
data "aws_iam_policy_document" "agentcore_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["bedrock.amazonaws.com", "bedrock-agentcore.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "agentcore" {
  count              = local.ac_count
  name               = "${var.project}-agentcore"
  assume_role_policy = data.aws_iam_policy_document.agentcore_assume.json
}

resource "aws_iam_role_policy" "agentcore" {
  count = local.ac_count
  name  = "${var.project}-agentcore-perms"
  role  = aws_iam_role.agentcore[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "BedrockModelInvoke"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = "*"
      },
      {
        Sid      = "AgentCoreControlAndData"
        Effect   = "Allow"
        Action   = ["bedrock-agentcore:*"]
        Resource = "*"
      },
      {
        Sid      = "InvokeAgentLambdasOnly"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-agent-*"
      },
      {
        # Runtime pulls its container image from the private ECR repo via this role.
        Sid      = "EcrAuthToken"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid      = "EcrPullAgentImage"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = aws_ecr_repository.agentcore[0].arn
      },
      {
        Sid      = "RuntimeLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:*"
      }
    ]
  })
}

# ---- ADR-039 P2-infra inc2: egress integrations — dedicated CMK + scoped runtime grant ----
# Integration credentials (API keys / OAuth tokens) live in Secrets Manager under
# ops/${project}/integrations/* encrypted with THIS dedicated key (isolated from the Aurora CMK).
# All count-gated on integrations_enabled (default false → $0, plan = No changes). The agent.py
# runtime (assumed-by bedrock-agentcore) reads them at request time by credentials_ref ARN.
resource "aws_kms_key" "integrations" {
  count                   = local.integ_count
  description             = "${var.project} egress integration credential encryption (ADR-039)"
  deletion_window_in_days = 7
}

resource "aws_kms_alias" "integrations" {
  count         = local.integ_count
  name          = "alias/${var.project}-integrations"
  target_key_id = aws_kms_key.integrations[0].key_id
}

# SEPARATE policy (NOT folded into aws_iam_role_policy.agentcore) so a targeted apply is purely
# additive — 0 change to the existing runtime policy. secretsmanager:GetSecretValue is scoped to the
# integrations secret NAMESPACE (the random 6-char ARN suffix means a name-prefix wildcard is the
# correct Secrets Manager scoping — this is NOT an action/resource "*"); kms:Decrypt is scoped to the
# dedicated key only. NOTE: a sigv4 integration to a specific AWS service (e.g. execute-api:Invoke)
# needs a per-target grant added when that integration is registered — DEFERRED with Q3-sigv4=C.
resource "aws_iam_role_policy" "agentcore_integrations" {
  count = local.integ_count
  name  = "${var.project}-agentcore-integrations"
  role  = aws_iam_role.agentcore[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "IntegrationSecretsRead"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:ops/${var.project}/integrations/*"
      },
      {
        Sid      = "IntegrationSecretsKmsDecrypt"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = aws_kms_key.integrations[0].arn
      }
    ]
  })
}

# ---- Single integrations credentials secret (DevOps-agent-style credential-write UX).
# ONE secret holds a JSON map keyed by integration slug (=kind): {"notion":{"token":...}, ...}.
# The web BFF writes it (PutSecretValue, admin UI); connector Lambdas read map[INTEGRATION_SLUG].
# DEFAULT aws/secretsmanager key (no custom CMK) → GetSecretValue/PutSecretValue need no
# kms:Decrypt. TF owns existence only — the VALUE is BFF-managed (no secret_version, no
# ignore_changes). Clean replacement of the never-deployed per-notion secret. ----
resource "aws_secretsmanager_secret" "integrations" {
  count                   = local.integ_count
  name                    = "ops/${var.project}/integrations/credentials"
  description             = "Integration credentials map (slug-keyed JSON) for read-tier connectors. Values written by the admin UI."
  recovery_window_in_days = 7
}

# Scoped grant on the agent Lambda EXEC role (not the agentcore runtime role) — the role the
# connector Lambdas run under. GetSecretValue on the exact single secret ARN only.
resource "aws_iam_role_policy" "agent_lambda_integrations_secret" {
  count = local.integ_count
  name  = "${var.project}-agent-lambda-integrations-secret"
  role  = aws_iam_role.agent_lambda[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "IntegrationsSecretRead"
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = aws_secretsmanager_secret.integrations[0].arn
    }]
  })
}

# inventory-read MCP (inventory_read_mcp.py) — reads the synced Aurora inventory via the RDS Data
# API (read-only SELECT). Scoped to ExecuteStatement + BeginTransaction + RollbackTransaction on
# the cluster + GetSecretValue on the RDS-managed master secret + Decrypt on the secret's CMK.
# Additive (own resource) so a targeted apply leaves the runtime policy untouched.
# pentest-remediation round 3: aws_rds_mcp.py's execute_sql wraps every Postgres query in a
# DB-level READ ONLY transaction (BeginTransaction -> SET TRANSACTION READ ONLY -> user SQL ->
# RollbackTransaction) as a structural backstop to the lexical guard — a denylist can't enumerate
# every write-capable string function, but the engine itself can refuse any write inside a
# read-only transaction (round 6: MySQL/MariaDB targets are now fail-closed in aws_rds_mcp.py's
# execute_sql before any rds-data call is made — no dedicated low-privilege MySQL credential exists,
# and `SET TRANSACTION READ ONLY` is invalid mid-transaction on MySQL anyway, so there was no
# DB-level backstop achievable for it). Begin/Rollback are
# separate IAM actions from ExecuteStatement; added here on the SAME resource (the cluster this
# role could already ExecuteStatement against) — this tightens how the role is forced to interact
# with what it could already reach, it does not expand what the role can reach, so it's not a new
# ADR-005 capability grant. CommitTransaction is deliberately NOT granted (round-4 least-privilege
# fix) — the tool always rollsback, even on success (nothing to persist from a read-only query), so
# it never calls CommitTransaction and granting it would be an unused privilege.
#
# pentest-remediation round 8 (STRUCTURAL): this role no longer reads the Aurora MASTER secret at
# all. Rounds 3-7 each found a new lexical bypass of aws_rds_mcp.py's execute_sql guard, and every
# one of them mattered only because the tool held superuser-equivalent credentials — a core function
# taking SQL as a string (`query_to_xml('...pg_cancel_backend...')`) is invisible to a filter that
# strips string literals, and `SET TRANSACTION READ ONLY` does not block control-plane calls. The
# boundary is now the database: both Data API consumers authenticate as the dedicated least-privilege
# `awsops_sql_reader` Postgres role (NOSUPERUSER, SELECT-only, default_transaction_read_only=on —
# see the `agent_sql_reader_role` migration), whose password lives in its own secret below. The
# master secret ARN and its CMK Decrypt grant are gone from this policy, so a future bypass lands in
# an unprivileged session. Removing a privilege — not an ADR-005 capability grant.
# PR #197 review MAJOR (codex-L3 + kiro-gpt-L3, 2-model convergence): this policy used to attach to
# the SHARED `agent_lambda` role — the same role all 19 agent-Lambda slices run under (network, iam,
# cost, clickhouse, notion, ...). That handed the reader-secret credential and rds-data execute
# permission to every slice, not just the two that call the RDS Data API, which is exactly the
# least-privilege regression this PR's own DB-role hardening was supposed to be moving away from.
#
# Dedicated role for the two RDS Data API consumers (rds-mcp, inventory-read) instead. It carries
# ONLY what those two Lambdas' code actually calls (verified: neither imports any boto3 client but
# `rds`/`rds-data`/`sts` — grep confirmed, no ec2/dynamodb/cloudwatch/etc.), not the full
# network+container+cost+monitoring+iac+security grant bundle the other 17 slices need. The 17
# other slices are unaffected — `agent_lambda_read` (their combined grant) is untouched, and this
# role is additive.
resource "aws_iam_role" "agent_lambda_reader" {
  count              = local.ac_count
  name               = "${var.project}-agent-lambda-reader"
  assume_role_policy = data.aws_iam_policy_document.agent_lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "agent_lambda_reader_logs" {
  count      = local.ac_count
  role       = aws_iam_role.agent_lambda_reader[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "agent_lambda_reader_scoped" {
  count = local.ac_count
  name  = "${var.project}-agent-lambda-reader-scoped"
  role  = aws_iam_role.agent_lambda_reader[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AuroraDataApiRead"
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:RollbackTransaction",
        ]
        Resource = aws_rds_cluster.aurora.arn
      },
      {
        # The dedicated low-privilege role's own secret — NOT the master secret. Default
        # aws/secretsmanager key, so no kms:Decrypt statement is needed (same as `integrations`).
        Sid      = "AuroraSqlReaderSecretRead"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.agent_sql_reader[0].arn
      },
      {
        # rds-mcp's other 5 tools (list/describe) — carried over from the shared role's DataRead
        # statement so moving rds-mcp off that role does not remove capability, only narrow it.
        Sid      = "RdsDescribeRead"
        Effect   = "Allow"
        Action   = ["rds:Describe*", "rds:ListTagsForResource"]
        Resource = "*"
      },
      {
        # Cross-account describe/list for rds-mcp's non-execute_sql tools (execute_sql itself
        # rejects a foreign target_account_id before this could even be reached — see
        # aws_rds_mcp.py's lambda_handler top-of-function guard). Carried over unchanged from the
        # shared role's CrossAccountAssumeReadOnly statement.
        Sid      = "CrossAccountAssumeReadOnly"
        Effect   = "Allow"
        Action   = ["sts:AssumeRole"]
        Resource = "arn:aws:iam::*:role/AWSopsReadOnlyRole"
      },
    ]
  })
}

# ---- Credentials for the least-privilege `awsops_sql_reader` Postgres role. -----------------------
# The RDS Data API REQUIRES a Secrets Manager secretArn on every ExecuteStatement/BeginTransaction/
# RollbackTransaction call (secretArn is a required member of all three in botocore's rds-data
# model) and sends that username/password to the engine — so IAM database auth (rds_iam, used by
# awsops_web / awsops_worker / steampipe_reader) is NOT reachable on this path, and a password
# secret is unavoidable. Terraform owns the password; `make migrate` pushes it into the DB role
# (scripts/v2/migrate.mjs), so this secret stays the single source of truth.
resource "random_password" "agent_sql_reader" {
  count   = local.ac_count
  length  = 40
  special = false # avoids quoting/escaping hazards in the ALTER ROLE ... PASSWORD sync
}
resource "aws_secretsmanager_secret" "agent_sql_reader" {
  count       = local.ac_count
  name        = "ops/${var.project}/agent/sql-reader"
  description = "awsops_sql_reader (least-privilege Aurora role) credentials for the agent Data API tools"
}
resource "aws_secretsmanager_secret_version" "agent_sql_reader" {
  count     = local.ac_count
  secret_id = aws_secretsmanager_secret.agent_sql_reader[0].id
  secret_string = jsonencode({
    username = "awsops_sql_reader"
    password = random_password.agent_sql_reader[0].result
    engine   = "postgres"
    host     = aws_rds_cluster.aurora.endpoint
    port     = 5432
    dbname   = aws_rds_cluster.aurora.database_name
  })
}

# Consumed by scripts/v2/migrate.mjs to sync the generated password onto the DB role after applying
# migrations. Empty string when agentcore is disabled → migrate.mjs skips the sync.
output "agent_sql_reader_secret_arn" {
  description = "Secret holding the awsops_sql_reader Aurora credentials ('' when agentcore_enabled=false)."
  value       = local.ac_count > 0 ? aws_secretsmanager_secret.agent_sql_reader[0].arn : ""
}

# OpenSearch read connector (opensearch_mcp.py) — AWS-native, read-only. NOTE: Amazon OpenSearch
# *managed* domains use the es: IAM prefix (NOT opensearch:, which is Serverless/aoss:). Scoped to
# HTTP read verbs on domain ARNs + list/describe for endpoint resolution.
resource "aws_iam_role_policy" "agent_lambda_opensearch" {
  count = local.ac_count
  name  = "${var.project}-agent-lambda-opensearch"
  role  = aws_iam_role.agent_lambda[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "OpenSearchHttpRead"
        Effect   = "Allow"
        Action   = ["es:ESHttpGet", "es:ESHttpPost"]
        Resource = "arn:aws:es:${var.region}:${data.aws_caller_identity.current.account_id}:domain/*/*"
      },
      {
        Sid      = "OpenSearchDescribe"
        Effect   = "Allow"
        Action   = ["es:ListDomainNames", "es:DescribeDomain", "es:DescribeDomains"]
        Resource = "*"
      },
    ]
  })
}

# ENI perms for the opensearch-mcp Lambda ONLY when it is VPC-attached (opensearch_vpc_enabled).
# Compound-gated: references agent_lambda[0], which exists only when agentcore_enabled → guard both.
resource "aws_iam_role_policy" "agent_lambda_vpc_eni" {
  count = var.agentcore_enabled && (var.opensearch_vpc_enabled || var.clickhouse_vpc_enabled || var.prometheus_vpc_enabled || var.loki_vpc_enabled || var.tempo_vpc_enabled || var.mimir_vpc_enabled || var.istio_vpc_enabled) ? 1 : 0
  name  = "${var.project}-agent-lambda-vpc-eni"
  role  = aws_iam_role.agent_lambda[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "LambdaVpcEni"
      Effect   = "Allow"
      Action   = ["ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface"]
      Resource = "*"
    }]
  })
}

# ---- SSM String params (placeholders; provision.py overwrites the value). Not secrets → String. ----
resource "aws_ssm_parameter" "agentcore_runtime_arn" {
  count     = local.ac_count
  name      = "/ops/${var.project}/agentcore/runtime_arn"
  type      = "String"
  value     = "PENDING"
  overwrite = true
  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "agentcore_interpreter_id" {
  count     = local.ac_count
  name      = "/ops/${var.project}/agentcore/interpreter_id"
  type      = "String"
  value     = "PENDING"
  overwrite = true
  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "agentcore_memory_id" {
  count     = local.ac_count
  name      = "/ops/${var.project}/agentcore/memory_id"
  type      = "String"
  value     = "PENDING"
  overwrite = true
  lifecycle {
    ignore_changes = [value]
  }
}

# ---- web task role reads the AgentCore SSM params at runtime (P3 consumer). TASK role, NOT
#      execution role → avoids the valueFrom-at-task-start race (3-AI Q3 / P1d blocker). ----
resource "aws_iam_role_policy" "task_agentcore_ssm" {
  count = local.ac_count
  name  = "${var.project}-task-agentcore-ssm"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter", "ssm:GetParameters"]
      Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/ops/${var.project}/agentcore/*"
    }]
  })
}

# v1-parity AgentCore console (web/app/agentcore + web/lib/agentcore-status.ts): read-only
# control-plane status (runtime/gateways/targets/memory/interpreter). These List*/Get* control
# actions have no resource-level scoping in AgentCore → "*", read-only by construction.
resource "aws_iam_role_policy" "task_agentcore_status" {
  count = local.ac_count
  name  = "${var.project}-task-agentcore-status"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock-agentcore:GetAgentRuntime",
        "bedrock-agentcore:ListAgentRuntimeEndpoints",
        "bedrock-agentcore:ListGateways",
        "bedrock-agentcore:ListGatewayTargets",
        "bedrock-agentcore:ListMemories",
        "bedrock-agentcore:ListCodeInterpreters",
      ]
      Resource = "*"
    }]
  })
}

# v1-parity Code Interpreter chat route (web/lib/code-interpreter.ts): the web task role runs Python
# in the provisioned AgentCore sandbox (Start/Invoke/Stop/Get session). Data-plane only — NOT the
# control-plane create/delete. Scoped to this account/region's code-interpreter resources. The
# Sonnet code-GENERATION + Bedrock-direct fallback InvokeModelWithResponseStream is already granted
# by task_synthesis_bedrock (same Sonnet FM/profile); this policy adds only the sandbox actions.
resource "aws_iam_role_policy" "task_code_interpreter" {
  count = local.ac_count
  name  = "${var.project}-task-code-interpreter"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock-agentcore:StartCodeInterpreterSession",
        "bedrock-agentcore:InvokeCodeInterpreter",
        "bedrock-agentcore:StopCodeInterpreterSession",
        "bedrock-agentcore:GetCodeInterpreterSession",
      ]
      Resource = [
        "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:code-interpreter-custom/*",
        "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:code-interpreter/*",
      ]
    }]
  })
}

# web task role may invoke the AgentCore runtime (P3-A chat). Scoped to our runtime name prefix
# (the runtime ID suffix is provisioner-generated) + its DEFAULT endpoint. No wildcard actions.
resource "aws_iam_role_policy" "task_agentcore_invoke" {
  count = local.ac_count
  name  = "${var.project}-task-agentcore-invoke"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock-agentcore:InvokeAgentRuntime"]
      Resource = [
        "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:runtime/${local.agent_runtime_name}-*",
        "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:runtime/${local.agent_runtime_name}-*/runtime-endpoint/*"
      ]
    }]
  })
}

# web task role reads Cost Explorer for the Cost page / Overview (P3-B). CE has no resource-level
# scoping → "*". Read-only (GetCostAndUsage/GetCostForecast).
resource "aws_iam_role_policy" "task_cost" {
  count = local.ac_count
  name  = "${var.project}-task-cost-read"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ce:GetCostAndUsage", "ce:GetCostForecast"]
      Resource = "*"
    }]
  })
}

data "aws_caller_identity" "current" {}

# ---- agent Lambda execution role (read-only invariant; reachability/write ops excluded) ----
data "aws_iam_policy_document" "agent_lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "agent_lambda" {
  count              = local.ac_count
  name               = "${var.project}-agent-lambda"
  assume_role_policy = data.aws_iam_policy_document.agent_lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "agent_lambda_logs" {
  count      = local.ac_count
  role       = aws_iam_role.agent_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "agent_lambda_read" {
  count = local.ac_count
  name  = "${var.project}-agent-lambda-read"
  role  = aws_iam_role.agent_lambda[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Existing slice (iam-mcp / flow-monitor). ec2:Describe* also serves network-mcp.
        Sid      = "ReadOnlySlice"
        Effect   = "Allow"
        Action   = ["iam:Get*", "iam:List*", "iam:SimulatePrincipalPolicy", "ec2:Describe*"]
        Resource = "*"
      },
      {
        # network-mcp (ELB + Network Firewall; ec2:Describe* above covers VPC/TGW/VPN/ENI/FlowLogs).
        Sid    = "NetworkRead"
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:Describe*",
          "network-firewall:Describe*",
          "network-firewall:List*"
        ]
        Resource = "*"
      },
      {
        # container: eks-mcp (control-plane) + ecs-mcp (ECS + ECR).
        Sid    = "ContainerRead"
        Effect = "Allow"
        Action = [
          "eks:Describe*",
          "eks:List*",
          "ecs:Describe*",
          "ecs:List*",
          "ecr:Describe*",
          "ecr:List*",
          "ecr:BatchGet*"
        ]
        Resource = "*"
      },
      {
        # data: rds (describe; execute_sql via Data API not granted → SELECT errors gracefully),
        #       dynamodb (describe + read items), valkey (elasticache), msk (kafka).
        Sid    = "DataRead"
        Effect = "Allow"
        Action = [
          "rds:Describe*",
          "rds:ListTagsForResource",
          "dynamodb:Describe*",
          "dynamodb:List*",
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "elasticache:Describe*",
          "kafka:Describe*",
          "kafka:List*",
          "kafka:Get*"
        ]
        Resource = "*"
      },
      {
        # cost: cost-mcp (Cost Explorer + Pricing + Budgets) + finops-mcp (Compute Optimizer +
        #       Savings Plans + Trusted Advisor via support).
        Sid    = "CostRead"
        Effect = "Allow"
        Action = [
          "ce:Get*",
          "ce:List*",
          "ce:Describe*",
          "pricing:GetProducts",
          "pricing:DescribeServices",
          "budgets:Describe*",
          "budgets:View*",
          "compute-optimizer:Get*",
          "savingsplans:Describe*",
          "support:Describe*"
        ]
        Resource = "*"
      },
      {
        # monitoring: cloudwatch-mcp (metrics + Logs Insights) + cloudtrail-mcp (Lake; StartQuery = read).
        Sid    = "MonitoringRead"
        Effect = "Allow"
        Action = [
          "cloudwatch:Get*",
          "cloudwatch:List*",
          "cloudwatch:Describe*",
          "logs:Describe*",
          "logs:Get*",
          "logs:FilterLogEvents",
          "logs:StartQuery",
          "logs:StopQuery",
          "cloudtrail:LookupEvents",
          "cloudtrail:Describe*",
          "cloudtrail:Get*",
          "cloudtrail:List*",
          "cloudtrail:StartQuery"
        ]
        Resource = "*"
      },
      {
        # iac: iac-mcp (CloudFormation). terraform-mcp / aws-knowledge need no AWS IAM (public HTTPS).
        Sid    = "IacRead"
        Effect = "Allow"
        Action = [
          "cloudformation:Describe*",
          "cloudformation:Detect*",
          "cloudformation:Get*",
          "cloudformation:List*",
          "cloudformation:ValidateTemplate"
        ]
        Resource = "*"
      },
      {
        Sid      = "CrossAccountAssumeReadOnly"
        Effect   = "Allow"
        Action   = ["sts:AssumeRole"]
        Resource = "arn:aws:iam::*:role/AWSopsReadOnlyRole"
      }
    ]
  })
}

# The slice. key → source file (handler is "<module>.lambda_handler"). cross_account.py is bundled.
locals {
  # AWS MCP slice gated on agentcore_enabled; the Notion external-integration connector
  # is gated on integrations_enabled (one unit with its secret + IAM below). integ_count
  # requires agentcore_enabled, so aws_iam_role.agent_lambda[0] is always present here.
  agent_lambdas = merge(var.agentcore_enabled ? {
    "iam-mcp"      = { file = "aws_iam_mcp.py", handler = "aws_iam_mcp.lambda_handler" }
    "flow-monitor" = { file = "flowmonitor.py", handler = "flowmonitor.lambda_handler" }
    # Read-only MCP additions (2026-06-18) — static helpers + computed reachability + istio-read.
    "core-helpers"      = { file = "core_helpers_mcp.py", handler = "core_helpers_mcp.lambda_handler" }
    "reachability-read" = { file = "reachability_read_mcp.py", handler = "reachability_read_mcp.lambda_handler" }
    "istio-read"        = { file = "istio_read_mcp.py", handler = "istio_read_mcp.lambda_handler" }
    "network-mcp"       = { file = "network_mcp.py", handler = "network_mcp.lambda_handler" }
    "eks-mcp"           = { file = "aws_eks_mcp.py", handler = "aws_eks_mcp.lambda_handler" }
    "ecs-mcp"           = { file = "aws_ecs_mcp.py", handler = "aws_ecs_mcp.lambda_handler" }
    "rds-mcp"           = { file = "aws_rds_mcp.py", handler = "aws_rds_mcp.lambda_handler" }
    "dynamodb-mcp"      = { file = "aws_dynamodb_mcp.py", handler = "aws_dynamodb_mcp.lambda_handler" }
    "msk-mcp"           = { file = "aws_msk_mcp.py", handler = "aws_msk_mcp.lambda_handler" }
    "valkey-mcp"        = { file = "aws_valkey_mcp.py", handler = "aws_valkey_mcp.lambda_handler" }
    "cost-mcp"          = { file = "aws_cost_mcp.py", handler = "aws_cost_mcp.lambda_handler" }
    "finops-mcp"        = { file = "aws_finops_mcp.py", handler = "aws_finops_mcp.lambda_handler" }
    "cloudwatch-mcp"    = { file = "aws_cloudwatch_mcp.py", handler = "aws_cloudwatch_mcp.lambda_handler" }
    "cloudtrail-mcp"    = { file = "aws_cloudtrail_mcp.py", handler = "aws_cloudtrail_mcp.lambda_handler" }
    "iac-mcp"           = { file = "aws_iac_mcp.py", handler = "aws_iac_mcp.lambda_handler" }
    "terraform-mcp"     = { file = "aws_terraform_mcp.py", handler = "aws_terraform_mcp.lambda_handler" }
    "aws-knowledge"     = { file = "aws_knowledge.py", handler = "aws_knowledge.lambda_handler" }
    "opensearch-mcp"    = { file = "opensearch_mcp.py", handler = "opensearch_mcp.lambda_handler" }
    # ops inventory_read: reads the synced Aurora topology/inventory via the RDS Data API (read-only)
    "inventory-read" = { file = "inventory_read_mcp.py", handler = "inventory_read_mcp.lambda_handler" }
    } : {}, local.integ_count > 0 ? {
    "notion-mcp"     = { file = "notion_mcp.py", handler = "notion_mcp.lambda_handler" }
    "clickhouse-mcp" = { file = "clickhouse_mcp.py", handler = "clickhouse_mcp.lambda_handler" }
    "prometheus-mcp" = { file = "prometheus_mcp.py", handler = "prometheus_mcp.lambda_handler" }
    "loki-mcp"       = { file = "loki_mcp.py", handler = "loki_mcp.lambda_handler" }
    "tempo-mcp"      = { file = "tempo_mcp.py", handler = "tempo_mcp.lambda_handler" }
    "mimir-mcp"      = { file = "mimir_mcp.py", handler = "mimir_mcp.lambda_handler" }
    # v1 datasource-family completion (2026-07-21): trace search / SaaS metric platforms.
    "jaeger-mcp"    = { file = "jaeger_mcp.py", handler = "jaeger_mcp.lambda_handler" }
    "dynatrace-mcp" = { file = "dynatrace_mcp.py", handler = "dynatrace_mcp.lambda_handler" }
    "datadog-mcp"   = { file = "datadog_mcp.py", handler = "datadog_mcp.lambda_handler" }
  } : {})
}

data "archive_file" "agent" {
  for_each    = local.agent_lambdas
  type        = "zip"
  output_path = "${path.module}/.build/agent-${each.key}.zip"
  source {
    content  = file("${path.module}/../../../agent/lambda/${each.value.file}")
    filename = each.value.file
  }
  source {
    content  = file("${path.module}/../../../agent/lambda/cross_account.py")
    filename = "cross_account.py"
  }
  # The datasource-family connectors (clickhouse/prometheus/loki/tempo/mimir) import the shared
  # `datasource_http` helper (credential load, SSRF host guard, auth headers, no-redirect HTTP, inline
  # conn-config + health probe). Bundle it into ONLY those ZIPs — without it the Lambda dies at import
  # time (Runtime.ImportModuleError: No module named 'datasource_http').
  dynamic "source" {
    for_each = contains(["clickhouse_mcp.py", "prometheus_mcp.py", "loki_mcp.py", "tempo_mcp.py", "mimir_mcp.py", "jaeger_mcp.py", "dynatrace_mcp.py", "datadog_mcp.py"], each.value.file) ? [1] : []
    content {
      content  = file("${path.module}/../../../agent/lambda/datasource_http.py")
      filename = "datasource_http.py"
    }
  }
  # pentest-remediation P2-4: clickhouse_mcp.py and aws_rds_mcp.py share the read-only SQL guard in
  # `sql_readonly_guard.py` (strip comments/strings, require a read-verb-leading single statement,
  # reject write/admin keywords). Bundle it into ONLY those two ZIPs — same ImportModuleError risk as
  # datasource_http above.
  dynamic "source" {
    for_each = contains(["clickhouse_mcp.py", "aws_rds_mcp.py"], each.value.file) ? [1] : []
    content {
      content  = file("${path.module}/../../../agent/lambda/sql_readonly_guard.py")
      filename = "sql_readonly_guard.py"
    }
  }
}

resource "aws_lambda_function" "agent" {
  for_each      = local.agent_lambdas
  function_name = "${var.project}-agent-${each.key}"
  # rds-mcp/inventory-read run under the dedicated reader role (agent_lambda_reader) — see the
  # PR #197 review comment above that role's definition. Every other slice is unaffected.
  role             = contains(["rds-mcp", "inventory-read"], each.key) ? aws_iam_role.agent_lambda_reader[0].arn : aws_iam_role.agent_lambda[0].arn
  runtime          = "python3.11"
  handler          = each.value.handler
  filename         = data.archive_file.agent[each.key].output_path
  source_code_hash = data.archive_file.agent[each.key].output_base64sha256
  timeout          = 60
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge({
      # Same-account access uses the Lambda's own execution role; AssumeRole is
      # only for *other* onboarded accounts. Lets cross_account.get_role_arn skip
      # a self-assume of AWSopsReadOnlyRole (which exists only in target accounts,
      # never the host) — otherwise host-account tool calls fail with AccessDenied.
      AWSOPS_HOST_ACCOUNT_ID = data.aws_caller_identity.current.account_id
      },
      # Connectors that read the single integrations secret get its exact TF-created name (no drift
      # from the Python default). notion-mcp also pins INTEGRATION_SLUG; clickhouse-mcp uses a fixed
      # SLUG in code. Both exist only when integ_count>0 so integrations[0] is safe.
      contains(["notion-mcp", "clickhouse-mcp", "prometheus-mcp", "loki-mcp", "tempo-mcp", "mimir-mcp", "jaeger-mcp", "dynatrace-mcp", "datadog-mcp"], each.key) ? merge(
        { INTEGRATIONS_SECRET_NAME = aws_secretsmanager_secret.integrations[0].name },
        each.key == "notion-mcp" ? { INTEGRATION_SLUG = "notion" } : {}
      ) : {},
      # inventory-read reads the synced Aurora inventory via the RDS Data API (no VPC, no pg8000) —
      # needs the cluster ARN, a credential secret, and the DB name. Round 8: that credential is the
      # least-privilege `awsops_sql_reader` secret, NOT the RDS-managed master secret (both this
      # connector and rds-mcp's execute_sql are pure SELECT paths).
      each.key == "inventory-read" ? {
        AURORA_CLUSTER_ARN = aws_rds_cluster.aurora.arn
        AURORA_SECRET_ARN  = aws_secretsmanager_secret.agent_sql_reader[0].arn
        AURORA_DATABASE    = aws_rds_cluster.aurora.database_name
      } : {},
      # rds-mcp's execute_sql resolves its Data API credential and database from env ONLY — the
      # caller-supplied secret_arn/database arguments are ignored (and removed from the tool schema).
      # Unset => the tool fails closed rather than falling back to anything more privileged.
      # AURORA_CLUSTER_ARN is the cluster that reader secret belongs to: round 10 MAJOR — execute_sql
      # refuses any other resource_arn instead of letting the Data API raise an unhandled 500.
      each.key == "rds-mcp" ? {
        AURORA_SQL_READER_SECRET_ARN = aws_secretsmanager_secret.agent_sql_reader[0].arn
        AURORA_CLUSTER_ARN           = aws_rds_cluster.aurora.arn
        AURORA_DATABASE              = aws_rds_cluster.aurora.database_name
      } : {}
    )
  }

  # Per-Lambda VPC opt-in: attach a connector to the private subnets ONLY when its <name>_vpc_enabled
  # flag is set (opensearch/clickhouse/prometheus/loki/tempo/mimir for VPC-only datasources;
  # istio-read for a private-only EKS API endpoint). Off (default) → no vpc_config → non-VPC.
  dynamic "vpc_config" {
    for_each = ((each.key == "opensearch-mcp" && var.opensearch_vpc_enabled) || (each.key == "clickhouse-mcp" && var.clickhouse_vpc_enabled) || (each.key == "prometheus-mcp" && var.prometheus_vpc_enabled) || (each.key == "loki-mcp" && var.loki_vpc_enabled) || (each.key == "tempo-mcp" && var.tempo_vpc_enabled) || (each.key == "mimir-mcp" && var.mimir_vpc_enabled) || (each.key == "istio-read" && var.istio_vpc_enabled)) ? [1] : []
    content {
      subnet_ids         = local.private_subnet_ids
      security_group_ids = [aws_security_group.service.id]
    }
  }
}

# Allow the AgentCore Gateway (via its IAM role) to invoke each agent Lambda.
resource "aws_lambda_permission" "agent_agentcore" {
  for_each      = local.agent_lambdas
  statement_id  = "AllowAgentCoreInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.agent[each.key].function_name
  principal     = "bedrock-agentcore.amazonaws.com"
  # Confused-deputy guard: only AgentCore gateways in THIS account may invoke.
  source_account = data.aws_caller_identity.current.account_id
}

# ---- outputs consumed by scripts/v2/agentcore/provision.py ----
output "agentcore" {
  description = "AgentCore provisioning inputs for scripts/v2/agentcore/provision.py (null when disabled)."
  value = var.agentcore_enabled ? {
    region             = var.region
    project            = var.project
    role_arn           = aws_iam_role.agentcore[0].arn
    ecr_uri            = aws_ecr_repository.agentcore[0].repository_url
    lambda_arns        = { for k, fn in aws_lambda_function.agent : k => fn.arn }
    ssm_runtime_arn    = aws_ssm_parameter.agentcore_runtime_arn[0].name
    ssm_interpreter_id = aws_ssm_parameter.agentcore_interpreter_id[0].name
    ssm_memory_id      = aws_ssm_parameter.agentcore_memory_id[0].name
    # Runtime VPC mode (Pattern 2): ENIs in our private subnets (apne2-az1/az2, AgentCore-supported)
    # so section agents can reach private resources (Aurora/EKS) directly. Reuse the service SG —
    # the Aurora SG already allows it (C8), and its egress→NAT lets the runtime still reach
    # Bedrock/AgentCore/ECR. provision.py emits networkMode=VPC when these are present.
    subnets         = local.private_subnet_ids
    security_groups = [aws_security_group.service.id]
  } : null
}
