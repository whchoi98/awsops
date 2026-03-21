---
sidebar_position: 2
title: CloudWatch
description: CloudWatch 알람을 모니터링하고 상태 변화를 추적합니다.
---

import Screenshot from '@site/src/components/Screenshot';

# CloudWatch

AWS CloudWatch 알람의 상태를 한눈에 파악하고 세부 설정을 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/monitoring/cloudwatch.png" alt="CloudWatch" />

## 주요 기능

### 알람 상태 요약
- **OK**: 정상 상태의 알람 수 (초록)
- **ALARM**: 트리거된 알람 수 (빨강)
- **INSUFFICIENT_DATA**: 데이터 부족 알람 수 (주황)

### 시각화
- **Alarm State Distribution**: 상태별 알람 비율 파이 차트
- **Alarms by Namespace**: 네임스페이스별 알람 수 막대 차트

### 알람 목록
| 컬럼 | 설명 |
|------|------|
| Alarm Name | 알람 이름 |
| Namespace | AWS 서비스 네임스페이스 (AWS/EC2, AWS/RDS 등) |
| Metric | 모니터링 대상 메트릭 |
| State | 현재 상태 (OK, ALARM, INSUFFICIENT_DATA) |
| Reason | 상태 변경 사유 |
| Actions | 액션 활성화 여부 |

### 알람 상세 정보
알람 행 클릭 시 슬라이드 패널에서 상세 정보 확인:
- **Alarm**: 이름, ARN, 상태, 상태 사유
- **Configuration**: 비교 연산자, 임계값, 평가 기간, 통계
- **Actions**: 알람/OK/데이터 부족 시 실행되는 액션 목록 (SNS, Lambda 등)

## 사용 방법

1. **상태 필터링**: 상단 StatsCard 클릭으로 해당 상태의 알람만 필터링
2. **네임스페이스 확인**: 막대 차트에서 알람이 많은 서비스 식별
3. **상세 보기**: 알람 행 클릭으로 설정 및 액션 확인
4. **새로고침**: 우측 상단 버튼으로 최신 상태 조회

:::tip 알람 상태 의미
- **OK**: 메트릭이 임계값 이내
- **ALARM**: 메트릭이 임계값 초과/미달 (설정에 따라)
- **INSUFFICIENT_DATA**: 메트릭 데이터 부족 또는 알람 생성 직후
:::

## 사용 팁

### ALARM 상태 즉시 확인
상단의 빨간색 "ALARM" StatsCard에 "Active alarms!" 표시가 있으면 즉시 확인이 필요합니다.

### 액션 설정 확인
알람 상세에서 Actions Enabled가 "No"인 경우 알람이 트리거되어도 알림이 발송되지 않습니다. SNS 토픽이나 Lambda 함수가 연결되어 있는지 확인하세요.

### INSUFFICIENT_DATA 해결
- 새로 생성된 알람: 메트릭 수집까지 대기 (최대 5-10분)
- 기존 알람: 메트릭 소스 확인 (EC2 중지, Lambda 비활성 등)

:::info 알람 평가 기간
알람이 ALARM 상태가 되려면 연속된 평가 기간(Evaluation Periods) 동안 임계값을 초과해야 합니다. 예: Period 300s, Eval Periods 3 = 15분 연속 초과 시 알람.
:::

## AI 분석 팁

AI 어시스턴트에서 Monitoring Gateway를 활용한 질문 예시:

- "ALARM 상태인 알람들의 공통 원인 분석해줘"
- "지난 24시간 알람 상태 변화 이력 보여줘"
- "이 알람 임계값이 적절한지 분석해줘"
- "알람 액션으로 Lambda 대신 SNS 사용하는 게 나을까?"

## 관련 페이지

- [Monitoring Overview](../monitoring) - 성능 메트릭
- [CloudTrail](../monitoring/cloudtrail) - API 활동 감사
- [Cost Explorer](../monitoring/cost) - 비용 분석
