#!/bin/bash
###############################################################################
# Step 6f: Install Prometheus + Metrics Server + OpenCost on EKS cluster      #
# 단계 6f: EKS 클러스터에 Prometheus + Metrics Server + OpenCost 설치         #
#                                                                             #
# Prerequisites / 전제 조건:                                                   #
#   - EKS cluster accessible via kubectl                                      #
#   - AWS credentials configured                                              #
#   - KUBECONFIG set (~/.kube/config)                                         #
#                                                                             #
# OpenCost requires Prometheus for metrics collection                         #
# OpenCost는 메트릭 수집을 위해 Prometheus가 필요합니다                        #
###############################################################################

set -e

REGION="${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || echo 'ap-northeast-2')}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/data/config.json"
OPENCOST_LOCAL_PORT=9003

echo "============================================"
echo "  Step 6f: Prometheus + OpenCost Setup"
echo "============================================"
echo ""

# 0. Verify kubectl access / kubectl 접근 확인
echo "[0/8] Verifying kubectl access..."
if ! kubectl cluster-info &>/dev/null; then
  echo "ERROR: kubectl cannot access the cluster. Check KUBECONFIG."
  echo "  export KUBECONFIG=~/.kube/config"
  exit 1
fi
CLUSTER_NAME=$(kubectl config current-context 2>/dev/null | sed 's/.*\///')
echo "  Cluster: $CLUSTER_NAME"
echo ""

# 1. Install Helm / Helm 설치
echo "[1/8] Checking Helm..."
if ! command -v helm &>/dev/null; then
  echo "  Installing Helm 3..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
else
  echo "  Helm $(helm version --short) already installed"
fi
echo ""

# 2. Install Metrics Server / Metrics Server 설치
echo "[2/8] Installing Metrics Server..."
if kubectl get deployment metrics-server -n kube-system &>/dev/null; then
  echo "  Metrics Server already installed"
else
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  echo "  Waiting for Metrics Server to be ready..."
  kubectl wait --for=condition=ready pod -l k8s-app=metrics-server -n kube-system --timeout=120s
  echo "  Metrics Server installed"
fi
echo ""

# 3. Install Prometheus (required by OpenCost) / Prometheus 설치 (OpenCost 필수)
echo "[3/8] Installing Prometheus..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
helm repo update

if helm status prometheus -n opencost &>/dev/null; then
  echo "  Prometheus already installed"
else
  kubectl create namespace opencost 2>/dev/null || true
  helm install prometheus prometheus-community/prometheus \
    --namespace opencost \
    --set server.persistentVolume.enabled=false \
    --set alertmanager.enabled=false \
    --set kube-state-metrics.enabled=true \
    --set prometheus-node-exporter.enabled=true \
    --set prometheus-pushgateway.enabled=false
  echo "  Waiting for Prometheus to be ready..."
  kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus,app.kubernetes.io/component=server -n opencost --timeout=180s
  echo "  Prometheus installed"
fi
echo ""

# 4. Install OpenCost / OpenCost 설치
echo "[4/8] Installing OpenCost..."
helm repo add opencost https://opencost.github.io/opencost-helm-chart 2>/dev/null || true

if helm status opencost -n opencost &>/dev/null; then
  echo "  OpenCost already installed, upgrading..."
  helm upgrade opencost opencost/opencost \
    --namespace opencost \
    --set opencost.exporter.defaultClusterId="$CLUSTER_NAME" \
    --set opencost.exporter.aws.service_account_region="$REGION" \
    --set opencost.prometheus.internal.serviceName=prometheus-server \
    --set opencost.prometheus.internal.namespaceName=opencost \
    --set opencost.prometheus.internal.port=80
else
  helm install opencost opencost/opencost \
    --namespace opencost \
    --set opencost.exporter.defaultClusterId="$CLUSTER_NAME" \
    --set opencost.exporter.aws.service_account_region="$REGION" \
    --set opencost.prometheus.internal.serviceName=prometheus-server \
    --set opencost.prometheus.internal.namespaceName=opencost \
    --set opencost.prometheus.internal.port=80
fi
echo ""

# 5. Wait for OpenCost ready / OpenCost 준비 대기
echo "[5/8] Waiting for OpenCost to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=opencost -n opencost --timeout=180s
echo "  OpenCost is ready"
echo ""

# 6. Start port-forward (EC2 localhost:9003 -> OpenCost) / 포트 포워딩 시작
echo "[6/8] Starting port-forward (localhost:${OPENCOST_LOCAL_PORT} -> OpenCost)..."
# Kill existing port-forward / 기존 포트 포워딩 종료
pkill -f "kubectl port-forward.*opencost.*${OPENCOST_LOCAL_PORT}" 2>/dev/null || true
sleep 1

nohup kubectl port-forward svc/opencost ${OPENCOST_LOCAL_PORT}:9003 -n opencost --address 0.0.0.0 > /tmp/opencost-portforward.log 2>&1 &
sleep 3

OPENCOST_ENDPOINT="http://localhost:${OPENCOST_LOCAL_PORT}"

# Verify port-forward / 포트 포워딩 확인
if curl -s --connect-timeout 3 "${OPENCOST_ENDPOINT}/healthz" &>/dev/null; then
  echo "  Port-forward active: ${OPENCOST_ENDPOINT}"
else
  echo "  WARNING: Port-forward may not be ready yet. Check /tmp/opencost-portforward.log"
fi
echo ""

# 7. Update config.json / config.json 업데이트
echo "[7/8] Updating config.json..."
if [ -f "$CONFIG_FILE" ]; then
  python3 -c "
import json
with open('$CONFIG_FILE') as f: c = json.load(f)
c['opencostEndpoint'] = '$OPENCOST_ENDPOINT'
with open('$CONFIG_FILE', 'w') as f: json.dump(c, f, indent=2)
print('  Updated: opencostEndpoint =', c['opencostEndpoint'])
"
else
  echo "  WARNING: $CONFIG_FILE not found. Manually add:"
  echo "    \"opencostEndpoint\": \"$OPENCOST_ENDPOINT\""
fi
echo ""

# 8. Verify API / API 검증
echo "[8/8] Testing OpenCost API..."
RESPONSE=$(curl -s --connect-timeout 5 "${OPENCOST_ENDPOINT}/allocation/compute?window=1h&aggregate=namespace" 2>/dev/null || echo "FAILED")
if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Namespaces found:', len(d.get('data',[{}])[0]))" 2>/dev/null; then
  echo "  OpenCost API: OK"
else
  echo "  OpenCost API: Not ready yet (data may take a few minutes to populate)"
  echo "  Retry: curl ${OPENCOST_ENDPOINT}/allocation/compute?window=1h&aggregate=namespace"
fi
echo ""

echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  Prometheus:   installed in opencost namespace"
echo "  OpenCost:     ${OPENCOST_ENDPOINT}"
echo "  Port-forward: kubectl port-forward svc/opencost ${OPENCOST_LOCAL_PORT}:9003 -n opencost"
echo "  Config:       $CONFIG_FILE"
echo "  Log:          /tmp/opencost-portforward.log"
echo ""
echo "  Next steps / 다음 단계:"
echo "  1. Rebuild dashboard: cd ~/awsops && npm run build"
echo "  2. Restart server: pkill -f 'next-server' && nohup sh -c 'PORT=3000 npm run start' > /tmp/awsops-server.log 2>&1 &"
echo "  3. Check EKS Container Cost page for OpenCost data"
echo ""
echo "  Note: port-forward stops on EC2 reboot."
echo "  Use 'bash scripts/09-start-all.sh' to restart all services including port-forward."
echo ""
