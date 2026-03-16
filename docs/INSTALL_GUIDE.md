# AWSops 대시보드 - 설치 가이드 / AWSops Dashboard - Installation Guide

## 아키텍처 개요 / Architecture Overview

```
Browser → CloudFront (Cognito Auth) → ALB → EC2 (Next.js:3000)
                                                │
                                                ├─ Steampipe (PostgreSQL:9193)
                                                │   ├─ AWS Plugin
                                                │   ├─ Kubernetes Plugin
                                                │   └─ Trivy Plugin (CVE)
                                                │
                                                ├─ Powerpipe (CIS Benchmark)
                                                │
                                                └─ Bedrock AI (us-east-1)
                                                    └─ AgentCore Runtime (Strands)
                                                        └─ AgentCore Gateway (MCP)
                                                            ├─ Lambda: Reachability Analyzer
                                                            ├─ Lambda: Flow Monitor
                                                            ├─ Lambda: Network MCP
                                                            └─ Lambda: Steampipe Query
```

## 대시보드 페이지 (30개) / Dashboard Pages (30 pages)

| 카테고리 / Category | 페이지 / Page | 경로 / Path | 기능 / Features |
|----------|------|------|----------|
| **Overview** | Dashboard | `/awsops` | 20개 StatsCards, 차트, 경고 (20 StatsCards, Charts, Warnings) |
| | AI Assistant | `/awsops/ai` | Claude Sonnet/Opus 4.6, SSE 스트리밍, 멀티 라우트 (SSE streaming, multi-route) |
| | AgentCore | `/awsops/agentcore` | 런타임 상태, 8 Gateway, 125 도구 (Runtime status, 8 Gateways, 125 tools) |
| **Compute** | EC2 | `/awsops/ec2` | 인스턴스 + 상세 패널 (Instances + detail panel) |
| | Lambda | `/awsops/lambda` | 함수, 런타임, 메모리/타임아웃 (Functions, runtimes, memory/timeout) |
| | ECS | `/awsops/ecs` | 클러스터, 서비스, 태스크 (Clusters, services, tasks) |
| | ECR | `/awsops/ecr` | 리포지토리, 이미지, 스캔 (Repositories, images, scan) |
| | EKS Overview | `/awsops/k8s` | 클러스터, 노드, Pod 요약 (Clusters, nodes, pod summary) |
| | EKS Pods/Nodes/Deploy/Svc | `/awsops/k8s/*` | Pod, 노드, Deployment, Service 목록 (4 sub-pages) |
| | EKS Explorer | `/awsops/k8s/explorer` | K9s 스타일 터미널 UI (K9s-style terminal UI) |
| **Network & CDN** | VPC / Network | `/awsops/vpc` | VPC, Subnet, SG, TGW, ELB, NAT, IGW + 리소스 맵 (Resource Map) |
| | CloudFront | `/awsops/cloudfront-cdn` | 배포, Origins, Aliases (Distributions) |
| | WAF | `/awsops/waf` | Web ACL, 규칙, IP Sets (Rules, IP Sets) |
| | Topology | `/awsops/topology` | 인프라 맵 + K8s 맵 (React Flow) |
| **Storage & DB** | EBS | `/awsops/ebs` | 볼륨, 스냅샷, 암호화, EC2 어태치먼트 매핑 (Volumes, Snapshots, encryption, attachment mapping) |
| | S3 | `/awsops/s3` | 버킷 TreeMap, 검색, IAM 분석 (TreeMap, search, IAM) |
| | RDS | `/awsops/rds` | 인스턴스, SG 체이닝, 메트릭 (SG chaining, metrics) |
| | DynamoDB | `/awsops/dynamodb` | 테이블 (Tables) |
| | ElastiCache | `/awsops/elasticache` | 클러스터, SG, 메트릭 (Clusters, SG, metrics) |
| | OpenSearch | `/awsops/opensearch` | 도메인, 암호화, VPC, 클러스터 구성 (Domains, encryption, VPC, cluster config) |
| | MSK | `/awsops/msk` | Kafka 클러스터, 브로커 노드, CPU/메모리/네트워크 메트릭 (Clusters, broker nodes, metrics) |
| **Monitoring** | Monitoring | `/awsops/monitoring` | CPU, 메모리, 네트워크, Disk I/O (날짜 범위) |
| | CloudWatch | `/awsops/cloudwatch` | 알람 (Alarms) |
| | CloudTrail | `/awsops/cloudtrail` | 트레일, 이벤트 (Trails, events) |
| | Cost | `/awsops/cost` | 비용 분석, MSP 자동 감지, 스냅샷 폴백 (Cost analysis, MSP auto-detect, snapshot fallback) |
| | Resource Inventory | `/awsops/inventory` | 리소스 수량 추이, 비용 영향 추정 (Resource count trends, cost impact estimation) |
| **Security** | IAM | `/awsops/iam` | 사용자, 역할, 트러스트 정책 (Users, roles, trust policies) |
| | Security | `/awsops/security` | Public S3, Open SG, Unencrypted EBS, CVE |
| | CIS Compliance | `/awsops/compliance` | CIS v1.5~v4.0 벤치마크 (431 controls) |

## 사전 요구 사항 / Prerequisites

- 관리자 권한의 AWS 계정 (AWS Account with admin access)
- EC2 인스턴스 (Amazon Linux 2023, t3.medium+) (EC2 Instance)
- Node.js 20+
- Docker
- AWS CLI v2
- kubectl + kubeconfig (K8s 기능에 필요) (for K8s features)
- AWS 자격 증명 설정 완료 (AWS credentials configured)

---

## 설치 단계 / Installation Steps

### 빠른 설치 (일괄 실행) / Quick Install (All-in-One)

```bash
# 다운로드 후 실행 (Download and run)
curl -sL https://raw.githubusercontent.com/your-repo/awsops/main/scripts/install.sh | bash
```

### 또는 아래의 단계별 가이드를 따르세요. / Or follow the step-by-step guide below.

---

## 멀티 어카운트 추가 / Multi-Account Setup

### 사전 조건 / Prerequisites
- Host EC2 역할에 `sts:AssumeRole` 권한 (CDK 배포 시 자동 포함)
- `01-install-base.sh`가 Steampipe aggregator 구조로 aws.spc 자동 생성
- `02-setup-nextjs.sh`가 Host 어카운트를 config.json accounts[]에 자동 초기화

### 어카운트 추가 / Add Account
1. **Target 어카운트에서 CFN 배포**:
   ```bash
   aws cloudformation deploy \
     --template-file infra-cdk/cfn-target-account-role.yaml \
     --stack-name awsops-target-role \
     --parameter-overrides HostAccountId=<HOST_ACCOUNT_ID> \
     --capabilities CAPABILITY_NAMED_IAM
   ```
2. **AWSops Dashboard > Accounts 페이지 > Add Account**: Account ID, Alias, Role ARN 입력 → Test → Add
3. **빌드**: `npm run build` → 서비스 재시작
