#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 0-Update: Update CDK Infrastructure (in-place)                        #
#                                                                              #
#   기존 스택의 파라미터와 CDK context를 그대로 유지하면서                       #
#   awsops-stack.ts 코드 변경만 적용 (IAM, SG, UserData 등)                     #
#                                                                              #
#   EC2 교체 없이 안전하게 업데이트하려면 이 스크립트 사용                       #
#   전체 재배포(VPC/인스턴스 변경)는 00-deploy-infra.sh 사용                     #
#                                                                              #
#   Usage: bash scripts/00-update-infra.sh                                     #
#                                                                              #
################################################################################

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDK_DIR="$(cd "$SCRIPT_DIR/../infra-cdk" && pwd)"
REGION="${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || echo 'ap-northeast-2')}"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   AWSops CDK Stack Update (in-place)${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/4] Read current stack parameters and context --------------------------
echo -e "${CYAN}[1/4] Reading current stack configuration...${NC}"

STACK_NAME="AwsopsStack"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query 'Stacks[0].StackStatus' --output text --region "$REGION" 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ] || echo "$STACK_STATUS" | grep -q "DELETE"; then
    echo -e "${RED}ERROR: Stack '$STACK_NAME' not found or deleted.${NC}"
    echo -e "${YELLOW}Use 00-deploy-infra.sh for initial deployment.${NC}"
    exit 1
fi
echo "  Stack: $STACK_NAME ($STACK_STATUS)"

# Read existing CloudFormation parameters
INSTANCE_TYPE=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Parameters[?ParameterKey=='InstanceType'].ParameterValue | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "t4g.2xlarge")
VSCODE_PASSWORD=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Parameters[?ParameterKey=='VSCodePassword'].ParameterValue | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "****")
CF_PREFIX_LIST=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Parameters[?ParameterKey=='CloudFrontPrefixListId'].ParameterValue | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "")
EXISTING_VPC_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Parameters[?ParameterKey=='ExistingVpcId'].ParameterValue | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "")

echo "  InstanceType: $INSTANCE_TYPE"
echo "  CloudFrontPrefixList: $CF_PREFIX_LIST"
echo "  ExistingVpcId: ${EXISTING_VPC_ID:-<new VPC>}"

# -- [2/4] Reconstruct CDK context from stack -----------------------------------
echo ""
echo -e "${CYAN}[2/4] Reconstructing CDK context...${NC}"

CDK_CONTEXT=""

