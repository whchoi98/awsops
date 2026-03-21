---
sidebar_position: 3
title: ECS
description: ECS 클러스터, 서비스, 태스크 모니터링
---

import Screenshot from '@site/src/components/Screenshot';

# ECS (Elastic Container Service)

ECS 클러스터, 서비스, 태스크의 상태를 모니터링할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/ecs.png" alt="ECS" />

## 주요 기능

### 통계 카드
- **Clusters**: 전체 ECS 클러스터 수 (시안)
- **Services**: 전체 서비스 수 (보라색)
- **Tasks**: 실행 중인 태스크 수 (녹색)
- **Container Instances**: EC2 컨테이너 인스턴스 수 (주황색)

### 시각화 차트
- **Running Tasks per Cluster**: 클러스터별 실행 중인 태스크 수 파이 차트

### 클러스터 테이블
| 컬럼 | 설명 |
|------|------|
| Cluster Name | 클러스터 이름 |
| Status | 상태 (ACTIVE, INACTIVE) |
| Running Tasks | 실행 중인 태스크 수 |
| Pending Tasks | 대기 중인 태스크 수 |
| Active Services | 활성 서비스 수 |
| Container Instances | 컨테이너 인스턴스 수 |
| Region | 리전 |

### 서비스 테이블
| 컬럼 | 설명 |
|------|------|
| Service Name | 서비스 이름 |
| Status | 상태 (ACTIVE, DRAINING) |
| Desired | 원하는 태스크 수 |
| Running | 실행 중인 태스크 수 |
| Pending | 대기 중인 태스크 수 |
| Launch Type | 실행 타입 (FARGATE, EC2) |
| Strategy | 스케줄링 전략 |

### 클러스터 상세 패널
클러스터를 클릭하면 상세 정보를 확인할 수 있습니다:
- **Cluster 섹션**: Name, ARN, Status, Tasks, Services, Container Instances
- **Settings 섹션**: 클러스터 설정 (Container Insights 등)
- **Tags 섹션**: 클러스터 태그

## 사용 방법

1. 사이드바에서 **Compute > ECS**를 클릭합니다
2. 상단 통계 카드에서 전체 ECS 현황을 파악합니다
3. Clusters 테이블에서 클러스터별 상태를 확인합니다
4. Services 테이블에서 서비스별 Desired vs Running 태스크를 비교합니다
5. 클러스터를 클릭하여 상세 설정을 확인합니다

## Fargate vs EC2 Launch Type

| 구분 | Fargate | EC2 |
|------|---------|-----|
| 인프라 관리 | 서버리스 (AWS 관리) | 직접 관리 필요 |
| 비용 | vCPU/Memory 기반 | EC2 인스턴스 비용 |
| 스케일링 | 자동 | Auto Scaling 설정 필요 |
| 비용 분석 | Container Cost 페이지 지원 | Phase 2 예정 |

## 사용 팁

:::tip 서비스 상태 확인
Services 테이블에서 Running이 Desired보다 적으면 태스크 배포에 문제가 있을 수 있습니다. 태스크 실패 원인을 확인하세요.
:::

:::tip Pending Tasks 모니터링
Pending Tasks가 오래 유지되면 리소스 부족이나 스케줄링 문제를 의심해 볼 수 있습니다.
:::

:::info AI 분석
AI Assistant에서 "ECS 클러스터 목록", "Fargate 서비스 보여줘", "태스크 배포 실패 원인 분석해줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [ECR](../compute/ecr) - 컨테이너 이미지 레지스트리
- [ECS Container Cost](../compute/ecs-container-cost) - ECS 태스크 비용 분석
- [VPC](../network/vpc) - ECS 네트워크 구성
