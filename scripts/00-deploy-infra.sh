#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 0: EC2 인프라 배포 (CDK) / Deploy EC2 Infrastructure (CDK)            #
#                                                                              #
#   대화형으로 계정, 리전, VPC를 선택합니다.                                     #
#   Interactively select account, region, and VPC.                             #
#                                                                              #
#   CDK 프로젝트: infra-cdk/ / CDK Project: infra-cdk/                          #
#   기본값: t4g.2xlarge (ARM64 Graviton)                                        #
#                                                                              #
#   환경 변수 (선택, 대화형 대체) / Environment variables (optional):            #
#     AWS_PROFILE          - AWS CLI 프로파일 / AWS CLI profile                  #
#     VSCODE_PASSWORD      - VSCode 비밀번호 / VSCode password                  #
#     INSTANCE_TYPE        - EC2 타입 [t4g.2xlarge]                             #
#     CUSTOM_DOMAIN        - 커스텀 도메인 (Route53) / Custom domain             #
#     TRANSIT_GATEWAY_ID   - Transit Gateway ID (선택)                           #
#     TGW_ROUTE_CIDR       - TGW 라우트 CIDR [10.254.0.0/16]                    #
#                                                                              #
################################################################################

# -- 색상 / Colors ------------------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
BOLD='\033[1m'; DIM='\033[2m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CDK_DIR="$WORK_DIR/infra-cdk"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   AWSops 대시보드 인프라 배포 / Infrastructure Deployment${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

###############################################################################
#  [1/10] 사전 점검 / Pre-flight checks                                        #
###############################################################################
echo -e "${CYAN}[1/10] 사전 점검 / Pre-flight checks...${NC}"

for cmd in aws node npm; do
    if ! command -v "$cmd" &>/dev/null; then
        echo -e "${RED}오류: $cmd 를 찾을 수 없습니다 / ERROR: $cmd not found${NC}"
        exit 1
    fi
done
echo "  aws:  $(aws --version 2>&1 | head -1)"
echo "  node: $(node --version)  npm: $(npm --version)"

echo ""
echo -e "  ${BOLD}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "  ${BOLD}│  필요 권한 안내 / Required Permissions                       │${NC}"
echo -e "  ${BOLD}├─────────────────────────────────────────────────────────────┤${NC}"
echo -e "  │                                                             │"
echo -e "  │  배포 계정에 다음 권한이 필요합니다:                          │"
echo -e "  │  The deployment account needs these permissions:             │"
echo -e "  │                                                             │"
echo -e "  │  ${GREEN}필수 / Required:${NC}                                          │"
echo -e "  │    - CloudFormation (스택 생성/관리 / stack CRUD)             │"
echo -e "  │    - EC2 (VPC, 서브넷, SG, 인스턴스 / instance, VPC, SG)     │"
echo -e "  │    - ELB (ALB, 타겟 그룹 / ALB, target groups)              │"
echo -e "  │    - CloudFront (배포 생성 / distribution)                   │"
echo -e "  │    - IAM (역할 생성 / role creation)                         │"
echo -e "  │    - SSM (세션 매니저 / Session Manager)                     │"
echo -e "  │    - S3 (CDK 에셋 버킷 / CDK asset bucket)                  │"
echo -e "  │    - Lambda (VPC 엔드포인트 / VPC endpoints)                 │"
echo -e "  │                                                             │"
echo -e "  │  ${YELLOW}선택 (추후 설치 시) / Optional (for later steps):${NC}          │"
echo -e "  │    - Cognito (인증 / authentication)                        │"
echo -e "  │    - Bedrock AgentCore (AI 에이전트 / AI agent)              │"
echo -e "  │    - ECR (Docker 이미지 / Docker images)                    │"
echo -e "  │    - Lambda@Edge (us-east-1, CloudFront 인증)               │"
echo -e "  │                                                             │"
echo -e "  │  ${DIM}권장: AdministratorAccess 또는 PowerUserAccess${NC}           │"
echo -e "  │  ${DIM}Recommended: AdministratorAccess or PowerUserAccess${NC}     │"
echo -e "  │                                                             │"
echo -e "  ${BOLD}└─────────────────────────────────────────────────────────────┘${NC}"

###############################################################################
#  [2/10] 계정 선택 / Account Selection                                         #
###############################################################################
echo ""
echo -e "${CYAN}[2/10] AWS 계정 선택 / Account Selection...${NC}"
echo ""

# 현재 자격 증명으로 계정 확인 / Check current credentials
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
CURRENT_USER=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null || echo "")

if [ -n "$CURRENT_ACCOUNT" ]; then
    echo -e "  현재 자격 증명 / Current credentials:"
    echo "    계정 / Account: $CURRENT_ACCOUNT"
    echo "    사용자 / User:  $CURRENT_USER"
    echo ""
fi

echo -e "${BOLD}  계정 옵션 선택 / Select account option:${NC}"
echo ""
echo "    1) 현재 자격 증명 사용 / Use current credentials ($CURRENT_ACCOUNT)"
echo "    2) AWS 프로파일 선택 / Select AWS profile"
echo "    3) Access Key 직접 입력 / Enter Access Key manually"
echo ""
read -p "  번호 입력 / Enter number [1]: " ACCT_CHOICE
ACCT_CHOICE="${ACCT_CHOICE:-1}"

