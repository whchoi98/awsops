#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 6: AgentCore Runtime + Gateway Setup                                  #
#                                                                              #
#   Creates:                                                                   #
#     1. IAM Roles (AgentCore + Lambda Network)                                #
#     2. ECR Repository                                                        #
#     3. ARM64 Docker image (docker buildx)                                    #
#     4. AgentCore Gateway (MCP, NONE auth)                                    #
#     5. Lambda functions (4: reachability, flow-monitor, network-mcp,         #
#        steampipe-query)                                                      #
#     6. Gateway targets (4) with inlinePayload tool schemas (via boto3)       #
#     7. AgentCore Runtime (Strands agent)                                     #
#     8. Runtime Endpoint                                                      #
#     9. Code Interpreter                                                      #
#                                                                              #
#   Known issues handled:                                                      #
#     - Docker image must be arm64 (docker buildx --platform linux/arm64)     #
#     - Gateway toolSchema uses inlinePayload (array format, not OpenAPI)     #
#     - CLI has issues with inlinePayload -> using Python/boto3 instead       #
#     - microVM cannot access localhost -> Lambda in VPC for Steampipe        #
#     - SDK v3: use response.transformToString() (not read())                 #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 6: AgentCore Runtime + Gateway Setup${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo "  Region:  $REGION"
echo "  Account: $ACCOUNT_ID"
echo ""

# -- [1/9] Create IAM Roles ---------------------------------------------------
echo -e "${CYAN}[1/9] Creating IAM roles...${NC}"

# AgentCore Role (Bedrock + AgentCore services)
aws iam create-role --role-name AWSopsAgentCoreRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "bedrock.amazonaws.com"}, "Action": "sts:AssumeRole"},
            {"Effect": "Allow", "Principal": {"Service": "bedrock-agentcore.amazonaws.com"}, "Action": "sts:AssumeRole"}
        ]
    }' 2>/dev/null || true

aws iam attach-role-policy --role-name AWSopsAgentCoreRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess 2>/dev/null || true

aws iam put-role-policy --role-name AWSopsAgentCoreRole --policy-name ECRAndLambda \
    --policy-document "{
        \"Version\": \"2012-10-17\",
        \"Statement\": [{
            \"Effect\": \"Allow\",
            \"Action\": [\"ecr:*\", \"lambda:InvokeFunction\", \"lambda:GetFunction\"],
            \"Resource\": \"*\"
        }]
    }" 2>/dev/null

# Lambda Network Role (for VPC-based Lambda functions)
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

echo "  AWSopsAgentCoreRole:     created"
echo "  AWSopsLambdaNetworkRole: created"
echo "  Waiting for IAM propagation (10s)..."
sleep 10

# -- [2/9] Create ECR Repository ----------------------------------------------
echo ""
echo -e "${CYAN}[2/9] Creating ECR repository...${NC}"
aws ecr create-repository --repository-name awsops-agent --region "$REGION" 2>/dev/null || true
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/awsops-agent"
echo "  ECR: $ECR_URI"

# -- [3/9] Build and Push Docker Image (ARM64) --------------------------------
#   KNOWN ISSUE: AgentCore Runtime requires arm64 Docker image.
#   See: docs/TROUBLESHOOTING.md #9 (Docker 이미지 아키텍처)
echo ""
echo -e "${CYAN}[3/9] Building Docker image (arm64)...${NC}"
echo -e "  ${YELLOW}NOTE: arm64 required for AgentCore Runtime${NC}"

aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com" 2>/dev/null

docker buildx create --use 2>/dev/null || true
docker buildx build --platform linux/arm64 \
    -t "${ECR_URI}:latest" --push \
    "$WORK_DIR/agent/" 2>&1 | tail -5
echo "  Image: ${ECR_URI}:latest (arm64)"

# -- [4/9] Create AgentCore Gateway -------------------------------------------
echo ""
echo -e "${CYAN}[4/9] Creating AgentCore Gateway (MCP, NONE auth)...${NC}"

