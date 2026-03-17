---
sidebar_position: 3
---

import Screenshot from '@site/src/components/Screenshot';

# CIS Compliance

CIS Compliance 페이지에서는 AWS CIS(Center for Internet Security) 벤치마크를 기반으로 보안 컴플라이언스 상태를 평가합니다. Powerpipe를 사용하여 수백 개의 컨트롤을 자동으로 검사합니다.

<Screenshot src="/screenshots/security/compliance.png" alt="Compliance" />

## 지원 벤치마크

다음 CIS AWS Foundations Benchmark 버전을 지원합니다:

| 버전 | 컨트롤 수 | 비고 |
|------|----------|------|
| CIS v4.0.0 | 최신 | 2024년 릴리스 |
| CIS v3.0.0 | 기본 선택 | 권장 버전 |
| CIS v2.0.0 | 레거시 | |
| CIS v1.5.0 | 레거시 | |

:::tip 버전 선택
특별한 요구사항이 없다면 CIS v3.0.0을 사용하는 것을 권장합니다. 최신 보안 권장사항이 반영되어 있으면서 안정적입니다.
:::

## 벤치마크 실행

1. 드롭다운에서 벤치마크 버전을 선택합니다
2. **Run Benchmark** 버튼을 클릭합니다
3. 실행 중에는 진행 상태가 표시됩니다 (약 2-5분 소요)

:::info 실행 시간
벤치마크는 수백 개의 AWS API 호출을 수행합니다. AWS 리소스 수에 따라 2-5분이 소요될 수 있습니다.
:::

## 결과 요약

### 통계 카드

| 지표 | 설명 |
|------|------|
| Pass Rate | 통과율 (OK / 전체) |
| Total Controls | 검사된 총 컨트롤 수 |
| OK | 통과한 컨트롤 |
| Alarm | 실패한 컨트롤 (조치 필요) |
| Skipped | 건너뛴 컨트롤 |
| Errors | 실행 오류 |

### 통과율 기준

| 통과율 | 상태 | 의미 |
|--------|------|------|
| 80% 이상 | 녹색 | 양호 |
| 50-79% | 주황색 | 개선 필요 |
| 50% 미만 | 빨간색 | 심각한 조치 필요 |

## 시각화 차트

### Compliance Status (파이 차트)
컨트롤 상태별 분포를 표시합니다:

- **OK** (녹색): 통과
- **Alarm** (빨간색): 실패 - 조치 필요
- **Skip** (회색): 건너뜀 - 해당 없음
- **Error** (주황색): 실행 오류
- **Info** (청록색): 정보성

### Alarms by Section (막대 차트)
섹션별 실패(Alarm) 수를 비교합니다. 가장 많은 실패가 발생한 섹션에 우선 집중하세요.

## 섹션별 상세

CIS 벤치마크는 다음과 같은 주요 섹션으로 구성됩니다:

| 섹션 | 주요 검사 항목 |
|------|--------------|
| 1. Identity and Access Management | 루트 계정, MFA, 비밀번호 정책, IAM 사용자 |
| 2. Storage | S3 버킷 암호화, 퍼블릭 접근 차단 |
| 3. Logging | CloudTrail, Config, VPC Flow Logs |
| 4. Monitoring | CloudWatch 알람, 메트릭 필터 |
| 5. Networking | Security Group, NACL, VPC 설정 |

### 섹션 카드

각 섹션 카드에서 확인할 수 있는 정보:

- 섹션 제목
- OK / ALARM / SKIP 수
- 통과율 퍼센트
- 진행 바 (시각적 상태 표시)

섹션 카드를 클릭하면 해당 섹션의 컨트롤 목록이 펼쳐집니다.

## 컨트롤 상세

### 컨트롤 목록

섹션을 클릭하면 하위 컨트롤 목록이 표시됩니다:

| 아이콘 | 상태 |
|-------|------|
| 녹색 체크 | OK - 통과 |
| 빨간색 X | ALARM - 실패 |
| 주황색 경고 | ERROR - 오류 |
| 회색 마이너스 | SKIP - 건너뜀 |
| 청록색 정보 | INFO - 정보 |

### 컨트롤 상세 패널

컨트롤을 클릭하면 슬라이드 패널에서 상세 정보를 확인합니다:

- **Control ID**: CIS 컨트롤 번호 (예: 1.1, 2.1.1)
- **Title**: 컨트롤 제목
- **Status**: 검사 결과 상태
- **Reason**: 통과/실패 사유
- **Resource**: 검사 대상 리소스 ARN
- **Description**: 컨트롤 설명 및 권장사항

:::tip 실패 조치
ALARM 상태의 컨트롤은 Reason과 Resource를 확인하여 조치하세요. 대부분의 컨트롤은 AWS 콘솔이나 CLI에서 간단히 수정할 수 있습니다.
:::

## 결과 저장

벤치마크 결과는 서버에 캐시됩니다. 페이지를 새로고침해도 마지막 실행 결과가 유지됩니다.

새로운 결과가 필요한 경우 **Run Benchmark** 버튼을 다시 클릭하세요.
