# Runbook: 사용자 오프보딩 (Cognito) / User Offboarding (Cognito)

사람이 떠날 때 v2 Cognito 계정을 처리하는 절차. **미룰 수 없는 이유**: 떠난 사람은 자기 비밀번호를 알고 있고,
손에 든 세션 쿠키는 최대 12h 살아 있고, admin allowlist 항목과 예약 진단은 계정과 무관하게 계속 작동한다.
(주소 재할당을 통한 *계정 인수* 는 별개 통제로 닫혀 있다 — ADR-002 의 `account_recovery_setting = admin_only`.)

What to do with a v2 Cognito account when a person leaves. **Why it cannot wait**: the departing person
knows their password, the session cookie in their hand lives for up to 12h, and their admin-allowlist
entry and scheduled diagnoses keep working regardless of the account. (*Takeover* via a reassigned
address is closed by a separate control — `account_recovery_setting = admin_only`, ADR-002.)

## 증상 / Symptom
떠난 사람의 리소스가 다른 사람 화면에 보이거나, 떠난 사람 명의로 진단·스케줄이 계속 실행된다. 또는
정기 명부 감사에서 pool 에 알 수 없는 사용자가 있다.

A departed person's resources appear under someone else, diagnoses or schedules keep running in their
name, or a roster audit finds users in the pool nobody recognises.

## 원인 후보 / Candidate causes
1. **계정이 그대로 살아 있다** — 오프보딩에서 Cognito 를 건드리지 않았다. 가장 흔하다.
2. **주소 재할당 + 계정 복구** — `ForgotPassword`/`ConfirmForgotPassword` 는 무서명 public API 이고 확인
   코드는 그 계정의 email 로 간다. **`account_recovery_setting = admin_only`(ADR-002) 가 이 경로를 닫는다** — 이 런북의 몫이 아니므로,
   pool 설정이 실제로 그렇게 되어 있는지만 확인한다(`describe-user-pool`). 열려 있다면 그건 인프라 회귀이고,
   그 상태에서는 mailbox 를 쥔 사람이 곧 계정 보유자다.
3. **self-registered 잔존 계정** — `allow_admin_create_user_only` 는 앞으로의 signup 만 막는다.

1. **The account is still alive** — offboarding never touched Cognito. The common case.
2. **Address reassignment + account recovery** — `ForgotPassword`/`ConfirmForgotPassword` are unsigned
   public APIs and the code goes to the account's email. **`account_recovery_setting = admin_only` (ADR-002)
   closes this path** — not this runbook's job, so all that is needed here is confirming the pool really
   has it (`describe-user-pool`). If it does not, that is an infrastructure regression, and until it is
   fixed the mailbox holder is the account holder.
3. **Leftover self-registered accounts** — `allow_admin_create_user_only` only stops future signups.

