---
sidebar_position: 6
title: EKS Explorer
description: K9s 스타일 터미널 UI로 Kubernetes 리소스 탐색
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Explorer

K9s 스타일의 터미널 UI로 Kubernetes 리소스를 탐색할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/eks-explorer.png" alt="EKS Explorer" />

## 주요 기능

### 상단 바
- **K9s | Explorer**: 현재 페이지 표시
- **클러스터 선택**: 드롭다운으로 클러스터 선택
- **리소스 수**: 현재 표시된 리소스 개수
- **Auto Refresh**: 30초 자동 새로고침 토글
- **Refresh**: 수동 새로고침 버튼

### 노드 헤더 (접기/펼치기)
클릭하면 노드 목록과 리소스 사용량을 표시:
- 노드별 CPU/Memory 사용량 바
- 노드 수 표시

### 리소스 탭
10종의 Kubernetes 리소스를 탭으로 전환:

| 탭 | 리소스 | 주요 컬럼 |
|----|--------|-----------|
| Pods | Pod | NAME, NAMESPACE, STATUS, NODE, AGE |
| Deploy | Deployment | NAME, NAMESPACE, DESIRED, AVAILABLE, READY |
| SVC | Service | NAME, NAMESPACE, TYPE, CLUSTER-IP, AGE |
| RS | ReplicaSet | NAME, NAMESPACE, DESIRED, READY, AVAILABLE |
| DS | DaemonSet | NAME, NAMESPACE, DESIRED, CURRENT, READY |
| STS | StatefulSet | NAME, NAMESPACE, DESIRED, READY |
| Jobs | Job | NAME, NAMESPACE, ACTIVE, SUCCEEDED, FAILED |
| CM | ConfigMap | NAME, NAMESPACE, AGE |
| Sec | Secret | NAME, NAMESPACE, TYPE, AGE |
| PVC | PersistentVolumeClaim | NAME, NAMESPACE, STATUS, STORAGECLASS, CAPACITY |

### 필터
- **Search**: 텍스트 검색 (모든 필드)
- **Namespace**: 네임스페이스 필터
- **Status**: 상태 필터 (Running, Pending 등)
- **Node**: 노드 필터 (Pod 탭)
- **Clear**: 필터 초기화

### 페이지네이션
- 페이지당 행 수: 25, 50, 100, 200
- 페이지 이동: Prev / Next

### 상세 패널
리소스를 클릭하면 우측에 상세 패널이 열림:
- YAML 형식의 상세 정보
- 리소스 타입별 맞춤 정보 표시

### 상태 바
- 키보드 단축키 안내 (Tab, Enter, Esc, /)
- Auto-refresh 상태 표시
- 현재 리소스 타입 및 네임스페이스

## 사용 방법

1. 사이드바에서 **Compute > K8s > Explorer**를 클릭합니다
2. 상단에서 클러스터를 선택합니다
3. 탭을 클릭하여 리소스 타입을 전환합니다
4. 검색과 필터로 원하는 리소스를 찾습니다
5. 리소스를 클릭하여 상세 정보를 확인합니다

## 키보드 단축키

| 키 | 동작 |
|----|------|
| Tab | 리소스 탭 전환 |
| Enter | 선택한 리소스 상세 보기 |
| Esc | 상세 패널 닫기 |
| / | 검색창 포커스 |

## 사용 팁

:::tip 네임스페이스 필터 활용
특정 네임스페이스의 리소스만 보려면 네임스페이스 드롭다운을 사용하세요. 시스템 네임스페이스(kube-system)를 제외하고 애플리케이션 네임스페이스만 볼 수 있습니다.
:::

:::tip Auto Refresh
운영 모니터링 시 Auto 30s를 활성화하면 30초마다 자동으로 데이터가 갱신됩니다.
:::

:::info AI 분석
AI Assistant에서 "kube-system 네임스페이스 Pod 목록", "Pending 상태 Pod 찾아줘", "특정 노드의 Pod 분석해줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Overview](../compute/eks) - 클러스터 전체 현황
- [EKS Pods](../compute/eks-pods) - Pod 상세 대시보드
- [EKS Deployments](../compute/eks-deployments) - 디플로이먼트 상세
- [EKS Services](../compute/eks-services) - 서비스 상세
