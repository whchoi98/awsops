#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 6c: AgentCore Gateway Tools & MCP Setup                               #
#                                                                              #
#   Creates:                                                                   #
#     1. IAM Role for Lambda (network permissions)                             #
#     2. Lambda functions (6: reachability, flow-monitor, network-mcp,         #
#        steampipe-query, aws-knowledge, core-mcp)                             #
#     3. Gateway Targets (6) linking Lambda to Gateway via MCP                 #
#                                                                              #
#   Known issues handled:                                                      #
#     - Gateway toolSchema uses inlinePayload (not OpenAPI)                   #
#     - CLI has issues with inlinePayload -> using Python/boto3               #
#     - targetConfiguration must use mcp.lambda (not lambdaTargetConfig)      #
#     - credentialProviderConfigurations is required                           #
#     - microVM cannot access localhost -> Lambda for Steampipe               #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 6c: AgentCore Gateway Tools & MCP Setup${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo "  Region:  $REGION"
echo "  Account: $ACCOUNT_ID"
echo ""

# -- [1/3] Create Lambda IAM Role ---------------------------------------------
echo -e "${CYAN}[1/3] Creating Lambda Network IAM role...${NC}"

aws iam create-role --role-name AWSopsLambdaNetworkRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}
        ]
    }' 2>/dev/null || true

aws iam attach-role-policy --role-name AWSopsLambdaNetworkRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
aws iam attach-role-policy --role-name AWSopsLambdaNetworkRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonVPCFullAccess 2>/dev/null || true

aws iam put-role-policy --role-name AWSopsLambdaNetworkRole --policy-name FullNetwork \
    --policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["ec2:*", "tiros:*", "logs:*", "network-firewall:*", "networkmanager:*"],
            "Resource": "*"
        }]
    }' 2>/dev/null

echo "  AWSopsLambdaNetworkRole: created"
echo "  Waiting for IAM propagation (10s)..."
sleep 10

LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/AWSopsLambdaNetworkRole"

# -- [2/3] Create Lambda Functions (inline Python) ----------------------------
echo ""
echo -e "${CYAN}[2/3] Creating Lambda functions (4)...${NC}"

# --- reachability.py ---
cat > /tmp/reachability.py << 'LAMBDAEOF'
import boto3, json

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    params = event if isinstance(event, dict) else json.loads(event)
    source = params['source']
    destination = params['destination']
    protocol = params.get('protocol', 'tcp')
    port = params.get('port', 443)

    path_resp = ec2.create_network_insights_path(
        Source=source, Destination=destination,
        Protocol=protocol, DestinationPort=int(port),
        TagSpecifications=[{'ResourceType': 'network-insights-path',
            'Tags': [{'Key': 'CreatedBy', 'Value': 'awsops'}]}]
    )
    path_id = path_resp['NetworkInsightsPath']['NetworkInsightsPathId']
    analysis_resp = ec2.start_network_insights_analysis(NetworkInsightsPathId=path_id)
    analysis_id = analysis_resp['NetworkInsightsAnalysis']['NetworkInsightsAnalysisId']
    return {'statusCode': 200, 'body': json.dumps({
        'pathId': path_id, 'analysisId': analysis_id,
        'status': analysis_resp['NetworkInsightsAnalysis']['Status']})}
LAMBDAEOF

# --- flowmonitor.py ---
cat > /tmp/flowmonitor.py << 'LAMBDAEOF'
import boto3, json

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    params = event if isinstance(event, dict) else json.loads(event)
    vpc_id = params['vpc_id']
    resp = ec2.describe_flow_logs(Filters=[{'Name': 'resource-id', 'Values': [vpc_id]}])
    flow_logs = [{'FlowLogId': fl.get('FlowLogId'), 'ResourceId': fl.get('ResourceId'),
        'TrafficType': fl.get('TrafficType'), 'LogStatus': fl.get('LogStatus'),
        'LogDestination': fl.get('LogDestination')} for fl in resp.get('FlowLogs', [])]
    return {'statusCode': 200, 'body': json.dumps({
        'vpcId': vpc_id, 'flowLogs': flow_logs, 'count': len(flow_logs)})}
