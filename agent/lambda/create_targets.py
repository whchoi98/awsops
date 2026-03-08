"""Create all Gateway Targets for all 7 Gateways.
Usage: REGION=ap-northeast-2 ACCOUNT_ID=xxx python3 agent/lambda/create_targets.py
"""
import boto3
import os
import sys

REGION = os.environ.get('REGION', 'ap-northeast-2')
ACCOUNT_ID = os.environ.get('ACCOUNT_ID', '')
client = boto3.client('bedrock-agentcore-control', region_name=REGION)


def prop(t, d=''):
    r = {'type': t}
    if d:
        r['description'] = d
    return r


def find_gateway(name_pattern):
    gws = client.list_gateways().get('items', [])
    for g in gws:
        if name_pattern in g.get('name', ''):
            return g['gatewayId']
    return None


def create_target(gw_id, name, fn, desc, tools):
    arn = 'arn:aws:lambda:{}:{}:function:{}'.format(REGION, ACCOUNT_ID, fn)
    # Check if target already exists
    existing = client.list_gateway_targets(gatewayIdentifier=gw_id).get('items', [])
    for e in existing:
        if e['name'] == name:
            print('  EXISTS: {}'.format(name))
            return
    try:
        resp = client.create_gateway_target(
            gatewayIdentifier=gw_id, name=name, description=desc,
            targetConfiguration={'mcp': {'lambda': {'lambdaArn': arn,
                'toolSchema': {'inlinePayload': tools}}}},
            credentialProviderConfigurations=[{'credentialProviderType': 'GATEWAY_IAM_ROLE'}])
        print('  CREATED: {} -> {}'.format(name, resp.get('targetId', '')))
    except Exception as e:
        print('  ERR: {} -> {}'.format(name, str(e)[:150]))


# ========== INFRA GATEWAY ==========
print('\n=== Infra Gateway ===')
gw = find_gateway('infra-gateway')
if not gw:
    print('ERROR: Infra gateway not found'); sys.exit(1)

create_target(gw, 'network-mcp-target', 'awsops-network-mcp',
    'AWS Network MCP - VPC, TGW, VPN, ENI, Firewall, Flow Logs (15 tools)',
    [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
        ('get_path_trace_methodology', 'Network troubleshooting methodology', {'type': 'object', 'properties': {}}),
        ('find_ip_address', 'Locate ENIs by IP', {'type': 'object', 'properties': {'ip_address': prop('string', 'IP')}, 'required': ['ip_address']}),
        ('get_eni_details', 'ENI details with SG, NACL, routes', {'type': 'object', 'properties': {'eni_id': prop('string', 'ENI ID')}, 'required': ['eni_id']}),
        ('list_vpcs', 'List VPCs', {'type': 'object', 'properties': {}}),
        ('get_vpc_network_details', 'Full VPC config', {'type': 'object', 'properties': {'vpc_id': prop('string', 'VPC ID')}, 'required': ['vpc_id']}),
        ('get_vpc_flow_logs', 'VPC flow logs', {'type': 'object', 'properties': {'vpc_id': prop('string', 'VPC ID')}, 'required': ['vpc_id']}),
        ('describe_network', 'Describe SG/NACL/RT/Subnet/VPC', {'type': 'object', 'properties': {'resource_type': prop('string', 'Type')}, 'required': ['resource_type']}),
        ('list_transit_gateways', 'List TGWs', {'type': 'object', 'properties': {}}),
        ('get_tgw_details', 'TGW details', {'type': 'object', 'properties': {'tgw_id': prop('string', 'TGW ID')}, 'required': ['tgw_id']}),
        ('get_tgw_routes', 'TGW routes', {'type': 'object', 'properties': {'route_table_id': prop('string', 'RT ID')}, 'required': ['route_table_id']}),
        ('get_all_tgw_routes', 'All TGW routes', {'type': 'object', 'properties': {'tgw_id': prop('string', 'TGW ID')}, 'required': ['tgw_id']}),
        ('list_tgw_peerings', 'TGW peerings', {'type': 'object', 'properties': {'tgw_id': prop('string', 'TGW ID')}, 'required': ['tgw_id']}),
        ('list_vpn_connections', 'VPN connections', {'type': 'object', 'properties': {}}),
        ('list_network_firewalls', 'Network Firewalls', {'type': 'object', 'properties': {}}),
        ('get_firewall_rules', 'Firewall rules', {'type': 'object', 'properties': {'firewall_name': prop('string', 'Name')}, 'required': ['firewall_name']}),
    ]])

