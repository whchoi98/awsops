# ADR-004: AgentCore 게이트웨이 · 런타임 (섹션 에이전트 + Memory + Code Interpreter) / AgentCore Gateways · Runtime (section agents + Memory + Code Interpreter)

## Status / 상태

**Accepted (2026-06-22) — consolidated.** consolidates: 004 (Gateway 역할 분리), 018 (Memory 격리·보존), 027 (Code Interpreter 세션 격리), 031 (런타임 커스터마이즈 에이전트·스킬 — **P1/P2만**), 039 (멀티 에이전트 플랫폼 — **P1/P2 platform/egress READ만**).

이 문서는 AgentCore 실행 층(게이트웨이 · 공유 Runtime · Memory · Code Interpreter · 런타임 커스터마이즈 substrate)의 단일 출처다. 외부 통합의 쓰기/자율 경로(ADR-031 P3 BYO-MCP, P4 mutating 도구, ADR-039 READ_WRITE·mutating-gate)는 본 ADR 범위 밖이며 **§2 동결**로 위임한다 — 본 문서에서는 명시적으로 제외한다.

This is the single source for the AgentCore execution layer: gateways, the shared Runtime, Memory, the Code Interpreter, and the runtime-customization substrate. The mutating/autonomy paths of external integration (ADR-031 Phase 3 BYO-MCP, Phase 4 mutating tools; ADR-039 READ_WRITE / mutating-gate) are **out of scope here** and delegated to **§2 (frozen)** — explicitly excluded from this document.

## Context / 컨텍스트

초기에는 29개 MCP 도구를 단일 AgentCore Gateway에 노출했고, LLM이 너무 많은 도구 중에서 선택해야 해 도구 선택 정확도가 낮고 응답이 느렸다. 동시에 AI 어시스턴트는 대화 이력을 참조해 추론해야 하고(메모리), 정적 텍스트를 넘어 실제 계산(비용 추이 플로팅·결과 집계·통계)을 수행해야 했다(코드 실행). 또한 운영자는 에이전트·스킬·외부 관측성 통합을 — AWS DevOps/Security 프런티어 에이전트의 커스터마이즈 모델처럼 — 코드 재빌드 없이 런타임에 계정별로 구성하기를 원했다.

An initial single AgentCore Gateway exposing 29 MCP tools gave the LLM too many tools to choose from, hurting tool-selection accuracy and latency. In parallel the AI assistant needed (a) prior-conversation context to reason across sessions (memory), (b) real computation beyond static text — plotting cost trends, aggregating result sets, statistics (code execution), and (c) a way for operators to compose agents, skills, and external observability integrations per account at runtime — mirroring the AWS DevOps/Security frontier-agent customization model — without a Docker rebuild.

v2 컨텍스트: Terraform · ECS Fargate · Aurora · 공유 AgentCore Runtime(Strands `agent/agent.py`). 설정 SoT는 SSM. 모든 AgentCore 자원은 `agentcore_enabled` 플래그로 게이트(기본 false → plan No changes, $0).

v2 context: Terraform · ECS Fargate · Aurora · a shared AgentCore Runtime (Strands `agent/agent.py`). Config source of truth = SSM. All AgentCore resources are gated behind `agentcore_enabled` (default false → plan = No changes, $0).

## Decision / 결정

### §1 게이트웨이 · 공유 Runtime / Gateways · shared Runtime

29개 도구의 단일 게이트웨이를 **역할 기반 섹션 게이트웨이로 분리**하고 **1개의 공유 AgentCore Runtime**을 둔다. 라우팅은 페이로드 파라미터로 적절한 게이트웨이를 선택한다. 게이트웨이당 도구 수가 줄어 도구 선택 정확도가 오른다.

Split the single 29-tool gateway into **role-based section gateways** sharing **one AgentCore Runtime**. Routing selects the appropriate gateway via a payload parameter; fewer tools per gateway raises tool-selection accuracy.

**게이트웨이 수 — net 확정 (9 프로비저닝 / 9 라우트):**

