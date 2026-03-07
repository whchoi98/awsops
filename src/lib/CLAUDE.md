# Lib Module

## Role
Core libraries: Steampipe database connection, SQL query definitions, and shared utilities.

## Key Files
- `steampipe.ts` — pg Pool connection (max 3, 120s timeout), batchQuery, node-cache (5 min TTL)
- `queries/*.ts` — 16 SQL query files (one per AWS/K8s service)

## Rules
- ALL database access goes through `steampipe.ts` `runQuery()` or `batchQuery()`
- Never use Steampipe CLI — pg Pool is 660x faster
- Verify column names against `information_schema.columns` before writing queries
- No `$` in SQL — use `conditions::text LIKE '%..%'` instead of `jsonb_path_exists`
- Avoid SCP-blocked columns in list queries: `mfa_enabled`, `attached_policy_arns`, Lambda `tags`
- See CLAUDE.md root "Steampipe Queries" section for column name gotchas
