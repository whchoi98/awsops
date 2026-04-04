#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 6a: AgentCore Runtime Setup                                           #
#                                                                              #
#   Creates:                                                                   #
#     1. IAM Role (AgentCore - Bedrock + ECR)                                  #
#     2. ECR Repository                                                        #
#     3. ARM64 Docker image (docker buildx)                                    #
#     4. AgentCore Runtime (Strands agent)                                     #
#     5. Runtime Endpoint                                                      #
#                                                                              #
#   Known issues handled:                                                      #
#     - Docker image must be arm64 (docker buildx --platform linux/arm64)     #
#     - SDK v3: use response.transformToString() (not read())                 #
#                                                                              #
################################################################################

# -- Colors & common variables / 색상 및 공통 변수 ----------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"

# -- Helper: run command with error handling / 에러 핸들링 헬퍼 ---------------
run_or_fail() {
    local step_name="$1"; shift
    local output
    if ! output=$("$@" 2>&1); then
        echo -e "  ${RED}ERROR in ${step_name}:${NC}"
        echo "$output" | head -20
        echo ""
        echo -e "  ${YELLOW}Hint: Check IAM permissions for this instance role.${NC}"
        echo -e "  ${YELLOW}Required: IAM, ECR, Bedrock AgentCore, Docker / 필요 권한: IAM, ECR, Bedrock AgentCore, Docker${NC}"
        exit 1
    fi
    echo "$output"
}

# -- Pre-flight: Docker check / Docker 사전 체크 --------------------------------
if ! command -v docker &>/dev/null; then
    echo -e "${RED}ERROR: Docker not installed. CDK UserData should install Docker automatically.${NC}"
    echo -e "${YELLOW}Fix: sudo dnf install -y docker && sudo systemctl start docker${NC}"
    exit 1
fi
if ! docker info &>/dev/null; then
    echo -e "${RED}ERROR: Docker daemon not running.${NC}"
    echo -e "${YELLOW}Fix: sudo systemctl start docker${NC}"
    exit 1
fi

# -- Preflight: verify AWS credentials / AWS 자격 증명 확인 -------------------
echo ""
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>&1) || {
    echo -e "${RED}ERROR: AWS credentials not available / AWS 자격 증명을 사용할 수 없습니다${NC}"
    echo "  $ACCOUNT_ID"
    echo ""
    echo -e "${YELLOW}Hint: Attach IAM role with sufficient permissions to this EC2 instance${NC}"
    echo -e "${YELLOW}      Required: IAM, ECR, Bedrock, AgentCore / 필요: IAM, ECR, Bedrock, AgentCore 권한${NC}"
    exit 1
}

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 6a: AgentCore Runtime Setup${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo "  Region:  $REGION"
echo "  Account: $ACCOUNT_ID"
echo ""

# -- [1/5] Create IAM Role / IAM 역할 생성 ------------------------------------
echo -e "${CYAN}[1/5] Creating AgentCore IAM role...${NC}"

# Create role (ignore if already exists / 이미 존재하면 무시)
aws iam create-role --role-name AWSopsAgentCoreRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "bedrock.amazonaws.com"}, "Action": "sts:AssumeRole"},
            {"Effect": "Allow", "Principal": {"Service": "bedrock-agentcore.amazonaws.com"}, "Action": "sts:AssumeRole"}
        ]
    }' 2>/dev/null || true

# Attach managed policy / 관리형 정책 연결
run_or_fail "IAM attach-role-policy" \
    aws iam attach-role-policy --role-name AWSopsAgentCoreRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess

# Attach inline policy / 인라인 정책 연결
run_or_fail "IAM put-role-policy (ECRAndLambda)" \
    aws iam put-role-policy --role-name AWSopsAgentCoreRole --policy-name ECRAndLambda \
    --policy-document "{
        \"Version\": \"2012-10-17\",
        \"Statement\": [{
            \"Effect\": \"Allow\",
            \"Action\": [\"ecr:*\", \"lambda:InvokeFunction\", \"lambda:GetFunction\", \"bedrock-agentcore:*\"],
            \"Resource\": \"*\"
        }]
    }"

echo "  AWSopsAgentCoreRole: created"
echo "  Waiting for IAM propagation (10s)..."
sleep 10

# -- [2/5] Create ECR Repository / ECR 리포지토리 생성 -------------------------
echo ""
echo -e "${CYAN}[2/5] Creating ECR repository...${NC}"
# Ignore if already exists / 이미 존재하면 무시
aws ecr create-repository --repository-name awsops-agent --region "$REGION" 2>/dev/null || true
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/awsops-agent"
echo "  ECR: $ECR_URI"

