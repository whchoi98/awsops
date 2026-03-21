---
sidebar_position: 8
title: EKS Nodes
description: Kubernetes 노드 목록, 용량, 할당 리소스, 상태
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Nodes

Kubernetes 노드의 용량, 할당 가능 리소스, Pod 요청량을 상세히 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/eks-nodes.png" alt="EKS Nodes" />

## 주요 기능

### 통계 카드
- **Total Nodes**: 전체 노드 수 (시안)
- **Ready**: Ready 상태 노드 수 (녹색)
- **Total CPU**: 전체 vCPU 용량 합계 (보라색)
- **Total Memory**: 전체 메모리 용량 합계 (주황색)

### CPU Usage per Node 차트
노드별 CPU 리소스 상태를 3단계 바 차트로 표시:
- **Requested** (시안/주황/빨강): Pod가 요청한 CPU
- **Available** (녹색 반투명): 추가 할당 가능한 CPU
- **System Reserved** (회색): 시스템이 예약한 CPU

각 노드별로 표시:
- 노드 이름, Pod 요청량 / 전체 용량, 퍼센트
- Pod 수, 요청 vCPU, 가용 vCPU, 예약 vCPU

### Memory Usage per Node 차트
노드별 Memory 리소스 상태를 동일한 3단계 바 차트로 표시:
- **Requested** (보라/주황/빨강): Pod가 요청한 Memory
- **Available** (녹색 반투명): 추가 할당 가능한 Memory
- **System Reserved** (회색): 시스템이 예약한 Memory

### 용량 차트
- **CPU Capacity per Node (vCPU)**: 노드별 CPU 용량 바 차트
- **Memory Capacity per Node (GiB)**: 노드별 메모리 용량 바 차트

### 노드 테이블
| 컬럼 | 설명 |
|------|------|
| Name | 노드 이름 |
| Status | Ready / NotReady |
| CPU Capacity | 전체 CPU 용량 |
| Memory Capacity | 전체 메모리 용량 |
| Allocatable CPU | 할당 가능한 CPU |
| Allocatable Memory | 할당 가능한 메모리 |
| Created | 생성 시간 |

## 리소스 개념 이해

![노드 리소스 계층](/diagrams/eks-node-resources.png)

| 용어 | 설명 |
|------|------|
| Capacity | 노드의 전체 물리적 리소스 |
| Allocatable | Pod에 할당 가능한 리소스 (Capacity - System Reserved) |
| Requested | 현재 Pod들이 요청한 리소스 합계 |
| Available | 추가로 할당 가능한 리소스 (Allocatable - Requested) |
| System Reserved | kubelet, OS 등 시스템용 예약 리소스 |

## 사용 방법

1. 사이드바에서 **Compute > K8s > Nodes**를 클릭합니다
2. 통계 카드에서 전체 노드 현황을 파악합니다
3. CPU/Memory Usage 차트에서 리소스 사용률이 높은 노드를 식별합니다
4. 80% 이상(빨간색) 노드는 스케일링을 검토합니다
5. 테이블에서 각 노드의 상세 용량을 확인합니다

## 사용 팁

:::tip 리소스 사용률 임계값
- **80% 이상 (빨간색)**: 즉시 조치 필요 - 노드 추가 또는 Pod 재배치
- **50-80% (주황색)**: 모니터링 필요 - 증가 추세 확인
- **50% 미만 (시안/보라)**: 정상 - 여유 리소스 있음
:::

:::tip Available vs Capacity
Available이 음수가 될 수 있습니다. 이는 Pod들이 Limit 없이 Request만 설정하여 오버커밋된 상태입니다.
:::

:::info AI 분석
AI Assistant에서 "노드 리소스 사용량", "CPU 80% 이상 노드", "노드 스케일링 필요한지 분석해줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Overview](../compute/eks) - 클러스터 전체 현황
- [EKS Pods](../compute/eks-pods) - Pod 상태 확인
- [EC2](../compute/ec2) - 노드 기반 EC2 인스턴스
- [EKS Container Cost](../compute/eks-container-cost) - 노드/Pod 비용 분석
