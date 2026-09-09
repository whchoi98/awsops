# AWSops 결정 베이스라인 (BASELINE) / Decision Baseline

> **이것이 결정의 단일 현행 진실(single source of truth)이다.** AI·사람 모두 여기부터 읽는다. 상세 근거는 같은 디렉토리의 통합 ADR(`0NN-*.md`)을, 옛 이력은 `../history/`를 본다(명시 요청 없이는 읽지 않는다).
> 범위 = **v2 현행 진실.** v1(CDK/EC2/Steampipe, `/awsops` basePath)은 **폐기 진행 중**(ADR-016, 2026-07-09 결정) — Phase 5(repo 코드 정리) 완료(2026-07-12, `src/`/`infra-cdk/` 등 제거), Phase 4(AWS 인프라 완전삭제)는 유예기간 종료 후 진행(§1 범위 참조).
> This is the single current-truth for decisions. Read this first; ADRs (`0NN-*.md`) hold detail, `../history/` holds the frozen past.

---

## §0 북극성 (North Star) — 고정 (변경 시 owner 승인)

### 목표 (Goal)
> **AWSops는 AWS에 올라가는 모든 리소스를 AWS Well-Architected 6대 기둥에 맞게 안전하고 빠르게 운영하도록 돕는다.**
> 6대 기둥: 운영 우수성 · 보안 · 안정성 · 성능 효율성 · 비용 최적화 · 지속가능성.
> 다양한 데이터소스와 에이전트로 **6대 기둥 관점의 진단과 해결방법 제시**를 제공하여 운영을 지속 고도화한다.

"안전하게"는 목표의 일부다. read-only 자세는 후퇴가 아니라 **안전을 위한 실행 경로 게이팅**이다.

### 가치 (Value)
- **단일 창에서 6대 기둥을 본다** — 인벤토리·토폴로지(안정성), 비용(비용최적화), 보안/CIS(보안), 메트릭(성능), 진단(운영우수성).
- **진단을 넘어 해결까지** — 라이브 데이터(AWS + 외부 관측성) + 에이전트로 근본원인 + *고치는 법*까지 제시.
- **안전 내장** — 빠르게 운영하되 위험한 실행은 통제·게이트·승인 뒤. 프로덕션에 붙여도 안전.

### 핵심 설계 (Core Design) — 4축
1. 모든 기능·진단은 **6대 기둥 중 하나 이상에 매핑**된다 (새 결정의 정당성 = 어느 기둥을 개선하나).
2. 운영의 현재 형태 = **진단 + 해결방법 제시**. 실행은 안전 게이트 뒤.
3. **Terraform MSA** — 비공개 엣지(CloudFront VPC Origin → 내부 ALB → Fargate) · Aurora 영속 상태 · thin-BFF + 비동기 워커 · AgentCore 섹션 에이전트 · 외부 데이터소스/통합.
4. **모든 신기능 flag-gated** — 기본 OFF, 안전하게 단계적 활성화.

### 실행/자동화의 위상 (점진적 실행, 단 현 invariant 유지)
- 최종 목표(aspiration)는 안전한 *실행/자동화*까지 포함한다 — 이는 §0 방향으로 보존한다.
- **현재 ON = 진단 + 해결방법 제시(read-only).**
- AWS 리소스 변경·자율 조치는 **FROZEN**(§2). "영구 금지"가 아니라 "안전조건+명시적 새 결정 전까지 동결" — 단 **이 문서/리셋으로 풀지 않는다.** 완화는 새 ADR + 멀티-AI 패널 + 날짜박힌 owner-override가 필요한 별도 제품 결정이다. (2026-06-11 reversal을 조용히 재해석 금지.)
- aspiration(나아간다)과 오늘의 FROZEN invariant는 양립한다.

---

## §1 불변식 / 용어 (Invariants) — 결정론적 판정 기준