case "$ACCT_CHOICE" in
    2)
        # 프로파일 목록 / List profiles
        echo ""
        echo -e "  ${CYAN}사용 가능한 프로파일 / Available profiles:${NC}"
        PROFILES=($(aws configure list-profiles 2>/dev/null || echo "default"))
        for i in "${!PROFILES[@]}"; do
            PROF_ACCT=$(aws sts get-caller-identity --profile "${PROFILES[$i]}" --query Account --output text 2>/dev/null || echo "?")
            printf "    %2d) %-20s (계정 / Account: %s)\n" $((i+1)) "${PROFILES[$i]}" "$PROF_ACCT"
        done
        echo ""
        read -p "  프로파일 번호 / Profile number: " PROF_CHOICE
        if [[ "$PROF_CHOICE" =~ ^[0-9]+$ ]] && [ "$PROF_CHOICE" -ge 1 ] && [ "$PROF_CHOICE" -le "${#PROFILES[@]}" ]; then
            export AWS_PROFILE="${PROFILES[$((PROF_CHOICE-1))]}"
            echo -e "  ${GREEN}프로파일 설정: $AWS_PROFILE${NC}"
        fi
        ;;
    3)
        # 직접 입력 / Manual entry
        echo ""
        read -p "  AWS Access Key ID: " INPUT_ACCESS_KEY
        read -sp "  AWS Secret Access Key: " INPUT_SECRET_KEY
        echo ""
        read -p "  리전 (예: ap-northeast-2): " INPUT_REGION

        # 임시 프로파일 생성 / Create temp profile
        aws configure set aws_access_key_id "$INPUT_ACCESS_KEY" --profile awsops-deploy
        aws configure set aws_secret_access_key "$INPUT_SECRET_KEY" --profile awsops-deploy
        aws configure set region "${INPUT_REGION:-ap-northeast-2}" --profile awsops-deploy
        export AWS_PROFILE="awsops-deploy"
        echo -e "  ${GREEN}자격 증명 설정 완료 / Credentials configured${NC}"
        ;;
    *)
        echo "  현재 자격 증명 사용 / Using current credentials"
        ;;
esac

# 최종 계정 확인 / Final account verification
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")
if [ "$ACCOUNT_ID" = "unknown" ]; then
    echo -e "${RED}오류: AWS 계정 확인 실패 / ERROR: Cannot verify AWS account${NC}"
    exit 1
fi
echo -e "  ${GREEN}계정 확인 / Account verified: $ACCOUNT_ID${NC}"

###############################################################################
#  [3/10] 리전 선택 / Region Selection                                          #
###############################################################################
echo ""
echo -e "${CYAN}[3/10] 리전 선택 / Region Selection...${NC}"
echo ""
echo -e "${BOLD}  배포할 리전을 선택하세요 / Select deployment region:${NC}"
echo ""

REGIONS=(
    "ap-northeast-2:서울 / Seoul"
    "ap-northeast-1:도쿄 / Tokyo"
    "ap-northeast-3:오사카 / Osaka"
    "ap-southeast-1:싱가포르 / Singapore"
    "ap-southeast-2:시드니 / Sydney"
    "ap-south-1:뭄바이 / Mumbai"
    "us-east-1:버지니아 / N. Virginia"
    "us-east-2:오하이오 / Ohio"
    "us-west-2:오레곤 / Oregon"
    "eu-west-1:아일랜드 / Ireland"
    "eu-central-1:프랑크푸르트 / Frankfurt"
    "eu-west-2:런던 / London"
    "sa-east-1:상파울루 / São Paulo"
)

for i in "${!REGIONS[@]}"; do
    RCODE="${REGIONS[$i]%%:*}"
    RNAME="${REGIONS[$i]##*:}"
    MARKER=""
    [ "$RCODE" = "ap-northeast-2" ] && MARKER=" ${YELLOW}(기본값 / default)${NC}"
    printf "    %2d) %-20s %s" $((i+1)) "$RCODE" "$RNAME"
    echo -e "$MARKER"
done
echo ""
read -p "  번호 입력 / Enter number [1]: " REGION_CHOICE
REGION_CHOICE="${REGION_CHOICE:-1}"

if [[ "$REGION_CHOICE" =~ ^[0-9]+$ ]] && [ "$REGION_CHOICE" -ge 1 ] && [ "$REGION_CHOICE" -le "${#REGIONS[@]}" ]; then
    REGION="${REGIONS[$((REGION_CHOICE-1))]%%:*}"
else
    REGION="ap-northeast-2"
fi

echo -e "  ${GREEN}선택된 리전 / Selected: $REGION${NC}"
export AWS_DEFAULT_REGION="$REGION"

###############################################################################
#  [4/10] VPC 선택 / VPC Selection                                              #
###############################################################################
echo ""
echo -e "${CYAN}[4/10] VPC 선택 / VPC Selection...${NC}"
echo ""
echo -e "${BOLD}  VPC 옵션을 선택하세요 / Select VPC option:${NC}"
echo ""
echo "    1) 새 VPC 생성 / Create new VPC (CIDR 입력 가능, 2 Public + 2 Private subnets)"
echo "    2) 기존 VPC 선택 / Use existing VPC from account"
echo ""
read -p "  번호 입력 / Enter number [1]: " VPC_CHOICE
VPC_CHOICE="${VPC_CHOICE:-1}"

