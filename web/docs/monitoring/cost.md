---
sidebar_position: 4
title: Cost Explorer
description: AWS 비용을 서비스별, 일별, 월별로 분석하고 트렌드를 파악합니다.
---

import Screenshot from '@site/src/components/Screenshot';

# Cost Explorer

AWS 비용 데이터를 다양한 관점에서 분석하고 시각화하는 페이지입니다.

<Screenshot src="/screenshots/monitoring/cost.png" alt="Cost" />

## 주요 기능

### 비용 요약
- **This Month**: 이번 달 누적 비용
- **Last Month**: 지난 달 총 비용
- **Projected**: 월말 예상 비용 (현재 일자 기준 추정)
- **Daily Avg**: 일평균 비용
- **MoM Change**: 전월 대비 변화율
- **Services**: 비용 발생 서비스 수

### 기간 필터
| 옵션 | 설명 |
|------|------|
| This Month | 이번 달만 |
| 3 Months | 최근 3개월 |
| 6 Months | 최근 6개월 |
| 1 Year | 최근 1년 |

### 서비스 필터
특정 서비스만 선택하여 분석할 수 있습니다. 여러 서비스를 선택하면 해당 서비스들의 합계를 표시합니다.

### 시각화
- **Daily Cost Trend**: 최근 30일 일별 비용 추이
- **Monthly Cost Trend**: 월별 비용 추이
- **Cost by Service (Top 8)**: 상위 8개 서비스 비율 파이 차트
- **Top 10 Services**: 상위 10개 서비스 막대 차트

### 서비스 상세
서비스 행 클릭 시 슬라이드 패널에서 확인:
- 서비스별 총 비용
- 월별 비용 추이 라인 차트
- 월별 상세 내역

## 사용 방법

1. **기간 선택**: 분석할 기간 선택 (1m, 3m, 6m, 12m)
2. **서비스 필터**: Services 버튼으로 특정 서비스만 필터링
3. **차트 확인**: 비용 추이 및 서비스별 분포 확인
4. **상세 분석**: 서비스 행 클릭으로 월별 상세 확인

:::tip MSP 환경 자동 감지
Managed Service Provider(MSP) 환경에서는 Cost Explorer API 접근이 제한될 수 있습니다. AWSops는 이를 자동으로 감지하여 대체 데이터를 표시합니다.
:::

## 사용 팁

### 비용 급증 원인 파악
1. MoM Change가 높은 경우 (>10%) 서비스 테이블에서 Change 컬럼 확인
2. Change가 20% 이상인 서비스 클릭하여 월별 추이 확인
3. 특정 월에 급증했다면 해당 기간의 리소스 변경 이력 확인

### 예산 관리
Projected 값으로 월말 예상 비용을 확인하세요. 예산을 초과할 것 같으면:
- 미사용 리소스 정리
- Reserved Instance/Savings Plans 검토
- 리소스 크기 최적화

### 비용 최적화 대상 식별
Share 컬럼에서 비용 비중이 높은 서비스를 우선 최적화 대상으로 검토하세요.

:::info Cost Explorer 미지원 환경
Cost Explorer가 비활성화된 환경에서는 스냅샷 데이터를 표시합니다. "Showing cached data" 배너가 표시되며, 마지막 캐시 시점이 함께 표시됩니다.
:::

### costEnabled 토글
사이드바 하단의 **Cost** 토글로 Cost Explorer 기능을 켜거나 끌 수 있습니다. MSP 환경 등에서 API 호출을 줄이려면 비활성화하세요.

## AI 분석 팁

AI 어시스턴트에서 Cost Gateway (11개 도구)를 활용한 질문 예시:

- "이번 달 비용이 증가한 원인 분석해줘"
- "EC2 비용 최적화 방안 추천해줘"
- "Reserved Instance 전환 시 절감 효과 계산해줘"
- "서비스별 비용 예측 3개월치 보여줘"
- "태그별 비용 분석해줘"

## 관련 페이지

- [Resource Inventory](../monitoring/inventory) - 리소스 수량 및 비용 영향
- [ECS Container Cost](../compute/ecs-container-cost) - ECS 컨테이너 비용
- [EKS Container Cost](../compute/eks-container-cost) - EKS 컨테이너 비용
