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
#  [1/8] 사전 점검 / Pre-flight checks                                        #
###############################################################################
echo -e "${CYAN}[1/8] 사전 점검 / Pre-flight checks...${NC}"

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
#  [2/8] 계정 선택 / Account Selection                                         #
###############################################################################
echo ""
echo -e "${CYAN}[2/8] AWS 계정 선택 / Account Selection...${NC}"
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
#  [3/8] 리전 선택 / Region Selection                                          #
###############################################################################
echo ""
echo -e "${CYAN}[3/8] 리전 선택 / Region Selection...${NC}"
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
#  [4/8] VPC 선택 / VPC Selection                                              #
###############################################################################
echo ""
echo -e "${CYAN}[4/8] VPC 선택 / VPC Selection...${NC}"
echo ""
echo -e "${BOLD}  VPC 옵션을 선택하세요 / Select VPC option:${NC}"
echo ""
echo "    1) 새 VPC 생성 / Create new VPC (10.254.0.0/16, 2 Public + 2 Private subnets)"
echo "    2) 기존 VPC 선택 / Use existing VPC from account"
echo ""
read -p "  번호 입력 / Enter number [1]: " VPC_CHOICE
VPC_CHOICE="${VPC_CHOICE:-1}"

USE_EXISTING_VPC="false"
EXISTING_VPC_ID=""

if [ "$VPC_CHOICE" = "2" ]; then
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
if [ "$USE_EXISTING_VPC" = "true" ]; then
    echo -e "  ${GREEN}✓ 기존 VPC 사용 / Using existing VPC: $EXISTING_VPC_ID${NC}"
else
    echo -e "  ${GREEN}✓ 새 VPC 생성 / Creating new VPC (10.254.0.0/16)${NC}"
fi

###############################################################################
#  [5/9] 인스턴스 타입 선택 / Instance Type Selection                           #
###############################################################################
echo ""
echo -e "${CYAN}[5/9] 인스턴스 타입 선택 / Instance Type Selection...${NC}"
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
#  [6/9] CDK CLI 설치 / Install CDK CLI                                        #
###############################################################################
echo ""
echo -e "${CYAN}[6/9] CDK CLI 설치 / Install CDK CLI...${NC}"

if command -v cdk &>/dev/null; then
    echo "  이미 설치됨 / Already installed: $(cdk --version)"
else
    sudo npm install -g aws-cdk
    echo "  설치 완료 / Installed: $(cdk --version)"
fi

###############################################################################
#  [7/9] CDK 빌드 + 부트스트랩 / Build + Bootstrap                             #
###############################################################################
echo ""
echo -e "${CYAN}[7/9] CDK 빌드 + 부트스트랩 / Build + Bootstrap...${NC}"

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
#  [8/9] 설정 확인 / Confirm Configuration                                     #
###############################################################################
echo ""
echo -e "${CYAN}[8/9] 설정 확인 / Confirm Configuration...${NC}"

# 인스턴스 타입 / Instance type
# INSTANCE_TYPE은 [5/9]에서 대화형으로 선택 / selected interactively in step 5

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
else
    echo "  │  VPC:               새로 생성 / new (10.254.0.0/16)"
fi
echo "  │  비밀번호 / PW:     $(printf '*%.0s' $(seq 1 ${#VSCODE_PASSWORD}))"
echo -e "  ${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""
read -p "  배포 시작? / Start deployment? (y/n) [y]: " CONFIRM
CONFIRM="${CONFIRM:-y}"
[ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ] && { echo "  취소 / Cancelled."; exit 0; }

###############################################################################
#  [9/9] CDK 배포 / CDK Deploy                                                #
###############################################################################
echo ""
echo -e "${CYAN}[9/9] CDK 배포 중... (5-10분) / Deploying via CDK (5-10 min)...${NC}"
echo ""

cd "$CDK_DIR"

CDK_CONTEXT=""
if [ -n "$EXISTING_VPC_ID" ]; then
    CDK_CONTEXT="-c useExistingVpc=true -c vpcId=$EXISTING_VPC_ID"
fi

npx cdk deploy AwsopsStack \
    --parameters InstanceType="$INSTANCE_TYPE" \
    --parameters VSCodePassword="$VSCODE_PASSWORD" \
    --parameters CloudFrontPrefixListId="$CF_PREFIX_LIST" \
    --parameters ExistingVpcId="${EXISTING_VPC_ID}" \
    $CDK_CONTEXT \
    --require-approval never \
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
