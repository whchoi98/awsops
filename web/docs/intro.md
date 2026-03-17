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
- **34개 페이지**를 통해 AWS 및 Kubernetes 리소스 현황을 한눈에 파악
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

```
┌─────────────────────────────────────────────────────────────┐
│                        CloudFront                            │
│                    (Lambda@Edge 인증)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Application Load Balancer                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EC2 (Private Subnet)                      │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   Next.js 14    │───▶│  Steampipe PostgreSQL (9193)    │ │
│  │   (App Router)  │    │  380+ AWS / 60+ K8s 테이블      │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Amazon Bedrock AgentCore                        │
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │   Runtime    │  │  8 Gateways (125 MCP Tools)        │   │
│  │  (Strands)   │  │  Network, Container, Security...   │   │
│  └──────────────┘  └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

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

### Kubernetes (60+ 테이블)
EKS 클러스터에 연결하여 다음 리소스를 모니터링합니다:

- Pods, Nodes, Deployments, Services
- ConfigMaps, Secrets, ServiceAccounts
- Events, Metrics

## 기술 스택

| 구성요소 | 기술 |
|---------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Recharts, React Flow |
| Backend | Steampipe (내장 PostgreSQL), Node.js |
| AI Engine | Amazon Bedrock (Claude Sonnet/Opus 4.6), AgentCore Runtime |
| 인증 | Amazon Cognito, Lambda@Edge |
| 인프라 | AWS CDK, CloudFront, ALB, EC2 |

## 다음 단계

- [로그인 가이드](./getting-started/login) - 대시보드 접속 방법
- [네비게이션 가이드](./getting-started/navigation) - 화면 구성 이해하기
- [AI 어시스턴트 빠른 시작](./getting-started/ai-assistant) - AI 기능 활용하기
