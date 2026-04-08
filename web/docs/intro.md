---
sidebar_position: 1
title: AWSops 소개
description: AWS + Kubernetes 운영 대시보드 개요 및 주요 기능
---

import Screenshot from '@site/src/components/Screenshot';

# AWSops 소개

AWSops는 AWS 및 Kubernetes 인프라를 실시간으로 모니터링하고 관리할 수 있는 통합 운영 대시보드입니다. Steampipe, Next.js 14, Amazon Bedrock AgentCore를 기반으로 구축되어 강력한 데이터 조회와 AI 기반 분석 기능을 제공합니다.

<Screenshot src="/screenshots/overview/dashboard.png" alt="대시보드" />

## 주요 기능

### 실시간 리소스 모니터링
- **37개 페이지**를 통해 AWS 및 Kubernetes 리소스 현황을 한눈에 파악
- EC2, Lambda, ECS, EKS, S3, RDS, VPC 등 주요 서비스 대시보드
- 실시간 CloudWatch 메트릭 연동

### AI 기반 분석
- **Amazon Bedrock AgentCore** 기반 AI 어시스턴트
- 자연어로 인프라 질문 및 분석 요청
- 8개 전문 Gateway와 125개 MCP 도구 활용
- Claude Sonnet/Opus 4.6 모델 지원

### 네트워크 문제 해결
- VPC Flow Logs 분석
- Reachability Analyzer 연동
- Transit Gateway 라우팅 진단
- 네트워크 토폴로지 시각화

### 보안 및 컴플라이언스
- CIS Benchmark v1.5 ~ v4.0 지원 (431개 컨트롤)
- IAM 사용자/역할/정책 분석
- 보안 이슈 자동 탐지 (Public S3, Open SG, 미암호화 EBS)

### 비용 관리
- Cost Explorer 연동
- 서비스별/리전별 비용 분석
- ECS/EKS 컨테이너 워크로드별 비용 추적

## 아키텍처

<div style={{background: 'white', padding: '16px', borderRadius: '8px', marginBottom: '1rem'}}>

![시스템 아키텍처](/img/architecture.png)

</div>

### 인프라 구성

| 컴포넌트 | 구성 | 설명 |
|----------|------|------|
| **CloudFront** | CACHING_DISABLED | Custom Header 검증으로 ALB 직접 접근 차단 |
| **Lambda@Edge** | us-east-1, Node.js 20 | JWT 검증, OAuth2 콜백, 쿠키 관리 |
| **Cognito** | User Pool + Hosted UI | 이메일/사용자명 로그인, HttpOnly 쿠키 인증 |
| **ALB** | Internet-facing | Port 80 (VSCode) / 3000 (Dashboard) |
| **EC2** | t4g.2xlarge (ARM64 Graviton) | 100GB GP3 EBS, Private Subnet |
| **VPC** | 10.10.0.0/16, 2 AZ | NAT Gateway, Public + Private Subnet |

### Next.js 14 애플리케이션

| 항목 | 수치 |
|------|------|
| **App Router** | 8개 |
| **Pages** | 37개 |
| **API Routes** | 13개 |
| **SSE Streaming** | AI 응답 실시간 스트리밍 |

### 데이터 레이어

| 컴포넌트 | 설명 |
|----------|------|
| **Steampipe** | 내장 PostgreSQL (port 9193) |
| **AWS Plugin** | 380+ 테이블 (EC2, Lambda, S3, RDS, VPC, IAM 등) |
| **K8s Plugin** | 60+ 테이블 (Pods, Nodes, Deployments 등) |
| **AWS CLI v2** | CloudWatch per-metric-data, execFileSync |
| **kubectl** | `/kube/config`, EKS Access Entry 기반 인증 |
| **캐시** | node-cache 5분 TTL, 배치 쿼리 5 sequential |

### 데이터 디렉토리

| 경로 | 용도 |
|------|------|
| `data/config.json` | 앱 설정 (AgentCore ARN, Cost 활성화 등) |
| `data/memory/` | AI 대화 이력 (사용자별 분리) |
| `data/inventory/` | 리소스 인벤토리 스냅샷 |
| `data/cost/` | Cost 데이터 스냅샷 (폴백) |

### AI 엔진 — AgentCore

EC2에서 Docker arm64 이미지를 빌드하여 ECR에 푸시하고, AgentCore 관리형 서비스에서 실행됩니다.

| 컴포넌트 | 설명 |
|----------|------|
| **Bedrock Model** | Claude Sonnet/Opus 4.6 |
| **Runtime** | Strands Agent Framework (Docker arm64, ECR) |
| **Code Interpreter** | Python 샌드박스 (pandas, matplotlib 등) |
| **Memory** | 대화 이력 저장 (365일 보관) |

### AI 라우팅 (10단계 우선순위)