## 확인 / Verification
```bash
# 환경변수는 web task def 와 같은 값 / same values the web task definition uses
SSM_ADMIN_EMAILS_PARAM=${SSM_ADMIN_EMAILS_PARAM:-/ops/awsops-v2/admin_emails}

# 아래 SQL 은 파괴적이다. DSN 이 비어 있으면 psql 이 로컬 소켓에 붙어 엉뚱한 DB 를 건드릴 수 있으므로
# `:?` 로 fail-closed 한다. 앱과 같은 IAM DB auth 를 쓴다(master secret 아님) — 아래가 완결된 절차다.
# (이전 판은 "v1-to-v2-aurora-backfill.md 와 같은 방식"이라고만 했는데 그 런북은 master-secret 경로만
# 문서화해서 따라할 수 없었다 — 리뷰 지적, 2개 모델.)
# The SQL below is destructive: an empty DSN would let psql fall back to a local socket and hit the wrong
# database, so `:?` fails closed. Authenticate the way the app does — IAM DB auth, not the master secret.
# This is the complete recipe (the previous text pointed at v1-to-v2-aurora-backfill.md, which documents
# only the master-secret path, so it was not followable — review finding, 2 models).
# set -e 를 이 블록에도 건다. 없으면 terraform/aws 명령이 실패해도 대입이 진행되어 endpoint 가 빈 문자열이
# 되고, DSN 은 `postgresql://awsops_web@:5432/...` 처럼 **비어 있지 않게** 만들어져 `:?` 가드를 통과한다
# (리뷰 지적: 그 가드는 fail-closed 가 아니었다). 그래서 각 조각을 개별로 검증한다.
# `set -e` here too: without it a failing terraform/aws call still assigns, the endpoint ends up empty, and
# DSN comes out NONEMPTY (`postgresql://awsops_web@:5432/...`) — sailing straight through the `:?` guard
# (review finding: that guard was not fail-closed). So each piece is checked on its own.
set -euo pipefail
AWS_REGION=${AWS_REGION:-ap-northeast-2}
PGUSER=${PGUSER:-awsops_web}          # 앱과 같은 역할 / the role the app uses
AURORA_ENDPOINT=$(terraform -chdir=terraform/v2/foundation output -raw aurora_endpoint)
: "${AURORA_ENDPOINT:?terraform output gave no aurora_endpoint}"
case "$AURORA_ENDPOINT" in *.rds.amazonaws.com) ;; *) echo "unexpected endpoint: $AURORA_ENDPOINT"; exit 1;; esac
PGPASSWORD=$(aws rds generate-db-auth-token --hostname "$AURORA_ENDPOINT" --port 5432 \
  --username "$PGUSER" --region "$AWS_REGION")     # 15분 유효 / valid 15 minutes
: "${PGPASSWORD:?generate-db-auth-token returned nothing}"
export PGPASSWORD
DSN="postgresql://${PGUSER}@${AURORA_ENDPOINT}:5432/awsops?sslmode=require"
```

```bash
V2_POOL=$(terraform -chdir=terraform/v2/foundation output -raw cognito_user_pool_id)

# 주소는 **셸 문법을 거치지 않고** 읽는다. 이 런북의 위협모델이 "명부에 없는 self-registered 계정"이라
# 주소는 공격자가 고른 값일 수 있고, `EMAIL='<여기>'` 처럼 따옴표 안에 붙여넣게 하면 그 붙여넣기 자체가
# 주입 지점이 된다 — `';touch /tmp/pwned;'` 를 넣으면 실제로 실행된다(리뷰 지적, 재현 확인).
# `read -r` 은 입력을 한 줄의 리터럴로 받으므로 셸이 그 내용을 해석하지 않는다. 그리고 **`< /dev/tty` 가
# 필수다**: 이 블록은 통째로 붙여넣는 용도이고, 그냥 `read` 면 붙여넣은 **다음 줄을 주소로 삼아버린다**
# (재현 확인 — EMAIL 에 스크립트 한 줄이 들어가고 나머지가 그대로 실행된다). 이 런북은 사람이 tty 앞에서
# 실행하는 것을 전제한다 — 비대화형 경로는 두지 않는다(아래 확인 단계 주석 참조).
# Read the address WITHOUT shell syntax. This runbook's threat model is "self-registered accounts nobody
# recognises", so the address may be attacker-chosen — and telling an operator to paste it inside quotes
# (`EMAIL='<here>'`) makes that paste the injection point: `';touch /tmp/pwned;'` really does run
# (reproduced). `read -r` takes the line literally; the shell never parses it. `< /dev/tty` is required
# too: this block is meant to be pasted whole, and a bare `read` would consume the pasted block's OWN
# NEXT LINE as the address (also reproduced). This runbook assumes a human at a tty; there is deliberately
# no non-interactive path (see the confirmation step below for why).
# 비어 있을 때만 묻는 방식은 쓰지 않는다 — 같은 셸에서 **앞사람 오프보딩의 EMAIL 이 남아 있으면** 프롬프트가
# 조용히 건너뛰어지고 파괴적 명령이 엉뚱한 사람에게 실행된다(리뷰 지적). 그래서 조건 없이 항상 묻는다.
# Do NOT use "prompt only if empty": a leftover EMAIL from the PREVIOUS person's offboarding in the same
# shell would silently skip the prompt and point the destructive commands at the wrong person (review
# finding). So it always prompts, unconditionally.
unset EMAIL SUB                        # 이전 실행의 잔여값 제거 / drop anything left from a previous run
printf 'departing address: '; IFS= read -r EMAIL < /dev/tty
: "${EMAIL:?no address entered}"