USE_EXISTING_VPC="false"
EXISTING_VPC_ID=""
NEW_VPC_CIDR=""

if [ "$VPC_CHOICE" = "1" ]; then
    echo ""
    echo -e "  ${CYAN}새 VPC CIDR 입력 / Enter new VPC CIDR${NC}"
    echo -e "  기본값 / Default: 10.10.0.0/16"
    read -p "  CIDR [10.10.0.0/16]: " NEW_VPC_CIDR
    NEW_VPC_CIDR="${NEW_VPC_CIDR:-10.10.0.0/16}"
    if ! echo "$NEW_VPC_CIDR" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$'; then
        echo -e "  ${RED}잘못된 CIDR 형식 / Invalid CIDR format${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓ VPC CIDR: $NEW_VPC_CIDR${NC}"
elif [ "$VPC_CHOICE" = "2" ]; then
    echo ""
    echo -e "  ${CYAN}$REGION 리전의 VPC 목록 조회 중... / Listing VPCs in $REGION...${NC}"
    echo ""

    VPC_JSON=$(aws ec2 describe-vpcs --region "$REGION" --output json 2>/dev/null)
    VPC_COUNT=$(echo "$VPC_JSON" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('Vpcs',[])))")

    if [ "$VPC_COUNT" = "0" ]; then
        echo -e "  ${YELLOW}VPC가 없습니다. 새 VPC를 생성합니다.${NC}"
        echo -e "  ${YELLOW}No VPCs found. Will create a new VPC.${NC}"
    else
        # VPC 목록 출력 / Display VPC list
        echo "$VPC_JSON" | python3 -c "
import json, sys
vpcs = json.load(sys.stdin).get('Vpcs', [])
for i, v in enumerate(vpcs):
    name = next((t['Value'] for t in v.get('Tags', []) if t['Key'] == 'Name'), '(이름 없음 / no name)')
    cidr = v.get('CidrBlock', '?')
    vid = v['VpcId']
    default = ' [기본 / default]' if v.get('IsDefault') else ''
    print('    {:2d}) {:25s} {:18s} {}{}'.format(i+1, vid, cidr, name, default))
"
        echo ""

        VPC_IDS=($(echo "$VPC_JSON" | python3 -c "import json,sys;[print(v['VpcId']) for v in json.load(sys.stdin).get('Vpcs',[])]"))

        read -p "  VPC 번호 선택 / Select VPC number: " VPC_SELECT

        if [[ "$VPC_SELECT" =~ ^[0-9]+$ ]] && [ "$VPC_SELECT" -ge 1 ] && [ "$VPC_SELECT" -le "${#VPC_IDS[@]}" ]; then
            EXISTING_VPC_ID="${VPC_IDS[$((VPC_SELECT-1))]}"
            USE_EXISTING_VPC="true"

            # 서브넷 상세 / Subnet details
            echo ""
            echo -e "  ${CYAN}$EXISTING_VPC_ID 서브넷 정보 / Subnet info:${NC}"
            aws ec2 describe-subnets --filters "Name=vpc-id,Values=$EXISTING_VPC_ID" \
                --region "$REGION" --output json 2>/dev/null | python3 -c "
import json, sys
subnets = json.load(sys.stdin).get('Subnets', [])
pub = [s for s in subnets if s.get('MapPublicIpOnLaunch')]
priv = [s for s in subnets if not s.get('MapPublicIpOnLaunch')]
print('    퍼블릭 서브넷 / Public:  {} 개'.format(len(pub)))
for s in pub:
    name = next((t['Value'] for t in s.get('Tags',[]) if t['Key']=='Name'), '')
    print('      {} {} {}'.format(s['SubnetId'], s['AvailabilityZone'], name))
print('    프라이빗 서브넷 / Private: {} 개'.format(len(priv)))
for s in priv:
    name = next((t['Value'] for t in s.get('Tags',[]) if t['Key']=='Name'), '')
    print('      {} {} {}'.format(s['SubnetId'], s['AvailabilityZone'], name))

if len(pub) < 1 or len(priv) < 1:
    print()
    print('    ⚠ 경고: 퍼블릭 + 프라이빗 서브넷이 각각 1개 이상 필요합니다.')
    print('    ⚠ WARNING: Need at least 1 public + 1 private subnet.')
"
            # NAT Gateway 확인 / Check NAT Gateway
            NAT_COUNT=$(aws ec2 describe-nat-gateways \
                --filter "Name=vpc-id,Values=$EXISTING_VPC_ID" "Name=state,Values=available" \
                --query "NatGateways[*].NatGatewayId" --output text --region "$REGION" 2>/dev/null | wc -w)
            IGW_COUNT=$(aws ec2 describe-internet-gateways \
                --filters "Name=attachment.vpc-id,Values=$EXISTING_VPC_ID" \
                --query "InternetGateways[*].InternetGatewayId" --output text --region "$REGION" 2>/dev/null | wc -w)
            echo "    Internet Gateway:     $IGW_COUNT 개"
            echo "    NAT Gateway:          $NAT_COUNT 개"

            if [ "$NAT_COUNT" -lt 1 ]; then
                echo -e "    ${YELLOW}⚠ NAT Gateway 없음 - 프라이빗 서브넷 인터넷 접근 불가${NC}"
            fi
        else
            echo -e "  ${YELLOW}잘못된 선택 / Invalid selection. 새 VPC 생성.${NC}"
        fi
    fi
