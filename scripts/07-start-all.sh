#!/bin/bash
set -e
################################################################################
#                                                                              #
#   AWSops Dashboard - Start All Services                                      #
#                                                                              #
#   Starts:                                                                    #
#     1. Steampipe service (embedded PostgreSQL, port 9193)                    #
#     2. Next.js production server (port 3000)                                 #
#                                                                              #
#   Shows:                                                                     #
#     - Service status check                                                   #
#     - CloudFront URL (auto-detected)                                         #
#     - Cognito login info (password masked)                                   #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   AWSops Dashboard - Start All Services${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/2] Steampipe service ---------------------------------------------------
echo -e "${CYAN}[1/2] Starting Steampipe service (port 9193)...${NC}"
if steampipe service status 2>&1 | grep -q "running"; then
    echo -e "  ${GREEN}Already running${NC}"
else
    steampipe service stop --force 2>/dev/null || true
    sleep 2
    steampipe service start --database-listen network --database-port 9193
    echo -e "  ${GREEN}Started${NC}"
fi

# -- [2/2] Next.js server -----------------------------------------------------
echo ""
echo -e "${CYAN}[2/2] Starting Next.js production server (port 3000)...${NC}"

# Kill existing process on port 3000
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

cd "$WORK_DIR"
nohup sh -c "PORT=3000 npm run start" > /tmp/awsops-server.log 2>&1 &
sleep 3
echo -e "  ${GREEN}Started (log: /tmp/awsops-server.log)${NC}"

# -- Service status check ------------------------------------------------------
echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Service Status${NC}"
echo -e "${CYAN}=================================================================${NC}"

# Steampipe
if steampipe service status 2>&1 | grep -q "running"; then
    SP_PW=$(steampipe service status --show-password 2>&1 | grep Password | awk '{print $2}')
    echo -e "  ${GREEN}OK${NC}  Steampipe          port 9193  (pw: ${SP_PW:0:4}****)"
else
    echo -e "  ${RED}FAIL${NC}  Steampipe          NOT RUNNING"
fi

# Next.js
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/awsops 2>/dev/null)
if [ "$HTTP" = "200" ]; then
    echo -e "  ${GREEN}OK${NC}  Next.js            port 3000  (HTTP 200)"
else
    echo -e "  ${RED}FAIL${NC}  Next.js            NOT RUNNING (HTTP $HTTP)"
fi

# Steampipe API via Next.js
API=$(curl -s --max-time 5 -X POST http://localhost:3000/awsops/api/steampipe \
    -H "Content-Type: application/json" \
    -d '{"queries":{"t":"SELECT 1 as ok"}}' 2>/dev/null)
if echo "$API" | grep -q "ok"; then
    echo -e "  ${GREEN}OK${NC}  Steampipe API      working"
else
    echo -e "  ${RED}FAIL${NC}  Steampipe API      NOT responding"
fi

# -- Access URLs ---------------------------------------------------------------
echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Access URLs${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo "  Local:       http://localhost:3000/awsops"

# Auto-detect CloudFront URL
CF_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Origins.Items[].CustomOriginConfig.HTTPPort, \`3000\`)].DomainName | [0]" \
    --output text --region us-east-1 2>/dev/null || echo "")

if [ -z "$CF_DOMAIN" ] || [ "$CF_DOMAIN" = "None" ]; then
    CF_DOMAIN=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[].DomainName, 'elb.amazonaws.com')].DomainName | [0]" \
        --output text --region us-east-1 2>/dev/null || echo "")
fi

if [ -n "$CF_DOMAIN" ] && [ "$CF_DOMAIN" != "None" ]; then
    echo -e "  CloudFront:  ${GREEN}https://${CF_DOMAIN}/awsops${NC}"
else
    echo -e "  CloudFront:  ${YELLOW}(not configured)${NC}"
fi

# -- Cognito login info --------------------------------------------------------
echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Login${NC}"
echo -e "${CYAN}=================================================================${NC}"

POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 --region "$REGION" \
    --query "UserPools[?contains(Name, 'AWSops')].Id | [0]" --output text 2>/dev/null || echo "")

if [ -n "$POOL_ID" ] && [ "$POOL_ID" != "None" ]; then
    ADMIN_USER=$(aws cognito-idp list-users --user-pool-id "$POOL_ID" --region "$REGION" \
        --query "Users[0].Username" --output text 2>/dev/null || echo "")

    COGNITO_DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_ID" --region "$REGION" \
        --query "UserPool.Domain" --output text 2>/dev/null || echo "")

    if [ -n "$ADMIN_USER" ] && [ "$ADMIN_USER" != "None" ]; then
        echo -e "  ${GREEN}Cognito Authentication Enabled${NC}"
        echo "  User Pool:   $POOL_ID"
        echo "  ID:          $ADMIN_USER"
        echo "  Password:    ********"
        if [ -n "$COGNITO_DOMAIN" ] && [ "$COGNITO_DOMAIN" != "None" ]; then
            echo "  Login URL:   https://${COGNITO_DOMAIN}.auth.${REGION}.amazoncognito.com"
        fi
    else
        echo -e "  ${YELLOW}Cognito configured but no users found${NC}"
        echo "  Pool: $POOL_ID"
    fi
else
    echo -e "  ${YELLOW}Cognito not configured${NC}"
    echo "  Run: bash scripts/05-setup-cognito.sh"
fi

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo ""
