#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 2: Next.js + Steampipe Service Setup                                  #
#                                                                              #
#   Actions:                                                                   #
#     1. npm install (Node.js dependencies)                                    #
#     2. Start Steampipe embedded PostgreSQL (port 9193)                       #
#     3. Auto-sync password to src/lib/steampipe.ts                            #
#                                                                              #
#   Architecture:                                                              #
#     Next.js (pg Pool) -> Steampipe PostgreSQL (9193) -> AWS/K8s/Trivy API    #
#                                                                              #
#   Known issues handled:                                                      #
#     - pg Pool (0.006s) NOT CLI (4s per query)                                #
#     - Pool max:3, batch:3, timeout:120s                                      #
#     - PostgreSQL 별도 설치 불필요 (Steampipe 내장)                               #
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
echo -e "${CYAN}   Step 2: Next.js + Steampipe Service Setup${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/3] npm install ---------------------------------------------------------
echo -e "${CYAN}[1/3] Installing npm dependencies...${NC}"
npm install 2>&1 | tail -3
echo "  Node.js: $(node --version), npm: $(npm --version)"

# -- [2/3] Start Steampipe as PostgreSQL service --------------------------------
#   NOTE: PostgreSQL 별도 설치 불필요
#   Steampipe에 PostgreSQL이 내장되어 있음 (~/.steampipe/db/)
#   `steampipe service start` 명령으로 내장 PostgreSQL이 시작됨
#
#   PERFORMANCE FIX:
#     CLI mode  (steampipe query "SQL") -> ~4s/query (process spawn overhead)
#     pg Pool   (direct connection)     -> ~0.006s/query (660x faster)
#   See: docs/TROUBLESHOOTING.md #4 (CLI vs PostgreSQL)
echo ""
echo -e "${CYAN}[2/3] Starting Steampipe embedded PostgreSQL (port 9193)...${NC}"
echo -e "  ${YELLOW}NOTE: PostgreSQL 별도 설치 불필요 (Steampipe에 내장)${NC}"

steampipe service stop --force 2>/dev/null || true
sleep 2
steampipe service start --database-listen local --database-port 9193

SP_PASSWORD=$(steampipe service status --show-password 2>&1 | grep Password | awk '{print $2}')
if [ -z "$SP_PASSWORD" ]; then
    echo -e "${RED}ERROR: Could not retrieve Steampipe password.${NC}"
    echo "  Run: steampipe service status --show-password"
    exit 1
fi

echo "  Port:       9193"
echo "  User:       steampipe"
echo "  Password:   ${SP_PASSWORD:0:4}****"
echo "  Connection: postgres://steampipe:****@127.0.0.1:9193/steampipe"

# -- [3/3] Auto-sync password to steampipe.ts ----------------------------------
#   steampipe.ts uses pg Pool (NOT CLI) for performance:
#     - max: 3 connections (prevents pool exhaustion)
#     - statement_timeout: 120s (handles slow queries like CloudTrail)
#     - batchQuery: 3 queries at a time (prevents pool starvation)
#   See: docs/TROUBLESHOOTING.md #4 (Steampipe 성능)
echo ""
echo -e "${CYAN}[3/3] Syncing password to steampipe.ts...${NC}"

STEAMPIPE_FILE="$WORK_DIR/src/lib/steampipe.ts"
if [ -f "$STEAMPIPE_FILE" ]; then
    CURRENT_PW=$(grep "password:" "$STEAMPIPE_FILE" | head -1 | grep -oP "'[^']+'" | tr -d "'" || echo "")
    if [ "$CURRENT_PW" != "$SP_PASSWORD" ] && [ -n "$SP_PASSWORD" ]; then
        sed -i "s|password: '$CURRENT_PW'|password: '$SP_PASSWORD'|" "$STEAMPIPE_FILE"
        echo -e "  ${GREEN}Updated password in steampipe.ts${NC}"
    else
        echo "  Password already matches - no update needed"
    fi
else
    echo -e "${RED}ERROR: $STEAMPIPE_FILE not found${NC}"
    exit 1
fi

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 2 Complete: Next.js + Steampipe ready${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Database Architecture:"
echo "    +-----------+       +----------------------------------+"
echo "    | Next.js   |------>| Steampipe Embedded PostgreSQL    |"
echo "    | (pg Pool) |       | port 9193 (별도 설치 불필요)      |"
echo "    +-----------+       |   +- aws plugin -> AWS API       |"
echo "                        |   +- kubernetes plugin -> K8s    |"
echo "                        |   +- trivy plugin -> CVE DB      |"
echo "                        +----------------------------------+"
echo ""
echo "  Performance: pg Pool (0.006s/query) NOT CLI (4s/query)"
echo ""
echo "  steampipe.ts settings:"
echo "    - max: 3 connections     (prevents pool exhaustion)"
echo "    - batch: 3 at a time     (prevents pool starvation)"
echo "    - timeout: 120s          (handles CloudTrail slow queries)"
echo "    - shell injection filter (pipe/ampersand/backtick blocked)"
echo ""
