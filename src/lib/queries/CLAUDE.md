# 쿼리 모듈 / Queries Module

## 역할 / Role
Steampipe용 SQL 쿼리 정의. 각 파일은 특정 AWS/K8s 서비스에 대한 쿼리를 내보냄.
(SQL query definitions for Steampipe. Each file exports queries for a specific AWS/K8s service.)

## 주요 파일 (20 query files) / Key Files
- `ebs.ts` — EBS 볼륨/스냅샷 (Volumes, snapshots, attachments, encryption)
- `ec2.ts` — EC2 인스턴스 (Instances)
- `vpc.ts` — VPC, Subnet, SG, Route Table, TGW, ELB, NAT, IGW
- `s3.ts` — S3 버킷, 버전 관리, 퍼블릭 접근 (Buckets, versioning, public access)
- `rds.ts` — RDS/Aurora 인스턴스 (Instances)
- `lambda.ts` — Lambda 함수 (Functions)
- `ecs.ts` — ECS 클러스터/서비스/태스크 (Clusters, services, tasks)
- `ecr.ts` — ECR 리포지토리/이미지 (Repositories, images)
- `k8s.ts` — K8s 노드/Pod/Deployment/Service (Nodes, pods, deployments, services)
- `iam.ts` — IAM 사용자/역할/정책 (Users, roles, policies)
- `dynamodb.ts` — DynamoDB 테이블 (Tables)
- `elasticache.ts` — ElastiCache 클러스터 (Clusters)
- `cloudwatch.ts` — CloudWatch 알람 (Alarms)
- `cloudtrail.ts` — CloudTrail 이벤트 (Events)
- `cloudfront.ts` — CloudFront 배포 (Distributions)
- `waf.ts` — WAF Web ACL/규칙 (Web ACLs, rules)
- `cost.ts` — Cost Explorer 비용/사용량 (Cost and usage)
- `security.ts` — 보안 점검 (Security checks: public S3, open SGs, unencrypted EBS, CVE)
- `metrics.ts` — CloudWatch 메트릭 데이터 (Metric data for monitoring page)
- `relationships.ts` — 리소스 관계 (Resource relationships for topology graph)

## 규칙 / Rules
- 쿼리 작성 전 `information_schema.columns`로 컬럼명 확인
  (Verify column names against `information_schema.columns` before writing queries)
- `versioning_enabled` not `versioning` (S3)
- `class` AS alias not `db_instance_class` (RDS)
- `trivy_scan_vulnerability` not `trivy_vulnerability`
- `"group"` AS alias (ECS 예약어 / ECS reserved word)
- 목록 쿼리에서 사용 금지: `mfa_enabled`, `attached_policy_arns`, Lambda `tags` — SCP 차단
  (Avoid in list queries — SCP blocks)
- SQL에서 `$` 사용 금지 — `jsonb_path_exists` 대신 `conditions::text LIKE '%..%'` 사용
  (No `$` in SQL — use `conditions::text LIKE '%..%'` instead of `jsonb_path_exists`)
