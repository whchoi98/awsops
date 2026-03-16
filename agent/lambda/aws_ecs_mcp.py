"""
AWS ECS MCP Lambda - cluster/service/task management, troubleshooting, ECR
AWS ECS MCP Lambda - 클러스터/서비스/태스크 관리, 트러블슈팅, ECR

# Provides 3 tool handlers: resource management, troubleshooting, service readiness check.
# 3개의 도구 핸들러 제공: 리소스 관리, 트러블슈팅, 서비스 준비 상태 확인.
"""
import json
import boto3
from cross_account import get_client


def lambda_handler(event, context):
    # Parse event and extract tool name and arguments / 이벤트를 파싱하고 도구 이름과 인자를 추출
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    region = args.get("region", "ap-northeast-2")
    target_account_id = args.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Auto-detect tool from parameters if tool_name not provided / tool_name이 없으면 파라미터로 도구를 자동 감지
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
        # Route to appropriate handler / 적절한 핸들러로 라우팅
        if t == "ecs_resource_management":
            return handle_resource(args, region, role_arn)
        elif t == "ecs_troubleshooting_tool":
            return handle_troubleshoot(args, region, role_arn)
        elif t == "wait_for_service_ready":
            return handle_wait_service(args, region, role_arn)
        return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + t})}
    except Exception as e:
        # Global error handler - return 500 with error message / 전역 오류 처리 - 오류 메시지와 함께 500 반환
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


# Handle ECS resource management operations / ECS 리소스 관리 작업 처리
def handle_resource(args, region='ap-northeast-2', role_arn=None):
    ecs = get_client('ecs', region, role_arn)
    op = args.get("operation", "list_clusters")

    # List all ECS clusters with running/pending task counts / 모든 ECS 클러스터를 실행/대기 중인 태스크 수와 함께 조회
    if op == "list_clusters":
        clusters = ecs.list_clusters().get('clusterArns', [])
        if not clusters:
            return ok({"clusters": [], "count": 0})
        details = ecs.describe_clusters(clusters=clusters[:10]).get('clusters', [])
        return ok({"clusters": [{"name": c['clusterName'], "status": c['status'],
            "runningTasks": c.get('runningTasksCount', 0), "pendingTasks": c.get('pendingTasksCount', 0),
            "services": c.get('activeServicesCount', 0), "instances": c.get('registeredContainerInstancesCount', 0)}
            for c in details]})

    # List services in a cluster with desired/running counts / 클러스터의 서비스를 원하는/실행 중인 수와 함께 조회
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

    # List tasks in a cluster (optionally filtered by service) / 클러스터의 태스크 조회 (선택적으로 서비스별 필터링)
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

    # Describe a specific service with recent events / 특정 서비스의 상세 정보와 최근 이벤트 조회
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

    # List active task definition families / 활성 태스크 정의 패밀리 목록 조회
    elif op == "list_task_definitions":
        families = ecs.list_task_definition_families(status='ACTIVE').get('families', [])
        return ok({"families": families[:30]})

    # Describe task definition with container details / 태스크 정의 상세 조회 (컨테이너 세부사항 포함)
    elif op == "describe_task_definition":
        td = ecs.describe_task_definition(taskDefinition=args.get("task_definition", "")).get('taskDefinition', {})
        return ok({"family": td.get('taskDefinitionArn', '').split('/')[-1],
            "cpu": td.get('cpu'), "memory": td.get('memory'),
            "networkMode": td.get('networkMode'), "requiresCompatibilities": td.get('requiresCompatibilities', []),
            "containers": [{"name": c['name'], "image": c['image'], "cpu": c.get('cpu', 0),
                "memory": c.get('memory', 0), "essential": c.get('essential', True),
                "ports": [p.get('containerPort') for p in c.get('portMappings', [])]}
                for c in td.get('containerDefinitions', [])]})

    # List ECR repositories / ECR 리포지토리 목록 조회
    elif op == "list_ecr_repositories":
        ecr = get_client('ecr', region, role_arn)
        repos = ecr.describe_repositories().get('repositories', [])
        return ok({"repositories": [{"name": r['repositoryName'], "uri": r['repositoryUri'],
            "createdAt": str(r.get('createdAt', ''))} for r in repos[:20]]})

    return ok({"error": "Unknown operation: " + op, "available": [
        "list_clusters", "list_services", "list_tasks", "describe_service",
        "list_task_definitions", "describe_task_definition", "list_ecr_repositories"]})


