---
sidebar_position: 1
title: EC2 인스턴스
description: EC2 인스턴스 목록, 상태 모니터링, 상세 정보 확인
---

import Screenshot from '@site/src/components/Screenshot';

# EC2 인스턴스

EC2 인스턴스의 실시간 상태를 모니터링하고 상세 정보를 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/ec2.png" alt="EC2 인스턴스" />

## 주요 기능

### 통계 카드
페이지 상단에 4개의 StatsCard가 핵심 지표를 표시합니다:
- **Running**: 실행 중인 인스턴스 수 (녹색)
- **Stopped**: 중지된 인스턴스 수 (빨간색)
- **Total vCPUs**: 전체 vCPU 합계 (시안)
- **Instance Types**: 사용 중인 인스턴스 타입 종류 수 (보라색)

### 시각화 차트
- **Instance Type Distribution**: 인스턴스 타입별 분포를 파이 차트로 표시
- **Instance Status**: 상태별 인스턴스 수를 바 차트로 표시

### 인스턴스 목록 테이블
모든 EC2 인스턴스를 테이블 형태로 표시합니다:
- Instance ID, Name, Type, State, Public/Private IP, VPC, Launch Time
- 상태에 따라 색상이 다른 StatusBadge 표시 (running=녹색, stopped=빨간색)

### 필터 및 검색
- **검색창**: ID, Name, IP 등 모든 필드에서 텍스트 검색
- **State 필터**: running, stopped 등 상태별 필터링
- **Type 필터**: t3.micro, m5.large 등 인스턴스 타입별 필터링
- **VPC 필터**: VPC ID별 필터링
- **Clear all**: 모든 필터 초기화

### 상세 패널
테이블에서 인스턴스 행을 클릭하면 오른쪽에 상세 패널이 열립니다:
- **Instance 섹션**: Instance ID, AMI, Architecture, Platform, Key Pair, IAM Role 등
- **Compute 섹션**: vCPUs, Cores, Threads/Core, Memory, Network Performance
- **Network 섹션**: VPC, Subnet, AZ, Private/Public IP, DNS, Network Interfaces
- **Security Groups 섹션**: 연결된 보안 그룹 목록
- **Storage 섹션**: Root Device, Block Device Mappings
- **Tags 섹션**: 인스턴스에 설정된 태그 목록

## 사용 방법

1. 사이드바에서 **Compute > EC2**를 클릭합니다
2. 상단 통계 카드에서 전체 현황을 파악합니다
3. 필터를 사용하여 원하는 인스턴스를 찾습니다
4. 테이블에서 인스턴스를 클릭하여 상세 정보를 확인합니다
5. 새로고침 버튼으로 최신 데이터를 불러올 수 있습니다

## 사용 팁

:::tip 빠른 검색
검색창에 IP 주소 일부만 입력해도 해당 인스턴스를 빠르게 찾을 수 있습니다.
:::

:::tip 필터 조합
여러 필터를 동시에 사용하면 더 정밀하게 인스턴스를 찾을 수 있습니다. 예를 들어 "running 상태의 t3.large 인스턴스"만 볼 수 있습니다.
:::

:::info AI 분석
AI Assistant에서 "EC2 인스턴스 목록 보여줘", "running 상태 인스턴스 몇 개야?" 등의 질문으로 분석할 수 있습니다.
:::

## 관련 페이지

- [VPC](../network/vpc) - 네트워크 구성 확인
- [EBS](../storage/ebs) - 연결된 볼륨 확인
- [Monitoring](../monitoring) - CPU/메모리 메트릭 확인
