---
sidebar_position: 1
---

import Screenshot from '@site/src/components/Screenshot';

# EBS

EBS(Elastic Block Store) 볼륨 및 스냅샷을 관리하고 모니터링합니다.

<Screenshot src="/screenshots/storage/ebs.png" alt="EBS" />

## 주요 기능

### 통계 카드
- **Total Volumes**: 전체 볼륨 수 (in-use/available 구분)
- **Total Size**: 총 스토리지 용량 (사용 중/유휴 용량)
- **Encrypted**: 암호화된 볼륨 비율
- **Unencrypted**: 암호화되지 않은 볼륨 수 (보안 경고)
- **Snapshots**: 스냅샷 수 및 암호화 상태
- **Idle Volumes**: 유휴 볼륨 수 (비용 절감 대상)

### 시각화 차트
- **Volume Type**: gp3, gp2, io1, io2 등 타입별 분포
- **State**: in-use, available 등 상태별 분포
- **Encryption**: 암호화 여부 분포

### 볼륨/스냅샷 탭
볼륨과 스냅샷을 탭으로 분리하여 조회:
- **Volumes 탭**: 볼륨 목록, 타입, 크기, IOPS, 연결된 EC2
- **Snapshots 탭**: 스냅샷 목록, 생성일, 암호화 상태

### 상세 패널
볼륨 클릭 시 우측 패널에서 확인:
- 볼륨 ID, 이름, 타입, 크기
- IOPS, Throughput, AZ
- Multi-Attach 설정
- 암호화 상태 및 KMS 키
- 연결된 EC2 인스턴스 정보
- 해당 볼륨의 스냅샷 목록

## 사용 방법

### 볼륨 조회
1. Volumes 탭에서 전체 볼륨 목록 확인
2. 검색창에 볼륨 ID, 이름, 타입 등 입력하여 필터링
3. 테이블 행 클릭하여 상세 정보 확인

### 스냅샷 조회
1. Snapshots 탭 클릭
2. 스냅샷 ID, 볼륨 ID, 이름으로 검색
3. 생성일, 암호화 상태 확인

### EC2 연결 확인
볼륨 상세 패널의 "Attached Resources" 섹션에서:
- 연결된 EC2 인스턴스 ID
- 디바이스 경로 (예: /dev/xvda)
- 인스턴스 이름, 타입, 상태

## 사용 팁

:::tip 유휴 볼륨 관리
"available" 상태의 볼륨은 EC2에 연결되지 않아 비용만 발생합니다. Idle Volumes 카드에서 유휴 볼륨을 확인하고 불필요한 볼륨은 삭제하세요.
:::

:::info 암호화 권장
보안 컴플라이언스를 위해 모든 EBS 볼륨은 암호화하는 것이 좋습니다. Unencrypted 카드에서 암호화되지 않은 볼륨을 확인하고 암호화된 스냅샷을 생성한 후 복원하여 암호화를 적용할 수 있습니다.
:::

## AI 분석 팁

AI 어시스턴트에 다음과 같이 질문해 보세요:

- "암호화되지 않은 EBS 볼륨 목록 보여줘"
- "유휴 EBS 볼륨의 총 용량과 예상 비용은?"
- "gp2에서 gp3로 마이그레이션하면 비용이 얼마나 절감될까?"
- "특정 EC2에 연결된 볼륨들의 IOPS 설정 확인해줘"

:::tip Data Gateway
AI 어시스턴트는 Data Gateway (15개 도구)를 통해 EBS 볼륨 분석, 스냅샷 관리, 비용 최적화 등을 지원합니다.
:::

## 관련 페이지

- [EC2](../compute/ec2) - EBS 볼륨이 연결된 인스턴스
- [Cost Explorer](../monitoring/cost) - EBS 비용 분석
- [Security](../security) - 암호화되지 않은 볼륨 보안 점검
