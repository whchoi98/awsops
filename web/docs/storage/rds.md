---
sidebar_position: 3
---

import Screenshot from '@site/src/components/Screenshot';

# RDS

RDS(Relational Database Service) 인스턴스를 모니터링하고 성능 메트릭을 확인합니다.

<Screenshot src="/screenshots/storage/rds.png" alt="RDS" />

## 주요 기능

### 통계 카드
- **Total Instances**: 전체 RDS 인스턴스 수
- **Storage (GB)**: 총 할당된 스토리지 용량
- **Multi-AZ**: Multi-AZ 배포된 인스턴스 수
- **Engines**: 사용 중인 데이터베이스 엔진 종류 수

### 시각화 차트
- **Engine Distribution**: MySQL, PostgreSQL, Aurora 등 엔진별 분포
- **Storage by Instance**: 인스턴스별 스토리지 사용량

### 인스턴스 메트릭 테이블
CloudWatch에서 수집한 실시간 메트릭을 테이블로 표시:
- **CPU**: CPU 사용률 (프로그레스 바 + 수치)
- **Free Memory**: 가용 메모리
- **Connections**: 현재 연결 수
- **Read/Write IOPS**: 읽기/쓰기 IOPS
- **Network In/Out**: 네트워크 트래픽
- **Free Storage**: 가용 스토리지

### Security Group 체이닝
상세 패널에서 RDS에 연결된 Security Group과 인바운드 규칙을 확인:
- Security Group ID, 이름
- 프로토콜, 포트 범위
- 소스 IP 또는 참조 Security Group

### 상세 패널
인스턴스 클릭 시 확인 가능한 정보:
- 인스턴스 식별자, 엔진, 버전, 클래스
- 스토리지 설정 (타입, 용량, 암호화)
- 네트워크 설정 (VPC, 서브넷, 엔드포인트)
- 백업 설정 (보존 기간, 백업 윈도우)
- 보안 기능 (IAM 인증, Performance Insights 등)
- CloudWatch 메트릭 차트

## 사용 방법

### 인스턴스 목록 조회
1. 검색창에 인스턴스 식별자, 엔진 등 입력
2. 테이블에서 상태, 엔진, 클래스 확인
3. 행 클릭하여 상세 정보 조회

### 성능 모니터링
Instance Metrics 테이블에서:
1. CPU 사용률 확인 (80% 이상 주의)
2. Free Memory와 Free Storage 확인
3. Connection 수 모니터링
4. IOPS 및 네트워크 트래픽 확인

### Security Group 확인
상세 패널의 "Security Groups" 섹션에서:
1. 연결된 Security Group 목록 확인
2. 각 SG의 인바운드 규칙 확인
3. 의도하지 않은 넓은 범위 허용 여부 점검

## 사용 팁

:::tip Multi-AZ 권장
프로덕션 워크로드는 Multi-AZ 배포를 권장합니다. 자동 장애 조치로 고가용성을 확보할 수 있습니다. Multi-AZ 카드에서 현재 배포 상태를 확인하세요.
:::

:::info 스토리지 자동 확장
Free Storage가 낮아지면 스토리지 자동 확장 설정을 검토하세요. 메트릭 테이블에서 각 인스턴스의 가용 스토리지를 모니터링할 수 있습니다.
:::

## AI 분석 팁

AI 어시스턴트에 다음과 같이 질문해 보세요:

- "RDS 인스턴스 중 CPU 사용률이 높은 것은?"
- "Multi-AZ가 설정되지 않은 프로덕션 데이터베이스 확인해줘"
- "RDS 연결 수 추이 분석해줘"
- "특정 RDS에 접근 가능한 Security Group 분석"

:::tip Data Gateway
AI 어시스턴트는 Data Gateway (15개 도구)를 통해 RDS 성능 분석, 쿼리 최적화 제안, 백업 상태 점검 등을 지원합니다. Monitoring Gateway와 연계하여 CloudWatch 알람 설정도 분석할 수 있습니다.
:::

## 관련 페이지

- [VPC](../network/vpc) - RDS가 배포된 VPC 및 Security Group
- [CloudWatch](../monitoring/cloudwatch) - RDS 관련 알람
- [Cost Explorer](../monitoring/cost) - RDS 비용 분석