# 1) pool 전체를 명부와 대조 — sub 도 함께 뽑는다(아래 단계들이 요구한다)
#    Reconcile the pool against your roster, and project the sub too: the steps below need it, and the
#    earlier version of this command dropped Attributes while telling you to read the sub from them.
aws cognito-idp list-users --user-pool-id "$V2_POOL" \
  --query 'Users[].{u:Username,sub:Attributes[?Name==`sub`]|[0].Value,created:UserCreateDate,status:UserStatus,enabled:Enabled}' \
  --output table

# 이 한 사람의 sub / this one person's sub
SUB=$(aws cognito-idp admin-get-user --user-pool-id "$V2_POOL" --username "$EMAIL" \
  --query 'UserAttributes[?Name==`sub`]|[0].Value' --output text)
: "${SUB:?admin-get-user returned no sub — check the username}"

# 2) 그 사람 명의로 남아있는 상태 / what still exists in their name.
#    -v + :'name' 로 psql 이 인용을 담당한다 — 문자열 보간이 아니다.
#    psql does the quoting via -v + :'name'; nothing is interpolated into the SQL text.
psql "$DSN" -v sub="$SUB" -v email="$EMAIL" -c \
  "SELECT 'schedules' AS what, count(*) FROM report_schedules WHERE user_sub IN (:'sub', :'email') AND enabled
   UNION ALL SELECT 'reports', count(*) FROM diagnosis_reports WHERE requested_by IN (:'sub', :'email') AND deleted_at IS NULL"
```

## 조치 / Action
```bash
# 이 블록만 복사해 실행하는 경우가 많으므로 가드를 여기에도 둔다 — 위 '확인' 블록에만 있으면 소용없다.
# The guard is repeated here because this is the block people copy on its own; having it only in the
# Verification block above protects nothing. Unset DSN => psql would silently use a local socket.
set -euo pipefail
: "${DSN:?set DSN (postgresql://<user>@<aurora-endpoint>:5432/awsops?sslmode=require) first}"
: "${V2_POOL:?set V2_POOL (terraform -chdir=terraform/v2/foundation output -raw cognito_user_pool_id)}"
: "${SSM_ADMIN_EMAILS_PARAM:=/ops/awsops-v2/admin_emails}"
: "${EMAIL:?set EMAIL first — run the Verification block above, which prompts for it}"
# 아포스트로피를 쓰지 않는다 — `${VAR:?...}` 안의 `'` 는 인용 상태를 열어 **블록 전체 파싱을 깨뜨린다**
# (리뷰 지적으로 발견; bash -n 으로 재현).
# No apostrophes here: a `'` inside `${VAR:?...}` opens a quote state and breaks the WHOLE block's parse
# (found by review, reproduced with bash -n).
: "${SUB:?set SUB by running the Verification block above (its admin-get-user step)}"

