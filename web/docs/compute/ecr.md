---
sidebar_position: 4
title: ECR
description: ECR 리포지토리, 이미지, 취약점 스캔 정보
---

import Screenshot from '@site/src/components/Screenshot';

# ECR (Elastic Container Registry)

ECR 리포지토리와 이미지 정보를 확인할 수 있는 페이지입니다.

<Screenshot src="/screenshots/compute/ecr.png" alt="ECR" />

## 주요 기능

### 통계 카드
- **Repositories**: 전체 리포지토리 수 (시안)
- **Scan on Push**: 이미지 푸시 시 자동 스캔이 활성화된 리포지토리 수 (녹색)
- **Immutable Tags**: 태그 불변성이 활성화된 리포지토리 수 (보라색)

### 리포지토리 테이블
| 컬럼 | 설명 |
|------|------|
| Repository | 리포지토리 이름 |
| URI | 리포지토리 URI (이미지 푸시/풀 주소) |
| Tag Mutability | 태그 변경 가능 여부 (MUTABLE/IMMUTABLE) |
| Scan | 푸시 시 스캔 활성화 여부 |
| Encryption | 암호화 타입 (AES256/KMS) |
| Created | 생성일 |

### 상세 패널
리포지토리를 클릭하면 상세 정보를 확인할 수 있습니다:
- **Repository 섹션**: Name, URI, ARN, Registry ID, Tag Mutability, Created, Region
- **Tags 섹션**: 리포지토리에 설정된 태그

## 사용 방법

1. 사이드바에서 **Compute > ECR**을 클릭합니다
2. 상단 통계에서 전체 리포지토리 현황을 파악합니다
3. Scan on Push가 비활성화된 리포지토리를 식별합니다
4. 리포지토리를 클릭하여 상세 URI와 설정을 확인합니다

## 보안 설정 가이드

### Scan on Push
- **권장**: 모든 리포지토리에서 활성화
- 이미지 푸시 시 자동으로 취약점 스캔 실행
- 발견된 CVE는 Security 페이지에서 확인 가능

### Immutable Tags
- **권장**: 프로덕션 리포지토리에서 활성화
- 한번 푸시된 태그는 덮어쓸 수 없음
- 배포 추적과 롤백에 유리

### Encryption
- **AES256**: 기본 AWS 관리형 암호화
- **KMS**: 고객 관리형 키 (CMK) 사용 시

## 사용 팁

:::tip Scan on Push 활성화
테이블에서 Scan 컬럼이 "No"인 리포지토리는 취약점 스캔이 비활성화되어 있습니다. 보안을 위해 활성화를 권장합니다.
:::

:::tip 이미지 URI 복사
상세 패널의 URI 필드에서 `docker pull` 또는 `docker push`에 사용할 전체 주소를 확인할 수 있습니다.
:::

:::info AI 분석
AI Assistant에서 "ECR 리포지토리 목록", "스캔 비활성화된 리포지토리 찾아줘", "컨테이너 이미지 취약점 분석해줘" 등으로 분석할 수 있습니다.
:::

## 관련 페이지

- [ECS](../compute/ecs) - ECR 이미지를 사용하는 ECS 서비스
- [EKS](../compute/eks) - ECR 이미지를 사용하는 EKS 클러스터
- [Security](../security) - 이미지 취약점 (CVE) 확인
