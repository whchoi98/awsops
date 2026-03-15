#!/bin/bash
# ============================================================================
# AWSops - Step 6e: AgentCore Memory 설정
# AWSops - Step 6e: AgentCore Memory Setup
#
#   AgentCore Memory Store를 생성하여 AI 대화 이력을 영구 저장합니다.
#   Creates AgentCore Memory Store for persistent AI conversation history.
#
#   사전 요구사항:
#     - Step 6a (Runtime) 완료
#     - AWS CLI v2 + bedrock-agentcore 명령 사용 가능
#
# ============================================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
MEMORY_NAME="awsops-memory"
WORK_DIR="${HOME}/awsops"
CONFIG_FILE="${WORK_DIR}/data/config.json"

echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}  AWSops - Step 6e: AgentCore Memory 설정${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo -e "  계정 / Account:  ${GREEN}${ACCOUNT_ID}${NC}"
echo -e "  리전 / Region:   ${GREEN}${REGION}${NC}"
echo -e "  Memory 이름:     ${GREEN}${MEMORY_NAME}${NC}"
echo ""

# -- [1/3] Memory Store 생성 / Create Memory Store ----------------------------
echo -e "${CYAN}[1/3] Memory Store 생성 중...${NC}"

# 기존 Memory 확인 / Check existing memory
EXISTING=$(aws bedrock-agentcore-control list-memories \
  --region "$REGION" --output json 2>/dev/null || echo '{"items":[]}')
MEMORY_ID=$(echo "$EXISTING" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for m in data.get('items', data.get('memories', [])):
    if m.get('name') == '${MEMORY_NAME}':
        print(m.get('memoryId', m.get('memory_id', '')))
        break
" 2>/dev/null)

if [ -n "$MEMORY_ID" ] && [ "$MEMORY_ID" != "" ]; then
    echo -e "  ${GREEN}기존 Memory 발견: ${MEMORY_ID}${NC}"
else
    echo -e "  ${YELLOW}새 Memory Store 생성 중...${NC}"
    CREATE_RESULT=$(aws bedrock-agentcore-control create-memory \
      --name "$MEMORY_NAME" \
      --description "AWSops AI Assistant 대화 이력 및 분석 결과 저장 / Conversation history and analysis results" \
      --region "$REGION" \
      --output json 2>&1)

    MEMORY_ID=$(echo "$CREATE_RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('memoryId', data.get('memory_id', '')))
" 2>/dev/null)

    if [ -n "$MEMORY_ID" ] && [ "$MEMORY_ID" != "" ]; then
        echo -e "  ${GREEN}Memory 생성 완료: ${MEMORY_ID}${NC}"
    else
        echo -e "  ${RED}Memory 생성 실패${NC}"
        echo "  $CREATE_RESULT"
        echo ""
        echo -e "  ${YELLOW}AgentCore Memory API가 이 리전에서 지원되지 않을 수 있습니다.${NC}"
        echo -e "  ${YELLOW}로컬 파일 기반 메모리로 폴백합니다.${NC}"
        MEMORY_ID="local-fallback"
    fi
fi

# -- [2/3] config.json에 Memory ID 저장 / Save to config -----------------------
echo ""
echo -e "${CYAN}[2/3] config.json에 Memory ID 저장 중...${NC}"

mkdir -p "$(dirname "$CONFIG_FILE")"
if [ -f "$CONFIG_FILE" ]; then
    python3 -c "
import json
cfg = json.load(open('${CONFIG_FILE}'))
cfg['memoryId'] = '${MEMORY_ID}'
cfg['memoryName'] = '${MEMORY_NAME}'
json.dump(cfg, open('${CONFIG_FILE}', 'w'), indent=2)
print(json.dumps(cfg, indent=2))
"
else
    echo "{\"costEnabled\":true,\"memoryId\":\"${MEMORY_ID}\",\"memoryName\":\"${MEMORY_NAME}\"}" > "$CONFIG_FILE"
    cat "$CONFIG_FILE"
fi

# -- [3/3] 검증 / Verify -------------------------------------------------------
echo ""
echo -e "${CYAN}[3/3] Memory Store 검증 중...${NC}"

if [ "$MEMORY_ID" = "local-fallback" ]; then
    echo -e "  ${YELLOW}로컬 파일 기반 메모리 사용 (data/memory/)${NC}"
    mkdir -p "${WORK_DIR}/data/memory"
else
    VERIFY=$(aws bedrock-agentcore-control get-memory \
      --memory-id "$MEMORY_ID" \
      --region "$REGION" --output json 2>/dev/null || echo '{}')
    STATUS=$(echo "$VERIFY" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null)
    echo -e "  Memory ID: ${GREEN}${MEMORY_ID}${NC}"
    echo -e "  Status:    ${GREEN}${STATUS}${NC}"
fi

# -- 완료 / Done ---------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}  Step 6e 완료 / Step 6e Complete${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo -e "  Memory ID: ${CYAN}${MEMORY_ID}${NC}"
echo -e "  Config:    ${CYAN}${CONFIG_FILE}${NC}"
echo ""
echo -e "  ${YELLOW}다음 단계: npm run build && 서버 재시작${NC}"
echo -e "  ${YELLOW}Next: npm run build && restart server${NC}"
