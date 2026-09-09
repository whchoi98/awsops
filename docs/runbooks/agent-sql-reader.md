# Runbook: `awsops_sql_reader` (에이전트 `execute_sql` / `inventory-read`)

에이전트의 read-only SQL 경계는 **DB 롤**이며 어휘 가드가 아니다. 마이그레이션
`01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql` 이 `awsops_sql_reader` 를 만든다
(`NOSUPERUSER … NOBYPASSRLS`, `default_transaction_read_only = on`, `sql_reader` 스키마의 뷰에만
SELECT). RDS Data API 는 Secrets Manager 시크릿을 요구하므로(그 경로에 IAM DB auth 가 없다) 이 롤만
비밀번호를 갖는다 — Terraform 이 생성하고 `scripts/v2/migrate.mjs` 의 `syncSqlReaderPassword` 가 DB
롤을 그 시크릿으로 수렴시킨다.

The agent's read-only SQL boundary is a **DB role**, not a lexical guard: migration
`01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql` creates `awsops_sql_reader`
(`NOSUPERUSER … NOBYPASSRLS`, `default_transaction_read_only = on`, SELECT only on the
`sql_reader` schema's views). The RDS Data API needs a Secrets Manager secret (there is no
IAM DB auth on that path), so this one role has a password — Terraform generates it and
`syncSqlReaderPassword` in `scripts/v2/migrate.mjs` converges the DB role onto the secret.

## 실행 순서 — `make migrate` 필수, 빠뜨리기 쉽다 / Enable order — `make migrate` is required, and easy to miss

```
terraform -chdir=terraform/v2/foundation apply tfplan   # reader 시크릿 생성 / creates the reader secret
make migrate                                            # 롤 생성 + 비밀번호 동기화 / creates the ROLE + syncs its password
make agentcore                                          # 게이트웨이/타겟 프로비저닝 / provisions the gateways/targets
```

`make agentcore` 는 마이그레이션을 **실행하지 않고** 비밀번호도 **동기화하지 않는다**. 공개된 실행
흐름이 `apply → make agentcore` 라서 `make migrate` 누락이 흔한 실수이고, 실패 양상이 "마이그레이션
누락" 처럼 보이지 않는다:

`make agentcore` does **not** run migrations and does **not** sync the password. The published
enable flow is `apply → make agentcore`, so skipping `make migrate` is the expected mistake, and
the failure does not look like a missing migration:

| 증상 / Symptom | 원인 / Cause |
|---|---|
| `execute_sql`·`inventory-read` 가 Data API **auth** 오류 / fail with a Data API **auth** error | 롤 부재 또는 비밀번호 ≠ 시크릿 / role absent, or its password ≠ the secret |
| `migrate` 로그에 `sql-reader: role not present yet — skipping password sync` | 롤 생성 마이그레이션 전에 실행됨 / ran before the role-creating migration |

두 도구만 실패한다. 나머지 rds-mcp 도구(`describe_*`, `list_*`)는 reader 시크릿이 아니라 실행
역할을 쓰므로 계속 동작한다 — 그 비대칭이 판별 단서다.

Both tools fail; the other rds-mcp tools (`describe_*`, `list_*`) keep working because they use
the execution role, not the reader secret. That asymmetry is the tell.

## 복구 / Recovery

