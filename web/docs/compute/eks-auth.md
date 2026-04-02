---
sidebar_position: 5
title: EKS 인증 설정
description: AWSops EC2 인스턴스에서 EKS 클러스터에 접근하기 위한 인증 설정 가이드
---

# EKS 인증 설정

AWSops의 Kubernetes 대시보드(`/k8s/*`)는 Steampipe의 `kubernetes` 플러그인을 통해 EKS 클러스터 데이터를 조회합니다. 이를 위해 **AWSops EC2 인스턴스 역할이 EKS 클러스터에 인증**되어야 합니다.

## 인증 구조

```
EC2 인스턴스 역할 (IAM Role)
  → kubeconfig (aws eks update-kubeconfig)
    → EKS API Server
      → Access Entry 또는 aws-auth ConfigMap 검증
        → Kubernetes API 접근 허용
          → Steampipe kubernetes 플러그인 → 대시보드 표시
```

## 사전 확인

### 1. EC2 인스턴스 역할 ARN 확인

AWSops EC2에 SSH 접속 후 실행:

```bash
# EC2 인스턴스 역할 ARN 확인
aws sts get-caller-identity --query "Arn" --output text

# 출력 예시: arn:aws:sts::123456789012:assumed-role/AwsopsEc2Role/i-0abc123
# → IAM Role ARN: arn:aws:iam::123456789012:role/AwsopsEc2Role
```

:::tip ARN 변환
`sts:assumed-role` 형식을 `iam:role` 형식으로 변환해야 합니다:
- `arn:aws:sts::ACCOUNT:assumed-role/ROLE_NAME/i-xxx`
- → `arn:aws:iam::ACCOUNT:role/ROLE_NAME`
:::

### 2. EKS 클러스터 인증 모드 확인

```bash
aws eks describe-cluster --name CLUSTER_NAME \
  --query 'cluster.accessConfig.authenticationMode' \
  --output text
```

| 인증 모드 | 설명 | 권장 방법 |
|-----------|------|----------|
| `API` | Access Entry API만 사용 | **방법 1** |
| `API_AND_CONFIG_MAP` | Access Entry + aws-auth 모두 사용 | **방법 1** (권장) |
| `CONFIG_MAP` | aws-auth ConfigMap만 사용 | **방법 2** |

## 방법 1: Access Entry API

:::info 권한 요구사항
다음 명령은 **EKS 클러스터에 대한 `eks:CreateAccessEntry` 및 `eks:AssociateAccessPolicy` 권한**이 필요합니다. 클러스터를 생성한 계정 또는 관리자 권한이 있는 IAM 주체로 실행하세요.
:::

### Step 1: Access Entry 생성

```bash
aws eks create-access-entry \
  --cluster-name CLUSTER_NAME \
  --principal-arn arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME \
  --type STANDARD
```

### Step 2: ClusterAdmin 정책 연결

```bash
aws eks associate-access-policy \
  --cluster-name CLUSTER_NAME \
  --principal-arn arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster
```

:::tip 최소 권한 원칙
읽기 전용 접근만 필요하면 `AmazonEKSClusterAdminPolicy` 대신 `AmazonEKSViewPolicy`를 사용할 수 있습니다. 단, Steampipe의 일부 CRD 테이블 조회가 제한될 수 있습니다.
:::

### Step 3: kubeconfig 생성

AWSops EC2에서 실행:

```bash
aws eks update-kubeconfig \
  --name CLUSTER_NAME \
  --region ap-northeast-2
```

### Step 4: Steampipe K8s 플러그인 설정

```bash
cat > ~/.steampipe/config/kubernetes.spc << 'EOF'
connection "kubernetes" {
  plugin = "kubernetes"
  custom_resource_tables = ["*"]
}
EOF

# Steampipe 서비스 재시작
sudo systemctl restart steampipe
```

### Step 5: 연결 테스트

```bash
# kubectl 테스트
kubectl get nodes

# Steampipe 테스트
steampipe query "SELECT name, phase FROM kubernetes_namespace LIMIT 5"
```

## 방법 2: aws-auth ConfigMap

`CONFIG_MAP` 모드 클러스터에서는 `kube-system` 네임스페이스의 `aws-auth` ConfigMap에 IAM 역할을 직접 추가해야 합니다.