GW_RESULT=$(aws bedrock-agentcore-control create-gateway \
    --name awsops-gateway \
    --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/AWSopsAgentCoreRole" \
    --protocol-type MCP --authorizer-type NONE \
    --region "$REGION" --output json 2>&1)

GW_ID=$(echo "$GW_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('gatewayId',''))" 2>/dev/null || echo "")
echo "  Gateway ID: $GW_ID"

# -- [5/9] Create Lambda Functions ---------------------------------------------
echo ""
echo -e "${CYAN}[5/9] Creating Lambda functions (4)...${NC}"

LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/AWSopsLambdaNetworkRole"

# Package and deploy each Lambda function
cd /tmp
declare -A FUNC_MAP=(
    ["awsops-reachability-analyzer"]="reachability"
    ["awsops-flow-monitor"]="flowmonitor"
    ["awsops-network-mcp"]="network_mcp"
    ["awsops-steampipe-query"]="steampipe_query"
)

LAMBDA_ARNS=""
for FUNC_NAME in "${!FUNC_MAP[@]}"; do
    HANDLER="${FUNC_MAP[$FUNC_NAME]}"
    ZIP="${HANDLER}.zip"

    # Create zip if source exists
    if [ -f "lambda-network/${HANDLER}.py" ]; then
        zip -j "${ZIP}" "lambda-network/${HANDLER}.py" 2>/dev/null
    fi

    [ -f "$ZIP" ] || { echo "  SKIP: $FUNC_NAME (no zip)"; continue; }

    aws lambda create-function \
        --function-name "$FUNC_NAME" --runtime python3.12 \
        --handler "${HANDLER}.lambda_handler" \
        --role "$LAMBDA_ROLE_ARN" --zip-file "fileb://$ZIP" \
        --timeout 120 --memory-size 256 \
        --region "$REGION" 2>/dev/null || \
    aws lambda update-function-code \
        --function-name "$FUNC_NAME" --zip-file "fileb://$ZIP" \
        --region "$REGION" 2>/dev/null

    # Add permission for AgentCore to invoke
    aws lambda add-permission --function-name "$FUNC_NAME" \
        --statement-id agentcore-invoke --action lambda:InvokeFunction \
        --principal bedrock-agentcore.amazonaws.com \
        --region "$REGION" 2>/dev/null || true

    FUNC_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNC_NAME}"
    LAMBDA_ARNS="${LAMBDA_ARNS}${FUNC_NAME}=${FUNC_ARN}\n"
    echo "  Lambda: $FUNC_NAME"
done

# -- [6/9] Create Gateway Targets (via Python/boto3) --------------------------
#   KNOWN ISSUE: AWS CLI has issues with inlinePayload JSON format for
#   Gateway targets. Using Python/boto3 instead for reliable creation.
#   Gateway toolSchema uses inlinePayload (array format, NOT OpenAPI).
#   See: docs/TROUBLESHOOTING.md #9
echo ""
echo -e "${CYAN}[6/9] Creating Gateway targets (4) via boto3...${NC}"
echo -e "  ${YELLOW}NOTE: Using Python/boto3 because CLI has issues with inlinePayload${NC}"

if [ -n "$GW_ID" ] && [ "$GW_ID" != "" ]; then
python3 << PYEOF
import boto3, json, sys

client = boto3.client('bedrock-agentcore-control', region_name='${REGION}')
gw_id = '${GW_ID}'
account_id = '${ACCOUNT_ID}'
region = '${REGION}'

targets = [
    {
        'name': 'reachability-target',
        'lambda_name': 'awsops-reachability-analyzer',
        'description': 'VPC Reachability Analyzer - checks network paths between resources',
        'tools': [
            {
                'name': 'analyze_reachability',
                'description': 'Analyze network reachability between two AWS resources',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'source': {'type': 'string', 'description': 'Source resource ID (e.g., i-xxx, eni-xxx)'},
                        'destination': {'type': 'string', 'description': 'Destination resource ID or IP'},
                        'protocol': {'type': 'string', 'description': 'Protocol (tcp/udp)', 'default': 'tcp'},
                        'port': {'type': 'integer', 'description': 'Destination port number'}
                    },
                    'required': ['source', 'destination']
                }
            }
        ]
    },
    {
        'name': 'flow-monitor-target',
        'lambda_name': 'awsops-flow-monitor',
        'description': 'VPC Flow Log analyzer - queries and summarizes network traffic',
        'tools': [
            {
                'name': 'query_flow_logs',
                'description': 'Query VPC flow logs for traffic analysis',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'vpc_id': {'type': 'string', 'description': 'VPC ID to analyze'},
                        'action': {'type': 'string', 'description': 'Filter by action (ACCEPT/REJECT)', 'default': 'all'},
                        'minutes': {'type': 'integer', 'description': 'Look back N minutes', 'default': 60}
                    },
                    'required': ['vpc_id']
                }
            }
        ]
    },
    {
        'name': 'network-mcp-target',
        'lambda_name': 'awsops-network-mcp',
        'description': 'Network configuration MCP - security groups, NACLs, route tables',
        'tools': [
            {
                'name': 'describe_network',
                'description': 'Describe network configuration for a VPC or resource',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'resource_type': {'type': 'string', 'description': 'Type: security_group, nacl, route_table, subnet, vpc'},
                        'resource_id': {'type': 'string', 'description': 'Resource ID to describe'},
                        'vpc_id': {'type': 'string', 'description': 'VPC ID for listing resources'}
                    },
                    'required': ['resource_type']
                }
            }
        ]
    },
    {
        'name': 'steampipe-query-target',
        'lambda_name': 'awsops-steampipe-query',
        'description': 'Steampipe SQL query executor via Lambda in VPC',
        'tools': [
            {
                'name': 'run_steampipe_query',
                'description': 'Execute a Steampipe SQL query against AWS resources',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'sql': {'type': 'string', 'description': 'SQL query to execute against Steampipe'}
                    },
                    'required': ['sql']
                }
            }
        ]
    }
]