두 증상의 조치가 **다르다** — 이전 리비전은 둘 다에 `make migrate` 를 권했지만 두 번째는 그것으로
고쳐지지 않는다(PR #197 리뷰 MAJOR).

The two symptoms have **different** fixes — an earlier version of this runbook offered
`make migrate` for both, which cannot fix the second one (PR #197 review MAJOR).

### 비밀번호 불일치 → `make migrate` / Password mismatch → `make migrate`

`syncSqlReaderPassword` 는 pending 마이그레이션 유무와 무관하게 **매 실행마다** 돌므로 진짜로
멱등하다.

`syncSqlReaderPassword` runs on **every** invocation, independently of whether any migration is
pending, so this is genuinely idempotent:

```
make migrate            # ALTER ROLE awsops_sql_reader WITH PASSWORD <secret>
```

**시크릿을 바꾸는 모든 작업 후**에 실행한다 / Do this after **anything that changes the secret**:

- Terraform 이 `agent_sql_reader_secret_arn` 을 재생성/회전 / Terraform regenerates or rotates it
- 시크릿을 백업에서 복원 / the secret is restored from a backup
- 롤 비밀번호를 손으로 변경 / the role's password was changed by hand

### 롤 부재 → 마이그레이션 적용 여부에 따라 다르다 / Role absent → depends on whether the migration already applied

`migrate.mjs` 는 **pending** 마이그레이션만 실행하고 적용된 것에는 checksum 불변성을 강제하므로,
이미 기록된 마이그레이션의 롤은 재실행으로 **다시 만들어지지 않는다** — 동기화 단계가
`role not present yet — skipping password sync` 를 다시 로그할 뿐이어서 실패가 아니라 no-op 처럼
읽힌다.

`migrate.mjs` runs only **pending** migrations and enforces checksum immutability on applied ones, so
re-running it will NOT recreate a role whose migration is already recorded — the sync step just logs
`role not present yet — skipping password sync` again, which reads like a no-op rather than the
failure it is.

```
DRY_RUN=1 make migrate  # 01KYVY9J…_agent_sql_reader_role 이 LIVE DB 기준으로 아직 pending 인가?
```

`make migrate-status` 가 아니다(PR #197 리뷰 MAJOR) — 그 타겟은 명시적으로 오프라인이며
(`Makefile`: "no DB connect"), 디스크의 마이그레이션 파일과 앱 버전만 비교한다. **이 환경의**
데이터베이스에 실제로 적용됐는지는 답할 수 없고, 그것이 이 단계가 필요한 질문이다.
`DRY_RUN=1 make migrate` 는 접속해서 live `schema_migrations` 원장과 비교하며 아무것도 실행하지
않는다.

Not `make migrate-status` (PR #197 review MAJOR) — that target is explicitly offline (`Makefile`: "no DB
connect"; it only compares the app version to migration files on disk). It cannot tell you whether a
migration was actually applied to THIS environment's database, which is exactly the question this
step needs answered. `DRY_RUN=1 make migrate` connects and diffs against the live
`schema_migrations` ledger without executing anything.

- **아직 pending**(새 환경, 또는 마이그레이션 미실행): `make migrate` 가 적용하며 롤을 만든다. 끝.
  **Still pending** (fresh environment, or migrations never ran): `make migrate` applies it and
  creates the role. Done.
- **이미 적용됨**인데 롤이 없다(손으로 DROP, 또는 그 이전 스냅샷에서 복원): 기록된 checksum 때문에
  그 파일은 재실행 불가다. 롤·`sql_reader` 뷰·grant 를 다시 만드는 **신규 repair 마이그레이션**을
  추가한다 — DDL 은 `01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql` 에서 복사하면 된다(재실행
  가능하게 작성돼 있다: 롤은 `IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'awsops_sql_reader')`
  로 가드된 `DO` 블록 안에서 만들고 — Postgres 에 `CREATE ROLE IF NOT EXISTS` 는 없다 — 모든 속성을
  `ALTER ROLE` 로 명시하며, 각 뷰는 `CREATE` 앞에 `DROP VIEW IF EXISTS` 한다). 그 다음 `make migrate`.
  **원본 파일은 수정하지 않는다**: `migrate.mjs` 가 checksum drift 로 거부하고, 다른 모든 환경의
  이력까지 바꾸게 된다.
  **Already applied** but the role is gone (dropped by hand, restored from a snapshot predating it):
  the recorded checksum makes that file un-runnable. Add a **new repair migration** that recreates
  the role, its `sql_reader` views and the grants — copy the DDL from
  `01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql`, which is written to be re-runnable (the role
  is created inside a `DO` block guarded by `IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname =
  'awsops_sql_reader')` — Postgres has no `CREATE ROLE IF NOT EXISTS` — every attribute is then stated
  explicitly by `ALTER ROLE`, and each view is `DROP VIEW IF EXISTS`-ed before `CREATE`) — then
  `make migrate`. Do not edit the original file: `migrate.mjs` will refuse on checksum drift, and
  editing it would also change history for every other environment.

회전 시 자동 수렴 훅은 **의도적으로 없다**. Terraform 쪽 비밀번호 변경과 다음 `make migrate` 사이의
창은 알려진 갭이며, 없애기보다 수용했다 — 닫으려면 Aurora 에 `ALTER ROLE` 권한을 가진 회전 트리거
Lambda 가 필요하고, 그것이 막으려는 실패(멱등 명령 한 번 돌 때까지 read-only 도구 2개가 오류)보다 큰
변경이다.

There is deliberately **no** automatic converge-on-rotation hook. The window between a
Terraform-side password change and the next `make migrate` is a known gap, accepted rather than
engineered away — closing it would need a rotation-triggered Lambda with `ALTER ROLE` rights on
Aurora, which is a larger change than the failure it prevents (two read-only tools erroring until
one idempotent command runs).

## 확인 / Verify

```
make migrate            # 기대: "sql-reader: password synced from Secrets Manager"
```

그 다음 에이전트로 `execute_sql`(예: `SELECT 1`)을 호출한다. foundation 클러스터나 미설정 env 를
지목하는 `400` 은 인증 오류가 아니라 설정 오류다 — `agent/lambda/aws_rds_mcp.py` 참조. 호스트 자신의
foundation Aurora 클러스터만 도달 가능하고, cross-account 와 호출자가 준
`secret_arn`/`database` 는 fail-closed 다.

Then invoke `execute_sql` (e.g. `SELECT 1`) through the agent. A `400` naming the foundation
cluster or an unset env var is a configuration error, not an auth error — see
`agent/lambda/aws_rds_mcp.py`. Only the host's own foundation Aurora cluster is reachable;
cross-account and caller-supplied `secret_arn`/`database` are fail-closed.

## 실제 Postgres 17 로 검증함 / Verified against a real Postgres 17

마이그레이션과 투영을 `postgres:17-alpine` 에서 **실행**했다(2026-08-03) — 읽어본 것이 아니다.
`agent/lambda/test_inventory_view_contract.py` 의 계약 테스트는 마이그레이션 **텍스트**를 매칭하므로
SQL 이 파싱되는지는 알려주지 못하며, 그래서 리뷰 중 파싱을 깨는 버그가 두 번 실려나갔다(이스케이프
안 된 인용부호, 그 다음 감싸는 DO 블록을 닫아버린 태그 없는 dollar delimiter).

The migration and its projections were executed on `postgres:17-alpine` (2026-08-03), not just
inspected — the contract test in `agent/lambda/test_inventory_view_contract.py` matches migration
TEXT and cannot tell you whether the SQL parses, which is how two separate parse-breaking bugs
shipped during review (an unescaped quote, then an untagged dollar delimiter closing the enclosing
DO block).

`data/schema.sql` + 37 개 ULID 마이그레이션을 순서대로 적용했다. 롤 마이그레이션 3 개와 이 파일은 RDS
가 제공하는 롤(`rds_iam`, `awsops_admin`)을 필요로 하므로 vanilla 서버에서는 먼저 만들어야 한다. 그
다음 `awsops_sql_reader` 로:

Applied `data/schema.sql` + all 37 ULID migrations in order. Three role migrations plus this one need
roles RDS provides (`rds_iam`, `awsops_admin`); create them first on a vanilla server. Then, as
`awsops_sql_reader`:

| 검사 / Check | 결과 / Result |
|---|---|
| `SELECT ... FROM public.inventory_resources` | `ERROR: permission denied for table` |
| `UPDATE sql_reader.inventory_resources` | `ERROR: permission denied for view` |
| `SELECT task_token FROM sql_reader.worker_jobs` | `ERROR: column "task_token" does not exist` |
| CloudFront `data` 투영 / projection | `{"id","aliases","enabled","origins":[{"DomainName":...}]}` — `CustomHeaders` 값 부재, `cache_behaviors` 부재 / value absent, absent |
| `topology_nodes.meta` 투영 / projection | `{"invType":...}` — `row` 아래 전체 행 복사본 부재 / the whole-row copy under `row` absent |

origins 케이스는 그 투영을 수정할 때마다 다시 돌려볼 값어치가 있다: `DomainName` 은 유지해야 하고
("CloudFront (empty origin)" finding 이 그것을 읽는다) `CustomHeaders[].HeaderValue`(origin secret)는
빠져야 한다. 리뷰 중 **양쪽 다** 틀린 적이 있다.

The origins case is the one worth re-running after any edit to that projection: it must keep
`DomainName` (the "CloudFront (empty origin)" finding reads it) while dropping
`CustomHeaders[].HeaderValue` (an origin secret). Both halves failed at some point during review.

## 관련 / Related

- `terraform/v2/foundation/migrations/01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql` — 롤 + 뷰 / role + views
- `scripts/v2/migrate.mjs` (`syncSqlReaderPassword`) — 동기화 / the sync
- `docs/decisions/004-agentcore-gateways-runtime.md` §7 — `execute_sql` 보안 모델 / security model
