---
sidebar_position: 4
title: Topology
description: React Flow 기반 AWS 인프라 및 Kubernetes 클러스터 시각화
---

import Screenshot from '@site/src/components/Screenshot';

# Topology

AWS 인프라와 Kubernetes 클러스터의 관계를 시각적으로 탐색하는 페이지입니다.

<Screenshot src="/screenshots/network/topology.png" alt="Topology" />

## 주요 기능

### 뷰 전환

상단 토글로 두 가지 뷰를 전환합니다:

| 뷰 | 대상 | 용도 |
|----|------|------|
| **Infrastructure** | AWS 리소스 | VPC, EC2, RDS, ELB 등 관계 시각화 |
| **Kubernetes** | EKS 워크로드 | Pod, Service, Ingress, Node 관계 |

### Infrastructure 뷰

두 가지 표시 모드를 제공합니다:

**Map View (기본)**
- 5컬럼 레이아웃으로 리소스 계층 표시
- External (IGW/TGW) → VPCs → Subnets → Compute → NAT
- 클릭/검색으로 관련 리소스 하이라이트

**Graph View**
- React Flow 기반 노드-엣지 그래프
- 드래그로 노드 이동
- 줌/팬으로 탐색
- MiniMap으로 전체 구조 확인

### Kubernetes 뷰

4컬럼 리소스 맵으로 EKS 워크로드를 표시합니다:

| 컬럼 | 리소스 | 설명 |
|------|--------|------|
| **Ingress** | K8s Ingress | 외부 트래픽 진입점 |
| **Services** | K8s Service | 로드밸런싱, ClusterIP/NodePort/LoadBalancer |
| **Pods** | K8s Pod | 실행 중인 컨테이너 |
| **Nodes** | EKS Node | 워커 노드 (EC2) |

### 상호작용 기능

**검색**
- Infrastructure: EC2, Subnet, VPC 이름/ID/CIDR 검색
- Kubernetes: Pod, Service, Namespace 검색
- 매칭된 리소스와 연관 리소스 자동 하이라이트

**클릭 선택**
- 리소스 클릭으로 선택
- 선택된 리소스와 연결된 모든 리소스 하이라이트
- 다시 클릭하면 선택 해제

**Graph View 전용**
- 마우스 휠: 줌 인/아웃
- 드래그: 캔버스 이동
- 노드 드래그: 노드 위치 조정
- Controls: 줌 리셋, 화면 맞춤
- MiniMap: 전체 구조 미리보기

## 사용 방법

### 인프라 구조 파악

1. **Infrastructure** 뷰 선택
2. **Map View**로 계층 구조 확인
3. VPC → Subnet → EC2 흐름 파악
4. IGW/TGW로 외부 연결 확인

### 특정 리소스 추적

1. 검색창에 리소스 이름/ID 입력
2. 매칭된 리소스 하이라이트 확인
3. 연관된 VPC, Subnet도 함께 하이라이트
4. "Clear search" 버튼으로 초기화

### K8s 트래픽 흐름 분석

1. **Kubernetes** 뷰 선택
2. Ingress → Service → Pod → Node 흐름 확인
3. Service 클릭으로 연결된 Pod 확인
4. 검색으로 특정 워크로드 추적

### Graph View 활용

1. Infrastructure 뷰에서 **Graph View** 선택
2. React Flow 그래프 렌더링
3. 노드를 드래그하여 레이아웃 조정
4. MiniMap으로 전체 구조 확인

## 사용 팁

:::tip 네트워크 경로 추적
특정 EC2에서 외부 인터넷까지의 경로를 추적하려면:
1. 검색창에 EC2 이름 입력
2. 하이라이트된 Subnet 확인
3. Subnet이 NAT Gateway 또는 IGW에 연결되어 있는지 확인
4. Private Subnet이면 NAT, Public Subnet이면 IGW 경로
:::

:::tip K8s Service 디버깅
"Service에 Pod가 연결되지 않음" 문제 해결:
1. Kubernetes 뷰에서 Service 클릭
2. 연결된 Pod 확인 (0 pods면 문제)
3. Pod의 labels와 Service의 selector 일치 여부 확인
4. Pod가 있으면 Node까지 추적하여 리소스 상태 확인
:::

:::info 색상 범례
| 색상 | Infrastructure | Kubernetes |
|------|---------------|------------|
| Cyan | VPC, IGW | Ingress |
| Green | Subnet | Node |
| Purple | EC2 | Pod |
| Pink | ELB | - |
| Orange | RDS, NAT | Service |
| Red | TGW | - |
:::

## 관련 페이지

- [VPC](../network/vpc) - VPC 상세 정보 및 리소스 맵
- [EKS Overview](../compute/eks) - EKS 클러스터 상세
- [EC2](../compute/ec2) - EC2 인스턴스 상세 정보
