#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 6c: AgentCore Gateway Tools & MCP Setup                               #
#                                                                              #
#   Creates:                                                                   #
#     1. IAM Roles for Lambda (network + service permissions)                  #
#     2. Lambda functions (19) from agent/lambda/ source files                 #
#     3. Gateway Targets (19) linking Lambda to 7 Gateways via MCP             #
#                                                                              #
#   Lambda Sources: agent/lambda/*.py (version controlled)                     #
#   Target Definitions: agent/lambda/create_targets.py                         #
#                                                                              #
#   Known issues handled:                                                      #
#     - Gateway toolSchema: inlinePayload via Python/boto3 (CLI broken)       #
#     - credentialProviderConfigurations: GATEWAY_IAM_ROLE required           #
#     - steampipe-query + istio-mcp: VPC Lambda (pg8000 → Steampipe :9193)   #
#     - Steampipe: --database-listen network required for VPC Lambda          #
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

# -- [1/4] Create IAM Roles ---------------------------------------------------
echo -e "${CYAN}[1/4] Creating Lambda IAM roles + permissions...${NC}"

aws iam create-role --role-name AWSopsLambdaNetworkRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    }' 2>/dev/null || true

# Attach managed policies
for POLICY in AWSLambdaBasicExecutionRole AWSLambdaVPCAccessExecutionRole AmazonVPCFullAccess; do
    aws iam attach-role-policy --role-name AWSopsLambdaNetworkRole \
        --policy-arn "arn:aws:iam::aws:policy/service-role/$POLICY" 2>/dev/null || \
    aws iam attach-role-policy --role-name AWSopsLambdaNetworkRole \
        --policy-arn "arn:aws:iam::aws:policy/$POLICY" 2>/dev/null || true
done

# Inline policies for all services
aws iam put-role-policy --role-name AWSopsLambdaNetworkRole --policy-name FullServiceAccess \
    --policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "ec2:*", "tiros:*", "logs:*", "cloudwatch:*",
                "network-firewall:*", "networkmanager:*",
                "eks:*", "ecs:*", "ecr:*",
                "iam:List*", "iam:Get*", "iam:SimulatePrincipalPolicy", "iam:GenerateCredentialReport",
                "cloudtrail:*", "ce:*", "pricing:*", "budgets:Describe*", "budgets:View*",
                "cloudformation:ValidateTemplate", "cloudformation:DescribeStacks",
                "cloudformation:DescribeStackEvents", "cloudformation:ListStacks",
                "dynamodb:*", "rds:Describe*", "rds:List*", "rds-data:ExecuteStatement",
                "elasticache:Describe*", "elasticache:List*",
                "kafka:Describe*", "kafka:List*", "kafka:Get*",
                "sts:AssumeRole"
            ],
            "Resource": "*"
        }]
    }' 2>/dev/null

echo "  sts:AssumeRole included (multi-account: AWSopsReadOnlyRole in target accounts)"

echo "  AWSopsLambdaNetworkRole: created + policies attached"
echo "  Waiting for IAM propagation (10s)..."
sleep 10

LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/AWSopsLambdaNetworkRole"

# -- [2/4] Deploy Standard Lambda Functions -----------------------------------
echo ""
echo -e "${CYAN}[2/4] Deploying 16 standard Lambda functions from agent/lambda/...${NC}"

STANDARD_LAMBDAS=(
    "awsops-network-mcp:network_mcp"
    "awsops-reachability-analyzer:reachability"
    "awsops-flow-monitor:flowmonitor"
    "awsops-eks-mcp:aws_eks_mcp"
    "awsops-ecs-mcp:aws_ecs_mcp"
    "awsops-iac-mcp:aws_iac_mcp"
    "awsops-terraform-mcp:aws_terraform_mcp"
    "awsops-iam-mcp:aws_iam_mcp"
    "awsops-cloudwatch-mcp:aws_cloudwatch_mcp"
    "awsops-cloudtrail-mcp:aws_cloudtrail_mcp"
    "awsops-cost-mcp:aws_cost_mcp"
    "awsops-aws-knowledge:aws_knowledge"
    "awsops-core-mcp:aws_core_mcp"
    "awsops-dynamodb-mcp:aws_dynamodb_mcp"
    "awsops-rds-mcp:aws_rds_mcp"
    "awsops-valkey-mcp:aws_valkey_mcp"
    "awsops-msk-mcp:aws_msk_mcp"
)

