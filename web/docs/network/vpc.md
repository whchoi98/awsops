---
sidebar_position: 1
title: VPC / Network
description: VPC, Subnet, Security Group, Transit Gateway, ELB, NAT Gateway, Internet Gateway 모니터링
---

import Screenshot from '@site/src/components/Screenshot';

# VPC / Network

AWS 네트워크 인프라를 한눈에 파악할 수 있는 통합 모니터링 페이지입니다.

<Screenshot src="/screenshots/network/vpc.png" alt="VPC" />

## 주요 기능

### 탭 기반 리소스 분류

8개 탭으로 네트워크 리소스를 체계적으로 관리합니다:

| 탭 | 리소스 | 주요 정보 |
|---|--------|----------|
| **VPCs** | Virtual Private Cloud | CIDR, 테넌시, DNS 설정 |
| **Subnets** | 서브넷 | AZ, CIDR, 퍼블릭/프라이빗 |
| **Security Groups** | 보안 그룹 | 인바운드/아웃바운드 규칙 |
| **Route Tables** | 라우팅 테이블 | 라우트, 서브넷 연결 |
| **Transit Gateway** | TGW | VPC 연결, 라우트 테이블 |
| **ELB** | 로드밸런서 | ALB/NLB, 타겟 그룹, 리스너 |
| **NAT** | NAT Gateway | EIP, 연결 상태 |
| **IGW** | Internet Gateway | VPC 연결 |

### 리소스 맵 (Resource Map)

VPC 내 모든 리소스의 관계를 시각적으로 표현합니다:

- **5컬럼 레이아웃**: External (IGW/TGW) → VPCs → Subnets → Compute → NAT
- **상호작용**: 클릭하여 관련 리소스 하이라이트
- **검색**: EC2, Subnet, VPC를 이름/ID/CIDR로 검색

### 상세 패널

리소스 행 클릭 시 슬라이드 패널에서 상세 정보 확인:

- Transit Gateway: 라우트 테이블, 라우트, 연결된 VPC
- Security Group: 인바운드/아웃바운드 규칙 전체 목록
- ELB: 타겟 그룹, 리스너, 헬스체크 설정

## 사용 방법

### 리소스 목록 조회

1. 상단 탭에서 조회할 리소스 유형 선택
2. 테이블에서 리소스 확인
3. 행 클릭으로 상세 정보 패널 열기

### 리소스 맵 활용

1. VPCs 탭에서 **Resource Map** 버튼 클릭
2. 5컬럼 뷰에서 인프라 구조 확인
3. 리소스 클릭으로 연관 관계 하이라이트
4. 검색창으로 특정 리소스 찾기

### Transit Gateway 분석

1. **Transit Gateway** 탭 선택
2. TGW 행 클릭
3. 상세 패널에서:
   - Route Tables: TGW 라우트 테이블 목록
   - Routes: 각 테이블의 라우트 (VPC CIDR → Attachment)
   - Attachments: 연결된 VPC/VPN 목록

## 사용 팁

:::tip 네트워크 문제 해결
AI 어시스턴트에서 네트워크 관련 질문을 하면 **Network Gateway**가 자동으로 활성화됩니다. 17개의 전문 도구를 활용하여:

- **Reachability Analyzer**: 두 엔드포인트 간 연결 경로 분석
- **VPC Flow Logs**: 네트워크 트래픽 패턴 분석
- **Transit Gateway 라우팅**: 멀티 VPC 라우팅 문제 진단
- **Security Group 규칙 검증**: 인바운드/아웃바운드 규칙 분석

예시 질문: "EC2 i-xxx에서 RDS로 연결이 안 됩니다" → Reachability Analyzer 자동 실행
:::

:::info Security Group 규칙 확인
Security Groups 탭에서 행을 클릭하면 인바운드/아웃바운드 규칙을 한눈에 확인할 수 있습니다. 0.0.0.0/0으로 열린 포트는 주황색으로 경고 표시됩니다.
:::

## 관련 페이지

- [Topology](../network/topology) - React Flow 기반 인프라 시각화
- [WAF](../network/waf) - Web Application Firewall 규칙 관리
- [CloudFront](../network/cloudfront) - CDN 배포 관리
- [Security](../security) - Open Security Group 감지