create_target(gw, 'reachability-target', 'awsops-reachability-analyzer',
    'VPC Reachability Analyzer',
    [{'name': 'analyze_reachability', 'description': 'Analyze network reachability',
      'inputSchema': {'type': 'object', 'properties': {'source': prop('string', 'Source ID'), 'destination': prop('string', 'Dest ID')}, 'required': ['source', 'destination']}}])

create_target(gw, 'flow-monitor-target', 'awsops-flow-monitor',
    'VPC Flow Log analyzer',
    [{'name': 'query_flow_logs', 'description': 'Query flow logs',
      'inputSchema': {'type': 'object', 'properties': {'vpc_id': prop('string', 'VPC ID')}, 'required': ['vpc_id']}}])

create_target(gw, 'eks-mcp-target', 'awsops-eks-mcp',
    'EKS cluster management, K8s resources, CloudWatch',
    [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
        ('list_eks_clusters', 'List EKS clusters', {'type': 'object', 'properties': {}}),
        ('get_eks_vpc_config', 'EKS VPC config', {'type': 'object', 'properties': {'cluster_name': prop('string', 'Cluster')}, 'required': ['cluster_name']}),
        ('get_eks_insights', 'EKS insights', {'type': 'object', 'properties': {'cluster_name': prop('string', 'Cluster')}, 'required': ['cluster_name']}),
        ('get_cloudwatch_logs', 'EKS CloudWatch logs', {'type': 'object', 'properties': {'cluster_name': prop('string', 'Cluster')}, 'required': ['cluster_name']}),
        ('get_cloudwatch_metrics', 'EKS metrics', {'type': 'object', 'properties': {'cluster_name': prop('string', 'Cluster'), 'metric_name': prop('string', 'Metric')}, 'required': ['cluster_name', 'metric_name']}),
        ('get_eks_metrics_guidance', 'Container Insights guidance', {'type': 'object', 'properties': {'resource_type': prop('string', 'cluster/node/pod')}, 'required': ['resource_type']}),
        ('get_policies_for_role', 'IAM role policies', {'type': 'object', 'properties': {'role_name': prop('string', 'Role')}, 'required': ['role_name']}),
        ('search_eks_troubleshoot_guide', 'EKS troubleshooting', {'type': 'object', 'properties': {'query': prop('string', 'Query')}, 'required': ['query']}),
        ('generate_app_manifest', 'Generate K8s YAML', {'type': 'object', 'properties': {'app_name': prop('string', 'App'), 'image_uri': prop('string', 'Image')}, 'required': ['app_name', 'image_uri']}),
    ]])

create_target(gw, 'ecs-mcp-target', 'awsops-ecs-mcp',
    'ECS cluster/service/task management, troubleshooting',
    [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
        ('ecs_resource_management', 'ECS resources (7 operations)', {'type': 'object', 'properties': {'operation': prop('string', 'list_clusters/list_services/list_tasks/describe_service/list_task_definitions/describe_task_definition/list_ecr_repositories')}, 'required': ['operation']}),
        ('ecs_troubleshooting_tool', 'ECS troubleshooting (6 actions)', {'type': 'object', 'properties': {'action': prop('string', 'Action'), 'cluster': prop('string', 'Cluster'), 'service': prop('string', 'Service')}, 'required': ['action']}),
        ('wait_for_service_ready', 'Check service readiness', {'type': 'object', 'properties': {'cluster': prop('string', 'Cluster'), 'service_name': prop('string', 'Service')}, 'required': ['cluster', 'service_name']}),
    ]])