# 여기서부터 파괴적이다. 값을 눈으로 확인하고 주소를 다시 입력하게 한다 — 잔여 변수/오타로 엉뚱한 사람을
# 지우는 것을 막는 마지막 관문이며, 이 확인 없이는 어떤 명령도 실행되지 않는다.
# Everything below is destructive. Show the resolved values and require the address to be typed again: the
# last stop against a stale variable or a typo taking out the wrong person. No command runs without it.
printf 'about to offboard:\n  EMAIL=%s\n  SUB=%s\nretype the address to proceed: ' "$EMAIL" "$SUB"
# 확인은 **반드시 tty 에서** 받는다. 비대화형 모드를 뒀다가 두 번 연속 지적을 받았는데, 근본 원인은 환경변수로는
# "방금 사람이 이 주소를 확인했다"를 증명할 수 없다는 것이다 — 확인용 변수를 추가해도 그 변수 자체가 앞사람
# 실행의 잔여값일 수 있다. 그래서 이 블록에는 비대화형 경로를 두지 않는다. 자동화가 필요하면 각자 래퍼를
# 만들고 그 위험을 각자 감수한다.
# Confirmation comes from the TTY, always. Two consecutive review findings landed on the non-interactive
# path, and the root cause is that an environment cannot prove "a human just checked this address" —
# adding a confirmation variable only moves the staleness into that variable. So this block has no
# non-interactive path. Automate it yourself if you must, and own that risk.
IFS= read -r CONFIRM < /dev/tty
[ "$CONFIRM" = "$EMAIL" ] || { echo 'mismatch — nothing was done'; exit 1; }

# SUB 은 변수라 잔여값일 수 있다. EMAIL 로 다시 조회해 일치를 강제한다 — 이러면 stale SUB 은 모드와 무관하게
# 통과하지 못한다(session_revocations 는 sub 로 쓰므로 틀리면 엉뚱한 사람의 세션을 끊는다).
# SUB is just a variable and may be left over. Re-resolve it from EMAIL and require a match, which kills
# the stale-SUB case in BOTH modes — session_revocations is keyed by sub, so a wrong one cuts the wrong
# person's session.
SUB_NOW=$(aws cognito-idp admin-get-user --user-pool-id "$V2_POOL" --username "$EMAIL" \
  --query 'UserAttributes[?Name==`sub`]|[0].Value' --output text)
[ -n "$SUB_NOW" ] && [ "$SUB_NOW" = "$SUB" ] \
  || { echo "SUB does not belong to $EMAIL (resolved '$SUB_NOW') — nothing was done"; exit 1; }

# 순서 주의: `set -euo pipefail` 이므로 앞 단계가 실패하면 뒤는 실행되지 않는다. 그래서 **DB 에 의존하지
# 않는 단계를 먼저** 둔다 — Aurora 장애 중에 DB 단계가 먼저 있으면 거기서 abort 되어 계정 비활성화·admin
# 회수까지 도달하지 못하고 fail-OPEN 이 된다(리뷰 지적).
# Order matters: with `set -euo pipefail` a failure stops everything after it, so the steps that do NOT
# depend on the database come FIRST. With the DB step first, an Aurora outage aborts the script before the
# account is disabled and before admin rights are pulled — fail-OPEN (review finding).

# --- DB 를 쓰지 않는 단계 먼저 / the steps that need no database, first ---

# 1) 계정 비활성화 — 새 로그인을 즉시 막는다 / Disable the account: blocks new logins now
aws cognito-idp admin-disable-user --user-pool-id "$V2_POOL" --username "$EMAIL"

# 2) admin 권한 회수 — SSM allowlist 는 EMAIL 로 매칭하므로 계정을 지워도 항목이 남고, 주소가 재할당되면
#    새 보유자가 admin 을 물려받는다. **DB 단계보다 앞에 둔다** — 뒤에 두면 Aurora 장애 시 여기 도달 전에
#    abort 되어 allowlist 항목이 살아남는다(리뷰 지적).
#    Pull admin rights. The allowlist matches on EMAIL, so the entry outlives the account and a reassigned
#    address inherits admin. This goes BEFORE the DB steps: behind them, an Aurora outage aborts the script
#    first and the entry survives (review finding).
aws ssm get-parameter --name "$SSM_ADMIN_EMAILS_PARAM" --query Parameter.Value --output text
#    타입은 StringList 다(workload.tf) — `--type String` 은 AWS 가 거부한다.
#    The parameter is a StringList (workload.tf); `--type String` is rejected on overwrite.
#    새 목록도 붙여넣기이므로 tty 에서 읽는다(주소 하나가 적대적일 수 있다).
#    The new list is a paste too, so read it from the tty — one of those addresses may be hostile.
unset ADMIN_LIST
printf 'remaining admin emails (comma separated): '; IFS= read -r ADMIN_LIST < /dev/tty
: "${ADMIN_LIST:?nothing entered - write a single space to mean cognito:groups-only}"
aws ssm put-parameter --name "$SSM_ADMIN_EMAILS_PARAM" --type StringList --overwrite \
  --value "$ADMIN_LIST"                            # 반영까지 최대 5분 (캐시 TTL) / up to 5 min cache TTL
