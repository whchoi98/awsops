---
sidebar_position: 11
title: ECS Container Cost
description: ECS Fargate 태스크 비용 분석, CloudWatch Container Insights 메트릭
---

import Screenshot from '@site/src/components/Screenshot';

# ECS Container Cost

ECS Fargate 태스크의 비용을 분석하는 페이지입니다. Fargate 가격과 CloudWatch Container Insights 메트릭을 기반으로 비용을 계산합니다.

<Screenshot src="/screenshots/compute/ecs-container-cost.png" alt="ECS Container Cost" />

## 주요 기능

### 통계 카드
- **Daily Cost (ECS)**: 일일 총 비용 (시안)
- **Monthly Estimate**: 월간 추정 비용 (녹색)
- **Running Tasks**: 실행 중 태스크 수 - Fargate/EC2 구분 (보라색)
- **Top Cost Service**: 가장 비용이 높은 서비스 (주황색)

### Service Cost Distribution 차트
서비스별 일일 비용 분포를 파이 차트로 표시

### Cost by Service (CPU vs Memory) 차트
서비스별 CPU 비용과 Memory 비용을 스택 바 차트로 비교

### ECS Tasks 테이블
| 컬럼 | 설명 |
|------|------|
| Cluster | 클러스터 이름 |
| Service | 서비스 이름 |
| Task ID | 태스크 ID (앞 12자리) |
| Type | 실행 타입 (FARGATE/EC2) |
| CPU (units) | CPU 유닛 및 vCPU 환산값 |
| Memory (MB) | 메모리 및 GB 환산값 |
| Daily Cost | 일일 비용 (Fargate만) |
| AZ | 가용 영역 |

## 비용 계산 방식

### Fargate 가격 (ap-northeast-2)
| 리소스 | 단가 | 과금 단위 |
|--------|------|-----------|
| vCPU | $0.04048 | per vCPU-hour |
| Memory | $0.004445 | per GB-hour |
| Ephemeral Storage (>20GB) | $0.000111 | per GB-hour |

### 계산 공식
```
CPU Cost = (CPU Units / 1024) x $0.04048/hr x 24hr
Memory Cost = (Memory MB / 1024) x $0.004445/hr x 24hr
Daily Cost = CPU Cost + Memory Cost
Monthly Estimate = Daily Cost x 30
```

### 계산 예시
Fargate Task: 512 CPU units (0.5 vCPU) + 1024 MB (1 GB)
- CPU: 0.5 vCPU x $0.04048/hr x 24hr = **$0.486/day**
- Memory: 1 GB x $0.004445/hr x 24hr = **$0.107/day**
- Total: **$0.593/day ($17.78/month)**

## 사용 방법

1. 사이드바에서 **Compute > Container Cost**를 클릭합니다
2. 통계 카드에서 전체 비용 현황을 파악합니다
3. 차트에서 비용이 높은 서비스를 식별합니다
4. 테이블에서 태스크별 상세 비용을 확인합니다
5. "Cost Calculation Basis" 섹션을 펼쳐 계산 근거를 확인합니다

## 지원 범위

| 항목 | 지원 |
|------|------|
| Fargate Launch Type | O (비용 계산 지원) |
| EC2 Launch Type | X (노드 비용 분배 필요, 미지원) |
| Spot Fargate | - (On-Demand 가격 기준) |

## 사용 팁

:::tip EC2 Launch Type
EC2 타입 태스크는 "N/A (EC2)"로 표시됩니다. EC2 비용은 노드 비용 분배가 필요하여 현재 미지원입니다.
:::

:::tip 비용 최적화
CPU vs Memory 차트에서 한쪽이 크게 높으면 태스크 정의 조정을 검토하세요. Fargate는 CPU와 Memory 조합이 제한되어 있습니다.
:::

:::tip 가격 설정 변경
`data/config.json`의 `fargatePricing` 필드에서 리전별 가격을 변경할 수 있습니다.
:::

:::info AI 분석
AI Assistant에서 "ECS 비용 분석", "가장 비용 높은 서비스", "Fargate 비용 최적화 방안" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [ECS](../compute/ecs) - ECS 클러스터 및 서비스 상태
- [EKS Container Cost](../compute/eks-container-cost) - EKS Pod 비용 분석
- [Cost](../monitoring/cost) - 전체 AWS 비용 분석
