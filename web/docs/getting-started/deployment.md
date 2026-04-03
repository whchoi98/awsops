---
sidebar_position: 4
title: 배포 가이드
description: AWSops 배포 단계 및 요구사항
---

import DeploymentPipeline from '@site/src/components/diagrams/DeploymentPipeline';

# 배포 가이드

AWSops를 새 AWS 계정에 배포하기 위한 전체 과정을 설명합니다.

<DeploymentPipeline />

## Prerequisites

| 항목 | 요구사항 |
|------|----------|
| **AWS 계정** | 적절한 IAM 권한 (Admin 또는 PowerUser) |
| **CDK CLI** | 로컬 머신에 설치 (`npm install -g aws-cdk`) |
| **Docker** | arm64 빌드 지원 (`docker buildx`) |
| **Node.js** | v20 이상 |
| **AWS CLI** | v2, 프로필 설정 완료 |

## 빠른 설치

:::tip install-all.sh
Step 1 → 2 → 3 → 10을 자동으로 순차 실행하는 편의 스크립트입니다. CDK 인프라(Step 0) 배포 후 사용하세요.

```bash
bash scripts/install-all.sh
```
:::

## 배포 단계

### Step 0: CDK 인프라 배포 (로컬)

```bash
cd infra-cdk && cdk deploy --all
```

CDK가 배포하는 리소스:
- **VPC**: 10.10.0.0/16, 2 AZ, NAT Gateway, Public + Private Subnet (CDK 컨텍스트 파라미터 `newVpcCidr`로 변경 가능)
- **EC2**: t4g.2xlarge (ARM64 Graviton), 100GB GP3, Private Subnet
- **ALB**: Internet-facing, Custom Header 검증
- **CloudFront**: CACHING_DISABLED, ALB Origin
- **Cognito**: User Pool + Lambda@Edge (us-east-1)

### Step 1: Steampipe 설치 (EC2)

```bash
bash scripts/01-install-base.sh
```

Steampipe + AWS/K8s/Trivy 플러그인 설치. PostgreSQL port 9193에서 380+ AWS 테이블 사용 가능.

### Step 2: Next.js 설정 (EC2)

```bash
bash scripts/02-setup-nextjs.sh
```

Next.js 14 앱 설치, Steampipe 서비스 등록, MSP 환경 자동 감지.

### Step 3: 프로덕션 빌드 (EC2)

```bash
bash scripts/03-build-deploy.sh
```

`npm run build` + `npm start`로 프로덕션 서버 실행.

### Step 4: EKS 접근 설정 (EC2)

```bash
bash scripts/04-setup-eks-access.sh
```

EKS 클러스터 접근에 필요한 설정을 수행합니다:
- **kubectl** 설치 (ARM64 바이너리)
- 리전 내 EKS 클러스터 자동 검색
- **kubeconfig** 설정 (`aws eks update-kubeconfig`)
- EKS 접근 엔트리(access entry) 등록
- Steampipe **Kubernetes** 플러그인 + **Trivy** 플러그인 연결 설정

:::info EKS가 없는 환경
EKS 클러스터가 없는 계정에서는 이 단계를 건너뛸 수 있습니다. Kubernetes 관련 페이지만 비활성화됩니다.
:::

### Step 5: Cognito 인증 (EC2)

```bash
bash scripts/05-setup-cognito.sh
```

Cognito User Pool 사용자 생성 및 앱 클라이언트 설정.

### Step 6a-6f: AgentCore (EC2)

**래퍼 스크립트**로 6a → 6e를 순차 실행할 수 있습니다:

```bash
bash scripts/06-setup-agentcore.sh
```

| 스크립트 | 설명 |
|----------|------|
| `06a-setup-agentcore-runtime.sh` | IAM 역할, ECR, Docker arm64 빌드, Runtime Endpoint |
| `06b-setup-agentcore-gateway.sh` | 8개 Gateway 생성 (MCP) |
| `06c-setup-agentcore-tools.sh` | 19 Lambda + 8 Gateway에 125 도구 등록 |
| `06d-setup-agentcore-interpreter.sh` | Code Interpreter 생성 |
| `06e-setup-agentcore-config.sh` | `route.ts` / `agent.py` 자동 설정 (ARN, Gateway URL 등) |
| `06e-setup-agentcore-memory.sh` | Memory Store 생성 (365일 보관) — **수동 실행 필요** |
| `06f-setup-opencost.sh` | Prometheus + OpenCost (EKS 비용 분석) |

:::warning 06e 파일 네이밍 충돌
`06e-setup-agentcore-config.sh`와 `06e-setup-agentcore-memory.sh` 두 파일이 같은 `06e` 접두사를 공유합니다. 래퍼 스크립트(`06-setup-agentcore.sh`)는 config만 실행하므로, Memory Store는 반드시 별도로 수동 실행해야 합니다:

