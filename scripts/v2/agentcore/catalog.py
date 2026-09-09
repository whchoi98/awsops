"""AWSops v2 P1f — AgentCore skeleton catalog (MID-minus).

GATEWAYS: 9 domain gateway short-keys. provision.py provisions each as
'awsops-v2-<key>-gateway' (v2-namespaced to avoid colliding with v1 'awsops-*' in a
shared account); the agent runtime receives the {key: url} map via GATEWAYS_JSON, so
these short keys (not the gateway names) are what payload.gateway selects. 'external-obs'
is the NEW §4 #7 split, left EMPTY in P1f (plugin datasource registry + OTLP + datasource-diag
re-home are P3).

TARGETS: the representative read-only slice proving every provisioner code path:
  - iam-mcp (14 tools, cross-account, largest schema) -> security gateway
  - flow-monitor (1 tool, single-tool, proves for_each>=2) -> network gateway
Schemas are copied verbatim from agent/lambda/create_targets.py. provision.py injects
target_account_id into every tool inputSchema (cross-account), exactly like v1.
"""

# short-key -> domain. provision.py builds the gateway name 'awsops-v2-<key>-gateway'.
GATEWAYS = [
    "network", "container", "data", "security", "cost",
    "monitoring", "iac", "ops", "external-obs",
]

GATEWAY_DESCRIPTIONS = {
    "network": "VPC, ENI, reachability, flow logs, TGW, VPN, firewall",
    "container": "EKS, ECS, Istio, Kubernetes",
    "data": "DynamoDB, RDS/Aurora, ElastiCache, MSK, OpenSearch",
    "security": "IAM, policy simulation, CIS/benchmark (P3)",
    "cost": "Cost Explorer, forecast, budgets, container cost",
    "monitoring": "CloudWatch, CloudTrail (AWS native only)",
    "iac": "CloudFormation, CDK, Terraform",
    "ops": "Steampipe SQL listing/status/docs/inventory",
    "external-obs": "External Observability & Integrations — routed (Prometheus + ClickHouse + Notion; Loki/Tempo/Mimir next)",
}


def _p(t, d=""):
    r = {"type": t}
    if d:
        r["description"] = d
    return r