> **9개 게이트웨이가 프로비저닝된다** (`{network, container, data, security, cost, monitoring, iac, ops}` 8개 섹션 + **external-obs** 1개 = 9; `catalog.py`/`provision.py` 기준). **`agent.py` 라우팅도 9개를 대상으로 한다** — external-obs가 커넥터 도구(Prometheus·ClickHouse)를 갖추면서 라우팅 가능한 Observability 섹션으로 승격됨. 즉 **net = 9 게이트웨이 프로비저닝 / 9 에이전트 라우트.**
>
> external-obs(외부 관측성)는 **Integrations 축**(§3)의 일부로, 외부 데이터소스 커넥터(현재 Prometheus·ClickHouse; Loki/Tempo/Mimir/Datadog은 추후)를 호스팅하는 라우팅 섹션이다. 챗 섹션 키는 `observability`이며 `agent.py`에서 `external-obs` 게이트웨이로 별칭 매핑된다.
>
> **개정 (2026-06-24, owner 결정):** 직전까지의 "8 라우트"는 external-obs에 등록된 도구가 없어 라우팅해도 응답할 수 없던 **부트스트랩 상태**였다(번복이 아니라 설계의 완성). external-obs에 Prometheus·ClickHouse 커넥터가 착륙하면서, 종합 판단(메트릭·트레이스·인벤토리·AWS 네이티브 교차)을 위해 라우팅에 포함한다. `BASELINE.md` §3 동시 갱신.

> **9 gateways are provisioned** (the 8 section gateways `{network, container, data, security, cost, monitoring, iac, ops}` + **external-obs** = 9; per `catalog.py` / `provision.py`). **`agent.py` routing also targets 9** — external-obs is promoted to a routable Observability section once it bears connector tools (Prometheus, ClickHouse). Therefore **net = 9 gateways provisioned / 9 agent routes.** external-obs belongs to the **Integrations axis** (§3) and hosts the external-datasource connectors (Prometheus + ClickHouse now; Loki/Tempo/Mimir/Datadog later). The chat section key is `observability`, aliased to the `external-obs` gateway in `agent.py`.
>
> **Amendment (2026-06-24, owner decision):** the prior "8 routes" was a **bootstrap state** — external-obs had no registered tools, so routing to it could not answer (this is the completion of the design, not a reversal). With Prometheus + ClickHouse connectors landed on external-obs, it joins routing to enable cross-domain judgment (metrics·traces·inventory·AWS-native). `BASELINE.md` §3 updated in the same change.

### §2 런타임 커스터마이즈 substrate (ADR-031 P1/P2 · ADR-039 P1/P2) / runtime-customization substrate

운영자가 런타임에 **계정별로** 에이전트·스킬·외부 관측성 통합을 구성하되 재빌드가 없도록, **공유 substrate**(공유 AgentCore Runtime + Aurora 카탈로그 + resolver + registry-agnostic `agent.py`)를 채택한다 — 커스터마이즈는 데이터이지 코드 재빌드가 아니다.

Adopt a **shared substrate** (shared AgentCore Runtime + Aurora catalog + resolver + registry-agnostic `agent.py`) so operators compose agents, skills, and external observability integrations **per account at runtime** — customization is data, not a rebuild.

채택된 범위 (유효):
- **에이전트·스킬 카탈로그 (Aurora) + 관리자 CRUD + resolver + 분류기 확장** (ADR-031 Phase 1, LIVE). 스킬·에이전트는 재사용 카탈로그 객체(M:N), 아티팩트는 content hash로 S3 참조. resolver가 유효 Agent Space를 읽어 완전히 해석된 스펙(페르소나 + 합성 스킬 지시 + 도구 allowlist)을 registry-agnostic `agent.py`에 넘긴다. SHA-256 무결성·로컬 핫리로드·추적성 로깅 포함.
- **계정별 Agent Space** — 활성화 + 도구 allowlist 스코핑 (ADR-031 Phase 2, deployed). 서버측 `toolAllowlist` 강제(모델 밖), fail-closed revocation.
- **멀티 프런티어 에이전트 + Integrations 축 — egress READ (관측성)** (ADR-039 P1/P2, 구현 완료·LIVE). `agents`를 1급 엔티티로 확장(`gateways[]` + `agent_type`); 외부 관측성은 **단일 MCP egress substrate** 위의 타입드 카탈로그(§3); read-only.