LAMBDAEOF

# --- network_mcp.py ---
cat > /tmp/network_mcp.py << 'LAMBDAEOF'
import boto3, json

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    params = event if isinstance(event, dict) else json.loads(event)
    rt = params['resource_type']
    rid = params.get('resource_id')
    vpc = params.get('vpc_id')

    handlers = {
        'security_group': lambda: ec2.describe_security_groups(
            Filters=([{'Name':'group-id','Values':[rid]}] if rid else [{'Name':'vpc-id','Values':[vpc]}] if vpc else [])),
        'nacl': lambda: ec2.describe_network_acls(
            Filters=([{'Name':'network-acl-id','Values':[rid]}] if rid else [{'Name':'vpc-id','Values':[vpc]}] if vpc else [])),
        'route_table': lambda: ec2.describe_route_tables(
            Filters=([{'Name':'route-table-id','Values':[rid]}] if rid else [{'Name':'vpc-id','Values':[vpc]}] if vpc else [])),
        'subnet': lambda: ec2.describe_subnets(
            Filters=([{'Name':'subnet-id','Values':[rid]}] if rid else [{'Name':'vpc-id','Values':[vpc]}] if vpc else [])),
        'vpc': lambda: ec2.describe_vpcs(VpcIds=[rid] if rid else []),
    }
    if rt not in handlers:
        return {'statusCode': 400, 'body': json.dumps({'error': 'Unknown type: ' + rt})}
    resp = handlers[rt]()
    resp.pop('ResponseMetadata', None)
    return {'statusCode': 200, 'body': json.dumps(resp, default=str)}
LAMBDAEOF

# --- steampipe_query.py (VPC Lambda → real Steampipe SQL via pg8000) ---
#   This Lambda runs inside the VPC and connects to EC2 Steampipe PostgreSQL.
#   Uses pg8000 (pure Python) instead of psycopg2 (requires native binary).
#   EC2 Steampipe must listen on network: steampipe service start --database-listen network
mkdir -p /tmp/steampipe-lambda-pkg && cd /tmp/steampipe-lambda-pkg && rm -rf *
pip3 install pg8000 -t . --quiet 2>&1 | tail -3 || true

cat > steampipe_query.py << 'LAMBDAEOF'
import json, os, pg8000

DB_CONFIG = {
    "host": os.environ.get("STEAMPIPE_HOST", "10.254.2.254"),
    "port": int(os.environ.get("STEAMPIPE_PORT", "9193")),
    "database": "steampipe",
    "user": "steampipe",
    "password": os.environ.get("STEAMPIPE_PASSWORD", ""),
    "timeout": 30,
}

def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    sql = params.get("sql", "").strip()
    if not sql:
        return {"statusCode": 400, "body": json.dumps({"error": "sql parameter required"})}
    # Security: block write operations
    for kw in ["drop", "delete", "update", "insert", "alter", "create", "truncate"]:
        if kw in sql.lower().split():
            return {"statusCode": 400, "body": json.dumps({"error": "Only SELECT queries allowed"})}
    try:
        conn = pg8000.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute(sql)
        columns = [desc[0] for desc in cur.description] if cur.description else []
        rows = cur.fetchmany(100)
        results = [dict(zip(columns, [str(v) if v is not None else None for v in row])) for row in rows]
        cur.close()
        conn.close()
        return {"statusCode": 200, "body": json.dumps({"columns": columns, "rows": results, "rowCount": len(results), "sql": sql})}
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
LAMBDAEOF

zip -r /tmp/steampipe_query.zip . -x "*.pyc" "__pycache__/*" 2>/dev/null

# Deploy 3 standard Lambda functions (reachability, flowmonitor, network_mcp)
declare -A FUNC_MAP=(
    ["awsops-reachability-analyzer"]="reachability"
    ["awsops-flow-monitor"]="flowmonitor"
    ["awsops-network-mcp"]="network_mcp"
)

