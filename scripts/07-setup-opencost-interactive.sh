#!/bin/bash
###############################################################################
# Step 7 (Interactive): OpenCost Setup with Auto-Detection                    #
# 단계 7 (대화형): 자동 감지 기반 OpenCost 설치                                #
#                                                                             #
# Features / 기능:                                                             #
#   - Auto-detect existing Prometheus installations                           #
#   - Auto-detect node taints and add tolerations                             #
#   - Multi-cluster support (select from available contexts)                  #
#   - Interactive prompts for each decision                                   #
#                                                                             #
# Prerequisites / 전제 조건:                                                   #
#   - kubectl configured with EKS access                                     #
#   - Helm 3 installed (or will auto-install)                                #
###############################################################################

set -e

# -- Colors / 색상 ------------------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/data/config.json"
OPENCOST_LOCAL_PORT=9003

# -- Helper functions / 헬퍼 함수 --------------------------------------------
ask_yes_no() {
  local prompt="$1" default="${2:-y}"
  while true; do
    if [ "$default" = "y" ]; then
      read -rp "  $prompt [Y/n]: " answer
      answer="${answer:-y}"
    else
      read -rp "  $prompt [y/N]: " answer
      answer="${answer:-n}"
    fi
    case "$answer" in
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
      *) echo "  Please answer y or n." ;;
    esac
  done
}

ask_select() {
  local prompt="$1"
  shift
  local options=("$@")
  echo ""
  echo -e "  ${BOLD}$prompt${NC}"
  for i in "${!options[@]}"; do
    echo -e "    ${CYAN}$((i+1)))${NC} ${options[$i]}"
  done
  while true; do
    read -rp "  Select [1-${#options[@]}]: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
      return $((choice-1))
    fi
    echo "  Invalid choice. Enter 1-${#options[@]}."
  done
}

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 6f: OpenCost Interactive Setup${NC}"
echo -e "${CYAN}   OpenCost 대화형 설치${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

###############################################################################
#  [1/7] Verify prerequisites / 전제 조건 확인                                 #
###############################################################################
echo -e "${CYAN}[1/7] Prerequisites / 전제 조건 확인${NC}"

# kubectl
if ! command -v kubectl &>/dev/null; then
  echo -e "  ${RED}kubectl not found. Install kubectl first.${NC}"
  echo "  Run: bash scripts/04-setup-eks-access.sh"
  exit 1
fi
echo -e "  ✓ kubectl $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>&1 | head -1)"

# Helm
if ! command -v helm &>/dev/null; then
  echo -e "  ${YELLOW}Helm not found.${NC}"
  if ask_yes_no "Install Helm 3? / Helm 3을 설치할까요?"; then
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    echo -e "  ${GREEN}✓ Helm installed${NC}"
  else
    echo -e "  ${RED}Helm is required. Exiting.${NC}"
    exit 1
  fi
else
  echo -e "  ✓ Helm $(helm version --short 2>/dev/null)"
fi
echo ""

###############################################################################
#  [2/7] Select cluster / 클러스터 선택                                        #
###############################################################################
echo -e "${CYAN}[2/7] Cluster Selection / 클러스터 선택${NC}"

