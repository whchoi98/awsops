---
sidebar_position: 5
title: Resource Inventory
description: AWS 리소스 수량 추이를 추적하고 비용 영향을 추정합니다.
---

import Screenshot from '@site/src/components/Screenshot';

# Resource Inventory

AWS 리소스의 수량 변화를 일별로 추적하고 비용 영향을 추정하는 페이지입니다.

<Screenshot src="/screenshots/monitoring/inventory.png" alt="Inventory" />

## 주요 기능

### 요약 통계
- **Resource Types**: 추적 중인 리소스 유형 수
- **Total Count**: 전체 리소스 수
- **7d Net Change**: 7일간 순 변화량

### 리소스 추이 그래프
- 멀티 라인 차트로 리소스 유형별 수량 추이 시각화
- 기간 토글: 30일 / 90일
- 리소스 유형 토글로 표시할 리소스 선택

### Core Resources (기본 표시)
- EC2 Instances
- RDS Instances
- S3 Buckets
- EBS Volumes
- Lambda Functions

### Other Resources
- VPCs, Subnets, NAT Gateways
- ALBs, NLBs, Route Tables
- IAM Users, IAM Roles
- ECS Tasks, ECS Services
- DynamoDB Tables
- EKS Nodes, K8s Pods, K8s Deployments
- ElastiCache Clusters
- CloudFront Distributions
- WAF Web ACLs
- ECR Repositories
- Public S3 Buckets, Open Security Groups, Unencrypted EBS

### 리소스 테이블
| 컬럼 | 설명 |
|------|------|
| Resource | 리소스 유형 |
| Current | 현재 수량 |
| 7d Ago | 7일 전 수량 |
| 30d Ago | 30일 전 수량 |
| 7d Change | 7일간 변화량 및 변화율 |
| 30d Change | 30일간 변화량 및 변화율 |

### 비용 영향 추정
리소스 수량 변화에 따른 월간 비용 영향을 추정합니다:
- RDS Instances: $200/월 (추정)
- ElastiCache Clusters: $150/월
- EKS Nodes: $100/월
- NAT Gateways: $45/월
- EC2 Instances: $80/월
- 기타 리소스별 가중치 적용

## 사용 방법

1. **추이 확인**: 그래프에서 리소스 수량 변화 패턴 확인
2. **기간 변경**: 30d/90d 토글로 분석 기간 조정
3. **리소스 선택**: 토글 버튼으로 관심 리소스만 표시
4. **테이블 분석**: 상세 수치 및 변화율 확인
5. **비용 영향**: 하단의 비용 추정 섹션 확인

:::tip 스냅샷 기반 데이터
Resource Inventory는 대시보드 로드 시 자동으로 스냅샷을 저장합니다. 추가 API 쿼리 없이 히스토리 데이터를 축적하므로 성능 영향이 없습니다.
:::

## 사용 팁

### 리소스 증가 추적
7d Change 또는 30d Change 컬럼에서 주황색(증가)으로 표시되는 리소스를 확인하세요. 예상치 못한 증가는 비용 급증의 원인일 수 있습니다.

### 보안 리소스 모니터링
다음 리소스의 변화에 주의하세요:
- **Public S3 Buckets**: 증가 시 데이터 노출 위험
- **Open Security Groups**: 증가 시 보안 취약점
- **Unencrypted EBS**: 컴플라이언스 이슈

### 비용 영향 해석
Cost Impact Estimation 섹션에서:
- 양수(+): 예상 비용 증가
- 음수(-): 예상 비용 감소

실제 비용은 인스턴스 유형, 사용량 등에 따라 다를 수 있습니다.

:::info 데이터 보관
스냅샷 데이터는 `data/inventory/` 디렉토리에 저장됩니다. 90일 이상 된 데이터는 분석에서 제외되지만 파일은 유지됩니다.
:::

## AI 분석 팁

AI 어시스턴트를 활용한 질문 예시:

- "지난 30일간 가장 많이 증가한 리소스 분석해줘"
- "이 리소스 증가 추세가 계속되면 월 비용이 얼마나 될까?"
- "보안 관련 리소스 변화 요약해줘"
- "리소스 정리가 필요한 항목 추천해줘"

## 관련 페이지

- [Cost Explorer](../monitoring/cost) - 실제 비용 분석
- [Security Overview](../security) - 보안 리소스 상세
- [Monitoring Overview](../monitoring) - 성능 모니터링
