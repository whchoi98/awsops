---
sidebar_position: 3
title: CloudTrail
description: AWS API 활동 로그를 조회하고 감사 이벤트를 분석합니다.
---

import Screenshot from '@site/src/components/Screenshot';

# CloudTrail

AWS 계정의 API 활동을 기록하는 CloudTrail 트레일과 이벤트를 조회할 수 있는 페이지입니다.

<Screenshot src="/screenshots/monitoring/cloudtrail.png" alt="CloudTrail" />

## 주요 기능

### 트레일 요약
- **Total Trails**: 전체 트레일 수
- **Active**: 로깅 활성화된 트레일 수
- **Multi-Region**: 다중 리전 트레일 수
- **Log Validated**: 로그 파일 검증이 활성화된 트레일 수

### 탭 구조
| 탭 | 내용 |
|---|------|
| Trails | 트레일 목록, 설정, S3 버킷 |
| Recent Events | 최근 API 이벤트 (모든 이벤트) |
| Write Events | 쓰기 이벤트만 필터링 (리소스 변경 감사) |

:::info Lazy Loading
Events 및 Write Events 탭은 클릭 시에만 데이터를 로드합니다. CloudFront 타임아웃(30초)을 방지하기 위한 최적화입니다.
:::

### 트레일 상세 정보
트레일 행 클릭 시 슬라이드 패널에서 확인:
- **Trail**: 이름, ARN, 홈 리전, 로깅 상태, Multi-Region 여부
- **Storage**: S3 버킷, 프리픽스, SNS 토픽, KMS 키
- **CloudWatch**: 로그 그룹, IAM 역할, 마지막 전송 시간
- **Validation**: 로그 파일 검증, 마지막 배달 시간
- **Tags**: 리소스 태그

### 이벤트 상세 정보
이벤트 행 클릭 시 확인:
- **Event**: ID, 이름, 소스, 시간, 사용자, Access Key
- **Resource**: 리소스 유형 및 이름
- **Raw Event**: JSON 형식의 전체 이벤트 데이터

## 사용 방법

1. **Trails 탭**: 트레일 설정 및 상태 확인
2. **Events 탭**: 최근 API 활동 조회 (Read + Write)
3. **Write Events 탭**: 리소스 변경 이벤트만 필터링하여 감사
4. **상세 보기**: 행 클릭으로 전체 정보 확인

:::tip Read vs Write 이벤트
- **Read**: DescribeInstances, GetObject 등 조회 작업
- **Write**: CreateInstance, DeleteBucket 등 변경 작업
보안 감사 시 Write Events 탭을 집중적으로 확인하세요.
:::

## 사용 팁

### 보안 모범 사례 확인
- **Multi-Region**: 모든 리전의 활동을 기록하려면 필수
- **Log Validation**: 로그 파일 위변조 감지
- **KMS 암호화**: S3에 저장되는 로그 파일 암호화

### 의심스러운 활동 탐지
Write Events 탭에서 다음을 확인:
- 비정상적인 시간대의 API 호출
- 알 수 없는 사용자명 또는 Access Key
- 대량의 삭제(Delete*) 이벤트
- IAM 관련 변경 이벤트

### CloudWatch Logs 연동
트레일 상세에서 CloudWatch Log Group이 설정되어 있으면 실시간 알림과 메트릭 필터를 사용할 수 있습니다.

:::info 이벤트 보관 기간
CloudTrail 이벤트 히스토리는 기본 90일간 보관됩니다. 장기 보관이 필요하면 트레일을 생성하여 S3에 저장하세요.
:::

## AI 분석 팁

AI 어시스턴트에서 Monitoring Gateway를 활용한 질문 예시:

- "오늘 발생한 보안 관련 이벤트 분석해줘"
- "특정 사용자의 최근 활동 이력 보여줘"
- "삭제 이벤트 중 의심스러운 패턴 찾아줘"
- "이 트레일 설정이 보안 모범 사례에 맞는지 확인해줘"

## 관련 페이지

- [CloudWatch](../monitoring/cloudwatch) - 알람 관리
- [IAM](../security/iam) - 사용자 및 역할 관리
- [Compliance](../security/compliance) - CIS 벤치마크
