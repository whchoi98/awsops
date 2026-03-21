---
sidebar_position: 10
title: EKS Services
description: Kubernetes Service 목록, 타입, 엔드포인트 정보
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Services

Kubernetes Service의 목록과 네트워크 설정을 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/eks-services.png" alt="EKS Services" />

## 주요 기능

### 통계 카드
- **Total Services**: 전체 Service 수 (시안)
- **ClusterIP**: ClusterIP 타입 서비스 수 (녹색)
- **NodePort**: NodePort 타입 서비스 수 (보라색)
- **LoadBalancer**: LoadBalancer 타입 서비스 수 (주황색)

### Service Type Distribution 차트
서비스 타입별 분포를 파이 차트로 시각화:
- ClusterIP, NodePort, LoadBalancer, Other (ExternalName 등)

### Service 테이블
| 컬럼 | 설명 |
|------|------|
| Name | Service 이름 |
| Namespace | 네임스페이스 |
| Type | 서비스 타입 |
| Cluster IP | 클러스터 내부 IP |
| External IP | 외부 IP (LoadBalancer 타입) |
| Created | 생성 시간 |

## Service 타입 이해

### ClusterIP (기본)
- 클러스터 내부에서만 접근 가능
- 내부 서비스 간 통신에 사용
- 예: 백엔드 API, 데이터베이스

### NodePort
- 모든 노드의 특정 포트로 외부 접근 가능
- 포트 범위: 30000-32767
- 개발/테스트 환경에서 주로 사용

### LoadBalancer
- 클라우드 로드밸런서 자동 생성 (AWS ELB/NLB)
- 외부 트래픽을 서비스로 라우팅
- 프로덕션 외부 서비스에 사용

### ExternalName
- 외부 DNS 이름을 클러스터 내부 이름으로 매핑
- CNAME 레코드 생성

## 사용 방법

1. 사이드바에서 **Compute > K8s > Services**를 클릭합니다
2. 통계 카드에서 서비스 타입 분포를 파악합니다
3. LoadBalancer 서비스의 External IP를 확인합니다
4. 테이블에서 서비스별 Cluster IP를 확인합니다

## AWS 통합

### LoadBalancer 타입 + AWS
- Service 생성 시 AWS ELB/NLB 자동 프로비저닝
- Annotation으로 설정 제어:
  - `service.beta.kubernetes.io/aws-load-balancer-type: nlb`
  - `service.beta.kubernetes.io/aws-load-balancer-internal: "true"`

### 비용 고려사항
- LoadBalancer 타입은 각각 AWS ELB 비용 발생
- 여러 서비스에 단일 ALB 사용: AWS Load Balancer Controller + Ingress

## 사용 팁

:::tip LoadBalancer External IP 확인
External IP가 `<pending>`이면:
- AWS Load Balancer 프로비저닝 중
- 서브넷 태그 누락 확인
- IAM 권한 확인
:::

:::tip ClusterIP 서비스 접근
ClusterIP 서비스는 클러스터 외부에서 직접 접근 불가합니다. 외부 접근이 필요하면 LoadBalancer 또는 Ingress를 사용하세요.
:::

:::info AI 분석
AI Assistant에서 "Service 목록", "LoadBalancer 서비스 현황", "External IP 없는 LoadBalancer 찾아줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Overview](../compute/eks) - 클러스터 전체 현황
- [EKS Deployments](../compute/eks-deployments) - Service가 연결된 Deployment
- [VPC](../network/vpc) - 네트워크 구성 및 로드밸런서
- [EKS Explorer](../compute/eks-explorer) - Ingress 상세 확인
