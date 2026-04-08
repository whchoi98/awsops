# Code Review

Review all unstaged changes against AWSops project conventions.

## Steps

1. Run `git diff` to see all current changes
2. For each changed file, apply the relevant checklist:

### Query Files (`src/lib/queries/*.ts`)
- Column names verified against `information_schema.columns`
- No SCP-blocked columns: `mfa_enabled`, `tags`, `attached_policy_arns`
- Uses `trivy_scan_vulnerability` not `trivy_vulnerability`
- No `$` in SQL — use `::text LIKE`
- List queries include `account_id` column

### Page Files (`src/app/*/page.tsx`)
- Starts with `'use client'`
- fetch URL uses `/awsops/api/*` prefix
- Components imported as default: `import X from '...'`
- StatsCard color uses name ('cyan') not hex
- Loading skeleton and error states handled

### API Routes (`src/app/api/*/route.ts`)
- Input validation present
- Errors return proper HTTP status codes
- Steampipe queries use `runQuery()` or `batchQuery()`
- No hardcoded secrets

### Components (`src/components/**/*.tsx`)
- Uses `export default`
- Tailwind classes use theme tokens: navy-*, accent-*

3. Report findings with file paths and line numbers
4. Suggest fixes for any violations found
