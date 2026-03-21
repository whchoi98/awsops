---
sidebar_position: 7
---

import Screenshot from '@site/src/components/Screenshot';

# MSK

Amazon MSK(Managed Streaming for Apache Kafka) 클러스터를 모니터링하고 브로커 성능을 확인합니다.

<Screenshot src="/screenshots/storage/msk.png" alt="MSK" />

## 주요 기능

### 통계 카드
- **Total Clusters**: 전체 클러스터 수 (활성 클러스터 수 포함)
- **Active**: 활성 상태 클러스터 수
- **Total Brokers**: 전체 브로커 노드 수
- **Enhanced Monitoring**: 향상된 모니터링이 활성화된 클러스터 수
- **In-Transit Encrypted**: 전송 중 암호화가 활성화된 클러스터 수
- **Avg Brokers/Cluster**: 클러스터당 평균 브로커 수

### 시각화 차트
- **Cluster State**: ACTIVE, CREATING 등 상태별 분포
- **Kafka Version**: Kafka 버전별 분포

### Broker Nodes 메트릭 테이블
CloudWatch에서 수집한 브로커별 실시간 메트릭:
- **Cluster**: 클러스터 이름
- **Type**: BROKER 또는 CONTROLLER
- **ID**: 브로커 ID
- **Instance**: 인스턴스 타입
- **VPC IP**: 브로커 VPC IP 주소
- **ENI**: 연결된 ENI ID
- **CPU**: CPU 사용률 (User + System)
- **Memory**: 메모리 사용률
- **Network In/Out**: 네트워크 트래픽 (KB/s)
- **Endpoint**: 브로커 엔드포인트

### 상세 패널
클러스터 클릭 시 확인 가능한 정보:
- 클러스터 이름, 상태, 타입
- Kafka 버전, 브로커 수
- Enhanced Monitoring 설정
- 스토리지 모드
- 브로커 구성 (인스턴스 타입, EBS 크기, AZ 분포)
- Security Group, Subnet 정보
- 암호화 설정 (In-Transit, At-Rest, KMS)
- 인증 설정 (IAM, SCRAM, TLS)
- Bootstrap Brokers (Plaintext, TLS)
- 브로커 노드 상세 정보
- Open Monitoring (JMX/Node Exporter)
- 로깅 설정

## 사용 방법

### 클러스터 목록 조회
1. 검색창에 클러스터 이름, Kafka 버전 등 입력
2. 테이블에서 상태, 인스턴스 타입, 브로커 수 확인
3. 행 클릭하여 상세 정보 조회

### 브로커 성능 모니터링
Broker Nodes 테이블에서:
1. **CPU** 사용률 확인 (80% 이상 주의)
2. **Memory** 사용률 모니터링 (85% 이상 경고)
3. **Network In/Out** 트래픽 확인
4. 클러스터별 브로커 분포 확인

### Bootstrap Brokers 확인
상세 패널에서 Bootstrap Brokers 엔드포인트 확인:
- **Plaintext**: 암호화 없는 연결용
- **TLS**: TLS 암호화 연결용

## 사용 팁

:::tip 브로커 수 계획
파티션 수와 복제 팩터를 고려하여 적절한 브로커 수를 계획하세요. 일반적으로 3개 이상의 브로커를 권장하며, 고가용성을 위해 여러 AZ에 분산 배포합니다.
:::

:::info KRaft 모드
Kafka 3.x 이상에서는 ZooKeeper 대신 KRaft 모드를 사용할 수 있습니다. Broker Nodes 테이블에서 CONTROLLER 타입 노드가 표시되면 KRaft 모드입니다.
:::

## AI 분석 팁

AI 어시스턴트에 다음과 같이 질문해 보세요:

- "MSK 브로커 중 CPU 사용률이 높은 것은?"
- "전송 중 암호화가 비활성화된 클러스터 확인해줘"
- "MSK 클러스터의 네트워크 트래픽 추이 분석"
- "Kafka 버전 업그레이드가 필요한 클러스터는?"

:::tip Data Gateway
AI 어시스턴트는 Data Gateway (15개 도구)를 통해 MSK 클러스터 분석, 브로커 성능 튜닝, 토픽 관리 등을 지원합니다.
:::

## 관련 페이지

- [VPC](../network/vpc) - MSK가 배포된 VPC 및 Security Group
- [CloudWatch](../monitoring/cloudwatch) - MSK 관련 알람
- [Cost Explorer](../monitoring/cost) - MSK 비용 분석
