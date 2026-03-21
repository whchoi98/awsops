---
sidebar_position: 2
title: Bedrock
description: Amazon Bedrock 모델 사용량, 비용, 토큰 모니터링
---

# Bedrock Monitoring

Amazon Bedrock의 모델별 사용량, 토큰 비용, Prompt Caching 절감 효과를 실시간으로 모니터링하는 대시보드입니다.

import Screenshot from '@site/src/components/Screenshot';

<Screenshot src="/screenshots/monitoring/bedrock.png" alt="Bedrock Monitoring" />

## 주요 기능

### 통계 카드 (8개)

| 카드 | 설명 |
|------|------|
| Total Cost | 선택 기간 내 전체 모델 비용 합계 |
| Invocations | 모델 호출 총 횟수 |
| Input Tokens | 입력 토큰 총 수 |
| Output Tokens | 출력 토큰 총 수 |
| Avg Latency | 평균 응답 지연 시간 (초) |
| Errors | 클라이언트(4xx) + 서버(5xx) 오류 합계 |
| Cache Savings | Prompt Caching으로 절감된 비용 + 캐시 적중률(%) |
| Models Used | 기간 내 사용된 모델 수 |

### 차트 (3개)

- **Cost by Model** (파이 차트): 모델별 비용 비중
- **Invocations by Model** (바 차트): 모델별 호출 횟수 비교
- **Token Usage Over Time** (라인 차트): 시간대별 토큰 사용 추이

### Account Total vs AWSops 사용량

계정 전체(CloudWatch 기반)와 AWSops 앱 내부 사용량을 나란히 비교합니다:

- **Account Total**: CloudWatch `AWS/Bedrock` 네임스페이스에서 수집한 계정 전체 Invocations, Input/Output Tokens, 추정 비용
- **AWSops App**: 대시보드 AI 어시스턴트를 통한 누적 호출 수, 토큰 사용량, 모델별 분포

### Prompt Caching 요약

Prompt Caching이 활성화된 모델의 캐싱 효과를 한눈에 확인할 수 있습니다:
- Cache Read/Write 토큰 수
- 캐시 적중률 (%)
- 캐시 비용 및 절감액

### 모델별 상세 정보

테이블에서 모델 행을 클릭하면 슬라이드 패널이 열립니다:
- **Cost Breakdown**: Input/Output/Cache Read/Cache Write 비용 상세
- **Usage**: Invocations, 토큰 수, 지연 시간, 오류 건수
- **Pricing**: 모델별 1M 토큰당 가격 정보
- **시계열 차트**: 호출 추이, 토큰 사용 추이

### 시간 범위 선택

우측 상단의 시간 범위 버튼으로 조회 기간을 변경합니다:
- **1h**: 최근 1시간 (5분 간격)
- **6h**: 최근 6시간 (5분 간격)
- **24h**: 최근 24시간 (1시간 간격)
- **7d**: 최근 7일 (1일 간격) — 기본값
- **30d**: 최근 30일 (1일 간격)

## AI 페이지 토큰 비용 표시

AI 어시스턴트 페이지(`/ai`)에서 각 응답에 토큰 사용량과 비용이 표시됩니다:
- Input/Output 토큰 수
- 모델별 가격 기반 비용 계산
- Bedrock 대시보드와 동일한 가격 테이블 사용

## 데이터 소스

- **CloudWatch**: `AWS/Bedrock` 네임스페이스의 `Invocations`, `InputTokenCount`, `OutputTokenCount`, `InvocationLatency`, `InvocationClientErrors`, `InvocationServerErrors`, `CacheReadInputTokenCount`, `CacheWriteInputTokenCount` 메트릭
- **AWSops 통계**: `agentcore-stats.ts`의 누적 호출/토큰 데이터

## 사용 팁

:::tip 비용 최적화
Prompt Caching 적중률이 낮다면, 반복적인 시스템 프롬프트나 컨텍스트를 캐싱 가능한 형태로 구성하면 비용을 크게 절감할 수 있습니다.
:::

:::info Cross-Region Inference
교차 리전 추론 모델 ID(예: `us.anthropic.claude-*`)도 자동으로 인식하여 올바른 가격을 적용합니다.
:::

## 관련 페이지

- [Monitoring Overview](./monitoring.md) - 인프라 성능 모니터링
- [Cost Explorer](./cost.md) - AWS 전체 비용 분석
- [AI Assistant](../overview/ai-assistant.md) - AI 어시스턴트 사용 가이드
