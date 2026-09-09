# Lambda 모듈 / Lambda Module

## 역할 / Role
AgentCore 게이트웨이 MCP 도구용 Lambda 함수 + 공유 모듈. 각 Lambda는 특정 AWS 서비스 작업을 구현.
(Lambda functions + shared modules for AgentCore Gateway MCP tools. +3 v2 read-only sources added
2026-06-18: core_helpers / reachability_read / istio_read — see the per-gateway lists below.)

## 주요 파일 / Key Files
- `create_targets.py` — 8개 게이트웨이에 걸쳐 20개 게이트웨이 타겟 생성 (Creates all 20 Gateway Targets across 8 Gateways, Python/boto3)
- `cross_account.py` — 크로스 어카운트 STS AssumeRole 헬퍼 (credential 캐싱 50분, ExternalId, 감사 로그) (Cross-account credential helper with caching, audit logging)

### Network Gateway (17 v1 + reachability-read 1 = 18)
- `network_mcp.py` — VPC, TGW, VPN, ENI, Network Firewall (15 tools)
- `reachability.py` — Reachability Analyzer (1 tool) — ⚠️ v1, **dark in v2** (creates a network-insights path = mutation)
- `reachability_read_mcp.py` [v2 read-only] — computed ENI↔EC2 connectivity, describe-only, static SG/NACL/route (1 tool: `check_reachability`)
- `flowmonitor.py` — VPC Flow Logs 조회/분석 (1 tool)

### Container Gateway (24 v1 + istio-read 7 = 31)
- `aws_eks_mcp.py` — EKS clusters, CloudWatch, IAM, troubleshooting (9 tools)
- `aws_ecs_mcp.py` — ECS clusters/services/tasks, troubleshooting (3 tools)
- `aws_istio_mcp.py` [VPC] — Istio CRDs via Steampipe K8s tables (12 tools) — ⚠️ v1, **dark in v2** (needs live Steampipe, ADR-037)
- `istio_read_mcp.py` [v2 read-only] — Istio CRDs via the EKS k8s API (presigned-STS token, stdlib urllib/ssl; 7 tools: mesh_overview + 6 CRD lists). Needs an EKS Access Entry for the agent Lambda role — registered out-of-band by the cluster owner via `scripts/v2/eks/register-istio-access.sh` (docs/runbooks/istio-agent-eks-access.md), NOT terraform.

### IaC Gateway (12 tools)
- `aws_iac_mcp.py` — CloudFormation/CDK validation, troubleshooting, docs (7 tools)
- `aws_terraform_mcp.py` — Provider docs, Registry module search (5 tools)

### Data Gateway (24 tools)
- `aws_dynamodb_mcp.py` — Tables, queries, data modeling, costs (6 tools)
- `aws_rds_mcp.py` — RDS/Aurora instances, SQL via Data API (6 tools). **`execute_sql`의 read-only 보장은 DB 롤 권한에 있다** (아래 참조) / **`execute_sql`'s read-only guarantee rests on DB-level role permissions** (see below)
- `aws_valkey_mcp.py` — ElastiCache clusters, replication groups (6 tools)
- `aws_msk_mcp.py` — MSK Kafka clusters, brokers, configs (6 tools)

### Security Gateway (14 tools)
- `aws_iam_mcp.py` — IAM users/roles/groups/policies, simulation (14 tools)

### Monitoring Gateway (24 tools)
- `aws_cloudwatch_mcp.py` — Metrics, alarms, Log Insights (11 tools)
- `aws_cloudtrail_mcp.py` — Event lookup, CloudTrail Lake (5 tools)
- `datasource_diag_mcp.py` — 데이터소스 연결 진단 (Datasource connectivity diagnostics, 8 tools: URL validation, DNS, NLB targets, SG analysis, network path, HTTP connectivity, K8s endpoints, full diagnosis)

### Cost Gateway (14 tools)
- `aws_cost_mcp.py` — Cost Explorer, Pricing, Budgets (9 tools)
- `aws_finops_mcp.py` — Compute Optimizer, RI/SP Recommendations, Cost Optimization Hub, Trusted Advisor (5 tools)

### Ops Gateway (9 v1 + core-helpers 2 = 11)
- `aws_knowledge.py` — AWS Knowledge MCP 프록시 (Proxy to AWS Knowledge MCP, 5 tools)
- `aws_core_mcp.py` — 프롬프트 이해, AWS CLI 실행 (3 tools) — ⚠️ `call_aws` arbitrary-CLI is a mutation vector; **dark in v2**
- `core_helpers_mcp.py` [v2 read-only] — prompt_understanding + suggest_aws_commands only (2 static tools; no `call_aws`)
- `steampipe-query` — Steampipe SQL 쿼리 (1 tool, VPC Lambda)