# Handle ECS troubleshooting actions / ECS 트러블슈팅 작업 처리
def handle_troubleshoot(args, region='ap-northeast-2', role_arn=None):
    action = args.get("action", "get_ecs_troubleshooting_guidance")
    ecs = get_client('ecs', region, role_arn)

    # Return step-by-step troubleshooting guidance / 단계별 트러블슈팅 가이드 반환
    if action == "get_ecs_troubleshooting_guidance":
        return ok({"guidance": [
            "1. Check service events: ecs_troubleshooting_tool action=fetch_service_events",
            "2. Check task failures: ecs_troubleshooting_tool action=fetch_task_failures",
            "3. Check task logs: ecs_troubleshooting_tool action=fetch_task_logs",
            "4. Check image pull: ecs_troubleshooting_tool action=detect_image_pull_failures",
            "5. Check network: ecs_troubleshooting_tool action=fetch_network_configuration"]})

    # Fetch recent service events for debugging / 디버깅을 위한 최근 서비스 이벤트 조회
    elif action == "fetch_service_events":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        svc = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
        events = [{"at": str(e.get('createdAt', '')), "msg": e.get('message', '')}
                  for e in svc.get('events', [])[:15]]
        return ok({"service": service, "status": svc.get('status'), "events": events})

    # Fetch stopped task failure reasons and container exit codes / 중지된 태스크의 실패 사유 및 컨테이너 종료 코드 조회
    elif action == "fetch_task_failures":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        # List stopped tasks to find failures / 중지된 태스크를 조회하여 실패 원인 확인
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

    # Fetch CloudWatch log configuration for task containers / 태스크 컨테이너의 CloudWatch 로그 설정 조회
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

    # Fetch service network configuration (subnets, SGs, LBs) / 서비스 네트워크 설정 조회 (서브넷, 보안 그룹, 로드밸런서)
    elif action == "fetch_network_configuration":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        # Get awsvpc configuration and load balancers / awsvpc 설정 및 로드밸런서 조회
        svc = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
        nc = svc.get('networkConfiguration', {}).get('awsvpcConfiguration', {})
        lbs = svc.get('loadBalancers', [])
        return ok({"subnets": nc.get('subnets', []), "securityGroups": nc.get('securityGroups', []),
            "assignPublicIp": nc.get('assignPublicIp', ''),
            "loadBalancers": [{"targetGroup": lb.get('targetGroupArn', '').split('/')[-1],
                "container": lb.get('containerName', ''), "port": lb.get('containerPort')} for lb in lbs]})

    # Detect container image pull failures from stopped tasks / 중지된 태스크에서 컨테이너 이미지 풀 실패 감지
    elif action == "detect_image_pull_failures":
        cluster = args.get("cluster", "")
        service = args.get("service", "")
        # Check stopped tasks for image/pull related errors / 중지된 태스크에서 이미지/풀 관련 오류 확인
        tasks = ecs.list_tasks(cluster=cluster, serviceName=service, desiredStatus='STOPPED').get('taskArns', [])
        if not tasks:
            return ok({"message": "No stopped tasks"})
        details = ecs.describe_tasks(cluster=cluster, tasks=tasks[:3]).get('tasks', [])
        pulls = [{"taskId": t['taskArn'].split('/')[-1], "reason": t.get('stoppedReason', '')}
                 for t in details if 'pull' in t.get('stoppedReason', '').lower() or 'image' in t.get('stoppedReason', '').lower()]
        return ok({"imagePullFailures": pulls, "tip": "Check ECR permissions, image URI, and VPC endpoints for ECR"})

    return ok({"error": "Unknown action: " + action})


# Check if ECS service has reached desired running count / ECS 서비스가 원하는 실행 수에 도달했는지 확인
def handle_wait_service(args, region='ap-northeast-2', role_arn=None):
    ecs = get_client('ecs', region, role_arn)
    cluster = args.get("cluster", "")
    service = args.get("service_name", args.get("service", ""))
    svc = ecs.describe_services(cluster=cluster, services=[service]).get('services', [{}])[0]
    return ok({"service": service, "status": svc.get('status'), "desiredCount": svc.get('desiredCount'),
        "runningCount": svc.get('runningCount'), "pendingCount": svc.get('pendingCount'),
        "ready": svc.get('runningCount', 0) == svc.get('desiredCount', 0) and svc.get('desiredCount', 0) > 0})


# Helper: return HTTP 200 success response / 헬퍼: HTTP 200 성공 응답 반환
def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}
