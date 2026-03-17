---
sidebar_position: 4
---

import Screenshot from '@site/src/components/Screenshot';

# DynamoDB

DynamoDB 테이블을 관리하고 용량 및 설정을 모니터링합니다.

<Screenshot src="/screenshots/storage/dynamodb.png" alt="DynamoDB" />

## 주요 기능

### 통계 카드
- **Tables**: 전체 테이블 수
- **Active**: 활성 상태 테이블 수
- **Total Items**: 모든 테이블의 총 아이템 수
- **Total Size**: 모든 테이블의 총 데이터 크기

### 시각화 차트
- **Table Status**: ACTIVE, CREATING 등 상태별 분포
- **Items per Table**: 테이블별 아이템 수 분포

### 테이블 목록
- 테이블 이름
- 상태 (ACTIVE, CREATING 등)
- 아이템 수
- 데이터 크기
- 빌링 모드 (On-Demand/Provisioned)
- 리전

### 상세 패널
테이블 클릭 시 확인 가능한 정보:
- 테이블 이름, ARN, 상태
- 아이템 수, 데이터 크기
- 빌링 모드
- 생성일, 리전
- 키 스키마 (Partition Key, Sort Key)
- 읽기/쓰기 용량
- Point-in-Time Recovery 설정
- 암호화 설정 (SSE)
- 태그

## 사용 방법

### 테이블 목록 조회
1. 테이블 목록에서 전체 테이블 확인
2. 상태 배지로 테이블 상태 파악
3. 행 클릭하여 상세 정보 조회

### 용량 모드 확인
빌링 컬럼에서 용량 모드 확인:
- **On-Demand**: 사용량 기반 과금 (PAY_PER_REQUEST)
- **Provisioned**: 미리 설정된 용량 기반 과금

### 키 스키마 확인
상세 패널의 "Keys" 섹션에서:
- HASH (Partition Key) 확인
- RANGE (Sort Key) 확인 (있는 경우)

## 사용 팁

:::tip On-Demand vs Provisioned
트래픽 패턴이 예측 불가능하거나 변동이 심한 경우 On-Demand 모드가 적합합니다. 안정적인 트래픽 패턴이라면 Provisioned 모드로 비용을 절감할 수 있습니다.
:::

:::info Point-in-Time Recovery
중요한 데이터가 저장된 테이블은 PITR(Point-in-Time Recovery)을 활성화하세요. 상세 패널의 Settings 섹션에서 현재 설정을 확인할 수 있습니다.
:::

## AI 분석 팁

AI 어시스턴트에 다음과 같이 질문해 보세요:

- "DynamoDB 테이블 중 PITR이 비활성화된 것은?"
- "On-Demand 모드 테이블의 비용 분석해줘"
- "DynamoDB 테이블 용량 사용량 추이 보여줘"
- "글로벌 테이블 설정 상태 확인해줘"

:::tip Data Gateway
AI 어시스턴트는 Data Gateway (15개 도구)를 통해 DynamoDB 테이블 분석, 용량 계획, 인덱스 최적화 등을 지원합니다.
:::

## 관련 페이지

- [Cost Explorer](../monitoring/cost) - DynamoDB 비용 분석
- [IAM](../security/iam) - DynamoDB 접근 권한
- [CloudWatch](../monitoring/cloudwatch) - DynamoDB 관련 알람
