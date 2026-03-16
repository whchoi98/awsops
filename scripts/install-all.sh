#!/bin/bash
set -e
################################################################################
#                                                                              #
#   AWSops Dashboard - Full Installation                                       #
#   EC2 + Steampipe + Next.js + Powerpipe + AI                                 #
#                                                                              #
#   Usage:                                                                     #
#     bash scripts/install-all.sh                                              #
#                                                                              #
#   Runs: Step 1 -> Step 2 -> Step 3 -> Step 9 (verify)                        #
#   Optional: Steps 5 (Cognito), 6 (AgentCore), 7 (CloudFront Auth)           #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WORK_DIR"

# -- Step overview -------------------------------------------------------------
echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   AWSops Dashboard - Full Installation${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo "  Region:     $REGION"
echo "  Account:    $ACCOUNT_ID"
echo "  Work Dir:   $WORK_DIR"
echo ""
echo "  Steps to run:"
echo "    [1/4] Steampipe + Plugins + Powerpipe     (01-install-base.sh)"
echo "    [2/4] Next.js + Steampipe Service          (02-setup-nextjs.sh)"
echo "    [3/4] Production Build + Deploy            (03-build-deploy.sh)"
echo "    [4/4] Verification                         (10-verify.sh)"
echo ""
echo "  선택 단계 (개별 실행) / Optional (run separately):"
echo "    Step 4:  EKS 접근 설정              (04-setup-eks-access.sh)"
echo "    Step 5:  Cognito 인증               (05-setup-cognito.sh)"
echo "    Step 6:  AgentCore AI (일괄)        (06-setup-agentcore.sh)"
echo "      Step 6a: Runtime                  (06a-setup-agentcore-runtime.sh)"
echo "      Step 6b: 8 Gateways              (06b-setup-agentcore-gateway.sh)"
echo "      Step 6c: 19 Lambda + 19 Targets  (06c-setup-agentcore-tools.sh)"
echo "      Step 6d: Code Interpreter        (06d-setup-agentcore-interpreter.sh)"
echo "      Step 6e: 설정 적용 + 리빌드       (06e-setup-agentcore-config.sh)"
echo "      Docker: 재빌드 + Runtime 업데이트  (6e 후 수동 실행)"
echo "    Step 7:  CloudFront Lambda@Edge    (07-setup-cloudfront-auth.sh)"
echo ""
echo "  운영 스크립트 / Operations:"
echo "    bash scripts/08-start-all.sh       # 서비스 시작 / Start services"
echo "    bash scripts/09-stop-all.sh        # 서비스 중지 / Stop services"
echo "    bash scripts/10-verify.sh          # 검증 (46항목) / Health check"
echo "    /accounts 페이지에서 멀티 어카운트 추가  # Add accounts via UI (/accounts)"
echo ""

# -- Detect environment --------------------------------------------------------
IS_EC2=false
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id &>/dev/null; then
    IS_EC2=true
fi

if [ "$IS_EC2" = true ]; then
    echo -e "${GREEN}[ENV] Running on EC2 instance. Proceeding with Steps 1-3 + verify.${NC}"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]] || exit 0

    echo ""
    echo -e "${CYAN}[1/4] Installing Steampipe + Powerpipe...${NC}"
    echo "--------------------------------------------------------------"
    bash "$SCRIPT_DIR/01-install-base.sh"

    echo ""
    echo -e "${CYAN}[2/4] Setting up Next.js + Steampipe Service...${NC}"
    echo "--------------------------------------------------------------"
    bash "$SCRIPT_DIR/02-setup-nextjs.sh"

    echo ""
    echo -e "${CYAN}[3/4] Building and deploying production...${NC}"
    echo "--------------------------------------------------------------"
    bash "$SCRIPT_DIR/03-build-deploy.sh"

    echo ""
    echo -e "${CYAN}[4/4] Running verification...${NC}"
    echo "--------------------------------------------------------------"
    bash "$SCRIPT_DIR/10-verify.sh"
else
    echo -e "${YELLOW}[ENV] Not running on EC2. Deploy infrastructure first:${NC}"
    echo ""
    echo "  # Step 0: Deploy EC2 (from local machine)"
    echo "  export VSCODE_PASSWORD='YourPassword'"
    echo "  export INSTANCE_TYPE='t4g.2xlarge'   # default (ARM64 Graviton)"
    echo "  bash scripts/00-deploy-infra.sh"
    echo ""
    echo "  # Then SSM into the instance and run:"
    echo "  aws ssm start-session --target <INSTANCE_ID>"
    echo "  cd /home/ec2-user/awsops && bash scripts/install-all.sh"
    exit 0
fi

# -- Final summary -------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Installation Complete${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Dashboard:  http://localhost:3000/awsops"
echo ""
echo "  Services running on this EC2 instance:"
echo "    - Steampipe (embedded PostgreSQL, port 9193)"
echo "    - Next.js   (production server, port 3000)"
echo "    - Powerpipe (CIS benchmark CLI)"
echo ""

# Auto-detect CloudFront URL from CDK stack / CDK 스택에서 CloudFront URL 자동 감지
CF_DOMAIN=""
CF_STACK=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query "StackSummaries[?contains(StackName, 'AwsopsStack') || contains(StackName, 'awsops')].StackName | [0]" \
    --output text --region "$REGION" 2>/dev/null || echo "None")
if [ -n "$CF_STACK" ] && [ "$CF_STACK" != "None" ]; then
    CF_DIST_ID=$(aws cloudformation list-stack-resources --stack-name "$CF_STACK" \
        --query "StackResourceSummaries[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId | [0]" \
        --output text --region "$REGION" 2>/dev/null || echo "None")
    if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ]; then
        CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_DIST_ID" \
            --query "Distribution.DomainName" --output text --region us-east-1 2>/dev/null || echo "")
    fi
fi
# Fallback: ALB origin / 폴백: ALB origin
if [ -z "$CF_DOMAIN" ] || [ "$CF_DOMAIN" = "None" ]; then
    CF_DOMAIN=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[].DomainName, 'elb.amazonaws.com')].DomainName | [0]" \
        --output text --region us-east-1 2>/dev/null || echo "")
fi
if [ -n "$CF_DOMAIN" ] && [ "$CF_DOMAIN" != "None" ]; then
    echo -e "  CloudFront: ${GREEN}https://${CF_DOMAIN}/awsops${NC}"
    echo ""
fi

echo "  다음 단계 / Next steps:"
echo "    bash scripts/04-setup-eks-access.sh              # EKS 접근 설정"
echo "    bash scripts/05-setup-cognito.sh                 # Cognito 인증"
echo "    bash scripts/06-setup-agentcore.sh               # AgentCore AI (6a→6b→6c→6d→6e)"
echo "    bash scripts/07-setup-cloudfront-auth.sh         # Lambda@Edge → CloudFront"
echo ""
