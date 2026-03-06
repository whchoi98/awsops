# ADR-003: SCP-Blocked Column Handling

## Status: Accepted

## Context
In AWS Organizations, Service Control Policies block certain API calls (iam:ListMFADevices, lambda:GetFunction). When Steampipe tries to hydrate these columns, the entire query fails.

## Decision
1. Set `ignore_error_codes` in `aws.spc` for table-level errors
2. Remove SCP-blocked columns from list queries (mfa_enabled, tags, attached_policy_arns)
3. Keep blocked columns in detail queries (single-resource, less likely to fail)

## Blocked APIs Found
| Column | API | Table |
|--------|-----|-------|
| mfa_enabled | iam:ListMFADevices | aws_iam_user |
| attached_policy_arns | iam:ListAttachedUserPolicies | aws_iam_user |
| tags (in list) | lambda:GetFunction | aws_lambda_function |

## Consequences
- `ignore_error_codes` in `aws.spc` handles table-level errors
- Column hydrate errors require removing the column from SQL
- Some dashboard cards show 0 for MFA-related metrics