fi

echo ""
SKIP_VPC_ENDPOINTS="false"
VPC_CIDR=""

if [ "$USE_EXISTING_VPC" = "true" ]; then
    echo -e "  ${GREEN}✓ 기존 VPC 사용 / Using existing VPC: $EXISTING_VPC_ID${NC}"

    # VPC CIDR 조회 / Get VPC CIDR
    VPC_CIDR=$(aws ec2 describe-vpcs --vpc-ids "$EXISTING_VPC_ID" --region "$REGION" \
        --query "Vpcs[0].CidrBlock" --output text 2>/dev/null || echo "10.0.0.0/8")
    echo "  VPC CIDR: $VPC_CIDR"

    # SSM VPC Endpoint 존재 여부 확인 / Check if SSM endpoints already exist
    echo ""
    echo -e "  ${CYAN}VPC Endpoint 확인 중... / Checking VPC Endpoints...${NC}"
    EXISTING_ENDPOINTS=$(aws ec2 describe-vpc-endpoints \
        --filters "Name=vpc-id,Values=$EXISTING_VPC_ID" "Name=vpc-endpoint-state,Values=available" \
        --query "VpcEndpoints[*].ServiceName" --output text --region "$REGION" 2>/dev/null || echo "")

    SSM_EP="없음 / missing"
    SSMMSG_EP="없음 / missing"
    EC2MSG_EP="없음 / missing"

    if echo "$EXISTING_ENDPOINTS" | grep -q "ssm\b"; then
        SSM_EP="있음 / exists ✓"
    fi
    if echo "$EXISTING_ENDPOINTS" | grep -q "ssmmessages"; then
        SSMMSG_EP="있음 / exists ✓"
    fi
    if echo "$EXISTING_ENDPOINTS" | grep -q "ec2messages"; then
        EC2MSG_EP="있음 / exists ✓"
    fi

    echo "    SSM Endpoint:         $SSM_EP"
    echo "    SSM Messages Endpoint: $SSMMSG_EP"
    echo "    EC2 Messages Endpoint: $EC2MSG_EP"

    # 3개 모두 있으면 건너뛰기 / Skip if all 3 exist
    if echo "$EXISTING_ENDPOINTS" | grep -q "ssm" && \
       echo "$EXISTING_ENDPOINTS" | grep -q "ssmmessages" && \
       echo "$EXISTING_ENDPOINTS" | grep -q "ec2messages"; then
        SKIP_VPC_ENDPOINTS="true"
        echo -e "  ${GREEN}✓ 모든 SSM Endpoint가 존재합니다. 생성 건너뜀.${NC}"
        echo -e "  ${GREEN}  All SSM Endpoints exist. Skipping creation.${NC}"
    else
        echo -e "  ${YELLOW}일부 Endpoint가 없습니다. 누락된 Endpoint를 생성합니다.${NC}"
        echo -e "  ${YELLOW}Some endpoints missing. Will create missing ones.${NC}"
        # 일부만 있으면 충돌 가능 → 전부 건너뛰고 수동 생성 안내
        # If some exist, CDK can't create only missing ones → skip all
        if [ "$SSM_EP" != "없음 / missing" ] || [ "$SSMMSG_EP" != "없음 / missing" ] || [ "$EC2MSG_EP" != "없음 / missing" ]; then
            SKIP_VPC_ENDPOINTS="true"
            echo -e "  ${YELLOW}⚠ 기존 Endpoint와 충돌 방지를 위해 CDK에서 건너뜁니다.${NC}"
            echo -e "  ${YELLOW}  Skipping in CDK to avoid conflict with existing endpoints.${NC}"
            echo -e "  ${YELLOW}  누락된 Endpoint는 수동 생성하세요.${NC}"
            echo -e "  ${YELLOW}  Create missing endpoints manually if needed.${NC}"
        fi
    fi
else
    echo -e "  ${GREEN}✓ 새 VPC 생성 / Creating new VPC ($NEW_VPC_CIDR)${NC}"
fi

###############################################################################
#  [5/10] Transit Gateway 연결 / TGW Connection (optional)                     #
###############################################################################
echo ""
echo -e "${CYAN}[5/10] Transit Gateway 연결 (선택) / TGW Connection (optional)...${NC}"
echo ""

TRANSIT_GATEWAY_ID="${TRANSIT_GATEWAY_ID:-}"
TGW_ROUTE_CIDRS=""

if [ -n "$TRANSIT_GATEWAY_ID" ]; then
    echo -e "  ${GREEN}환경변수에서 TGW 감지 / TGW from env: $TRANSIT_GATEWAY_ID${NC}"
    TGW_ROUTE_CIDRS="${TGW_ROUTE_CIDR:-}"
