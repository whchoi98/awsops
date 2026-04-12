---
sidebar_position: 3
title: AgentCore
description: Amazon Bedrock AgentCore architecture and MCP tool details
---

import Screenshot from '@site/src/components/Screenshot';
import AgentCoreFlow from '@site/src/components/diagrams/AgentCoreFlow';

# AgentCore

AgentCore handles tool execution for the AI Assistant, powered by Amazon Bedrock AgentCore Runtime and Gateway.

<Screenshot src="/screenshots/overview/agentcore.png" alt="AgentCore" />

## Architecture

![AgentCore Architecture](/diagrams/agentcore-architecture.png)

### AI Routing Flow

<AgentCoreFlow />

### Deployment Requirements

| Item | Requirement |
|------|-------------|
| **Docker** | arm64 required (`docker buildx --platform linux/arm64 --load`) |
| **agent.py** | Update per-account Gateway URLs then rebuild Docker |
| **Code Interpreter** | No hyphens in name, underscores only |
| **Memory Store** | No hyphens in name (`awsops_memory`), max 365-day retention |
| **Runtime Update** | `--role-arn` + `--network-configuration` required |

## AgentCore Runtime

### Configuration

| Item | Description |
|------|-------------|
| **Engine** | Strands Agent Framework |
| **Container** | Docker arm64 (stored in ECR) |
| **Execution Environment** | AgentCore managed service |
| **Model** | Claude Sonnet/Opus 4.6 |

### Status

- **READY**: Operating normally
- **CREATING**: Being created
- **UPDATING**: Being updated
- **FAILED**: Error state

## Gateway Details

### Network Gateway (17 tools)

Provides tools for VPC, Transit Gateway, VPN, and network analysis.

| Tool | Description |
|------|-------------|
| `list_vpcs` | List VPCs |
| `get_vpc_network_details` | VPC network details |
| `describe_network` | Describe network configuration |
| `find_ip_address` | Search IP address |
| `get_eni_details` | ENI details |
| `get_vpc_flow_logs` | Get VPC Flow Logs |
| `list_transit_gateways` | List TGWs |
| `get_tgw_details` | TGW details |
| `get_tgw_routes` | TGW route table |
| `get_all_tgw_routes` | All TGW routes |
| `list_tgw_peerings` | List TGW peerings |
| `list_vpn_connections` | List VPN connections |
| `list_network_firewalls` | List Network Firewalls |
| `get_firewall_rules` | Get firewall rules |
| `analyze_reachability` | Reachability Analyzer |
| `query_flow_logs` | Query Flow Logs |
| `get_path_trace_methodology` | Path trace methodology |

### Container Gateway (24 tools)

Provides tools for EKS, ECS, and Istio service mesh.

| Category | Tools |
|----------|-------|
| **EKS** | `list_eks_clusters`, `get_eks_vpc_config`, `get_eks_insights`, `get_cloudwatch_logs`, `get_cloudwatch_metrics`, `get_eks_metrics_guidance`, `get_policies_for_role`, `search_eks_troubleshoot_guide`, `generate_app_manifest` |
| **ECS** | `ecs_resource_management`, `ecs_troubleshooting_tool`, `wait_for_service_ready` |
| **Istio** | `istio_overview`, `list_virtual_services`, `list_destination_rules`, `list_istio_gateways`, `list_service_entries`, `list_authorization_policies`, `list_peer_authentications`, `check_sidecar_injection`, `list_envoy_filters`, `list_istio_crds`, `istio_troubleshooting`, `query_istio_resource` |

### IaC Gateway (12 tools)

Provides tools for Infrastructure as Code.

| Tool | Description |
|------|-------------|
| `validate_cloudformation_template` | Validate CFn template |
| `check_cloudformation_template_compliance` | CFn compliance check |
| `troubleshoot_cloudformation_deployment` | CFn deployment troubleshooting |
| `search_cdk_documentation` | Search CDK documentation |
| `search_cloudformation_documentation` | Search CFn documentation |
| `cdk_best_practices` | CDK best practices |
| `read_iac_documentation_page` | Read IaC documentation page |
| `SearchAwsProviderDocs` | Terraform AWS Provider docs |
| `SearchAwsccProviderDocs` | Terraform AWSCC Provider docs |
| `SearchSpecificAwsIaModules` | Search AWS IA modules |
| `SearchUserProvidedModule` | Search user modules |
| `terraform_best_practices` | Terraform best practices |

### Data Gateway (24 tools)

Provides tools for AWS database and streaming services.

| Category | Tools |
|----------|-------|
| **DynamoDB** | `list_tables`, `describe_table`, `query_table`, `get_item`, `dynamodb_data_modeling`, `compute_performances_and_costs` |
| **RDS/Aurora** | `list_db_instances`, `list_db_clusters`, `describe_db_instance`, `describe_db_cluster`, `execute_sql`, `list_snapshots` |
| **ElastiCache** | `list_cache_clusters`, `describe_cache_cluster`, `list_replication_groups`, `describe_replication_group`, `list_serverless_caches`, `elasticache_best_practices` |
| **MSK** | `list_clusters`, `get_cluster_info`, `get_configuration_info`, `get_bootstrap_brokers`, `list_nodes`, `msk_best_practices` |

