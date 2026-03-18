# 쿼리 모듈

## 역할
Steampipe용 SQL 쿼리 정의. 각 파일은 특정 AWS/K8s 서비스에 대한 쿼리를 내보냄.

## 주요 파일 (25개)
- `bedrock.ts` — Bedrock 파운데이션 모델 (참고용, 주요 메트릭은 CloudWatch API)
- `ebs.ts` — EBS 볼륨/스냅샷 (암호화, 어태치먼트, 인스턴스 조회)
- `ec2.ts` — EC2 인스턴스
- `msk.ts` — MSK 클러스터 (`provisioned` JSONB에서 Kafka 버전/브로커/암호화 추출)
- `opensearch.ts` — OpenSearch 도메인 (`encryption_at_rest_options`, 클러스터 구성)
- `elasticache.ts` — ElastiCache 클러스터 (Valkey/Redis/Memcached, `cache_nodes` JSONB)
- `vpc.ts` — VPC, Subnet, SG, Route Table, TGW, ELB, NAT, IGW
- `s3.ts` — S3 버킷, 버전 관리, 퍼블릭 접근
- `rds.ts` — RDS/Aurora 인스턴스
- `lambda.ts` — Lambda 함수
- `ecs.ts` — ECS 클러스터/서비스/태스크
- `ecr.ts` — ECR 리포지토리/이미지
- `k8s.ts` — K8s 노드/Pod/Deployment/Service
- `iam.ts` — IAM 사용자/역할/정책
- `dynamodb.ts` — DynamoDB 테이블
- `cloudwatch.ts` — CloudWatch 알람
- `cloudtrail.ts` — CloudTrail 이벤트
- `cloudfront.ts` — CloudFront 배포
- `waf.ts` — WAF Web ACL/규칙
- `cost.ts` — Cost Explorer 비용/사용량
- `security.ts` — 보안 점검 (Public S3, Open SG, Unencrypted EBS, CVE)
- `metrics.ts` — CloudWatch 메트릭 데이터 (모니터링 페이지)
- `relationships.ts` — 리소스 관계 (토폴로지 그래프)
- `container-cost.ts` — ECS 컨테이너 비용 (Task 메타데이터, 서비스 요약)
- `eks-container-cost.ts` — EKS 컨테이너 비용 (Pod 리소스 요청, 노드 용량)

## 규칙
- 쿼리 작성 전 `information_schema.columns`로 컬럼명 확인
- JSONB 중첩 주의: MSK `provisioned`, OpenSearch `encryption_at_rest_options`, ElastiCache `cache_nodes`
- `versioning_enabled` (S3), `class` AS alias (RDS), `"group"` (ECS 예약어)
- 목록 쿼리에서 SCP 차단 컬럼 사용 금지
- SQL에서 `$` 사용 금지

---

# Queries Module (English)

## Role
SQL query definitions for Steampipe. Each file exports queries for a specific AWS/K8s service.

## Key Files (25)
- `bedrock.ts` — Bedrock foundation models (reference only, main metrics via CloudWatch API)
- `ebs.ts` — EBS volumes/snapshots (encryption, attachments, instance lookup)
- `ec2.ts` — EC2 instances
- `msk.ts` — MSK clusters (extract Kafka version/brokers/encryption from `provisioned` JSONB)
- `opensearch.ts` — OpenSearch domains (`encryption_at_rest_options`, cluster config)
- `elasticache.ts` — ElastiCache clusters (Valkey/Redis/Memcached, `cache_nodes` JSONB)
- `vpc.ts` — VPC, Subnet, SG, Route Table, TGW, ELB, NAT, IGW
- `s3.ts` — S3 buckets, versioning, public access
- `rds.ts` — RDS/Aurora instances
- `lambda.ts` — Lambda functions
- `ecs.ts` — ECS clusters/services/tasks
- `ecr.ts` — ECR repositories/images
- `k8s.ts` — K8s nodes/pods/deployments/services
- `iam.ts` — IAM users/roles/policies
- `dynamodb.ts` — DynamoDB tables
- `cloudwatch.ts` — CloudWatch alarms
- `cloudtrail.ts` — CloudTrail events
- `cloudfront.ts` — CloudFront distributions
- `waf.ts` — WAF Web ACLs/rules
- `cost.ts` — Cost Explorer cost/usage
- `security.ts` — Security checks (Public S3, Open SGs, Unencrypted EBS, CVE)
- `metrics.ts` — CloudWatch metric data (monitoring page)
- `relationships.ts` — Resource relationships (topology graph)
- `container-cost.ts` — ECS container cost (task metadata, service summary)
- `eks-container-cost.ts` — EKS container cost (pod resource requests, node capacity)

## Rules
- Verify column names via `information_schema.columns` before writing queries
- Watch JSONB nesting: MSK `provisioned`, OpenSearch `encryption_at_rest_options`, ElastiCache `cache_nodes`
- `versioning_enabled` (S3), `class` AS alias (RDS), `"group"` (ECS reserved word)
- Avoid SCP-blocked columns in list queries. No `$` in SQL.