# -- [3/5] Build and Push Docker Image (ARM64) / Docker 이미지 빌드 -----------
#   KNOWN ISSUE: AgentCore Runtime requires arm64 Docker image.
echo ""
echo -e "${CYAN}[3/5] Building Docker image (arm64)...${NC}"
echo -e "  ${YELLOW}NOTE: arm64 required for AgentCore Runtime${NC}"

# ECR login / ECR 로그인
ECR_LOGIN_OUTPUT=$(aws ecr get-login-password --region "$REGION" 2>&1) || {
    echo -e "  ${RED}ERROR: ECR login failed / ECR 로그인 실패${NC}"
    echo "  $ECR_LOGIN_OUTPUT"
    echo -e "  ${YELLOW}Hint: Instance role needs ecr:GetAuthorizationToken permission${NC}"
    exit 1
}
echo "$ECR_LOGIN_OUTPUT" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com" 2>/dev/null

docker buildx create --use 2>/dev/null || true
docker buildx build --platform linux/arm64 \
    -t "${ECR_URI}:latest" --push \
    "$WORK_DIR/agent/" 2>&1 | tail -5 || {
    echo -e "  ${RED}ERROR: Docker build/push failed / Docker 빌드/푸시 실패${NC}"
    echo -e "  ${YELLOW}Hint: Check Docker daemon, ECR permissions, and Dockerfile in agent/ / Docker 데몬, ECR 권한, agent/Dockerfile 확인${NC}"
    exit 1
}
echo "  Image: ${ECR_URI}:latest (arm64)"

# -- [4/5] Create AgentCore Runtime / AgentCore 런타임 생성 --------------------
echo ""
echo -e "${CYAN}[4/5] Creating AgentCore Runtime (Strands agent)...${NC}"
sleep 5

RT_RESULT=$(aws bedrock-agentcore-control create-agent-runtime \
    --agent-runtime-name awsops_agent \
    --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/AWSopsAgentCoreRole" \
    --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_URI}:latest\"}}" \
    --network-configuration '{"networkMode":"PUBLIC"}' \
    --region "$REGION" --output json 2>&1) || {
    echo -e "  ${RED}ERROR: Failed to create AgentCore Runtime / AgentCore 런타임 생성 실패${NC}"
    echo "$RT_RESULT" | head -10
    echo -e "  ${YELLOW}Hint: Check bedrock-agentcore permissions and ECR image availability${NC}"
    echo -e "  ${YELLOW}      필요 권한: bedrock-agentcore:CreateAgentRuntime, ECR 이미지 접근${NC}"
    exit 1
}

RT_ID=$(echo "$RT_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('agentRuntimeId',''))" 2>/dev/null || echo "")
RT_ARN=$(echo "$RT_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('agentRuntimeArn',''))" 2>/dev/null || echo "")
echo "  Runtime ID:  $RT_ID"
echo "  Runtime ARN: $RT_ARN"

if [ -z "$RT_ID" ]; then
    echo -e "  ${RED}ERROR: Runtime created but ID not found in response / 런타임 생성됐으나 ID를 찾을 수 없음${NC}"
    echo "  Response: $RT_RESULT"
    exit 1
fi

# -- [5/5] Create Runtime Endpoint / 런타임 엔드포인트 생성 --------------------
echo ""
echo -e "${CYAN}[5/5] Creating Runtime Endpoint...${NC}"

EP_RESULT=$(aws bedrock-agentcore-control create-agent-runtime-endpoint \
    --agent-runtime-id "$RT_ID" --name awsops_endpoint \
    --region "$REGION" --output json 2>&1) || {
    echo -e "  ${RED}ERROR: Failed to create Runtime Endpoint / 런타임 엔드포인트 생성 실패${NC}"
    echo "$EP_RESULT" | head -10
    echo -e "  ${YELLOW}Hint: Runtime may still be initializing. Wait and retry, or check permissions.${NC}"
    echo -e "  ${YELLOW}      런타임이 아직 초기화 중일 수 있습니다. 잠시 후 재시도하세요.${NC}"
    exit 1
}
EP_ID=$(echo "$EP_RESULT" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('agentRuntimeEndpointId',d.get('endpointId','N/A')))" 2>/dev/null || echo "N/A")
echo "  Endpoint ID: $EP_ID"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 6a Complete: AgentCore Runtime configured${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Runtime ID:   $RT_ID"
echo "  Runtime ARN:  $RT_ARN"
echo "  Endpoint ID:  $EP_ID"
echo "  ECR Image:    ${ECR_URI}:latest (arm64)"
echo ""
echo "  Next: bash scripts/06b-setup-agentcore-gateway.sh"
echo ""
