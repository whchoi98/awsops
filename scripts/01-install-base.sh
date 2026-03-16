#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 1: Steampipe + Plugins + Powerpipe Installation                       #
#                                                                              #
#   Installs:                                                                  #
#     - Steampipe (with embedded PostgreSQL)                                   #
#     - Plugins: aws, kubernetes, trivy                                        #
#     - Powerpipe + CIS Benchmark mod                                          #
#                                                                              #
#   Known issues handled:                                                      #
#     - SCP blocked APIs -> ignore_error_codes in aws.spc                      #
#     - Trivy table -> use trivy_scan_vulnerability (NOT trivy_vulnerability)  #
#     - PostgreSQL 별도 설치 불필요 (Steampipe 내장)                               #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 1: Steampipe + Plugins + Powerpipe${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/6] Install Steampipe --------------------------------------------------
echo -e "${CYAN}[1/6] Installing Steampipe...${NC}"
if ! command -v steampipe &>/dev/null; then
    sudo /bin/sh -c "$(curl -fsSL https://steampipe.io/install/steampipe.sh)"
    echo -e "  ${GREEN}Installed$(steampipe --version 2>/dev/null | head -1)${NC}"
else
    echo "  Already installed: $(steampipe --version 2>/dev/null | head -1)"
fi

# -- [2/6] Install Steampipe Plugins ------------------------------------------
echo ""
echo -e "${CYAN}[2/6] Installing Steampipe plugins (aws, kubernetes, trivy)...${NC}"
steampipe plugin install aws 2>/dev/null || true
steampipe plugin install kubernetes 2>/dev/null || true
steampipe plugin install trivy 2>/dev/null || true
echo "  Plugins: aws, kubernetes, trivy"

# -- [3/6] Configure AWS Plugin -----------------------------------------------
#   KNOWN ISSUE: SCP (Service Control Policy) blocks certain APIs like
#   iam:ListMFADevices, lambda:GetFunction. Without ignore_error_codes,
#   the entire query fails when a single hydrate column is blocked.
#   See: docs/TROUBLESHOOTING.md #2 (SCP 차단)
#
#   MULTI-ACCOUNT: From the start, we use aggregator structure:
#     - Host account connection: "aws_{ACCOUNT_ID}" (individual)
#     - Aggregator connection: "aws" (type=aggregator, connections=["aws_*"])
#   This way, single-account works identically (aggregator wraps one connection),
#   and adding accounts later via the /accounts UI page is seamless.
echo ""
echo -e "${CYAN}[3/6] Configuring AWS plugin (aws.spc) with aggregator structure...${NC}"
# 배포 리전만 조회 (모든 리전 조회 시 30+ 리전으로 타임아웃 발생)
# Only query the deployment region (querying all regions causes timeout)
echo -e "  ${YELLOW}NOTE: regions = [\"$REGION\"] (배포 리전만 조회 / deployment region only)${NC}"
echo -e "  ${YELLOW}  모든 리전 조회가 필요하면: regions = [\"*\"] 로 변경${NC}"
echo -e "  ${YELLOW}NOTE: Host account = aws_${ACCOUNT_ID}, Aggregator = aws (multi-account ready)${NC}"
cat > ~/.steampipe/config/aws.spc << EOF
# Host account connection (individual)
# 호스트 계정 개별 연결
connection "aws_${ACCOUNT_ID}" {
  plugin = "aws"

  # 배포 리전만 조회 (성능 최적화) / Query deployment region only (performance)
  # 모든 리전 필요 시 ["*"] 로 변경 / Change to ["*"] for all regions
  regions = ["$REGION"]

  # SCP/권한 에러 무시 / Ignore SCP/permission errors
  ignore_error_codes = [
    "AccessDenied",
    "AccessDeniedException",
    "NotAuthorized",
    "UnauthorizedOperation",
    "UnrecognizedClientException",
    "AuthorizationError"
  ]
}