for FUNC_NAME in "${!FUNC_MAP[@]}"; do
    HANDLER="${FUNC_MAP[$FUNC_NAME]}"
    cd /tmp && zip -j "${HANDLER}.zip" "${HANDLER}.py" 2>/dev/null

    aws lambda create-function \
        --function-name "$FUNC_NAME" --runtime python3.12 \
        --handler "${HANDLER}.lambda_handler" \
        --role "$LAMBDA_ROLE_ARN" --zip-file "fileb:///tmp/${HANDLER}.zip" \
        --timeout 120 --memory-size 256 \
        --region "$REGION" 2>/dev/null || \
    aws lambda update-function-code \
        --function-name "$FUNC_NAME" --zip-file "fileb:///tmp/${HANDLER}.zip" \
        --region "$REGION" 2>/dev/null

    aws lambda add-permission --function-name "$FUNC_NAME" \
        --statement-id agentcore-invoke --action lambda:InvokeFunction \
        --principal bedrock-agentcore.amazonaws.com \
        --region "$REGION" 2>/dev/null || true

    echo "  Lambda: $FUNC_NAME"
done

# Deploy steampipe-query Lambda (VPC + pg8000 package)
#   This Lambda runs inside the VPC to connect to EC2 Steampipe PostgreSQL.
#   Requires: VPC subnets, security group, Steampipe network listen mode.
echo ""
echo -e "  ${YELLOW}NOTE: steampipe-query deploys into VPC (connects to EC2 Steampipe :9193)${NC}"

# Auto-detect EC2 private IP, VPC, subnets
EC2_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=*AWSops*" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].PrivateIpAddress" --output text --region "$REGION" 2>/dev/null || echo "")
EC2_VPC=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=*AWSops*" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].VpcId" --output text --region "$REGION" 2>/dev/null || echo "")
EC2_SG=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=*AWSops*" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "")
PRIVATE_SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$EC2_VPC" "Name=tag:Name,Values=*Private*" \
    --query "Subnets[*].SubnetId" --output text --region "$REGION" 2>/dev/null | tr '\t' ',')
SP_PASS=$(steampipe service status --show-password 2>/dev/null | grep Password | awk '{print $2}')

echo "  EC2 IP: $EC2_IP | VPC: $EC2_VPC | Subnets: $PRIVATE_SUBNETS"

