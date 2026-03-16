"""
AWS Core MCP Lambda - prompt_understanding + call_aws + suggest_aws_commands
프롬프트 이해, AWS CLI 실행, AWS CLI 명령어 추천을 위한 AWS Core MCP 람다
"""
import json
import boto3
import shlex
from cross_account import get_client


PROMPT_UNDERSTANDING = """# AWS Solution Design Guide

## Analysis Framework
1. Decompose query into: technical requirements, business objectives, constraints
2. Map requirements to AWS services
3. Synthesize recommendations using serverless-first architecture

## Service Mapping
- Compute: Lambda, ECS/EKS, EC2, App Runner
- Storage: DynamoDB, Aurora, S3, ElastiCache, Neptune
- AI/ML: Bedrock, SageMaker
- Data: Redshift, Athena, Glue, Kinesis
- Frontend: Amplify, CloudFront, AppSync, API Gateway
- Security: Cognito, IAM, KMS, WAF
- DevOps: CDK, CloudFormation, CodePipeline
- Monitoring: CloudWatch, X-Ray, CloudTrail

## Design Principles
- Serverless-first with managed services
- Pay-per-use pricing models
- Built-in security (encryption at rest/transit, least privilege)
- Multi-AZ for high availability
- Infrastructure as Code (CDK preferred)

## Available MCP Tools
- search_documentation: Search AWS docs
- read_documentation: Read specific doc page
- list_regions / get_regional_availability: Region info
- analyze_reachability: Network path analysis
- query_flow_logs: VPC flow log analysis
- describe_network: SG, NACL, route tables
- run_steampipe_query: SQL against 580+ AWS tables
- call_aws: Execute AWS CLI commands via boto3
- suggest_aws_commands: Get CLI command suggestions
"""


def call_aws(cli_command, max_results=None, role_arn=None):
    """Execute an AWS CLI-style command via boto3. / boto3를 통해 AWS CLI 스타일 명령어를 실행합니다."""
    # Parse CLI command into parts / CLI 명령어를 부분으로 분리
    parts = shlex.split(cli_command)
    if len(parts) < 3 or parts[0] != "aws":
        return {"error": "Command must start with 'aws <service> <action>'"}

    service = parts[1]
    action = parts[2].replace("-", "_")

    # Parse --key value pairs into kwargs / --key value 쌍을 kwargs로 파싱
    kwargs = {}
    i = 3
    while i < len(parts):
        if parts[i].startswith("--"):
            key = parts[i][2:].replace("-", "_")
            if i + 1 < len(parts) and not parts[i + 1].startswith("--"):
                val = parts[i + 1]
                # Try to parse as JSON for complex values / 복합 값을 위해 JSON 파싱 시도
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, ValueError):
                    pass
                kwargs[key] = val
                i += 2
            else:
                kwargs[key] = True
                i += 1
        else:
            i += 1

    if max_results and "MaxResults" not in kwargs and "max_results" not in kwargs:
        kwargs["MaxResults"] = max_results

    try:
        # Create boto3 client and invoke the API method / boto3 클라이언트 생성 후 API 메서드 호출
        client = get_client(service, 'ap-northeast-2', role_arn)
        method = getattr(client, action)
        response = method(**kwargs)
        response.pop("ResponseMetadata", None)
        return response
    except Exception as e:
        # Return error if AWS API call fails / AWS API 호출 실패 시 오류 반환
        return {"error": str(e)}