```bash
bash scripts/06e-setup-agentcore-memory.sh
```
:::

### Step 7: CloudFront 인증 연동 (EC2)

```bash
bash scripts/07-setup-cloudfront-auth.sh
```

Lambda@Edge를 CloudFront viewer-request에 연결.

### Step 8: 서비스 시작 (EC2)

```bash
bash scripts/08-start-all.sh
```

다음 서비스를 순차적으로 시작합니다:
- **Steampipe** 서비스 (PostgreSQL port 9193)
- **Next.js** 프로덕션 서버 (port 3000)
- **OpenCost** (EKS 비용 분석, EKS가 설정된 경우)

### Step 9: 서비스 중지 (EC2)

```bash
bash scripts/09-stop-all.sh
```

실행 중인 모든 AWSops 서비스를 안전하게 중지합니다. 유지보수 또는 업데이트 시 사용합니다.

### Step 10: 검증 및 헬스 체크 (EC2)

```bash
bash scripts/10-verify.sh
```

5단계 자동 검증을 수행합니다:
1. **서비스 상태** — Steampipe, Next.js 프로세스 확인
2. **Steampipe 테이블** — 18개 핵심 테이블 존재 여부 확인
3. **페이지 접근** — 20+ 페이지 HTTP 응답 코드 검증
4. **API 응답** — 주요 API 엔드포인트 동작 확인
5. **설정 파일** — `data/config.json` 유효성 검증

:::tip 배포 후 필수
Step 3 이후 또는 업데이트 후 `10-verify.sh`를 실행하여 모든 구성 요소가 정상인지 확인하세요. `install-all.sh`에도 포함되어 있습니다.
:::

### Step 11: 멀티 어카운트 설정 (EC2, 선택)

```bash
bash scripts/11-setup-multi-account.sh
```

여러 AWS 계정을 하나의 AWSops 인스턴스에서 관리하기 위한 설정입니다:
- Steampipe **Aggregator** 연결 설정 (`aws` = 모든 계정 통합)
- 교차 계정 **IAM 역할** 생성 및 신뢰 관계 설정
- `data/config.json`에 `accounts[]` 배열 업데이트

:::info 선택적 단계
단일 계정 환경에서는 이 단계가 필요하지 않습니다. 멀티 어카운트가 필요한 경우에만 실행하세요.
:::

## 설정 파일

배포 완료 후 `data/config.json`이 자동 생성됩니다. 새 계정에 배포할 때는 이 파일만 업데이트하면 됩니다.

```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID",
  "codeInterpreterName": "awsops_code_interpreter_XXXXX",
  "memoryId": "awsops_memory_XXXXX",
  "memoryName": "awsops_memory",
  "adminEmails": ["admin@example.com"],
  "accounts": [
    {
      "accountId": "111111111111",
      "alias": "Host",
      "connectionName": "aws_111111111111",
      "region": "ap-northeast-2",
      "isHost": true,
      "features": { "costEnabled": true, "eksEnabled": true, "k8sEnabled": true }
    },
    {
      "accountId": "222222222222",
      "alias": "Staging",
      "connectionName": "aws_222222222222",
      "region": "ap-northeast-2",
      "isHost": false,
      "features": { "costEnabled": false, "eksEnabled": false, "k8sEnabled": false }
    }
  ],
  "customerLogo": "default.png"
}
```

:::tip 코드 수정 불필요
계정별 배포 시 `data/config.json`만 변경하면 됩니다. 소스 코드 수정은 필요하지 않습니다.
:::

## 알려진 이슈

:::warning 배포 시 주의사항

**1. `06e` 파일 네이밍 충돌**
`06e-setup-agentcore-config.sh`와 `06e-setup-agentcore-memory.sh`가 같은 접두사를 사용합니다. Memory Store 생성은 래퍼 스크립트에 포함되지 않으므로 반드시 수동 실행하세요:
```bash
bash scripts/06e-setup-agentcore-memory.sh
```

**2. systemd 서비스 설정**
기본 생성되는 systemd 서비스 파일에서 `proxy.js` 참조가 남아 있을 수 있습니다. 올바른 시작 명령은 `npm run start`이며, nvm 환경에서는 Node.js 전체 경로(`/home/ec2-user/.nvm/versions/node/v20.x.x/bin/node`)를 사용해야 합니다.

**3. Docker arm64 필수**
AgentCore Runtime Docker 이미지는 반드시 arm64로 빌드해야 합니다:
```bash
docker buildx build --platform linux/arm64 --load -t awsops-agent .
```
:::

## 관련 페이지

- [인증 흐름](./auth) - Cognito 인증 상세
- [AgentCore](../overview/agentcore) - AgentCore 아키텍처 상세
- [대시보드](../overview/dashboard) - 시스템 아키텍처 개요