In scope (stands):
- **Agent + skill catalog (Aurora) + admin CRUD + resolver + classifier extension** (ADR-031 Phase 1, LIVE). Skills/agents are reusable catalog objects (M:N); artifacts to S3 by content hash. The resolver reads the effective Agent Space and hands a fully resolved spec (persona + composed skill instructions + tool allowlist) to a registry-agnostic `agent.py`. SHA-256 integrity, local hot-reload, traceability logging included.
- **Per-account Agent Spaces** — enablement + tool-allowlist scoping (ADR-031 Phase 2, deployed). Server-side `toolAllowlist` enforcement (outside the model); fail-closed revocation.
- **Multi-frontier agents + Integrations axis — egress READ (observability)** (ADR-039 P1/P2, implemented + LIVE). `agents` as a first-class entity (`gateways[]` + `agent_type`); external observability is a typed catalog over **one MCP egress substrate** (§3); read-only.

**동결 / 본 ADR 제외 (FROZEN — do-not-enable, 여기서 명시적으로 제외):**
- **ADR-031 Phase 3 — 임의 BYO-MCP(외부 MCP 도구 서버 등록)**: 2026-06-11 reversal로 폐기(외부 엔드포인트 egress/SSRF/자격증명 표면 + 에이전트 구동 변경은 소규모 팀 범위 초과). do-not-pursue.
- **ADR-031 Phase 4 — mutating 도구(ADR-029 게이트 경유)**: reversal로 폐기(ADR-029/036 substrate 동결).
- **ADR-039 READ_WRITE / mutating-gate / BYO-MCP-write 경로**(`action_catalog`/`write_action_refs`/executor plumbing): 동결. 비-AWS-리소스 외부 knowledge/comms write의 좁은 거버넌스는 **ADR-040/041**이 별도로 다루며 본 ADR 범위 밖. AWS-리소스 변경·자율은 영구 동결.