# Aggregator: combines all aws_* connections
# 싱글 어카운트에서도 동일하게 동작 (aws_* 하나만 포함)
# 멀티 어카운트 추가 시 /accounts UI 페이지에서 aws_* 연결 추가
connection "aws" {
  plugin      = "aws"
  type        = "aggregator"
  connections = ["aws_*"]
}
EOF
echo "  Written: ~/.steampipe/config/aws.spc"
echo "  Host connection: aws_${ACCOUNT_ID}"
echo "  Aggregator: aws (connections = [\"aws_*\"])"
echo -e "  ${YELLOW}NOTE: ignore_error_codes set for SCP-blocked API handling${NC}"

# -- [4/6] Configure Kubernetes Plugin ----------------------------------------
echo ""
echo -e "${CYAN}[4/6] Configuring Kubernetes plugin (kubernetes.spc)...${NC}"
cat > ~/.steampipe/config/kubernetes.spc << 'EOF'
connection "kubernetes" {
  plugin = "kubernetes"

  # Kubeconfig: uses ~/.kube/config by default
  # To specify context: config_context = "my-eks-cluster"

  # Enable all custom resource tables (CRDs)
  custom_resource_tables = ["*"]
}
EOF
echo "  Written: ~/.steampipe/config/kubernetes.spc"

# -- [5/6] Configure Trivy Plugin ---------------------------------------------
#   KNOWN ISSUE: Use trivy_scan_vulnerability table, NOT trivy_vulnerability.
#   trivy_vulnerability = CVE database itself (static)
#   trivy_scan_vulnerability = actual scan results against images/paths
#   See: docs/TROUBLESHOOTING.md #1 (Trivy 테이블)
echo ""
echo -e "${CYAN}[5/6] Configuring Trivy plugin (trivy.spc)...${NC}"
cat > ~/.steampipe/config/trivy.spc << 'EOF'
connection "trivy" {
  plugin = "trivy"
  # Scan specific images:
  # images = ["nginx:latest"]
  # Scan filesystem paths:
  # paths = ["/path/to/scan"]
}
EOF
echo "  Written: ~/.steampipe/config/trivy.spc"
echo -e "  ${YELLOW}NOTE: Use trivy_scan_vulnerability table (NOT trivy_vulnerability)${NC}"

# -- [6/6] Install Powerpipe + CIS Mod ----------------------------------------
echo ""
echo -e "${CYAN}[6/6] Installing Powerpipe + CIS Benchmark mod...${NC}"
if ! command -v powerpipe &>/dev/null; then
    sudo /bin/sh -c "$(curl -fsSL https://powerpipe.io/install/powerpipe.sh)"
    echo "  Installed: $(powerpipe --version 2>/dev/null | head -1)"
else
    echo "  Already installed: $(powerpipe --version 2>/dev/null | head -1)"
fi

mkdir -p "$WORK_DIR/powerpipe" && cd "$WORK_DIR/powerpipe"
[ -f mod.pp ] || powerpipe mod init 2>/dev/null
powerpipe mod install github.com/turbot/steampipe-mod-aws-compliance 2>/dev/null || true
echo "  CIS Benchmark mod installed in $WORK_DIR/powerpipe/"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 1 Complete: Steampipe + Powerpipe installed${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Steampipe:  $(steampipe --version 2>/dev/null | head -1)"
echo "  Powerpipe:  $(powerpipe --version 2>/dev/null | head -1)"
echo "  Plugins:    aws, kubernetes, trivy"
echo "  Configs:    ~/.steampipe/config/{aws,kubernetes,trivy}.spc"
echo "  Powerpipe:  $WORK_DIR/powerpipe/ (CIS mod)"
echo ""
echo "  NOTE: PostgreSQL 별도 설치 불필요"
echo "    Steampipe에 PostgreSQL이 내장 (~/.steampipe/db/)"
echo "    다음 단계(02)에서 steampipe service start로 자동 시작"
echo ""
echo "  Known issues handled:"
echo "    - SCP blocked APIs  -> ignore_error_codes in aws.spc"
echo "    - Trivy table       -> trivy_scan_vulnerability (not trivy_vulnerability)"
echo "    - K8s custom tables -> custom_resource_tables = [\"*\"]"
echo ""
