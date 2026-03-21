---
sidebar_position: 5
---

import Screenshot from '@site/src/components/Screenshot';

# ElastiCache

ElastiCache 클러스터(Valkey, Redis, Memcached)를 모니터링하고 성능 메트릭을 확인합니다.

<Screenshot src="/screenshots/storage/elasticache.png" alt="ElastiCache" />

## 주요 기능

### 통계 카드
- **Clusters**: 전체 클러스터 수 (Replication Group 수 포함)
- **Total Nodes**: 전체 노드 수
- **Valkey**: Valkey 엔진 클러스터 수
- **Redis**: Redis 엔진 클러스터 수
- **Memcached**: Memcached 엔진 클러스터 수
- **Repl Groups**: Replication Group 수
- **Node Types**: 사용 중인 노드 타입 수

### 시각화 차트
- **Engine Distribution**: Valkey, Redis, Memcached 엔진별 분포
- **Node Type Distribution**: 노드 타입별 분포

### Cache Nodes 메트릭 테이블
CloudWatch에서 수집한 실시간 메트릭:
- **Cluster ID**: 클러스터 식별자
- **Engine**: 엔진 종류 (색상으로 구분)
- **Node ID**: 노드 식별자
- **Status**: 노드 상태
- **CPU**: CPU 사용률
- **Engine CPU**: 엔진 CPU 사용률
- **Memory**: 가용 메모리
- **Network In/Out**: 네트워크 트래픽
- **Connections**: 현재 연결 수
- **AZ**: 가용 영역
- **Endpoint**: 노드 엔드포인트

### 상세 패널
클러스터 클릭 시 확인 가능한 정보:
- 클러스터 ID, ARN, 엔진, 버전
- 노드 타입, 상태, 노드 수
- Replication Group 정보
- 네트워크 설정 (서브넷 그룹, AZ)
- 보안 설정 (At-Rest/Transit 암호화, Auth Token)
- 구성 설정 (스냅샷 보존, 유지보수 윈도우)
- Security Group 및 인바운드 규칙
- CloudWatch 메트릭 차트

## 사용 방법

### 클러스터 목록 조회
1. Cache Clusters 테이블에서 클러스터 목록 확인
2. 검색창에 클러스터 ID, 엔진 등 입력
3. 행 클릭하여 상세 정보 조회

### 노드 성능 모니터링
Cache Nodes 테이블에서:
1. CPU/Engine CPU 사용률 확인
2. Memory 사용량 모니터링
3. Network In/Out 트래픽 확인
4. Connections 수 모니터링

### Replication Group 확인
Replication Groups 테이블에서:
- Group ID, 상태
- Multi-AZ 설정
- Auto Failover 설정
- Cluster Mode 상태

## 사용 팁

:::tip 엔진 선택 가이드
- **Valkey**: Redis 호환 오픈소스, AWS 최적화
- **Redis**: 풍부한 데이터 구조, Pub/Sub 지원
- **Memcached**: 단순 키-값 캐싱, 멀티스레드 지원
:::

:::info 암호화 권장
보안을 위해 At-Rest 암호화와 Transit 암호화를 모두 활성화하세요. 상세 패널의 Security 섹션에서 현재 암호화 설정을 확인할 수 있습니다.
:::

## AI 분석 팁

AI 어시스턴트에 다음과 같이 질문해 보세요:

- "ElastiCache 클러스터 중 암호화가 비활성화된 것은?"
- "Redis 클러스터의 메모리 사용률 분석해줘"
- "Cache Hit Rate가 낮은 클러스터 확인해줘"
- "ElastiCache 노드 타입별 비용 비교해줘"

:::tip Data Gateway
AI 어시스턴트는 Data Gateway (15개 도구)를 통해 ElastiCache 성능 분석, 캐시 최적화, 비용 분석 등을 지원합니다.
:::

## 관련 페이지

- [VPC](../network/vpc) - ElastiCache가 배포된 VPC 및 Security Group
- [CloudWatch](../monitoring/cloudwatch) - ElastiCache 관련 알람
- [Cost Explorer](../monitoring/cost) - ElastiCache 비용 분석
