---
sidebar_position: 7
title: EKS Pods
description: Kubernetes Pod 목록, 상태, 컨테이너 정보
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Pods

Kubernetes Pod의 상세 목록과 상태를 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/eks-pods.png" alt="EKS Pods" />

## 주요 기능

### 통계 카드
- **Total Pods**: 전체 Pod 수 (시안)
- **Running**: 실행 중인 Pod 수 (녹색)
- **Pending**: 대기 중인 Pod 수 (주황색)
- **Failed**: 실패한 Pod 수 (빨간색)

### Pod Status Distribution 차트
Pod 상태별 분포를 파이 차트로 시각화:
- **Running**: 정상 실행 중
- **Pending**: 스케줄링 대기 또는 이미지 풀 중
- **Failed**: 실행 실패
- **Succeeded**: 완료됨 (Job 등)

### Pod 목록 테이블
| 컬럼 | 설명 |
|------|------|
| Name | Pod 이름 |
| Namespace | 네임스페이스 |
| Status | 상태 (StatusBadge) |
| Node | 실행 중인 노드 |
| Created | 생성 시간 |

### 상태별 색상
- **Running**: 녹색
- **Pending**: 주황색
- **Failed**: 빨간색
- **Succeeded**: 시안
- **Unknown**: 회색

## 사용 방법

1. 사이드바에서 **Compute > K8s > Pods**를 클릭합니다
2. 통계 카드에서 전체 Pod 상태 분포를 확인합니다
3. Pending 또는 Failed Pod가 있으면 원인을 조사합니다
4. 테이블에서 특정 Pod의 노드 배치를 확인합니다

## Pod 상태 이해

| 상태 | 설명 | 조치 |
|------|------|------|
| Pending | 스케줄링 대기, 이미지 풀링, 리소스 부족 | 노드 리소스, 이미지 접근 권한 확인 |
| Running | 정상 실행 중 | - |
| Succeeded | 완료 (Job, CronJob) | 정상 종료 |
| Failed | 컨테이너 비정상 종료 | 로그 확인, 리소스 제한 검토 |
| Unknown | 노드 통신 문제 | 노드 상태 확인 |

## 사용 팁

:::tip Pending Pod 진단
Pending 상태가 오래 지속되면 다음을 확인하세요:
- 노드 리소스 부족 (CPU/Memory)
- 이미지 풀 실패 (imagePullBackOff)
- PVC 바인딩 대기
- nodeSelector/affinity 조건 불충족
:::

:::tip Failed Pod 분석
Failed Pod는 컨테이너 로그와 이벤트를 확인하세요:
- OOMKilled: 메모리 제한 초과
- CrashLoopBackOff: 반복적인 크래시
- Error: 애플리케이션 오류
:::

:::info AI 분석
AI Assistant에서 "Pending Pod 목록", "Failed Pod 원인 분석", "특정 네임스페이스 Pod 상태" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Overview](../compute/eks) - 클러스터 전체 현황
- [EKS Nodes](../compute/eks-nodes) - 노드 리소스 확인
- [EKS Explorer](../compute/eks-explorer) - 상세 리소스 탐색
- [EKS Container Cost](../compute/eks-container-cost) - Pod 비용 분석
