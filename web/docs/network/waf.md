---
sidebar_position: 3
title: WAF
description: AWS WAF Web ACL, 규칙 그룹, IP Sets 모니터링
---

import Screenshot from '@site/src/components/Screenshot';

# WAF

AWS Web Application Firewall을 모니터링하고 규칙을 확인하는 페이지입니다.

<Screenshot src="/screenshots/network/waf.png" alt="WAF" />

## 주요 기능

### 요약 통계

상단 카드에서 WAF 리소스 현황을 확인합니다:

| 지표 | 설명 | 색상 |
|------|------|------|
| **Web ACLs** | Web ACL 총 개수 | cyan |
| **Rule Groups** | 규칙 그룹 총 개수 | purple |
| **IP Sets** | IP 집합 총 개수 | orange |

### Web ACL 목록

테이블에서 모든 Web ACL을 확인합니다:

- **Name**: Web ACL 이름
- **ID**: 고유 식별자
- **Scope**: REGIONAL 또는 CLOUDFRONT
- **Capacity**: WCU(Web ACL Capacity Units) 사용량
- **Description**: 설명
- **Region**: 리전 (CLOUDFRONT는 Global)

### 상세 패널

Web ACL 행 클릭 시 상세 정보를 확인합니다:

**Web ACL 섹션**
- Name, ID, ARN
- Scope, Capacity
- Description
- Default Action (Allow/Block)

**Rules 섹션**
- 규칙 이름 및 Priority
- Action (Allow, Block, Count)
- Managed Rule Group 참조

## 사용 방법

### Web ACL 현황 확인

1. WAF 페이지 접속
2. 상단 요약 카드로 전체 리소스 수 파악
3. 테이블에서 Web ACL 목록 확인
4. Scope로 Regional/CloudFront 구분

### Web ACL 규칙 분석

1. 테이블에서 Web ACL 행 클릭
2. 상세 패널에서 Rules 섹션 확인
3. 각 규칙의:
   - **Name**: 규칙 이름
   - **Priority**: 평가 순서 (낮을수록 먼저)
   - **Action**: 매칭 시 동작

### Scope 이해하기

| Scope | 연결 대상 | 리전 |
|-------|----------|------|
| **REGIONAL** | ALB, API Gateway, AppSync | 특정 리전 |
| **CLOUDFRONT** | CloudFront Distribution | us-east-1 (Global) |

## 사용 팁

:::tip AWS Managed Rules 활용
AWS는 다양한 Managed Rule Group을 제공합니다:
- **AWSManagedRulesCommonRuleSet**: OWASP Top 10 대응
- **AWSManagedRulesSQLiRuleSet**: SQL Injection 차단
- **AWSManagedRulesKnownBadInputsRuleSet**: 알려진 악성 입력 차단

Managed Rules는 AWS가 지속적으로 업데이트하므로 수동 관리 부담이 줄어듭니다.
:::

:::info WCU(Web ACL Capacity Units)
각 규칙은 WCU를 소비합니다. Web ACL의 기본 한도는 1,500 WCU입니다. Capacity 값이 높으면 규칙 수를 줄이거나 AWS Support에 한도 증가를 요청하세요.
:::

:::tip Default Action 설정
- **Allow (기본)**: 규칙에 매칭되지 않으면 허용 (명시적 차단 방식)
- **Block (기본)**: 규칙에 매칭되지 않으면 차단 (명시적 허용 방식)

대부분의 경우 **Allow** 기본 설정 + 차단 규칙 추가 방식을 권장합니다.
:::

## 관련 페이지

- [CloudFront](../network/cloudfront) - WAF가 연결된 CDN 배포
- [VPC](../network/vpc) - ALB가 위치한 VPC 확인
- [Compliance](../security/compliance) - WAF 관련 컴플라이언스 체크