create_target(gw, 'istio-mcp-target', 'awsops-istio-mcp',
    'Istio Service Mesh - VirtualService, DestinationRule, mTLS, troubleshooting',
    [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
        ('istio_overview', 'Istio overview: CRDs, injected namespaces, sidecar pods', {'type': 'object', 'properties': {}}),
        ('list_virtual_services', 'VirtualServices', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_destination_rules', 'DestinationRules', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_istio_gateways', 'Istio Gateways', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_service_entries', 'ServiceEntries', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_authorization_policies', 'AuthorizationPolicies', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_peer_authentications', 'PeerAuthentications (mTLS)', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('check_sidecar_injection', 'Sidecar injection status', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_envoy_filters', 'EnvoyFilters', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}}),
        ('list_istio_crds', 'Installed Istio CRDs', {'type': 'object', 'properties': {}}),
        ('istio_troubleshooting', 'Troubleshooting guide', {'type': 'object', 'properties': {'issue': prop('string', 'general/503/mtls/connection_refused')}}),
        ('query_istio_resource', 'Custom SQL on K8s tables', {'type': 'object', 'properties': {'sql': prop('string', 'SQL')}, 'required': ['sql']}),
    ]])

# ========== IAC GATEWAY ==========
print('\n=== IaC Gateway ===')
gw = find_gateway('iac-gateway')
if gw:
    create_target(gw, 'iac-mcp-target', 'awsops-iac-mcp',
        'CloudFormation/CDK validation, troubleshooting, docs (7 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('validate_cloudformation_template', 'Validate CFn template', {'type': 'object', 'properties': {'template_content': prop('string', 'Template')}, 'required': ['template_content']}),
            ('check_cloudformation_template_compliance', 'Check compliance', {'type': 'object', 'properties': {'template_content': prop('string', 'Template')}, 'required': ['template_content']}),
            ('troubleshoot_cloudformation_deployment', 'Troubleshoot failures', {'type': 'object', 'properties': {'stack_name': prop('string', 'Stack')}, 'required': ['stack_name']}),
            ('search_cdk_documentation', 'Search CDK docs', {'type': 'object', 'properties': {'query': prop('string', 'Query')}, 'required': ['query']}),
            ('search_cloudformation_documentation', 'Search CFn docs', {'type': 'object', 'properties': {'query': prop('string', 'Query')}, 'required': ['query']}),
            ('cdk_best_practices', 'CDK best practices', {'type': 'object', 'properties': {}}),
            ('read_iac_documentation_page', 'Fetch doc page', {'type': 'object', 'properties': {'url': prop('string', 'URL')}, 'required': ['url']}),
        ]])
    create_target(gw, 'terraform-mcp-target', 'awsops-terraform-mcp',
        'Terraform provider docs, module search (5 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('SearchAwsProviderDocs', 'AWS provider docs', {'type': 'object', 'properties': {'asset_name': prop('string', 'Resource')}, 'required': ['asset_name']}),
            ('SearchAwsccProviderDocs', 'AWSCC provider docs', {'type': 'object', 'properties': {'asset_name': prop('string', 'Resource')}, 'required': ['asset_name']}),
            ('SearchSpecificAwsIaModules', 'AWS-IA modules', {'type': 'object', 'properties': {'query': prop('string', 'Search')}}),
            ('SearchUserProvidedModule', 'Registry module', {'type': 'object', 'properties': {'module_url': prop('string', 'Module')}, 'required': ['module_url']}),
            ('terraform_best_practices', 'Terraform best practices', {'type': 'object', 'properties': {}}),
        ]])

