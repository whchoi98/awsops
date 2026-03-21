---
sidebar_position: 2
---

import Screenshot from '@site/src/components/Screenshot';

# Security

Security 페이지에서는 AWS 환경의 보안 취약점을 종합적으로 모니터링합니다. Public S3 버킷, 개방된 Security Group, 암호화되지 않은 EBS 볼륨, 컨테이너 CVE 취약점을 한 곳에서 확인할 수 있습니다.

<Screenshot src="/screenshots/security/security.png" alt="Security" />

## 요약 통계

페이지 상단에서 주요 보안 지표를 확인할 수 있습니다:

| 지표 | 설명 | 권장 수치 |
|------|------|----------|
| Public Buckets | 공개 접근이 가능한 S3 버킷 | 0 |
| MFA Issues | MFA 미활성화 사용자 | 0 |
| Open SGs | 0.0.0.0/0 인바운드 허용 Security Group | 최소화 |
| Unencrypted Vols | 암호화되지 않은 EBS 볼륨 | 0 |
| CVE Critical | Critical 등급 취약점 | 0 |
| CVE High | High 등급 취약점 | 최소화 |

## 시각화 차트

### CVE 심각도 분포
파이 차트로 취약점 심각도별 분포를 표시합니다:

- **CRITICAL** (빨간색): 즉시 조치 필요
- **HIGH** (주황색): 빠른 조치 권장
- **MEDIUM** (보라색): 계획된 조치 필요
- **LOW** (청록색): 낮은 우선순위

### 보안 이슈 요약
막대 차트로 각 카테고리별 이슈 수를 비교합니다.

## 탭별 상세 정보

### Public Buckets

공개 접근이 허용된 S3 버킷 목록입니다.

| 컬럼 | 설명 |
|------|------|
| Bucket Name | 버킷 이름 |
| Region | 버킷 리전 |
| Policy Public | 버킷 정책이 공개인지 여부 |
| Block ACLs | Public ACL 차단 여부 |
| Block Policy | Public Policy 차단 여부 |

:::tip 공개 버킷 조치
공개 버킷이 발견되면 의도된 것인지 확인하세요. 의도치 않은 경우 S3 Block Public Access 설정을 활성화하여 즉시 차단할 수 있습니다.
:::

### MFA Status

MFA가 활성화되지 않은 IAM 사용자 목록입니다.

| 컬럼 | 설명 |
|------|------|
| Username | 사용자 이름 |
| User ID | AWS 사용자 ID |
| Created | 생성일 |
| Password Last Used | 마지막 로그인 |

### Open Security Groups

0.0.0.0/0에서 인바운드 트래픽을 허용하는 Security Group 규칙입니다.

| 컬럼 | 설명 |
|------|------|
| Group ID | Security Group ID |
| Group Name | Security Group 이름 |
| VPC | 소속 VPC |
| Protocol | 허용 프로토콜 |
| From/To Port | 허용 포트 범위 |
| CIDR | 소스 CIDR (0.0.0.0/0 강조 표시) |

:::info 보안 그룹 권장 사항
0.0.0.0/0 CIDR은 모든 IP에서의 접근을 허용합니다. 웹 서버(80, 443) 외의 포트에서는 특정 IP 대역으로 제한하는 것을 권장합니다.
:::

### Unencrypted Volumes

암호화되지 않은 EBS 볼륨 목록입니다.

| 컬럼 | 설명 |
|------|------|
| Volume ID | EBS 볼륨 ID |
| Name | 볼륨 이름 태그 |
| Type | 볼륨 타입 (gp3, io2 등) |
| Size (GB) | 볼륨 크기 |
| State | 볼륨 상태 |
| AZ | 가용 영역 |

:::tip 볼륨 암호화 방법
기존 볼륨은 직접 암호화할 수 없습니다. 암호화된 스냅샷을 생성한 후 해당 스냅샷에서 새 볼륨을 생성하세요.
:::

### CVE Vulnerabilities

Trivy 스캔으로 탐지된 컨테이너 이미지 취약점입니다.

| 컬럼 | 설명 |
|------|------|
| CVE ID | 취약점 ID (예: CVE-2024-1234) |
| Severity | 심각도 (CRITICAL/HIGH/MEDIUM/LOW) |
| Package | 취약한 패키지 이름 |
| Installed | 설치된 버전 |
| Fixed | 수정된 버전 (없으면 --) |
| Title | 취약점 제목 |

## 상세 정보 패널

각 테이블에서 행을 클릭하면 슬라이드 패널에서 상세 정보를 확인할 수 있습니다:

- **S3 버킷**: Public Access 설정 전체
- **IAM 사용자**: ARN, 생성일, 마지막 로그인
- **Security Group**: 규칙 상세 및 조치 권고
- **EBS 볼륨**: 생성일, 상태, 암호화 조치 안내
- **CVE**: 취약점 설명, 영향받는 패키지, 수정 버전

## 데이터 소스

| 데이터 | 소스 |
|--------|------|
| S3, IAM, SG, EBS | Steampipe AWS 플러그인 |
| CVE 취약점 | Steampipe Trivy 플러그인 (`trivy_scan_vulnerability` 테이블) |
