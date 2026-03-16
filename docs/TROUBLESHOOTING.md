# AWSops 대시보드 - 문제 해결 가이드 / AWSops Dashboard - Troubleshooting Guide

## 설치 중 발생했던 이슈와 해결 방법 (Issues and Solutions During Installation)

---

### 1. Steampipe 쿼리 컬럼명 오류

| 테이블 | 잘못된 컬럼 | 올바른 컬럼 | 파일 |
|--------|-----------|-----------|------|
| aws_s3_bucket | `versioning` | `versioning_enabled` | queries/s3.ts |
| aws_rds_db_instance | `db_instance_class` | `class` (alias 필요) | queries/rds.ts |
| aws_ecs_task | `group_name` | `"group"` (예약어) | queries/ecs.ts |
| aws_vpc_internet_gateway | `state` | `attachments` JSONB에서 추출 | queries/vpc.ts |
| trivy | `trivy_vulnerability` | `trivy_scan_vulnerability` | queries/security.ts |

**확인 방법:**
```bash
steampipe query "SELECT column_name FROM information_schema.columns WHERE table_name = 'TABLE_NAME'" --output json --input=false
```

---

### 2. SCP(Service Control Policy) 차단

| 차단된 API | 영향 | 해결 |
|-----------|------|------|
| `iam:ListMFADevices` | mfa_enabled 컬럼 조회 실패 → 전체 쿼리 실패 | mfa_enabled 참조 제거 |
| `lambda:GetFunction` | tags 컬럼 hydrate 실패 → 전체 쿼리 실패 | tags 참조 제거 (list 쿼리) |
| `iam:ListAttachedUserPolicies` | attached_policy_arns 조회 실패 | attached_policy_arns 제거 |

**aws.spc 설정으로 에러 무시:**
```hcl
connection "aws" {
  plugin = "aws"
  ignore_error_codes = ["AccessDenied", "AccessDeniedException", ...]
}
```

> ⚠️ `ignore_error_codes`는 **테이블 레벨** 에러만 무시. **컬럼 hydrate 에러**는 해당 컬럼을 쿼리에서 제거해야 함.

---

### 3. PostgreSQL 별도 설치가 필요한가?

**아니요.** Steampipe에 PostgreSQL이 내장되어 있습니다.

```
~/.steampipe/db/   ← 내장 PostgreSQL 데이터 디렉토리
```

```bash
# 내장 PostgreSQL 시작 (별도 설치 불필요)
steampipe service start --database-listen local --database-port 9193

# 연결 정보 확인
steampipe service status --show-password
# → postgres://steampipe:<password>@127.0.0.1:9193/steampipe
```

Next.js는 `pg` npm 패키지로 이 내장 PostgreSQL에 직접 연결합니다:
```
Next.js (pg Pool) → Steampipe 내장 PostgreSQL (port 9193) → AWS/K8s/Trivy API
```

---

### 4. Steampipe 성능 (CLI vs PostgreSQL)

| 방식 | 응답 시간 | 문제 |
|------|----------|------|
| CLI (`steampipe query "SQL"`) | ~4초/쿼리 | 프로세스 생성 오버헤드, shell 이스케이핑 |
| **pg Pool (PostgreSQL)** | **~0.006초/쿼리** | ★ 현재 사용 중 |

**steampipe.ts 핵심 설정:**
```typescript
const pool = new Pool({
  host: '127.0.0.1', port: 9193,
  database: 'steampipe', user: 'steampipe',
  password: '<steampipe_password>',
  max: 3,                    // ★ pool 고갈 방지
  statement_timeout: 120000,  // ★ CloudTrail 등 느린 쿼리
});

// batchQuery: 3개씩 순차 실행
const BATCH_SIZE = 3;
```

**서비스 시작:**
```bash
steampipe service start --database-listen local --database-port 9193
steampipe service status --show-password  # 비밀번호 확인
```

---

### 4. Steampipe Shell Injection 필터

`$` 문자가 차단되어 K8s의 `jsonb_path_exists('$[*]...')` 쿼리가 실패.

**해결:** `conditions::text LIKE '%"type":"Ready"%'` 패턴으로 대체
```typescript
// Before (실패):
jsonb_path_exists(conditions, '$[*] ? (@.type == "Ready")')

// After (성공):
conditions::text LIKE '%"type":"Ready"%' AND conditions::text LIKE '%"status":"True"%'
```

---

