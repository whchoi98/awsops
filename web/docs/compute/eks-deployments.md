---
sidebar_position: 9
title: EKS Deployments
description: Kubernetes Deployment 목록, 레플리카 상태, 업데이트 전략
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Deployments

Kubernetes Deployment의 레플리카 상태와 가용성을 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/eks-deployments.png" alt="EKS Deployments" />

## 주요 기능

### 통계 카드
- **Total Deployments**: 전체 Deployment 수 (시안)
- **Fully Available**: 원하는 레플리카가 모두 가용한 Deployment 수 (녹색)
- **Partially Available**: 일부 레플리카만 가용한 Deployment 수 (주황색)

### Replica Comparison 차트
Desired vs Available 레플리카를 시각적으로 비교:
- **시안 반투명 바**: Desired (원하는 레플리카 수)
- **녹색 바**: Available (실제 가용 레플리카 수)
- 각 Deployment별로 `available/desired` 숫자 표시

### Deployment 테이블
| 컬럼 | 설명 |
|------|------|
| Name | Deployment 이름 |
| Namespace | 네임스페이스 |
| Desired | 원하는 레플리카 수 |
| Available | 가용 레플리카 수 |
| Ready | Ready 상태 레플리카 수 |
| Created | 생성 시간 |

## 레플리카 상태 이해

| 상태 | 설명 | 조치 |
|------|------|------|
| Desired = Available = Ready | 완전 정상 | - |
| Available < Desired | 일부 Pod 미가용 | Pod 상태 확인 |
| Ready < Available | 헬스체크 실패 | 애플리케이션 로그 확인 |
| Available = 0 | 모든 Pod 비가용 | 긴급 조치 필요 |

## 사용 방법

1. 사이드바에서 **Compute > K8s > Deployments**를 클릭합니다
2. 통계 카드에서 Partially Available 수를 확인합니다
3. Replica Comparison 차트에서 문제 있는 Deployment를 식별합니다
4. 테이블에서 상세 레플리카 수를 확인합니다

## Deployment 업데이트 전략

### RollingUpdate (기본)
- 점진적으로 새 버전 Pod를 생성하고 이전 버전을 종료
- `maxSurge`: 동시에 생성할 수 있는 추가 Pod 수
- `maxUnavailable`: 동시에 비가용할 수 있는 Pod 수

### Recreate
- 모든 이전 버전 Pod를 종료 후 새 버전 생성
- 다운타임 발생, 리소스 충돌 방지 시 사용

## 사용 팁

:::tip Partially Available 진단
Available이 Desired보다 적으면:
1. Pod 상태 확인 (Pending, Failed)
2. 노드 리소스 부족 여부 확인
3. 이미지 풀 오류 확인
4. Readiness Probe 실패 확인
:::

:::tip 롤아웃 모니터링
배포 중에는 Available이 일시적으로 Desired보다 낮을 수 있습니다. 배포 완료 후에도 차이가 있으면 문제입니다.
:::

:::info AI 분석
AI Assistant에서 "Deployment 상태", "레플리카 불일치 Deployment 찾아줘", "배포 실패 원인 분석해줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Overview](../compute/eks) - 클러스터 전체 현황
- [EKS Pods](../compute/eks-pods) - Deployment의 Pod 확인
- [EKS Explorer](../compute/eks-explorer) - ReplicaSet 상세 확인
- [EKS Services](../compute/eks-services) - Deployment 연결 Service