# Create Lambda security group for Steampipe access
LAMBDA_SG=$(aws ec2 create-security-group \
    --group-name awsops-lambda-steampipe-sg \
    --description "Lambda SG for Steampipe query access to EC2:9193" \
    --vpc-id "$EC2_VPC" --region "$REGION" \
    --query "GroupId" --output text 2>/dev/null || \
    aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=awsops-lambda-steampipe-sg" "Name=vpc-id,Values=$EC2_VPC" \
    --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)
echo "  Lambda SG: $LAMBDA_SG"

# Allow Lambda SG → EC2 SG on port 9193
aws ec2 authorize-security-group-ingress \
    --group-id "$EC2_SG" --protocol tcp --port 9193 \
    --source-group "$LAMBDA_SG" --region "$REGION" 2>/dev/null || true

# Ensure Steampipe listens on network (not just localhost)
steampipe service stop 2>/dev/null || true
sleep 2
steampipe service start --database-listen network --database-port 9193 2>/dev/null

# Add VPC execution role
aws iam attach-role-policy --role-name AWSopsLambdaNetworkRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole 2>/dev/null || true

# Deploy steampipe-query with VPC config
aws lambda create-function \
    --function-name awsops-steampipe-query --runtime python3.12 \
    --handler "steampipe_query.lambda_handler" \
    --role "$LAMBDA_ROLE_ARN" --zip-file "fileb:///tmp/steampipe_query.zip" \
    --timeout 60 --memory-size 256 \
    --vpc-config "SubnetIds=$PRIVATE_SUBNETS,SecurityGroupIds=$LAMBDA_SG" \
    --environment "Variables={STEAMPIPE_HOST=$EC2_IP,STEAMPIPE_PORT=9193,STEAMPIPE_PASSWORD=$SP_PASS}" \
    --region "$REGION" 2>/dev/null || \
aws lambda update-function-code \
    --function-name awsops-steampipe-query --zip-file "fileb:///tmp/steampipe_query.zip" \
    --region "$REGION" 2>/dev/null

# Update VPC config if function already existed
sleep 5
aws lambda update-function-configuration \
    --function-name awsops-steampipe-query \
    --vpc-config "SubnetIds=$PRIVATE_SUBNETS,SecurityGroupIds=$LAMBDA_SG" \
    --environment "Variables={STEAMPIPE_HOST=$EC2_IP,STEAMPIPE_PORT=9193,STEAMPIPE_PASSWORD=$SP_PASS}" \
    --timeout 60 --memory-size 256 \
    --region "$REGION" 2>/dev/null || true

aws lambda add-permission --function-name awsops-steampipe-query \
    --statement-id agentcore-invoke --action lambda:InvokeFunction \
    --principal bedrock-agentcore.amazonaws.com \
    --region "$REGION" 2>/dev/null || true

echo "  Lambda: awsops-steampipe-query (VPC, pg8000 → Steampipe :9193)"

# Deploy aws-knowledge Lambda (proxy to remote AWS Knowledge MCP server)
echo ""
echo -e "  ${YELLOW}NOTE: aws-knowledge proxies to https://knowledge-mcp.global.api.aws${NC}"

cat > /tmp/aws_knowledge.py << 'LAMBDAEOF'
import json, urllib.request

MCP_URL = "https://knowledge-mcp.global.api.aws"
TOOL_MAP = {
    "search_documentation": "aws___search_documentation",
    "read_documentation": "aws___read_documentation",
    "recommend": "aws___recommend",
    "list_regions": "aws___list_regions",
    "get_regional_availability": "aws___get_regional_availability",
}

def call_mcp_tool(tool_name, arguments):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments}}).encode()
    req = urllib.request.Request(MCP_URL, data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    content = data.get("result", {}).get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    return "\n".join(texts) if texts else json.dumps(data.get("result", {}))

def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    tool_name = params.get("tool_name", "")
    arguments = params.get("arguments", params)
    if not tool_name:
        if "search_phrase" in params: tool_name = "search_documentation"
        elif "url" in params and "max_length" in params: tool_name = "read_documentation"
        elif "url" in params: tool_name = "recommend"
        elif "resource_type" in params: tool_name = "get_regional_availability"
        else: tool_name = "list_regions"
        arguments = params
    mcp_tool = TOOL_MAP.get(tool_name, "")
    if not mcp_tool:
        return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + tool_name})}
    try:
        result = call_mcp_tool(mcp_tool, arguments)
        return {"statusCode": 200, "body": result[:50000]}
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
LAMBDAEOF

cd /tmp && zip -j aws_knowledge.zip aws_knowledge.py 2>/dev/null
aws lambda create-function \
    --function-name awsops-aws-knowledge --runtime python3.12 \
    --handler "aws_knowledge.lambda_handler" \
    --role "$LAMBDA_ROLE_ARN" --zip-file "fileb:///tmp/aws_knowledge.zip" \
    --timeout 30 --memory-size 256 \
    --region "$REGION" 2>/dev/null || \
aws lambda update-function-code \
    --function-name awsops-aws-knowledge --zip-file "fileb:///tmp/aws_knowledge.zip" \
    --region "$REGION" 2>/dev/null

aws lambda add-permission --function-name awsops-aws-knowledge \
    --statement-id agentcore-invoke --action lambda:InvokeFunction \
    --principal bedrock-agentcore.amazonaws.com \
    --region "$REGION" 2>/dev/null || true

