"""AWS ECS MCP Lambda - cluster/service/task management, troubleshooting, ECR"""
import json
import boto3


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)

    if not t:
        if "action" in params:
            t = "ecs_troubleshooting_tool"
        elif "operation" in params:
            t = "ecs_resource_management"
        elif "service_name" in params and "cluster" in params:
            t = "wait_for_service_ready"
        else:
            t = "ecs_resource_management"
            args = {"operation": "list_clusters"}
        args = params if not args else args

    try:
        if t == "ecs_resource_management":
            return handle_resource(args)
        elif t == "ecs_troubleshooting_tool":
            return handle_troubleshoot(args)
        elif t == "wait_for_service_ready":
            return handle_wait_service(args)
        return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + t})}
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def handle_resource(args):
    ecs = boto3.client('ecs')
    op = args.get("operation", "list_clusters")

    if op == "list_clusters":
        clusters = ecs.list_clusters().get('clusterArns', [])
        if not clusters:
            return ok({"clusters": [], "count": 0})
        details = ecs.describe_clusters(clusters=clusters[:10]).get('clusters', [])
        return ok({"clusters": [{"name": c['clusterName'], "status": c['status'],
            "runningTasks": c.get('runningTasksCount', 0), "pendingTasks": c.get('pendingTasksCount', 0),
            "services": c.get('activeServicesCount', 0), "instances": c.get('registeredContainerInstancesCount', 0)}
            for c in details]})

    elif op == "list_services":
        cluster = args.get("cluster", "")
        services = ecs.list_services(cluster=cluster).get('serviceArns', [])
        if not services:
            return ok({"services": [], "cluster": cluster})
        details = ecs.describe_services(cluster=cluster, services=services[:10]).get('services', [])
        return ok({"services": [{"name": s['serviceName'], "status": s['status'],
            "desiredCount": s.get('desiredCount', 0), "runningCount": s.get('runningCount', 0),
            "taskDef": s.get('taskDefinition', '').split('/')[-1],
            "launchType": s.get('launchType', 'FARGATE')} for s in details]})

    elif op == "list_tasks":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        kwargs = {"cluster": cluster}
        if service:
            kwargs["serviceName"] = service
        tasks = ecs.list_tasks(**kwargs).get('taskArns', [])
        if not tasks:
            return ok({"tasks": [], "cluster": cluster})
        details = ecs.describe_tasks(cluster=cluster, tasks=tasks[:20]).get('tasks', [])
        return ok({"tasks": [{"taskId": t['taskArn'].split('/')[-1], "status": t.get('lastStatus', ''),
            "cpu": t.get('cpu', ''), "memory": t.get('memory', ''),
            "group": t.get('group', ''), "startedAt": str(t.get('startedAt', ''))}
            for t in details]})

    elif op == "describe_service":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        details = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
        return ok({"name": details.get('serviceName'), "status": details.get('status'),
            "desiredCount": details.get('desiredCount'), "runningCount": details.get('runningCount'),
            "taskDefinition": details.get('taskDefinition', '').split('/')[-1],
            "launchType": details.get('launchType'), "events": [
                {"createdAt": str(e.get('createdAt', '')), "message": e.get('message', '')}
                for e in details.get('events', [])[:10]]})

    elif op == "list_task_definitions":
        families = ecs.list_task_definition_families(status='ACTIVE').get('families', [])
        return ok({"families": families[:30]})

    elif op == "describe_task_definition":
        td = ecs.describe_task_definition(taskDefinition=args.get("task_definition", "")).get('taskDefinition', {})
        return ok({"family": td.get('taskDefinitionArn', '').split('/')[-1],
            "cpu": td.get('cpu'), "memory": td.get('memory'),
            "networkMode": td.get('networkMode'), "requiresCompatibilities": td.get('requiresCompatibilities', []),
            "containers": [{"name": c['name'], "image": c['image'], "cpu": c.get('cpu', 0),
                "memory": c.get('memory', 0), "essential": c.get('essential', True),
                "ports": [p.get('containerPort') for p in c.get('portMappings', [])]}
                for c in td.get('containerDefinitions', [])]})

    elif op == "list_ecr_repositories":
        ecr = boto3.client('ecr')
        repos = ecr.describe_repositories().get('repositories', [])
        return ok({"repositories": [{"name": r['repositoryName'], "uri": r['repositoryUri'],
            "createdAt": str(r.get('createdAt', ''))} for r in repos[:20]]})

    return ok({"error": "Unknown operation: " + op, "available": [
        "list_clusters", "list_services", "list_tasks", "describe_service",
        "list_task_definitions", "describe_task_definition", "list_ecr_repositories"]})


