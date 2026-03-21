---
sidebar_position: 6
---

import Screenshot from '@site/src/components/Screenshot';

# OpenSearch

Amazon OpenSearch Service 도메인을 모니터링하고 클러스터 상태를 확인합니다.

<Screenshot src="/screenshots/storage/opensearch.png" alt="OpenSearch" />

## 주요 기능

### 통계 카드
- **Total Domains**: 전체 도메인 수 (활성 도메인 수 포함)
- **Processing**: 구성 업데이트 중인 도메인 수
- **Node-to-Node Enc**: 노드 간 암호화가 활성화된 도메인 수
- **At-Rest Enc**: 저장 데이터 암호화가 활성화된 도메인 수
- **VPC Domains**: VPC 내에 배포된 도메인 수
- **Public Domains**: 퍼블릭 접근이 허용된 도메인 수

### 시각화 차트
- **Engine Version**: OpenSearch/Elasticsearch 버전별 분포
- **Encryption Status**: 암호화 설정 상태 분포

### Domain Metrics 테이블
CloudWatch에서 수집한 실시간 메트릭:
- **Domain**: 도메인 이름
- **Engine**: 엔진 버전
- **Cluster Status**: GREEN/YELLOW/RED 상태
- **CPU**: CPU 사용률
- **JVM Memory**: JVM 메모리 압력
- **Nodes**: 노드 수
- **Documents**: 검색 가능한 문서 수
- **Free Storage**: 가용 스토리지
- **Search Rate/Latency**: 검색 요청 수 및 지연 시간
- **Index Rate/Latency**: 인덱싱 요청 수 및 지연 시간

### 상세 패널
도메인 클릭 시 확인 가능한 정보:
- 도메인 이름, ID, 엔진 버전
- 상태, IP 타입, 엔드포인트
- 클러스터 구성 (인스턴스 타입, 노드 수, Master 설정)
- EBS 스토리지 설정
- 암호화 설정 (Node-to-Node, At-Rest, KMS 키)
- Advanced Security 설정
- VPC/네트워크 구성
- 서비스 소프트웨어 버전
- 로그 퍼블리싱 설정

## 사용 방법

### 도메인 목록 조회
1. 검색창에 도메인 이름, 엔진 버전 입력
2. 테이블에서 상태, 인스턴스 타입, 노드 수 확인
3. 행 클릭하여 상세 정보 조회

### 클러스터 상태 모니터링
Domain Metrics 테이블에서:
1. **Cluster Status** 확인 (GREEN이 정상)
2. CPU 및 JVM Memory 압력 모니터링
3. Search/Index Latency 확인
4. Free Storage 모니터링

### 보안 설정 확인
1. 암호화 카드에서 전체 암호화 상태 파악
2. VPC/Public 도메인 구분 확인
3. 상세 패널에서 Fine-Grained Access Control 확인

## 사용 팁

:::tip Cluster Status 관리
- **GREEN**: 모든 샤드가 정상 할당
- **YELLOW**: 일부 복제 샤드 미할당 (기능 정상)
- **RED**: 일부 프라이머리 샤드 미할당 (데이터 손실 가능)

RED 상태는 즉시 조치가 필요합니다.
:::

:::info VPC 배포 권장
보안을 위해 OpenSearch 도메인은 VPC 내에 배포하는 것을 권장합니다. Public Domains 카드가 빨간색으로 표시되면 VPC 마이그레이션을 검토하세요.
:::

## AI 분석 팁

AI 어시스턴트에 다음과 같이 질문해 보세요:

- "OpenSearch 클러스터 상태가 YELLOW/RED인 도메인은?"
- "노드 간 암호화가 비활성화된 도메인 확인해줘"
- "OpenSearch 검색 지연 시간이 높은 도메인 분석"
- "OpenSearch 인덱스 성능 최적화 방법 알려줘"

:::tip Data Gateway
AI 어시스턴트는 Data Gateway (15개 도구)를 통해 OpenSearch 클러스터 분석, 인덱스 최적화, 검색 성능 튜닝 등을 지원합니다.
:::

## 관련 페이지

- [VPC](../network/vpc) - OpenSearch가 배포된 VPC 및 Security Group
- [CloudWatch](../monitoring/cloudwatch) - OpenSearch 관련 알람
- [Cost Explorer](../monitoring/cost) - OpenSearch 비용 분석
