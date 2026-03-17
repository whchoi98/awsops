---
sidebar_position: 1
title: 대시보드
description: AWSops 메인 대시보드 상세 가이드
---

import Screenshot from '@site/src/components/Screenshot';

# 대시보드

대시보드는 AWSops의 메인 페이지로, AWS 및 Kubernetes 인프라의 전체 현황을 한눈에 파악할 수 있습니다.

<Screenshot src="/screenshots/overview/dashboard.png" alt="대시보드" />

## 화면 구성

대시보드는 다음 섹션으로 구성됩니다:

1. **Compute & Containers** - 컴퓨팅 리소스 요약
2. **Network & Storage** - 네트워크 및 스토리지 요약
3. **Security, Monitoring & Cost** - 보안, 모니터링, 비용 요약
4. **Active Warnings** - 실시간 경고
5. **Charts** - 리소스 분포 및 상태 차트

## StatsCard

### Compute & Containers (6개)

| 카드 | 표시 정보 | 상세 |
|------|----------|------|
| **EC2** | 총 인스턴스 수 | running / stopped 수 |
| **Lambda** | 총 함수 수 | 런타임 수, long timeout 함수 수 |
| **AgentCore** | 8 GW | 125 tools, 19 Lambda, Multi-route |
| **ECR** | 총 리포지토리 수 | scan 활성화, immutable tags 수 |
| **EKS** | 총 노드 수 | ready 노드, pods, deployments 수 |
| **CloudFront** | 총 배포 수 | enabled, HTTP 허용 수 |

### Network & Storage (9개)

| 카드 | 표시 정보 | 상세 |
|------|----------|------|
| **VPCs** | VPC 수 | Subnets, NAT Gateway, TGW 수 |
| **WAF** | Web ACL 수 | 규칙 그룹, IP sets 수 |
| **EBS** | 볼륨 수 | 총 용량(GB), 미암호화 볼륨 수 |
| **S3 Buckets** | 버킷 수 | public/private 구분 |
| **RDS** | 인스턴스 수 | 총 스토리지(GB), Multi-AZ 수 |
| **DynamoDB** | 테이블 수 | On-demand 여부 |
| **ElastiCache** | 클러스터 수 | Redis/Memcached 구분, 노드 수 |
| **OpenSearch** | 도메인 수 | VPC 도메인, 암호화 상태 |
| **MSK** | 클러스터 수 | active 클러스터 수 |

### Security, Monitoring & Cost (6개)

| 카드 | 표시 정보 | 상세 |
|------|----------|------|
| **Security Issues** | 총 이슈 수 | Public S3, Open SG, Unencrypted EBS |
| **IAM Users** | 사용자 수 | roles, groups, no MFA 수 |
| **CW Alarms** | 알람 수 | metrics, log groups 수 |
| **CloudTrail** | 트레일 수 | active, multi-region, validated 수 |
| **CIS Compliance** | 준수율(%) | alarm, skip, error 수 |
| **Monthly Cost** | 월 비용($) | 일평균, 전월 대비 증감률 |

## 카드 클릭 네비게이션

각 StatsCard를 클릭하면 해당 서비스의 상세 페이지로 이동합니다.

| 카드 | 이동 페이지 |
|------|-----------|
| EC2 | `/ec2` |
| Lambda | `/lambda` |
| AgentCore | `/agentcore` |
| EKS | `/k8s` |
| S3 Buckets | `/s3` |
| RDS | `/rds` |
| Security Issues | `/security` |
| CIS Compliance | `/compliance` |
| Monthly Cost | `/cost` (Cost Explorer 사용 가능 시) |

:::tip Cost Explorer 미지원 환경
MSP 계정 등 Cost Explorer가 지원되지 않는 환경에서는 Monthly Cost 카드 클릭 시 `/inventory` (Resource Inventory) 페이지로 이동합니다.
:::

## Active Warnings

실시간으로 감지된 경고 사항을 표시합니다.

| 경고 유형 | 설명 | 심각도 |
|----------|------|--------|
| **Public S3 Buckets** | 퍼블릭 접근 가능한 S3 버킷 | Error (빨강) |
| **IAM users without MFA** | MFA 미설정 IAM 사용자 | Warning (주황) |
| **CloudWatch Alarms** | 활성화된 CloudWatch 알람 | Error (빨강) |
| **Open Security Groups** | 0.0.0.0/0 인바운드 보안그룹 | Warning (주황) |
| **K8s Warning events** | Kubernetes 경고 이벤트 | Warning (주황) |

경고를 클릭하면 해당 서비스의 상세 페이지로 이동합니다.

## 차트

### Resource Distribution (Bar Chart)

리소스 유형별 개수를 막대 그래프로 표시합니다.

- EC2, Lambda, S3, RDS, ECS Tasks, DynamoDB, K8s Pods

### EC2 Instance Types (Pie Chart)

EC2 인스턴스 타입별 분포를 파이 차트로 표시합니다.

- t3.micro, t3.small, m5.large 등 상위 8개 타입

### K8s Pod Status (Pie Chart)

Kubernetes Pod 상태별 분포를 파이 차트로 표시합니다.

- Running, Pending, Failed, Succeeded

### Recent K8s Events

최근 Kubernetes Warning 이벤트를 표시합니다.

- Namespace, Pod 이름, Reason, Message

## 데이터 새로고침

### 자동 로드
페이지 접속 시 자동으로 데이터를 조회합니다.

### 수동 새로고침
헤더의 새로고침 버튼 클릭 시 캐시를 무시하고 최신 데이터를 조회합니다.

### 캐시
- 데이터는 5분간 캐시됩니다
- Cost 가용성 체크 후 데이터 로드가 시작됩니다

## Cost 가용성 자동 감지

대시보드 로드 시 Cost Explorer API 가용성을 자동으로 확인합니다.

1. `/api/steampipe?action=cost-check` API 호출
2. 응답에 따라 Cost 관련 쿼리 포함/제외
3. Cost Explorer 미지원 시 "N/A" 표시

## 인벤토리 스냅샷

대시보드 데이터 조회 시 자동으로 리소스 인벤토리 스냅샷을 저장합니다.

- 저장 위치: `data/inventory/`
- 용도: Resource Inventory 페이지의 추이 분석

:::info AI 분석
대시보드에서 확인한 정보에 대해 더 자세한 분석이 필요하면 AI Assistant에서 질문해보세요.

예시:
- "Security Issues에서 Open SG가 3개 있는데, 어떤 보안그룹인지 자세히 알려줘"
- "EC2 인스턴스 중 stopped 상태가 많은데, 비용 절감을 위해 종료해도 되는지 분석해줘"
:::

## 다음 단계

- [AI 어시스턴트 상세](../overview/ai-assistant) - AI로 대시보드 데이터 분석하기
- [AgentCore 상세](../overview/agentcore) - AgentCore 아키텍처 이해하기