def suggest_aws_commands(query):
    """Suggest AWS CLI commands based on natural language query. / 자연어 쿼리를 기반으로 AWS CLI 명령어를 추천합니다."""
    suggestions = []

    # Match query against known service/keyword patterns / 쿼리를 알려진 서비스/키워드 패턴과 매칭
    q = query.lower()
    patterns = [
        ("ec2", "instance", "aws ec2 describe-instances"),
        ("ec2", "start", "aws ec2 start-instances --instance-ids <id>"),
        ("ec2", "stop", "aws ec2 stop-instances --instance-ids <id>"),
        ("s3", "bucket", "aws s3api list-buckets"),
        ("s3", "object", "aws s3api list-objects-v2 --bucket <name>"),
        ("vpc", "", "aws ec2 describe-vpcs"),
        ("subnet", "", "aws ec2 describe-subnets"),
        ("security group", "", "aws ec2 describe-security-groups"),
        ("lambda", "function", "aws lambda list-functions"),
        ("lambda", "invoke", "aws lambda invoke --function-name <name> /tmp/out.json"),
        ("iam", "role", "aws iam list-roles"),
        ("iam", "user", "aws iam list-users"),
        ("iam", "policy", "aws iam list-policies --scope Local"),
        ("rds", "instance", "aws rds describe-db-instances"),
        ("ecs", "cluster", "aws ecs list-clusters"),
        ("ecs", "service", "aws ecs list-services --cluster <name>"),
        ("cloudformation", "stack", "aws cloudformation list-stacks"),
        ("cloudwatch", "alarm", "aws cloudwatch describe-alarms"),
        ("cloudwatch", "metric", "aws cloudwatch list-metrics"),
        ("cloudtrail", "event", "aws cloudtrail lookup-events"),
        ("route table", "", "aws ec2 describe-route-tables"),
        ("nat gateway", "", "aws ec2 describe-nat-gateways"),
        ("elb", "load balancer", "aws elbv2 describe-load-balancers"),
        ("target group", "", "aws elbv2 describe-target-groups"),
        ("cost", "", "aws ce get-cost-and-usage --time-period Start=2024-01-01,End=2024-02-01 --granularity MONTHLY --metrics BlendedCost"),
    ]

    for svc, kw, cmd in patterns:
        if svc in q or (kw and kw in q):
            suggestions.append(cmd)

    # Return default suggestions if no pattern matched / 패턴이 매칭되지 않으면 기본 추천 반환
    if not suggestions:
        suggestions = [
            "aws ec2 describe-instances",
            "aws s3api list-buckets",
            "aws iam list-roles",
        ]

    return suggestions[:10]


def lambda_handler(event, context):
    """Lambda entry point for Core MCP tools. / Core MCP 도구의 람다 진입점."""
    params = event if isinstance(event, dict) else json.loads(event)
    tool_name = params.get("tool_name", "")
    arguments = params.get("arguments", params)
    target_account_id = arguments.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Infer tool from parameters if not specified / 도구명이 없으면 파라미터로 추론
    if not tool_name:
        if "cli_command" in params:
            tool_name = "call_aws"
            arguments = params
        elif "query" in params:
            tool_name = "suggest_aws_commands"
            arguments = params
        else:
            tool_name = "prompt_understanding"

    # Tool handler: return solution design guide / 도구 핸들러: 솔루션 설계 가이드 반환
    if tool_name == "prompt_understanding":
        return {"statusCode": 200, "body": PROMPT_UNDERSTANDING}

    # Tool handler: execute AWS CLI command via boto3 / 도구 핸들러: boto3를 통해 AWS CLI 명령어 실행
    elif tool_name == "call_aws":
        cli_cmd = arguments.get("cli_command", "")
        max_res = arguments.get("max_results")
        # Support batch execution of up to 5 commands / 최대 5개 명령어 일괄 실행 지원
        if isinstance(cli_cmd, list):
            results = [call_aws(c, max_res, role_arn) for c in cli_cmd[:5]]
            return {"statusCode": 200, "body": json.dumps(results, default=str)[:50000]}
        result = call_aws(cli_cmd, max_res, role_arn)
        return {"statusCode": 200, "body": json.dumps(result, default=str)[:50000]}

    # Tool handler: suggest AWS CLI commands / 도구 핸들러: AWS CLI 명령어 추천
    elif tool_name == "suggest_aws_commands":
        query = arguments.get("query", "")
        suggestions = suggest_aws_commands(query)
        return {"statusCode": 200, "body": json.dumps({"suggestions": suggestions, "query": query})}

    # Unknown tool error / 알 수 없는 도구 오류
    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + tool_name})}