## 규칙 / Rules
- 게이트웨이 타겟: Python/boto3 사용 필수 — CLI는 inlinePayload 문제 있음
  (Gateway Targets: must use Python/boto3 — CLI has inlinePayload issues)
- 모든 타겟에 `credentialProviderConfigurations: GATEWAY_IAM_ROLE` 필수
  (`credentialProviderConfigurations: GATEWAY_IAM_ROLE` required for all targets)
- VPC Lambda: psycopg2 대신 pg8000 사용 (steampipe-query, istio-mcp)
  (VPC Lambda: pg8000, not psycopg2)
- 모든 Lambda는 읽기 전용 — **v2는 예외 없음** (v1의 "도달성 경로 생성" 쓰기 예외는 v2에서 dark; `reachability_read_mcp.py`가 describe-only로 대체)
  (All Lambda read-only — **no exceptions in v2**; the v1 reachability path-creation write is dark, replaced by describe-only `reachability_read_mcp.py`)
- 도구 스키마 형식: `inlinePayload: [{name, description, inputSchema: {type, properties, required}}]`
  (Tool schema format)

## `execute_sql` — read-only 경계는 DB 롤이다 / the read-only boundary is a DB role

**요약: 어휘 가드(`sql_readonly_guard.py`)는 경계가 아니라 defense-in-depth다.**
(**TL;DR: the lexical guard is defense-in-depth, NOT the boundary.**)

- `aws_rds_mcp.py`의 `execute_sql`과 `inventory_read_mcp.py`는 RDS Data API로 앱 자신의 Aurora에 접속한다.
  자격증명은 **Aurora master secret이 아니라** 전용 최소권한 롤 **`awsops_sql_reader`** secret이다
  (`AURORA_SQL_READER_SECRET_ARN` / `AURORA_SECRET_ARN` env, `ai.tf`가 주입). 호출자가 넘긴 `secret_arn`
  인자는 **무시**되며 도구 스키마에서도 제거됐다 — 자격증명 선택은 서버 설정이지 모델 입력이 아니다.
  env 미설정 시 **fail-closed**(더 높은 권한으로 폴백하지 않음).
- 롤 권한: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
  `CONNECT`(awsops) + `USAGE`(**`sql_reader`**) + **그 스키마 뷰에 대한 `SELECT`만**,
  `default_transaction_read_only=on`, 이 롤에 **부여된** EXECUTE 0건, predefined-role 멤버십 0건.
- **round 10 전환 — 테이블 allowlist → 뷰 전용 grant. 기본값을 뒤집었다.**
  이 롤은 `public`의 **어떤 테이블/컬럼에도 권한이 없다**. 데이터는 전용 `sql_reader` 스키마의
  read-only 뷰로만 노출되며, 각 뷰는 **명시적 컬럼 목록**(`SELECT *` 금지)이다.
  - 왜: round 8 포괄 grant는 `eks_registrations.auth`(k8s bearer token)를 놓쳤고, round 9의 ~38개
    **테이블** allowlist는 `worker_jobs.task_token`을 놓쳤다 — 이건 데이터가 아니라 **capability**다
    (Step Functions task token 보유자는 실행 중인 워크플로를 `SendTaskSuccess/Failure`로 조작할 수 있다).
    테이블 단위 allowlist는 **컬럼 단위로 fail-open**이라 같은 실패가 두 번 반복됐다.
  - **JSONB 블롭은 named-key 투영으로만 노출된다** (`inventory_resources.data`, `topology_nodes.meta`).
    컬럼 목록에 raw JSONB를 넣으면 **JSON 키 단위로 다시 fail-open**이고, `data`엔 CloudFront origin
    CustomHeaders(origin secret)가, `meta.row`엔 **원본 행 전체 복사본**이 들어 있다. 반대로 컬럼을
    그냥 **지우면 커넥터가 런타임에 깨진다**(PR #197 리뷰 CRITICAL — `find_unused_resources`/
    `query_inventory`/`get_topology` 전멸). 그래서 allowlist 투영이며, `data` allowlist는
    `inventory_read_mcp.PROJECTIONS`의 superset이어야 한다 —
    `agent/lambda/test_inventory_view_contract.py`가 드리프트를 실패로 만든다.
  - 효과: base table에 컬럼이 추가돼도 누군가 뷰에 넣기 전까지 **보이지 않는다**
    (조용한 노출 → 조용한 부재. 모델 호출 도구에는 이게 올바른 방향).
  - `search_path = sql_reader, pg_catalog` → 모델이 쓴 미수식 `FROM worker_jobs`는 뷰로 해석된다.
    `public.worker_jobs`를 명시하면 **거부**(grant 없음). search_path와 `default_transaction_read_only`는
    롤이 스스로 바꿀 수 있으므로 편의일 뿐, 경계는 **grant**다.
  - 원리: 뷰 소유자는 마이그레이션 롤(master user)이고 `security_invoker = false`(기본값)이라
    뷰 본문이 **소유자 권한**으로 실행된다 → base table 권한 0인 롤이 뷰를 읽을 수 있다.
  - **뷰에 컬럼/뷰를 추가하는 것은 security-relevant 변경이며 리뷰 대상.** `public`에는 절대 grant 금지.
  → `terraform/v2/foundation/migrations/01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql`