# Create reachability and flowmonitor source files if not in agent/lambda
if [ ! -f "$WORK_DIR/agent/lambda/reachability.py" ]; then
    cp "$WORK_DIR/agent/lambda/network_mcp.py" /tmp/_placeholder.py 2>/dev/null || true
fi

for entry in "${STANDARD_LAMBDAS[@]}"; do
    FUNC_NAME="${entry%%:*}"
    HANDLER="${entry##*:}"
    SRC="$WORK_DIR/agent/lambda/${HANDLER}.py"

    if [ ! -f "$SRC" ]; then
        echo -e "  ${YELLOW}SKIP: $FUNC_NAME (${HANDLER}.py not found)${NC}"
        continue
    fi

    cd /tmp && zip -j "${HANDLER}.zip" "$SRC" 2>/dev/null

    aws lambda create-function \
        --function-name "$FUNC_NAME" --runtime python3.12 \
        --handler "${HANDLER}.lambda_handler" \
        --role "$LAMBDA_ROLE_ARN" --zip-file "fileb:///tmp/${HANDLER}.zip" \
        --timeout 60 --memory-size 256 \
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

# -- [3/4] Deploy VPC Lambda Functions (Steampipe access) ---------------------
echo ""
echo -e "${CYAN}[3/4] Deploying 2 VPC Lambda functions (pg8000 → Steampipe :9193)...${NC}"
echo -e "  ${YELLOW}NOTE: VPC Lambda requires Steampipe --database-listen network${NC}"

# Auto-detect EC2 network config
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

