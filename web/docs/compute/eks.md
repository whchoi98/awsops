---
sidebar_position: 5
title: EKS Overview
description: EKS 클러스터 현황, 노드 리소스, Pod 상태 요약
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Overview

EKS 클러스터의 전체 현황과 노드 리소스, Pod 상태를 한눈에 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/eks.png" alt="EKS Overview" />

## 주요 기능

### 클러스터 필터
- EKS 클러스터별 필터링
- VPC별 필터링
- 다중 선택 지원

### EKS 클러스터 카드
각 클러스터의 핵심 정보를 카드 형태로 표시:
- Cluster Name, Status (ACTIVE)
- Kubernetes Version
- VPC ID
- Platform Version
- Region

### 통계 카드
- **Nodes**: 전체 노드 수 / Ready 노드 수
- **Pods**: 전체 Pod 수 / Running Pod 수
- **Deployments**: 전체 디플로이먼트 수 / Fully Available 수
- **Services**: 전체 서비스 수

### 노드 카드 그리드
각 노드의 리소스 사용량을 시각적으로 표시:
- 노드 이름, Pod 수, 상태 (Ready/NotReady)
- **CPU 사용량 바**: Pod 요청량 / 전체 용량 (퍼센트)
- **Memory 사용량 바**: Pod 요청량 / 전체 용량 (퍼센트)
- 80% 이상: 빨간색, 50% 이상: 주황색, 그 외: 시안/보라색

### 노드 상세 뷰
노드 카드를 클릭하면 상세 페이지로 이동:
- **CPU/Memory/Pod Info 카드**: Capacity, Allocatable, Requested, Available
- **ENI 목록**: 네트워크 인터페이스별 IP 할당, 트래픽 (NetworkIn/Out)
- **Pods 테이블**: 해당 노드에서 실행 중인 Pod 목록

### 시각화 차트
- **Pod Status Distribution**: Running, Pending, Failed, Succeeded 분포
- **Namespaces**: 네임스페이스별 리소스 분포

### Warning Events 테이블
Kubernetes Warning 이벤트를 실시간으로 표시:
- Kind, Object, Reason, Message, Count, Last Seen

## 사용 방법

1. 사이드바에서 **Compute > K8s**를 클릭합니다
2. 클러스터 필터로 특정 클러스터/VPC를 선택합니다
3. 통계 카드에서 전체 현황을 파악합니다
4. 노드 카드에서 리소스 사용률이 높은 노드를 식별합니다
5. 노드를 클릭하여 상세 리소스와 Pod 목록을 확인합니다
6. Warning Events에서 문제 이벤트를 모니터링합니다

## 사용 팁

:::tip 노드 리소스 모니터링
노드 카드의 CPU/Memory 바가 빨간색(80% 이상)이면 리소스 부족 위험이 있습니다. 노드 추가 또는 Pod 재배치를 검토하세요.
:::

:::tip ENI IP 사용량
노드 상세 뷰에서 ENI별 IP Slots Used가 15/15에 가까우면 새 Pod 스케줄링이 실패할 수 있습니다.
:::

:::info AI 분석
AI Assistant에서 "EKS 클러스터 상태", "노드별 CPU 사용량", "Warning 이벤트 분석해줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Explorer](../compute/eks-explorer) - K9s 스타일 터미널 UI
- [EKS Pods](../compute/eks-pods) - Pod 상세 목록
- [EKS Nodes](../compute/eks-nodes) - 노드 상세 목록
- [EKS Container Cost](../compute/eks-container-cost) - Pod 비용 분석
