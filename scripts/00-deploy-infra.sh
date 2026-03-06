#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 0: Deploy EC2 Infrastructure (CloudFormation)                         #
#                                                                              #
#   Template: /home/ec2-user/ec2_vscode/vscode_server_secure.yaml              #
#   Default:  t4g.2xlarge (ARM64 Graviton)                                     #
#                                                                              #
#   Environment variables:                                                     #
#     VSCODE_PASSWORD  - (required) Password for VSCode server                 #
#     INSTANCE_TYPE    - (optional) EC2 instance type [t4g.2xlarge]            #
#     STACK_NAME       - (optional) CloudFormation stack name [mgmt-vpc]       #
#     TEMPLATE_PATH    - (optional) Path to CFn template                       #
#     CF_PREFIX_LIST   - (optional) CloudFront prefix list ID (auto-detect)    #
#                                                                              #
#   NOTE: PostgreSQL 별도 설치 불필요 - Steampipe에 내장되어 있음                  #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

TEMPLATE_PATH="${TEMPLATE_PATH:-/home/ec2-user/ec2_vscode/vscode_server_secure.yaml}"
STACK_NAME="${STACK_NAME:-mgmt-vpc}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.2xlarge}"
VSCODE_PASSWORD="${VSCODE_PASSWORD:-}"
CF_PREFIX_LIST="${CF_PREFIX_LIST:-}"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 0: Deploy EC2 Infrastructure (CloudFormation)${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/4] Pre-flight checks --------------------------------------------------
echo -e "${CYAN}[1/4] Pre-flight checks...${NC}"

if [ ! -f "$TEMPLATE_PATH" ]; then
    echo -e "${RED}ERROR: Template not found: $TEMPLATE_PATH${NC}"
    echo "  Set TEMPLATE_PATH environment variable to the correct path."
    exit 1
fi
echo "  Template: $TEMPLATE_PATH"

if [ -z "$VSCODE_PASSWORD" ]; then
    read -sp "  Enter VSCode password (min 8 chars): " VSCODE_PASSWORD
    echo ""
fi
if [ -z "$VSCODE_PASSWORD" ] || [ ${#VSCODE_PASSWORD} -lt 8 ]; then
    echo -e "${RED}ERROR: VSCODE_PASSWORD must be at least 8 characters.${NC}"
    exit 1
fi

# Auto-detect CloudFront prefix list
if [ -z "$CF_PREFIX_LIST" ]; then
    CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists \
        --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \
        --query "PrefixLists[0].PrefixListId" --output text --region "$REGION" 2>/dev/null || echo "")
    if [ -n "$CF_PREFIX_LIST" ] && [ "$CF_PREFIX_LIST" != "None" ]; then
        echo "  CloudFront Prefix List: $CF_PREFIX_LIST (auto-detected)"
    fi
fi

if [ -z "$CF_PREFIX_LIST" ] || [ "$CF_PREFIX_LIST" = "None" ]; then
    echo -e "${RED}ERROR: Could not find CloudFront prefix list.${NC}"
    echo "  Set CF_PREFIX_LIST environment variable manually."
    exit 1
fi

# -- [2/4] Configuration ------------------------------------------------------
echo ""
echo -e "${CYAN}[2/4] Configuration...${NC}"
echo "  Instance Type: $INSTANCE_TYPE"
echo "  Stack Name:    $STACK_NAME"
echo "  Region:        $REGION"
echo "  Account:       $ACCOUNT_ID"

# Determine architecture from instance type
# t4g/m7g/m6g/c7g/r7g = ARM64 (Graviton), everything else = x86_64
ARCH="x86_64"
case $INSTANCE_TYPE in
    t4g.*|m7g.*|m6g.*|c7g.*|r7g.*|c6g.*|r6g.*)
        ARCH="arm64"
        ;;
esac
echo "  Architecture:  $ARCH"

# -- [3/4] CloudFormation deploy -----------------------------------------------
echo ""
echo -e "${CYAN}[3/4] Deploying CloudFormation stack...${NC}"
echo "  This takes 5-10 minutes..."
echo ""

aws cloudformation deploy \
    --template-file "$TEMPLATE_PATH" \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        InstanceType="$INSTANCE_TYPE" \
        VSCodePassword="$VSCODE_PASSWORD" \
        CloudFrontPrefixListId="$CF_PREFIX_LIST" \
    --region "$REGION" \
    --no-fail-on-empty-changeset 2>&1

# -- [4/4] Show outputs -------------------------------------------------------
echo ""
echo -e "${CYAN}[4/4] Stack outputs...${NC}"

OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" --region "$REGION" \
    --query "Stacks[0].Outputs" --output json 2>/dev/null || echo "[]")

parse_output() {
    echo "$OUTPUTS" | python3 -c "import json,sys;o={i['OutputKey']:i['OutputValue'] for i in json.load(sys.stdin)};print(o.get('$1','N/A'))" 2>/dev/null || echo "N/A"
}

CF_URL=$(parse_output "CloudFrontURL")
INSTANCE_ID=$(parse_output "VSCodeServerInstanceId")
PRIVATE_IP=$(parse_output "VSCodeServerPrivateIP")
VPC_ID=$(parse_output "VPCId")
ALB_DNS=$(parse_output "PublicALBEndpoint")

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 0 Complete: Infrastructure deployed${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Stack:        $STACK_NAME"
echo "  Instance:     $INSTANCE_ID ($INSTANCE_TYPE / $ARCH)"
echo "  Private IP:   $PRIVATE_IP"
echo "  VPC:          $VPC_ID"
echo "  ALB:          $ALB_DNS"
echo "  CloudFront:   $CF_URL"
echo ""
echo "  VSCode:       $CF_URL"
echo "  SSM:          aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo ""
echo "  NOTE: PostgreSQL 별도 설치 불필요 (Steampipe에 내장)"
echo ""
echo "  Next: SSM으로 접속 후 AWSops 대시보드 설치"
echo "    cd /home/ec2-user/awsops && bash scripts/install-all.sh"
echo ""
