# ADR-008: Multi-Account Support / 멀티 어카운트 지원

## Status: Accepted / 상태: 승인됨

## Context / 컨텍스트

AWSops runs on a single EC2 instance and monitors one AWS account via Steampipe.
Organizations managing multiple AWS accounts need a unified dashboard view without deploying
separate AWSops instances per account.

AWSops는 단일 EC2에서 실행되며 Steampipe를 통해 하나의 AWS 계정을 모니터링한다.
여러 AWS 계정을 관리하는 조직은 계정별 별도 인스턴스 배포 없이 통합 대시보드 뷰가 필요하다.

Key requirements:
- Zero-downtime addition of new accounts
- Per-account and aggregated views in the same dashboard
- No code changes when adding/removing accounts (config-only)
- Backwards compatible: single-account deployments work unchanged

## Decision / 결정

### Architecture: Steampipe Aggregator Pattern

Use Steampipe's aggregator connection type to merge multiple AWS connections:

```
connection "aws" {
  plugin      = "aws"
  type        = "aggregator"
  connections = ["aws_111111111111", "aws_222222222222"]
}

connection "aws_111111111111" {
  plugin  = "aws"
  regions = ["ap-northeast-2"]
}

connection "aws_222222222222" {
  plugin                  = "aws"
  regions                 = ["ap-northeast-2"]
  assume_role_arn         = "arn:aws:iam::222222222222:role/AWSopsReadOnlyRole"
  assume_role_external_id = "awsops-steampipe"
}
```

### Data Layer (`src/lib/`)

- `app-config.ts`: `AccountConfig[]` array in `data/config.json` with `accountId`, `alias`, `connectionName`, `region`, `isHost`, `features`
- `steampipe.ts`: `buildSearchPath(accountId)` generates `public, aws_{id}, kubernetes, trivy` for per-account queries
- Cache keys are prefixed with `accountId` to prevent cross-account data leaks
- Cost queries: `runCostQueriesPerAccount()` executes per-account with `search_path` switching, then merges results with `account_id` tag

### Frontend

- `AccountContext` (React Context): stores selected account, provides `useAccountContext()` hook
- Account Selector in Sidebar: dropdown with "All Accounts" option
- `DataTable` auto-prepends an "Account" column with `AccountBadge` when `isMultiAccount && data[0].account_id` exists
- All 32 steampipe-using pages pass `accountId: currentAccountId` through fetch calls
- 23 of 25 SQL query files include `account_id` in SELECT (except `cost.ts` which is tagged programmatically, and `eks-container-cost.ts` which uses Kubernetes tables without account_id)

### API Layer

- `POST /api/steampipe`: `accountId` in request body, passed to `batchQuery(queries, { accountId })`
- `GET` APIs (container-cost, eks-container-cost, inventory): `accountId` as query parameter
- `POST /api/ai`: `accountId` forwarded to AI routing for account-scoped analysis

### Cross-Account Access

- Target accounts: CloudFormation template (`infra-cdk/cfn-target-account-role.yaml`) deploys `AWSopsReadOnlyRole` with `ReadOnlyAccess`
- Trust policy: host account ID + optional external ID (prevents confused deputy when configured)
- Setup script: `scripts/12-setup-multi-account.sh` manages account lifecycle (init/add/remove/apply/verify)

### AI Integration

- `agent/agent.py`: receives `account_context` with account_id and alias
- All 19 Lambda tools: accept optional `account_id` parameter for account-scoped operations
- Gateway tools: pass account context for cross-account troubleshooting

## Rationale / 근거

- **Steampipe aggregator** over multiple Steampipe instances: single pg Pool, simpler architecture, built-in support
- **search_path** over dynamic SQL: no query string modification needed, transparent to existing queries
- **Config-only approach** over environment variables: enables runtime account management, no restart needed
- **Account column in DataTable** auto-detection over manual: reduces per-page boilerplate
- **CloudFormation template** over manual IAM: reproducible, auditable, easy to deploy/update
- **External ID** for AssumeRole: optional but recommended AWS best practice to prevent confused deputy attacks
- **Per-account cache keys**: prevents stale data from one account showing up under another

## Security Considerations / 보안 고려 사항

### Write Permissions in ReadOnly Role
The `AWSopsReadOnlyRole` (deployed via `cfn-target-account-role.yaml`) extends `ReadOnlyAccess` with a few write-capable actions required for network reachability analysis (`ec2:CreateNetworkInsightsPath`, `ec2:StartNetworkInsightsAnalysis`, and their corresponding delete actions) and IAM policy simulation (`iam:SimulatePrincipalPolicy`, `iam:SimulateCustomPolicy`). These are scoped to `Resource: '*'` but limited to non-destructive analytical operations. Organizations with strict compliance requirements should review and potentially remove the `ReachabilityAnalysis` statement.

### Credential Caching in cross_account.py
`cross_account.py` caches STS temporary credentials in-memory with a 50-minute TTL (within the 1-hour session duration). The cache is bounded to a maximum of 50 entries with LRU-style eviction (oldest timestamp evicted first) to prevent unbounded memory growth in multi-account environments. Cached credentials are never written to disk.

### ExternalId as Optional Defense
ExternalId is an optional confused-deputy mitigation for STS AssumeRole. It is controlled via the `AWSOPS_EXTERNAL_ID` environment variable (empty by default). When set, it is included in both the CloudFormation trust policy condition and the Lambda `sts:AssumeRole` calls. When left empty, the CFN template uses `AWS::NoValue` to omit the condition entirely, and Lambda calls omit the `ExternalId` parameter. Organizations operating in shared-service or MSP models should set a unique ExternalId value.

### Configurable Role Name
The IAM role name was previously hardcoded as `AWSopsReadOnlyRole` across all 15 Lambda files. It is now configurable via the `AWSOPS_ROLE_NAME` environment variable (default: `AWSopsReadOnlyRole`). The `get_role_arn(account_id)` function in `cross_account.py` centralizes role ARN construction, eliminating scattered hardcoded strings and enabling organizations to use custom role naming conventions.

## Consequences / 결과

### Positive
- Single deployment monitors unlimited AWS accounts
- Adding a new account: deploy CFN + run setup script + no code changes
- UI shows clean per-account and aggregated views
- Cost queries are per-account aware (handles MSP accounts where Cost Explorer is blocked)
- Backwards compatible: single-account deployments see no UI changes

### Negative / Trade-offs
- Aggregator queries are slower (~N accounts x single-account time)
- Steampipe restart required when adding/removing accounts (`12-setup-multi-account.sh apply`)
- Kubernetes/Trivy tables don't support multi-account (EKS cluster is per-host-account)
- Cache memory increases linearly with account count (mitigated by 5min TTL)
- Cost queries in "All Accounts" mode execute sequentially per account (mitigated by async parallel execution)
