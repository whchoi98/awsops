# ADR-002: 인증 · 로그인 (Cognito + Lambda@Edge RS256 + 인앱 로그인) / Authentication · Login (Cognito + Lambda@Edge RS256 + In-App Login)

## Status / 상태

Accepted (2026-06-22) — consolidated. consolidates: 020, 023, 042

## Context / 컨텍스트

AWSops는 민감한 AWS 계정 데이터(IAM·CloudTrail·비용·보안 상태)를 노출하고 운영자를 대신해 Bedrock/AgentCore를 호출하는 운영 대시보드이다. 어떤 요청도 인증 없이 백엔드(내부 ALB → Fargate)에 도달해서는 안 되며, 인증은 가능한 한 상류에서 종료되어야 한다. 동시에 일부 관리 화면(`/accounts`·`/alert-settings`·`/datasources`·진단 스케줄러)은 인증된 모든 사용자가 아니라 관리자만 접근할 수 있어야 한다.

AWSops is an operations dashboard that exposes sensitive AWS account data (IAM, CloudTrail, cost, security posture) and invokes Bedrock/AgentCore on behalf of operators. No request may reach the backend (internal ALB → Fargate) without authentication, and authentication should terminate as far upstream as possible. At the same time, certain administrative surfaces (`/accounts`, `/alert-settings`, `/datasources`, the diagnosis scheduler) must be reachable only by administrators, not every authenticated user.

엣지 인증을 위한 요구사항:
- CloudFront 엣지에서 미인증 트래픽을 거부해 오리진이 익명 스캔/캐시 응답에 노출되지 않도록 한다.
- 사용자 신원이 다운스트림으로 신뢰성 있게 전파되어 멀티 어카운트 필터링·AgentCore Memory 격리·관리자 게이트가 동일 신원을 키로 사용할 수 있어야 한다.
- 사용자가 별도 권한 체계를 학습하지 않도록 Cognito 위에서 관리자 권한을 게이팅한다.

Requirements that shape the design:
- Reject unauthenticated traffic at the CloudFront edge so the origin is never exposed to anonymous scans or cached responses.
- Propagate user identity downstream reliably so multi-account filtering, AgentCore Memory isolation, and the admin gate can all key off the same identity.
- Gate admin privileges on top of Cognito so operators learn no second access-control system.

## Decision / 결정

### 1. 엣지 인증 — Cognito + Lambda@Edge (RS256) / Edge auth — Cognito + Lambda@Edge (RS256)

Cognito User Pool이 신원을 관리한다(주 리전 `ap-northeast-2`). Python Lambda@Edge 함수(`us-east-1` — Lambda@Edge가 허용하는 유일한 리전)가 CloudFront `viewer-request` 이벤트에 연결되어 매 요청마다 `awsops_token` 쿠키를 검증한다. 검증은 **RS256 JWKS 서명 검증 + `iss`/`aud`/`token_use` 클레임 + OAuth `state` + PKCE public client**(클라이언트 시크릿 없음)로 수행한다. 검증된 ID 토큰은 `awsops_token` 쿠키(`Path=/; Secure; HttpOnly; SameSite=Lax`)에 담겨 모든 후속 요청에 전파된다. `viewer-request`는 CloudFront 캐시 조회 전에 발생하므로 미인증 사용자는 캐시된 HTML조차 받지 못한다.

A Cognito User Pool holds identities (primary region `ap-northeast-2`). A Python Lambda@Edge function (`us-east-1` — the only region Lambda@Edge allows) is attached to the CloudFront `viewer-request` event and validates the `awsops_token` cookie on every request. Validation performs **RS256 JWKS signature verification + `iss`/`aud`/`token_use` claims + OAuth `state` + PKCE public client** (no client secret). The verified ID token rides the `awsops_token` cookie (`Path=/; Secure; HttpOnly; SameSite=Lax`) on every subsequent request. Because `viewer-request` fires before the CloudFront cache lookup, unauthenticated users never receive even cached HTML.