else
    echo -e "  Transit Gateway로 다른 VPC와 연결하시겠습니까?"
    echo -e "  Connect this VPC to other VPCs via Transit Gateway?"
    echo ""
    echo "    1) 건너뛰기 / Skip (TGW 연결 안 함)"
    echo "    2) TGW 선택 및 VPC 연결 / Select TGW and connect VPCs"
    echo ""
    read -p "  번호 입력 / Enter number [1]: " TGW_CHOICE
    TGW_CHOICE="${TGW_CHOICE:-1}"

    if [ "$TGW_CHOICE" = "2" ]; then
        echo -e "  ${CYAN}TGW 목록 조회 중... / Listing Transit Gateways...${NC}"
        TGW_JSON=$(aws ec2 describe-transit-gateways \
            --filters "Name=state,Values=available" \
            --region "$REGION" --output json 2>/dev/null)
        TGW_COUNT=$(echo "$TGW_JSON" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('TransitGateways',[])))")

        if [ "$TGW_COUNT" = "0" ]; then
            echo -e "  ${YELLOW}사용 가능한 TGW가 없습니다 / No available TGWs${NC}"
        else
            echo ""
            echo "$TGW_JSON" | python3 -c "
import json, sys
tgws = json.load(sys.stdin).get('TransitGateways', [])
for i, t in enumerate(tgws):
    name = next((tag['Value'] for tag in t.get('Tags', []) if tag['Key'] == 'Name'), '(이름 없음 / no name)')
    print('    {:2d}) {}  {}'.format(i+1, t['TransitGatewayId'], name))
"
            echo ""
            TGW_IDS=($(echo "$TGW_JSON" | python3 -c "import json,sys;[print(t['TransitGatewayId']) for t in json.load(sys.stdin).get('TransitGateways',[])]"))
            read -p "  TGW 번호 선택 / Select TGW number: " TGW_SELECT

            if [[ "$TGW_SELECT" =~ ^[0-9]+$ ]] && [ "$TGW_SELECT" -ge 1 ] && [ "$TGW_SELECT" -le "${#TGW_IDS[@]}" ]; then
                TRANSIT_GATEWAY_ID="${TGW_IDS[$((TGW_SELECT-1))]}"
                echo -e "  ${GREEN}✓ 선택 / Selected: $TRANSIT_GATEWAY_ID${NC}"

                # 연결할 VPC 멀티 선택 / Multi-select VPCs to connect
                echo ""
                echo -e "  ${CYAN}연결할 VPC를 선택하세요 (쉼표로 구분)${NC}"
                echo -e "  ${CYAN}Select VPCs to connect via TGW (comma-separated):${NC}"
                echo -e "  이 VPC들의 CIDR이 TGW 라우트로 추가됩니다"
                echo ""

                # 프로젝트 VPC 제외 / Exclude project VPC
                ALL_VPC_JSON=$(aws ec2 describe-vpcs --region "$REGION" --output json 2>/dev/null)
                EXCLUDE_VPC="${EXISTING_VPC_ID}"
                echo "$ALL_VPC_JSON" | python3 -c "
import json, sys
vpcs = json.load(sys.stdin).get('Vpcs', [])
exclude = '${EXCLUDE_VPC}'
idx = 0
for v in vpcs:
    vid = v['VpcId']
    if vid == exclude:
        continue
    idx += 1
    name = next((t['Value'] for t in v.get('Tags', []) if t['Key'] == 'Name'), '(이름 없음 / no name)')
    cidr = v.get('CidrBlock', '?')
    print('    {:2d}) {:25s} {:18s} {}'.format(idx, vid, cidr, name))
