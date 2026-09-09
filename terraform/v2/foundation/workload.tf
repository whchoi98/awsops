resource "aws_ecs_cluster" "main" {
  name = var.project
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.project}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}




resource "aws_iam_role" "task" {
  name               = "${var.project}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# Integration credential-write UX: the BFF read-modify-writes the single integrations credentials
# secret (admin UI). Get + Put scoped to that ONE secret ARN; default key → no kms:Decrypt.
# integ_count-gated (matches the secret's existence in ai.tf). No CreateSecret, no Principal:*.
resource "aws_iam_role_policy" "task_connector_invoke" {
  count = local.integ_count
  name  = "${var.project}-task-connector-invoke"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "InvokeConnectorLambdas"
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-agent-*"
    }]
  })
}

resource "aws_iam_role_policy" "task_integrations_secret" {
  count = local.integ_count
  name  = "${var.project}-task-integrations-secret"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "IntegrationsSecretReadWrite"
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
      Resource = aws_secretsmanager_secret.integrations[0].arn
    }]
  })
}

# RDS IAM database auth: web/lib/db.ts generates a short-lived signed token (rds-db:connect) to
# connect as the dedicated least-privilege `awsops_web` Postgres role (see the awsops_web_role
# migration) instead of the Aurora master secret — mirrors steampipe.tf's steampipe_reader pattern.
# Scoped to this cluster's resource id + that exact dbuser; the master secret is never granted here.
resource "aws_iam_role_policy" "task_rds_iam_auth" {
  name = "${var.project}-web-rds-iam-auth"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["rds-db:connect"]
      Resource = "arn:aws:rds-db:${var.region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_rds_cluster.aurora.cluster_resource_id}/awsops_web"
    }]
  })
}

# F5: read-only CloudWatch metrics + Pricing API for the EC2 page KPI cards
# (평균 CPU via GetMetricData, 시간당 비용 via Pricing GetProducts). Read-only invariant.
resource "aws_iam_role_policy" "task_metrics" {
  name = "${var.project}-task-metrics-read"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "pricing:GetProducts",
        "pricing:DescribeServices",
        # MSK detail panel: bootstrap broker connection strings (read-only)
        "kafka:GetBootstrapBrokers",
        # MSK broker-nodes table (v1 parity): node list per cluster (read-only)
        "kafka:ListNodes",
        # CloudTrail recent-events tab (read-only audit lookup)
        "cloudtrail:LookupEvents",
        # /security container-CVE tab: ECR image scan findings (read-only)
        "ecr:DescribeRepositories",
        "ecr:DescribeImages",
        "ecr:DescribeImageScanFindings",
        # /network-flow + EKS Pod 전송량: CloudWatch Network Flow Monitor top-contributors
        # queries (read-only in effect — Start/Stop only manage the async query lifecycle)
        "networkflowmonitor:ListMonitors",
        "networkflowmonitor:GetMonitor",
        "networkflowmonitor:ListScopes",
        "networkflowmonitor:GetScope",
        "networkflowmonitor:StartQueryMonitorTopContributors",
        "networkflowmonitor:GetQueryStatusMonitorTopContributors",
        "networkflowmonitor:GetQueryResultsMonitorTopContributors",
        "networkflowmonitor:StopQueryMonitorTopContributors",
        # /dns-query: Route53 Resolver query-log config discovery + Logs Insights aggregation
        # (+ DescribeLogGroups: CoreDNS 소스인 CI application 로그 그룹 발견)
        "route53resolver:ListResolverQueryLogConfigs",
        "logs:StartQuery",
        "logs:GetQueryResults",
        "logs:StopQuery",
        "logs:DescribeLogGroups",
        # /ip-addresses: ENI 전량 + EIP 조회 (IP → 리소스 매핑, 미사용 EIP 탐지)
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeAddresses",
        # inventory transit_gateway 상세: 어태치먼트 + 라우트 테이블 + 라우트 검색
        "ec2:DescribeTransitGatewayAttachments",
        "ec2:DescribeTransitGatewayRouteTables",
        "ec2:SearchTransitGatewayRoutes",
        # /vpc-endpoints: 엔드포인트 리스트+분석 (PrivateLink 메트릭 미사용 감지)
        "ec2:DescribeVpcEndpoints",
        # /direct-connect: DX 커넥션/VIF/게이트웨이 리스트+상태 (read-only)
        "directconnect:DescribeConnections",
        "directconnect:DescribeVirtualInterfaces",
        "directconnect:DescribeDirectConnectGateways",
        "directconnect:DescribeDirectConnectGatewayAssociations",
        # LAG 위 VIF 사용률 분모(대역폭) + BGP 라우트 가시성 (2026-07 ListVirtualInterfaceRoutes)
        "directconnect:DescribeLags",
        "directconnect:ListVirtualInterfaceRoutes",
        # /inventory/security_group SG 분석: 사용 유무(ENI 부착)+상호참조+프리픽스 리스트+flow log 발견 (read-only)
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeManagedPrefixLists",
        "ec2:DescribeFlowLogs",
        # /network-firewall: 방화벽/정책/룰그룹 리스트+상태+로깅 구성 (read-only)
        "network-firewall:ListFirewalls",
        "network-firewall:DescribeFirewall",
        "network-firewall:ListFirewallPolicies",
        "network-firewall:DescribeFirewallPolicy",
        "network-firewall:ListRuleGroups",
        "network-firewall:DescribeRuleGroup",
        "network-firewall:DescribeLoggingConfiguration",
      ]
      Resource = "*"
      }, {
      # aws-data 챗 라우트: Steampipe 네트워크 리스너 비밀번호 (해당 시크릿만 스코프)
      Sid      = "SteampipeSecret"
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = "arn:aws:secretsmanager:*:*:secret:${var.project}-steampipe-db-*"
    }]
  })
}

