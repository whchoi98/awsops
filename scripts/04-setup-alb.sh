#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 4: ALB Listener Setup for Dashboard                                   #
#                                                                              #
#   Creates:                                                                   #
#     - Target Group (port 3000, health check: /awsops)                        #
#     - ALB Listener (port 3000)                                               #
#     - Security Group rules (ALB + EC2)                                       #
#                                                                              #
#   Required env vars (or auto-detect):                                        #
#     ALB_ARN          - Existing ALB ARN                                      #
#     VPC_ID           - VPC ID                                                #
#     ALB_SG_ID        - ALB Security Group ID                                 #
#     EC2_SG_ID        - EC2 Security Group ID                                 #
#     EC2_INSTANCE_ID  - EC2 Instance ID (auto-detected on EC2)               #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 4: ALB Listener Setup${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- Auto-detect EC2 Instance ID -----------------------------------------------
if [ -z "$EC2_INSTANCE_ID" ]; then
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || echo "")
    if [ -n "$TOKEN" ]; then
        EC2_INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
            http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "")
        echo "  Auto-detected EC2: $EC2_INSTANCE_ID"
    fi
fi

# -- Validate required variables -----------------------------------------------
MISSING=""
[ -z "$ALB_ARN" ] && MISSING="${MISSING}  ALB_ARN\n"
[ -z "$VPC_ID" ] && MISSING="${MISSING}  VPC_ID\n"
[ -z "$ALB_SG_ID" ] && MISSING="${MISSING}  ALB_SG_ID\n"
[ -z "$EC2_SG_ID" ] && MISSING="${MISSING}  EC2_SG_ID\n"
[ -z "$EC2_INSTANCE_ID" ] && MISSING="${MISSING}  EC2_INSTANCE_ID\n"

if [ -n "$MISSING" ]; then
    echo -e "${RED}ERROR: Missing required environment variables:${NC}"
    echo -e "$MISSING"
    echo "  Example:"
    echo '    export ALB_ARN="arn:aws:elasticloadbalancing:...:loadbalancer/app/my-alb/xxx"'
    echo '    export VPC_ID="vpc-xxx"'
    echo '    export ALB_SG_ID="sg-xxx"'
    echo '    export EC2_SG_ID="sg-xxx"'
    echo '    export EC2_INSTANCE_ID="i-xxx"   # auto-detected on EC2'
    exit 1
fi

echo "  ALB ARN:      $ALB_ARN"
echo "  VPC ID:       $VPC_ID"
echo "  ALB SG:       $ALB_SG_ID"
echo "  EC2 SG:       $EC2_SG_ID"
echo "  EC2 Instance: $EC2_INSTANCE_ID"
echo ""

# -- [1/4] Create Target Group -------------------------------------------------
echo -e "${CYAN}[1/4] Creating Target Group (port 3000, health: /awsops)...${NC}"
TG_ARN=$(aws elbv2 create-target-group \
    --name awsops-dashboard-TG \
    --protocol HTTP --port 3000 \
    --vpc-id "$VPC_ID" \
    --target-type instance \
    --health-check-path "/awsops" \
    --region "$REGION" \
    --query "TargetGroups[0].TargetGroupArn" --output text 2>&1)
echo "  Target Group: $TG_ARN"

# -- [2/4] Register EC2 instance -----------------------------------------------
echo ""
echo -e "${CYAN}[2/4] Registering EC2 instance to Target Group...${NC}"
aws elbv2 register-targets \
    --target-group-arn "$TG_ARN" \
    --targets "Id=$EC2_INSTANCE_ID,Port=3000" \
    --region "$REGION"
echo "  Registered: $EC2_INSTANCE_ID (port 3000)"

# -- [3/4] Create ALB Listener -------------------------------------------------
echo ""
echo -e "${CYAN}[3/4] Creating ALB Listener (port 3000)...${NC}"
LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 3000 \
    --default-actions "Type=forward,TargetGroupArn=$TG_ARN" \
    --region "$REGION" \
    --query "Listeners[0].ListenerArn" --output text 2>&1)
echo "  Listener: $LISTENER_ARN"

# -- [4/4] Security Group rules -----------------------------------------------
echo ""
echo -e "${CYAN}[4/4] Adding Security Group rules...${NC}"
aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG_ID" --protocol tcp --port 3000 --cidr 0.0.0.0/0 \
    --region "$REGION" 2>/dev/null && echo "  ALB SG: Added port 3000 from 0.0.0.0/0" \
    || echo "  ALB SG: Rule already exists (port 3000)"

aws ec2 authorize-security-group-ingress \
    --group-id "$EC2_SG_ID" --protocol tcp --port 3000 --source-group "$ALB_SG_ID" \
    --region "$REGION" 2>/dev/null && echo "  EC2 SG: Added port 3000 from ALB SG" \
    || echo "  EC2 SG: Rule already exists (port 3000 from ALB)"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 4 Complete: ALB configured${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Target Group: $TG_ARN"
echo "  Listener:     port 3000 -> $TG_ARN"
echo "  Health Check: /awsops"
echo ""
echo "  CloudFront origin should point to this ALB on port 3000."
echo ""