echo "  Lambda: awsops-aws-knowledge (proxy → AWS Knowledge MCP)"

# Deploy core-mcp Lambda (prompt_understanding + call_aws + suggest_aws_commands)
echo ""
echo -e "  ${YELLOW}NOTE: core-mcp provides AWS API execution and solution design guidance${NC}"

cat > /tmp/aws_core_mcp.py << 'LAMBDAEOF'
import json, boto3, shlex

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
- Pay-per-use pricing, built-in security, Multi-AZ HA, IaC (CDK preferred)
"""

def call_aws(cli_command, max_results=None):
    parts = shlex.split(cli_command)
    if len(parts) < 3 or parts[0] != "aws":
        return {"error": "Command must start with 'aws <service> <action>'"}
    service, action = parts[1], parts[2].replace("-", "_")
    kwargs = {}
    i = 3
    while i < len(parts):
        if parts[i].startswith("--"):
            key = parts[i][2:].replace("-", "_")
            if i+1 < len(parts) and not parts[i+1].startswith("--"):
                val = parts[i+1]
                try: val = json.loads(val)
                except: pass
                kwargs[key] = val; i += 2
            else: kwargs[key] = True; i += 1
        else: i += 1
    if max_results: kwargs.setdefault("MaxResults", max_results)
    try:
        resp = getattr(boto3.client(service), action)(**kwargs)
        resp.pop("ResponseMetadata", None)
        return resp
    except Exception as e: return {"error": str(e)}

def suggest_aws_commands(query):
    q = query.lower()
    patterns = [("ec2","instance","aws ec2 describe-instances"),("s3","bucket","aws s3api list-buckets"),
        ("vpc","","aws ec2 describe-vpcs"),("subnet","","aws ec2 describe-subnets"),
        ("security group","","aws ec2 describe-security-groups"),("lambda","function","aws lambda list-functions"),
        ("iam","role","aws iam list-roles"),("iam","user","aws iam list-users"),
        ("rds","","aws rds describe-db-instances"),("ecs","cluster","aws ecs list-clusters"),
        ("cloudwatch","alarm","aws cloudwatch describe-alarms"),("cost","","aws ce get-cost-and-usage")]
    return [cmd for svc,kw,cmd in patterns if svc in q or (kw and kw in q)][:10] or ["aws ec2 describe-instances","aws s3api list-buckets","aws iam list-roles"]

def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    tool_name = params.get("tool_name", "")
    args = params.get("arguments", params)
    if not tool_name:
        if "cli_command" in params: tool_name = "call_aws"
        elif "query" in params: tool_name = "suggest_aws_commands"
        else: tool_name = "prompt_understanding"
        args = params
    if tool_name == "prompt_understanding":
        return {"statusCode": 200, "body": PROMPT_UNDERSTANDING}
    elif tool_name == "call_aws":
        cmd = args.get("cli_command", "")
        r = [call_aws(c, args.get("max_results")) for c in cmd[:5]] if isinstance(cmd, list) else call_aws(cmd, args.get("max_results"))
        return {"statusCode": 200, "body": json.dumps(r, default=str)[:50000]}
    elif tool_name == "suggest_aws_commands":
        return {"statusCode": 200, "body": json.dumps({"suggestions": suggest_aws_commands(args.get("query",""))})}
    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + tool_name})}
LAMBDAEOF

cd /tmp && zip -j aws_core_mcp.zip aws_core_mcp.py 2>/dev/null
aws lambda create-function \
    --function-name awsops-core-mcp --runtime python3.12 \
    --handler "aws_core_mcp.lambda_handler" \
    --role "$LAMBDA_ROLE_ARN" --zip-file "fileb:///tmp/aws_core_mcp.zip" \
    --timeout 60 --memory-size 256 \
    --region "$REGION" 2>/dev/null || \
aws lambda update-function-code \
    --function-name awsops-core-mcp --zip-file "fileb:///tmp/aws_core_mcp.zip" \
    --region "$REGION" 2>/dev/null

aws lambda add-permission --function-name awsops-core-mcp \
    --statement-id agentcore-invoke --action lambda:InvokeFunction \
    --principal bedrock-agentcore.amazonaws.com \
    --region "$REGION" 2>/dev/null || true

echo "  Lambda: awsops-core-mcp (prompt_understanding + call_aws + suggest)"

# -- [3/3] Create Gateway Targets (via Python/boto3) --------------------------
#   KNOWN ISSUE: AWS CLI has issues with inlinePayload JSON format.
#   Using Python/boto3 with correct mcp.lambda structure.
echo ""
echo -e "${CYAN}[3/3] Creating Gateway targets (6) via boto3...${NC}"
echo -e "  ${YELLOW}NOTE: Using Python/boto3 (CLI has issues with inlinePayload)${NC}"

# Auto-detect Gateway ID
GW_ID=$(aws bedrock-agentcore-control list-gateways \
    --region "$REGION" --output json 2>/dev/null | \
    python3 -c "import json,sys;gws=json.load(sys.stdin).get('items',[]); print(next((g['gatewayId'] for g in gws if 'awsops' in g.get('name','')), ''))" 2>/dev/null || echo "")

if [ -z "$GW_ID" ] || [ "$GW_ID" = "" ]; then
    echo -e "${RED}ERROR: Gateway not found. Run 06b first.${NC}"
    exit 1
fi
echo "  Gateway: $GW_ID"

python3 << PYEOF
import boto3

client = boto3.client('bedrock-agentcore-control', region_name='${REGION}')
gw_id = '${GW_ID}'
account_id = '${ACCOUNT_ID}'
region = '${REGION}'

def prop(t, d=''):
    r = {'type': t}
    if d:
        r['description'] = d
    return r

targets = [
    ('reachability-target', 'awsops-reachability-analyzer',
     'VPC Reachability Analyzer - checks network paths between resources',
     [{'name': 'analyze_reachability',
       'description': 'Analyze network reachability between two AWS resources',
       'inputSchema': {'type': 'object', 'properties': {
           'source': prop('string', 'Source resource ID (i-xxx, eni-xxx)'),
           'destination': prop('string', 'Destination resource ID or IP'),
           'protocol': prop('string', 'Protocol tcp/udp'),
           'port': prop('integer', 'Destination port number')},
        'required': ['source', 'destination']}}]),
    ('flow-monitor-target', 'awsops-flow-monitor',
     'VPC Flow Log analyzer - queries network traffic',
     [{'name': 'query_flow_logs',
       'description': 'Query VPC flow logs for traffic analysis',
       'inputSchema': {'type': 'object', 'properties': {
           'vpc_id': prop('string', 'VPC ID to analyze'),
           'action': prop('string', 'Filter ACCEPT/REJECT/all'),
           'minutes': prop('integer', 'Lookback minutes')},
        'required': ['vpc_id']}}]),
    ('network-mcp-target', 'awsops-network-mcp',
     'Network config MCP - security groups, NACLs, route tables',
     [{'name': 'describe_network',
       'description': 'Describe network configuration for VPC resources',
       'inputSchema': {'type': 'object', 'properties': {
           'resource_type': prop('string', 'security_group/nacl/route_table/subnet/vpc'),
           'resource_id': prop('string', 'Resource ID to describe'),
           'vpc_id': prop('string', 'VPC ID for listing')},
        'required': ['resource_type']}}]),
    ('steampipe-query-target', 'awsops-steampipe-query',
     'AWS resource SQL query executor',
     [{'name': 'run_steampipe_query',
       'description': 'Execute SQL query against AWS resources',
       'inputSchema': {'type': 'object', 'properties': {
           'sql': prop('string', 'SQL query to execute')},
        'required': ['sql']}}]),
    ('aws-knowledge-target', 'awsops-aws-knowledge',
     'AWS Knowledge MCP - documentation search, regional availability, recommendations',
     [{'name': 'search_documentation',
       'description': 'Search AWS documentation. Primary source for AWS service info.',
       'inputSchema': {'type': 'object', 'properties': {
           'search_phrase': prop('string', 'Search phrase for AWS docs'),
           'limit': prop('integer', 'Max results to return')},
        'required': ['search_phrase']}},
      {'name': 'read_documentation',
       'description': 'Fetch and convert an AWS documentation page to markdown.',
       'inputSchema': {'type': 'object', 'properties': {
           'url': prop('string', 'URL of AWS documentation page'),
           'max_length': prop('integer', 'Max characters to return')},
        'required': ['url']}},
      {'name': 'recommend',
       'description': 'Get content recommendations for an AWS documentation page.',
       'inputSchema': {'type': 'object', 'properties': {
           'url': prop('string', 'URL of AWS documentation page')},
        'required': ['url']}},
      {'name': 'list_regions',
       'description': 'List all AWS regions with identifiers and names.',
       'inputSchema': {'type': 'object', 'properties': {}}},
      {'name': 'get_regional_availability',
       'description': 'Check AWS regional availability for products, APIs, or CloudFormation.',
       'inputSchema': {'type': 'object', 'properties': {
           'resource_type': prop('string', 'product, api, or cfn'),
           'region': prop('string', 'AWS region code')},
        'required': ['resource_type']}}]),
    ('core-mcp-target', 'awsops-core-mcp',
     'AWS Core MCP - prompt understanding, AWS API execution, CLI suggestions',
     [{'name': 'prompt_understanding',
       'description': 'AWS solution design guide. Use FIRST for expert architecture advice.',
       'inputSchema': {'type': 'object', 'properties': {}}},
      {'name': 'call_aws',
       'description': 'Execute AWS CLI commands via boto3. PRIMARY tool for AWS API calls.',
       'inputSchema': {'type': 'object', 'properties': {
           'cli_command': prop('string', 'AWS CLI command e.g. aws ec2 describe-instances'),
           'max_results': prop('integer', 'Limit pagination results')},
        'required': ['cli_command']}},
      {'name': 'suggest_aws_commands',
       'description': 'Suggest AWS CLI commands from natural language. FALLBACK when unsure.',
       'inputSchema': {'type': 'object', 'properties': {
           'query': prop('string', 'Natural language description of desired operation')},
        'required': ['query']}}]),
]

for name, fn, desc, tools in targets:
    arn = 'arn:aws:lambda:{}:{}:function:{}'.format(region, account_id, fn)
    try:
        resp = client.create_gateway_target(
            gatewayIdentifier=gw_id,
            name=name,
            description=desc,
            targetConfiguration={
                'mcp': {
                    'lambda': {
                        'lambdaArn': arn,
                        'toolSchema': {
                            'inlinePayload': tools
                        }
                    }
                }
            },
            credentialProviderConfigurations=[
                {'credentialProviderType': 'GATEWAY_IAM_ROLE'}
            ]
        )
        tid = resp.get('targetId', 'OK')
        print('  Target: {} -> {}'.format(name, tid))
    except Exception as e:
        print('  WARN: {} -> {}'.format(name, str(e)[:200]))
PYEOF

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 6c Complete: Gateway Tools & MCP configured${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Gateway ID:  $GW_ID"
echo ""
echo "  Lambda Functions:"
echo "    - awsops-reachability-analyzer"
echo "    - awsops-flow-monitor"
echo "    - awsops-network-mcp"
echo "    - awsops-steampipe-query     (VPC, pg8000 → Steampipe :9193)"
echo "    - awsops-aws-knowledge       (proxy → AWS Knowledge MCP)"
echo "    - awsops-core-mcp            (prompt + call_aws + suggest)"
echo ""
echo "  Gateway Targets: 6 (via boto3 with mcp.lambda + inlinePayload)"
echo ""
echo "  Next: bash scripts/06d-setup-agentcore-interpreter.sh"
echo ""
