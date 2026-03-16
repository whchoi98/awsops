# ADR-008: Multi-Account Support via Steampipe search_path

## Status
Accepted

## Context
AWSops Dashboard v1.5.2 was designed for a single AWS account. Organizations need to monitor multiple accounts from a single deployment. The host account runs AWSops and accesses target accounts via Cross-Account IAM Roles (AssumeRole).

## Decision
Use Steampipe's `search_path` switching mechanism for account scoping instead of modifying 22 SQL query files.

### Architecture
- **Host account**: Runs AWSops (EC2 + Steampipe + Next.js)
- **Target accounts**: Accessed via `credential_source = Ec2InstanceMetadata` + `role_arn` in AWS CLI profiles
- **Steampipe**: Per-account connection (`aws_{accountId}`) + aggregator (`aws`) that unions all `aws_*` connections
- **Scoping**: `SET search_path TO public, aws_{accountId}, kubernetes, trivy` before each query batch
- **"All Accounts"**: Default search_path uses aggregator — all data from all accounts

### Key Design Choices
1. **search_path over WHERE filters**: Existing SQL queries work unchanged. No `account_id` filters needed in 22 query files.
2. **Dedicated pg client for scoped queries**: `pool.connect()` → `SET search_path` → query → `RESET` → `release()`. Prevents search_path leakage between pooled connections.
3. **Account-scoped cache keys**: `sp:{accountId}:{sql}` ensures cache isolation between accounts.
4. **Per-account feature flags**: `AccountConfig.features` (costEnabled, eksEnabled, k8sEnabled) controls menu visibility and conditional queries.
5. **Backward compatibility**: If `config.json` has no `accounts` array, all new code paths are skipped — zero behavioral change.

## Consequences
- **Positive**: 22 SQL query files unchanged. 30 pages need only ~5 lines each (import + context + dependency).
- **Positive**: "All Accounts" aggregator view works automatically for most pages.
- **Negative**: `ec2.ts` detail query needed LATERAL JOIN fix (instance_type catalog duplication in aggregator).
- **Negative**: Cost queries in aggregator mode may show duplicated data — mitigated by per-account costEnabled flags.
- **Negative**: CloudWatch metrics APIs need `--profile` parameter for cross-account access.

## Files Changed
- 5 new files: AccountContext, AccountSelector, AccountBadge, cross_account.py, deploy script
- ~50 modified files: steampipe.ts, app-config.ts, 30 pages, 4 API routes, DataTable, Sidebar, CDK, agent.py, 18 Lambda
