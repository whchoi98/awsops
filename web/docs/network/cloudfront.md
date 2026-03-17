---
sidebar_position: 2
title: CloudFront
description: CloudFront 배포 상태, 도메인, 오리진, 캐시 정책 모니터링
---

import Screenshot from '@site/src/components/Screenshot';

# CloudFront

Amazon CloudFront CDN 배포를 모니터링하고 관리하는 페이지입니다.

<Screenshot src="/screenshots/network/cloudfront.png" alt="CloudFront" />

## 주요 기능

### 요약 통계

상단 카드에서 전체 CloudFront 배포 현황을 확인합니다:

| 지표 | 설명 |
|------|------|
| **Distributions** | 총 배포 수 |
| **Enabled** | 활성화된 배포 수 |
| **Disabled** | 비활성화된 배포 수 |
| **HTTP Allowed** | HTTP 허용 배포 (보안 경고) |

:::info HTTP 허용 경고
HTTP Allowed 카드가 주황색으로 표시되면 HTTPS 전용 설정을 권장합니다. "Consider HTTPS only" 메시지가 함께 표시됩니다.
:::

### 배포 목록

테이블에서 모든 CloudFront 배포를 확인합니다:

- **Distribution ID**: 고유 식별자
- **Name**: 배포 이름 (태그 기반)
- **Domain**: CloudFront 도메인 (xxx.cloudfront.net)
- **Status**: Deployed, InProgress 등
- **Enabled**: 활성화 여부
- **Protocol**: Viewer Protocol Policy

### 상세 패널

배포 행 클릭 시 상세 정보를 확인합니다:

**Distribution 섹션**
- ID, ARN, Domain
- HTTP Version, IPv6 지원
- Price Class (PriceClass_All, PriceClass_100 등)
- WAF ACL 연결 여부

**Origins 섹션**
- 각 Origin의 ID와 Domain
- S3, ALB, Custom Origin 구분

**Aliases (CNAMEs) 섹션**
- 연결된 대체 도메인 이름 목록

**Tags 섹션**
- 리소스 태그 키-값 쌍

## 사용 방법

### 배포 상태 확인

1. CloudFront 페이지 접속
2. 상단 요약 카드로 전체 현황 파악
3. 테이블에서 특정 배포 확인
4. Status 컬럼으로 배포 상태 확인

### 배포 상세 정보 조회

1. 테이블에서 배포 행 클릭
2. 우측 슬라이드 패널 열림
3. 섹션별 상세 정보 확인:
   - Distribution: 기본 설정
   - Origins: 오리진 서버 구성
   - Aliases: CNAME 설정
   - Tags: 리소스 태그

### 보안 설정 검토

1. HTTP Allowed 카드 확인 (0이면 안전)
2. 배포 상세에서 Protocol 확인
3. WAF ACL 연결 여부 확인 (보안 강화)

## 사용 팁

:::tip HTTPS 설정 권장
모든 CloudFront 배포는 **redirect-to-https** 또는 **https-only** Viewer Protocol Policy를 사용하는 것이 좋습니다. HTTP Allowed가 0이 되면 카드가 녹색으로 변경됩니다.
:::

:::tip WAF 연결
프로덕션 배포에는 WAF Web ACL을 연결하여 웹 공격(SQL Injection, XSS 등)을 차단하세요. 상세 패널의 WAF ACL 필드에서 연결 상태를 확인할 수 있습니다.
:::

:::info Price Class 최적화
Price Class에 따라 요금과 성능이 달라집니다:
- **PriceClass_All**: 전 세계 모든 엣지 로케이션 (최고 성능, 최고 비용)
- **PriceClass_200**: 대부분의 리전 (균형)
- **PriceClass_100**: 북미/유럽만 (최저 비용)
:::

## 관련 페이지

- [WAF](../network/waf) - CloudFront에 연결된 WAF 규칙 관리
- [VPC](../network/vpc) - 오리진 서버가 위치한 VPC 확인
- [Cost](../monitoring/cost) - CloudFront 비용 분석
