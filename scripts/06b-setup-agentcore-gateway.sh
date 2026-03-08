#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 6b: AgentCore Gateways Setup (7 role-based Gateways)                  #
#                                                                              #
#   Creates:                                                                   #
#     1. Infra Gateway      (network, EKS, ECS, Istio)                         #
#     2. IaC Gateway        (CloudFormation, CDK, Terraform)                   #
#     3. Data Gateway       (DynamoDB, RDS, ElastiCache, MSK)                  #
#     4. Security Gateway   (IAM)                                              #
#     5. Monitoring Gateway (CloudWatch, CloudTrail)                           #
#     6. Cost Gateway       (Cost Explorer, Pricing, Budgets)                  #
#     7. Ops Gateway        (Steampipe, AWS Knowledge, Core MCP)               #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 6b: AgentCore Gateways Setup (7 Gateways)${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo "  Region:  $REGION"
echo "  Account: $ACCOUNT_ID"
echo ""

# -- Verify IAM Role ----------------------------------------------------------
ROLE_ARN=$(aws iam get-role --role-name AWSopsAgentCoreRole \
    --query "Role.Arn" --output text 2>/dev/null || echo "")
if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" = "None" ]; then
    echo -e "${RED}ERROR: AWSopsAgentCoreRole not found. Run 06a first.${NC}"
    exit 1
fi

# -- Create 7 Gateways --------------------------------------------------------
echo -e "${CYAN}[1/1] Creating 7 role-based Gateways...${NC}"

GATEWAYS=(
    "awsops-infra-gateway:Infra - Network, EKS, ECS, Istio"
    "awsops-iac-gateway:IaC - CloudFormation, CDK, Terraform"
    "awsops-data-gateway:Data - DynamoDB, RDS MySQL/PostgreSQL, ElastiCache, MSK"
    "awsops-security-gateway:Security - IAM users, roles, policies, simulation"
    "awsops-monitoring-gateway:Monitoring - CloudWatch metrics/alarms/logs, CloudTrail"
    "awsops-cost-gateway:Cost - Cost Explorer, Pricing, Budgets, Forecasts"
    "awsops-ops-gateway:Ops - Steampipe SQL, AWS Knowledge, Core MCP"
)

for entry in "${GATEWAYS[@]}"; do
    GW_NAME="${entry%%:*}"
    GW_DESC="${entry##*:}"
    EXISTING=$(aws bedrock-agentcore-control list-gateways --region "$REGION" --output json 2>/dev/null | \
        python3 -c "import json,sys;gws=json.load(sys.stdin).get('items',[]); print(next((g['gatewayId'] for g in gws if g.get('name','')=='$GW_NAME'), ''))" 2>/dev/null || echo "")
    if [ -n "$EXISTING" ] && [ "$EXISTING" != "" ]; then
        echo "  EXISTS: $GW_NAME ($EXISTING)"
    else
        RESULT=$(aws bedrock-agentcore-control create-gateway \
            --name "$GW_NAME" --role-arn "$ROLE_ARN" \
            --protocol-type MCP --authorizer-type NONE \
            --description "$GW_DESC" \
            --region "$REGION" --output json 2>&1)
        GW_ID=$(echo "$RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('gatewayId',''))" 2>/dev/null || echo "")
        echo "  CREATED: $GW_NAME ($GW_ID)"
    fi
done

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 6b Complete: 7 Gateways created${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""

aws bedrock-agentcore-control list-gateways --region "$REGION" --output json 2>/dev/null | \
    python3 -c "
import json,sys
gws=json.load(sys.stdin).get('items',[])
for g in sorted(gws, key=lambda x: x.get('name','')):
    if 'awsops' in g.get('name',''):
        print('  {} [{}]'.format(g['name'], g['status']))
"

echo ""
echo "  Next: bash scripts/06c-setup-agentcore-tools.sh"
echo ""