# Multi-account: the web task role assumes the read-only role in each registered TARGET account
# (web/lib/aws-assume.ts, with ExternalId). Scoped to the role NAME (target accounts are dynamic);
# read-only assume — grants nothing in the target beyond that role's ReadOnlyAccess.
resource "aws_iam_role_policy" "task_assume_readonly" {
  name = "${var.project}-task-assume-readonly"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sts:AssumeRole"]
      Resource = "arn:aws:iam::*:role/AWSopsReadOnlyRole"
    }]
  })
}

# ADR-031 Phase 1: admin gate (always-on — unlike AgentCore, the admin gate is not feature-flagged).
# Comma-separated admin-email allowlist; managed out-of-band (ignore drift). Empty/blank = cognito:groups-only.
resource "aws_ssm_parameter" "admin_emails" {
  name        = "/ops/${var.project}/admin_emails"
  description = "ADR-031: comma-separated admin email allowlist for custom-agent authoring. Blank = cognito:groups-only."
  type        = "StringList"
  value       = " "
  lifecycle { ignore_changes = [value] }
}

# Web task role reads the admin-email allowlist (web/lib/admin.ts SSMClient.GetParameter). Read-only, single param.
resource "aws_iam_role_policy" "task_admin_ssm" {
  name = "${var.project}-task-admin-ssm"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = [aws_ssm_parameter.admin_emails.arn]
    }]
  })
}

# ADR-029+036: the web execute route reads the mutating-actions kill-switch param to fail-closed
# before SendTaskSuccess. Gated (var.remediation_enabled) so the web task role is UNTOUCHED when off.
resource "aws_iam_role_policy" "task_killswitch_ssm" {
  count = var.remediation_enabled ? 1 : 0
  name  = "${var.project}-task-killswitch-ssm"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = [aws_ssm_parameter.mutating_enabled[0].arn]
    }]
  })
}

