#!/bin/bash
set -e
################################################################################
#                                                                              #
#   AWSops Dashboard - Stop All Services                                       #
#                                                                              #
#   Stops:                                                                     #
#     1. Next.js server (port 3000)                                            #
#     2. Steampipe service (embedded PostgreSQL, port 9193)                    #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   AWSops Dashboard - Stop All Services${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/2] Stop Next.js -------------------------------------------------------
echo -e "${CYAN}[1/2] Stopping Next.js (port 3000)...${NC}"
if fuser 3000/tcp 2>/dev/null; then
    fuser -k 3000/tcp 2>/dev/null || true
    echo -e "  ${GREEN}Stopped${NC}"
else
    echo "  Not running"
fi

# -- [2/2] Stop Steampipe ------------------------------------------------------
echo ""
echo -e "${CYAN}[2/2] Stopping Steampipe service...${NC}"
if steampipe service status 2>&1 | grep -q "running"; then
    steampipe service stop --force 2>/dev/null || true
    echo -e "  ${GREEN}Stopped${NC}"
else
    echo "  Not running"
fi

# -- Confirm -------------------------------------------------------------------
echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Status${NC}"
echo -e "${CYAN}=================================================================${NC}"

# Verify Next.js stopped
if fuser 3000/tcp 2>/dev/null; then
    echo -e "  ${RED}WARN${NC} Next.js still running on port 3000"
else
    echo -e "  ${GREEN}OK${NC}  Next.js stopped"
fi

# Verify Steampipe stopped
if steampipe service status 2>&1 | grep -q "running"; then
    echo -e "  ${RED}WARN${NC} Steampipe still running"
else
    echo -e "  ${GREEN}OK${NC}  Steampipe stopped"
fi

echo ""
echo "  All services stopped."
echo ""