### 5. Next.js basePath 이슈

`basePath: '/awsops'` 설정 시:
- `<Link href="/ec2">` → `/awsops/ec2` (자동 추가 ✅)
- `fetch('/api/steampipe')` → `/api/steampipe` (자동 추가 안됨 ❌)

**해결:** 모든 `fetch()` URL에 `/awsops` 수동 추가
```typescript
// ❌ 잘못됨
fetch('/api/steampipe?bustCache=true')

// ✅ 올바름
fetch('/awsops/api/steampipe?bustCache=true')
```

---

### 6. 컴포넌트 Export/Import 불일치

모든 컴포넌트가 `export default` 사용:
```typescript
// ❌ Named import (에러)
import { Header } from '@/components/layout/Header';

// ✅ Default import
import Header from '@/components/layout/Header';
```

---

### 7. Production vs Dev 모드

| 항목 | Dev (npm run dev) | Production (npm run build + start) |
|------|-------------------|-----------------------------------|
| 페이지 응답 | 1-2초 (JIT 컴파일) | 3-6ms |
| ALB 헬스체크 | 자주 실패 | 안정적 |
| 권장 | 개발 시에만 | ★ 운영 환경 |

---

### 8. CloudFront 타임아웃

| 설정 | 기본값 | 권장값 |
|------|--------|--------|
| Origin Read Timeout | 30s | **60s** |
| CloudTrail 쿼리 | 60s+ | 이벤트 탭 lazy-load |

**CloudTrail 해결:** 페이지 로드 시 trail만 로드, events/writes 탭 클릭 시 별도 API 호출

---

### 9. AgentCore Runtime

| 이슈 | 해결 |
|------|------|
| Docker 이미지 아키텍처 | **arm64 필수** (`docker buildx --platform linux/arm64`) |
| Gateway toolSchema 형식 | `inlinePayload`는 **배열** (OpenAPI가 아님) |
| Lambda 파라미터 매핑 | Gateway가 `{toolName, input}` 형식으로 전달 → action 자동 매핑 |
| microVM에서 localhost 접근 불가 | Steampipe 쿼리는 Lambda(VPC 내)를 통해 접근 |
| SDK v3 response body | `response.transformToString()` 사용 (read()가 아님) |

---

### 10. Cognito

| 이슈 | 해결 |
|------|------|
| Domain에 'aws' 포함 불가 | `ops-dashboard-auth` 사용 |
| Username = email 필수 | `username-attributes email` 설정 |
| Lambda@Edge 리전 | **us-east-1 필수** |

---

## 빠른 진단 명령어 / Quick Diagnosis Commands

```bash
# Steampipe 상태
steampipe service status --show-password

# 쿼리 테스트
steampipe query "SELECT COUNT(*) FROM aws_ec2_instance" --output json --input=false

# 서버 로그
tail -20 /tmp/awsops-server.log

# API 테스트
curl -s -X POST http://localhost:3000/awsops/api/steampipe \
  -H "Content-Type: application/json" \
  -d '{"queries":{"test":"SELECT 1 as ok"}}'

# 포트 확인
fuser 3000/tcp 9193/tcp

# 전체 검증
bash scripts/09-verify.sh
```

---

## 멀티 어카운트 이슈 / Multi-Account Issues

### Cross-Account AssumeRole 실패
- Target 어카운트에 `AWSopsReadOnlyRole` 존재 확인
- Host EC2 역할에 `sts:AssumeRole` 권한 확인
- CFN 재배포: `aws cloudformation deploy --template-file infra-cdk/cfn-target-account-role.yaml ...`

### 어카운트 추가 후 데이터 안 나옴
- Steampipe connection 확인: `grep "aws_XXXX" ~/.steampipe/config/aws.spc`
- pg Pool 리셋: 서버 재시작 또는 Accounts 페이지에서 재추가
- 수동 쿼리 테스트: `steampipe query "SELECT 1 FROM aws_XXXX.aws_account"`

### "All Accounts"에서 데이터 중복
- aggregator가 모든 connection을 통합하므로 정상 동작
- Cost 쿼리는 어카운트별 합산될 수 있음 (costEnabled 플래그로 관리)

### 특정 어카운트 메뉴가 안 보임
- `data/config.json`의 `accounts[].features` 확인 (costEnabled, eksEnabled, k8sEnabled)
- Accounts 페이지에서 어카운트 재추가하면 features 자동 재감지
