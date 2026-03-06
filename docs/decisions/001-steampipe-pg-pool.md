# ADR-001: Steampipe pg Pool over CLI

## Status: Accepted

## Context
Steampipe can be accessed via CLI (`steampipe query "SQL"`) or PostgreSQL protocol (pg Pool to port 9193).

## Decision
Use pg Pool direct connection instead of CLI.

## Reason
- CLI: ~4 seconds per query (process spawn overhead, shell escaping issues)
- pg Pool: ~0.006 seconds per query (660x faster)
- CLI has shell injection risks with `$` characters in SQL (K8s jsonb queries)
- pg Pool allows connection pooling (max:3) and statement timeouts (120s)

## Consequences
- Steampipe must run as service: `steampipe service start --database-port 9193`
- Password sync needed: `scripts/02-setup-nextjs.sh` auto-syncs password to `steampipe.ts`
- No separate PostgreSQL installation needed (Steampipe embeds PostgreSQL)