# List available contexts
CONTEXTS=($(kubectl config get-contexts -o name 2>/dev/null))
if [ ${#CONTEXTS[@]} -eq 0 ]; then
  echo -e "  ${RED}No kubectl contexts found. Configure kubeconfig first.${NC}"
  exit 1
fi

CURRENT_CTX=$(kubectl config current-context 2>/dev/null || echo "")
echo -e "  Current context: ${BOLD}${CURRENT_CTX}${NC}"
echo ""

if [ ${#CONTEXTS[@]} -gt 1 ]; then
  # Extract cluster names for display
  CTX_DISPLAY=()
  for ctx in "${CONTEXTS[@]}"; do
    cluster_name=$(echo "$ctx" | sed 's/.*\///')
    if [ "$ctx" = "$CURRENT_CTX" ]; then
      CTX_DISPLAY+=("$cluster_name  ← current")
    else
      CTX_DISPLAY+=("$cluster_name")
    fi
  done

  ask_select "Which cluster to install OpenCost? / OpenCost를 설치할 클러스터:" "${CTX_DISPLAY[@]}"
  selected_idx=$?
  SELECTED_CTX="${CONTEXTS[$selected_idx]}"

  if [ "$SELECTED_CTX" != "$CURRENT_CTX" ]; then
    kubectl config use-context "$SELECTED_CTX"
    echo -e "  ${GREEN}✓ Switched to: $SELECTED_CTX${NC}"
  fi
else
  SELECTED_CTX="$CURRENT_CTX"
fi

CLUSTER_NAME=$(echo "$SELECTED_CTX" | sed 's/.*\///')
echo -e "  Target cluster: ${BOLD}${CLUSTER_NAME}${NC}"

# Verify cluster access
if ! kubectl cluster-info &>/dev/null; then
  echo -e "  ${RED}Cannot access cluster. Check credentials.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓ Cluster accessible${NC}"
echo ""

###############################################################################
#  [3/7] Detect existing Prometheus / 기존 Prometheus 감지                     #
###############################################################################
echo -e "${CYAN}[3/7] Prometheus Detection / Prometheus 감지${NC}"

# Search for Prometheus services across all namespaces
PROM_SERVICES=$(kubectl get svc -A -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,PORT:.spec.ports[0].port --no-headers 2>/dev/null \
  | grep -i 'prom' | grep -E '(9090|80)' | grep -v 'node-exporter\|pushgateway\|alertmanager\|operator\|kube-state\|kubelet\|coredns\|etcd\|proxy\|scheduler\|controller-manager\|operated' || true)

if [ -n "$PROM_SERVICES" ]; then
  echo -e "  ${GREEN}✓ Existing Prometheus found:${NC}"
  echo ""

  # Parse into arrays
  PROM_NS=()
  PROM_NAME=()
  PROM_PORT=()
  PROM_DISPLAY=()

  while IFS= read -r line; do
    ns=$(echo "$line" | awk '{print $1}')
    name=$(echo "$line" | awk '{print $2}')
    port=$(echo "$line" | awk '{print $3}')
    PROM_NS+=("$ns")
    PROM_NAME+=("$name")
    PROM_PORT+=("$port")
    PROM_DISPLAY+=("$ns/$name (port $port)")
  done <<< "$PROM_SERVICES"

  # Add option to install new
  PROM_DISPLAY+=("Install new Prometheus / 새 Prometheus 설치")

  ask_select "Select Prometheus to use / 사용할 Prometheus 선택:" "${PROM_DISPLAY[@]}"
  prom_idx=$?

  if [ $prom_idx -lt ${#PROM_NS[@]} ]; then
    USE_EXISTING_PROM=true
    PROM_NAMESPACE="${PROM_NS[$prom_idx]}"
    PROM_SVC_NAME="${PROM_NAME[$prom_idx]}"
    PROM_SVC_PORT="${PROM_PORT[$prom_idx]}"
    echo ""
    echo -e "  ${GREEN}✓ Using: ${PROM_NAMESPACE}/${PROM_SVC_NAME}:${PROM_SVC_PORT}${NC}"
  else
    USE_EXISTING_PROM=false
    echo ""
    echo -e "  ${YELLOW}Will install new Prometheus${NC}"
  fi
else
  echo -e "  ${YELLOW}No existing Prometheus found in cluster${NC}"
  USE_EXISTING_PROM=false
  echo -e "  Will install new Prometheus"
fi
echo ""

###############################################################################
#  [4/7] Detect node taints / 노드 taint 감지                                 #
###############################################################################
echo -e "${CYAN}[4/7] Node Taint Detection / 노드 Taint 감지${NC}"

TAINTS=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.taints}{"\n"}{end}' 2>/dev/null | grep -v "^$" || true)

TAINT_KEYS=()
TAINT_VALUES=()
TAINT_EFFECTS=()
TOLERATION_YAML=""

if [ -n "$TAINTS" ] && echo "$TAINTS" | grep -q '"key"'; then
  echo -e "  ${YELLOW}Node taints detected:${NC}"

  # Parse unique taints (excluding default k8s taints)
  UNIQUE_TAINTS=$(echo "$TAINTS" | python3 -c "
import sys, json, re
seen = set()
for line in sys.stdin:
    parts = line.strip().split('\t', 1)
    if len(parts) < 2 or not parts[1]: continue
    try:
        taints = json.loads(parts[1])
        for t in taints:
            k, v, e = t.get('key',''), t.get('value',''), t.get('effect','')
            if k.startswith('node.kubernetes.io/'): continue
            sig = f'{k}={v}:{e}'
            if sig not in seen:
                seen.add(sig)
                print(f'{k}\t{v}\t{e}')
    except: pass
" 2>/dev/null || true)

  if [ -n "$UNIQUE_TAINTS" ]; then
    while IFS=$'\t' read -r key val effect; do
      echo -e "    ${YELLOW}${key}=${val}:${effect}${NC}"
      TAINT_KEYS+=("$key")
      TAINT_VALUES+=("$val")
      TAINT_EFFECTS+=("$effect")
    done <<< "$UNIQUE_TAINTS"

    echo ""
    if ask_yes_no "Add tolerations for these taints? / 이 taint에 대한 toleration을 추가할까요?"; then
      # Build toleration YAML for helm values
      TOLERATION_YAML="tolerations:"
      for i in "${!TAINT_KEYS[@]}"; do
        TOLERATION_YAML="${TOLERATION_YAML}
  - key: \"${TAINT_KEYS[$i]}\"
    value: \"${TAINT_VALUES[$i]}\"
    effect: \"${TAINT_EFFECTS[$i]}\"
    operator: \"Equal\""
      done
      echo -e "  ${GREEN}✓ Tolerations will be added${NC}"
    else
      echo -e "  ${YELLOW}⚠ Skipping tolerations — pods may not schedule${NC}"
    fi
  else
    echo -e "  ${GREEN}✓ No custom taints found${NC}"
  fi
else
  echo -e "  ${GREEN}✓ No taints detected on nodes${NC}"
fi
echo ""

###############################################################################
#  [5/7] Install Prometheus (if needed) / Prometheus 설치 (필요 시)             #
###############################################################################
if [ "$USE_EXISTING_PROM" = false ]; then
  echo -e "${CYAN}[5/7] Installing Prometheus / Prometheus 설치${NC}"

  PROM_NAMESPACE="opencost"
  PROM_SVC_NAME="prometheus-server"
  PROM_SVC_PORT="80"

  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
  helm repo update >/dev/null 2>&1

  if helm status prometheus -n opencost &>/dev/null; then
    echo -e "  ${GREEN}✓ Prometheus already installed in opencost namespace${NC}"
  else
    kubectl create namespace opencost 2>/dev/null || true

    # Build prometheus values
    PROM_VALUES="/tmp/prometheus-values.yaml"
    cat > "$PROM_VALUES" << EOF
server:
  persistentVolume:
    enabled: false
alertmanager:
  enabled: false
kube-state-metrics:
  enabled: true
prometheus-node-exporter:
  enabled: true
prometheus-pushgateway:
  enabled: false
EOF

    # Add tolerations if detected
    if [ -n "$TOLERATION_YAML" ]; then
      cat >> "$PROM_VALUES" << EOF
server:
  $TOLERATION_YAML
nodeExporter:
  $TOLERATION_YAML
EOF
    fi

    helm install prometheus prometheus-community/prometheus \
      --namespace opencost -f "$PROM_VALUES"

    echo "  Waiting for Prometheus to be ready..."
    kubectl wait --for=condition=ready pod \
      -l app.kubernetes.io/name=prometheus,app.kubernetes.io/component=server \
      -n opencost --timeout=180s
    echo -e "  ${GREEN}✓ Prometheus installed${NC}"
  fi
else
  echo -e "${CYAN}[5/7] Using existing Prometheus / 기존 Prometheus 사용${NC}"
  echo -e "  ${GREEN}✓ ${PROM_NAMESPACE}/${PROM_SVC_NAME}:${PROM_SVC_PORT}${NC}"
fi
echo ""

###############################################################################
#  [6/7] Install OpenCost / OpenCost 설치                                      #
###############################################################################
echo -e "${CYAN}[6/7] Installing OpenCost / OpenCost 설치${NC}"

helm repo add opencost https://opencost.github.io/opencost-helm-chart 2>/dev/null || true
helm repo update >/dev/null 2>&1

# Build OpenCost values file
OC_VALUES="/tmp/opencost-values.yaml"
cat > "$OC_VALUES" << EOF
opencost:
  exporter:
    defaultClusterId: "$CLUSTER_NAME"
    aws:
      service_account_region: "$REGION"
  prometheus:
    internal:
      serviceName: "$PROM_SVC_NAME"
      namespaceName: "$PROM_NAMESPACE"
      port: $PROM_SVC_PORT
EOF

# Add tolerations if detected
if [ -n "$TOLERATION_YAML" ]; then
  cat >> "$OC_VALUES" << EOF
$TOLERATION_YAML
EOF
fi

echo -e "  Prometheus endpoint: ${BOLD}${PROM_NAMESPACE}/${PROM_SVC_NAME}:${PROM_SVC_PORT}${NC}"
echo -e "  Cluster ID:         ${BOLD}${CLUSTER_NAME}${NC}"
echo -e "  Region:             ${BOLD}${REGION}${NC}"

if [ -n "$TOLERATION_YAML" ]; then
  echo -e "  Tolerations:        ${BOLD}${#TAINT_KEYS[@]} taint(s)${NC}"
fi
echo ""

kubectl create namespace opencost 2>/dev/null || true

if helm status opencost -n opencost &>/dev/null; then
  echo "  Upgrading existing OpenCost..."
  helm upgrade opencost opencost/opencost --namespace opencost -f "$OC_VALUES"
  # Delete old pods to pick up new tolerations
  kubectl delete pod -l app.kubernetes.io/name=opencost -n opencost 2>/dev/null || true
else
  helm install opencost opencost/opencost --namespace opencost -f "$OC_VALUES"
fi

echo "  Waiting for OpenCost to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=opencost -n opencost --timeout=180s
echo -e "  ${GREEN}✓ OpenCost is ready${NC}"
echo ""

###############################################################################
#  [7/7] Port-forward + config + verify / 포트 포워딩 + 설정 + 검증            #
###############################################################################
echo -e "${CYAN}[7/7] Setup port-forward and verify / 포트 포워딩 및 검증${NC}"

# Kill existing port-forward
pkill -f "kubectl port-forward.*opencost.*${OPENCOST_LOCAL_PORT}" 2>/dev/null || true
sleep 1

nohup kubectl port-forward svc/opencost ${OPENCOST_LOCAL_PORT}:9003 -n opencost --address 0.0.0.0 > /tmp/opencost-portforward.log 2>&1 &
sleep 3

OPENCOST_ENDPOINT="http://localhost:${OPENCOST_LOCAL_PORT}"

# Verify port-forward
if curl -s --connect-timeout 3 "${OPENCOST_ENDPOINT}/healthz" &>/dev/null; then
  echo -e "  ${GREEN}✓ Port-forward active: ${OPENCOST_ENDPOINT}${NC}"
else
  echo -e "  ${YELLOW}⚠ Port-forward may not be ready yet${NC}"
  echo "    Check: /tmp/opencost-portforward.log"
fi

# Update config.json
if [ -f "$CONFIG_FILE" ]; then
  python3 -c "
import json
with open('$CONFIG_FILE') as f: c = json.load(f)
c['opencostEndpoint'] = '$OPENCOST_ENDPOINT'
with open('$CONFIG_FILE', 'w') as f: json.dump(c, f, indent=2, ensure_ascii=False)
print('  ✓ config.json updated: opencostEndpoint =', c['opencostEndpoint'])
"
else
  echo -e "  ${YELLOW}⚠ $CONFIG_FILE not found${NC}"
  echo "    Manually add: \"opencostEndpoint\": \"$OPENCOST_ENDPOINT\""
fi

# Test API
echo ""
echo "  Testing OpenCost API..."
RESPONSE=$(curl -s --connect-timeout 5 "${OPENCOST_ENDPOINT}/allocation/compute?window=1h&aggregate=namespace" 2>/dev/null || echo "FAILED")
if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); ns=list(d.get('data',[{}])[0].keys()); print('  ✓ Namespaces:', len(ns), '-', ', '.join(ns[:5]), '...' if len(ns)>5 else '')" 2>/dev/null; then
  echo -e "  ${GREEN}✓ OpenCost API: OK${NC}"
else
  echo -e "  ${YELLOW}⚠ Data may take a few minutes to populate${NC}"
  echo "  Retry: curl ${OPENCOST_ENDPOINT}/allocation/compute?window=1h&aggregate=namespace"
fi

###############################################################################
#  Summary / 요약                                                              #
###############################################################################
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   OpenCost Setup Complete! / OpenCost 설치 완료!${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Cluster:      $CLUSTER_NAME"
echo "  Prometheus:   ${PROM_NAMESPACE}/${PROM_SVC_NAME}:${PROM_SVC_PORT}"
echo "  OpenCost:     ${OPENCOST_ENDPOINT}"
if [ -n "$TOLERATION_YAML" ]; then
  echo "  Tolerations:  ${#TAINT_KEYS[@]} taint(s) tolerated"
fi
echo "  Config:       $CONFIG_FILE"
echo ""
echo -e "  ${BOLD}Next steps / 다음 단계:${NC}"
echo "  1. Rebuild: npm run build"
echo "  2. Restart: sudo systemctl restart awsops"
echo "  3. Check: /awsops/eks-container-cost"
echo ""
echo -e "  ${YELLOW}Note: port-forward stops on EC2 reboot.${NC}"
echo "  Restart: kubectl port-forward svc/opencost ${OPENCOST_LOCAL_PORT}:9003 -n opencost --address 0.0.0.0 &"
echo ""