# ========== DATA GATEWAY ==========
print('\n=== Data Gateway ===')
gw = find_gateway('data-gateway')
if gw:
    create_target(gw, 'dynamodb-mcp-target', 'awsops-dynamodb-mcp',
        'DynamoDB tables, queries, data modeling, costs (6 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('list_tables', 'List tables', {'type': 'object', 'properties': {}}),
            ('describe_table', 'Describe table', {'type': 'object', 'properties': {'table_name': prop('string', 'Table')}, 'required': ['table_name']}),
            ('query_table', 'Query/scan table', {'type': 'object', 'properties': {'table_name': prop('string', 'Table')}, 'required': ['table_name']}),
            ('get_item', 'Get item by key', {'type': 'object', 'properties': {'table_name': prop('string', 'Table'), 'key': prop('string', 'Key JSON')}, 'required': ['table_name', 'key']}),
            ('dynamodb_data_modeling', 'Data modeling guide', {'type': 'object', 'properties': {}}),
            ('compute_performances_and_costs', 'Cost estimation', {'type': 'object', 'properties': {'reads_per_sec': prop('integer', 'Reads/s'), 'writes_per_sec': prop('integer', 'Writes/s')}}),
        ]])
    create_target(gw, 'rds-mcp-target', 'awsops-rds-mcp',
        'RDS MySQL/PostgreSQL instances, clusters, SQL via Data API (6 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('list_db_instances', 'List RDS instances', {'type': 'object', 'properties': {}}),
            ('list_db_clusters', 'List Aurora clusters', {'type': 'object', 'properties': {}}),
            ('describe_db_instance', 'Describe instance', {'type': 'object', 'properties': {'db_instance_identifier': prop('string', 'ID')}, 'required': ['db_instance_identifier']}),
            ('describe_db_cluster', 'Describe cluster', {'type': 'object', 'properties': {'db_cluster_identifier': prop('string', 'ID')}, 'required': ['db_cluster_identifier']}),
            ('execute_sql', 'SQL via Data API (SELECT only)', {'type': 'object', 'properties': {'sql': prop('string', 'SQL'), 'resource_arn': prop('string', 'ARN'), 'secret_arn': prop('string', 'Secret')}, 'required': ['sql', 'resource_arn', 'secret_arn']}),
            ('list_snapshots', 'List snapshots', {'type': 'object', 'properties': {}}),
        ]])
    create_target(gw, 'valkey-mcp-target', 'awsops-valkey-mcp',
        'ElastiCache/Valkey clusters, replication groups (6 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('list_cache_clusters', 'List clusters', {'type': 'object', 'properties': {}}),
            ('describe_cache_cluster', 'Describe cluster', {'type': 'object', 'properties': {'cluster_id': prop('string', 'ID')}, 'required': ['cluster_id']}),
            ('list_replication_groups', 'List replication groups', {'type': 'object', 'properties': {}}),
            ('describe_replication_group', 'Describe group', {'type': 'object', 'properties': {'replication_group_id': prop('string', 'ID')}, 'required': ['replication_group_id']}),
            ('list_serverless_caches', 'Serverless caches', {'type': 'object', 'properties': {}}),
            ('elasticache_best_practices', 'Best practices', {'type': 'object', 'properties': {}}),
        ]])
    create_target(gw, 'msk-mcp-target', 'awsops-msk-mcp',
        'MSK Kafka clusters, brokers, configurations (6 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('list_clusters', 'List Kafka clusters', {'type': 'object', 'properties': {}}),
            ('get_cluster_info', 'Cluster details', {'type': 'object', 'properties': {'cluster_arn': prop('string', 'ARN')}, 'required': ['cluster_arn']}),
            ('get_configuration_info', 'MSK configurations', {'type': 'object', 'properties': {}}),
            ('get_bootstrap_brokers', 'Bootstrap brokers', {'type': 'object', 'properties': {'cluster_arn': prop('string', 'ARN')}, 'required': ['cluster_arn']}),
            ('list_nodes', 'Broker nodes', {'type': 'object', 'properties': {'cluster_arn': prop('string', 'ARN')}, 'required': ['cluster_arn']}),
            ('msk_best_practices', 'Best practices', {'type': 'object', 'properties': {}}),
        ]])

