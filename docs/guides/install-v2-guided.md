> 이 문서는 AI 어시스턴트(Claude Code `/install` 스킬, Kiro `install-v2` steering)가 따라 실행하는 **단일 소스 워크플로우**다.
> This is the single-source workflow executed by AI assistants (Claude Code skill / Kiro steering).

# AWSops v2 — 안내식 설치 워크플로우 / Guided Installation Workflow

AWSops v2를 사용자의 AWS 계정에 설치한다. **신규 설치**, **v1→v2 마이그레이션**, **v1 제거 후 신규 설치** 세 시나리오를 지원하며, 시작할 때 사용자가 선택한다.
Installs AWSops v2 into the user's AWS account. Supports three scenarios — **fresh install**, **v1→v2 migration**, and **remove-v1-then-reinstall** — chosen by the user up front.

## 진행 원칙 / Ground Rules

- **상태를 바꾸는 단계(apply, deploy, backfill, 컷오버)는 실행 전에 요약을 보여주고 사용자 확인을 받는다.**
- terraform은 반드시 `plan -out tfplan` → `apply tfplan` — **`-auto-approve` 금지.**
- 긴 단계는 미리 고지: 첫 apply **15~25분**(CloudFront + Aurora), 첫 `make deploy` **5~10분**(arm64 빌드).
- 대화형 TUI(`make configure`)는 사용자가 직접 터미널에서 입력한다 — 실행을 안내하고 산출 파일을 검증한다.
- 비용 고지: 게이트 플래그는 전부 기본 `false`라 선택 기능은 $0이지만, **기본 스택은 상시 비용이 있다** (Aurora Serverless v2 0.5 ACU~, 내부 ALB, CloudFront, Fargate 1 task). 마이그레이션 경로는 **컷오버 완료까지 v1·v2 이중 비용**이 든다는 점도 고지한다.

## 0. 시나리오 선택 / Choose the Scenario

사용자에게 먼저 선택지를 제시하고 답을 받는다:

- **A. 신규 설치** — 이 계정에 AWSops가 처음.
- **B. v1 → v2 마이그레이션** — v1(EC2/CDK/Steampipe, `/awsops` 경로)을 운영 중이고, 데이터·사용자·도메인을 v2로 넘기고 싶다.
- **C. v1 제거 후 신규 설치** — v1을 운영 중이지만 이력 이관 없이 v1을 걷어내고 v2만 새로 설치하고 싶다.

판별을 돕는 자동 힌트(참고용, 선택을 대체하지 않음): v1 흔적 = CDK 스택(`aws cloudformation list-stacks`에 v1 스택), `/awsops` basePath로 서빙 중인 CloudFront, EC2의 `data/*.json`.

- **A 선택** → 1~6단계 진행 후 종료.
- **B 선택** → 1~6단계(v2를 v1과 **병행으로** 새로 설치) 후 7단계(마이그레이션)로 계속. v1은 컷오버 전까지 건드리지 않는다.
- **C 선택** → 0-C단계(v1 제거 게이트) 통과 후 A와 동일하게 1~6단계 진행.

## 0-C. v1 제거 (시나리오 C 전용) / Remove v1 First

v2 설치 자체는 A와 완전히 동일하다 — 시작 전에 아래 세 게이트만 통과한다:

1. **이력 소실 확인**: v1의 인벤토리/비용 스냅샷과 진단 이력은 EC2와 함께 **영구 삭제**된다. 이 사실을 고지하고 사용자에게 명시적으로 확인받는다. 이력이 필요하면 시나리오 B로 전환하거나, 최소한 EC2의 `data/` 디렉토리 사본을 떠 둔다(사후 이관: `docs/runbooks/v1-to-v2-aurora-backfill.md`).
2. **v1 스택 삭제**: `docs/runbooks/v1-decommission.md`의 삭제 절차를 따른다(alert 경로의 외부 수신자 확인 게이트 포함). CDK 스택 destroy 완료 후 **v1 CloudFront distribution이 삭제(또는 별칭 해제)됐는지 확인**한다 — 비활성화→삭제에 수 분이 걸린다.
3. **재활용 자산 확인**: Route53 hosted zone은 삭제되지 않으며 v2가 그대로 재사용한다(2단계 configure에서 기존 존 선택). 기존 VPC와 타깃 계정들의 `AWSopsReadOnlyRole`도 유지·재활용된다. 같은 도메인 이름을 쓰려면 2번의 v1 CloudFront 별칭 해제가 선행돼야 한다(함정 표 `CNAMEAlreadyExists` 참조). Cognito 사용자만은 유지 방법이 없다 — 4단계에서 재등록한다.