#    마지막 admin 을 지우는 경우 빈 문자열은 거부되므로 공백 하나를 넣는다(= cognito:groups 만 사용).
#    Removing the last entry: an empty value is rejected, so write a single space, which means
#    "cognito:groups only" — how Terraform seeds it. Terraform has `ignore_changes = [value]` on this
#    parameter, so a CLI edit is not reverted by the next apply.
# admins 그룹에 있었다면 / if they were in the group:
aws cognito-idp admin-remove-user-from-group --user-pool-id "$V2_POOL" \
  --username "$EMAIL" --group-name "${ADMIN_GROUP:-admins}"

# --- 여기서부터 Aurora 가 필요하다 / from here on Aurora is required ---
# 장애로 아래에서 멈추면 남는 것: 예약 진단은 계속 발화하고, 이미 발급된 세션 쿠키는 최대 12h 유효하다
# (그 토큰이 담은 `cognito:groups` 도 그 동안 유효하다 — group 제거는 새 토큰부터 적용된다). 복구 후
# 멈춘 지점부터 재개한다.
# If an outage stops the script below, what remains: the scheduled diagnosis keeps firing, and the session
# cookie already issued stays valid for up to 12h — including whatever `cognito:groups` that token carries,
# since removing the group only affects NEW tokens. Resume from the step that failed once Aurora is back.

# 3) 스케줄을 끈다 — 계정을 지워도 report_schedules 행은 남아 계속 실행된다.
#    Disable the schedule: report_schedules rows outlive the account and the dispatcher fires every enabled row.
psql "$DSN" -v sub="$SUB" -v email="$EMAIL" -c \
  "UPDATE report_schedules SET enabled = false WHERE user_sub IN (:'sub', :'email')"

# 4) 이미 발급된 세션을 끊는다 — admin-disable-user 는 새 로그인만 막고, 손에 든 awsops_token 쿠키는
#    최대 12h 유효하다(Cognito 는 id_token 을 취소할 수 없다). verifyUser() 가 session_revocations 를
#    보므로 그 sub 의 cutoff 를 지금으로 올리면 기존 쿠키가 무효가 된다(캐시 TTL 5초).
#    Cut the existing session: admin-disable-user blocks only NEW logins and the cookie in their hand is
#    good for up to 12h (Cognito cannot revoke an id_token). verifyUser() consults session_revocations, so
#    advancing this sub's cutoff invalidates every cookie issued before it (5s cache TTL). isRevoked() is
#    fail-OPEN during an Aurora outage (ADR-002), which is exactly why steps 1-2 run before this one.
psql "$DSN" -v sub="$SUB" -c \
  "INSERT INTO session_revocations (user_sub, revoked_at) VALUES (:'sub', NOW())
   ON CONFLICT (user_sub) DO UPDATE SET revoked_at = NOW()
   WHERE session_revocations.revoked_at < NOW()"

