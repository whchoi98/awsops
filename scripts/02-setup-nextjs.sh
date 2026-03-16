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
#     4. Detect Direct Payer vs MSP Payer (Cost Explorer availability)         #
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
#   --database-listen network: allows VPC Lambda (steampipe-query) to connect
#   EC2 Security Group controls access (only Lambda SG allowed on 9193)
steampipe service start --database-listen network --database-port 9193

SP_PASSWORD=$(steampipe service status --show-password 2>&1 | grep Password | awk '{print $2}')
if [ -z "$SP_PASSWORD" ]; then
    echo -e "${RED}ERROR: Could not retrieve Steampipe password.${NC}"
    echo "  Run: steampipe service status --show-password"
    exit 1
fi

PRIVATE_IP=$(hostname -I | awk '{print $1}')
echo "  Port:       9193"
echo "  Listen:     network (localhost + $PRIVATE_IP)"
echo "  User:       steampipe"
echo "  Password:   ${SP_PASSWORD:0:4}****"
echo "  Connection: postgres://steampipe:****@${PRIVATE_IP}:9193/steampipe"

# -- [3/3] Auto-sync password to steampipe.ts ----------------------------------
#   steampipe.ts uses pg Pool (NOT CLI) for performance:
#     - max: 3 connections (prevents pool exhaustion)
#     - statement_timeout: 120s (handles slow queries like CloudTrail)
#     - batchQuery: 3 queries at a time (prevents pool starvation)
#   See: docs/TROUBLESHOOTING.md #4 (Steampipe 성능)
echo ""
echo -e "${CYAN}[3/3] Syncing password to data/config.json...${NC}"

# steampipe.ts는 data/config.json에서 비밀번호를 읽음 (평문 하드코딩 제거)
# steampipe.ts reads password from data/config.json (no more plaintext hardcoding)
mkdir -p "$WORK_DIR/data"
CONFIG_FILE="$WORK_DIR/data/config.json"
if [ -f "$CONFIG_FILE" ]; then
    python3 -c "
import json
cfg = json.load(open('${CONFIG_FILE}'))
cfg['steampipePassword'] = '${SP_PASSWORD}'
json.dump(cfg, open('${CONFIG_FILE}', 'w'), indent=2)
"
    echo -e "  ${GREEN}Updated steampipePassword in config.json${NC}"
else
    echo "{\"costEnabled\":true,\"steampipePassword\":\"${SP_PASSWORD}\"}" > "$CONFIG_FILE"
    echo -e "  ${GREEN}Created config.json with steampipePassword${NC}"
fi

# -- [4/4] Detect account type + initialize multi-account config -------------
#   MSP/Payer 관리 계정에서는 Cost Explorer API가 SCP로 차단됨
#   설치 시 한 번 판별하여 data/config.json에 저장 → 런타임에 불필요한 쿼리 스킵
#   MULTI-ACCOUNT: 호스트 계정을 accounts 배열에 초기 등록
echo ""
echo -e "${CYAN}[4/4] Detecting account type + initializing multi-account config...${NC}"

mkdir -p "$WORK_DIR/data"
CONFIG_FILE="$WORK_DIR/data/config.json"

# Detect Cost Explorer availability
COST_RESULT=$(PGPASSWORD="$SP_PASSWORD" psql -h localhost -p 9193 -U steampipe -d steampipe \
  -c "SELECT 1 FROM aws_cost_by_service_monthly LIMIT 1" -t -A 2>&1 || echo "COST_FAIL")

if echo "$COST_RESULT" | grep -q "^1$"; then
    COST_ENABLED=true
    echo -e "  ${GREEN}Direct Payer — Cost Explorer enabled${NC}"
else
    COST_ENABLED=false
    echo -e "  ${YELLOW}MSP/Payer account — Cost Explorer disabled${NC}"
    echo -e "  ${YELLOW}Cost menu and queries will be hidden at runtime${NC}"
    if echo "$COST_RESULT" | grep -qi "permission denied\|AccessDenied\|not authorized"; then
        echo "  Reason: Access denied (SCP restriction)"
    elif echo "$COST_RESULT" | grep -qi "timeout\|canceling"; then
        echo "  Reason: Query timed out"
    else
        echo "  Reason: $COST_RESULT"
    fi
fi

# Detect EKS availability
EKS_ENABLED=false
if aws eks list-clusters --query 'clusters[0]' --output text 2>/dev/null | grep -qv "None"; then
    EKS_ENABLED=true
    echo -e "  ${GREEN}EKS clusters detected${NC}"
else
    echo -e "  ${YELLOW}No EKS clusters found${NC}"
fi

# Update config.json (preserve existing fields, add costEnabled + accounts)
python3 -c "
import json, os
cfg_path = '${CONFIG_FILE}'
cfg = {}
if os.path.exists(cfg_path):
    try:
        cfg = json.load(open(cfg_path))
    except:
        cfg = {}

cost_enabled = '${COST_ENABLED}' == 'true'
eks_enabled = '${EKS_ENABLED}' == 'true'

# Global costEnabled flag (backward compatible)
cfg['costEnabled'] = cost_enabled

# Initialize accounts array with host account
account_id = '${ACCOUNT_ID}'
region = '${REGION}'
host_entry = {
    'accountId': account_id,
    'alias': 'Host',
    'connectionName': 'aws_' + account_id,
    'region': region,
    'isHost': True,
    'features': {
        'costEnabled': cost_enabled,
        'eksEnabled': eks_enabled,
        'k8sEnabled': eks_enabled
    }
}

if 'accounts' not in cfg:
    cfg['accounts'] = []

# Update or add host account entry
host_idx = next((i for i, a in enumerate(cfg['accounts']) if a.get('accountId') == account_id), -1)
if host_idx >= 0:
    cfg['accounts'][host_idx] = host_entry
else:
    cfg['accounts'].insert(0, host_entry)

json.dump(cfg, open(cfg_path, 'w'), indent=2)
print(f'  Config updated: costEnabled={cost_enabled}, accounts=[{len(cfg[\"accounts\"])} entries]')
"

echo -e "  ${GREEN}Host account ${ACCOUNT_ID} registered in config.json accounts[]${NC}"

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