# ========== SECURITY GATEWAY ==========
print('\n=== Security Gateway ===')
gw = find_gateway('security-gateway')
if gw:
    create_target(gw, 'iam-mcp-target', 'awsops-iam-mcp',
        'IAM users, roles, groups, policies, simulation (14 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('list_users', 'List IAM users', {'type': 'object', 'properties': {}}),
            ('get_user', 'User details', {'type': 'object', 'properties': {'user_name': prop('string', 'User')}, 'required': ['user_name']}),
            ('list_roles', 'List roles', {'type': 'object', 'properties': {}}),
            ('get_role_details', 'Role details', {'type': 'object', 'properties': {'role_name': prop('string', 'Role')}, 'required': ['role_name']}),
            ('list_groups', 'List groups', {'type': 'object', 'properties': {}}),
            ('get_group', 'Group details', {'type': 'object', 'properties': {'group_name': prop('string', 'Group')}, 'required': ['group_name']}),
            ('list_policies', 'List policies', {'type': 'object', 'properties': {'scope': prop('string', 'Local/AWS/All')}}),
            ('list_user_policies', 'User policies', {'type': 'object', 'properties': {'user_name': prop('string', 'User')}, 'required': ['user_name']}),
            ('list_role_policies', 'Role policies', {'type': 'object', 'properties': {'role_name': prop('string', 'Role')}, 'required': ['role_name']}),
            ('get_user_policy', 'User inline policy', {'type': 'object', 'properties': {'user_name': prop('string', 'User'), 'policy_name': prop('string', 'Policy')}, 'required': ['user_name', 'policy_name']}),
            ('get_role_policy', 'Role inline policy', {'type': 'object', 'properties': {'role_name': prop('string', 'Role'), 'policy_name': prop('string', 'Policy')}, 'required': ['role_name', 'policy_name']}),
            ('list_access_keys', 'Access keys', {'type': 'object', 'properties': {'user_name': prop('string', 'User')}, 'required': ['user_name']}),
            ('simulate_principal_policy', 'Policy simulation', {'type': 'object', 'properties': {'policy_source_arn': prop('string', 'ARN'), 'action_names': prop('string', 'Actions')}, 'required': ['policy_source_arn', 'action_names']}),
            ('get_account_security_summary', 'Account security summary', {'type': 'object', 'properties': {}}),
        ]])

# ========== MONITORING GATEWAY ==========
print('\n=== Monitoring Gateway ===')
gw = find_gateway('monitoring-gateway')
if gw:
    create_target(gw, 'cloudwatch-mcp-target', 'awsops-cloudwatch-mcp',
        'CloudWatch metrics, alarms, logs, Log Insights (11 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('get_metric_data', 'Get metric data', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace'), 'metric_name': prop('string', 'Metric')}, 'required': ['namespace', 'metric_name']}),
            ('get_metric_metadata', 'Metric metadata', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace')}, 'required': ['namespace']}),
            ('analyze_metric', 'Analyze trend', {'type': 'object', 'properties': {'namespace': prop('string', 'Namespace'), 'metric_name': prop('string', 'Metric')}, 'required': ['namespace', 'metric_name']}),
            ('get_recommended_metric_alarms', 'Alarm recommendations', {'type': 'object', 'properties': {'metric_name': prop('string', 'Metric')}, 'required': ['metric_name']}),
            ('get_active_alarms', 'Active alarms', {'type': 'object', 'properties': {}}),
            ('get_alarm_history', 'Alarm history', {'type': 'object', 'properties': {'alarm_name': prop('string', 'Alarm')}, 'required': ['alarm_name']}),
            ('describe_log_groups', 'Log groups', {'type': 'object', 'properties': {}}),
            ('analyze_log_group', 'Search logs', {'type': 'object', 'properties': {'log_group': prop('string', 'Group')}, 'required': ['log_group']}),
            ('execute_log_insights_query', 'Log Insights query', {'type': 'object', 'properties': {'log_group': prop('string', 'Group'), 'query': prop('string', 'Query')}, 'required': ['log_group', 'query']}),
            ('get_logs_insight_query_results', 'Query results', {'type': 'object', 'properties': {'query_id': prop('string', 'ID')}, 'required': ['query_id']}),
            ('cancel_logs_insight_query', 'Cancel query', {'type': 'object', 'properties': {'query_id': prop('string', 'ID')}, 'required': ['query_id']}),
        ]])
    create_target(gw, 'cloudtrail-mcp-target', 'awsops-cloudtrail-mcp',
        'CloudTrail events, Lake analytics (5 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('lookup_events', 'Look up events', {'type': 'object', 'properties': {'username': prop('string', 'User'), 'event_name': prop('string', 'Event'), 'minutes': prop('integer', 'Minutes')}}),
            ('list_event_data_stores', 'Lake data stores', {'type': 'object', 'properties': {}}),
            ('lake_query', 'Lake SQL query', {'type': 'object', 'properties': {'event_data_store': prop('string', 'Store ID'), 'query': prop('string', 'SQL')}, 'required': ['event_data_store', 'query']}),
            ('get_query_status', 'Query status', {'type': 'object', 'properties': {'query_id': prop('string', 'ID')}, 'required': ['query_id']}),
            ('get_query_results', 'Query results', {'type': 'object', 'properties': {'query_id': prop('string', 'ID')}, 'required': ['query_id']}),
        ]])