"
                echo ""

                PEER_VPC_IDS=($(echo "$ALL_VPC_JSON" | python3 -c "
import json,sys
vpcs = json.load(sys.stdin).get('Vpcs', [])
exclude = '${EXCLUDE_VPC}'
for v in vpcs:
    if v['VpcId'] != exclude:
        print(v['VpcId'])
"))
                PEER_VPC_CIDRS=($(echo "$ALL_VPC_JSON" | python3 -c "
import json,sys
vpcs = json.load(sys.stdin).get('Vpcs', [])
exclude = '${EXCLUDE_VPC}'
for v in vpcs:
    if v['VpcId'] != exclude:
        print(v.get('CidrBlock',''))
"))

                read -p "  VPC 번호 (쉼표 구분 / comma-separated, 예: 1,3): " VPC_SELECTIONS

                if [ -n "$VPC_SELECTIONS" ]; then
                    IFS=',' read -ra SELECTED <<< "$VPC_SELECTIONS"
                    for sel in "${SELECTED[@]}"; do
                        sel=$(echo "$sel" | tr -d ' ')
                        if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le "${#PEER_VPC_CIDRS[@]}" ]; then
                            cidr="${PEER_VPC_CIDRS[$((sel-1))]}"
                            if [ -n "$TGW_ROUTE_CIDRS" ]; then
                                TGW_ROUTE_CIDRS="$TGW_ROUTE_CIDRS,$cidr"
                            else
                                TGW_ROUTE_CIDRS="$cidr"
                            fi
                            echo -e "    ${GREEN}✓ ${PEER_VPC_IDS[$((sel-1))]} ($cidr)${NC}"
                        fi
                    done
                fi
            fi
        fi
    fi
fi

if [ -n "$TRANSIT_GATEWAY_ID" ]; then
    echo -e "  ${GREEN}✓ TGW: $TRANSIT_GATEWAY_ID${NC}"
    [ -n "$TGW_ROUTE_CIDRS" ] && echo -e "  ${GREEN}  Routes: $TGW_ROUTE_CIDRS${NC}"
else
    echo -e "  ${DIM}  TGW 연결 건너뜀 / Skipped${NC}"
fi

###############################################################################
#  [6/10] 인스턴스 타입 선택 / Instance Type Selection                          #
###############################################################################
echo ""
echo -e "${CYAN}[6/10] 인스턴스 타입 선택 / Instance Type Selection...${NC}"
echo ""
echo -e "  ${BOLD}EC2 인스턴스 타입을 선택하세요 / Select EC2 instance type:${NC}"
echo ""
echo -e "  ${GREEN}★ 권장: Graviton (ARM64) 인스턴스${NC}"
echo -e "  ${DIM}  AgentCore Runtime Docker 이미지가 arm64로 빌드됩니다.${NC}"
echo -e "  ${DIM}  Graviton recommended: AgentCore Docker image is built for arm64.${NC}"
echo ""

INSTANCE_TYPES=(
    "t4g.2xlarge:ARM64 Graviton, 8 vCPU, 32GB  ★ 기본값 / default (권장 / recommended)"
    "t4g.xlarge:ARM64 Graviton, 4 vCPU, 16GB"
    "m7g.xlarge:ARM64 Graviton, 4 vCPU, 16GB (메모리 최적화 / memory optimized)"
    "m7g.2xlarge:ARM64 Graviton, 8 vCPU, 32GB (메모리 최적화 / memory optimized)"
    "t3.xlarge:x86_64 Intel, 4 vCPU, 16GB"
    "t3.2xlarge:x86_64 Intel, 8 vCPU, 32GB"
    "m7i.xlarge:x86_64 Intel, 4 vCPU, 16GB"
    "m7i.2xlarge:x86_64 Intel, 8 vCPU, 32GB"
)

for i in "${!INSTANCE_TYPES[@]}"; do
    ITYPE="${INSTANCE_TYPES[$i]%%:*}"
    IDESC="${INSTANCE_TYPES[$i]##*:}"
    printf "    %2d) %-16s %s\n" $((i+1)) "$ITYPE" "$IDESC"
done
echo ""
echo "    0) 직접 입력 / Enter custom type"
echo ""
read -p "  번호 입력 / Enter number [1]: " ITYPE_CHOICE
ITYPE_CHOICE="${ITYPE_CHOICE:-1}"

if [ "$ITYPE_CHOICE" = "0" ]; then
    read -p "  인스턴스 타입 입력 / Enter instance type: " INSTANCE_TYPE
    INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.2xlarge}"
elif [[ "$ITYPE_CHOICE" =~ ^[0-9]+$ ]] && [ "$ITYPE_CHOICE" -ge 1 ] && [ "$ITYPE_CHOICE" -le "${#INSTANCE_TYPES[@]}" ]; then
    INSTANCE_TYPE="${INSTANCE_TYPES[$((ITYPE_CHOICE-1))]%%:*}"
else
    INSTANCE_TYPE="t4g.2xlarge"
fi

# x86 인스턴스 경고 / Warn for x86 instances
case "$INSTANCE_TYPE" in
    t3.*|m7i.*|m5.*|c5.*|r5.*)
        echo -e "  ${YELLOW}⚠ x86_64 인스턴스가 선택되었습니다.${NC}"
        echo -e "  ${YELLOW}  AgentCore Docker 이미지를 x86_64로도 빌드해야 합니다.${NC}"
        echo -e "  ${YELLOW}  WARNING: x86_64 selected. AgentCore Docker image needs x86_64 build too.${NC}"
        ;;
esac

echo -e "  ${GREEN}✓ 선택된 인스턴스 / Selected: $INSTANCE_TYPE${NC}"

###############################################################################
#  [7/10] CDK CLI 설치 / Install CDK CLI                                        #
###############################################################################
echo ""
echo -e "${CYAN}[7/10] CDK CLI 설치 / Install CDK CLI...${NC}"

if command -v cdk &>/dev/null; then
    echo "  이미 설치됨 / Already installed: $(cdk --version)"
else
    sudo npm install -g aws-cdk
    echo "  설치 완료 / Installed: $(cdk --version)"
fi

###############################################################################
#  [8/10] CDK 빌드 + 부트스트랩 / Build + Bootstrap                             #
###############################################################################
echo ""
echo -e "${CYAN}[8/10] CDK 빌드 + 부트스트랩 / Build + Bootstrap...${NC}"

cd "$CDK_DIR"
npm install --quiet
npx tsc
echo "  빌드 완료 / Build complete."

bootstrap_region() {
    local BR="$1"
    local STATUS
    STATUS=$(aws cloudformation describe-stacks --stack-name CDKToolkit --region "$BR" \
        --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NONE")
    if [ "$STATUS" != "NONE" ] && [ "$STATUS" != "DELETE_COMPLETE" ]; then
        echo "  $BR: 이미 부트스트랩됨 / bootstrapped"
    else
        echo "  $BR: 부트스트랩 중... / bootstrapping..."
        npx cdk bootstrap "aws://$ACCOUNT_ID/$BR" --region "$BR"
    fi
}

bootstrap_region "$REGION"
[ "$REGION" != "us-east-1" ] && bootstrap_region "us-east-1"

###############################################################################
#  [9/10] 설정 확인 / Confirm Configuration                                     #
###############################################################################
echo ""
echo -e "${CYAN}[9/10] 설정 확인 / Confirm Configuration...${NC}"

# 인스턴스 타입 / Instance type
# INSTANCE_TYPE은 [6/10]에서 대화형으로 선택 / selected interactively in step 6

# CloudFront Prefix List
CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists \
    --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \
    --query "PrefixLists[0].PrefixListId" --output text --region "$REGION" 2>/dev/null || echo "")
if [ -z "$CF_PREFIX_LIST" ] || [ "$CF_PREFIX_LIST" = "None" ]; then
    echo -e "${RED}오류: CloudFront prefix list 없음 / Not found${NC}"
    exit 1
fi

# VSCode 비밀번호 / Password
VSCODE_PASSWORD="${VSCODE_PASSWORD:-}"
if [ -z "$VSCODE_PASSWORD" ]; then
    echo ""
    read -sp "  VSCode 비밀번호 (8자 이상) / Password (min 8 chars): " VSCODE_PASSWORD
    echo ""
fi
if [ ${#VSCODE_PASSWORD} -lt 8 ]; then
    echo -e "${RED}오류: 비밀번호 8자 이상 필요 / Password must be 8+ chars${NC}"
    exit 1
fi

# 커스텀 도메인 (선택) / Custom domain (optional)
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-}"
if [ -z "$CUSTOM_DOMAIN" ]; then
    echo ""
    echo -e "  ${CYAN}커스텀 도메인 설정 (선택) / Custom domain (optional)${NC}"
    echo -e "  Route 53 호스팅 존이 있어야 합니다 / Requires Route 53 hosted zone"
    echo -e "  예시 / Example: awsops.example.com"
    read -p "  도메인 (비워두면 CloudFront 기본 도메인 사용): " CUSTOM_DOMAIN
fi

echo ""
echo -e "  ${BOLD}┌─────────────────────────────────────────────────┐${NC}"
echo -e "  ${BOLD}│  배포 설정 요약 / Deployment Summary             │${NC}"
echo -e "  ${BOLD}├─────────────────────────────────────────────────┤${NC}"
echo "  │  계정 / Account:    $ACCOUNT_ID"
echo "  │  리전 / Region:     $REGION"
echo "  │  인스턴스 / Type:   $INSTANCE_TYPE"
echo "  │  CF Prefix List:    $CF_PREFIX_LIST"
if [ -n "$EXISTING_VPC_ID" ]; then
    echo "  │  VPC:               $EXISTING_VPC_ID (기존 / existing)"
    echo "  │  VPC CIDR:          $VPC_CIDR"
else
    echo "  │  VPC:               새로 생성 / new ($NEW_VPC_CIDR)"
fi
echo "  │  비밀번호 / PW:     $(printf '*%.0s' $(seq 1 ${#VSCODE_PASSWORD}))"
if [ -n "$CUSTOM_DOMAIN" ]; then
    echo "  │  도메인 / Domain:   $CUSTOM_DOMAIN"
fi
if [ -n "$TRANSIT_GATEWAY_ID" ]; then
    echo "  │  TGW:               $TRANSIT_GATEWAY_ID"
    [ -n "$TGW_ROUTE_CIDRS" ] && echo "  │  TGW Routes:         $TGW_ROUTE_CIDRS"
fi
echo -e "  ${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""
read -p "  배포 시작? / Start deployment? (y/n) [y]: " CONFIRM
CONFIRM="${CONFIRM:-y}"
[ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ] && { echo "  취소 / Cancelled."; exit 0; }

###############################################################################
#  [10/10] CDK 배포 / CDK Deploy                                                #
###############################################################################
echo ""
echo -e "${CYAN}[10/10] CDK 배포 중... (5-10분) / Deploying via CDK (5-10 min)...${NC}"
echo ""

cd "$CDK_DIR"

# CDK 컨텍스트 구성 / Build CDK context
CDK_CONTEXT=""
if [ -n "$EXISTING_VPC_ID" ]; then
    CDK_CONTEXT="-c useExistingVpc=true -c vpcId=$EXISTING_VPC_ID -c vpcCidr=${VPC_CIDR:-10.0.0.0/8}"
fi
if [ -n "$NEW_VPC_CIDR" ] && [ "$NEW_VPC_CIDR" != "10.10.0.0/16" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c newVpcCidr=$NEW_VPC_CIDR"
fi
if [ "$SKIP_VPC_ENDPOINTS" = "true" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c skipVpcEndpoints=true"
fi
if [ -n "$CUSTOM_DOMAIN" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c customDomain=$CUSTOM_DOMAIN"
    # hostedZoneName auto-derived from customDomain in CDK stack
fi
if [ -n "$TRANSIT_GATEWAY_ID" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c transitGatewayId=$TRANSIT_GATEWAY_ID"
    if [ -n "$TGW_ROUTE_CIDRS" ]; then
        CDK_CONTEXT="$CDK_CONTEXT -c tgwRouteCidrs=$TGW_ROUTE_CIDRS"
    fi
fi

npx cdk deploy AwsopsStack \
    --parameters InstanceType="$INSTANCE_TYPE" \
    --parameters VSCodePassword="$VSCODE_PASSWORD" \
    --parameters CloudFrontPrefixListId="$CF_PREFIX_LIST" \
    --parameters ExistingVpcId="${EXISTING_VPC_ID}" \
    $CDK_CONTEXT \
    --require-approval never \
    --no-rollback \
    --region "$REGION" 2>&1

###############################################################################
#  결과 출력 / Output Results                                                  #
###############################################################################
echo ""
echo -e "${CYAN}결과 파싱 / Parsing outputs...${NC}"

OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name AwsopsStack --region "$REGION" \
    --query "Stacks[0].Outputs" --output json 2>/dev/null || echo "[]")

parse_output() {
    echo "$OUTPUTS" | python3 -c "import json,sys;o={i['OutputKey']:i['OutputValue'] for i in json.load(sys.stdin)};print(o.get('$1','N/A'))" 2>/dev/null || echo "N/A"
}

CF_URL=$(parse_output "CloudFrontURL")
INSTANCE_ID=$(parse_output "InstanceId")
VPC_ID=$(parse_output "VPCId")
ALB_DNS=$(parse_output "PublicALBEndpoint")

echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   ✓ 배포 완료 / Deployment Complete${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  스택 / Stack:       AwsopsStack"
echo "  리전 / Region:      $REGION"
echo "  계정 / Account:     $ACCOUNT_ID"
echo "  인스턴스 / Instance: $INSTANCE_ID ($INSTANCE_TYPE)"
echo "  VPC:                $VPC_ID"
echo "  ALB:                $ALB_DNS"
echo "  CloudFront:         $CF_URL"
echo ""
echo -e "  ${BOLD}┌─────────────────────────────────────────────────┐${NC}"
echo -e "  ${BOLD}│  접속 방법 / How to Access                       │${NC}"
echo -e "  ${BOLD}├─────────────────────────────────────────────────┤${NC}"
echo -e "  │                                                 │"
echo -e "  │  ${GREEN}방법 1: VSCode Server (브라우저)${NC}               │"
echo -e "  │  URL: ${BOLD}${CF_URL}${NC}"
echo -e "  │  비밀번호 / Password: (설정한 비밀번호)          │"
echo -e "  │                                                 │"
echo -e "  │  ${GREEN}방법 2: SSM Session Manager (터미널)${NC}          │"
echo -e "  │  aws ssm start-session \\                       │"
echo -e "  │    --target $INSTANCE_ID \\      │"
echo -e "  │    --region $REGION                     │"
echo -e "  │                                                 │"
echo -e "  ${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${BOLD}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "  ${BOLD}│  EC2 역할 및 권한 / EC2 Role & Permissions                  │${NC}"
echo -e "  ${BOLD}├─────────────────────────────────────────────────────────────┤${NC}"
echo -e "  │                                                             │"
echo -e "  │  역할 이름 / Role: ${GREEN}awsops-ec2-role${NC}                          │"
echo -e "  │                                                             │"
echo -e "  │  포함된 정책 / Attached policies:                             │"
echo -e "  │    ✓ AmazonSSMManagedInstanceCore  (SSM 접속)                │"
echo -e "  │    ✓ CloudWatchAgentServerPolicy   (모니터링)                 │"
echo -e "  │    ✓ ReadOnlyAccess                (Steampipe 데이터 조회)    │"
echo -e "  │                                                             │"
echo -e "  │  ${YELLOW}⚠ Steampipe가 AWS 리소스 데이터를 조회하려면${NC}                │"
echo -e "  │  ${YELLOW}  ReadOnlyAccess 정책이 필수입니다.${NC}                        │"
echo -e "  │  ${YELLOW}  ReadOnlyAccess is required for Steampipe to query data.${NC} │"
echo -e "  │                                                             │"
echo -e "  │  ${DIM}추후 AgentCore 설치 시 추가 권한 필요:${NC}                      │"
echo -e "  │  ${DIM}  - Cognito, Bedrock, ECR, Lambda 등${NC}                       │"
echo -e "  │  ${DIM}  Additional permissions needed for AgentCore setup.${NC}        │"
echo -e "  │                                                             │"
echo -e "  ${BOLD}└─────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${BOLD}리소스 이름 / Resource Names:${NC}"
echo "    EC2 인스턴스 / Instance:   awsops-server"
echo "    EC2 역할 / Role:          awsops-ec2-role"
echo "    ALB:                      awsops-alb"
echo "    ALB 보안 그룹 / SG:       awsops-alb-sg"
echo "    EC2 보안 그룹 / SG:       awsops-ec2-sg"
echo ""
echo "  NOTE: PostgreSQL 별도 설치 불필요 (Steampipe 내장)"
echo "        No separate PostgreSQL needed (embedded in Steampipe)"
echo ""
echo -e "  ${BOLD}다음 단계 / Next Step:${NC}"
echo ""
echo "  VSCode Server 또는 SSM으로 EC2에 접속한 후:"
echo "  After connecting to EC2 via VSCode Server or SSM:"
echo ""
echo "    cd /home/ec2-user"
echo "    git clone https://github.com/whchoi98/awsops.git"
echo "    cd awsops"
echo "    bash scripts/install-all.sh"
echo ""