- **read-only의 정의** = **AWS 리소스 변경 금지 + 자율 조치 금지**(SSM/인프라/autonomous mutation = §2 FROZEN). 외부 *DATA* read/write는 read-only 제약 대상이 **아니다** — 거버넌스(SSRF·Secrets·DLP·human-gate·flag) 하에 허용(→ ADR-007).
- **6기둥 매핑 규칙** — 모든 신규 기능/결정은 WA 6기둥 중 최소 하나를 개선해야 한다. PR/ADR은 어느 기둥인지 명시한다.
- **flag 규율** — 위험·대형 기능은 `*_enabled` count/flag 게이트(기본 false → `plan`=무변경·$0). FROZEN 항목은 default false 유지가 invariant(§2).
- **BASELINE 크기 예산** — 이 문서는 *index*이지 소설이 아니다. 상세 설계는 `../reference/`로, 결정 근거는 통합 ADR로, 옛 이력은 `../history/`로 위임한다. §3 줄 수가 늘면 토픽 통합/reference 추출.
- **범위 = v2.** v1은 **ADR-016에 따라 단계적 폐기 진행 중**(Phase 0~5, `docs/runbooks/v1-decommission.md`) — **Phase 5(repo `src/`/`infra-cdk/` 등 코드 정리) 완료(2026-07-12)**, Phase 4(AWS 인프라 완전삭제)는 유예기간 종료 후 별도 진행. Phase 4 완료 전까지 v1 AWS 인프라(EC2/CloudFront, stop/disable 상태) 관련 논의는 이 BASELINE의 "현행 진실 위반"이 아니다.
- **anti-drift(C2)** — 새 ADR/flag 변경은 **같은 PR에서 §3(또는 §2) 갱신**이 필수다. 갱신 없으면 "not live". 옛 ADR 본문은 트리에 없다(git tag `adr-legacy-2026-06-22` 보존, 매핑 `../history/ADR-MAPPING.md`).

---

## §2 게이트 / 동결 register (Gated / Frozen)

> 2-티어: **FROZEN**(do-not-enable, 풀려면 새 ADR+패널+owner-override) vs **GATED**(거버넌스 하 활성화 가능, 현재 OFF). 아래 **feature gate** 는 전부 terraform flag default=false 와 일치한다. 예외로 아래 **마이그레이션 창 스위치**(`legacy_email_owner_match`) 행은 기본 **true** 다 — 기능을 켜는 플래그가 아니라 이관이 끝날 때까지 legacy 동작을 유지하는 스위치이므로, 기본값이 반대다.