# VPC context
if [ -n "$EXISTING_VPC_ID" ] && [ "$EXISTING_VPC_ID" != "None" ] && [ "$EXISTING_VPC_ID" != "" ]; then
    VPC_CIDR=$(aws ec2 describe-vpcs --vpc-ids "$EXISTING_VPC_ID" \
        --query "Vpcs[0].CidrBlock" --output text --region "$REGION" 2>/dev/null || echo "10.0.0.0/8")
    CDK_CONTEXT="-c useExistingVpc=true -c vpcId=$EXISTING_VPC_ID -c vpcCidr=$VPC_CIDR"

    # Check for existing VPC endpoints → skip creation
    SSM_EP=$(aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$EXISTING_VPC_ID" "Name=service-name,Values=*ssm" \
        --query 'VpcEndpoints[0].VpcEndpointId' --output text --region "$REGION" 2>/dev/null || echo "None")
    if [ -n "$SSM_EP" ] && [ "$SSM_EP" != "None" ]; then
        CDK_CONTEXT="$CDK_CONTEXT -c skipVpcEndpoints=true"
    fi
fi

# TGW context
TGW_ATTACHMENT=$(aws cloudformation list-stack-resources --stack-name "$STACK_NAME" \
    --query "StackResourceSummaries[?ResourceType=='AWS::EC2::TransitGatewayAttachment'].PhysicalResourceId | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "None")
if [ -n "$TGW_ATTACHMENT" ] && [ "$TGW_ATTACHMENT" != "None" ]; then
    TGW_ID=$(aws ec2 describe-transit-gateway-attachments --transit-gateway-attachment-ids "$TGW_ATTACHMENT" \
        --query "TransitGatewayAttachments[0].TransitGatewayId" --output text --region "$REGION" 2>/dev/null || echo "")
    if [ -n "$TGW_ID" ] && [ "$TGW_ID" != "None" ]; then
        CDK_CONTEXT="$CDK_CONTEXT -c transitGatewayId=$TGW_ID"
        # Read TGW route CIDRs from route tables
        PRIVATE_RT=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=${EXISTING_VPC_ID:-$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`VPCId`].OutputValue | [0]' --output text --region $REGION)}" "Name=tag:Name,Values=*Private*" \
            --query "RouteTables[0].RouteTableId" --output text --region "$REGION" 2>/dev/null || echo "")
        if [ -n "$PRIVATE_RT" ] && [ "$PRIVATE_RT" != "None" ]; then
            TGW_CIDRS=$(aws ec2 describe-route-tables --route-table-ids "$PRIVATE_RT" \
                --query "RouteTables[0].Routes[?TransitGatewayId].DestinationCidrBlock" --output text --region "$REGION" 2>/dev/null | tr '\t' ',')
            if [ -n "$TGW_CIDRS" ] && [ "$TGW_CIDRS" != "None" ]; then
                CDK_CONTEXT="$CDK_CONTEXT -c tgwRouteCidrs=$TGW_CIDRS"
            fi
        fi
    fi
fi

# Custom domain context
CF_DIST_ID=$(aws cloudformation list-stack-resources --stack-name "$STACK_NAME" \
    --query "StackResourceSummaries[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "None")
if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ]; then
    CUSTOM_DOMAIN=$(aws cloudfront get-distribution --id "$CF_DIST_ID" \
        --query "Distribution.DistributionConfig.Aliases.Items[0]" --output text --region us-east-1 2>/dev/null || echo "")
    if [ -n "$CUSTOM_DOMAIN" ] && [ "$CUSTOM_DOMAIN" != "None" ]; then
        CDK_CONTEXT="$CDK_CONTEXT -c customDomain=$CUSTOM_DOMAIN"
        echo "  CustomDomain: $CUSTOM_DOMAIN"
    fi
fi

echo "  CDK Context: $CDK_CONTEXT"

# -- [3/4] CDK diff (preview) -------------------------------------------------
echo ""
echo -e "${CYAN}[3/4] Previewing changes (cdk diff)...${NC}"

cd "$CDK_DIR"
rm -rf cdk.out

DIFF_OUTPUT=$(npx cdk diff "$STACK_NAME" \
    --parameters InstanceType="$INSTANCE_TYPE" \
    --parameters CloudFrontPrefixListId="$CF_PREFIX_LIST" \
    --parameters ExistingVpcId="${EXISTING_VPC_ID}" \
    $CDK_CONTEXT \
    --region "$REGION" 2>&1) || true

echo "$DIFF_OUTPUT" | tail -20

if echo "$DIFF_OUTPUT" | grep -q "no differences"; then
    echo ""
    echo -e "${GREEN}No changes to deploy.${NC}"
    exit 0
fi

# Check for EC2 replacement
if echo "$DIFF_OUTPUT" | grep -q "\[~\] AWS::EC2::Instance"; then
    echo ""
    echo -e "${YELLOW}⚠ WARNING: EC2 instance will be modified.${NC}"
    echo -e "${YELLOW}  If replacement occurs, install scripts must be re-run.${NC}"
fi

# -- [4/4] Deploy --------------------------------------------------------------
echo ""
read -p "$(echo -e "${CYAN}Deploy these changes? (y/n): ${NC}")" -n 1 -r
echo ""
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

echo ""
echo -e "${CYAN}[4/4] Deploying...${NC}"

# VSCodePassword: use previous value (noEcho parameter can't be read back)
npx cdk deploy "$STACK_NAME" \
    --parameters InstanceType="$INSTANCE_TYPE" \
    --parameters "VSCodePassword=${VSCODE_PASSWORD}" \
    --parameters CloudFrontPrefixListId="$CF_PREFIX_LIST" \
    --parameters ExistingVpcId="${EXISTING_VPC_ID}" \
    $CDK_CONTEXT \
    --no-rollback \
    --require-approval never \
    --region "$REGION" 2>&1

echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Stack update complete${NC}"
echo -e "${GREEN}=================================================================${NC}"

# Show outputs
aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table --region "$REGION" 2>/dev/null
