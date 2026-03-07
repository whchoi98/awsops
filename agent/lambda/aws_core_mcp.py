"""AWS Core MCP Lambda - prompt_understanding + call_aws + suggest_aws_commands"""
import json
import boto3
import shlex


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


def call_aws(cli_command, max_results=None):
    """Execute an AWS CLI-style command via boto3."""
    parts = shlex.split(cli_command)
    if len(parts) < 3 or parts[0] != "aws":
        return {"error": "Command must start with 'aws <service> <action>'"}

    service = parts[1]
    action = parts[2].replace("-", "_")

    # Parse --key value pairs
    kwargs = {}
    i = 3
    while i < len(parts):
        if parts[i].startswith("--"):
            key = parts[i][2:].replace("-", "_")
            if i + 1 < len(parts) and not parts[i + 1].startswith("--"):
                val = parts[i + 1]
                # Try to parse as JSON
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
        client = boto3.client(service)
        method = getattr(client, action)
        response = method(**kwargs)
        response.pop("ResponseMetadata", None)
        return response
    except Exception as e:
        return {"error": str(e)}


def suggest_aws_commands(query):
    """Suggest AWS CLI commands based on natural language query."""
    suggestions = []

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

    if not suggestions:
        suggestions = [
            "aws ec2 describe-instances",
            "aws s3api list-buckets",
            "aws iam list-roles",
        ]

    return suggestions[:10]


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    tool_name = params.get("tool_name", "")
    arguments = params.get("arguments", params)

    # Infer tool from parameters
    if not tool_name:
        if "cli_command" in params:
            tool_name = "call_aws"
            arguments = params
        elif "query" in params:
            tool_name = "suggest_aws_commands"
            arguments = params
        else:
            tool_name = "prompt_understanding"

    if tool_name == "prompt_understanding":
        return {"statusCode": 200, "body": PROMPT_UNDERSTANDING}

    elif tool_name == "call_aws":
        cli_cmd = arguments.get("cli_command", "")
        max_res = arguments.get("max_results")
        if isinstance(cli_cmd, list):
            results = [call_aws(c, max_res) for c in cli_cmd[:5]]
            return {"statusCode": 200, "body": json.dumps(results, default=str)[:50000]}
        result = call_aws(cli_cmd, max_res)
        return {"statusCode": 200, "body": json.dumps(result, default=str)[:50000]}

    elif tool_name == "suggest_aws_commands":
        query = arguments.get("query", "")
        suggestions = suggest_aws_commands(query)
        return {"statusCode": 200, "body": json.dumps({"suggestions": suggestions, "query": query})}

    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + tool_name})}