:::info 권한 요구사항
`kubectl edit` 명령은 **클러스터에 이미 인증된 관리자**가 실행해야 합니다. 클러스터를 생성한 IAM 주체 또는 기존 `system:masters` 그룹 멤버로 실행하세요.
:::

### Step 1: aws-auth ConfigMap 편집

```bash
kubectl edit configmap aws-auth -n kube-system
```

### Step 2: mapRoles에 EC2 역할 추가

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    # 기존 역할 유지
    - rolearn: arn:aws:iam::ACCOUNT_ID:role/EXISTING_ROLE
      username: existing-user
      groups:
        - system:masters
    # AWSops EC2 역할 추가
    - rolearn: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME
      username: awsops-ec2
      groups:
        - system:masters
```

:::caution aws-auth 편집 주의
`aws-auth` ConfigMap을 잘못 수정하면 클러스터 접근이 차단될 수 있습니다. 편집 전 반드시 백업하세요:
```bash
kubectl get configmap aws-auth -n kube-system -o yaml > aws-auth-backup.yaml
```
:::

### Step 3: kubeconfig + Steampipe 설정

방법 1의 Step 3~5와 동일합니다.

## 멀티 클러스터 설정

여러 EKS 클러스터를 모니터링하려면 각 클러스터에 대해 인증 설정을 반복하세요:

```bash
# 각 클러스터의 kubeconfig 추가
aws eks update-kubeconfig --name cluster-1 --region ap-northeast-2
aws eks update-kubeconfig --name cluster-2 --region ap-northeast-2

# kubeconfig에 여러 컨텍스트가 등록됨
kubectl config get-contexts
```

Steampipe는 `current-context`의 클러스터를 조회합니다. 기본 컨텍스트를 변경하려면:

```bash
kubectl config use-context arn:aws:eks:ap-northeast-2:ACCOUNT:cluster/CLUSTER_NAME
sudo systemctl restart steampipe
```

## 교차 계정 EKS 접근

다른 AWS 계정의 EKS 클러스터에 접근하려면:

1. **대상 계정**에서 AWSops EC2 역할에 대한 Access Entry 생성 (위 방법 1 참조)
2. **대상 계정**의 IAM 역할을 통한 `AssumeRole` 설정이 필요할 수 있음
3. kubeconfig에 `--role-arn` 옵션 추가:

```bash
aws eks update-kubeconfig \
  --name CLUSTER_NAME \
  --region ap-northeast-2 \
  --role-arn arn:aws:iam::TARGET_ACCOUNT:role/EKSAccessRole
```

## 자동 설정 스크립트

AWSops에는 위 과정을 자동화하는 스크립트가 포함되어 있습니다:

```bash
bash scripts/04-setup-eks-access.sh
```

이 스크립트는 다음을 자동으로 수행합니다:
1. kubectl 설치
2. EKS 클러스터 탐색 (현재 리전 + 6개 추가 리전)
3. kubeconfig 생성
4. 인증 모드 감지 후 Access Entry 등록 또는 aws-auth 안내
5. Steampipe kubernetes 플러그인 설정
6. 연결 테스트

## 트러블슈팅

### "error: You must be logged in to the server"

kubeconfig가 없거나 만료되었습니다:
```bash
aws eks update-kubeconfig --name CLUSTER_NAME --region REGION
```

### "AccessDeniedException: User is not authorized"

EC2 역할에 EKS API 호출 권한이 없습니다. IAM 정책에 다음을 추가하세요:
```json
{
  "Effect": "Allow",
  "Action": [
    "eks:DescribeCluster",
    "eks:ListClusters"
  ],
  "Resource": "*"
}
```

### "error: exec plugin: invalid apiVersion"

AWS CLI v1을 사용 중일 수 있습니다. v2로 업그레이드하세요:
```bash
aws --version  # aws-cli/2.x 확인
```

### Steampipe에서 K8s 테이블이 안 보임

Steampipe K8s 플러그인 설정을 확인하세요:
```bash
cat ~/.steampipe/config/kubernetes.spc
# plugin = "kubernetes" 확인
sudo systemctl restart steampipe
```

## 관련 페이지

- [EKS Overview](./eks) — EKS 클러스터 대시보드
- [EKS Explorer](./eks-explorer) — K9s 스타일 터미널 UI
- [배포 가이드](../getting-started/deployment) — 전체 배포 과정
