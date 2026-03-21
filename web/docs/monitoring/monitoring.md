---
sidebar_position: 1
title: Monitoring Overview
description: EC2, RDS, EBS, K8s 리소스의 CPU, 메모리, 네트워크, Disk I/O 메트릭을 실시간으로 모니터링합니다.
---

import Screenshot from '@site/src/components/Screenshot';

# Monitoring Overview

AWS 인프라 전반의 성능 메트릭을 한 화면에서 종합적으로 모니터링할 수 있는 페이지입니다.

<Screenshot src="/screenshots/monitoring/monitoring.png" alt="Monitoring" />

## 주요 기능

### 종합 대시보드
- **EC2 CPU**: 인스턴스별 평균/최대 CPU 사용률
- **Network I/O**: 인스턴스별 네트워크 In/Out 트래픽 (MB/h)
- **K8s Memory**: 노드별 메모리 용량, 할당량, Pod 수
- **EBS IOPS**: 볼륨별 Read/Write IOPS
- **RDS**: 데이터베이스 CPU, 커넥션, FreeableMemory

### 탭별 상세 보기
| 탭 | 내용 |
|---|------|
| EC2 CPU | 인스턴스별 CPU 사용률 테이블, 클릭 시 시계열 차트 |
| Network | Network In/Out 트래픽, 24시간 추이 그래프 |
| Memory | K8s 노드 리소스 + RDS FreeableMemory |
| EBS IOPS | 볼륨별 Read IOPS, 시간별 추이 |
| RDS | CPU, 커넥션 수, 일별 추이 |

### 인스턴스 상세 메트릭
EC2 인스턴스 행을 클릭하면 상세 메트릭 뷰로 이동합니다:
- CPUUtilization, NetworkIn/Out, DiskReadOps, DiskWriteOps
- 기간 필터: 1h, 6h, 24h, 7d, 30d
- 메트릭별 평균/최대값 표시

## 사용 방법

1. **탭 선택**: 모니터링할 리소스 유형 선택 (EC2 CPU, Network, Memory, EBS, RDS)
2. **테이블 정렬**: 컬럼 헤더 클릭으로 정렬
3. **상세 보기**: 행 클릭 시 슬라이드 패널 또는 상세 뷰 표시
4. **새로고침**: 우측 상단 새로고침 버튼으로 최신 데이터 조회

:::tip 성능 임계값 색상
- **초록**: 정상 (CPU < 50%)
- **주황**: 주의 (CPU 50-80%)
- **빨강**: 경고 (CPU > 80%)
:::

## 사용 팁

### 고CPU 인스턴스 식별
상단 StatsCard의 "High CPU (>80%)" 카드에서 즉시 확인할 수 있습니다. 숫자를 클릭하면 해당 인스턴스로 필터링됩니다.

### K8s 메모리 예약률 확인
Memory 탭에서 K8s 노드의 Reserved % 컬럼을 확인하세요. 시스템 예약 메모리가 과도하게 높으면 Pod 스케줄링에 영향을 줄 수 있습니다.

### RDS 메모리 모니터링
RDS 행 클릭 시 FreeableMemory 그래프를 확인할 수 있습니다. 지속적으로 낮은 값은 인스턴스 크기 증설이 필요할 수 있습니다.

:::info CloudWatch 상세 모니터링
EC2 상세 메트릭은 CloudWatch 상세 모니터링이 활성화된 인스턴스에서만 1분 단위 데이터를 제공합니다. 기본 모니터링은 5분 단위입니다.
:::

## AI 분석 팁

AI 어시스턴트에서 Monitoring Gateway (17개 도구)를 활용하면 더 심층적인 분석이 가능합니다:

- "EC2 CPU 사용률이 높은 인스턴스 원인 분석해줘"
- "지난 7일간 네트워크 트래픽 패턴 분석해줘"
- "RDS 커넥션 수 급증 원인 찾아줘"
- "K8s 노드 메모리 부족 예상 시점 알려줘"

## 관련 페이지

- [CloudWatch](./monitoring/cloudwatch) - 알람 관리
- [Cost Explorer](./monitoring/cost) - 비용 분석
- [Resource Inventory](./monitoring/inventory) - 리소스 수량 추이
