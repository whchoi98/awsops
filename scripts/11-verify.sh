#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 11: Verification & Health Check                                       #
#                                                                              #
#   Checks:                                                                    #
#     [1/5] Services   - Steampipe, Next.js                                    #
#     [2/5] Queries    - 18 Steampipe tables via API                           #
#     [3/5] Pages      - 20+ dashboard pages (HTTP 200)                        #
#     [4/5] APIs       - steampipe, benchmark, ai, code                        #
#     [5/5] Config     - basePath, eslint, aws.spc, fetch URLs                 #
#                                                                              #
#   Summary: N passed, N failed, N warnings                                    #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 11: Verification & Health Check${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

PASS=0
FAIL=0
WARN=0

# -- Helper function -----------------------------------------------------------
check() {
    local name="$1" result="$2"
    if [ "$result" = "OK" ]; then
        echo -e "  ${GREEN}OK${NC}   $name"
        PASS=$((PASS+1))
    elif [ "$result" = "WARN" ]; then
        echo -e "  ${YELLOW}WARN${NC} $name"
        WARN=$((WARN+1))
    else
        echo -e "  ${RED}FAIL${NC} $name ($result)"
        FAIL=$((FAIL+1))
    fi
}

# -- [1/5] Services ------------------------------------------------------------
echo -e "${CYAN}[1/5] Services${NC}"

# Steampipe
SP=$(steampipe service status 2>&1 | grep -q "running" && echo "OK" || echo "NOT RUNNING")
check "Steampipe service (port 9193)" "$SP"

# Next.js
NJ=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/awsops 2>/dev/null)
check "Next.js server (port 3000)" "$([ "$NJ" = "200" ] && echo OK || echo "HTTP $NJ")"

# -- [2/5] Steampipe Queries --------------------------------------------------
echo ""
echo -e "${CYAN}[2/5] Steampipe Queries (18 tables)${NC}"