# 삭제는 이 블록에 없다 — 아래 별도 단계 5 참조 / Deletion is NOT here: see step 5 below.
```

### 5) 유예기간이 지난 뒤 — 별도로 실행 / after the grace period — run separately

위 블록은 통째로 붙여넣는 용도이므로 삭제를 그 안에 두면 "유예기간 후"라고 써놓고 **즉시 삭제**된다
(리뷰 지적). 삭제는 되돌릴 수 없고 `diagnosis_reports.requested_by` 같은 sub-keyed 행은 남아 소유자를
잃으므로, 유예기간이 실제로 지난 뒤 이 한 줄만 따로 실행한다. 계정은 이미 비활성이라 급할 이유도 없다.

The block above is meant to be pasted whole, so putting deletion inside it deletes immediately while the
comment says "after the grace period" (review finding). Deletion is irreversible and leaves sub-keyed rows
like `diagnosis_reports.requested_by` without an owner, so run this single line separately once the grace
period has actually elapsed. Nothing is urgent — the account is already disabled.

이 블록은 **며칠 뒤 다른 셸에서** 실행되므로 `$EMAIL`·`$V2_POOL` 을 물려받지 않는다 — 잔여 변수를 믿고
비가역 삭제를 하는 것이 이 절차에서 가장 위험한 실수다(리뷰 지적). 그래서 자체적으로 다시 묻고, 계정이
정말 비활성인지 확인하고, 주소를 재입력받는다.

This block runs **days later in a different shell**, so it inherits nothing: trusting a leftover `$EMAIL`
or `$V2_POOL` for an irreversible delete is the worst mistake available here (review finding). It therefore
re-prompts, checks the account really is disabled, and requires the address to be retyped.

```bash
set -euo pipefail
unset EMAIL
V2_POOL=$(terraform -chdir=terraform/v2/foundation output -raw cognito_user_pool_id)
: "${V2_POOL:?terraform output gave no cognito_user_pool_id}"
SSM_ADMIN_EMAILS_PARAM=${SSM_ADMIN_EMAILS_PARAM:-/ops/awsops-v2/admin_emails}
: "${DSN:?rebuild DSN first - the recipe is in the Verification block above}"
printf 'address to DELETE: '; IFS= read -r EMAIL < /dev/tty
: "${EMAIL:?no address entered}"

# 삭제는 sub<->email 매핑을 없앤다 — 그래서 **오프보딩이 실제로 끝났는지** 먼저 검사한다. 미완인 채로
# 지우면 남은 단계(스케줄 정지·세션 revocation)를 수행할 sub 를 다시 얻을 수 없다(리뷰 지적: 이전 판은
# Enabled=False 만 보고 부분 완료 상태를 통과시켰다).
# Deleting destroys the sub<->email mapping, so check the offboarding actually FINISHED first: delete it
# half-done and there is no way to recover the sub for the remaining steps (review finding — the previous
# version checked only Enabled=False and accepted a partially completed run).
SUB=$(aws cognito-idp admin-get-user --user-pool-id "$V2_POOL" --username "$EMAIL" \
  --query 'UserAttributes[?Name==`sub`]|[0].Value' --output text)
: "${SUB:?admin-get-user returned no sub}"
ENABLED=$(aws cognito-idp admin-get-user --user-pool-id "$V2_POOL" --username "$EMAIL" \
  --query Enabled --output text)
[ "$ENABLED" = "False" ] || { echo "step 1 not done: account still enabled ($ENABLED)"; exit 1; }
# 마지막 수정 시각 — step 1/2 가 계정을 건드리므로 이 시각 이후의 revocation 만 "이번 오프보딩" 것이다.
# Last-modified: steps 1 and 2 touch the account, so only a revocation AFTER this belongs to THIS run.
MODIFIED=$(aws cognito-idp admin-get-user --user-pool-id "$V2_POOL" --username "$EMAIL" \
  --query UserLastModifiedDate --output text)
: "${MODIFIED:?admin-get-user returned no UserLastModifiedDate}"

LEFT=$(psql "$DSN" -At -v sub="$SUB" -v email="$EMAIL" -c \
  "SELECT count(*) FROM report_schedules WHERE user_sub IN (:'sub', :'email') AND enabled")
[ "$LEFT" = "0" ] || { echo "step 3 not done: $LEFT schedule(s) still enabled"; exit 1; }

