---
sidebar_position: 2
title: Lambda 함수
description: Lambda 함수 목록, 런타임 분포, 메모리/타임아웃 설정 확인
---

import Screenshot from '@site/src/components/Screenshot';

# Lambda 함수

AWS Lambda 함수의 목록과 구성 정보를 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/lambda.png" alt="Lambda 함수" />

## 주요 기능

### 통계 카드
- **Total Functions**: 전체 Lambda 함수 수 (시안)
- **Runtimes**: 사용 중인 런타임 종류 수 (보라색)
- **Avg Memory (MB)**: 평균 메모리 할당량 (녹색)
- **Long Timeout (>5m)**: 타임아웃이 5분 초과인 함수 수 (주황색)

### 시각화 차트
- **Runtime Distribution**: 런타임별 함수 분포 파이 차트 (Python, Node.js, Java 등)
- **Memory Allocation**: 메모리 설정별 함수 분포 바 차트

### 함수 목록 테이블
| 컬럼 | 설명 |
|------|------|
| Function Name | 함수 이름 |
| Runtime | 런타임 (deprecated 표시 포함) |
| Memory (MB) | 할당된 메모리 |
| Timeout (s) | 타임아웃 설정 |
| Code Size | 코드 크기 |
| Last Modified | 최종 수정일 |
| Region | 리전 |

### Deprecated 런타임 표시
다음 런타임은 주황색으로 "deprecated" 라벨이 표시됩니다:
- Python 2.7, 3.6, 3.7
- Node.js 10.x, 12.x, 14.x
- .NET Core 2.1, 3.1
- Ruby 2.5, 2.7
- Java 8, Go 1.x

### 상세 패널
함수를 클릭하면 상세 정보를 확인할 수 있습니다:
- **Function 섹션**: Name, ARN, Runtime, Handler, Architectures, Package Type, Code Size
- **Deployment 섹션**: Version, State, Last Update, Layers 정보
- **Configuration 섹션**: Memory, Timeout 설정
- **Network 섹션**: VPC 연결 정보 (VPC ID, Subnets, Security Groups)

## 사용 방법

1. 사이드바에서 **Compute > Lambda**를 클릭합니다
2. Runtime Distribution 차트에서 런타임 분포를 확인합니다
3. Memory Allocation 차트에서 메모리 설정 패턴을 파악합니다
4. deprecated 런타임 함수를 식별하여 업그레이드 계획을 세웁니다
5. 함수를 클릭하여 상세 구성을 확인합니다

## 사용 팁

:::tip Deprecated 런타임 관리
Runtime 컬럼에서 주황색 "deprecated" 라벨이 표시된 함수는 AWS 지원이 종료되었거나 종료 예정입니다. 빠른 업그레이드를 권장합니다.
:::

:::tip Long Timeout 함수 점검
타임아웃이 5분 이상인 함수는 비용 최적화와 오류 처리 관점에서 검토가 필요합니다.
:::

:::info AI 분석
AI Assistant에서 "Lambda 함수 목록", "Python 런타임 사용하는 함수", "deprecated 런타임 함수 찾아줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [CloudWatch](../monitoring/cloudwatch) - Lambda 실행 로그 및 알람
- [IAM](../security/iam) - Lambda 실행 역할 확인
- [VPC](../network/vpc) - VPC 연결 Lambda 네트워크 구성