# target_name -> {gateway, lambda_key (matches terraform output agentcore.lambda_arns), description, tools[]}
TARGETS = {
    "iam-mcp-target": {
        "gateway": "security",
        "lambda_key": "iam-mcp",
        "description": "IAM users, roles, groups, policies, simulation (14 tools)",
        "tools": [
            {"name": "list_users", "description": "List IAM users", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_user", "description": "User details", "inputSchema": {"type": "object", "properties": {"user_name": _p("string", "User")}, "required": ["user_name"]}},
            {"name": "list_roles", "description": "List roles", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_role_details", "description": "Role details", "inputSchema": {"type": "object", "properties": {"role_name": _p("string", "Role")}, "required": ["role_name"]}},
            {"name": "list_groups", "description": "List groups", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_group", "description": "Group details", "inputSchema": {"type": "object", "properties": {"group_name": _p("string", "Group")}, "required": ["group_name"]}},
            {"name": "list_policies", "description": "List policies", "inputSchema": {"type": "object", "properties": {"scope": _p("string", "Local/AWS/All")}}},
            {"name": "list_user_policies", "description": "User policies", "inputSchema": {"type": "object", "properties": {"user_name": _p("string", "User")}, "required": ["user_name"]}},
            {"name": "list_role_policies", "description": "Role policies", "inputSchema": {"type": "object", "properties": {"role_name": _p("string", "Role")}, "required": ["role_name"]}},
            {"name": "get_user_policy", "description": "User inline policy", "inputSchema": {"type": "object", "properties": {"user_name": _p("string", "User"), "policy_name": _p("string", "Policy")}, "required": ["user_name", "policy_name"]}},
            {"name": "get_role_policy", "description": "Role inline policy", "inputSchema": {"type": "object", "properties": {"role_name": _p("string", "Role"), "policy_name": _p("string", "Policy")}, "required": ["role_name", "policy_name"]}},
            {"name": "list_access_keys", "description": "Access keys", "inputSchema": {"type": "object", "properties": {"user_name": _p("string", "User")}, "required": ["user_name"]}},
            {"name": "simulate_principal_policy", "description": "Policy simulation", "inputSchema": {"type": "object", "properties": {"policy_source_arn": _p("string", "ARN"), "action_names": _p("string", "Actions")}, "required": ["policy_source_arn", "action_names"]}},
            {"name": "get_account_security_summary", "description": "Account security summary", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "flow-monitor-target": {
        "gateway": "network",
        "lambda_key": "flow-monitor",
        "description": "VPC Flow Log analyzer (1 tool)",
        "tools": [
            {"name": "query_flow_logs", "description": "Query flow logs", "inputSchema": {"type": "object", "properties": {"vpc_id": _p("string", "VPC ID")}, "required": ["vpc_id"]}},
        ],
    },
    # ===== Read-only MCP additions (2026-06-18): core-helpers (ops) + reachability-read (network) =====
    "core-helpers-target": {
        "gateway": "ops",
        "lambda_key": "core-helpers",
        "description": "Prompt understanding + AWS CLI suggestions — static, read-only (2 tools; no call_aws)",
        "tools": [
            {"name": "prompt_understanding", "description": "AWS solution-design guide (static)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "suggest_aws_commands", "description": "Suggest read-only AWS CLI commands for a query", "inputSchema": {"type": "object", "properties": {"query": _p("string", "Natural-language query")}, "required": ["query"]}},
        ],
    },
    # inventory_read: reconnects the synced Aurora topology/inventory (inventory_resources +
    # topology graph) to AgentCore via the RDS Data API — the v2 equivalent of v1's ops
    # run_steampipe_query. Read-only (SELECT only).
    "inventory-read-target": {
        "gateway": "ops",
        "lambda_key": "inventory-read",
        "description": "Aurora-backed topology & unused-resource reader (read-only): find_unused_resources, get_topology, query_inventory, inventory_summary",
        "tools": [
            {"name": "find_unused_resources", "description": "Find unused/orphaned resources from the synced inventory: orphan target groups (no LB / 0 healthy), empty CloudFront origins, dead/idle load balancers, unattached EBS volumes", "inputSchema": {"type": "object", "properties": {"category": _p("string", "Optional category filter, e.g. 'TargetGroup' or 'CloudFront'")}}},
            {"name": "get_topology", "description": "Return the materialized topology graph (nodes + edges) from Aurora topology_nodes/edges — matches the /api/graph contract. class='flow' (default) for traffic-path graph (CF→LB→TG→target); class='infra' for resource-relationship graph. Optionally scope to a node's 1-hop neighbourhood via resource_id.", "inputSchema": {"type": "object", "properties": {"resource_id": _p("string", "Optional node id (e.g. CloudFront id, ALB ARN) to scope to its 1-hop neighbourhood"), "class": _p("string", "Graph class: 'flow' (traffic path, default) or 'infra' (resource relationships)")}}},
            {"name": "query_inventory", "description": "List synced resources of one type (alb, nlb, target_group, cloudfront, ec2, ebs, security_group, route53, lambda, ecs_task, ecs_service, s3)", "inputSchema": {"type": "object", "properties": {"resource_type": _p("string", "Resource type to list"), "limit": _p("integer", "Max rows (default 200, cap 500)")}, "required": ["resource_type"]}},
            {"name": "inventory_summary", "description": "Per-type counts + last-sync freshness (inventory_sync_runs)", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "reachability-read-target": {
        "gateway": "network",
        "lambda_key": "reachability-read",
        "description": "Computed ENI<->EC2 connectivity, describe-only — static SG/NACL/route (1 tool)",
        "tools": [
            {"name": "check_reachability", "description": "Static SG/NACL/route reachability from a source to a destination (describe-only; not AWS Reachability Analyzer)", "inputSchema": {"type": "object", "properties": {"source": _p("string", "instance-id / eni-id / private-ip"), "destination": _p("string", "instance-id / eni-id / private-ip"), "port": _p("integer", "Destination port"), "protocol": _p("string", "tcp/udp (default tcp)")}, "required": ["source", "destination", "port"]}},
        ],
    },
    "istio-read-target": {
        "gateway": "container",
        "lambda_key": "istio-read",
        "description": "Read-only Istio service-mesh CRDs via the EKS k8s API — no Steampipe (7 tools)",
        "tools": [
            {"name": "mesh_overview", "description": "Istio CRD counts + istio-injected namespaces", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name")}, "required": ["cluster_name"]}},
            {"name": "list_virtual_services", "description": "List Istio VirtualServices", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name"), "namespace": _p("string", "Namespace (optional)")}, "required": ["cluster_name"]}},
            {"name": "list_destination_rules", "description": "List Istio DestinationRules", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name"), "namespace": _p("string", "Namespace (optional)")}, "required": ["cluster_name"]}},
            {"name": "list_istio_gateways", "description": "List Istio Gateways", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name"), "namespace": _p("string", "Namespace (optional)")}, "required": ["cluster_name"]}},
            {"name": "list_service_entries", "description": "List Istio ServiceEntries", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name"), "namespace": _p("string", "Namespace (optional)")}, "required": ["cluster_name"]}},
            {"name": "list_authorization_policies", "description": "List Istio AuthorizationPolicies", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name"), "namespace": _p("string", "Namespace (optional)")}, "required": ["cluster_name"]}},
            {"name": "list_peer_authentications", "description": "List Istio PeerAuthentications", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "EKS cluster name"), "namespace": _p("string", "Namespace (optional)")}, "required": ["cluster_name"]}},
        ],
    },
    # ===== AF1: +14 read-only targets, tool schemas verbatim from agent/lambda/create_targets.py =====
    "network-mcp-target": {
        "gateway": "network",
        "lambda_key": "network-mcp",
        "description": "AWS Network MCP - VPC, TGW, VPN, ENI, Firewall, Flow Logs (15 tools)",
        "tools": [
            {"name": "get_path_trace_methodology", "description": "Network troubleshooting methodology", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "find_ip_address", "description": "Locate ENIs by IP", "inputSchema": {"type": "object", "properties": {"ip_address": _p("string", "IP")}, "required": ["ip_address"]}},
            {"name": "get_eni_details", "description": "ENI details with SG, NACL, routes", "inputSchema": {"type": "object", "properties": {"eni_id": _p("string", "ENI ID")}, "required": ["eni_id"]}},
            {"name": "list_vpcs", "description": "List VPCs", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_vpc_network_details", "description": "Full VPC config", "inputSchema": {"type": "object", "properties": {"vpc_id": _p("string", "VPC ID")}, "required": ["vpc_id"]}},
            {"name": "get_vpc_flow_logs", "description": "VPC flow logs", "inputSchema": {"type": "object", "properties": {"vpc_id": _p("string", "VPC ID")}, "required": ["vpc_id"]}},
            {"name": "describe_network", "description": "Describe SG/NACL/RT/Subnet/VPC", "inputSchema": {"type": "object", "properties": {"resource_type": _p("string", "Type")}, "required": ["resource_type"]}},
            {"name": "list_transit_gateways", "description": "List TGWs", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_tgw_details", "description": "TGW details", "inputSchema": {"type": "object", "properties": {"tgw_id": _p("string", "TGW ID")}, "required": ["tgw_id"]}},
            {"name": "get_tgw_routes", "description": "TGW routes", "inputSchema": {"type": "object", "properties": {"route_table_id": _p("string", "RT ID")}, "required": ["route_table_id"]}},
            {"name": "get_all_tgw_routes", "description": "All TGW routes", "inputSchema": {"type": "object", "properties": {"tgw_id": _p("string", "TGW ID")}, "required": ["tgw_id"]}},
            {"name": "list_tgw_peerings", "description": "TGW peerings", "inputSchema": {"type": "object", "properties": {"tgw_id": _p("string", "TGW ID")}, "required": ["tgw_id"]}},
            {"name": "list_vpn_connections", "description": "VPN connections", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "list_network_firewalls", "description": "Network Firewalls", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_firewall_rules", "description": "Firewall rules", "inputSchema": {"type": "object", "properties": {"firewall_name": _p("string", "Name")}, "required": ["firewall_name"]}},
        ],
    },
    "eks-mcp-target": {
        "gateway": "container",
        "lambda_key": "eks-mcp",
        "description": "EKS cluster management, K8s resources, CloudWatch",
        "tools": [
            {"name": "list_eks_clusters", "description": "List EKS clusters", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_eks_vpc_config", "description": "EKS VPC config", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "Cluster")}, "required": ["cluster_name"]}},
            {"name": "get_eks_insights", "description": "EKS insights", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "Cluster")}, "required": ["cluster_name"]}},
            {"name": "get_cloudwatch_logs", "description": "EKS CloudWatch logs", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "Cluster")}, "required": ["cluster_name"]}},
            {"name": "get_cloudwatch_metrics", "description": "EKS metrics", "inputSchema": {"type": "object", "properties": {"cluster_name": _p("string", "Cluster"), "metric_name": _p("string", "Metric")}, "required": ["cluster_name", "metric_name"]}},
            {"name": "get_eks_metrics_guidance", "description": "Container Insights guidance", "inputSchema": {"type": "object", "properties": {"resource_type": _p("string", "cluster/node/pod")}, "required": ["resource_type"]}},
            {"name": "get_policies_for_role", "description": "IAM role policies", "inputSchema": {"type": "object", "properties": {"role_name": _p("string", "Role")}, "required": ["role_name"]}},
            {"name": "search_eks_troubleshoot_guide", "description": "EKS troubleshooting", "inputSchema": {"type": "object", "properties": {"query": _p("string", "Query")}, "required": ["query"]}},
            {"name": "generate_app_manifest", "description": "Generate K8s YAML", "inputSchema": {"type": "object", "properties": {"app_name": _p("string", "App"), "image_uri": _p("string", "Image")}, "required": ["app_name", "image_uri"]}},
        ],
    },
    "ecs-mcp-target": {
        "gateway": "container",
        "lambda_key": "ecs-mcp",
        "description": "ECS cluster/service/task management, troubleshooting",
        "tools": [
            {"name": "ecs_resource_management", "description": "ECS resources (7 operations)", "inputSchema": {"type": "object", "properties": {"operation": _p("string", "list_clusters/list_services/list_tasks/describe_service/list_task_definitions/describe_task_definition/list_ecr_repositories")}, "required": ["operation"]}},
            {"name": "ecs_troubleshooting_tool", "description": "ECS troubleshooting (6 actions)", "inputSchema": {"type": "object", "properties": {"action": _p("string", "Action"), "cluster": _p("string", "Cluster"), "service": _p("string", "Service")}, "required": ["action"]}},
            {"name": "wait_for_service_ready", "description": "Check service readiness", "inputSchema": {"type": "object", "properties": {"cluster": _p("string", "Cluster"), "service_name": _p("string", "Service")}, "required": ["cluster", "service_name"]}},
        ],
    },
    "rds-mcp-target": {
        "gateway": "data",
        "lambda_key": "rds-mcp",
        "description": "RDS MySQL/PostgreSQL instances, clusters, SQL via Data API (6 tools)",
        "tools": [
            {"name": "list_db_instances", "description": "List RDS instances", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "list_db_clusters", "description": "List Aurora clusters", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "describe_db_instance", "description": "Describe instance", "inputSchema": {"type": "object", "properties": {"db_instance_identifier": _p("string", "ID")}, "required": ["db_instance_identifier"]}},
            {"name": "describe_db_cluster", "description": "Describe cluster", "inputSchema": {"type": "object", "properties": {"db_cluster_identifier": _p("string", "ID")}, "required": ["db_cluster_identifier"]}},
            {"name": "execute_sql", "description": "SQL via Data API (SELECT only; the host's own foundation Aurora PostgreSQL cluster only — MySQL/MariaDB and cross-account unsupported)", "inputSchema": {"type": "object", "properties": {"sql": _p("string", "SQL"), "resource_arn": _p("string", "Foundation Aurora cluster ARN or bare identifier (the discovery tools return identifiers)")}, "required": ["sql", "resource_arn"]}},
            {"name": "list_snapshots", "description": "List snapshots", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "dynamodb-mcp-target": {
        "gateway": "data",
        "lambda_key": "dynamodb-mcp",
        "description": "DynamoDB tables, queries, data modeling, costs (6 tools)",
        "tools": [
            {"name": "list_tables", "description": "List tables", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "describe_table", "description": "Describe table", "inputSchema": {"type": "object", "properties": {"table_name": _p("string", "Table")}, "required": ["table_name"]}},
            {"name": "query_table", "description": "Query/scan table", "inputSchema": {"type": "object", "properties": {"table_name": _p("string", "Table")}, "required": ["table_name"]}},
            {"name": "get_item", "description": "Get item by key", "inputSchema": {"type": "object", "properties": {"table_name": _p("string", "Table"), "key": _p("string", "Key JSON")}, "required": ["table_name", "key"]}},
            {"name": "dynamodb_data_modeling", "description": "Data modeling guide", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "compute_performances_and_costs", "description": "Cost estimation", "inputSchema": {"type": "object", "properties": {"reads_per_sec": _p("integer", "Reads/s"), "writes_per_sec": _p("integer", "Writes/s")}}},
        ],
    },
    "msk-mcp-target": {
        "gateway": "data",
        "lambda_key": "msk-mcp",
        "description": "MSK Kafka clusters, brokers, configurations (6 tools)",
        "tools": [
            {"name": "list_clusters", "description": "List Kafka clusters", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_cluster_info", "description": "Cluster details", "inputSchema": {"type": "object", "properties": {"cluster_arn": _p("string", "ARN")}, "required": ["cluster_arn"]}},
            {"name": "get_configuration_info", "description": "MSK configurations", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_bootstrap_brokers", "description": "Bootstrap brokers", "inputSchema": {"type": "object", "properties": {"cluster_arn": _p("string", "ARN")}, "required": ["cluster_arn"]}},
            {"name": "list_nodes", "description": "Broker nodes", "inputSchema": {"type": "object", "properties": {"cluster_arn": _p("string", "ARN")}, "required": ["cluster_arn"]}},
            {"name": "msk_best_practices", "description": "Best practices", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "valkey-mcp-target": {
        "gateway": "data",
        "lambda_key": "valkey-mcp",
        "description": "ElastiCache/Valkey clusters, replication groups (6 tools)",
        "tools": [
            {"name": "list_cache_clusters", "description": "List clusters", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "describe_cache_cluster", "description": "Describe cluster", "inputSchema": {"type": "object", "properties": {"cluster_id": _p("string", "ID")}, "required": ["cluster_id"]}},
            {"name": "list_replication_groups", "description": "List replication groups", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "describe_replication_group", "description": "Describe group", "inputSchema": {"type": "object", "properties": {"replication_group_id": _p("string", "ID")}, "required": ["replication_group_id"]}},
            {"name": "list_serverless_caches", "description": "Serverless caches", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "elasticache_best_practices", "description": "Best practices", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "cost-mcp-target": {
        "gateway": "cost",
        "lambda_key": "cost-mcp",
        "description": "Cost Explorer, Pricing, Budgets (9 tools)",
        "tools": [
            {"name": "get_today_date", "description": "Current date", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_cost_and_usage", "description": "Cost and usage", "inputSchema": {"type": "object", "properties": {"start_date": _p("string", "Start"), "granularity": _p("string", "DAILY/MONTHLY")}}},
            {"name": "get_cost_and_usage_comparisons", "description": "Compare months", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_cost_comparison_drivers", "description": "Cost drivers", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_cost_forecast", "description": "Cost forecast", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_dimension_values", "description": "Dimension values", "inputSchema": {"type": "object", "properties": {"dimension": _p("string", "Dimension")}, "required": ["dimension"]}},
            {"name": "get_tag_values", "description": "Tag values", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_pricing", "description": "Service pricing", "inputSchema": {"type": "object", "properties": {"service_code": _p("string", "Service")}, "required": ["service_code"]}},
            {"name": "list_budgets", "description": "List budgets", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "finops-mcp-target": {
        "gateway": "cost",
        "lambda_key": "finops-mcp",
        "description": "FinOps Optimization - Compute Optimizer, RI/SP Recommendations, Cost Optimization Hub, Trusted Advisor (5 tools)",
        "tools": [
            {"name": "get_rightsizing_recommendations", "description": "EC2/RDS/ECS/Lambda rightsizing recommendations from Compute Optimizer",
             "inputSchema": {"type": "object", "properties": {"resource_type": _p("string", "all, ec2, rds, ecs, or lambda")}}},
            {"name": "get_savings_plans_recommendations", "description": "Savings Plans purchase recommendations from Cost Explorer",
             "inputSchema": {"type": "object", "properties": {
                 "savings_plan_type": _p("string", "COMPUTE_SP or EC2_INSTANCE_SP"),
                 "term": _p("string", "ONE_YEAR or THREE_YEARS"),
                 "payment_option": _p("string", "NO_UPFRONT, PARTIAL_UPFRONT, or ALL_UPFRONT"),
             }}},
            {"name": "get_reserved_instance_recommendations", "description": "Reserved Instance purchase recommendations from Cost Explorer",
             "inputSchema": {"type": "object", "properties": {
                 "service": _p("string", "e.g. Amazon Elastic Compute Cloud - Compute, Amazon RDS, Amazon ElastiCache"),
                 "term": _p("string", "ONE_YEAR or THREE_YEARS"),
                 "payment_option": _p("string", "NO_UPFRONT, PARTIAL_UPFRONT, or ALL_UPFRONT"),
             }}},
            {"name": "get_cost_optimization_hub_recommendations", "description": "Unified optimization recommendations across all AWS services from Cost Optimization Hub",
             "inputSchema": {"type": "object", "properties": {
                 "action_type": _p("string", "Rightsize, Stop, Upgrade, PurchaseSavingsPlans, PurchaseReservedInstances, MigrateToGraviton"),
                 "resource_type": _p("string", "Ec2Instance, RdsDbInstance, LambdaFunction, EcsService, ElastiCacheReservedInstances"),
                 "max_results": _p("string", "Max results (default 50, max 100)"),
             }}},
            {"name": "get_trusted_advisor_cost_checks", "description": "Cost optimization checks from AWS Trusted Advisor",
             "inputSchema": {"type": "object", "properties": {
                 "category": _p("string", "cost_optimizing (default), security, fault_tolerance, performance"),
             }}},
        ],
    },
    "cloudwatch-mcp-target": {
        "gateway": "monitoring",
        "lambda_key": "cloudwatch-mcp",
        "description": "CloudWatch metrics, alarms, logs, Log Insights (11 tools)",
        "tools": [
            {"name": "get_metric_data", "description": "Get metric data", "inputSchema": {"type": "object", "properties": {"namespace": _p("string", "Namespace"), "metric_name": _p("string", "Metric")}, "required": ["namespace", "metric_name"]}},
            {"name": "get_metric_metadata", "description": "Metric metadata", "inputSchema": {"type": "object", "properties": {"namespace": _p("string", "Namespace")}, "required": ["namespace"]}},
            {"name": "analyze_metric", "description": "Analyze trend", "inputSchema": {"type": "object", "properties": {"namespace": _p("string", "Namespace"), "metric_name": _p("string", "Metric")}, "required": ["namespace", "metric_name"]}},
            {"name": "get_recommended_metric_alarms", "description": "Alarm recommendations", "inputSchema": {"type": "object", "properties": {"metric_name": _p("string", "Metric")}, "required": ["metric_name"]}},
            {"name": "get_active_alarms", "description": "Active alarms", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_alarm_history", "description": "Alarm history", "inputSchema": {"type": "object", "properties": {"alarm_name": _p("string", "Alarm")}, "required": ["alarm_name"]}},
            {"name": "describe_log_groups", "description": "Log groups", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "analyze_log_group", "description": "Search logs", "inputSchema": {"type": "object", "properties": {"log_group": _p("string", "Group")}, "required": ["log_group"]}},
            {"name": "execute_log_insights_query", "description": "Log Insights query", "inputSchema": {"type": "object", "properties": {"log_group": _p("string", "Group"), "query": _p("string", "Query")}, "required": ["log_group", "query"]}},
            {"name": "get_logs_insight_query_results", "description": "Query results", "inputSchema": {"type": "object", "properties": {"query_id": _p("string", "ID")}, "required": ["query_id"]}},
            {"name": "cancel_logs_insight_query", "description": "Cancel query", "inputSchema": {"type": "object", "properties": {"query_id": _p("string", "ID")}, "required": ["query_id"]}},
        ],
    },
    "cloudtrail-mcp-target": {
        "gateway": "monitoring",
        "lambda_key": "cloudtrail-mcp",
        "description": "CloudTrail events, Lake analytics (5 tools)",
        "tools": [
            {"name": "lookup_events", "description": "Look up events", "inputSchema": {"type": "object", "properties": {"username": _p("string", "User"), "event_name": _p("string", "Event"), "minutes": _p("integer", "Minutes")}}},
            {"name": "list_event_data_stores", "description": "Lake data stores", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "lake_query", "description": "Lake SQL query", "inputSchema": {"type": "object", "properties": {"event_data_store": _p("string", "Store ID"), "query": _p("string", "SQL")}, "required": ["event_data_store", "query"]}},
            {"name": "get_query_status", "description": "Query status", "inputSchema": {"type": "object", "properties": {"query_id": _p("string", "ID")}, "required": ["query_id"]}},
            {"name": "get_query_results", "description": "Query results", "inputSchema": {"type": "object", "properties": {"query_id": _p("string", "ID")}, "required": ["query_id"]}},
        ],
    },
    "iac-mcp-target": {
        "gateway": "iac",
        "lambda_key": "iac-mcp",
        "description": "CloudFormation/CDK validation, troubleshooting, docs (7 tools)",
        "tools": [
            {"name": "validate_cloudformation_template", "description": "Validate CFn template", "inputSchema": {"type": "object", "properties": {"template_content": _p("string", "Template")}, "required": ["template_content"]}},
            {"name": "check_cloudformation_template_compliance", "description": "Check compliance", "inputSchema": {"type": "object", "properties": {"template_content": _p("string", "Template")}, "required": ["template_content"]}},
            {"name": "troubleshoot_cloudformation_deployment", "description": "Troubleshoot failures", "inputSchema": {"type": "object", "properties": {"stack_name": _p("string", "Stack")}, "required": ["stack_name"]}},
            {"name": "search_cdk_documentation", "description": "Search CDK docs", "inputSchema": {"type": "object", "properties": {"query": _p("string", "Query")}, "required": ["query"]}},
            {"name": "search_cloudformation_documentation", "description": "Search CFn docs", "inputSchema": {"type": "object", "properties": {"query": _p("string", "Query")}, "required": ["query"]}},
            {"name": "cdk_best_practices", "description": "CDK best practices", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "read_iac_documentation_page", "description": "Fetch doc page", "inputSchema": {"type": "object", "properties": {"url": _p("string", "URL")}, "required": ["url"]}},
        ],
    },
    "terraform-mcp-target": {
        "gateway": "iac",
        "lambda_key": "terraform-mcp",
        "description": "Terraform provider docs, module search (5 tools)",
        "tools": [
            {"name": "SearchAwsProviderDocs", "description": "AWS provider docs", "inputSchema": {"type": "object", "properties": {"asset_name": _p("string", "Resource")}, "required": ["asset_name"]}},
            {"name": "SearchAwsccProviderDocs", "description": "AWSCC provider docs", "inputSchema": {"type": "object", "properties": {"asset_name": _p("string", "Resource")}, "required": ["asset_name"]}},
            {"name": "SearchSpecificAwsIaModules", "description": "AWS-IA modules", "inputSchema": {"type": "object", "properties": {"query": _p("string", "Search")}}},
            {"name": "SearchUserProvidedModule", "description": "Registry module", "inputSchema": {"type": "object", "properties": {"module_url": _p("string", "Module")}, "required": ["module_url"]}},
            {"name": "terraform_best_practices", "description": "Terraform best practices", "inputSchema": {"type": "object", "properties": {}}},
        ],
    },
    "aws-knowledge-target": {
        "gateway": "ops",
        "lambda_key": "aws-knowledge",
        "description": "AWS Knowledge MCP - docs, regions, availability (5 tools)",
        "tools": [
            {"name": "search_documentation", "description": "Search AWS docs", "inputSchema": {"type": "object", "properties": {"search_phrase": _p("string", "Query")}, "required": ["search_phrase"]}},
            {"name": "read_documentation", "description": "Read doc page", "inputSchema": {"type": "object", "properties": {"url": _p("string", "URL")}, "required": ["url"]}},
            {"name": "recommend", "description": "Doc recommendations", "inputSchema": {"type": "object", "properties": {"url": _p("string", "URL")}, "required": ["url"]}},
            {"name": "list_regions", "description": "List regions", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "get_regional_availability", "description": "Regional availability", "inputSchema": {"type": "object", "properties": {"resource_type": _p("string", "product/api/cfn")}, "required": ["resource_type"]}},
        ],
    },
    # First concrete external integration (read-only knowledge) on the M1 gateway-target
    # pattern. Lambda gated on integrations_enabled in ai.tf; provision SKIPs when absent.
    "notion-mcp-target": {
        "gateway": "external-obs",
        "lambda_key": "notion-mcp",
        "description": "Notion read-only — search, fetch page, query database (3 tools)",
        "tools": [
            {"name": "notion_search", "description": "Search Notion pages and databases by text", "inputSchema": {"type": "object", "properties": {"query": _p("string", "Search text"), "page_size": _p("string", "Max results (<=25)")}, "required": ["query"]}},
            {"name": "notion_fetch_page", "description": "Fetch a Notion page's metadata and (bounded) block content", "inputSchema": {"type": "object", "properties": {"page_id": _p("string", "Page ID"), "page_size": _p("string", "Max blocks (<=25)")}, "required": ["page_id"]}},
            {"name": "notion_query_database", "description": "Query rows of a Notion database", "inputSchema": {"type": "object", "properties": {"database_id": _p("string", "Database ID"), "page_size": _p("string", "Max rows (<=25)")}, "required": ["database_id"]}},
        ],
    },
    # AWS-native OpenSearch log query (sigv4 es) — first log source for incident triage. monitoring
    # gateway, co-located with the CloudWatch log tools so one agent can correlate both.
    "opensearch-mcp-target": {
        "gateway": "monitoring",
        "lambda_key": "opensearch-mcp",
        "description": "OpenSearch read-only — list domains, time-bounded log search, cat indices (3 tools)",
        "tools": [
            {"name": "opensearch_schema", "description": "Introspect domains + indices (cached)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "list_opensearch_domains", "description": "List OpenSearch domains and their endpoints", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "search_opensearch_logs", "description": "Search a domain's logs by time range and query string", "inputSchema": {"type": "object", "properties": {"domain": _p("string", "Domain name"), "query": _p("string", "query_string (e.g. ERROR)"), "start": _p("string", "Window start: 1h/30m/2d or ISO (default now-1h)"), "end": _p("string", "Window end (ISO, optional)"), "index": _p("string", "Index or _all"), "size": _p("string", "Max hits (<=50)"), "time_field": _p("string", "Time field (default @timestamp)")}, "required": ["domain"]}},
            {"name": "opensearch_indices", "description": "List indices (_cat/indices) of a domain", "inputSchema": {"type": "object", "properties": {"domain": _p("string", "Domain name")}, "required": ["domain"]}},
        ],
    },
    # First of the v1 datasource family (user-endpoint + SQL). data gateway. Read-only SQL guard +
    # table-function SSRF block in the Lambda; credential (endpoint+user/pass) via the Connectors UI.
    "clickhouse-mcp-target": {
        "gateway": "external-obs",
        "lambda_key": "clickhouse-mcp",
        "description": "ClickHouse read-only — SQL query, list tables, describe (3 tools)",
        "tools": [
            {"name": "clickhouse_schema", "description": "Introspect tables + columns (cached for query generation)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "clickhouse_query", "description": "Run a read-only SQL query (SELECT/SHOW/DESCRIBE) against the connected ClickHouse", "inputSchema": {"type": "object", "properties": {"sql": _p("string", "Read-only SQL"), "max_rows": _p("string", "Max rows (<=1000)")}, "required": ["sql"]}},
            {"name": "clickhouse_tables", "description": "List tables (SHOW TABLES)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "clickhouse_describe", "description": "Describe a table's columns", "inputSchema": {"type": "object", "properties": {"table": _p("string", "Table name")}, "required": ["table"]}},
        ],
    },
    # Prometheus datasource (v1 family #2) — read-only PromQL. monitoring gateway (with CloudWatch +
    # OpenSearch). User-supplied endpoint via the Connectors UI; SSRF-guarded; read-only by construction.
    "prometheus-mcp-target": {
        "gateway": "external-obs",
        "lambda_key": "prometheus-mcp",
        "description": "Prometheus read-only — PromQL instant/range query, labels, series, metric metadata (6 tools)",
        "tools": [
            {"name": "prometheus_schema", "description": "Introspect metric + label names (cached)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "prometheus_query", "description": "Instant PromQL query at a single time", "inputSchema": {"type": "object", "properties": {"query": _p("string", "PromQL"), "time": _p("string", "Eval time: unix/ISO (default now)")}, "required": ["query"]}},
            {"name": "prometheus_query_range", "description": "Range PromQL query over a time window", "inputSchema": {"type": "object", "properties": {"query": _p("string", "PromQL"), "start": _p("string", "1h/30m or unix/ISO (default now-1h)"), "end": _p("string", "unix/ISO (default now)"), "step": _p("string", "Step seconds (default 60)")}, "required": ["query"]}},
            {"name": "prometheus_labels", "description": "List label names", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "prometheus_series", "description": "Find series matching a selector", "inputSchema": {"type": "object", "properties": {"match": _p("string", "Series selector e.g. up{job=\"x\"}")}, "required": ["match"]}},
            {"name": "prometheus_metric_meta", "description": "Per-metric type (metadata) + label names for the given metrics (read-only)", "inputSchema": {"type": "object", "properties": {"metrics": {"type": "array", "items": {"type": "string"}, "description": "Metric names (max 12)"}}, "required": ["metrics"]}},
        ],
    },
    # Loki datasource (v1 family #3) — read-only LogQL. monitoring gateway. User-supplied endpoint via
    # Connectors UI; SSRF-guarded; ns timestamps + optional X-Scope-OrgID multi-tenant.
    "loki-mcp-target": {
        "gateway": "monitoring",
        "lambda_key": "loki-mcp",
        "description": "Loki read-only — LogQL range/instant query, labels, label values (4 tools)",
        "tools": [
            {"name": "loki_schema", "description": "Introspect label names (cached)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "loki_query_range", "description": "Range LogQL query over a time window (logs/metrics)", "inputSchema": {"type": "object", "properties": {"query": _p("string", "LogQL"), "start": _p("string", "1h/30m or unix/ISO (default now-1h)"), "end": _p("string", "unix/ISO (default now)"), "limit": _p("string", "Max entries (default 100)"), "direction": _p("string", "forward|backward (default backward)")}, "required": ["query"]}},
            {"name": "loki_query", "description": "Instant LogQL query", "inputSchema": {"type": "object", "properties": {"query": _p("string", "LogQL"), "time": _p("string", "Eval time unix/ISO (default now)"), "limit": _p("string", "Max entries (default 100)")}, "required": ["query"]}},
            {"name": "loki_labels", "description": "List label names", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "loki_label_values", "description": "List values of a label", "inputSchema": {"type": "object", "properties": {"label": _p("string", "Label name")}, "required": ["label"]}},
        ],
    },
    # Tempo datasource (v1 family #4) — read-only TraceQL. monitoring gateway.
    "tempo-mcp-target": {
        "gateway": "monitoring",
        "lambda_key": "tempo-mcp",
        "description": "Tempo read-only — TraceQL search, get trace, tags, tag values (4 tools)",
        "tools": [
            {"name": "tempo_schema", "description": "Introspect tag names (cached)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "tempo_search", "description": "Search traces by TraceQL over a time window", "inputSchema": {"type": "object", "properties": {"query": _p("string", "TraceQL"), "start": _p("string", "1h/30m or unix sec (default now-1h)"), "end": _p("string", "unix sec (default now)"), "limit": _p("string", "Max traces")}, "required": ["query"]}},
            {"name": "tempo_get_trace", "description": "Fetch a full trace by hex trace ID", "inputSchema": {"type": "object", "properties": {"trace_id": _p("string", "Hex trace ID")}, "required": ["trace_id"]}},
            {"name": "tempo_search_tags", "description": "List searchable tag names", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "tempo_tag_values", "description": "List values of a tag", "inputSchema": {"type": "object", "properties": {"tag": _p("string", "Tag name")}, "required": ["tag"]}},
        ],
    },
    # Mimir datasource (v1 family #5 final) — read-only PromQL (Prometheus-compatible, multi-tenant). monitoring.
    "mimir-mcp-target": {
        "gateway": "monitoring",
        "lambda_key": "mimir-mcp",
        "description": "Mimir read-only — PromQL instant/range, labels, series, metric metadata (6 tools)",
        "tools": [
            {"name": "mimir_schema", "description": "Introspect metric + label names (cached)", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "mimir_query", "description": "Instant PromQL query", "inputSchema": {"type": "object", "properties": {"query": _p("string", "PromQL"), "time": _p("string", "Eval time unix/ISO (default now)")}, "required": ["query"]}},
            {"name": "mimir_query_range", "description": "Range PromQL query", "inputSchema": {"type": "object", "properties": {"query": _p("string", "PromQL"), "start": _p("string", "1h/30m or unix (default now-1h)"), "end": _p("string", "unix (default now)"), "step": _p("string", "Step seconds (default 60)")}, "required": ["query"]}},
            {"name": "mimir_labels", "description": "List label names", "inputSchema": {"type": "object", "properties": {}}},
            {"name": "mimir_series", "description": "Find series matching a selector", "inputSchema": {"type": "object", "properties": {"match": _p("string", "Series selector")}, "required": ["match"]}},
            {"name": "mimir_metric_meta", "description": "Per-metric type (metadata) + label names for the given metrics (read-only)", "inputSchema": {"type": "object", "properties": {"metrics": {"type": "array", "items": {"type": "string"}, "description": "Metric names (max 12)"}}, "required": ["metrics"]}},
        ],
    },
}
