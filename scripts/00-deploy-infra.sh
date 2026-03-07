#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 0: Deploy EC2 Infrastructure (CDK)                                    #
#                                                                              #
#   CDK Project: $WORK_DIR/infra-cdk/                                          #
#   Default:  t4g.2xlarge (ARM64 Graviton)                                     #
#                                                                              #
#   Environment variables:                                                     #
#     VSCODE_PASSWORD      - (required) Password for VSCode server             #
#     INSTANCE_TYPE        - (optional) EC2 instance type [t4g.2xlarge]        #
#     AWS_DEFAULT_REGION   - (optional) Primary region [ap-northeast-2]        #
#                                                                              #
#   NOTE: PostgreSQL 별도 설치 불필요 - Steampipe에 내장되어 있음                  #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.2xlarge}"
VSCODE_PASSWORD="${VSCODE_PASSWORD:-}"
CDK_DIR="$WORK_DIR/infra-cdk"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 0: Deploy EC2 Infrastructure (CDK)${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/7] Pre-flight checks --------------------------------------------------
echo -e "${CYAN}[1/7] Pre-flight checks...${NC}"

# AWS CLI
if ! command -v aws &>/dev/null; then
    echo -e "${RED}ERROR: aws CLI not found. Install it first.${NC}"
    exit 1
fi
echo "  aws CLI:  $(aws --version 2>&1 | head -1)"

# Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}ERROR: node not found. Install Node.js 18+ first.${NC}"
    exit 1
fi
echo "  node:     $(node --version)"

# npm
if ! command -v npm &>/dev/null; then
    echo -e "${RED}ERROR: npm not found. Install Node.js 18+ first.${NC}"
    exit 1
fi
echo "  npm:      $(npm --version)"

# Account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")
if [ "$ACCOUNT_ID" = "unknown" ]; then
    echo -e "${RED}ERROR: Cannot determine AWS account. Check credentials.${NC}"
    exit 1
fi
echo "  Account:  $ACCOUNT_ID"
echo "  Region:   $REGION"

# -- [2/7] Install CDK CLI ----------------------------------------------------
echo ""
echo -e "${CYAN}[2/7] Install CDK CLI...${NC}"

if command -v cdk &>/dev/null; then
    echo "  CDK CLI already installed: $(cdk --version)"
else
    echo "  Installing aws-cdk globally..."
    sudo npm install -g aws-cdk
    echo "  CDK CLI installed: $(cdk --version)"
fi

# -- [3/7] Build CDK project ---------------------------------------------------
echo ""
echo -e "${CYAN}[3/7] Build CDK project...${NC}"

if [ ! -d "$CDK_DIR" ]; then
    echo -e "${RED}ERROR: CDK project not found at $CDK_DIR${NC}"
    exit 1
fi

cd "$CDK_DIR"
echo "  Installing dependencies..."
npm install
echo "  Compiling TypeScript..."
npx tsc
echo "  Build complete."

# -- [4/7] CDK bootstrap -------------------------------------------------------
echo ""
echo -e "${CYAN}[4/7] CDK bootstrap...${NC}"

bootstrap_region() {
    local BOOTSTRAP_REGION="$1"
    local BOOTSTRAP_STACK="CDKToolkit"
    local EXISTING
    EXISTING=$(aws cloudformation describe-stacks \
        --stack-name "$BOOTSTRAP_STACK" \
        --region "$BOOTSTRAP_REGION" \
        --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NONE")

    if [ "$EXISTING" != "NONE" ] && [ "$EXISTING" != "DELETE_COMPLETE" ]; then
        echo "  $BOOTSTRAP_REGION: already bootstrapped ($EXISTING) - skipping"
    else
        echo "  $BOOTSTRAP_REGION: bootstrapping..."
        cd "$CDK_DIR"
        npx cdk bootstrap "aws://$ACCOUNT_ID/$BOOTSTRAP_REGION" --region "$BOOTSTRAP_REGION"
        echo "  $BOOTSTRAP_REGION: bootstrap complete."
    fi
}

bootstrap_region "ap-northeast-2"
bootstrap_region "us-east-1"

# -- [5/7] Auto-detect CloudFront prefix list ID -------------------------------
echo ""
echo -e "${CYAN}[5/7] Auto-detect CloudFront prefix list...${NC}"

CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists \
    --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \
    --query "PrefixLists[0].PrefixListId" --output text --region "$REGION" 2>/dev/null || echo "")

if [ -n "$CF_PREFIX_LIST" ] && [ "$CF_PREFIX_LIST" != "None" ]; then
    echo "  CloudFront Prefix List: $CF_PREFIX_LIST (auto-detected)"
else
    echo -e "${RED}ERROR: Could not find CloudFront prefix list.${NC}"
    echo "  Ensure CloudFront is available in $REGION."
    exit 1
fi

# -- [6/7] Prompt for VSCODE_PASSWORD ------------------------------------------
echo ""
echo -e "${CYAN}[6/7] VSCode password...${NC}"

if [ -z "$VSCODE_PASSWORD" ]; then
    read -sp "  Enter VSCode password (min 8 chars): " VSCODE_PASSWORD
    echo ""
fi
if [ -z "$VSCODE_PASSWORD" ] || [ ${#VSCODE_PASSWORD} -lt 8 ]; then
    echo -e "${RED}ERROR: VSCODE_PASSWORD must be at least 8 characters.${NC}"
    exit 1
fi
echo "  Password set (${#VSCODE_PASSWORD} chars)."

# -- [7/7] CDK deploy ----------------------------------------------------------
echo ""
echo -e "${CYAN}[7/7] Deploying AwsopsStack via CDK...${NC}"
echo "  Instance Type:             $INSTANCE_TYPE"
echo "  CloudFront Prefix List:    $CF_PREFIX_LIST"
echo "  This takes 5-10 minutes..."
echo ""

cd "$CDK_DIR"
npx cdk deploy AwsopsStack \
    --parameters InstanceType="$INSTANCE_TYPE" \
    --parameters VSCodePassword="$VSCODE_PASSWORD" \
    --parameters CloudFrontPrefixListId="$CF_PREFIX_LIST" \
    --require-approval never \
    --region "$REGION" 2>&1

# -- Parse stack outputs -------------------------------------------------------
echo ""
echo -e "${CYAN}Parsing stack outputs...${NC}"

OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name AwsopsStack --region "$REGION" \
    --query "Stacks[0].Outputs" --output json 2>/dev/null || echo "[]")

parse_output() {
    echo "$OUTPUTS" | python3 -c "import json,sys;o={i['OutputKey']:i['OutputValue'] for i in json.load(sys.stdin)};print(o.get('$1','N/A'))" 2>/dev/null || echo "N/A"
}

CF_URL=$(parse_output "CloudFrontURL")
INSTANCE_ID=$(parse_output "VSCodeServerInstanceId")
VPC_ID=$(parse_output "VPCId")
ALB_DNS=$(parse_output "PublicALBEndpoint")

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 0 Complete: Infrastructure deployed (CDK)${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Stack:        AwsopsStack"
echo "  Instance:     $INSTANCE_ID ($INSTANCE_TYPE)"
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