# ========== COST GATEWAY ==========
print('\n=== Cost Gateway ===')
gw = find_gateway('cost-gateway')
if gw:
    create_target(gw, 'cost-mcp-target', 'awsops-cost-mcp',
        'Cost Explorer, Pricing, Budgets (9 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('get_today_date', 'Current date', {'type': 'object', 'properties': {}}),
            ('get_cost_and_usage', 'Cost and usage', {'type': 'object', 'properties': {'start_date': prop('string', 'Start'), 'granularity': prop('string', 'DAILY/MONTHLY')}}),
            ('get_cost_and_usage_comparisons', 'Compare months', {'type': 'object', 'properties': {}}),
            ('get_cost_comparison_drivers', 'Cost drivers', {'type': 'object', 'properties': {}}),
            ('get_cost_forecast', 'Cost forecast', {'type': 'object', 'properties': {}}),
            ('get_dimension_values', 'Dimension values', {'type': 'object', 'properties': {'dimension': prop('string', 'Dimension')}, 'required': ['dimension']}),
            ('get_tag_values', 'Tag values', {'type': 'object', 'properties': {}}),
            ('get_pricing', 'Service pricing', {'type': 'object', 'properties': {'service_code': prop('string', 'Service')}, 'required': ['service_code']}),
            ('list_budgets', 'List budgets', {'type': 'object', 'properties': {}}),
        ]])

# ========== OPS GATEWAY ==========
print('\n=== Ops Gateway ===')
gw = find_gateway('ops-gateway')
if gw:
    create_target(gw, 'aws-knowledge-target', 'awsops-aws-knowledge',
        'AWS Knowledge MCP - docs, regions, availability (5 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('search_documentation', 'Search AWS docs', {'type': 'object', 'properties': {'search_phrase': prop('string', 'Query')}, 'required': ['search_phrase']}),
            ('read_documentation', 'Read doc page', {'type': 'object', 'properties': {'url': prop('string', 'URL')}, 'required': ['url']}),
            ('recommend', 'Doc recommendations', {'type': 'object', 'properties': {'url': prop('string', 'URL')}, 'required': ['url']}),
            ('list_regions', 'List regions', {'type': 'object', 'properties': {}}),
            ('get_regional_availability', 'Regional availability', {'type': 'object', 'properties': {'resource_type': prop('string', 'product/api/cfn')}, 'required': ['resource_type']}),
        ]])
    create_target(gw, 'core-mcp-target', 'awsops-core-mcp',
        'AWS Core MCP - prompt understanding, API execution (3 tools)',
        [{'name': n, 'description': d, 'inputSchema': s} for n, d, s in [
            ('prompt_understanding', 'Solution design guide', {'type': 'object', 'properties': {}}),
            ('call_aws', 'Execute AWS CLI', {'type': 'object', 'properties': {'cli_command': prop('string', 'Command')}, 'required': ['cli_command']}),
            ('suggest_aws_commands', 'Suggest commands', {'type': 'object', 'properties': {'query': prop('string', 'Query')}, 'required': ['query']}),
        ]])
    create_target(gw, 'steampipe-query-target', 'awsops-steampipe-query',
        'Steampipe SQL (580+ tables)',
        [{'name': 'run_steampipe_query', 'description': 'Execute SQL against 580+ AWS tables',
          'inputSchema': {'type': 'object', 'properties': {'sql': prop('string', 'SQL query')}, 'required': ['sql']}}])

print('\nDONE')
