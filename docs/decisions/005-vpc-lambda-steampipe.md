# ADR-005: VPC Lambda for Steampipe SQL Access

## Status
Accepted

## Context
AgentCore Runtime microVM cannot access EC2 localhost:9193 (Steampipe PostgreSQL). Initial steampipe-query Lambda used boto3 keyword fallback (4 APIs only, no real SQL).

## Decision
Deploy steampipe-query and istio-mcp Lambda in VPC with pg8000 (pure Python PostgreSQL driver). Steampipe configured with `--database-listen network`. EC2 SG allows Lambda SG inbound on port 9193.

## Consequences
- Full SQL access to 580+ Steampipe tables
- pg8000 chosen over psycopg2 (native binary incompatible with Lambda)
- Lambda cold start slightly longer (VPC ENI attachment)
- EC2 SG must allow Lambda SG on port 9193
- Steampipe must listen on network (not localhost)
