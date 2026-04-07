# AWSops

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.7.0-green.svg)](CHANGELOG.md)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![Bedrock](https://img.shields.io/badge/Amazon%20Bedrock-AgentCore-orange.svg)](https://aws.amazon.com/bedrock/)
[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#한국어)

Real-time AWS + Kubernetes operations dashboard with AI-powered analysis
/ AI 기반 실시간 AWS + Kubernetes 운영 대시보드

---

# English

## Overview

AWSops is an operations dashboard that provides real-time monitoring of AWS and Kubernetes resources, network troubleshooting, CIS compliance scanning, and AI-powered analysis in a single interface. It queries 380+ AWS tables and 60+ K8s tables through Steampipe's embedded PostgreSQL, and routes AI questions to specialized AgentCore Gateways equipped with 125 MCP tools.

**Stats**: 36 pages / 50 routes / 25 SQL query files / 13 API routes / 125 MCP tools (8 Gateways) / 17 components

![AWSops Architecture](images/awsops_arch_01.png)

### Screenshots

| Dashboard | AI Assistant | EC2 |
|:---------:|:------------:|:---:|
| ![Dashboard](images/01.dashboard.png) | ![AI](images/02.AI_Assitant.png) | ![EC2](images/03.ec2.png) |

| EKS Overview | Cost Explorer |
|:------------:|:-------------:|
| ![EKS](images/04.eks.png) | ![Cost](images/05.cost.png) |

## Features

- **Real-time Resource Monitoring** -- Query 380+ AWS tables and 60+ K8s tables via Steampipe SQL with 5-minute cache and background pre-warming
- **AI-Powered Analysis** -- 10-route intent classification routes questions to 8 specialized AgentCore Gateways (125 MCP tools) with multi-route parallel execution and SSE streaming
- **CIS Compliance Scanning** -- CIS v1.5 through v4.0 benchmarks covering 431 controls via Powerpipe
- **Multi-Account Support** -- Steampipe Aggregator pattern with per-account search_path scoping, zero code changes for account addition
- **Network Topology and Troubleshooting** -- Interactive infrastructure and K8s maps with React Flow, VPC Reachability Analyzer, and Flow Log analysis
- **Container Cost Analysis** -- ECS Fargate cost estimation via Container Insights, EKS pod-level cost via OpenCost (CPU/Memory/Network/Storage/GPU)

## Prerequisites

- AWS Account with admin access
- EC2 instance (Amazon Linux 2023, t4g.2xlarge or larger)
- AWS CLI v2 configured with credentials
- kubectl + kubeconfig (for Kubernetes features)
- Node.js 18+ (installed automatically by setup scripts)

## Installation

```bash
# Step 0: Deploy CDK infrastructure (run from local machine)
export VSCODE_PASSWORD='YourPassword'
bash scripts/00-deploy-infra.sh
# -> cdk bootstrap + cdk deploy AwsopsStack
# -> VPC, EC2, ALB, CloudFront, SSM Endpoints

# Connect to EC2 via SSM
aws ssm start-session --target <instance-id>

# Steps 1-3: Install dashboard (inside EC2)
cd /home/ec2-user/awsops
bash scripts/install-all.sh   # 01 -> 02 -> 03 -> 10 auto execution

# Step 4: EKS access setup (optional)
bash scripts/04-setup-eks-access.sh

# Step 5: Cognito authentication
bash scripts/05-setup-cognito.sh

# Step 6: AgentCore AI (batch or individual)
bash scripts/06-setup-agentcore.sh   # 6a -> 6b -> 6c -> 6d -> 6e batch

# Step 7: Lambda@Edge -> CloudFront integration
bash scripts/07-setup-cloudfront-auth.sh

# Step 11: Multi-account setup (optional)
bash scripts/11-setup-multi-account.sh
```

## Usage

```bash
# Start all services
bash scripts/08-start-all.sh    # Start + status + URLs

# Stop all services
bash scripts/09-stop-all.sh

# Health check
bash scripts/10-verify.sh

# Production build and deploy
npm run build && npm run start
# Access at https://<cloudfront-domain>/awsops/
```

### AI Assistant Routing

The AI classifier analyzes user questions and routes them to 1-3 optimal gateways in parallel, then synthesizes the results.

```
User Question
    |-- "Run code", "calculate"      --> Code Interpreter (Python sandbox)
    |-- VPC, TGW, VPN, ENI           --> Network Gateway (17 tools)
    |-- EKS, ECS, Istio              --> Container Gateway (24 tools)
    |-- CDK, Terraform, CFn          --> IaC Gateway (12 tools)
    |-- DynamoDB, RDS, Cache, Kafka  --> Data Gateway (24 tools)
    |-- IAM, SG, compliance          --> Security Gateway (14 tools)
    |-- CloudWatch, alarms, logs     --> Monitoring Gateway (16 tools)
    |-- Cost, budget, savings        --> Cost Gateway (9 tools)
    |-- EC2, S3, Lambda list         --> Steampipe SQL + Bedrock analysis
    |-- General questions            --> Ops Gateway (9 tools) + Bedrock fallback
```

## Configuration

Configuration is managed through `data/config.json`. No code changes are needed per account.

| Variable | Description | Default |
|----------|-------------|---------|
| `costEnabled` | Enable Cost Explorer queries | `true` |
| `agentRuntimeArn` | AgentCore Runtime ARN | (set by setup script) |
| `codeInterpreterName` | Code Interpreter name | (set by setup script) |
| `memoryId` | Memory Store ID for conversation history | (set by setup script) |
| `accounts[]` | Array of AWS account configs | (set by setup script) |
| `customerLogo` | Customer logo filename in `public/logos/` | `default.png` |
| `adminEmails` | Emails allowed to access /accounts page | `[]` |

Environment variables (`.env.local`):

| Variable | Description | Default |
|----------|-------------|---------|
| `STEAMPIPE_PASSWORD` | Steampipe database password | `steampipe` |
| `AWS_REGION` | AWS region | `ap-northeast-2` |
| `NODE_ENV` | Node.js environment | `production` |

## Project Structure

```
awsops/
├── src/
│   ├── app/                        # 36 pages + 13 API routes
│   │   ├── page.tsx                # Dashboard home (20 StatsCards)
│   │   ├── ai/                     # AI Assistant (SSE streaming, multi-route)
│   │   ├── agentcore/              # AgentCore dashboard (Runtime/Gateway status)
│   │   ├── bedrock/                # Bedrock model usage monitoring
│   │   ├── accounts/               # Multi-account management (admin only)
│   │   ├── ec2/, lambda/, ecs/     # Compute resources
│   │   ├── k8s/                    # EKS (overview, pods, nodes, deployments, explorer)
│   │   ├── vpc/, topology/         # Network + topology maps (React Flow)
│   │   ├── s3/, rds/, dynamodb/    # Storage and databases
│   │   ├── ebs/, msk/, opensearch/ # EBS, MSK Kafka, OpenSearch
│   │   ├── monitoring/, cost/      # CloudWatch metrics, Cost Explorer
│   │   ├── iam/, security/         # IAM, security findings
│   │   ├── compliance/             # CIS v1.5~v4.0 benchmarks
│   │   └── api/                    # 13 API routes
│   ├── lib/
│   │   ├── steampipe.ts            # pg Pool + batch query + cache + zombie cleanup
│   │   ├── queries/                # 25 SQL query files
│   │   ├── app-config.ts           # App config (data/config.json)
│   │   ├── cache-warmer.ts         # Background cache pre-warming (4-min interval)
│   │   ├── agentcore-stats.ts      # AI call statistics + token tracking
│   │   └── agentcore-memory.ts     # Conversation history persistence
│   └── components/                 # 17 shared components
├── agent/
│   ├── agent.py                    # Strands Agent (dynamic gateway selection)
│   ├── Dockerfile                  # Python 3.11-slim, arm64
│   └── lambda/                     # 19 Lambda source files
├── infra-cdk/
│   └── lib/
│       ├── awsops-stack.ts         # VPC, EC2, ALB, CloudFront
│       └── cognito-stack.ts        # Cognito User Pool, Lambda@Edge
├── scripts/                        # 22 deployment scripts (steps 0-11)
├── docs/
│   ├── architecture.md             # Architecture documentation
│   ├── decisions/                  # 8 Architecture Decision Records
│   └── runbooks/                   # Operational runbooks
└── data/config.json                # Runtime config (accounts, features, ARNs)
```

## Data Flow

![AWSops Flow](images/flow.png)

```
Browser --> Next.js :3000 --> Steampipe (Embedded PG) :9193
 36 Pages    POST /awsops/     |- aws (380+ tables) -> AWS API
 Charts      api/steampipe     |- k8s (60+ tables)  -> K8s API
 Tables      batchQuery()      |- trivy              -> CVE DB
             5min TTL cache
```

| Path | Data Source | Response Time |
|------|-------------|---------------|
| Dashboard pages | Steampipe pg Pool -> AWS API | ~2s (instant with cache) |
| AI (AWS resources) | Steampipe + Bedrock Sonnet 4.6 | ~5s |
| AI (network analysis) | AgentCore -> Gateway MCP -> Lambda | ~30-60s |
| AI (code execution) | Bedrock + Code Interpreter | ~10s |
| CIS Compliance | Powerpipe -> Steampipe -> AWS API | ~3-5min |
| Topology graph | Steampipe -> React Flow | ~2s |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts, React Flow |
| Backend | Node.js 20, pg (PostgreSQL client), node-cache |
| Data | Steampipe (embedded PostgreSQL, 380+ AWS tables, 60+ K8s tables), Powerpipe |
| AI | Amazon Bedrock (Claude Sonnet/Opus 4.6), AgentCore Runtime (Strands), 8 Gateways (MCP), Code Interpreter |
| Auth | Amazon Cognito (User Pool + Hosted UI), Lambda@Edge (Python 3.12) |
| IaC | CDK TypeScript (AwsopsStack, CognitoStack) |
| Container | Docker (arm64), ECR |
| Serverless | 19 Lambda functions (Python 3.12, boto3) |

## 8 AgentCore Gateways (125 MCP Tools)

| Gateway | Lambda Targets | Tools | Key Capabilities |
|---------|---------------|-------|------------------|
| Network | network-mcp, reachability, flowmonitor | 17 | VPC, TGW, VPN, ENI, Reachability Analyzer, Flow Logs |
| Container | eks-mcp, ecs-mcp, istio-mcp | 24 | EKS cluster/node/pod, ECS service/task, Istio mesh |
| IaC | iac-mcp, terraform-mcp | 12 | CloudFormation validate, CDK docs, Terraform modules |
| Data | dynamodb-mcp, rds-mcp, valkey-mcp, msk-mcp | 24 | DynamoDB query, RDS Data API, ElastiCache, MSK Kafka |
| Security | iam-mcp | 14 | IAM users/roles/policies, policy simulation |
| Monitoring | cloudwatch-mcp, cloudtrail-mcp | 16 | Metrics, alarms, Log Insights, CloudTrail events |
| Cost | cost-mcp | 9 | Cost Explorer, Pricing, Budgets, forecasts |
| Ops | knowledge, core-mcp, steampipe-query | 9 | AWS docs, CLI execution, Steampipe SQL |
| **Total** | **19 Targets** | **125** | |

## Testing

```bash
# Run project structure tests
bash tests/run-all.sh

# Lint check
npx next lint

# Type check
npx tsc --noEmit

# Production build verification
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch

   ```bash
   git checkout -b feat/my-feature
   ```

3. Commit changes using Conventional Commits

   ```bash
   git commit -m "feat: add new dashboard widget"
   git commit -m "fix: resolve pg pool connection leak"
   ```

4. Push to the branch

   ```bash
   git push origin feat/my-feature
   ```

5. Open a Pull Request

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Contact

- **Maintainer**: WooHyung Choi ([@whchoi98](https://github.com/whchoi98))
- **Issues**: [GitHub Issues](https://github.com/whchoi98/awsops/issues)
- **Email**: whchoi98@gmail.com

---

# 한국어

## 개요

AWSops는 실시간 AWS/Kubernetes 리소스 모니터링, 네트워크 트러블슈팅, CIS 컴플라이언스 스캔, AI 기반 분석을 단일 인터페이스에서 제공하는 운영 대시보드입니다. Steampipe의 내장 PostgreSQL을 통해 380+ AWS 테이블과 60+ K8s 테이블을 SQL로 통합 쿼리하며, AI 질문은 125개 MCP 도구가 탑재된 전문화된 AgentCore Gateway로 라우팅됩니다.

**현황**: 36 페이지 / 50 라우트 / 25 SQL 쿼리 파일 / 13 API 라우트 / 125 MCP 도구 (8 Gateway) / 17 컴포넌트

![AWSops Architecture](images/awsops_arch_01.png)

### 스크린샷

| 대시보드 | AI 어시스턴트 | EC2 |
|:--------:|:------------:|:---:|
| ![Dashboard](images/01.dashboard.png) | ![AI](images/02.AI_Assitant.png) | ![EC2](images/03.ec2.png) |

| EKS 개요 | 비용 분석 |
|:---------:|:---------:|
| ![EKS](images/04.eks.png) | ![Cost](images/05.cost.png) |

## 주요 기능

- **실시간 리소스 모니터링** -- Steampipe SQL로 380+ AWS 테이블과 60+ K8s 테이블을 쿼리하며, 5분 캐시와 백그라운드 프리워밍을 지원합니다
- **AI 기반 분석** -- 10단계 의도 분류로 8개 전문 AgentCore Gateway(125 MCP 도구)에 질문을 라우팅하며, 멀티 라우트 병렬 실행과 SSE 스트리밍을 지원합니다
- **CIS 컴플라이언스 스캔** -- Powerpipe를 통한 CIS v1.5~v4.0 벤치마크, 431개 컨트롤을 지원합니다
- **멀티 어카운트 지원** -- Steampipe Aggregator 패턴으로 계정별 search_path 스코핑을 제공하며, 계정 추가 시 코드 수정이 필요 없습니다
- **네트워크 토폴로지 및 트러블슈팅** -- React Flow 기반 인프라/K8s 맵, VPC Reachability Analyzer, Flow Log 분석을 제공합니다
- **컨테이너 비용 분석** -- Container Insights 기반 ECS Fargate 비용 추정, OpenCost 기반 EKS Pod 레벨 비용(CPU/메모리/네트워크/스토리지/GPU)을 분석합니다

## 사전 요구 사항

- 관리자 권한이 있는 AWS 계정
- EC2 인스턴스 (Amazon Linux 2023, t4g.2xlarge 이상)
- AWS CLI v2 (자격 증명 설정 완료)
- kubectl + kubeconfig (Kubernetes 기능용)
- Node.js 18+ (설치 스크립트에서 자동 설치)

## 설치 방법

```bash
# Step 0: CDK 인프라 배포 (로컬 머신에서 실행)
export VSCODE_PASSWORD='YourPassword'
bash scripts/00-deploy-infra.sh
# -> cdk bootstrap + cdk deploy AwsopsStack
# -> VPC, EC2, ALB, CloudFront, SSM Endpoints

# SSM으로 EC2 접속
aws ssm start-session --target <instance-id>

# Steps 1-3: 대시보드 설치 (EC2 내부)
cd /home/ec2-user/awsops
bash scripts/install-all.sh   # 01 -> 02 -> 03 -> 10 자동 실행

# Step 4: EKS 접근 설정 (선택사항)
bash scripts/04-setup-eks-access.sh

# Step 5: Cognito 인증 설정
bash scripts/05-setup-cognito.sh

# Step 6: AgentCore AI (일괄 또는 개별 실행)
bash scripts/06-setup-agentcore.sh   # 6a -> 6b -> 6c -> 6d -> 6e 일괄

# Step 7: Lambda@Edge -> CloudFront 연동
bash scripts/07-setup-cloudfront-auth.sh

# Step 11: 멀티 어카운트 설정 (선택사항)
bash scripts/11-setup-multi-account.sh
```

## 사용법

```bash
# 모든 서비스 시작
bash scripts/08-start-all.sh    # 시작 + 상태 + URL 출력

# 모든 서비스 중지
bash scripts/09-stop-all.sh

# 상태 확인
bash scripts/10-verify.sh

# 프로덕션 빌드 및 실행
npm run build && npm run start
# https://<cloudfront-domain>/awsops/ 에서 접속
```

### AI 어시스턴트 라우팅

AI 분류기가 사용자 질문을 분석하여 1~3개의 최적 게이트웨이로 병렬 라우팅한 후 결과를 통합합니다.

```
사용자 질문
    |-- "코드 실행", "계산"             --> Code Interpreter (Python 샌드박스)
    |-- VPC, TGW, VPN, ENI             --> Network Gateway (17 도구)
    |-- EKS, ECS, Istio               --> Container Gateway (24 도구)
    |-- CDK, Terraform, CFn           --> IaC Gateway (12 도구)
    |-- DynamoDB, RDS, Cache, Kafka   --> Data Gateway (24 도구)
    |-- IAM, SG, 컴플라이언스          --> Security Gateway (14 도구)
    |-- CloudWatch, 알람, 로그         --> Monitoring Gateway (16 도구)
    |-- 비용, 예산, 절감               --> Cost Gateway (9 도구)
    |-- EC2, S3, Lambda 목록           --> Steampipe SQL + Bedrock 분석
    |-- 일반 질문                      --> Ops Gateway (9 도구) + Bedrock 폴백
```

## 환경 설정

설정은 `data/config.json`으로 관리합니다. 계정 추가 시 코드 수정이 필요 없습니다.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `costEnabled` | Cost Explorer 쿼리 활성화 | `true` |
| `agentRuntimeArn` | AgentCore Runtime ARN | (설치 스크립트에서 설정) |
| `codeInterpreterName` | Code Interpreter 이름 | (설치 스크립트에서 설정) |
| `memoryId` | 대화 이력 Memory Store ID | (설치 스크립트에서 설정) |
| `accounts[]` | AWS 계정 설정 배열 | (설치 스크립트에서 설정) |
| `customerLogo` | `public/logos/` 내 고객 로고 파일명 | `default.png` |
| `adminEmails` | /accounts 페이지 접근 허용 이메일 | `[]` |

환경 변수 (`.env.local`):

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `STEAMPIPE_PASSWORD` | Steampipe 데이터베이스 비밀번호 | `steampipe` |
| `AWS_REGION` | AWS 리전 | `ap-northeast-2` |
| `NODE_ENV` | Node.js 환경 | `production` |

## 프로젝트 구조

```
awsops/
├── src/
│   ├── app/                        # 36개 페이지 + 13개 API 라우트
│   │   ├── page.tsx                # 대시보드 홈 (20 StatsCards)
│   │   ├── ai/                     # AI 어시스턴트 (SSE 스트리밍, 멀티 라우트)
│   │   ├── agentcore/              # AgentCore 대시보드 (Runtime/Gateway 상태)
│   │   ├── bedrock/                # Bedrock 모델 사용량 모니터링
│   │   ├── accounts/               # 멀티 어카운트 관리 (관리자 전용)
│   │   ├── ec2/, lambda/, ecs/     # 컴퓨팅 리소스
│   │   ├── k8s/                    # EKS (개요, Pod, 노드, 디플로이먼트, 탐색기)
│   │   ├── vpc/, topology/         # 네트워크 + 토폴로지 맵 (React Flow)
│   │   ├── s3/, rds/, dynamodb/    # 스토리지 및 데이터베이스
│   │   ├── ebs/, msk/, opensearch/ # EBS, MSK Kafka, OpenSearch
│   │   ├── monitoring/, cost/      # CloudWatch 메트릭, Cost Explorer
│   │   ├── iam/, security/         # IAM, 보안 취약점
│   │   ├── compliance/             # CIS v1.5~v4.0 벤치마크
│   │   └── api/                    # 13개 API 라우트
│   ├── lib/
│   │   ├── steampipe.ts            # pg Pool + 배치 쿼리 + 캐시 + 좀비 연결 정리
│   │   ├── queries/                # 25개 SQL 쿼리 파일
│   │   ├── app-config.ts           # 앱 설정 (data/config.json)
│   │   ├── cache-warmer.ts         # 백그라운드 캐시 프리워밍 (4분 주기)
│   │   ├── agentcore-stats.ts      # AI 호출 통계 + 토큰 추적
│   │   └── agentcore-memory.ts     # 대화 이력 영구 저장
│   └── components/                 # 17개 공유 컴포넌트
├── agent/
│   ├── agent.py                    # Strands 에이전트 (동적 게이트웨이 선택)
│   ├── Dockerfile                  # Python 3.11-slim, arm64
│   └── lambda/                     # 19개 Lambda 소스 파일
├── infra-cdk/
│   └── lib/
│       ├── awsops-stack.ts         # VPC, EC2, ALB, CloudFront
│       └── cognito-stack.ts        # Cognito User Pool, Lambda@Edge
├── scripts/                        # 22개 배포 스크립트 (Step 0-11)
├── docs/
│   ├── architecture.md             # 아키텍처 문서
│   ├── decisions/                  # 8개 아키텍처 결정 기록 (ADR)
│   └── runbooks/                   # 운영 런북
└── data/config.json                # 런타임 설정 (계정, 기능, ARN)
```

## 데이터 흐름

![AWSops Flow](images/flow.png)

```
브라우저 --> Next.js :3000 --> Steampipe (내장 PG) :9193
 36 페이지    POST /awsops/     |- aws (380+ 테이블) -> AWS API
 차트         api/steampipe     |- k8s (60+ 테이블)  -> K8s API
 테이블       batchQuery()      |- trivy              -> CVE DB
              5분 TTL 캐시
```

| 경로 | 데이터 소스 | 응답 시간 |
|------|-------------|-----------|
| 대시보드 페이지 | Steampipe pg Pool -> AWS API | ~2초 (캐시 시 즉시) |
| AI (AWS 리소스) | Steampipe + Bedrock Sonnet 4.6 | ~5초 |
| AI (네트워크 분석) | AgentCore -> Gateway MCP -> Lambda | ~30-60초 |
| AI (코드 실행) | Bedrock + Code Interpreter | ~10초 |
| CIS 컴플라이언스 | Powerpipe -> Steampipe -> AWS API | ~3-5분 |
| 토폴로지 그래프 | Steampipe -> React Flow | ~2초 |

## 기술 스택

| 계층 | 기술 |
|------|------|
| 프론트엔드 | Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts, React Flow |
| 백엔드 | Node.js 20, pg (PostgreSQL 클라이언트), node-cache |
| 데이터 | Steampipe (내장 PostgreSQL, 380+ AWS 테이블, 60+ K8s 테이블), Powerpipe |
| AI | Amazon Bedrock (Claude Sonnet/Opus 4.6), AgentCore Runtime (Strands), 8 Gateway (MCP), Code Interpreter |
| 인증 | Amazon Cognito (User Pool + Hosted UI), Lambda@Edge (Python 3.12) |
| IaC | CDK TypeScript (AwsopsStack, CognitoStack) |
| 컨테이너 | Docker (arm64), ECR |
| 서버리스 | 19 Lambda 함수 (Python 3.12, boto3) |

## 8 AgentCore Gateway (125 MCP 도구)

| Gateway | Lambda 타겟 | 도구 | 주요 기능 |
|---------|------------|------|----------|
| Network | network-mcp, reachability, flowmonitor | 17 | VPC, TGW, VPN, ENI, Reachability Analyzer, Flow Logs |
| Container | eks-mcp, ecs-mcp, istio-mcp | 24 | EKS 클러스터/노드/Pod, ECS 서비스/태스크, Istio mesh |
| IaC | iac-mcp, terraform-mcp | 12 | CloudFormation 검증, CDK 문서, Terraform 모듈 |
| Data | dynamodb-mcp, rds-mcp, valkey-mcp, msk-mcp | 24 | DynamoDB 쿼리, RDS Data API, ElastiCache, MSK Kafka |
| Security | iam-mcp | 14 | IAM 사용자/역할/정책, 정책 시뮬레이션 |
| Monitoring | cloudwatch-mcp, cloudtrail-mcp | 16 | 메트릭, 알람, Log Insights, CloudTrail 이벤트 |
| Cost | cost-mcp | 9 | Cost Explorer, Pricing, Budgets, 비용 예측 |
| Ops | knowledge, core-mcp, steampipe-query | 9 | AWS 문서, CLI 실행, Steampipe SQL |
| **합계** | **19 타겟** | **125** | |

## 테스트

```bash
# 프로젝트 구조 테스트 실행
bash tests/run-all.sh

# Lint 검사
npx next lint

# 타입 검사
npx tsc --noEmit

# 프로덕션 빌드 검증
npm run build
```

## 기여 방법

1. 저장소를 Fork합니다
2. 기능 브랜치를 생성합니다

   ```bash
   git checkout -b feat/my-feature
   ```

3. Conventional Commits 형식으로 커밋합니다

   ```bash
   git commit -m "feat: 새로운 대시보드 위젯 추가"
   git commit -m "fix: pg pool 연결 누수 해결"
   ```

4. 브랜치에 Push합니다

   ```bash
   git push origin feat/my-feature
   ```

5. Pull Request를 생성합니다

## 라이선스

이 프로젝트는 Apache License 2.0으로 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조합니다.

## 연락처

- **메인테이너**: 최우형 ([@whchoi98](https://github.com/whchoi98))
- **이슈**: [GitHub Issues](https://github.com/whchoi98/awsops/issues)
- **이메일**: whchoi98@gmail.com
