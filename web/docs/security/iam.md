---
sidebar_position: 1
---

import Screenshot from '@site/src/components/Screenshot';

# IAM

IAM(Identity and Access Management) 페이지에서는 AWS 계정의 사용자, 역할, 정책을 한눈에 확인하고 관리할 수 있습니다.

<Screenshot src="/screenshots/security/iam.png" alt="IAM" />

## 주요 기능

### 요약 통계

페이지 상단에서 IAM 리소스 현황을 확인할 수 있습니다:

- **Users**: 총 IAM 사용자 수
- **Roles**: 총 IAM 역할 수
- **Custom Policies**: 고객 관리형 정책 수
- **MFA Not Enabled**: MFA가 활성화되지 않은 사용자 수

:::tip MFA 보안 권고
MFA가 활성화되지 않은 사용자가 있으면 상단에 경고 배너가 표시됩니다. 모든 IAM 사용자에게 MFA를 활성화하는 것을 권장합니다.
:::

### MFA 상태 차트

파이 차트로 MFA 활성화 현황을 시각화합니다:

- **녹색**: MFA 활성화된 사용자
- **빨간색**: MFA 미활성화 사용자

## IAM 사용자 목록

모든 IAM 사용자를 테이블 형태로 표시합니다:

| 컬럼 | 설명 |
|------|------|
| Username | 사용자 이름 |
| User ID | AWS에서 부여한 고유 ID |
| Created | 사용자 생성일 |
| Password Last Used | 마지막 비밀번호 사용일 (콘솔 로그인) |

### 사용자 상세 정보

테이블에서 사용자를 클릭하면 슬라이드 패널에서 상세 정보를 확인할 수 있습니다:

- 사용자 이름, ID, ARN
- 경로(Path)
- 생성일 및 마지막 비밀번호 사용일
- 태그 정보

## IAM 역할 목록

모든 IAM 역할을 테이블 형태로 표시합니다:

| 컬럼 | 설명 |
|------|------|
| Role Name | 역할 이름 |
| Role ID | AWS에서 부여한 고유 ID |
| Path | 역할 경로 |
| Description | 역할 설명 |
| Created | 역할 생성일 |
| Max Session | 최대 세션 지속 시간 |

### 역할 상세 정보

테이블에서 역할을 클릭하면 상세 정보를 확인할 수 있습니다:

**기본 정보**
- 역할 이름, ID, ARN, 경로
- 설명 및 생성일
- 최대 세션 지속 시간
- 권한 경계(Permissions Boundary) ARN

**마지막 사용 정보**
- 마지막 사용 일시
- 마지막 사용 리전

**인스턴스 프로파일**
- 연결된 인스턴스 프로파일 ARN 목록

**트러스트 정책**
- `AssumeRolePolicyDocument`를 JSON 형태로 표시
- 어떤 엔티티(서비스, 계정, 사용자)가 이 역할을 수임할 수 있는지 확인

:::info 트러스트 정책 분석
트러스트 정책은 역할을 수임(Assume)할 수 있는 주체를 정의합니다. `Principal` 필드에서 허용된 서비스, 계정 ID, 사용자 ARN을 확인하세요.
:::

## 데이터 새로고침

우측 상단의 새로고침 버튼을 클릭하면 캐시를 무효화하고 최신 데이터를 조회합니다.

:::tip 캐시 정책
IAM 데이터는 5분간 캐시됩니다. 즉시 반영이 필요한 경우 새로고침 버튼을 사용하세요.
:::