test_query() {
    local name="$1" sql="$2"
    RESULT=$(curl -s --max-time 30 -X POST http://localhost:3000/awsops/api/steampipe \
        -H "Content-Type: application/json" \
        -d "{\"queries\":{\"test\":\"$sql\"}}" 2>/dev/null | \
        python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    r = d.get('test', {})
    if r.get('error'):
        print(f'ERR:{r[\"error\"][:50]}')
    else:
        print(f'{len(r.get(\"rows\",[]))} rows')
except:
    print('PARSE_ERROR')
" 2>/dev/null)

    if echo "$RESULT" | grep -q "rows"; then
        check "$name -> $RESULT" "OK"
    elif echo "$RESULT" | grep -q "ERR"; then
        check "$name -> $RESULT" "WARN"
    else
        check "$name" "TIMEOUT"
    fi
}

test_query "EC2"          "SELECT COUNT(*) as c FROM aws_ec2_instance"
test_query "VPC"          "SELECT COUNT(*) as c FROM aws_vpc"
test_query "S3"           "SELECT COUNT(*) as c FROM aws_s3_bucket"
test_query "RDS"          "SELECT COUNT(*) as c FROM aws_rds_db_instance"
test_query "Lambda"       "SELECT COUNT(*) as c FROM aws_lambda_function"
test_query "IAM Users"    "SELECT COUNT(*) as c FROM aws_iam_user"
test_query "IAM Roles"    "SELECT COUNT(*) as c FROM aws_iam_role"
test_query "CloudWatch"   "SELECT COUNT(*) as c FROM aws_cloudwatch_alarm"
test_query "ECS"          "SELECT COUNT(*) as c FROM aws_ecs_cluster"
test_query "DynamoDB"     "SELECT COUNT(*) as c FROM aws_dynamodb_table"
test_query "ElastiCache"  "SELECT COUNT(*) as c FROM aws_elasticache_cluster"
test_query "CloudTrail"   "SELECT COUNT(*) as c FROM aws_cloudtrail_trail"
test_query "Cost"         "SELECT COUNT(*) as c FROM aws_cost_by_service_monthly"
test_query "Security SGs" "SELECT COUNT(*) as c FROM aws_vpc_security_group"
test_query "EBS Volumes"  "SELECT COUNT(*) as c FROM aws_ebs_volume"
test_query "K8s Nodes"    "SELECT COUNT(*) as c FROM kubernetes_node"
test_query "K8s Pods"     "SELECT COUNT(*) as c FROM kubernetes_pod"
test_query "Trivy CVE"    "SELECT COUNT(*) as c FROM trivy_scan_vulnerability"

# -- [3/5] Pages ---------------------------------------------------------------
echo ""
echo -e "${CYAN}[3/5] Pages (20+ dashboard pages)${NC}"

# Auto-discover pages from src/app/*/page.tsx
PAGES=("")
while IFS= read -r page; do
    ROUTE=$(echo "$page" | sed "s|$WORK_DIR/src/app||;s|/page.tsx||")
    [ -n "$ROUTE" ] && PAGES+=("$ROUTE")
done < <(find "$WORK_DIR/src/app" -name "page.tsx" -not -path "*/api/*" 2>/dev/null | sort)

for page in "${PAGES[@]}"; do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/awsops${page}" 2>/dev/null)
    LABEL="/awsops${page}"
    [ -z "$page" ] && LABEL="/awsops/"
    check "$LABEL" "$([ "$HTTP" = "200" ] && echo OK || echo "HTTP $HTTP")"
done

# -- [4/5] API Endpoints ------------------------------------------------------
echo ""
echo -e "${CYAN}[4/5] API Endpoints${NC}"

# Auto-discover API routes and test each
while IFS= read -r api_route; do
    API_NAME=$(echo "$api_route" | sed "s|$WORK_DIR/src/app/api/||;s|/route.ts||")
    API_PATH="/awsops/api/$API_NAME"

    RESP=$(curl -s --max-time 10 -X POST "http://localhost:3000${API_PATH}" \
        -H "Content-Type: application/json" -d '{}' 2>/dev/null)

    if [ -n "$RESP" ]; then
        # Any JSON response (even error) means endpoint exists
        echo "$RESP" | python3 -c "import json,sys;json.load(sys.stdin)" 2>/dev/null
        if [ $? -eq 0 ]; then
            check "POST $API_PATH" "OK"
        else
            check "POST $API_PATH (non-JSON)" "WARN"
        fi
    else
        check "POST $API_PATH" "TIMEOUT"
    fi
done < <(find "$WORK_DIR/src/app/api" -name "route.ts" 2>/dev/null | sort)

# -- [5/5] Configuration ------------------------------------------------------
echo ""
echo -e "${CYAN}[5/5] Configuration${NC}"

# basePath
BP=$(grep -q "basePath.*awsops" "$WORK_DIR/next.config.mjs" 2>/dev/null && echo "OK" || echo "MISSING")
check "next.config.mjs basePath: /awsops" "$BP"

# eslint no-explicit-any
ES=$(grep -q "no-explicit-any" "$WORK_DIR/.eslintrc.json" 2>/dev/null && echo "OK" || echo "MISSING")
check ".eslintrc.json no-explicit-any: off" "$ES"

# aws.spc ignore_error_codes
SC=$(grep -q "ignore_error_codes" ~/.steampipe/config/aws.spc 2>/dev/null && echo "OK" || echo "MISSING")
check "aws.spc ignore_error_codes (SCP fix)" "$SC"

# fetch URLs with /awsops prefix
BF=$(grep -r "'/api/steampipe" "$WORK_DIR/src/app/" 2>/dev/null | grep -v "/awsops/api" | wc -l)
check "fetch URLs all use /awsops prefix" "$([ "$BF" = "0" ] && echo OK || echo "$BF BAD")"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo "  Troubleshooting: See docs/TROUBLESHOOTING.md"
    echo ""
    exit 1
fi