# 행이 있는 것만으로는 부족하다 — 사용자가 예전에 스스로 로그아웃했다면 그 행이 이미 있다(리뷰 지적).
# 이번 오프보딩에서 올린 cutoff 인지 확인하려면 계정 수정 시각 이후여야 한다.
# A row existing is not enough: the user's own past logout already leaves one (review finding). To be THIS
# run's cutoff it has to postdate the account modification made by steps 1-2.
REVOKED=$(psql "$DSN" -At -v sub="$SUB" -v modified="$MODIFIED" -c \
  "SELECT count(*) FROM session_revocations
    WHERE user_sub = :'sub' AND revoked_at >= (:'modified')::timestamptz")
[ "$REVOKED" = "1" ] || { echo "step 4 not done: no session_revocations row newer than $MODIFIED"; exit 1; }

# 대소문자 무시 — 앱(web/lib/admin.ts)이 양쪽을 lowercase 로 비교하므로 `A@X.io` 항목도 여전히 admin 이다.
# Case-insensitive: the app (web/lib/admin.ts) lowercases both sides, so an `A@X.io` entry still grants admin.
ALLOW=$(aws ssm get-parameter --name "$SSM_ADMIN_EMAILS_PARAM" --query Parameter.Value --output text)
ALLOW_LC=$(printf '%s' "${ALLOW// /}" | tr '[:upper:]' '[:lower:]')
EMAIL_LC=$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')
case ",${ALLOW_LC}," in *,"$EMAIL_LC",*) echo "step 2 not done: still in the admin allowlist"; exit 1;; esac

# 이 계정이 Terraform 관리 대상인지 확인한다 — `aws_cognito_user.admin`(auth.tf)이 있다. CLI 로 지우면
# 다음 `terraform apply` 가 tfvars 의 `admin_email`/`admin_password` 로 **같은 계정을 재생성**해 오프보딩이
# 조용히 되돌아간다.
# **판정 불가는 거부다**: 이전 판은 `state list` 를 `2>/dev/null || true` 로 감싸서, init 안 된 디렉터리나
# backend 자격증명 문제로 조회가 실패하면 가드를 건너뛰고 삭제를 진행했다(리뷰 지적 — fail-open).
# Is this account Terraform-managed? `aws_cognito_user.admin` exists in auth.tf, and deleting it with the
# CLI lets the next `terraform apply` recreate it from tfvars, silently undoing the offboarding.
# **Not being able to tell is a refusal**: the previous version wrapped `state list` in
# `2>/dev/null || true`, so an uninitialised directory or a backend credential problem skipped the guard
# and went ahead with the delete (review finding — fail-open).
TF_STATE=$(terraform -chdir=terraform/v2/foundation state list 2>&1) || {
  echo "cannot read terraform state - refusing to delete. Check aws_cognito_user manually:"
  echo "  terraform -chdir=terraform/v2/foundation init && terraform -chdir=terraform/v2/foundation state list"
  exit 1; }
MANAGED=$(printf '%s\n' "$TF_STATE" | grep '^aws_cognito_user\.' || true)
for ADDR in $MANAGED; do          # 하나만 보지 않는다 / not just .admin
  SHOWN=$(terraform -chdir=terraform/v2/foundation state show "$ADDR" 2>&1) || {
    echo "cannot read $ADDR - refusing to delete"; exit 1; }
  TF_USER=$(printf '%s\n' "$SHOWN" | sed -n 's/^ *username *= *"\(.*\)"$/\1/p' | head -1)
  [ -n "$TF_USER" ] || { echo "could not parse username out of $ADDR - refusing to delete"; exit 1; }
  TF_USER_LC=$(printf '%s' "$TF_USER" | tr '[:upper:]' '[:lower:]')
  if [ "$TF_USER_LC" = "$EMAIL_LC" ]; then
    echo "STOP: $EMAIL is $ADDR in Terraform state."
    echo "  Deleting it here would be undone by the next apply. Instead:"
    echo "   1. point terraform.tfvars' admin_email at the person taking over (and rotate admin_password),"
    echo "   2. terraform plan -out tfplan && apply tfplan  # replaces the account under management,"
    echo "   3. or remove the resource and 'terraform state rm $ADDR' if no admin user should be managed."
    echo "  The disable/revoke/allowlist steps above have already run and still hold."
    exit 1
  fi
done

