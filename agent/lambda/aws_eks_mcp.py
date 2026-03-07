"""AWS EKS MCP Lambda - EKS cluster management, K8s resources, CloudWatch, IAM"""
import json
import boto3


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)

    if not t:
        if "cluster_name" in params and "kind" in params:
            t = "list_k8s_resources"
        elif "cluster_name" in params and "pod_name" in params:
            t = "get_pod_logs"
        elif "cluster_name" in params and "log_type" in params:
            t = "get_cloudwatch_logs"
        elif "cluster_name" in params and "metric_name" in params:
            t = "get_cloudwatch_metrics"
        elif "cluster_name" in params and "insight_id" in params:
            t = "get_eks_insights"
        elif "cluster_name" in params:
            t = "get_eks_vpc_config"
        elif "role_name" in params:
            t = "get_policies_for_role"
        elif "resource_type" in params:
            t = "get_eks_metrics_guidance"
        elif "query" in params:
            t = "search_eks_troubleshoot_guide"
        else:
            t = "list_eks_clusters"
        args = params

    try:
        if t == "list_eks_clusters":
            eks = boto3.client('eks')
            clusters = eks.list_clusters().get('clusters', [])
            details = []
            for c in clusters[:10]:
                d = eks.describe_cluster(name=c)['cluster']
                details.append({'name': c, 'status': d['status'], 'version': d['version'],
                    'endpoint': d.get('endpoint', '')[:60], 'platformVersion': d.get('platformVersion', '')})
            return {"statusCode": 200, "body": json.dumps({"clusters": details}, default=str)}

        elif t == "get_eks_vpc_config":
            eks = boto3.client('eks')
            cluster = eks.describe_cluster(name=args['cluster_name'])['cluster']
            vpc = cluster.get('resourcesVpcConfig', {})
            return {"statusCode": 200, "body": json.dumps({
                "cluster": args['cluster_name'], "status": cluster['status'], "version": cluster['version'],
                "vpcId": vpc.get('vpcId'), "subnetIds": vpc.get('subnetIds', []),
                "securityGroupIds": vpc.get('securityGroupIds', []),
                "clusterSecurityGroupId": vpc.get('clusterSecurityGroupId', ''),
                "endpointPublicAccess": vpc.get('endpointPublicAccess'),
                "endpointPrivateAccess": vpc.get('endpointPrivateAccess'),
                "publicAccessCidrs": vpc.get('publicAccessCidrs', [])}, default=str)}

        elif t == "get_eks_insights":
            eks = boto3.client('eks')
            cn = args['cluster_name']
            if args.get('insight_id'):
                resp = eks.describe_insight(clusterName=cn, id=args['insight_id'])
                return {"statusCode": 200, "body": json.dumps(resp.get('insight', {}), default=str)}
            else:
                kwargs = {'clusterName': cn}
                if args.get('category'): kwargs['filter'] = {'categories': [args['category']]}
                resp = eks.list_insights(**kwargs)
                return {"statusCode": 200, "body": json.dumps(resp.get('insights', [])[:20], default=str)}

        elif t == "list_k8s_resources":
            return {"statusCode": 200, "body": json.dumps({
                "message": "K8s resource listing requires kubectl/API access on EC2.",
                "suggestion": "Use SSM: aws ssm send-command --parameters 'commands=[\"kubectl get {} -n {} --context arn:aws:eks:ap-northeast-2:605134447633:cluster/{}\"]'".format(
                    args.get('kind', 'pods'), args.get('namespace', 'default'), args.get('cluster_name', ''))})}

        elif t == "get_pod_logs":
            return {"statusCode": 200, "body": json.dumps({
                "message": "Pod logs require kubectl access on EC2.",
                "suggestion": "kubectl logs {} -n {} -c {} --tail={}".format(
                    args.get('pod_name', ''), args.get('namespace', 'default'),
                    args.get('container_name', ''), args.get('tail_lines', 100))})}

        elif t == "get_k8s_events":
            return {"statusCode": 200, "body": json.dumps({
                "message": "K8s events require kubectl access.",
                "suggestion": "kubectl get events -n {} --field-selector involvedObject.name={}".format(
                    args.get('namespace', 'default'), args.get('name', ''))})}

        elif t == "get_cloudwatch_logs":
            logs = boto3.client('logs')
            cn = args['cluster_name']
            log_type = args.get('log_type', 'application')
            log_group_map = {
                'application': '/aws/containerinsights/{}/application'.format(cn),
                'host': '/aws/containerinsights/{}/host'.format(cn),
                'performance': '/aws/containerinsights/{}/performance'.format(cn),
                'control-plane': '/aws/eks/{}/cluster'.format(cn),
            }
            lg = log_group_map.get(log_type, args.get('log_group', ''))
            minutes = args.get('minutes', 30)
            import time
            start = int((time.time() - minutes * 60) * 1000)
            try:
                resp = logs.filter_log_events(
                    logGroupName=lg, startTime=start, limit=args.get('limit', 50),
                    filterPattern=args.get('filter_pattern', ''))
                events = [{'timestamp': e.get('timestamp'), 'message': e.get('message', '')[:500]}
                          for e in resp.get('events', [])]
                return {"statusCode": 200, "body": json.dumps({"logGroup": lg, "events": events, "count": len(events)}, default=str)}
            except Exception as e:
                return {"statusCode": 200, "body": json.dumps({"logGroup": lg, "error": str(e)})}

        elif t == "get_cloudwatch_metrics":
            cw = boto3.client('cloudwatch')
            import time, datetime
            minutes = args.get('minutes', 60)
            end = datetime.datetime.utcnow()
            start = end - datetime.timedelta(minutes=minutes)
            resp = cw.get_metric_statistics(
                Namespace=args.get('namespace', 'ContainerInsights'),
                MetricName=args.get('metric_name', ''),
                Dimensions=[{'Name': k, 'Value': v} for k, v in args.get('dimensions', {}).items()],
                StartTime=start, EndTime=end,
                Period=args.get('period', 300),
                Statistics=[args.get('stat', 'Average')])
            datapoints = sorted(resp.get('Datapoints', []), key=lambda x: x.get('Timestamp', ''))
            return {"statusCode": 200, "body": json.dumps({"metric": args.get('metric_name'), "datapoints": datapoints[-20:]}, default=str)}

        elif t == "get_eks_metrics_guidance":
            rt = args.get('resource_type', 'cluster')
            guidance = {
                'cluster': ['node_cpu_utilization', 'node_memory_utilization', 'node_number_of_running_pods', 'cluster_node_count', 'cluster_failed_node_count'],
                'node': ['node_cpu_utilization', 'node_memory_utilization', 'node_filesystem_utilization', 'node_number_of_running_pods', 'node_network_total_bytes'],
                'pod': ['pod_cpu_utilization', 'pod_memory_utilization', 'pod_network_rx_bytes', 'pod_network_tx_bytes', 'pod_number_of_container_restarts'],
                'namespace': ['namespace_number_of_running_pods'],
                'service': ['service_number_of_running_pods'],
            }
            return {"statusCode": 200, "body": json.dumps({"resource_type": rt, "metrics": guidance.get(rt, []),
                "namespace": "ContainerInsights", "note": "Enable Container Insights on EKS cluster first"})}

        elif t == "get_policies_for_role":
            iam = boto3.client('iam')
            rn = args['role_name']
            role = iam.get_role(RoleName=rn)['Role']
            managed = iam.list_attached_role_policies(RoleName=rn).get('AttachedPolicies', [])
            inline = iam.list_role_policies(RoleName=rn).get('PolicyNames', [])
            return {"statusCode": 200, "body": json.dumps({
                "role": rn, "assumeRolePolicy": role.get('AssumeRolePolicyDocument', {}),
                "managedPolicies": [p['PolicyArn'] for p in managed],
                "inlinePolicies": inline}, default=str)}

        elif t == "search_eks_troubleshoot_guide":
            import urllib.request
            payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": "aws___search_documentation",
                    "arguments": {"search_phrase": "EKS troubleshoot " + args.get("query", ""), "limit": 5}}}).encode()
            req = urllib.request.Request("https://knowledge-mcp.global.api.aws",
                data=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            content = data.get("result", {}).get("content", [])
            return {"statusCode": 200, "body": "\n".join(c.get("text", "") for c in content if c.get("type") == "text")[:50000]}

        elif t == "manage_eks_stacks":
            return {"statusCode": 200, "body": json.dumps({
                "message": "EKS stack management requires CloudFormation access.",
                "suggestion": "Use call_aws tool: aws cloudformation describe-stacks --stack-name <eks-stack>"})}

        elif t == "generate_app_manifest":
            name = args.get('app_name', 'myapp')
            image = args.get('image_uri', 'nginx:latest')
            port = args.get('port', 80)
            replicas = args.get('replicas', 2)
            ns = args.get('namespace', 'default')
            manifest = "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {}\n  namespace: {}\nspec:\n  replicas: {}\n  selector:\n    matchLabels:\n      app: {}\n  template:\n    metadata:\n      labels:\n        app: {}\n    spec:\n      containers:\n      - name: {}\n        image: {}\n        ports:\n        - containerPort: {}\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: {}-svc\n  namespace: {}\nspec:\n  type: ClusterIP\n  ports:\n  - port: {}\n    targetPort: {}\n  selector:\n    app: {}".format(
                name, ns, replicas, name, name, name, image, port, name, ns, port, port, name)
            return {"statusCode": 200, "body": manifest}

        return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + t})}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