미인증 요청은 엣지에서 자체 `/login` 페이지로 리다이렉트된다(`302 Location: /login?next={quoted uri}`, `Cache-Control: no-cache`). `next`는 오픈 리다이렉트에 대해 정제된다(`/`로 시작, 2번째 문자 ≠ `/`·`\`, `\` 미포함, ≤2048자; 브라우저 `\`→`/` 정규화 우회까지 차단; 기본값 `/`). `is_public()`은 `/login`·`/api/auth/login`·`/icon.svg`(로그인 페이지·인증 API·파비콘)를 미인증 허용한다.

Unauthenticated requests are redirected at the edge to the self-hosted `/login` page (`302 Location: /login?next={quoted uri}`, `Cache-Control: no-cache`). `next` is sanitized against open redirect (starts `/`, 2nd char ≠ `/`·`\`, no `\`, ≤2048 chars; the browser `\`→`/` normalization bypass is covered; defaults to `/`). `is_public()` allows `/login`, `/api/auth/login`, and `/icon.svg` (login page, auth API, favicon) unauthenticated.

### 2. 로그인 — 자체 호스팅 `/login` 폼 (1차 경로) / Login — self-hosted `/login` form (primary path)

로그인 주 경로는 **자체 호스팅 `/login` 폼**이다(AgentCore teal 테마, 활성 테마 추종; `ShellGate`가 `/login`을 제외한 모든 경로에 앱 셸을 탑재). 폼은 BFF `POST /api/auth/login`을 호출하고, BFF는 Cognito **`InitiateAuth(USER_PASSWORD_AUTH)`**를 **무서명 공개 오퍼레이션**으로 plain fetch(`cognito-idp.{region}.amazonaws.com`, `X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth`, `Content-Type: application/x-amz-json-1.1`) 호출한다 — SDK·IAM·task-role 자격증명 불필요. 성공 시 Cognito가 반환한 `IdToken`을 `awsops_token` 쿠키로 발급한다("keep me signed in" ✓ → `Max-Age=43200`[12h, id_token 수명], ✗ → 세션 쿠키). 오류는 단일 코드로 수렴해 계정 존재를 노출하지 않는다: `NotAuthorizedException`/`UserNotFoundException` → `invalid_credentials`, 모든 `ChallengeName` → `challenge`(403, "관리자에게 문의"), 네트워크/5xx → `unavailable`(502).

The primary login path is the **self-hosted `/login` form** (AgentCore teal theme, follows the active theme; `ShellGate` mounts the app shell on every route except `/login`). The form calls BFF `POST /api/auth/login`, which invokes Cognito **`InitiateAuth(USER_PASSWORD_AUTH)`** as an **unsigned public operation** via plain fetch (`cognito-idp.{region}.amazonaws.com`, `X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth`, `Content-Type: application/x-amz-json-1.1`) — no SDK, no IAM, no task-role credentials. On success it mints the Cognito-issued `IdToken` as the `awsops_token` cookie ("keep me signed in" ✓ → `Max-Age=43200` [12h, the id_token lifetime], ✗ → session cookie). Errors collapse to single codes so account existence is never disclosed: `NotAuthorizedException`/`UserNotFoundException` → `invalid_credentials`, any `ChallengeName` → `challenge` (403, "contact your administrator"), network/5xx → `unavailable` (502).

Cognito 클라이언트(`auth.tf`)는 최소권한으로 구성한다: `explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH"]`만 부여하고 **`ALLOW_REFRESH_TOKEN_AUTH`는 부여하지 않는다**(BFF는 refresh 플로우를 구현하지 않고 반환된 RefreshToken을 즉시 폐기). `id_token_validity = 12` / `access_token_validity = 12`(hours). 12h id_token이 토큰의 최대 수명이다 — 그 창 안의 조기 폐기는 §2-4 참조.

The Cognito client (`auth.tf`) is least-privilege: only `explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH"]`, and **no `ALLOW_REFRESH_TOKEN_AUTH`** (the BFF implements no refresh flow and discards any returned RefreshToken). `id_token_validity = 12` / `access_token_validity = 12` (hours). The 12h id_token is the token's maximum lifetime — early cutoff within that window is §2-4.

signout은 쿠키를 삭제(`Max-Age=0`)하고, 폐기 레코드를 기록하고(§2-4), `/login`으로 리다이렉트한다 — 자체 폼은 Cognito 브라우저 세션을 만들지 않으므로 Hosted UI `/logout` 왕복이 없다.

Signout clears the cookie (`Max-Age=0`), records a revocation (§2-4), and redirects to `/login` — the self-hosted form creates no Cognito browser session, so there is no Hosted UI `/logout` round-trip.

### 2-4. 서버측 세션 폐기 — Aurora `session_revocations` / Server-side session revocation — Aurora `session_revocations`

Cognito의 `GlobalSignOut`은 refresh/access 토큰만 무효화하고 **id_token은 건드리지 않는다** — 원래 signout이 클라이언트측 쿠키 삭제뿐이었을 때, 로그아웃 전에 유출된 id_token은 남은 12h 전체 동안 계속 유효했다. 이를 막기 위해 **BFF-side**(엣지가 아니라)에 per-sub 폐기 컷오프를 둔다: Aurora 테이블 `session_revocations(user_sub PK, revoked_at)`에 signout마다 해당 토큰의 `iat`를 넘지 않는 한도로 `revoked_at`을 upsert하고(멱등 — 반복 로그아웃/이미-폐기된 토큰 재전송은 컷오프를 그 토큰의 `iat` 이상으로는 전진시키지 못함, pentest-remediation P2-review MAJOR-1), `verifyUser()`는 매 요청마다 `iat <= revoked_at`인지 검사해 그 sub의 폐기-이전 *및 폐기-당시* 발급 토큰을 전부 거부한다(엄격한 `<`였다면 로그아웃에 쓰인 그 토큰 자신의 `iat`가 컷오프와 정확히 같아 "폐기 안 됨"으로 판정돼 이 기능의 존재 목적 자체가 무력화됨 — pentest-remediation P3-review CRITICAL). **Lambda@Edge는 여전히 JWT-only다** — RS256 서명/`iss`/`aud`/`token_use`만 검사하고 `session_revocations`를 전혀 모른다; 신뢰 경계는 엣지(형식 유효성)와 BFF(폐기 인지 유효성) 사이로 나뉜다. 이 분리 때문에 엣지 캐시 경로 없이 오직 BFF로 라우팅되는 요청만 폐기가 적용되며, 데이터를 반환하거나 비용이 드는 동작을 트리거하는 라우트는 모두 `verifyUser()`를 거쳐야 한다(예외는 즉시 폐기 우회). 데이터를 반환하거나 과금을 유발하는 라우트 중 `verifyUser()`를 실제로 스킵하는 것은 (1) `/api/db` — 테이블 개수뿐 아니라 데이터베이스 이름, 오류 시 원본 에러 메시지까지 반환하지만 민감하지 않고 상태를 변경하지 않음, (2) `/api/stream` — tick 카운터만 노출, 상태 변경 없음, (3) `/api/incidents/webhook` — 이 셋과 다른 범주다: 세션 폐기의 "구멍"이 아니라 **처음부터 Cognito 세션 인증을 쓰지 않는 머신-인그레스 대체-인증 경로**(ADR-013 HMAC-SHA256/SNS-subscription 검증, `INCIDENT_LIFECYCLE_ENABLED` 게이트) — 외부 알람 소스는 Cognito 쿠키를 가질 수 없으므로 애초에 `verifyUser()`/`session_revocations`의 대상이 아니다.

Cognito's `GlobalSignOut` invalidates only refresh/access tokens — it **does not touch the id_token**. When signout was purely a client-side cookie clear, an id_token leaked before logout stayed valid for the rest of its 12h. To close that, a per-sub revocation cutoff lives **BFF-side** (not the edge): Aurora table `session_revocations(user_sub PK, revoked_at)` gets `revoked_at` upserted on every signout, bounded to that token's own `iat` (idempotent — repeated logout, or replaying an already-revoked token, can never advance the cutoff past that token's `iat`; pentest-remediation P2-review MAJOR-1), and `verifyUser()` checks `iat <= revoked_at` per request, rejecting every token for that sub issued before *or at* the cutoff (strict `<` would let the very token used to log out judge itself "not revoked" — since its own `iat` equals the cutoff exactly — defeating the whole mechanism; pentest-remediation P3-review CRITICAL). **Lambda@Edge remains JWT-only** — it checks only RS256 signature/`iss`/`aud`/`token_use` and has no knowledge of `session_revocations`; the trust boundary splits between the edge (format validity) and the BFF (revocation-aware validity). Because of that split, revocation is only enforced on requests that actually reach the BFF's `verifyUser()` — every route that returns data or triggers a billable action must call it (an omission is an immediate bypass). Among data-returning or billable-action routes, the ones that actually skip `verifyUser()` are: (1) `/api/db` — returns not just a table count but also the database name, and on error the raw exception message; still non-sensitive and mutates no state, (2) `/api/stream` — exposes only a tick counter, mutates no state, (3) `/api/incidents/webhook` — a different category entirely, not a revocation gap: it's a **machine-ingress alternate-auth path** that never used Cognito session auth to begin with (HMAC-SHA256/SNS-subscription verification per ADR-013, gated on `INCIDENT_LIFECYCLE_ENABLED`) — external alarm sources can't carry a Cognito cookie, so it was never in scope for `verifyUser()`/`session_revocations`.

signout 자체는 별도의 짧은-tolerance 검증 경로(`verifyUserForSignout`)를 쓴다: 서명/`iss`/`aud`/`token_use`는 전부 검사하지만, `clockTolerance`를 5분으로 두어(통상적인 시계 드리프트/요청 지연만 흡수) 만료 후 5분을 넘는 토큰은 거부한다. 이 경로는 revocation 검사를 하지 않는다(로그아웃은 이미-폐기된/만료된 세션에서도 항상 성공해야 한다). 이 5분 창은 의도적이다 — signout의 공개·CSRF-토큰-없는 성격상, tolerance가 크면 누구든 과거에 캡처한 만료 토큰을 반복 재전송해 피해자의 *현재* 유효 세션을 계속 강제 로그아웃시키는 계정 단위 DoS가 열린다.

Signout itself uses a separate, short-tolerance verification path (`verifyUserForSignout`): signature/`iss`/`aud`/`token_use` are all still checked, but `clockTolerance` is 5 minutes (enough to absorb ordinary clock drift/request latency, not enough to accept a token expired for hours/days). This path does not check revocation (logout must always succeed, even against an already-revoked/expired session). That 5-minute window is deliberate — given signout's public, CSRF-token-less nature, a large tolerance would let anyone who ever captured an expired token replay it repeatedly to keep force-logging-out the victim's *current* valid sessions (an account-level DoS).

Aurora 가용성에 대해 폐기 검사는 **fail-open**이다(`isRevoked()`가 예외/타임아웃 시 `false` 반환) — Aurora 블립 하나가 앱 전체 사용자를 강제 로그아웃시켜서는 안 되며, 이는 이 기능 이전의 기본 상태(폐기가 전혀 없던 상태)로 되돌아가는 것일 뿐 새로운 실패 영역을 만들지 않는다. 쿼리에는 짧은 타임아웃(3s, `Promise.race`)이 있어 Aurora 콜드스타트/풀 고갈로 쿼리가 멈춰도 인증 경로 전체가 정지하지 않고 같은 fail-open으로 저하된다. fail-open이 **의도된 가용성 우선 선택**이므로 그 보상 통제는 **탐지**다: web 로그그룹에 `revocation_check_failed`·`revocation_write_failed` 로그 메트릭 필터 + CloudWatch 알람(`workload.tf`, 게이트 없음 — 5분 2주기 지속 카운트, 단발 blip 제외)을 두어 폐기 통제가 조용히 꺼진 상태를 감지한다.

컷오프 조회는 **sub별 5초 TTL 인-프로세스 캐시**를 거친다(`web/lib/auth.ts`). 인증 요청마다 전용 커넥션 체크아웃 + 4 왕복(BEGIN/SET LOCAL/SELECT/COMMIT)을 쓰는 것은 `max: 3` 풀에서 앱 데이터 쿼리와 상호 starvation을 일으킨다(풀 고갈 → 폐기 검사 타임아웃 → fail-open으로 통제가 조용히 꺼짐). 캐시가 안전한 이유는 **컷오프가 단조 증가**이기 때문이다 — upsert의 `WHERE ... revoked_at < to_timestamp($2)` 가드로 `revoked_at`은 전진만 하므로, 캐시된 값은 최대 TTL 동안 *허용* 방향으로만 낡을 수 있고 더 새로운 컷오프가 이미 죽인 세션을 그 창 밖에서 되살릴 수는 없다. 비용은 로그아웃 후 최대 5초의 잔여 유효성(이미 12h인 토큰 수명 대비 무의미한 연장), 이득은 통제의 정상상태 비용이 요청당 1커넥션+4왕복에서 sub당 TTL당 1회로 떨어지는 것. 실패는 캐시하지 않는다(일시적 Aurora 블립이 TTL 내내 폐기를 무력화하지 못하게). 로그아웃 쓰기는 자기 컨테이너의 캐시 엔트리를 즉시 무효화하지만 **컨테이너별 캐시**이므로 다른 ECS 태스크는 TTL 만료 시점에 수렴한다(감수한 트레이드오프).

Revocation checks are **fail-open** on Aurora unavailability (`isRevoked()` returns `false` on exception/timeout) — a single Aurora blip must not log out every user in the app; that's simply reverting to the pre-feature status quo (no revocation at all), not a new failure domain. The query carries a short timeout (3s, via `Promise.race`) so an Aurora cold-start/pool exhaustion that hangs the query degrades the same fail-open way instead of stalling the whole auth path. Because fail-open is a **deliberate availability-first choice**, its compensating control is **detection**: log metric filters on `revocation_check_failed` / `revocation_write_failed` over the web log group plus CloudWatch alarms (`workload.tf`, ungated — sustained count over 2× 5-min periods, so a single blip doesn't page) surface the case where the control has silently switched itself off.

The cutoff lookup goes through a **5-second per-sub in-process cache** (`web/lib/auth.ts`). A dedicated connection checkout + 4 round-trips (BEGIN/SET LOCAL/SELECT/COMMIT) on every authenticated request mutually starves the app's data queries on a `max: 3` pool (pool exhaustion → the revocation check times out → fail-open silently switches the control off). The cache is safe because the cutoff is **monotonically non-decreasing** — the upsert's `WHERE ... revoked_at < to_timestamp($2)` guard means `revoked_at` only ever advances, so a cached value can only be stale in the *permissive* direction for at most the TTL, and can never resurrect a session a newer cutoff already killed beyond that window. The cost is ≤5s of residual validity after logout (a negligible extension of an already-12h token lifetime); the gain is dropping the control's steady-state cost from one connection + 4 round-trips per request to one per sub per TTL. Failures are never cached (a transient Aurora blip must not disable revocation for a whole TTL). A signout write invalidates its own container's entry immediately, but the cache is **per container** — other ECS tasks converge only at TTL expiry (the accepted tradeoff).

**Hosted UI PKCE 플로우(`/_callback`)는 다크 폴백으로 보존**된다(엣지 `start_login`/`handle_callback`, flow-cookie). MFA·페더레이션이 필요하면 이 경로로 복구 가능하나, 상시 경로는 자체 `/login`이다. **단 비밀번호 재설정은 더 이상 이 폴백으로도 안 된다**(PR #203): `account_recovery_setting = admin_only` 가 self-service 복구를 아예 제거했으므로 Hosted UI 의 "Forgot password" 도 동작하지 않는다 — 재설정은 `admin-set-user-password --permanent` 로 운영자가 한다. 이건 의도된 대가다(아래 계정 복구 인수 항목).

**The Hosted UI PKCE flow (`/_callback`) is retained as a dark fallback** (edge `start_login`/`handle_callback`, flow cookie). MFA and federation are recoverable via this path, but the day-to-day path is the self-hosted `/login`.
**Password reset is no longer recoverable even here** (PR #203): `account_recovery_setting = admin_only`
removes self-service recovery altogether, so the Hosted UI's "Forgot password" does not work either —
resets are an operator action (`admin-set-user-password --permanent`). That is the intended cost; see the
account-recovery-takeover item below.

### 3. 관리자 모델 — SSM + Cognito 그룹 / Admin model — SSM + Cognito group

관리자 강제는 서버측에서 수행한다(UI 숨김은 표시적 장치일 뿐 강제 경계가 아니다). 모든 변경 라우트는 검증된 ID 토큰에서 신원을 추출한 뒤 관리자 여부를 재확인한다. 사용자는 **Cognito `ADMIN_GROUP`**(`cognito:groups` 클레임)에 속하거나 **SSM 파라미터 allowlist**(`SSM_ADMIN_EMAILS_PARAM`, 쉼표 구분, 5분 캐시)에 이메일이 있으면 관리자로 판정된다(`web/lib/admin.ts`). 판정은 **fail-closed**다. 설정의 source of truth는 SSM이다.

**개정 (PR #203):** `verifyUser()` 는 이제 **`email_verified === true` 일 때만** 토큰의 `email` claim 을 채택한다(unverified 주소는 `undefined` 로 떨어진다). Cognito 는 기본적으로 사용자가 자기 email 을 바꿀 수 있게 했으므로(이 PR 이 client `write_attributes` 축소 + `allow_admin_create_user_only` 로 그 경로를 닫기 전까지) unverified claim 을 신뢰하면 email 기반 소유권·admin 판정을 self-service 로 통과할 수 있었다. 따라서 **SSM allowlist 판정도 verified email 에만 적용된다** — allowlist 에 있는 주소가 해당 계정에서 verified 가 아니면 그 사용자는 admin 이 아니다(fail-closed 방향이지만, 배포 시 allowlist 대상들의 verified 상태를 먼저 확인해야 lockout 을 피한다). user pool client 의 `write_attributes` 에서도 `email`·`email_verified` 를 제거했다.

**계정 복구를 통한 인수 — 이 PR 에서 닫았다.** Cognito 의 `ForgotPassword`/`ConfirmForgotPassword` 는 무서명 public API 이고, 확인 코드는 **그 계정의 email 주소로** 간다. 따라서 **기본 설정에서는** 퇴사자의 재할당 mailbox 를 쥔 사람이 그 사람의 **기존 계정 자체를 인수**할 수 있었고, 그러면 email-keyed 행뿐 아니라 sub-keyed 행까지 전부 넘어간다 — `write_attributes` 축소도, `allow_admin_create_user_only` 도, backfill 의 계정 나이 게이트도 이 경로는 막지 못한다. 이건 이 PR 이 만든 결함이 아니라 **email 기반 복구의 신뢰 모델 자체**다: mailbox 를 신뢰하는 순간 mailbox 보유자가 계정 보유자다. **닫은 방법: `account_recovery_setting { recovery_mechanism { name = "admin_only" } }`** — self-service 복구 경로 자체를 없앤다(리뷰 지적으로 채택: 이 항목은 직전까지 '수용된 잔여 위험'으로 기록돼 있었다). 대가는 사용자가 자기 비밀번호를 재설정할 수 없다는 것이고, 이 pool 은 이미 그렇게 동작한다 — 계정은 admin 이 만들고 자체 `/login` 은 Cognito challenge 를 처리하지 않으므로 비밀번호 분실은 이미 운영자 작업이다(`admin-set-user-password --permanent`). AWS 자격증명을 가진 운영자는 마지막 admin 까지 언제든 복구할 수 있다. 그리고 남은 두 통제: (1) **offboarding 에서 Cognito 사용자를 삭제/비활성화**한다 — 절차와 **순서는 `docs/runbooks/user-offboarding.md` 가 정본**이다(여기서 순서를 다시 적지 않는다 — 그 순서는 Aurora 장애 시 fail-open 을 피하려고 DB 무관 단계를 앞에 두도록 짜여 있고, 이 문서가 별도로 나열하면 어긋난다. 리뷰 지적: 실제로 어긋나 있었다). 핵심은 `admin-disable-user` 만으로는 끊기지 않는다는 것이다: id_token 은 발급 후 취소 불가라 revocation 없이는 최대 12h 로그인 상태가 유지되고, allowlist 는 계정이 아니라 주소를 신뢰하므로 항목을 남기면 그 주소를 나중에 쥔 사람이 admin 을 물려받는다. 계정을 없애는 것은 **이미 아는 비밀번호·살아있는 세션·남은 admin 권한**으로 생기는 접근을 끝내는 것이다 — *복구* 경로 자체는 위의 `admin_only` 가 이미 닫았으므로 같은 문에 자물쇠를 두 번 거는 게 아니다(리뷰 지적: 직전 문장은 복구를 닫는 것이 오프보딩이라고 써서 두 단락 위 서술과 충돌했다). (2) MFA(`mfa_configuration` 현재 `OFF`)는 이 경로의 대안으로 검토했다가 **부적절**하다고 판정했다: MFA 는 **이미 enroll 된 계정의** 복구만 막고, 미등록 계정은 비밀번호 재설정 후 `MFA_SETUP` challenge 를 공격자가 스스로 완료할 수 있다(PR #203 리뷰 MAJOR — 직전 서술은 MFA 가 '남겨둔 계정까지 덮는다'고 과대 기술했다). 게다가 자체 `/login` 은 Cognito challenge 를 처리하지 않으므로 롤아웃에 Hosted UI 경로가 선행돼야 한다. 즉 이 경로는 `admin_only` 가 닫고, MFA 는 세션 하이재킹 등 **다른** 위협에 대한 별개 하드닝으로 남는다.

**Takeover via account recovery — closed in this PR.** Cognito's `ForgotPassword` /
`ConfirmForgotPassword` are unsigned public APIs and the confirmation code goes **to the account's email
address**. Whoever holds a departed colleague's reassigned mailbox can therefore take over that person's
EXISTING account, and at that point everything is theirs — sub-keyed rows included, not just email-keyed
ones. Narrowing `write_attributes`, `allow_admin_create_user_only`, and the backfill's account-age gate
all fail to stop this path. It is not a defect introduced here: it is the trust model of email-based
recovery, where trusting the mailbox means the mailbox holder is the account holder. The control that closes it is
**`account_recovery_setting { recovery_mechanism { name = "admin_only" } }`**, which removes the
self-service recovery path outright — adopted on review, having been recorded as accepted residual risk
until then. The cost is that users cannot reset their own password, which is how this pool already
behaves: accounts are admin-created and the self-hosted `/login` does not implement Cognito challenges,
so a forgotten password is already an operator task (`admin-set-user-password --permanent`). An operator
with AWS credentials can still recover any account, including the last admin. Alongside it: (1) **delete or disable the Cognito user during
offboarding** — the procedure, including the ordering trap (deleting the account without disabling
`report_schedules` leaves the diagnosis running and billing Bedrock), is
`docs/runbooks/user-offboarding.md`, which is authoritative for the ORDER as well — this document does not
restate it, because that order is arranged to keep the DB-independent steps ahead of the Aurora ones (so an
outage cannot leave the account enabled) and a second listing drifts from it, as this one had (review
finding). `admin-disable-user` alone does not cut
access — an id_token cannot be retracted once issued, so without the revocation they stay logged in for up
to 12h — and the allowlist trusts an address rather than an account, so an entry left behind hands admin to
whoever holds that address next. Removing the account is what ends the access that a
still-known password, a live session and standing admin rights provide — the RECOVERY path itself is
already closed by `admin_only` above, so this is not a second lock on the same door (review finding: the
previous sentence said offboarding was the only thing closing recovery, two paragraphs after declaring
that admin_only closes it). MFA (`mfa_configuration` is `OFF` today) was
considered for this path and rejected as the wrong instrument: it blocks recovery only for accounts that
are ALREADY ENROLLED, while an unenrolled one lets the attacker reset the password and then complete the
`MFA_SETUP` challenge themselves (PR #203 review MAJOR — this previously claimed MFA covers the accounts
nobody remembered to remove). Its rollout would also need a Hosted UI path, since the self-hosted `/login`
does not handle Cognito challenges. So `admin_only` closes this path, and MFA remains separate hardening
for other threats such as session hijacking.

**효력 시점: 신규 토큰부터다.** `verifyUser()` 는 토큰 안의 claim 만 본다. id_token 유효기간이 12h 이므로 배포 **이전에** 발급된 토큰(`email_verified: true` + 그 당시 email)은 최대 12h 동안 계속 legacy 소유권 매칭을 통과한다 — 컨트롤을 켠 그 순간부터 닫히는 게 아니다. 반대 방향도 있다: 배포 직후 verified 로 올려준 admin 은 **재로그인 전까지 admin 이 아니다**(옛 토큰에 `email_verified` 가 없거나 false). 따라서 (a) 이 변경이 즉시 유효해야 한다면 강제 재인증(쿠키 무효화)을 함께 하고, (b) 아니라면 12h 가 지나기 전에는 "닫혔다"고 간주하지 않는다.

Admin enforcement is server-side (UI hiding is cosmetic, not the enforcement boundary). Every mutating route extracts identity from the verified ID token and re-checks admin status. A user is admin if they are in the **Cognito `ADMIN_GROUP`** (`cognito:groups` claim) **OR** their email is in an **SSM-parameter allowlist** (`SSM_ADMIN_EMAILS_PARAM`, comma-separated, 5-min cache) — `web/lib/admin.ts`. The check is **fail-closed**. SSM is the configuration source of truth.

**Amended (PR #203):** `verifyUser()` now adopts the token's `email` claim **only when
`email_verified === true`** (an unverified address becomes `undefined`). Cognito let a user change their own
email by default — until this PR narrowed the client's `write_attributes` and set
`allow_admin_create_user_only` — so honouring an unverified claim let email-based ownership *and* the admin check be
passed self-service. The SSM allowlist therefore applies **only to verified emails** — an address on
the allowlist that is not verified on its account does not grant admin. That is the fail-closed
direction, but check the verified state of every allowlisted address before deploying, or those
admins are locked out. The pool client's `write_attributes` also no longer includes `email` or
`email_verified`.

**These controls take effect for NEWLY ISSUED tokens only.** `verifyUser()` reads claims out of the
token, and an id_token is valid for 12h, so a token minted BEFORE the deploy — carrying
`email_verified: true` and whatever email it had then — keeps passing the legacy ownership match for
up to 12 more hours. The reverse also holds: an admin whose address you verify at deploy time is not
an admin until they log in again, because their current token says otherwise. So either force
re-authentication (invalidate the cookie) when the change must be immediate, or do not treat the hole
as closed until 12h have passed.

```
Browser ──HTTPS──► CloudFront
                       │
                       ▼
            Lambda@Edge viewer-request (us-east-1)
            RS256 JWKS + iss/aud/token_use
              │                    │
   no/invalid │                    │ valid awsops_token
       token  ▼                    ▼
       302 → /login        forward → internal ALB → Fargate (Next.js BFF)
                                     │
                                     ▼
                           admin gate (web/lib/admin.ts)
                           Cognito ADMIN_GROUP ∪ SSM allowlist, fail-closed
```

## Consequences / 영향

### Positive / 긍정적
- 엣지 거부로 오리진이 미인증 트래픽·캐시 응답에 노출되지 않고, RS256 JWKS 검증으로 위조·변조 토큰을 차단한다. / Edge rejection keeps the origin off unauthenticated traffic and cached responses; RS256 JWKS verification rejects forged/altered tokens.
- 자체 `/login` 폼은 대시보드와 일치하는 테마(AgentCore teal)를 제공하고 Cognito 크롬 단절이 없다. 엣지 RS256 검증기·`awsops_token` 쿠키 계약이 불변이라 신뢰 경계(엣지 검증)가 종단 보존된다. / The self-hosted `/login` form is on-brand (AgentCore teal) with no Cognito-chrome break; the edge RS256 validator and `awsops_token` cookie contract are unchanged, preserving the validate-at-edge trust boundary end-to-end.
- thin-BFF는 무상태·무자격증명 유지: `InitiateAuth`가 무서명/공개라 task-role 부여·SDK 의존성이 없고, 브루트포스 방어는 Cognito에 위임된다. / The thin-BFF stays stateless and credential-free: `InitiateAuth` is unsigned/public, so no task-role grant or SDK dependency is added; brute-force defense is delegated to Cognito.
- 최소권한: `ALLOW_REFRESH_TOKEN_AUTH` 생략으로 장수명 refresh 토큰이 브라우저/BFF에서 완전히 배제된다. / Least-privilege: omitting `ALLOW_REFRESH_TOKEN_AUTH` keeps long-lived refresh tokens entirely out of the browser/BFF.
- 관리자 신원이 검증된 ID 토큰에서 균일하게 전파되어 멀티 어카운트 필터링·Memory 격리·관리자 게이트가 동일 신원을 키로 쓴다. SSM이 source of truth라 신규 인프라(Identity Pool 등) 없이 감사·구성된다. / Admin identity propagates uniformly from the verified ID token, keyed by the same identity across multi-account filtering, Memory isolation, and the admin gate; SSM as source of truth makes it auditable without new infrastructure (no Identity Pool).

### Negative / 부정적
- 앱이 원시 비밀번호를 처리한다(HTTPS 경유, 미로깅, 미영속) — Hosted UI 경로엔 없던 자격증명 처리 표면. / The app handles raw passwords (over HTTPS, never logged, never persisted) — a credential-handling surface the Hosted-UI path did not have.
- 주 경로가 Hosted-UI MFA/비밀번호 재설정/페더레이션을 잃는다. 챌린지(`NEW_PASSWORD_REQUIRED` 등)는 인라인 플로우 대신 단일 "관리자 문의" 메시지로 노출된다(보존된 PKCE 다크 폴백으로 복구 가능 — **비밀번호 재설정은 예외**: PR #203 의 `account_recovery_setting = admin_only` 로 self-service 재설정 자체가 없어졌으므로 폴백으로도 안 되고 `admin-set-user-password` 가 유일한 경로다). / The primary path loses Hosted-UI MFA / password reset / federation; challenges (`NEW_PASSWORD_REQUIRED`, etc.) surface as a single "contact your administrator" message rather than an inline flow (recoverable via the retained PKCE dark fallback — EXCEPT password reset: PR #203's `account_recovery_setting = admin_only` removes self-service reset entirely, so the fallback cannot do it either and `admin-set-user-password` is the only route).
- 12h id_token은 유출 쿠키의 유효 창을 넓힌다. HttpOnly + Secure + SameSite=Lax, refresh 토큰 부재, 그리고 §2-4의 signout-on-revocation으로 완화된다(폐기 기록 쓰기가 성공하고 조회 시점에 Aurora가 가용하면 유출 토큰이 무효화됨 — 두 조건 모두 best-effort/fail-open이므로 무조건적 즉시 보장은 아님). / The 12h id_token widens the window in which a leaked cookie is valid; mitigated by HttpOnly + Secure + SameSite=Lax, the absence of any refresh token, and §2-4's signout-on-revocation (a leaked token is invalidated once the revocation write succeeds and Aurora is available for the revocation check — both are best-effort/fail-open, not an unconditional immediate guarantee).
- 폐기 검사는 인증 요청에 Aurora 왕복을 추가한다 — 단 sub별 5초 TTL 캐시(§2-4) 덕분에 실제 왕복은 캐시 미스에서만 발생한다(fail-open + 3s 클라이언트측 `Promise.race` 타임아웃과 그 위의 서버측 `SET LOCAL statement_timeout`[pentest-remediation P3-review MAJOR-2, 커넥션 자체를 `max: 3` 풀에서 회수해 풀 고갈을 막음]로 완화하지만 지연 자체는 남는다). 매 요청 신원 확인은 BFF-side 라우트에만 적용되고 Lambda@Edge는 여전히 JWT-only이므로, `verifyUser()`를 누락한 라우트는 폐기를 우회한다. / Revocation checks add an Aurora round-trip on cache misses only — a 5s per-sub TTL cache (§2-4) absorbs the rest (mitigated by fail-open + a 3s client-side `Promise.race` timeout backed by a server-side `SET LOCAL statement_timeout` [pentest-remediation P3-review MAJOR-2, reclaims the connection itself from the `max: 3` pool so a hung query can't exhaust it], but the latency itself remains). Per-request revocation is enforced only on BFF-side routes — Lambda@Edge stays JWT-only — so any route that omits `verifyUser()` bypasses revocation.
- RBAC 세분화가 없다 — 관리자는 all-or-nothing이며 특정 화면만 위임할 수 없다. / No RBAC granularity — admin is all-or-nothing; a user cannot be scoped to a single surface.
- `next`는 매 로그인마다 오픈 리다이렉트에 대해 정제되어야 한다 — 아니면 폼이 오픈 리다이렉트 벡터가 된다. / `next` must be sanitized against open redirect on every login, or the form becomes an open-redirect vector.

## 6 Pillars (보안 / Security)

- **Identity & access management**: 신원은 Cognito User Pool 단일 출처. 엣지에서 RS256 JWKS로 모든 토큰을 검증하고(서명 + `iss`/`aud`/`token_use`), 관리자 권한은 검증된 ID 토큰의 Cognito 그룹·SSM allowlist로 서버측 fail-closed 게이팅한다. / Single identity source (Cognito User Pool); all tokens RS256-JWKS-verified at the edge (signature + `iss`/`aud`/`token_use`); admin privilege gated server-side, fail-closed, off the verified ID token's Cognito group / SSM allowlist.
- **최소권한 / Least privilege**: Cognito 클라이언트는 `ALLOW_USER_PASSWORD_AUTH`만, refresh 플로우 미부여. Lambda@Edge 역할은 기본 실행 권한만(AWS API 호출 없음). BFF는 무서명 공개 `InitiateAuth`만 호출해 task-role 자격증명을 보유하지 않는다. / Cognito client carries only `ALLOW_USER_PASSWORD_AUTH`, no refresh flow; the Lambda@Edge role holds only basic execution (no AWS API calls); the BFF calls only the unsigned public `InitiateAuth`, holding no task-role credentials.
- **토큰 보호 / Token protection**: ID 토큰은 `HttpOnly + Secure + SameSite=Lax` 쿠키로만 보관 — JS 접근 불가, HTTPS 전용, 크로스사이트 POST CSRF 저항. refresh 토큰은 브라우저/BFF에 절대 저장되지 않는다. / The ID token lives only in an `HttpOnly + Secure + SameSite=Lax` cookie — inaccessible to JS, HTTPS-only, CSRF-resistant; refresh tokens never reach the browser/BFF.
- **계정 열거 방지 / Account-enumeration resistance**: 로그인 오류는 단일 코드(`invalid_credentials`)로 수렴해 계정 존재를 노출하지 않는다. / Login errors collapse to a single `invalid_credentials` code so account existence is not disclosed.
- **오픈 리다이렉트 방지 / Open-redirect defense**: `next`는 엄격 검증(`/` 시작, 2번째 문자 ≠ `/`·`\`, `\` 미포함, ≤2048; `\`→`/` 정규화 우회 차단). / `next` is strictly validated (starts `/`, 2nd char ≠ `/`·`\`, no `\`, ≤2048; the `\`→`/` normalization bypass is covered).
- **브루트포스 / Brute force**: 무상태 thin-BFF는 시도 상태를 보관하지 않고 스로틀/lockout을 Cognito 내장 방어에 위임한다. / The stateless thin-BFF keeps no attempt state and delegates throttle/lockout to Cognito's built-in defenses.

## References / 참조

- `terraform/v2/foundation/auth.tf` — Cognito User Pool / app client / 12h token validity / `ALLOW_USER_PASSWORD_AUTH`-only.
- `terraform/v2/foundation/edge-lambda/cognito_edge.py.tftpl` — Lambda@Edge RS256 validator, `/login` redirect, `is_public()`, retained PKCE fallback (`start_login`/`handle_callback`).
- `web/app/login/page.tsx`, `web/app/api/auth/login/route.ts`, `web/lib/login.ts` — self-hosted login form + BFF `InitiateAuth`.
- `web/app/api/auth/signout/route.ts`, `web/components/shell/{ShellGate,UserIdentity}.tsx` — signout + shell gating.
- `web/lib/admin.ts` — admin gate (Cognito `ADMIN_GROUP` ∪ SSM `SSM_ADMIN_EMAILS_PARAM` allowlist, 5-min cache, fail-closed).
- `web/lib/auth.ts` (`isRevoked`, `revokeSessionsFor`, `verifyUserForSignout`) — §2-4 server-side revocation: per-sub cutoff, 3s fail-open timeout, 5-min signout clockTolerance.
- `terraform/v2/foundation/migrations/01KYP4Z5MKY1BJWCXFVG1420PZ_session_revocations.sql` (`session_revocations`) — revocation table (pentest-remediation P1-1, Finding 1; not in the frozen `data/schema.sql` baseline — see `migrations/README.md`).
