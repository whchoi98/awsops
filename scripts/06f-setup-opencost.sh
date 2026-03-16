#!/bin/bash
###############################################################################
# Step 6f: Install Metrics Server + OpenCost on EKS cluster                   #
# 단계 6f: EKS 클러스터에 Metrics Server + OpenCost 설치                      #
#                                                                             #
# Prerequisites / 전제 조건:                                                   #
#   - EKS cluster accessible via kubectl                                      #
#   - AWS credentials configured                                              #
#   - KUBECONFIG set (~/.kube/config)                                         #
###############################################################################

set -e

REGION="ap-northeast-2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/data/config.json"

echo "============================================"
echo "  Step 6f: Metrics Server + OpenCost Setup"
echo "============================================"
echo ""

# 0. Verify kubectl access / kubectl 접근 확인
echo "[0/6] Verifying kubectl access..."
if ! kubectl cluster-info &>/dev/null; then
  echo "ERROR: kubectl cannot access the cluster. Check KUBECONFIG."
  echo "  export KUBECONFIG=~/.kube/config"
  exit 1
fi
CLUSTER_NAME=$(kubectl config current-context 2>/dev/null | sed 's/.*\///')
echo "  Cluster: $CLUSTER_NAME"
echo ""

# 1. Install Helm / Helm 설치
echo "[1/6] Checking Helm..."
if ! command -v helm &>/dev/null; then
  echo "  Installing Helm 3..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
else
  echo "  Helm $(helm version --short) already installed"
fi
echo ""

# 2. Install Metrics Server / Metrics Server 설치
echo "[2/6] Installing Metrics Server..."
if kubectl get deployment metrics-server -n kube-system &>/dev/null; then
  echo "  Metrics Server already installed"
else
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  echo "  Waiting for Metrics Server to be ready..."
  kubectl wait --for=condition=ready pod -l k8s-app=metrics-server -n kube-system --timeout=120s
  echo "  Metrics Server installed"
fi
echo ""

# 3. Install OpenCost / OpenCost 설치
echo "[3/6] Installing OpenCost..."
if helm status opencost -n opencost &>/dev/null; then
  echo "  OpenCost already installed, upgrading..."
  helm upgrade opencost opencost/opencost \
    --namespace opencost \
    --set opencost.exporter.defaultClusterId="$CLUSTER_NAME" \
    --set opencost.exporter.aws.service_account_region="$REGION"
else
  helm repo add opencost https://opencost.github.io/opencost-helm-chart 2>/dev/null || true
  helm repo update
  helm install opencost opencost/opencost \
    --namespace opencost --create-namespace \
    --set opencost.exporter.defaultClusterId="$CLUSTER_NAME" \
    --set opencost.exporter.aws.service_account_region="$REGION"
fi
echo ""

# 4. Wait for OpenCost ready / OpenCost 준비 대기
echo "[4/6] Waiting for OpenCost to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=opencost -n opencost --timeout=180s
echo "  OpenCost is ready"
echo ""

# 5. Create NodePort service for EC2 access / EC2 접근용 NodePort 서비스
echo "[5/6] Creating NodePort service..."
if kubectl get svc opencost-external -n opencost &>/dev/null; then
  echo "  NodePort service already exists"
else
  kubectl expose deployment opencost -n opencost \
    --type=NodePort --port=9003 --target-port=9003 --name=opencost-external
  echo "  NodePort service created"
fi

OPENCOST_NODEPORT=$(kubectl get svc opencost-external -n opencost -o jsonpath='{.spec.ports[0].nodePort}')
# Get a worker node IP / 워커 노드 IP 가져오기
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
OPENCOST_ENDPOINT="http://${NODE_IP}:${OPENCOST_NODEPORT}"
echo "  OpenCost endpoint: $OPENCOST_ENDPOINT"
echo ""

# 6. Update config.json / config.json 업데이트
echo "[6/6] Updating config.json..."
if [ -f "$CONFIG_FILE" ]; then
  # Check if opencostEndpoint already exists / 이미 있는지 확인
  if grep -q "opencostEndpoint" "$CONFIG_FILE"; then
    # Update existing value / 기존 값 업데이트
    sed -i "s|\"opencostEndpoint\":.*|\"opencostEndpoint\": \"$OPENCOST_ENDPOINT\"|" "$CONFIG_FILE"
  else
    # Add before last closing brace / 마지막 } 앞에 추가
    sed -i "s|}$|,\n  \"opencostEndpoint\": \"$OPENCOST_ENDPOINT\"\n}|" "$CONFIG_FILE"
  fi
  echo "  Updated: opencostEndpoint = $OPENCOST_ENDPOINT"
else
  echo "  WARNING: $CONFIG_FILE not found. Manually add:"
  echo "    \"opencostEndpoint\": \"$OPENCOST_ENDPOINT\""
fi
echo ""

# 7. Verify / 검증
echo "============================================"
echo "  Verification"
echo "============================================"
echo ""
echo "Testing OpenCost API..."
RESPONSE=$(curl -s --connect-timeout 5 "$OPENCOST_ENDPOINT/allocation/compute?window=1h&aggregate=namespace" 2>/dev/null || echo "FAILED")
if echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  echo "  OpenCost API: OK (valid JSON response)"
else
  echo "  OpenCost API: FAILED or not ready yet"
  echo "  This may take a few minutes for data to populate."
  echo "  Retry: curl $OPENCOST_ENDPOINT/allocation/compute?window=1h"
fi
echo ""

echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  OpenCost endpoint: $OPENCOST_ENDPOINT"
echo "  NodePort: $OPENCOST_NODEPORT"
echo "  Config: $CONFIG_FILE"
echo ""
echo "  Next steps / 다음 단계:"
echo "  1. Ensure EKS worker node SG allows inbound from EC2 on port $OPENCOST_NODEPORT"
echo "     (EKS 워커 노드 SG에서 EC2의 포트 $OPENCOST_NODEPORT 인바운드 허용 필요)"
echo "  2. Rebuild & restart dashboard: npm run build && pkill -f 'next-server'"
echo "     (대시보드 재빌드 및 재시작)"
echo "  3. Check EKS Container Cost page — OpenCost data will appear"
echo "     (EKS Container Cost 페이지에서 OpenCost 데이터 확인)"
echo ""