# ADR-038: BFF Haiku routing classifier. Scoped to Haiku FM + global inference profile only.
resource "aws_iam_role_policy" "task_classifier_bedrock" {
  count = var.hybrid_routing_enabled ? 1 : 0
  name  = "${var.project}-task-classifier-bedrock"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock:InvokeModel"]
      Resource = [
        # global cross-region profile fans out to per-region FMs → wildcard region on the FM ARN
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-*",
        "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/global.anthropic.claude-haiku-4-5-*",
      ]
    }]
  })
}

# ADR-044: cross-domain auto-synthesis (web/lib/synthesize.ts calls Bedrock directly from the web
# task, not via AgentCore's unrestricted role). PR #153 review: this had no matching IAM grant —
# only the Haiku classifier policy above existed on this role, so a live invoke would AccessDenied.
resource "aws_iam_role_policy" "task_synthesis_bedrock" {
  count = var.multi_route_synthesis_enabled ? 1 : 0
  name  = "${var.project}-task-synthesis-bedrock"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      Resource = [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-5",
        "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/global.anthropic.claude-sonnet-5",
      ]
    }]
  })
}

# ADR-032: the web incident ingress (HMAC webhook) + synchronous Triage path reads the incident SSM
# params (window/storm-cap knobs + the HMAC webhook secret(s)) and synchronously consults the
# read-only AgentCore runtime. Gated (local.il) so the web task role is UNTOUCHED when off (when
# incident_lifecycle_enabled=false the route 503s first and never reads any of these).
resource "aws_iam_role_policy" "task_incident_ssm" {
  count = local.il
  name  = "${var.project}-task-incident-ssm"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Read the five configurable-window params + the operator-provisioned HMAC webhook secret(s).
        # Scoped to the project's incident SSM namespace (covers webhook-hmac-secret / -standby too).
        Sid      = "ReadIncidentParams"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/ops/${var.project}/incident/*"]
      },
      {
        # Synchronous read-only Triage consult against the project's AgentCore runtime. Scoped to
        # the provisioner's fixed runtime name (local.agent_runtime_name) + its generated suffix —
        # NOT var.project, which yields a non-matching ARN (hyphens + wrong prefix).
        Sid      = "InvokeAgentRuntime"
        Effect   = "Allow"
        Action   = ["bedrock-agentcore:InvokeAgentRuntime"]
        Resource = "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:runtime/${local.agent_runtime_name}-*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project}-web"
  retention_in_days = 30
}

# pentest-remediation P7-review (MAJOR 2): the server-side session-revocation check (ADR-002 §2-4)
# is deliberately FAIL-OPEN on Aurora trouble — if Aurora is degraded or the `max: 3` pool is
# saturated, revocation is effectively OFF and the only signal was a console.warn nobody reads.
# Since fail-open is the documented availability-first choice, DETECTION is the compensating
# control, so it can't be optional: unconditional (no flag) — 2 filters + 2 alarms ≈ $0.20/mo on a
# log group that already exists. Same shape as secret-rotation.tf's skip-path filter/alarm, and
# like those it has no alarm_actions yet (no SNS topic is wired in this root) — wire alarm_actions
# to your alerting stack before relying on it; the alarm is visible in the console meanwhile.
resource "aws_cloudwatch_log_metric_filter" "revocation_check_failed" {
  log_group_name = aws_cloudwatch_log_group.web.name
  name           = "${var.project}-revocation-check-failed"
  pattern        = "\"revocation_check_failed\""
  metric_transformation {
    name      = "RevocationCheckFailed"
    namespace = "${var.project}/auth"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "revocation_write_failed" {
  log_group_name = aws_cloudwatch_log_group.web.name
  name           = "${var.project}-revocation-write-failed"
  pattern        = "\"revocation_write_failed\""
  metric_transformation {
    name      = "RevocationWriteFailed"
    namespace = "${var.project}/auth"
    value     = "1"
    unit      = "Count"
  }
}

# Both should be exactly zero in steady state, so alarm on a SUSTAINED count (2 consecutive 5-min
# periods) rather than a single blip — one warn during an Aurora Serverless v2 scaling event is the
# expected fail-open behavior, not an incident. The read path's warn is deduped to ~1 line per sub
# per 10s (web/lib/auth.ts), so >5 in a period means several distinct users, not one noisy loop.
resource "aws_cloudwatch_metric_alarm" "revocation_check_failed" {
  alarm_name          = "${var.project}-revocation-check-failed"
  alarm_description   = "verifyUser()'s revocation check is failing (Aurora degraded / pool saturated) — session revocation is failing OPEN, i.e. logged-out id_tokens are being accepted again. See ADR-002 §2-4."
  namespace           = "${var.project}/auth"
  metric_name         = "RevocationCheckFailed"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  period              = 300
  evaluation_periods  = 2
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "revocation_write_failed" {
  alarm_name = "${var.project}-revocation-write-failed"
  # Lower threshold: this fires only on actual signouts (far lower volume than the read path), so a
  # couple per period already means logouts are not being recorded at all.
  alarm_description   = "POST /api/auth/signout could not record the session revocation — users' logouts are not cutting their id_tokens off. See ADR-002 §2-4."
  namespace           = "${var.project}/auth"
  metric_name         = "RevocationWriteFailed"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 2
  period              = 300
  evaluation_periods  = 2
  treat_missing_data  = "notBreaching"
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name         = "web"
      image        = "${aws_ecr_repository.web.repository_url}:${var.image_tag}"
      essential    = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      # concat keeps this byte-identical when workers_enabled=false (concat(base, []) == base →
      # no web task-def revision / redeploy). Enabling workers adds JOBS_QUEUE_URL (W7 producer).
      environment = concat([
        { name = "PORT", value = "3000" },
        # Force Next.js standalone to bind 0.0.0.0. Docker/ECS sets the runtime HOSTNAME to the
        # container hostname (→ ENI IP only), overriding the Dockerfile's ENV HOSTNAME=0.0.0.0,
        # so the app listened on the ENI IP and the 127.0.0.1 container healthcheck probe failed
        # (ALB to the ENI IP still passed). Pinning HOSTNAME here makes loopback reachable.
        { name = "HOSTNAME", value = "0.0.0.0" },
        # The legacy email-keyed ownership match is the email-reassignment exposure; it stays on
        # until `make backfill-owner-sub` (PR #203) has rewritten legacy rows, then this flips to
        # "false" and matchesIdentity() looks at the immutable sub only. Wired here because
        # `make deploy` only force-new-deployments the EXISTING task def — a flag that is not in this
        # block cannot be turned off through the standard deploy path at all (PR #195 review MAJOR).
        { name = "LEGACY_EMAIL_OWNER_MATCH", value = tostring(var.legacy_email_owner_match) },
        { name = "AURORA_ENDPOINT", value = aws_rds_cluster.aurora.endpoint },
        { name = "AURORA_DATABASE", value = aws_rds_cluster.aurora.database_name },
        # IAM DB auth (rds-db:connect above) — a fixed username, not a secret, since the "password"
        # is now a short-lived signed token web/lib/db.ts generates per connection.
        { name = "AURORA_USER", value = "awsops_web" },
        { name = "AWS_REGION", value = var.region },
        { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.main.id },
        { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.main.id },
        # C02 sign-out: the BFF builds the hosted-UI /logout redirect from these (cookie clear
        # alone leaves the Cognito session live). APP_DOMAIN matches auth.tf logout_urls.
        { name = "COGNITO_DOMAIN", value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com" },
        { name = "APP_DOMAIN", value = var.domain_name },
        { name = "SSM_RUNTIME_ARN_PARAM", value = "/ops/${var.project}/agentcore/runtime_arn" },
        # v1-parity Code Interpreter chat route: the BFF reads the provisioned interpreter id from
        # SSM (fail-open — absent/pending ⇒ the code route no-ops and normal routing runs).
        { name = "SSM_INTERPRETER_ID_PARAM", value = "/ops/${var.project}/agentcore/interpreter_id" },
        { name = "INTEGRATIONS_SECRET_NAME", value = "ops/${var.project}/integrations/credentials" },
        { name = "PROJECT", value = var.project }, # connector-invoke builds ${PROJECT}-agent-<slug>-mcp; must match the IAM resource

        { name = "INV_SYNC_FUNCTION", value = var.steampipe_enabled ? "${var.project}-inv-sync" : "" },
        # P3-D: onboarded-cluster allow-list for the in-cluster (K8s) read routes.
        # Static join of the tfvar (no cross-resource ref) — the BFF gates /api/eks/[cluster]/* on this.
        { name = "ONBOARDED_EKS_CLUSTERS", value = join(",", var.onboard_eks_clusters) },
        # ADR-031 Phase 1: admin gate config (always-on; the page/API 403s non-admins).
        { name = "ADMIN_GROUP", value = "admins" },
        { name = "SSM_ADMIN_EMAILS_PARAM", value = "/ops/${var.project}/admin_emails" },
        # ADR-031 Phase 2: this account's id, so the BFF can resolve the per-account Agent Space.
        { name = "HOST_ACCOUNT_ID", value = data.aws_caller_identity.current.account_id },
        # AI Diagnosis (Task 1b): the diagnosis POST route reads process.env.AWS_ACCOUNT_ID.
        { name = "AWS_ACCOUNT_ID", value = data.aws_caller_identity.current.account_id },
        ], var.workers_enabled ? [
        { name = "JOBS_QUEUE_URL", value = one(aws_sqs_queue.jobs[*].url) }
        ] : [], var.remediation_enabled ? [
        # ADR-029+036: the web execute route reads the kill-switch param name + remediation SM ARN.
        # concat(base, []) == base when remediation_enabled=false → byte-identical web task def.
        # REMEDIATION_ENABLED is the flag the execute route fails-closed on (env-side hard gate).
        { name = "REMEDIATION_ENABLED", value = "true" },
        { name = "MUTATING_ACTIONS_SSM", value = one(aws_ssm_parameter.mutating_enabled[*].name) },
        { name = "REMEDIATION_STATE_MACHINE_ARN", value = one(aws_sfn_state_machine.remediation[*].arn) }
        ] : [], var.integrations_write_enabled ? [
        # ADR-040/041: external DATA-write plane env for the /api/actions execute route — its OWN flag +
        # kill-switch param (separate from the AWS-resource ones above). The web enqueues to SQS (the
        # dispatcher owns the SM ARN), so no SM ARN here → no duplicate when both planes are on.
        { name = "INTEGRATIONS_WRITE_ENABLED", value = "true" },
        { name = "INTEGRATIONS_WRITE_SSM", value = one(aws_ssm_parameter.integrations_write_enabled[*].name) }
        ] : [], var.incident_lifecycle_enabled ? [
        # ADR-032: the incident ingress/triage routes read INCIDENT_LIFECYCLE_ENABLED FIRST and 503
        # when not "true" (no accept / HMAC / normalize / triage / enqueue). concat(base, []) == base
        # when incident_lifecycle_enabled=false → byte-identical web task def (no redeploy when off).
        # The synchronous Triage path runs in web (thin-BFF); heavy work is enqueued to the worker SM.
        { name = "INCIDENT_LIFECYCLE_ENABLED", value = "true" },
        { name = "PROJECT", value = var.project },
        # HMAC webhook secret(s) (ADR-022 active/standby) — operator-provisioned SSM params (read
        # once, cached by the route). Names only here; the web task role grants read on the namespace.
        { name = "SSM_INCIDENT_HMAC_SECRET_PARAM", value = "/ops/${var.project}/incident/webhook-hmac-secret" },
        { name = "SSM_INCIDENT_HMAC_STANDBY_PARAM", value = "/ops/${var.project}/incident/webhook-hmac-standby" },
        # The five configurable-window / storm-cap param names (Addendum #4/#7).
        { name = "INCIDENT_CORRELATION_WINDOW_PARAM", value = one(aws_ssm_parameter.incident_correlation_window[*].name) },
        { name = "INCIDENT_STAGE_TIMEOUT_PARAM", value = one(aws_ssm_parameter.incident_stage_timeout[*].name) },
        { name = "INCIDENT_MAX_CONCURRENT_PARAM", value = one(aws_ssm_parameter.incident_max_concurrent[*].name) },
        { name = "INCIDENT_FANOUT_MAX_PARAM", value = one(aws_ssm_parameter.incident_fanout_max[*].name) },
        { name = "INCIDENT_MIN_SEVERITY_PARAM", value = one(aws_ssm_parameter.incident_min_severity[*].name) },
        # AgentCore runtime-ARN param (the synchronous read-only Triage/consult path).
        { name = "AGENTCORE_RUNTIME_ARN_PARAM", value = "/ops/${var.project}/agentcore/runtime_arn" }
        ] : [], var.eks_auto_register_enabled ? [
        # EKS auto-register is on — the onboarding guide promises hands-free connection.
        { name = "EKS_AUTO_REGISTER", value = "true" }
        ] : [], var.hybrid_routing_enabled ? [
        # ADR-038: hybrid routing flag + classifier model (BFF reads both at runtime).
        { name = "HYBRID_ROUTING_ENABLED", value = "true" },
        { name = "CLASSIFIER_MODEL_ID", value = "global.anthropic.claude-haiku-4-5-20251001-v1:0" }
        ] : [], var.multi_route_synthesis_enabled ? [
        # ADR-044: cross-domain auto-synthesis — matches the aws_iam_role_policy.task_synthesis_bedrock gate above.
        { name = "MULTI_ROUTE_SYNTHESIS_ENABLED", value = "true" }
        ] : [], var.k8sgpt_enabled ? [
        # ADR-035: the /api/eks/[cluster]/k8sgpt route reads K8SGPT_ENABLED FIRST and 503s when not
        # "true" (no cluster read / STS presign / narration). concat(base, []) == base when
        # k8sgpt_enabled=false → byte-identical web task def (no redeploy when off). Read-only: the
        # route consumes deterministic K8sGPT Result CRDs via the P3-D GET-only path and narrates
        # with our own Haiku (fact analyzer_result vs hypothesis llm_explanation kept separate).
        { name = "K8SGPT_ENABLED", value = "true" },
        { name = "K8SGPT_STALE_MINUTES", value = "5" },
        { name = "K8SGPT_NARRATION_MODEL", value = "global.anthropic.claude-haiku-4-5-20251001-v1:0" },
        ] : [], var.datasource_diagnosis_enabled ? [
        # External datasource diagnosis enqueue gate. False/default omits the env so add/schema-refresh
        # routes do not enqueue datasource_index jobs; the worker has the same DIAG_DATASOURCES_ENABLED
        # hard gate, so activation and egress permissions move together.
        { name = "DATASOURCE_DIAGNOSIS_ENABLED", value = "true" },
        ] : [], var.ai_insights_enabled ? [
        # AI Insights gate: omit the env when off → concat(base, []) == base (no web task-def diff/redeploy).
        # The BFF /api/insights(+refresh) read AI_INSIGHTS_ENABLED and no-op/hide when it's absent.
        { name = "AI_INSIGHTS_ENABLED", value = "true" },
        ] : [], var.graph_rebuild_interval_mins > 0 ? [
        # instrumentation.ts's register() reads this to schedule the graph-rebuild interval; 0/absent
        # (default) means the interval never starts — concat(base, []) == base, byte-identical web
        # task def when off. The manual scripts/v2/graph-rebuild.mjs path is unaffected either way.
        { name = "GRAPH_REBUILD_INTERVAL_MINS", value = tostring(var.graph_rebuild_interval_mins) },
        ] : [],
        # Scheduled-diagnosis mailing list (gated): empty list when diagnosis_notify_enabled=false →
        # concat(base, []) == base → byte-identical web task def (no redeploy when off).
      local.notify_web_env_list)
      # No `secrets` block: the web task no longer injects the Aurora master secret at all (IAM DB
      # auth above replaces it) — removes the class of bug where a long-running task holds a
      # password that goes stale on the master secret's next auto-rotation.
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q -O - http://127.0.0.1:3000/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 40
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])
}

# CloudFront's origin-facing edge IP ranges as an AWS-managed prefix list. This
# ALWAYS exists (it is not tied to VPC Origin), so the internet-facing ALB can
# admit CloudFront from the first apply — no bootstrap ordering problem.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  # name_prefix + create_before_destroy: this SG is referenced inline by the
  # service SG, so a name-collision on replace would otherwise deadlock (can't
  # delete the old one while it's referenced, can't create a same-named new one).
  # CBD stands up the new SG first, lets the service SG re-point, then removes old.
  name_prefix = "${var.project}-alb-"
  description = "Internet-facing ALB - CloudFront origin-facing prefix list only"
  vpc_id      = local.vpc_id

  # http-only origin: CloudFront connects to the ALB on port 80 (viewer traffic
  # is still HTTPS at the edge). Source restricted to CloudFront edge ranges.
  ingress {
    description     = "HTTP from CloudFront edge (origin-facing managed prefix list)"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "service" {
  name = "${var.project}-service-sg"
  # description kept verbatim to match the existing SG (immutable → avoids a replace).
  description = "Spine Fargate tasks"
  vpc_id      = local.vpc_id

  ingress {
    description     = "ALB to Fargate"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# No ALB ACM cert: CloudFront reaches the ALB over HTTP (http-only origin), so
# the ALB does not terminate TLS. Viewer↔CloudFront is still HTTPS. Removing it
# also drops the ap-northeast-2 cert, leaving only the CloudFront (us-east-1)
# cert to DNS-validate.

# Secret shared between CloudFront (sent as X-Origin-Verify) and the ALB listener.
resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

# Internet-facing, but the SG admits only CloudFront's origin-facing prefix list
# and the listener requires a secret origin header — so it is reachable in
# practice only through this distribution.
resource "aws_lb" "spine" {
  name               = "${var.project}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids
  idle_timeout       = 120
}

moved {
  from = aws_lb.internal
  to   = aws_lb.spine
}

resource "aws_lb_target_group" "web" {
  name        = "${var.project}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    matcher             = "200-399"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.spine.arn
  port              = 80
  protocol          = "HTTP"
  # Default: reject anything that did not arrive through our CloudFront (no/other
  # X-Origin-Verify). The prefix-list SG admits ALL CloudFront distributions, so
  # this secret header is what pins traffic to THIS distribution.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Direct access not allowed"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "cf_only" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }
}

resource "aws_ecs_service" "web" {
  name            = "${var.project}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Propagates aws:ecs:clusterName (+ aws:ecs:serviceName) onto every task, so a cost-allocation
  # tag on that key (see var.ecs_cost_tag_active) lets Cost Explorer GroupBy TAG roll usage up
  # per cluster — CE has no native cluster dimension otherwise.
  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"

  depends_on = [aws_lb_listener.http]
}

# Only the target group rename needs a moved block (its name "${var.project}-tg" is
# unchanged, so this is an in-place rename, not a destroy/recreate that would collide
# on the duplicate name). Same-address moves are a hard TF error, so nothing else here.
moved {
  from = aws_lb_target_group.spine
  to   = aws_lb_target_group.web
}

# Gated separately from enable_ecs_managed_tags above: AWS-generated tag keys can only be
# activated once tagged usage has actually appeared in CE (~24h lag) — activating an unseen
# key errors, hence the two-step rollout (var.ecs_cost_tag_active default false).
resource "aws_ce_cost_allocation_tag" "ecs_cluster_name" {
  count   = var.ecs_cost_tag_active ? 1 : 0
  tag_key = "aws:ecs:clusterName"
  status  = "Active"
}