| 상태 | 항목 | flag | 켜는 조건 / 비고 | 근거 ADR |
|---|---|---|---|---|
| **FROZEN** | AWS 리소스 변경(SSM/Change Manager) + 자율 mitigation substrate | `remediation_enabled` | **do-not-enable.** 재활성화 = 새 ADR로 2026-06-11 reversal 명시 번복 + 멀티-AI 패널 + owner-override. flag-OFF substrate는 보존(삭제 아님) | ADR-005 |
| **마이그레이션 창** (feature gate 아님) | legacy email-keyed 소유권 매칭을 수용(읽기 + report PATCH/DELETE — `matchesIdentity()` 를 거치는 모든 게이트) | `legacy_email_owner_match` — **기본 true** | 이관 스위치. `make` target 은 **plan-only** 이므로 clean plan 만으로는 조건이 아니다 — clean plan 은 아직 아무 행도 rewrite 되지 않은 상태에서도 성립한다. **`--apply` 가 성공하고 잔여 legacy email-keyed row 가 0 임을 확인한 뒤에만** `false` 로 내린다(애초에 legacy 행이 없어 plan 이 zero-row 로 끝난 경우도 이 조건을 만족한다 — 재작성할 것이 없었으므로). 그전에 내리면 legacy 행이 소유자에게 안 보인다. 켜져 있는 동안은 재할당된 주소가 전 소유자의 legacy 행과 일치할 수 있다. 세 경로 중 **둘만** 닫혔다: 기존 계정의 email *변경*은 `write_attributes` 축소로, *신규* 계정 signup 은 `allow_admin_create_user_only` 로. **세 번째는 계정 복구였고 이 PR 에서 닫았다** — public `ForgotPassword` 는 그 주소로 코드를 보내므로 mailbox 보유자가 기존 계정을 인수할 수 있었다(그 경우 legacy 행뿐 아니라 sub-keyed 행까지 넘어간다). `account_recovery_setting = admin_only` 로 self-service 복구 자체를 제거했다 — 대가는 비밀번호 재설정이 운영자 작업이 되는 것이고, 이 pool 은 이미 admin-create-only 라 그 모델과 일치한다. 오프보딩(`docs/runbooks/user-offboarding.md`)은 여전히 필요하다(세션·admin allowlist·스케줄 정리). ADR-002 참조 | ADR-009 |
| **GATED** | 자율 인시던트 라이프사이클 | `incident_lifecycle_enabled` | analysis-only(read-only triage/RCA, 권고전용, mutation 라우팅 금지). 활성화해도 자율 조치 없음 | ADR-006 |
| **GATED** | RCA write-back (OpsCenter/Incident Manager 관측메타 write) | `rca_writeback_enabled` | `incident_lifecycle_enabled` + **자족 role 분리 선행**(현재 frozen remediation role 상속 → 분리 전 do-not-enable) | ADR-006 |
| **GATED** | K8sGPT 인클러스터 진단 | `k8sgpt_enabled` | GET-only(Result CRD read), 클러스터 write 없음, 오퍼레이터는 out-of-band 설치 | ADR-006 |
| **GATED(거버넌스)** | 외부 knowledge/comms write — 광역(Slack/Notion/Jira) | `integrations_write_enabled` | 독립 control plane · no-AWS-mutation IAM · SSRF/Secrets/DLP/human-gate. BYO-MCP(임의) 제외, 큐레이션 커넥터만 | ADR-007 |
| **GATED** | 외부 관측성 진단 수집 | `datasource_diagnosis_enabled` | governed egress collector(read), SSRF 방어 | ADR-007/ADR-008 |
| **GATED(실험)** | 챗 에이전트 루프 — `AsyncAnthropicBedrock` 커스텀 루프(다크) | `ANTHROPIC_AGENT_LOOP_ENABLED` (+ per-request `payload.agentLoop` 오버라이드) | default OFF·dark. read-only·additive; Bedrock 경유(IAM/VPC/레지던시/비용귀속 보존, API키 無, 동일 global.* 프로파일+홈리전), 기존 게이트웨이 MCP 재사용(BYO-MCP 아님). 레버=도구 루프 디버깅성(지연 아님). **per-request `payload.agentLoop`('anthropic'\|'strands')가 env를 오버라이드** — BFF는 client-controlled `agentLoop`를 forward하지 않음(서버측 설정만; 불변식 유지 필수) | ADR-008/ADR-003 |
| **GATED(owner-override 예외)** | 운영 자가치유: 호스트 자기 서비스 재배포(Aurora secret 회전 복구) | `secret_rotation_redeploy_enabled` | **ADR-005 freeze에 대한 명시적·날짜박힌 owner-override 예외**(오준석, 2026-07-01, PR #114 멀티-AI 패널 리뷰 거쳐 ratify — self-scoping 재해석이 아님). EventBridge(RotationSucceeded)→Lambda→`ecs:UpdateService` force-new-deployment **자기 web 서비스 한정**. IAM 1 ARN·secret-id fail-closed·default-off. ADR-005의 나머지(remediation/BYO-MCP/mutating tools)는 그대로 FROZEN — 이 예외는 이 좁은 케이스 하나만. CloudTrail trail 의존 | ADR-015 |
| **옵션(deferred)** | Neptune/그래프 substrate | — | Postgres-first 확정, 그래프 substrate는 후속 옵션 | legacy ADR-043 (deferred — MAPPING 참조) |

> **주의 (2-티어 정밀):** 외부 DATA write 티어가 일률 OFF는 아니다 — `diagnosis_notify_enabled`(SNS 이메일, IAM 단일 토픽 스코프, NOT AWS-리소스 변경)는 **이미 LIVE**(거버넌스 충족). 광역 `integrations_write_enabled`만 OFF. (ADR-007/ADR-013)

> **폐기(do-not-revive):** BYO-MCP(임의 형태 외부 MCP, ADR 구 031-P3) — 큐레이션 커넥터만 허용. (ADR-007)

---

## §3 결정 인덱스 (Decision Index)

> 통합 ADR 16개. 상세·근거는 각 ADR. (옛 46개 → `../history/ADR-MAPPING.md`, 본문은 git tag `adr-legacy-2026-06-22`.)

| ADR | 토픽 | 한 줄 | 6기둥 |
|---|---|---|---|
| [001](001-v2-foundation.md) | v2 파운데이션 | Terraform MSA·비공개 엣지·Aurora·thin-BFF·이중 ECR (CDK·라이브 Steampipe 폐기) | 운영우수성·안정성·비용 |
| [002](002-auth-and-login.md) | 인증·로그인 | Cognito+Lambda@Edge RS256 + 인앱 `/login`(USER_PASSWORD_AUTH), Hosted UI 다크폴백 + Aurora `session_revocations` 서버측 로그아웃 폐기(BFF-side, edge는 JWT-only) | 보안 |
| [003](003-ai-agent-routing.md) | AI 에이전트 라우팅 | 하이브리드(정규식+Haiku 분류기) + 교차도메인 자동합성 (LIVE) | 운영우수성 |
| [004](004-agentcore-gateways-runtime.md) | AgentCore 게이트웨이·런타임 | **9 게이트웨이 프로비저닝 / 9 섹션 에이전트 라우트** (external-obs 승격 2026-06-24: Prometheus+ClickHouse) + Memory + Code Interpreter. **§7(2026-07-31 amendment, 사실 기록): Aurora Data API agent Lambda는 master secret 대신 최소권한 `awsops_sql_reader`로 인증하고, `sql_reader` 스키마의 명시적 컬럼 VIEW에만 SELECT를 부여(`public`에는 table/column grant 0). 테이블 allowlist는 컬럼 단위 fail-open으로 `eks_registrations.auth`, 이어 `worker_jobs.task_token`(SFN capability token)을 누출해 폐기. host 계정 PostgreSQL 전용이며 권한 제거이므로 신규 capability 아님** | 운영우수성 |
| [005](005-aws-mutation-autonomy-frozen.md) | AWS 변경·자율 **FROZEN** | do-not-enable; 재활성화=새 ADR+패널+owner-override | 보안·운영우수성 |
| [006](006-incident-analysis-only.md) | 인시던트 **ANALYSIS-ONLY** (GATED) | read-only triage/RCA만, 자율 mitigation 폐기 | 안정성·운영우수성 |
| [007](007-external-data-integration-governance.md) | 외부 데이터 통합 거버넌스 (keystone) | read-only=리소스 한정; 외부 read LIVE·write 2-티어 거버넌스 | 보안·운영우수성 |
| [008](008-ai-diagnosis-pipeline.md) | AI 진단 파이프라인 | raw boto3 Bedrock·15섹션 병렬렌더·포맷·비용캐싱 (스트리밍 후속); 챗 루프 `AsyncAnthropicBedrock` 실험=flag-gated dark(`ANTHROPIC_AGENT_LOOP_ENABLED`) | 운영우수성·비용 |
| [009](009-async-worker-backbone.md) | 비동기 워커 백본 | SQS+SFN+Lambda/Fargate; read-only job — `noop`/`noop-heavy`(범용 `/api/jobs`), `report`·`compliance`는 사용자 경로 기준 소유권-스코프 전용 라우트(`/api/diagnosis`, `/api/compliance/run`)로 enqueue(`schedule_dispatcher.py` 내부 직접 enqueue 예외), `datasource_index`·`insight`는 내부 전용 enqueue(사용자 제출 불가) | 안정성·운영우수성 |
| [010](010-inventory-resource-model.md) | 인벤토리·리소스 모델 | 타입 레지스트리 + flag-gated Steampipe sync→Aurora (ECS service 갭) | 안정성·비용 |
| [011](011-multi-account.md) | 멀티 어카운트 | STS AssumeRole(AWSopsReadOnlyRole; ExternalId = 3rd-party 필수 / 1st-party는 task-role ARN 핀 시 선택, amended 2026-06-26), read-only fan-out | 보안 |
| [012](012-cost-finops.md) | Cost / FinOps | Cost Explorer probe + FinOps MCP + Bedrock 비용 귀속 | 비용최적화 |
| [013](013-alerting-notification.md) | 알림·통지 | 웹훅 HMAC + SNS 통지(diagnosis_notify LIVE) + 리포트 다운로드 | 운영우수성 |
| [014](014-cross-cutting-cache-i18n-cdn.md) | 횡단: 캐시·i18n·CDN | 프리워밍·i18n(ko/en)·CloudFront CACHING_DISABLED | 성능효율성 |
| [015](015-operational-self-healing.md) | 운영 자가치유 | 호스트 자기 서비스 force-new-deployment 자율 복구(Aurora secret 회전), default-off·IAM 1 ARN·secret-id fail-closed; **ADR-005 불완화**(별개 범주) | 안정성·보안 |
| [016](016-v1-decommission.md) | v1 레거시 폐기 | 5단계 폐기(데이터확보→도메인컷오버→정지/유예→삭제→코드정리) + `awsops.atomai.click` v2 컷오버; owner 지시, ADR-005 무관(수동 작업) | 비용최적화·운영우수성 |

새 ADR 추가: 최고번호+1, single Status, **같은 PR에서 이 §3(또는 §2) 갱신 필수**(anti-drift, §1).