질문 유형에 따라 최적의 Gateway로 자동 라우팅됩니다:

| 우선순위 | 라우트 | 대상 |
|----------|--------|------|
| 1 | `code` | Code Interpreter — Python 코드 실행 |
| 2 | `network` | Network Gateway — VPC, TGW, VPN, Firewall |
| 3 | `container` | Container Gateway — EKS, ECS, Istio |
| 4 | `iac` | IaC Gateway — CDK, CloudFormation, Terraform |
| 5 | `data` | Data Gateway — DynamoDB, RDS, ElastiCache, MSK |
| 6 | `security` | Security Gateway — IAM, 정책 시뮬레이션 |
| 7 | `monitoring` | Monitoring Gateway — CloudWatch, CloudTrail |
| 8 | `cost` | Cost Gateway — 비용 분석, 예측, 예산 |
| 9 | `aws-data` | Steampipe SQL — 목록/현황/구성 분석 |
| 10 | `general` | Ops Gateway — AWS 문서, API 호출, 폴백 |

### 8 Gateway × 125 MCP 도구

각 Gateway는 Lambda 함수를 통해 전문 도구를 제공합니다:

| Gateway | 도구 수 | Lambda | 주요 기능 |
|---------|---------|--------|-----------|
| **Network** | 17 | Lambda × 5 | VPC, TGW, Firewall, Reachability, Flow Logs |
| **Container** | 24 | Lambda × 3 | EKS, ECS, Istio 서비스 메시 |
| **IaC** | 12 | Lambda × 2 | CDK, CloudFormation, Terraform |
| **Data** | 24 | Lambda × 4 | DynamoDB, RDS/Aurora, ElastiCache, MSK |
| **Security** | 14 | Lambda × 1 | IAM 사용자/역할/정책, Access Key |
| **Monitoring** | 16 | Lambda × 2 | CloudWatch Metrics/Logs, CloudTrail |
| **Cost** | 9 | Lambda × 1 | 비용/사용량, 예측, 예산 |
| **Ops** | 9 | Lambda × 1 | AWS 문서, API 호출, Steampipe SQL |
| **합계** | **125** | **19** | |

:::tip 멀티 라우트
복잡한 질문은 여러 Gateway를 병렬로 호출하여 종합적인 답변을 제공합니다. 예: "EKS 클러스터의 네트워크 문제를 진단해줘" → Container + Network Gateway 동시 호출.
:::

## 지원 데이터 소스

### AWS (380+ 테이블)
Steampipe AWS 플러그인을 통해 다음 서비스들의 데이터를 실시간으로 조회합니다:

| 카테고리 | 서비스 |
|---------|--------|
| Compute | EC2, Lambda, ECS, ECR, Auto Scaling |
| Network | VPC, Subnet, Security Group, Transit Gateway, VPN, CloudFront, WAF |
| Storage | S3, EBS, EFS |
| Database | RDS, DynamoDB, ElastiCache, OpenSearch, MSK |
| Security | IAM, KMS, Secrets Manager |
| Monitoring | CloudWatch, CloudTrail |
| Cost | Cost Explorer, Budgets |

### 외부 데이터소스 (7종)
외부 관측성 플랫폼을 데이터소스로 연동하여 통합 분석합니다:

| 카테고리 | 데이터소스 |
|---------|-----------|
| Metrics | Prometheus, Dynatrace, Datadog |
| Logs | Loki, ClickHouse |
| Traces | Tempo, Jaeger |

### Kubernetes (60+ 테이블)
EKS 클러스터에 연결하여 다음 리소스를 모니터링합니다:

- Pods, Nodes, Deployments, Services
- ConfigMaps, Secrets, ServiceAccounts
- Events, Metrics

## 기술 스택

| 구성요소 | 기술 |
|---------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Recharts, React Flow |
| Backend | Steampipe (내장 PostgreSQL port 9193), Node.js |
| AI Engine | Amazon Bedrock (Claude Sonnet/Opus 4.6), AgentCore Runtime (Strands) |
| AI Tools | 8 Gateway, 125 MCP 도구, 19 Lambda, Code Interpreter, Memory |
| 인증 | Amazon Cognito, Lambda@Edge (us-east-1) |
| 인프라 | AWS CDK, CloudFront, ALB, EC2 (t4g.2xlarge ARM64) |

## 다음 단계

- [로그인 가이드](./getting-started/login) - 대시보드 접속 방법
- [네비게이션 가이드](./getting-started/navigation) - 화면 구성 이해하기
- [AI 어시스턴트 빠른 시작](./getting-started/ai-assistant) - AI 기능 활용하기
- [배포 가이드](./getting-started/deployment) - 새 계정에 배포하기
- [인증 흐름](./getting-started/auth) - Cognito 인증 상세
- [AgentCore 상세](./overview/agentcore) - Gateway 및 도구 전체 목록