def handle_troubleshoot(args):
    action = args.get("action", "get_ecs_troubleshooting_guidance")
    ecs = boto3.client('ecs')

    if action == "get_ecs_troubleshooting_guidance":
        return ok({"guidance": [
            "1. Check service events: ecs_troubleshooting_tool action=fetch_service_events",
            "2. Check task failures: ecs_troubleshooting_tool action=fetch_task_failures",
            "3. Check task logs: ecs_troubleshooting_tool action=fetch_task_logs",
            "4. Check image pull: ecs_troubleshooting_tool action=detect_image_pull_failures",
            "5. Check network: ecs_troubleshooting_tool action=fetch_network_configuration"]})

    elif action == "fetch_service_events":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        svc = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
        events = [{"at": str(e.get('createdAt', '')), "msg": e.get('message', '')}
                  for e in svc.get('events', [])[:15]]
        return ok({"service": service, "status": svc.get('status'), "events": events})

    elif action == "fetch_task_failures":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        tasks = ecs.list_tasks(cluster=cluster, serviceName=service, desiredStatus='STOPPED').get('taskArns', [])
        if not tasks:
            return ok({"message": "No stopped tasks found"})
        details = ecs.describe_tasks(cluster=cluster, tasks=tasks[:5]).get('tasks', [])
        failures = [{"taskId": t['taskArn'].split('/')[-1], "stoppedReason": t.get('stoppedReason', ''),
            "stopCode": t.get('stopCode', ''),
            "containers": [{"name": c['name'], "exitCode": c.get('exitCode'), "reason": c.get('reason', '')}
                for c in t.get('containers', []) if c.get('exitCode', 0) != 0]}
            for t in details]
        return ok({"failures": failures})

    elif action == "fetch_task_logs":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        tasks = ecs.list_tasks(cluster=cluster, serviceName=service).get('taskArns', [])
        if not tasks:
            return ok({"message": "No tasks found"})
        task = ecs.describe_tasks(cluster=cluster, tasks=[tasks[0]]).get('tasks', [{}])[0]
        td_arn = task.get('taskDefinition', '')
        td = ecs.describe_task_definition(taskDefinition=td_arn).get('taskDefinition', {})
        containers = td.get('containerDefinitions', [])
        log_info = []
        for c in containers:
            lc = c.get('logConfiguration', {})
            if lc.get('logDriver') == 'awslogs':
                opts = lc.get('options', {})
                log_info.append({"container": c['name'],
                    "logGroup": opts.get('awslogs-group', ''),
                    "logStreamPrefix": opts.get('awslogs-stream-prefix', '')})
        return ok({"taskId": tasks[0].split('/')[-1], "logConfiguration": log_info})

    elif action == "fetch_network_configuration":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        svc = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
        nc = svc.get('networkConfiguration', {}).get('awsvpcConfiguration', {})
        lbs = svc.get('loadBalancers', [])
        return ok({"subnets": nc.get('subnets', []), "securityGroups": nc.get('securityGroups', []),
            "assignPublicIp": nc.get('assignPublicIp', ''),
            "loadBalancers": [{"targetGroup": lb.get('targetGroupArn', '').split('/')[-1],
                "container": lb.get('containerName', ''), "port": lb.get('containerPort')} for lb in lbs]})

    elif action == "detect_image_pull_failures":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        tasks = ecs.list_tasks(cluster=cluster, serviceName=service, desiredStatus='STOPPED').get('taskArns', [])
        if not tasks:
            return ok({"message": "No stopped tasks"})
        details = ecs.describe_tasks(cluster=cluster, tasks=tasks[:3]).get('tasks', [])
        pulls = [{"taskId": t['taskArn'].split('/')[-1], "reason": t.get('stoppedReason', '')}
                 for t in details if 'pull' in t.get('stoppedReason', '').lower() or 'image' in t.get('stoppedReason', '').lower()]
        return ok({"imagePullFailures": pulls, "tip": "Check ECR permissions, image URI, and VPC endpoints for ECR"})

    return ok({"error": "Unknown action: " + action})


def handle_wait_service(args):
    ecs = boto3.client('ecs')
    cluster = args.get("cluster", "")
    service = args.get("service_name", args.get("service", ""))
    svc = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
    return ok({"service": service, "status": svc.get('status'), "desiredCount": svc.get('desiredCount'),
        "runningCount": svc.get('runningCount'), "pendingCount": svc.get('pendingCount'),
        "ready": svc.get('runningCount', 0) == svc.get('desiredCount', 0) and svc.get('desiredCount', 0) > 0})


def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}
