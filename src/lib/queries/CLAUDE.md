# Queries Module

## Role
SQL query definitions for Steampipe. Each file exports queries for a specific AWS/K8s service.

## Key Files
16 query files — one per service (ec2, s3, vpc, iam, rds, lambda, ecs, k8s, cost, etc.)

## Rules
- Verify column names against `information_schema.columns` before writing queries
- `versioning_enabled` not `versioning` (S3)
- `class` AS alias not `db_instance_class` (RDS)
- `trivy_scan_vulnerability` not `trivy_vulnerability`
- `"group"` AS alias (ECS, reserved word)
- Avoid in list queries: `mfa_enabled`, `attached_policy_arns`, Lambda `tags` (SCP blocks)
- No `$` in SQL — use `conditions::text LIKE '%..%'` instead of `jsonb_path_exists`