- 자격증명이 host 계정 + **단일 클러스터** 전용이므로 `execute_sql`은 **cross-account 미지원**(다른 계정
  target이면 fail-closed 400)이고, 같은 계정이라도 **foundation 클러스터가 아니면 fail-closed 400**
  (`AURORA_CLUSTER_ARN` 비교 — round 10 MAJOR: 예전엔 Data API가 던진 예외가 unhandled 500 + 스택트레이스로
  나갔다). 나머지 rds-mcp 도구의 cross-account 경로는 그대로.
- agent Lambda IAM 롤에는 master secret `GetSecretValue`가 **없다**(`ai.tf` `agent_lambda_inventory`).
  어휘 가드를 우회해도 **권한 없는 세션**에 도달할 뿐이다.
- **왜**: PR #197 리뷰 3~7라운드가 매번 새 우회를 찾았다. 원인은 denylist가 열거할 수 없는 부류 —
  SQL을 *문자열 인자*로 받아 실행하는 코어 함수(`query_to_xml('SELECT pg_cancel_backend(...)')`)는
  가드가 문자열 리터럴을 매칭 전에 제거하므로 보이지 않고, `SET TRANSACTION READ ONLY`는 데이터 쓰기만
  막아 control-plane 호출을 허용한다.
- **그러므로 이 파일들에 DANGER 항목을 더 추가해 "완전"하게 만들려 하지 말 것.** 새 어휘 구멍은
  권한상승이 아니다(ClickHouse 커넥터는 아직 DB-롤 경계가 없어 그쪽에선 가드가 여전히 1차 방어다).

(English) `execute_sql` / `inventory-read` authenticate as the dedicated `awsops_sql_reader` role
(NOSUPERUSER, `default_transaction_read_only=on`, no EXECUTE granted, no predefined-role membership)
via its own secret. **Round 10 inverted the default: the role gets SELECT on read-only VIEWS in a
dedicated `sql_reader` schema and holds NO privilege on any table or column in `public`.** Each view
lists its columns explicitly (never `SELECT *`). Why: round 8's blanket grant missed
`eks_registrations.auth` and round 9's ~38-table allowlist missed `worker_jobs.task_token` — a Step
Functions task token, i.e. a transferable *capability*, not just data. A table-level allowlist
**fails open per column**, so the same failure recurred. With views, a new base-table column is
invisible until someone adds it to a view: silently absent instead of silently exposed, which is the
right direction for a model-invocable tool. `search_path = sql_reader, pg_catalog` makes an
unqualified `FROM worker_jobs` resolve to the view; `public.worker_jobs` is denied. The mechanism is
`security_invoker = false` (the default) plus migration-role ownership, so the view body runs with the
owner's rights. **Adding a column or a view here is a security-relevant change requiring review; never
grant this role anything in `public`.** The caller-supplied `secret_arn` is ignored and gone from the
tool schema; an unset env fails closed. `execute_sql` is host-account AND single-cluster only —
another account fails closed, and so does any `resource_arn` that isn't the foundation cluster
(`AURORA_CLUSTER_ARN`; round 10 MAJOR, previously an unhandled 500). The agent Lambda role still has
no read access to the Aurora master secret, so a lexical-guard bypass lands in an unprivileged
session. Do not grow the DANGER denylist hoping to make it exhaustive — "functions that execute a
string" is unbounded. The ClickHouse connector has no equivalent DB-role boundary yet, so there the
guard is still primary (a backslash-escape hardening idea for it is noted as a follow-up, out of
scope for this PR). Detail: ADR-004 §7 amendment (2026-07-31).
