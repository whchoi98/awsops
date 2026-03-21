---
sidebar_position: 2
title: 네비게이션 가이드
description: AWSops 대시보드 화면 구성 및 네비게이션 방법
---

import Screenshot from '@site/src/components/Screenshot';

# 네비게이션 가이드

AWSops 대시보드는 사이드바 기반 네비게이션을 제공합니다. 35개의 페이지가 6개 그룹으로 구성되어 있어 원하는 정보를 빠르게 찾을 수 있습니다.

<Screenshot src="/screenshots/overview/dashboard.png" alt="AWSops 대시보드 전체 화면 — 사이드바, 헤더, 메인 콘텐츠 영역" />

## 화면 구성

화면은 크게 3개 영역으로 나뉩니다.

### ① 사이드바 (왼쪽)

화면 왼쪽에 고정된 네비게이션 영역입니다.

- **상단**: AWSops 로고 + Sign Out 버튼
- **중앙**: 6개 메뉴 그룹 (Overview, Compute, Network & CDN, Storage & DB, Monitoring, Security)
- **하단**: Cost ON/OFF 토글 + 버전 정보 (v1.6.0)
- 현재 페이지는 왼쪽에 **청록색(cyan) 하이라이트**로 표시됩니다

### ② 헤더 (상단)

각 페이지 상단에 표시되는 영역입니다.

- **페이지 이름**: 현재 보고 있는 페이지 제목
- **새로고침 버튼**: 클릭 시 데이터 새로고침 (캐시 무시)
- **ONLINE 상태**: 서버 연결 상태 표시 (녹색 점 = 정상)

### ③ 메인 콘텐츠 (중앙)

선택한 페이지의 데이터가 표시되는 영역입니다.

- **대시보드**: StatsCard, 경고 현황, 차트
- **서비스 페이지**: 리소스 테이블, 상세 패널, CloudWatch 메트릭

## 메뉴 그룹

### Overview (3개 페이지)

| 메뉴 | 설명 |
|------|------|
| **Dashboard** | 전체 리소스 요약, 20개 StatsCard, 경고 현황 |
| **AI Assistant** | AI 기반 질의응답, 자연어로 인프라 분석 |
| **AgentCore** | AgentCore Runtime/Gateway 상태, 호출 통계 |

### Compute (8개 페이지)

| 메뉴 | 설명 |
|------|------|
| **EC2** | EC2 인스턴스 목록 및 상세 정보 |
| **Lambda** | Lambda 함수, 런타임 분포 |
| **ECS** | ECS 클러스터, 서비스, 태스크 |
| **ECR** | ECR 리포지토리, 이미지 |
| **EKS** | EKS 클러스터 개요, 노드, Pod 요약 |
| **EKS Explorer** | K9s 스타일 터미널 UI |
| **ECS Container Cost** | ECS 워크로드별 비용 분석 |
| **EKS Container Cost** | EKS 워크로드별 비용 분석 |

### Network & CDN (4개 페이지)

| 메뉴 | 설명 |
|------|------|
| **VPC / Network** | VPC, Subnet, Security Group, TGW, NAT |
| **CloudFront** | CloudFront 배포 현황 |
| **WAF** | WAF Web ACL, 규칙 그룹 |
| **Topology** | 인프라 토폴로지 시각화 (React Flow) |

### Storage & DB (7개 페이지)

| 메뉴 | 설명 |
|------|------|
| **EBS** | EBS 볼륨, 스냅샷, 암호화 상태 |
| **S3** | S3 버킷, TreeMap 시각화 |
| **RDS** | RDS 인스턴스, CloudWatch 메트릭 |
| **DynamoDB** | DynamoDB 테이블 |
| **ElastiCache** | ElastiCache 클러스터 (Redis/Memcached) |
| **OpenSearch** | OpenSearch 도메인 |
| **MSK** | MSK Kafka 클러스터 |

### Monitoring (6개 페이지)

| 메뉴 | 설명 |
|------|------|
| **Monitoring** | CPU, Memory, Network, Disk I/O 통합 |
| **CloudWatch** | CloudWatch 알람 현황 |
| **CloudTrail** | CloudTrail 트레일 및 이벤트 |
| **Bedrock** | Bedrock 모델 사용량, 비용, 토큰 모니터링 |
| **Cost** | Cost Explorer, 비용 분석 |
| **Resource Inventory** | 리소스 인벤토리 추이 |

### Security (3개 페이지)

| 메뉴 | 설명 |
|------|------|
| **IAM** | IAM 사용자, 역할, 트러스트 정책 |
| **Security** | 보안 이슈 (Public S3, Open SG, CVE) |
| **CIS Compliance** | CIS Benchmark (v1.5 ~ v4.0) |

## Cost 토글

사이드바 하단의 **Cost: ON/OFF** 버튼으로 비용 관련 기능을 활성화/비활성화할 수 있습니다.

- **ON**: Cost 메뉴 표시, 대시보드에 비용 카드 표시
- **OFF**: Cost 메뉴 숨김 (MSP 환경 등 Cost Explorer 미지원 시)

:::tip Cost Explorer 자동 감지
대시보드는 시작 시 Cost Explorer API 가용성을 자동으로 확인합니다. 사용 불가능한 환경에서는 자동으로 OFF 상태가 됩니다.
:::

## 페이지 이동

### 사이드바에서 이동
원하는 메뉴를 클릭하면 해당 페이지로 이동합니다. 현재 페이지는 왼쪽에 청록색(cyan) 강조 표시됩니다.

### 대시보드 카드에서 이동
대시보드의 각 StatsCard를 클릭하면 해당 서비스의 상세 페이지로 이동합니다.

예시:
- **EC2 카드 클릭** → EC2 페이지로 이동
- **Security Issues 카드 클릭** → Security 페이지로 이동
- **EKS 카드 클릭** → EKS 페이지로 이동

## 데이터 새로고침

### 자동 새로고침
페이지 로드 시 자동으로 최신 데이터를 조회합니다. 데이터는 5분간 캐시됩니다.

### 수동 새로고침
헤더의 새로고침 버튼을 클릭하면 캐시를 무시하고 최신 데이터를 조회합니다.

## 다음 단계

- [AI 어시스턴트 빠른 시작](../getting-started/ai-assistant) - AI 기능 활용하기
- [대시보드 상세](../overview/dashboard) - 대시보드 기능 자세히 알아보기