## 1. 사전 점검 / Prerequisites

아래를 실행해 전부 통과하는지 확인하고, 미달 항목은 설치 방법을 안내한다:

```bash
terraform version   # >= 1.15 (S3 native lockfile)
node --version      # >= 18
docker buildx version
aws --version && aws sts get-caller-identity
```

`get-caller-identity`의 **계정 ID를 보여주고 "이 계정에 설치하는 게 맞는지" 반드시 확인**한다 (multi-profile 실수 방지). 리전도 확인(`aws configure get region`). 시나리오 B라면 v1과 같은 계정인지도 확인한다(같은 계정이 기본 가정).

## 2. 구성 / Configure

```bash
make configure   # 대화형 TUI — 사용자가 직접 실행
```

TUI가 묻는 것: VPC 신규 vs 기존 재사용, 서비스 도메인(Route53 hosted zone 필요), tfstate S3 버킷, (선택) 온보딩할 EKS 클러스터.
**시나리오 B 주의**: v2 도메인은 **v1과 다른 도메인/서브도메인으로 시작**한다 (예: v1 `ops.example.com` → v2 `ops-v2.example.com`). 기존 도메인 전환은 7.4단계(도메인 컷오버)에서 런북대로 진행한다.
완료 후 `terraform/v2/foundation/terraform.tfvars` + `backend.hcl` 생성을 확인하고, 값이 사용자 의도와 맞는지 읽어서 요약해 준다.

## 3. 프로비저닝 / Provision

```bash
terraform -chdir=terraform/v2/foundation init -backend-config=backend.hcl
terraform -chdir=terraform/v2/foundation plan -out tfplan
```

plan 결과를 **리소스 종류별로 요약**해 보여주고(생성 수, 핵심: CloudFront, Aurora, Cognito, 내부 ALB), 사용자 승인 후:

```bash
terraform -chdir=terraform/v2/foundation apply tfplan   # 15~25분 소요 고지
```

오류가 나면 아래 [알려진 함정]을 먼저 대조한다.

## 4. 첫 배포 + 첫 사용자 / First Deploy + First User

```bash
make deploy   # arm64 빌드 → ECR push → ECS 롤링 → /api/health smoke
```

성공 기준: `wait services-stable` 통과 + `/api/health` 200. 이후 Cognito 초기 관리자 생성:

```bash
POOL=$(terraform -chdir=terraform/v2/foundation output -raw cognito_user_pool_id)
aws cognito-idp admin-create-user --user-pool-id "$POOL" \
  --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" \
  --username <email> --password '<사용자가 정한 값>' --permanent
```

비밀번호는 사용자가 직접 정하게 하고 채팅에 평문으로 남기지 않는다.
**시나리오 B**: 기존 v1 사용자 명단의 이관·대조는 7.3단계(사용자 이관 대조)에서 런북 절차로 수행한다 — 여기서는 관리자 1명만 만든다.

## 5. 검증 / Verify

- `https://<v2 도메인>/` → `/login` 리다이렉트 → 로그인 → 대시보드 렌더
- `https://<v2 도메인>/api/health` → 200 (공개 엔드포인트)
- 개요/인벤토리 페이지가 (데이터가 비어 있어도) 오류 없이 뜨는지

## 6. 선택 기능 / Optional Feature Gates

전부 기본 `false`. 필요한 것만 `terraform.tfvars`에서 켜고 **plan → apply → make 타깃**:

| Flag | 켜면 생기는 것 | apply 후 실행 |
|------|------------|------------|
| `agentcore_enabled` | AI 챗 섹션 에이전트 (Lambda 도구 + Gateway) | `make agentcore` (+`SMOKE=1` 호출 검증) |
| `integrations_enabled` | 외부 관측성 커넥터 슬라이스 | `make agentcore` 재실행 |
| `workers_enabled` | 비동기 워커 (SQS/SFN/Lambda/Fargate) | `make workers` |
| `steampipe_enabled` | 인벤토리 sync + 보안/컴플라이언스 메뉴 | — |

시나리오 A는 여기서 완료. 이후 릴리스 업그레이드는 `make upgrade` (RDS 스냅샷 → migrate → deploy, `CONFIRM=go` 전까지 프리뷰).

