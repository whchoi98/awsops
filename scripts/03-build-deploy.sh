#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 3: Build & Deploy Next.js (Production)                                #
#                                                                              #
#   Actions:                                                                   #
#     1. Pre-build validation (basePath, fetch URLs, eslint, imports)          #
#     2. Production build (npm run build, NOT dev)                             #
#     3. Start server (nohup, port 3000) + verify HTTP 200                    #
#                                                                              #
#   Known issues handled:                                                      #
#     - basePath: /awsops in next.config.mjs                                   #
#     - fetch URLs must use /awsops/api/* prefix                               #
#     - .eslintrc.json: no-explicit-any off (Steampipe results are dynamic)   #
#     - Components: default exports (not named)                                #
#     - Production build required (dev mode = ALB health check failures)       #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

cd "$WORK_DIR"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 3: Build & Deploy Next.js (Production)${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/3] Pre-build validation ------------------------------------------------
echo -e "${CYAN}[1/3] Pre-build validation...${NC}"
CHECKS_PASSED=0
CHECKS_WARNED=0

# Check basePath in next.config.mjs
#   FIX: basePath must be '/awsops' for CloudFront routing.
#   Next.js <Link> auto-adds basePath, but fetch() does NOT.
#   See: docs/TROUBLESHOOTING.md #5 (basePath 이슈)
if grep -q "basePath.*awsops" next.config.mjs 2>/dev/null; then
    echo -e "  ${GREEN}OK${NC}  basePath: /awsops in next.config.mjs"
    CHECKS_PASSED=$((CHECKS_PASSED+1))
else
    echo -e "  ${RED}WARN${NC} basePath not set to /awsops in next.config.mjs"
    CHECKS_WARNED=$((CHECKS_WARNED+1))
fi

# Check fetch URLs include /awsops prefix
#   FIX: All fetch() calls must manually include /awsops prefix.
#   Next.js basePath only applies to <Link>, NOT to fetch().
#   See: docs/TROUBLESHOOTING.md #5
BAD_FETCH=$(grep -r "'/api/steampipe" src/app/ 2>/dev/null | grep -v "/awsops/api" | wc -l)
if [ "$BAD_FETCH" -gt 0 ]; then
    echo -e "  ${RED}WARN${NC} $BAD_FETCH pages have fetch without /awsops prefix"
    CHECKS_WARNED=$((CHECKS_WARNED+1))
else
    echo -e "  ${GREEN}OK${NC}  fetch URLs: all use /awsops/api/* prefix"
    CHECKS_PASSED=$((CHECKS_PASSED+1))
fi

# Check eslint config for no-explicit-any
#   FIX: Steampipe query results are dynamic (any type unavoidable).
#   .eslintrc.json must have @typescript-eslint/no-explicit-any: off
if grep -q "no-explicit-any" .eslintrc.json 2>/dev/null; then
    echo -e "  ${GREEN}OK${NC}  .eslintrc.json: no-explicit-any off"
    CHECKS_PASSED=$((CHECKS_PASSED+1))
else
    echo -e "  ${RED}WARN${NC} .eslintrc.json missing no-explicit-any rule"
    CHECKS_WARNED=$((CHECKS_WARNED+1))
fi

# Check component imports use default (not named)
#   FIX: All components use export default. Named imports { Header } will fail.
#   See: docs/TROUBLESHOOTING.md #6 (Export/Import 불일치)
BAD_IMPORTS=$(grep -r "{ Header }\|{ StatsCard }\|{ StatusBadge }\|{ Sidebar }" src/app/ 2>/dev/null | wc -l)
if [ "$BAD_IMPORTS" -gt 0 ]; then
    echo -e "  ${RED}WARN${NC} $BAD_IMPORTS files use named imports instead of default"
    CHECKS_WARNED=$((CHECKS_WARNED+1))
else
    echo -e "  ${GREEN}OK${NC}  Component imports: all use default"
    CHECKS_PASSED=$((CHECKS_PASSED+1))
fi

echo "  Validation: $CHECKS_PASSED passed, $CHECKS_WARNED warnings"

# -- [2/3] Production build ---------------------------------------------------
#   FIX: MUST use production build. Dev mode (npm run dev) causes:
#     - JIT compilation per page (1-2s per request vs 3-6ms)
#     - ALB health check failures
#   See: docs/TROUBLESHOOTING.md #7 (Production vs Dev)
echo ""
echo -e "${CYAN}[2/3] Building production (npm run build)...${NC}"
echo -e "  ${YELLOW}NOTE: Production build required. Dev mode causes ALB health check failures.${NC}"

npm run build 2>&1 | tail -5

if [ ! -f ".next/BUILD_ID" ]; then
    echo -e "${RED}ERROR: Build failed. .next/BUILD_ID not found.${NC}"
    echo "  Check build errors above and fix before retrying."
    exit 1
fi
echo -e "  ${GREEN}Build: OK (BUILD_ID: $(cat .next/BUILD_ID))${NC}"

# -- [3/3] Start production server --------------------------------------------
echo ""
echo -e "${CYAN}[3/3] Starting production server (port 3000)...${NC}"

# Kill any existing process on port 3000
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

nohup sh -c "PORT=3000 npm run start" > /tmp/awsops-server.log 2>&1 &
sleep 3

# Verify server is responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/awsops 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "  ${GREEN}Server running: http://localhost:3000/awsops (HTTP 200)${NC}"
else
    echo -e "${RED}ERROR: Server not responding (HTTP $HTTP_CODE).${NC}"
    echo "  Log output:"
    tail -10 /tmp/awsops-server.log
    exit 1
fi

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 3 Complete: Production server running${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Server:  http://localhost:3000/awsops"
echo "  Log:     /tmp/awsops-server.log"
echo "  Build:   production (npm run build + npm run start)"
echo ""
echo "  Known query fixes already applied in src/lib/queries/:"
echo "    - s3.ts:         versioning_enabled (not versioning)"
echo "    - iam.ts:        mfa_enabled removed (SCP blocks ListMFADevices)"
echo "    - lambda.ts:     tags removed from list (SCP blocks GetFunction)"
echo "    - security.ts:   trivy_scan_vulnerability (not trivy_vulnerability)"
echo "    - security.ts:   open_sgs alias (not open_security_groups)"
echo "    - k8s.ts:        conditions LIKE instead of jsonb_path_exists \$"
echo "    - cloudtrail.ts: events lazy-loaded (>60s query)"
echo "    - rds.ts:        class AS db_instance_class"
echo "    - ecs.ts:        \"group\" AS group_name (reserved word)"
echo ""
