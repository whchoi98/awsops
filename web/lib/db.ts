import { Pool, types as pgTypes } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

let pool: Pool | null = null;

// node-pg hands int8 (OID 20) back as a STRING, because a bigint can exceed Number.MAX_SAFE_INTEGER.
// Every BIGSERIAL id in this app is typed `number` in TS and treated as one at runtime — and one place
// checked `typeof x === 'number'` on an id that had travelled through a JSON payload, so a "42" made
// the check fail silently and two reports raced onto one job (PR #203 review MAJOR). Our int8 columns
// are surrogate ids and byte counts, none of which come near 2^53, so parsing them as numbers here is
// the honest boundary. Registered once, module-scope: pg's parser registry is global, and doing it
// inside getPool() would leave anything that ran before the first pool call reading strings.
pgTypes.setTypeParser(pgTypes.builtins.INT8, (v) => Number(v));

// Single shared pg Pool for all API routes (Aurora PostgreSQL). Authenticates via RDS IAM DB auth
// (rds-db:connect on the task role) as the dedicated `awsops_web` role, not the Aurora master
// secret — mirrors steampipe.tf's steampipe_reader pattern. The master secret is RDS-managed and
// auto-rotates every 7 days; a long-running task that only reads a valueFrom secret once at
// container start would be left holding a stale password after the next rotation. `password` as a
// function is called by pg per new physical connection, so the signed token is always fresh
// (15-min validity, signed locally — no network call).
export function getPool(): Pool {
  if (!pool) {
    const signer = new Signer({
      hostname: process.env.AURORA_ENDPOINT!,
      port: 5432,
      username: process.env.AURORA_USER || 'awsops_web',
      region: process.env.AWS_REGION || 'ap-northeast-2',
    });
    pool = new Pool({
      host: process.env.AURORA_ENDPOINT,
      port: 5432,
      database: process.env.AURORA_DATABASE || 'awsops',
      user: process.env.AURORA_USER || 'awsops_web',
      password: () => signer.getAuthToken(),
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}