**Frozen / excluded from this ADR (do-not-enable, explicitly excluded here):**
- **ADR-031 Phase 3 — arbitrary BYO-MCP** (registering external MCP tool servers): abandoned by the 2026-06-11 reversal (external-endpoint egress/SSRF/credential surface + agent-driven change exceeds a small team's scope). Do-not-pursue.
- **ADR-031 Phase 4 — mutating tools (via the ADR-029 gate)**: abandoned (ADR-029/036 substrate frozen).
- **ADR-039 READ_WRITE / mutating-gate / BYO-MCP-write paths** (`action_catalog` / `write_action_refs` / executor plumbing): frozen. The narrow governance of NON-AWS-resource external knowledge/comms writes is handled separately by **ADR-040/041** and is out of scope here. AWS-resource mutation + autonomy stay permanently frozen.

### §3 Integrations 축 — egress READ substrate / Integrations axis — egress READ substrate

외부 관측성 통합은 **단일 강화 MCP egress substrate**(`agent.py`) 위의 타입드 카탈로그/UX/거버넌스다(`direction=egress`, `capability=READ`). 글로벌 카탈로그 + 계정별 활성화·자격증명 격리. ADR-011 SSRF 방어를 v2로 재유도: https-only + DNS 사전해석/재확인 + metadata/private-CIDR 차단(private opt-in) + `redirect:manual` + per-account/per-integration 자격증명 스코핑(Secrets Manager). 불변 `SAFEGUARD_LINE`(read-only 경계) + 서버측 도구 allowlist(`exposed_tools` 상한).

External observability integration is a typed catalog/UX/governance over **one hardened MCP egress substrate** (`agent.py`): `direction=egress`, `capability=READ`. Global catalog + per-account enablement/credential isolation. Re-derives ADR-011 SSRF defense for v2: https-only + DNS pre-resolve/recheck + metadata/private-CIDR block (private opt-in) + `redirect:manual` + per-account/per-integration credential scoping (Secrets Manager). Immutable `SAFEGUARD_LINE` (read-only boundary) + server-side tool allowlist (`exposed_tools` ceiling).

**게이트웨이 수와의 관계:** 외부 관측성 = Integrations egress READ(9번째 프로비저닝 게이트웨이 external-obs로 표면화), 내부 CloudWatch = `monitoring` 섹션 게이트웨이. 정식 섹션 게이트웨이 수는 8 유지(§1).

Relation to gateway count: external observability = Integrations egress READ (surfaced as the 9th provisioned gateway external-obs), internal CloudWatch = the `monitoring` section gateway. Section-gateway count stays 8 (§1).

### §4 Memory — 사용자별 격리 + 365일 보관 / Memory — per-user isolation + 365-day retention

**단일 공유 AgentCore Memory 리소스**(`awsops_memory`, 하이픈 금지 — 언더스코어만)를 **Cognito 사용자 ID로 네임스페이스 분리**하고, `eventExpiryDuration`을 AgentCore 최대값 **365일**로 설정한다. 모든 읽기 경로는 `userId`로 필터링한다. 쓰기는 fire-and-forget(AI 지연 보호). 기록에는 신원 클레임(`sub`/`email`)과 대화 내용만 담고 JWT 원문·쿠키·AWS 자격증명은 담지 않는다. 크로스 계정 컨텍스트(`accountId`)를 기록에 포함해 계정 간 메모리 누출을 막는다(ADR-008 캐시-키 격리 정렬). AgentCore Memory API 미지원 리전에서는 로컬 폴백으로 우아하게 저하한다.

Use a **single shared AgentCore Memory resource** (`awsops_memory`, underscores only — hyphens forbidden) **namespaced by Cognito user id**, with `eventExpiryDuration` set to the AgentCore max of **365 days**. All read paths filter by `userId`; writes are fire-and-forget (protect AI latency). Records carry only identity claims (`sub`/`email`) + conversational content — never raw JWTs, cookies, or AWS credentials. Cross-account context (`accountId`) is included to prevent cross-account memory bleed (aligns with ADR-008 cache-key isolation). Regions without the AgentCore Memory API degrade gracefully to a local fallback.

365일은 분기·연간 반복 인시던트 패턴(성수기 스파이크, 분기 마이그레이션, 연간 감사)을 포착하기 위함이며, 동시에 AgentCore 플랫폼 상한이라 최대값 선택은 제약에 따른 비-결정이다.

365 days captures quarterly/annual recurrence patterns (peak spikes, quarterly migrations, annual audits) and is also the AgentCore platform cap — so picking the max is a constraint-driven non-decision.

### §5 Code Interpreter — 요청당 임시 세션 격리 / per-request ephemeral session isolation

**AgentCore 관리형 Code Interpreter**를 **요청당 임시 세션**으로 채택한다(단일 인터프리터 `awsops_code_interpreter`, 언더스코어만, `networkConfiguration.networkMode=PUBLIC` egress 전용). 라우트는 세션 시작 → 정확히 1회 `executeCode` 호출 → 결과 스트리밍 → `finally` 등가 경로에서 세션 중지를 수행해, 중단된 요청도 세션을 누수시키지 않는다. 계산성(`code`) 프롬프트는 섹션 게이트웨이를 우회해 인터프리터로 직결한다(MCP 왕복 제거). 게이트웨이 = AWS API 접근, 인터프리터 = 컨텍스트 내 데이터에 대한 수치·플로팅.

Adopt the **AgentCore-managed Code Interpreter** with **per-request ephemeral sessions** (single interpreter `awsops_code_interpreter`, underscores only, `networkConfiguration.networkMode=PUBLIC` egress-only). The route starts a session → runs exactly one `executeCode` → streams results → stops the session in a `finally`-equivalent path, so aborted requests cannot leak a session. Computational (`code`) prompts bypass the section gateways and hit the interpreter directly (no MCP round-trip). Gateways = AWS API access; interpreter = numeric/plotting work on data already in context.

샌드박스는 호스트와 완전 분리(파일시스템·소켓·호스트 IAM 도달 불가). 요청당 세션이라 사용자 간 변수 누수가 구조적으로 없다. 자체 관리형 Docker(커널 공유 탈옥 위험)·Lambda(플롯 라이브러리·레이어 용량)·Pyodide(서버측 데이터 도달 불가)는 기각.

The sandbox is fully isolated from the host (no filesystem/socket/host-IAM reach). Per-request sessions eliminate cross-user variable leaks by construction. Self-managed Docker (kernel-share escape), Lambda (plot libs / layer size), and Pyodide (cannot reach server-side data) were rejected.

### §6 설정 SoT / config source of truth

AgentCore 설정의 단일 출처는 **SSM**(`/ops/awsops-v2/agentcore/{runtime_arn, interpreter_id, memory_id}`): provisioner가 기록 → web BFF가 런타임에 read. ECS `valueFrom` 미사용(레이스 회피). 모든 AgentCore 자원은 `agentcore_enabled` 게이트.

The single source of truth for AgentCore config is **SSM** (`/ops/awsops-v2/agentcore/{runtime_arn, interpreter_id, memory_id}`): the provisioner writes, the web BFF reads at runtime. No ECS `valueFrom` (avoids the race). All AgentCore resources are `agentcore_enabled`-gated.

### §7 Aurora 접근 자격증명 — agent Lambda는 최소권한 DB 롤 사용 / Aurora access credential — agent Lambdas use a least-privilege DB role

> **Amendment (2026-07-31, factual — PR #197 round 8, 새 결정 아님):** Aurora RDS Data API를 쓰는 agent Lambda 2개(`rds-mcp`의 `execute_sql`, `inventory-read`)는 **Aurora master secret이 아니라** 전용 최소권한 Postgres 롤 **`awsops_sql_reader`**(`NOSUPERUSER`, `default_transaction_read_only=on`, 테이블 쓰기 권한 없음, 이 롤에 **부여된** EXECUTE 없음, predefined-role 멤버십 없음)로 인증한다. **(round 10 개정)** 데이터 접근은 `public`의 base table이 아니라 전용 `sql_reader` 스키마의 **read-only VIEW**로만 부여한다 — 각 뷰는 **명시적 컬럼 목록**(`SELECT *` 금지)이고, 이 롤은 `public`의 어떤 테이블/컬럼에도 권한이 **없다**(`ON ALL TABLES`·`ALTER DEFAULT PRIVILEGES`·컬럼 grant 모두 없음). 이유: round 8의 포괄 grant는 `eks_registrations.auth`(k8s bearer token)를 놓쳤고, round 9의 ~38개 **테이블** allowlist는 `worker_jobs.task_token`(Step Functions task token = 양도 가능한 **capability**)을 놓쳤다 — 테이블 단위 allowlist는 **컬럼 단위로 fail-open**이기 때문이다. 뷰 방식은 기본값을 뒤집는다: 새 컬럼은 누군가 뷰에 넣기 전까지 **보이지 않는다**(노출 실패 → 부재 실패, 모델 호출 도구엔 올바른 방향). 롤 `search_path`는 `sql_reader, pg_catalog`라 미수식 이름이 뷰로 해석되고, `public.worker_jobs`를 명시해도 grant가 없어 **거부**된다. 동작 원리: 뷰 소유자는 마이그레이션 롤(master user)이고 `security_invoker = false`(기본값)이므로 뷰 본문이 **소유자 권한**으로 실행된다 → base table에 권한 0인 롤이 뷰만 읽을 수 있다. **뷰에 컬럼을 추가하는 것은 security-relevant 변경이며 리뷰 대상이다.** 마이그레이션의 `REVOKE EXECUTE … FROM PUBLIC` 구문은 **best-effort 하드닝**이다(RDS/Aurora에서 `pg_catalog` 함수는 `rdsadmin` 소유라 실패 가능 → NOTICE 후 계속). 즉 "EXECUTE 전무"를 보장하는 게 아니라, 경계는 위의 롤 속성 자체다: `query_to_xml`이 이 롤로 실행돼도 이 롤이 닿는 것 이상은 닿지 못하고, `pg_cancel_backend`는 동일 롤 세션만 시그널할 수 있다. agent Lambda IAM 롤에서 master secret `GetSecretValue`(및 Aurora CMK `kms:Decrypt`) 부여를 **제거**했다. 근거: `execute_sql`의 read-only 보장이 어휘 denylist(`sql_readonly_guard.py`)와 `SET TRANSACTION READ ONLY`에만 의존했는데, 둘 다 경계가 아니다 — 가드는 문자열 리터럴을 매칭 *전에* 제거하므로 SQL을 문자열 인자로 받는 코어 함수(`query_to_xml('SELECT pg_cancel_backend(...)')`)가 보이지 않고, read-only 트랜잭션은 데이터 쓰기만 막아 control-plane 호출을 통과시킨다. 이 부류는 열거 불가(리뷰 7라운드가 증명)이므로 경계를 **DB 권한**으로 이동했다. 어휘 가드와 read-only 트랜잭션은 defense-in-depth로 유지. 자격증명은 Data API가 `secretArn`을 필수로 요구하므로(IAM DB auth 불가 경로) Terraform 소유 전용 secret + `make migrate` 동기화. **권한 제거이므로 ADR-005 신규 capability 부여가 아니다.** 구현: `terraform/v2/foundation/migrations/01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql`, `ai.tf`(`agent_lambda_inventory` / `agent_sql_reader`), `agent/lambda/aws_rds_mcp.py`.

The two agent Lambdas that reach Aurora through the RDS Data API (`rds-mcp`'s `execute_sql` and `inventory-read`) authenticate as the dedicated least-privilege Postgres role **`awsops_sql_reader`** (`NOSUPERUSER`, `default_transaction_read_only=on`, no table-write privilege, no EXECUTE **granted to** this role, no predefined-role membership) — **not** the Aurora master secret, whose `GetSecretValue` grant (and the Aurora CMK `kms:Decrypt` grant) is **removed** from the agent Lambda IAM role. Rationale: `execute_sql`'s read-only guarantee used to rest on a lexical denylist plus `SET TRANSACTION READ ONLY`, and neither is a boundary — the guard strips string literals *before* matching, so core functions taking SQL as a string argument are invisible to it, and a read-only transaction blocks only data writes, not control-plane calls. That class cannot be enumerated (seven review rounds demonstrated this), so the boundary moved into database privileges; the lexical guard and the read-only transaction remain as defense-in-depth. A Secrets Manager secret (Terraform-owned, synced by `make migrate`) is unavoidable here because the Data API requires `secretArn` — IAM DB auth is not reachable on this path. This is a privilege **removal**, not a new ADR-005 capability grant.

Data access is granted **only through read-only VIEWS** in a dedicated `sql_reader` schema — never on a base table in `public`. Each view has an **explicit column list** (never `SELECT *`), and the role holds **no** privilege on any table or column in `public` (no `ON ALL TABLES`, no `ALTER DEFAULT PRIVILEGES`, no column grants). **Why the pivot (round 10):** round 8's blanket grant missed `eks_registrations.auth` (a plaintext Kubernetes ServiceAccount bearer token the read APIs return as `mode` only), and round 9's ~38-**table** allowlist missed `worker_jobs.task_token` — a Step Functions task token, i.e. a transferable *capability*: its holder can `SendTaskSuccess`/`SendTaskFailure` on a live execution. Two rounds, one structural cause: a table-level allowlist **fails open per column**, so every table is one `ADD COLUMN secret` away from silent exposure with no review signal. Views invert the default: a new column on any base table is **invisible** until someone adds it to a view — the failure mode flips from *silently exposed* to *silently absent*, the correct direction for a model-invocable tool. The role's `search_path` is `sql_reader, pg_catalog`, so an unqualified `FROM worker_jobs` in a model-written query resolves to the redacted view, while explicitly qualifying `public.worker_jobs` is **denied** (no grant exists on it). The mechanism: the views are owned by the migration role (the Aurora master user) and created with the default `security_invoker = false`, so a view body executes with the **owner's** privileges on the base table — which is exactly what lets a grant on the view work while the role has zero privilege on the table underneath. **Adding a column to a view here is a security-relevant change requiring review**; so is adding a view. `search_path` and `default_transaction_read_only` are convenience (both are role-settable), not the boundary — the boundary is the grants. The migration's `REVOKE EXECUTE … FROM PUBLIC` statements remain **best-effort hardening**, not a guarantee: on RDS/Aurora those `pg_catalog` functions are owned by `rdsadmin`, so a revoke may fail (the migration `RAISE NOTICE`s, continues, and reports which targeted functions still have PUBLIC EXECUTE). That argument holds regardless: `query_to_xml` executed *as this role* can only reach what this role can reach (the views), and `pg_cancel_backend` can only signal same-role sessions.

## Consequences / 결과

### Positive / 긍정적
- 섹션 게이트웨이로 도구 선택 정확도 향상; 9 프로비저닝 / 9 라우트(external-obs 승격, 2026-06-24)로 external-obs가 종합 판단 경로에 포함됨. / Higher tool accuracy; 9 provisioned / 9 routed (external-obs promoted, 2026-06-24) brings external-obs into the cross-domain judgment path.
- 사용자별 메모리 격리 + 빠른 로컬 UI 읽기 + 365일 회상; AgentCore 불가 시에도 동작. / Per-user memory isolation + fast local UI reads + 365-day recall; works even when AgentCore is unavailable.
- 임시 세션 코드 실행이 사용자 간 변수 누수를 구조적으로 제거하고 호스트 유지보수가 없음. / Ephemeral code sessions remove cross-user leaks and require no host maintenance.
- 데이터 기반 런타임 커스터마이즈(계정별, 재빌드 없음); 단일 강화 egress substrate(SSRF 차단 승계). / Data-driven runtime customization (per-account, no rebuild); one hardened egress substrate (SSRF defense inherited).
- SSM SoT가 provisioner↔BFF 레이스를 제거. / SSM SoT removes the provisioner↔BFF race.

### Negative / 부정적
- 이중 저장(로컬+AgentCore) fire-and-forget로 동기화 편차 가능; 사용자별 네임스페이스라 팀 공유 인시던트 자동 상관 없음. / Dual-storage fire-and-forget can drift; per-user namespace = no auto-correlation of team incidents.
- Code Interpreter는 리전 제한 + 콜드스타트 + 장시간 연산 불가 + 런타임 임의 `pip install` 불가. / Region-gated + cold-start + no long jobs + no runtime `pip install`.
- 런타임 커스터마이즈는 카탈로그 스키마·resolver·관리자 UI·검증 파이프라인이라는 신규 표면을 추가; 계정별 드리프트는 추적성(Agent Space 버전 + 스킬 content hash 로깅)을 요구. / New surface area (catalog schema, resolver, admin UI, validation); per-account drift needs traceability logging.
- 동결 경로(BYO-MCP write·mutating·READ_WRITE)는 다크 코드로 잔존하되 활성화 금지 — 재활성화는 별도 멀티-AI 결정 필요. / Frozen paths remain as dark code, do-not-enable — re-activation needs its own multi-AI decision.

### Post-acceptance deviations / 채택 후 편차
- (none yet) / (아직 없음)

## 6 Pillars / 6대 통제 매핑

본 ADR이 충족하는 통제 (외부 통합·커스터마이즈의 read-only 경계 관점):

1. **격리 / Isolation** — Memory는 Cognito `userId`+`accountId` 네임스페이스; Code Interpreter는 요청당 세션; Agent Space는 계정별 스코핑. / Memory namespaced by `userId`+`accountId`; per-request interpreter sessions; per-account Agent Space scoping.
2. **최소 권한 / Least privilege** — 섹션 게이트웨이당 도구 집합 축소; 서버측 `toolAllowlist` 강제(모델 밖); read-only 기본; egress 자격증명 per-account/per-integration 스코핑(Secrets Manager). / Reduced tool set per gateway; server-side `toolAllowlist`; read-only default; scoped egress credentials.
3. **SSRF·egress 방어 / SSRF · egress defense** — https-only + DNS 사전해석/재확인 + metadata/private-CIDR 차단(private opt-in) + `redirect:manual` (ADR-011 v2 재유도). / ADR-011 re-derivation.
4. **불변 안전 경계 / Immutable safety boundary** — 불변 `SAFEGUARD_LINE`(read-only) + 정적·비오버라이드 시스템 프롬프트 가드 + 출력 검증; 커스텀 Markdown·MCP 결과는 신뢰 불가로 취급. / Immutable read-only safeguard + non-overridable prompt guard; custom content untrusted.
5. **revocation fail-closed** — 악성 스킬/엔드포인트 비활성화는 전 resolver/AgentCore 인스턴스에 즉시 전파(TTL 대기 없음); 비-보안 변경만 ≤30s 허용 staleness. / Immediate fail-closed revocation across all instances; ≤30s staleness only for non-security changes.
6. **감사·추적성 / Audit · traceability** — 모든 응답/통계에 Agent Space 버전·agent id·스킬 content hash 기록; SHA-256 아티팩트 무결성; SSM SoT + `agentcore_enabled` 게이트. / Agent Space version + agent id + skill content hash on every response/stat; SHA-256 integrity; SSM SoT + gate.

**범위 외(동결):** mutating/자율 통제(plan→execute·dry-run·4-eyes·paired rollback·kill-switch)는 ADR-029/036 substrate에 속하며 본 ADR에서 동결(§2). 비-AWS 외부 write 거버넌스는 ADR-040/041. / Out of scope (frozen): mutating/autonomy controls belong to the frozen ADR-029/036 substrate (§2); non-AWS external-write governance is ADR-040/041.

## References / 참고 자료

- 통합 출처 ADR: 004, 018, 027, 031(P1/P2), 039(P1/P2). / Consolidated from: 004, 018, 027, 031 (P1/P2), 039 (P1/P2).
- 동결 위임: ADR-029/036(mutating substrate, REVERSED), ADR-031 P3/P4, ADR-039 READ_WRITE; 비-AWS 외부 write 거버넌스 = ADR-040/041. / Frozen delegation.
- 인접: ADR-002/038/044(라우팅), ADR-008(멀티계정·캐시키 격리), ADR-011(SSRF allowlist), ADR-015(FinOps MCP), ADR-021(SSE), ADR-022(웹훅 ingress), ADR-023(admin), ADR-032(Lead/Sub triage·federation), ADR-033(비용 통제), ADR-037/030(v2 파운데이션).
- 감사 근거: `docs/reviews/2026-06-21-docs-reality-audit.md` §B5 (agentcore-01: net=9 프로비저닝 / 8 라우트; `agent.py:339`=8, `catalog.py:18`=9, `provision.py:5`=9; SSM SoT `ai.tf:306`; `agentcore_enabled` `ai.tf:61`; Memory 365 `provision.py:164`).
- 소스: `agent/agent.py`(8 섹션 라우팅 + registry-agnostic 실행 + egress MCP substrate), `scripts/v2/agentcore/{catalog.py,provision.py}`(9 게이트웨이 프로비저닝 + Memory + Code Interpreter), `terraform/v2/foundation/ai.tf`(`agentcore_enabled` 게이트 + SSM).