printf 'all steps verified. retype %s to delete irreversibly: ' "$EMAIL"; IFS= read -r CONFIRM < /dev/tty
[ "$CONFIRM" = "$EMAIL" ] || { echo 'mismatch - nothing was deleted'; exit 1; }
aws cognito-idp admin-delete-user --user-pool-id "$V2_POOL" --username "$EMAIL"
```

**계정만 비활성화하고 스케줄을 빠뜨리면** 진단이 계속 돌아 Bedrock 비용이 나가고, 그 결과물은 소유자가
없어 아무에게도 보이지 않는다. **Disabling the account without disabling the schedule** leaves the
diagnosis running (billed Bedrock) while its output belongs to nobody.

**1번(계정 비활성화)만으로는 접근이 끊기지 않는다** — 이것이 이 절차에서 가장 놓치기 쉬운 지점이다.
`admin-disable-user` 는 *새* 인증만 막고, id_token 은 서버가 발급 후 취소할 수 없는 자기완결 토큰이다.
**4번(세션 revocation)** 을 하지 않으면 그 사람은 **최대 12시간 더 로그인 상태로 남는다.** **2번(admin 회수)**
도 잊기 쉽다: allowlist 는 계정이 아니라 **주소**를 신뢰하므로, 항목을 남겨두면 그 주소를 나중에 쥔 사람이
admin 을 물려받는다.

**Step 1 (disabling the account) alone does not cut access** — the easiest thing to miss here.
`admin-disable-user` blocks only *new* authentication, and an id_token is self-contained: nothing
server-side can retract it once issued. Skip **step 4 (session revocation)** and the person stays logged in
for **up to 12 more hours**. **Step 2 (pulling admin rights)** is equally easy to forget: the allowlist
trusts an ADDRESS, not an account, so an entry left behind hands admin to whoever holds that address next.

**무엇이 무엇을 닫는지는 ADR-002 가 단일 진실이다**(이 런북은 그 문장을 인용만 한다): *계정 복구 인수는*
`account_recovery_setting = admin_only` *가 닫고, 오프보딩은 떠난 사람이 이미 아는 비밀번호·세션·admin 권한을
닫는다.* 그래서 이 절차는 복구 경로를 막기 위한 것이 아니라 **남아 있는 접근**을 끝내기 위한 것이다. 그리고 `legacy_email_owner_match=true` 인 동안에는 주소가 재할당되면
그 주소로 기록된 legacy 행이 새 보유자와 매칭된다. 컷오버(ADR-009) 이후에는 sub 만 매칭하므로 legacy 행
노출은 사라진다. 만료되지 않는 것은 **떠난 사람이 이미 아는 비밀번호**이므로, 계정 자체를 없애야 한다.

**ADR-002 is the single truth on which control closes what** — this runbook only quotes it: *recovery
takeover is closed by* `account_recovery_setting = admin_only`*; offboarding closes the access that a
departing person's already-known password, live session and standing admin rights still provide.* So this
procedure exists to end REMAINING access, not to block the recovery path. And while
`legacy_email_owner_match=true`, a reassigned address
matches the legacy rows written under it. After the cutover (ADR-009) only the sub matches, so that
exposure ends. What never expires is the password the departing person already knows, so the account
itself has to go.

## 관련 파일 / Related files
- `terraform/v2/foundation/auth.tf` — user pool, `allow_admin_create_user_only`, `write_attributes`, `mfa_configuration`
- `web/lib/auth.ts` — `verifyUser()` (email_verified 게이트), `matchesIdentity()`, `ownerKeysForRead()`, `identityKeys()`
- `scripts/v2/backfill-owner-sub.mjs` — 소유권 컷오버(계정 나이 게이트 포함)
- `docs/runbooks/v1-decommission.md` — v1→v2 사용자 이관 및 pool 명부 대조

## ADR
- **ADR-002** — 인증/로그인, `email_verified` 게이트, `account_recovery_setting = admin_only`(계정 복구 인수 차단)
- **ADR-009** — 소유권 키 컷오버(`legacy_email_owner_match`), backfill 절차