# Create Lambda SG
LAMBDA_SG=$(aws ec2 create-security-group \
    --group-name awsops-lambda-steampipe-sg \
    --description "Lambda SG for Steampipe access" \
    --vpc-id "$EC2_VPC" --region "$REGION" \
    --query "GroupId" --output text 2>/dev/null || \
    aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=awsops-lambda-steampipe-sg" "Name=vpc-id,Values=$EC2_VPC" \
    --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)

aws ec2 authorize-security-group-ingress \
    --group-id "$EC2_SG" --protocol tcp --port 9193 \
    --source-group "$LAMBDA_SG" --region "$REGION" 2>/dev/null || true

# Ensure Steampipe listens on network
steampipe service stop 2>/dev/null || true
sleep 2
steampipe service start --database-listen network --database-port 9193 2>/dev/null

# Build pg8000 package
mkdir -p /tmp/vpc-lambda-pkg && cd /tmp/vpc-lambda-pkg && rm -rf *
pip3 install pg8000 -t . --quiet 2>&1 | tail -2 || true

VPC_LAMBDAS=(
    "awsops-steampipe-query:steampipe_query:$WORK_DIR/agent/lambda/aws_knowledge.py"
    "awsops-istio-mcp:aws_istio_mcp:$WORK_DIR/agent/lambda/aws_istio_mcp.py"
)

# steampipe_query uses inline since it was originally created differently
cat > /tmp/vpc-lambda-pkg/steampipe_query.py << 'LAMBDAEOF'
import json, os, pg8000
DB_CONFIG = {"host": os.environ.get("STEAMPIPE_HOST", ""), "port": int(os.environ.get("STEAMPIPE_PORT", "9193")),
    "database": "steampipe", "user": "steampipe", "password": os.environ.get("STEAMPIPE_PASSWORD", ""), "timeout": 30}
def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    sql = params.get("sql", "").strip()
    if not sql: return {"statusCode": 400, "body": json.dumps({"error": "sql required"})}
    for kw in ["drop","delete","update","insert","alter","create","truncate"]:
        if kw in sql.lower().split(): return {"statusCode": 400, "body": json.dumps({"error": "Only SELECT allowed"})}
    try:
        conn = pg8000.connect(**DB_CONFIG); cur = conn.cursor(); cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = [dict(zip(cols, [str(v) if v is not None else None for v in r])) for r in cur.fetchmany(100)]
        cur.close(); conn.close()
        return {"statusCode": 200, "body": json.dumps({"columns": cols, "rows": rows, "rowCount": len(rows), "sql": sql})}
    except Exception as e: return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
LAMBDAEOF

for FUNC in "awsops-steampipe-query:steampipe_query" "awsops-istio-mcp:aws_istio_mcp"; do
    FUNC_NAME="${FUNC%%:*}"
    HANDLER="${FUNC##*:}"

    # Copy source into pkg dir
    if [ "$HANDLER" = "aws_istio_mcp" ]; then
        cp "$WORK_DIR/agent/lambda/aws_istio_mcp.py" /tmp/vpc-lambda-pkg/
    fi

    cd /tmp/vpc-lambda-pkg
    zip -r "/tmp/${HANDLER}_vpc.zip" . -x "*.pyc" "__pycache__/*" 2>/dev/null

    aws lambda create-function \
        --function-name "$FUNC_NAME" --runtime python3.12 \
        --handler "${HANDLER}.lambda_handler" \
        --role "$LAMBDA_ROLE_ARN" --zip-file "fileb:///tmp/${HANDLER}_vpc.zip" \
        --timeout 60 --memory-size 256 \
        --vpc-config "SubnetIds=$PRIVATE_SUBNETS,SecurityGroupIds=$LAMBDA_SG" \
        --environment "Variables={STEAMPIPE_HOST=$EC2_IP,STEAMPIPE_PORT=9193,STEAMPIPE_PASSWORD=$SP_PASS}" \
        --region "$REGION" 2>/dev/null || \
    aws lambda update-function-code \
        --function-name "$FUNC_NAME" --zip-file "fileb:///tmp/${HANDLER}_vpc.zip" \
        --region "$REGION" 2>/dev/null

    sleep 3
    aws lambda update-function-configuration \
        --function-name "$FUNC_NAME" \
        --vpc-config "SubnetIds=$PRIVATE_SUBNETS,SecurityGroupIds=$LAMBDA_SG" \
        --environment "Variables={STEAMPIPE_HOST=$EC2_IP,STEAMPIPE_PORT=9193,STEAMPIPE_PASSWORD=$SP_PASS}" \
        --region "$REGION" 2>/dev/null || true

    aws lambda add-permission --function-name "$FUNC_NAME" \
        --statement-id agentcore-invoke --action lambda:InvokeFunction \
        --principal bedrock-agentcore.amazonaws.com \
        --region "$REGION" 2>/dev/null || true

    echo "  Lambda: $FUNC_NAME [VPC]"

    # Remove istio source to avoid including in steampipe zip
    rm -f /tmp/vpc-lambda-pkg/aws_istio_mcp.py
done

# -- [4/4] Create Gateway Targets via Python ----------------------------------
echo ""
echo -e "${CYAN}[4/4] Creating Gateway Targets (19) via Python/boto3...${NC}"
echo -e "  ${YELLOW}NOTE: Using agent/lambda/create_targets.py${NC}"

REGION="$REGION" ACCOUNT_ID="$ACCOUNT_ID" python3 "$WORK_DIR/agent/lambda/create_targets.py"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 6c Complete: 19 Lambda + 19 Gateway Targets${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Lambda Functions (19):"
echo "    Infra:      network-mcp, reachability, flow-monitor, eks-mcp, ecs-mcp, istio-mcp[VPC]"
echo "    IaC:        iac-mcp, terraform-mcp"
echo "    Data:       dynamodb-mcp, rds-mcp, valkey-mcp, msk-mcp"
echo "    Security:   iam-mcp"
echo "    Monitoring: cloudwatch-mcp, cloudtrail-mcp"
echo "    Cost:       cost-mcp"
echo "    Ops:        aws-knowledge, core-mcp, steampipe-query[VPC]"
echo ""
echo "  Gateways: 7 (Infra/IaC/Data/Security/Monitoring/Cost/Ops)"
echo "  Targets:  19"
echo "  Tools:    125"
echo ""
echo "  Next: bash scripts/06d-setup-agentcore-interpreter.sh"
echo ""