### Security Gateway (14 tools)

Provides tools for IAM and security analysis.

| Tool | Description |
|------|-------------|
| `list_users` | List IAM users |
| `get_user` | User details |
| `list_roles` | List IAM roles |
| `get_role_details` | Role details |
| `list_groups` | List IAM groups |
| `get_group` | Group details |
| `list_policies` | List policies |
| `list_user_policies` | List user policies |
| `list_role_policies` | List role policies |
| `get_user_policy` | User inline policy |
| `get_role_policy` | Role inline policy |
| `list_access_keys` | List Access Keys |
| `simulate_principal_policy` | Policy simulation |
| `get_account_security_summary` | Account security summary |

### Monitoring Gateway (16 tools)

Provides tools for CloudWatch and CloudTrail.

| Category | Tools |
|----------|-------|
| **CloudWatch Metrics** | `get_metric_data`, `get_metric_metadata`, `analyze_metric`, `get_recommended_metric_alarms`, `get_active_alarms`, `get_alarm_history` |
| **CloudWatch Logs** | `describe_log_groups`, `analyze_log_group`, `execute_log_insights_query`, `get_logs_insight_query_results`, `cancel_logs_insight_query` |
| **CloudTrail** | `lookup_events`, `list_event_data_stores`, `lake_query`, `get_query_status`, `get_query_results` |

### Cost Gateway (9 tools)

Provides tools for cost analysis and forecasting.

| Tool | Description |
|------|-------------|
| `get_today_date` | Get today's date |
| `get_cost_and_usage` | Get cost and usage |
| `get_cost_and_usage_comparisons` | Cost comparisons |
| `get_cost_comparison_drivers` | Cost change drivers |
| `get_cost_forecast` | Cost forecast |
| `get_dimension_values` | Get dimension values |
| `get_tag_values` | Get tag values |
| `get_pricing` | AWS service pricing |
| `list_budgets` | List budgets |

### Ops Gateway (9 tools)

Provides tools for general AWS operations and documentation.

| Tool | Description |
|------|-------------|
| `search_documentation` | Search AWS documentation |
| `read_documentation` | Read AWS documentation |
| `recommend` | Recommendations |
| `list_regions` | List AWS regions |
| `get_regional_availability` | Regional service availability |
| `prompt_understanding` | Prompt understanding |
| `call_aws` | Call AWS API |
| `suggest_aws_commands` | Suggest AWS CLI commands |
| `run_steampipe_query` | Run Steampipe SQL |

## Code Interpreter

Provides a sandbox environment for Python code execution.

### Features

- **Isolated environment**: Secure Python execution
- **Data analysis**: Library support for pandas, numpy, etc.
- **Visualization**: Chart generation with matplotlib, plotly, etc.
- **File processing**: Data parsing for JSON, CSV, etc.

### Usage Examples

```
"Visualize AWS cost data as a monthly trend chart"
"Parse this JSON data and calculate statistics"
```

## Call Statistics

The following statistics are available on the AgentCore page:

| Statistic | Description |
|-----------|-------------|
| **Total Calls** | Total AI request count |
| **Average Response Time** | Average processing time |
| **Tools Used** | Unique tool count, total call count |
| **Success Rate** | Success/failure ratio |
| **Multi-Route** | Parallel Gateway call count |
| **Call Distribution by Route** | Usage ratio per route |

## Conversation History Search

Search saved conversation history on the AgentCore page.

### Search Features

- **Keyword search**: Search by question content
- **Recent conversations**: Sort by time
- **Route filter**: Filter by route (in UI)

### Displayed Information

- Question content
- Response summary
- Route
- Tools used count
- Response time
- Timestamp

## Configuration File

AgentCore configuration is managed in `data/config.json`.

```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID",
  "codeInterpreterName": "awsops_code_interpreter-XXXXX",
  "memoryId": "awsops_memory-XXXXX",
  "memoryName": "awsops_memory"
}
```

:::tip Per-Account Deployment
When deploying to a new account, just update this config file. No code changes required.
:::

## Known Limitations

| Item | Limitation |
|------|------------|
| **Docker architecture** | arm64 required |
| **Code Interpreter name** | No hyphens, underscores only |
| **Memory name** | No hyphens, underscores only |
| **Conversation history retention** | Maximum 365 days |
| **AgentCore response** | Returns final text only (tool inference, streamed with typing effect) |

## Next Steps

- [AI Assistant](../overview/ai-assistant) - Using AI features
- [Dashboard](../overview/dashboard) - Return to dashboard
