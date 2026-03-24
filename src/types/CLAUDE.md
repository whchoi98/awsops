# 타입 모듈

## 역할
애플리케이션 전반에 걸쳐 공유되는 TypeScript 타입 정의.

## 주요 파일
- `aws.ts` — AWS/K8s 리소스 타입 정의 (EC2, S3, RDS, Lambda, VPC, IAM, ECS, DynamoDB, Cost, K8s, Trivy, 차트/통계 UI 타입)

## 규칙
- 가능한 경우 타입을 해당 도메인과 함께 배치
- 여러 모듈에 걸쳐 사용되는 공유 타입은 이 디렉토리에 배치
- 객체 형태에는 interface, 유니온/기본 타입에는 type alias 사용

---

# Types Module (English)

## Role
TypeScript type definitions shared across the application.

## Key Files
- `aws.ts` — AWS/K8s resource type definitions (EC2, S3, RDS, Lambda, VPC, IAM, ECS, DynamoDB, Cost, K8s, Trivy, chart/stats UI types)

## Rules
- Co-locate types with their domain when possible
- Shared cross-module types go here
- Use interfaces for object shapes, type aliases for unions/primitives