## 7. v1 → v2 마이그레이션 / Migration (시나리오 B 전용)

v2가 5단계(검증)까지 통과한 상태에서 시작한다. **각 단계는 전용 런북이 단일 진실** — 스킬은 순서와 게이트만 관리하고, 실행 전 반드시 해당 런북을 읽고 따른다.

### 7.1 v1 데이터 백업 확보

v1이 살아있는 동안 EC2의 `data/` 디렉토리 **복사본**을 떠 온다 (원본은 건드리지 않음). 절차: `docs/runbooks/v1-decommission.md` Phase 1.

### 7.2 히스토리 백필 → Aurora

`docs/runbooks/v1-to-v2-aurora-backfill.md`를 따른다. 핵심 도구:

```bash
node scripts/v2/backfill-v1.mjs --data-dir <v1 data 복사본> --dry-run   # 반드시 dry-run 먼저 (DB 미접속, 파싱+카운트만)
node scripts/v2/backfill-v1.mjs --data-dir <v1 data 복사본>             # 멱등 — 재실행 안전
```

이관 대상: inventory/cost 스냅샷 히스토리, alert 진단 이력, event-scaling 계획. dry-run 카운트를 사용자에게 보여주고 승인 후 실행한다.

### 7.3 사용자 이관 대조

v1 Cognito 사용자 명단과 v2 pool을 대조하고 **실제 로그인 성공(POST /api/auth/login 200)까지** 확인 — `v1-decommission.md` Phase 1.2 절차 그대로 (pool 후보가 여럿이면 자동 매칭 가정 금지).

### 7.4 도메인 컷오버

기존 v1 도메인을 v2로 전환 — `v1-decommission.md` Phase 2 순서 엄수: **ACM SAN 추가만 먼저 apply**(별칭·레코드는 그대로) → 검증 통과 후 별칭/레코드 전환. DNS TTL 만큼 이중 서빙 기간이 있음을 고지한다.

### 7.5 v1 정지 → 유예 → 폐기

즉시 삭제하지 않는다: v1 리소스를 **정지/비활성(stop/disable)** 상태로 유예 기간을 두고, 롤백 필요가 없다고 확인된 뒤에만 `v1-decommission.md`의 삭제 단계를 진행한다. alert 경로에 외부 발신자가 있는지 확인(Phase 1.3)이 삭제 전 필수 게이트다.

## 알려진 함정 / Known Traps

| 증상 | 원인 → 조치 |
|------|-----------|
| CloudFront 접속 시 504 | CF→ALB는 TLS end-to-end 필요: VPC Origin `https-only` + origin domain=공개 FQDN(SNI), ALB SG는 `CloudFront-VPCOrigins-Service-SG`에서 443 허용 |
| ECS task UNHEALTHY 루프 | 컨테이너 런타임 env `HOSTNAME=0.0.0.0` 필수 (task def `environment` — 이미지 ENV로는 부족) |
| `ResourceInitializationError` (secrets) | ECS `secrets` valueFrom 권한은 **execution role**에 필요 (task role 아님) |
| Cognito 도메인 생성 실패 | 'aws'로 시작하는 접두사는 예약어 — 다른 접두사 사용 |
| SSM 파라미터 생성 거부 | `/aws...` 경로는 예약 — `/ops/<project>/...` 유지 |
| SG 변경 시 apply hang | SG `description`은 불변 — ALB에 물린 SG replace로 멈춤. ingress만 수정, description 유지 |
| terraform이 Aurora 재생성 시도 | `engine_version`은 정확한 minor(예: `17.9`)로 핀 — "17"만 쓰면 오작동 |
| v2 apply 시 `CNAMEAlreadyExists` | 같은 별칭(CNAME)이 아직 v1 CloudFront에 붙어 있음(전역 유일 제약) — v1 배포판 삭제/별칭 해제 완료 후 재시도 (시나리오 C 0-C단계 / 시나리오 B는 7.4 컷오버 절차로) |

더 깊은 문제: `docs/guides/troubleshooting.md`, `docs/runbooks/`.

## 이 스킬이 하지 않는 것 / Out of Scope

- AWS 계정/자격 증명 생성, Route53 도메인 구매
- 게이트가 잠긴 기능의 임의 활성화 (특히 remediation 계열 — repo 정책상 do-not-enable)
- v1 신규 설치 (`docs/guides/install.md`는 v1 레거시 참고용)