for t in targets:
    lambda_arn = f'arn:aws:lambda:{region}:{account_id}:function:{t["lambda_name"]}'
    tool_schemas = []
    for tool in t['tools']:
        tool_schemas.append({
            'name': tool['name'],
            'description': tool['description'],
            'inputSchema': {'inlinePayload': [tool['inputSchema']]}
        })
    try:
        resp = client.create_gateway_target(
            gatewayIdentifier=gw_id,
            name=t['name'],
            description=t['description'],
            targetConfiguration={
                'lambdaTargetConfiguration': {
                    'lambdaArn': lambda_arn,
                    'toolSchema': tool_schemas
                }
            }
        )
        target_id = resp.get('targetId', 'N/A')
        print(f'  Target: {t["name"]} -> {target_id}')
    except Exception as e:
        print(f'  WARN: {t["name"]} -> {e}')
PYEOF
else
    echo -e "  ${YELLOW}SKIP: No Gateway ID available. Create targets manually later.${NC}"
fi

# -- [7/9] Create AgentCore Runtime -------------------------------------------
echo ""
echo -e "${CYAN}[7/9] Creating AgentCore Runtime (Strands agent)...${NC}"
sleep 5

RT_RESULT=$(aws bedrock-agentcore-control create-agent-runtime \
    --agent-runtime-name awsops_agent \
    --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/AWSopsAgentCoreRole" \
    --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
    --network-configuration '{"networkMode":"PUBLIC"}' \
    --region "$REGION" --output json 2>&1)

RT_ID=$(echo "$RT_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('agentRuntimeId',''))" 2>/dev/null || echo "")
RT_ARN=$(echo "$RT_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('agentRuntimeArn',''))" 2>/dev/null || echo "")
echo "  Runtime ID:  $RT_ID"
echo "  Runtime ARN: $RT_ARN"

# -- [8/9] Create Runtime Endpoint --------------------------------------------
echo ""
echo -e "${CYAN}[8/9] Creating Runtime Endpoint...${NC}"

if [ -n "$RT_ID" ] && [ "$RT_ID" != "" ]; then
    EP_RESULT=$(aws bedrock-agentcore-control create-agent-runtime-endpoint \
        --agent-runtime-id "$RT_ID" --name awsops_endpoint \
        --region "$REGION" --output json 2>&1)
    EP_ID=$(echo "$EP_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('endpointId',''))" 2>/dev/null || echo "N/A")
    echo "  Endpoint ID: $EP_ID"
else
    echo -e "  ${YELLOW}SKIP: No Runtime ID available.${NC}"
    EP_ID="N/A"
fi

# -- [9/9] Create Code Interpreter --------------------------------------------
echo ""
echo -e "${CYAN}[9/9] Creating Code Interpreter...${NC}"

CI_RESULT=$(aws bedrock-agentcore-control create-code-interpreter \
    --name awsops-code-interpreter \
    --region "$REGION" --output json 2>&1) || true
CI_ID=$(echo "$CI_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('codeInterpreterId',''))" 2>/dev/null || echo "N/A")
echo "  Code Interpreter ID: $CI_ID"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 6 Complete: AgentCore configured${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Gateway ID:         $GW_ID"
echo "  Runtime ID:         $RT_ID"
echo "  Runtime ARN:        $RT_ARN"
echo "  Endpoint ID:        $EP_ID"
echo "  Code Interpreter:   $CI_ID"
echo "  ECR Image:          ${ECR_URI}:latest (arm64)"
echo ""
echo "  Lambda Functions:"
echo "    - awsops-reachability-analyzer"
echo "    - awsops-flow-monitor"
echo "    - awsops-network-mcp"
echo "    - awsops-steampipe-query"
echo ""
echo "  Gateway Targets: 4 (created via boto3 with inlinePayload)"
echo ""
echo "  Known issues handled:"
echo "    - Docker: arm64 (docker buildx --platform linux/arm64)"
echo "    - Gateway: inlinePayload via boto3 (CLI has issues)"
echo "    - Steampipe: Lambda in VPC (microVM cannot access localhost)"
echo ""
