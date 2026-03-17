---
sidebar_position: 12
title: EKS Container Cost
description: EKS Pod 비용 분석, OpenCost 통합, CPU/Memory/Network/Storage/GPU 5개 비용 컬럼
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Container Cost

EKS Pod의 비용을 분석하는 페이지입니다. OpenCost (기본) 또는 Request 기반 추정 (폴백)의 두 가지 데이터 소스를 지원합니다.

<Screenshot src="/screenshots/compute/eks-container-cost.png" alt="EKS Container Cost" />

## 주요 기능

### 데이터 소스 표시
페이지 상단에 현재 데이터 소스가 표시됩니다:
- **녹색**: OpenCost (Prometheus) - 실제 사용량 기반, CPU + Memory + Network + Storage + GPU
- **노란색**: Request-based estimation - CPU + Memory만 (OpenCost 설치 권장)

### 통계 카드
- **Pod Cost (Daily)**: 일일 총 Pod 비용 (시안)
- **Pod Cost (Monthly)**: 월간 추정 비용 (녹색)
- **Running Pods**: 실행 중 Pod 수 / 노드 수 (보라색)
- **Top Namespace**: 가장 비용이 높은 네임스페이스 (주황색)

### Namespace Cost Distribution 차트
네임스페이스별 일일 비용 분포를 파이 차트로 표시

### Node Daily Cost + Pod Count 차트
노드별 일일 비용과 Pod 수를 이중 축 바 차트로 표시

### Pods 탭
| 컬럼 | 설명 |
|------|------|
| Namespace | 네임스페이스 |
| Pod | Pod 이름 |
| Node | 노드 이름 |
| CPU | CPU 비용 |
| Memory | Memory 비용 |
| Network* | 네트워크 비용 (OpenCost만) |
| Storage* | 스토리지 비용 (OpenCost만) |
| GPU* | GPU 비용 (OpenCost만) |
| Total/Day | 일일 총 비용 |

*OpenCost 모드에서만 표시

### Nodes 탭
| 컬럼 | 설명 |
|------|------|
| Node | 노드 이름 |
| Instance Type | EC2 인스턴스 타입 |
| Hourly Rate | 시간당 비용 |
| Daily Cost | 일일 비용 |
| Pods | Pod 수 |

## 두 가지 비용 계산 방식

### Method A: Request-based (기본)
Pod의 리소스 요청 비율로 노드 비용을 분배:
```
CPU Ratio = Pod CPU Request / Node Allocatable CPU
Memory Ratio = Pod Memory Request / Node Allocatable Memory
Pod Daily Cost = (CPU Ratio x 0.5 + Memory Ratio x 0.5) x Node Hourly Rate x 24h
```

**지원 항목**: CPU, Memory만
**데이터 소스**: Steampipe kubernetes_pod, kubernetes_node

### Method B: OpenCost (Prometheus)
실제 사용량 메트릭과 AWS 가격 정보를 결합:
```
CPU Cost = Actual CPU Usage (cores) x AWS EC2 vCPU Price
Memory Cost = Actual Memory Usage (bytes) x AWS EC2 Memory Price
Network Cost = Cross-AZ/Region Transfer x Data Transfer Price
Storage Cost = PVC Provisioned Size x EBS Volume Price
Pod Total Cost = CPU + Memory + Network + Storage + GPU
```

**지원 항목**: CPU, Memory, Network, Storage, GPU (5개)
**데이터 소스**: Prometheus + Metrics Server

## OpenCost 설치

```bash
bash scripts/06f-setup-opencost.sh
```

설치 후 `data/config.json`에 `opencostEndpoint`를 설정하면 자동으로 OpenCost 모드로 전환됩니다.

## 사용 방법

1. 사이드바에서 **Compute > EKS Container Cost**를 클릭합니다
2. 상단 배너에서 데이터 소스를 확인합니다
3. 통계 카드에서 전체 비용 현황을 파악합니다
4. 차트에서 비용이 높은 네임스페이스/노드를 식별합니다
5. Pods/Nodes 탭을 전환하여 상세 비용을 확인합니다
6. "Cost Calculation Basis" 섹션을 펼쳐 계산 근거를 확인합니다

## EC2 가격 참조 (ap-northeast-2, On-Demand)

| Instance Type | Hourly Rate |
|---------------|-------------|
| m5.large | $0.118 |
| m5.xlarge | $0.236 |
| m6g.large | $0.100 |
| c5.xlarge | $0.196 |
| r5.large | $0.152 |
| t3.large | $0.104 |
| t4g.large | $0.086 |

## 사용 팁

:::tip OpenCost 설치 권장
Request 기반은 리소스 요청만 고려하여 실제 사용량과 차이가 있습니다. OpenCost를 설치하면 5가지 비용 항목을 정확하게 분석할 수 있습니다.
:::

:::tip Request 없는 Pod
리소스 요청이 없는 Pod는 Request 모드에서 $0.00으로 표시됩니다. Best Practice로 모든 Pod에 리소스 요청을 설정하세요.
:::

:::tip Network Cost (OpenCost)
OpenCost의 Network 비용은 Cross-AZ 전송만 포함합니다. 같은 AZ 내 전송은 무료입니다.
:::

:::info AI 분석
AI Assistant에서 "EKS Pod 비용 분석", "네임스페이스별 비용 비교", "비용 최적화 방안" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [EKS Overview](../compute/eks) - 클러스터 전체 현황
- [EKS Nodes](../compute/eks-nodes) - 노드 리소스 상태
- [ECS Container Cost](../compute/ecs-container-cost) - ECS Fargate 비용
- [Cost](../monitoring/cost) - 전체 AWS 비용 분석
