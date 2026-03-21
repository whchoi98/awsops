---
sidebar_position: 2
---

# 문제 해결 FAQ

AWSops 대시보드 사용 중 발생할 수 있는 문제와 해결 방법입니다.

<details>
<summary>데이터가 표시되지 않아요</summary>

Steampipe 서비스가 실행 중인지 확인하세요.

**1. 서비스 상태 확인**
```bash
steampipe service status
```

**2. 서비스가 중지된 경우 시작**
```bash
steampipe service start --database-listen local --database-port 9193
```

**3. 연결 테스트**
```bash
steampipe query "SELECT COUNT(*) FROM aws_ec2_instance" --output json --input=false
```

**4. 로그 확인**
```bash
tail -20 /tmp/awsops-server.log
```

**일반적인 원인**
- Steampipe 서비스 미실행
- AWS 자격 증명 만료 (EC2 Instance Role 확인)
- 네트워크 연결 문제

</details>

<details>
<summary>페이지 로딩이 느려요</summary>

**1. Production 빌드 확인**

Development 모드는 매우 느립니다. Production 빌드를 사용하세요:

```bash
# 현재 모드 확인
ps aux | grep next

# Production 빌드 실행
npm run build
npm run start
```

| 모드 | 응답 시간 |
|------|----------|
| Development (npm run dev) | 1-2초 |
| Production (npm run build + start) | 3-6ms |

**2. Steampipe Pool 설정 확인**

`src/lib/steampipe.ts`에서 Pool 설정:
```typescript
const pool = new Pool({
  max: 5,                    // 동시 연결 수
  statement_timeout: 120000,  // 2분 타임아웃
});
```

**3. 특정 페이지만 느린 경우**
- CloudTrail: 이벤트가 많으면 시간이 걸림 (탭 클릭 시 lazy-load)
- Cost: MSP 환경에서 CE API 차단 시 스냅샷 폴백
- Compliance: 벤치마크 실행 시 2-5분 소요 (정상)

</details>

<details>
<summary>Cost 페이지가 안 보여요</summary>

Cost Explorer API가 차단된 환경(MSP 등)에서 발생합니다.

**1. Cost 가용성 확인**

대시보드 홈에서 Cost 관련 카드가 표시되는지 확인하세요. 표시되지 않으면 API가 차단된 것입니다.

**2. 스냅샷 모드 사용**

Cost API가 차단된 경우 스냅샷 데이터를 사용합니다:

```bash
# 스냅샷 저장 (Cost API 접근 가능한 환경에서)
aws ce get-cost-and-usage ... > data/cost/snapshot.json
```

**3. 설정 확인**

`data/config.json`에서 `costEnabled` 설정:
```json
{
  "costEnabled": true
}
```

MSP 환경에서는 자동으로 `false`로 감지됩니다.

</details>

<details>
<summary>CloudTrail 이벤트 로딩 타임아웃이 발생해요</summary>

CloudTrail 이벤트 조회는 데이터양에 따라 시간이 걸릴 수 있습니다.

**현재 구현 방식**
- 페이지 로드 시: Trail 목록만 조회 (빠름)
- Events/Writes 탭 클릭 시: 별도 API 호출로 이벤트 조회 (lazy-load)

**CloudFront 타임아웃 설정**
- 기본값: 30초
- 권장값: 60초

CDK에서 Origin Read Timeout 증가:
```typescript
originReadTimeout: Duration.seconds(60)
```

**대안**
- 최근 이벤트만 조회 (기간 제한)
- 특정 이벤트만 필터링 (eventName, userName)
- AI 어시스턴트에 자연어로 질의

</details>

<details>
<summary>SCP 차단으로 일부 데이터가 누락돼요</summary>

SCP(Service Control Policy)로 특정 API가 차단된 경우 일부 데이터가 누락될 수 있습니다.

**영향받는 API 예시**
| API | 영향 |
|-----|------|
| `iam:ListMFADevices` | MFA 상태 조회 불가 |
| `lambda:GetFunction` | Lambda 태그 조회 불가 |
| `iam:ListAttachedUserPolicies` | 연결된 정책 조회 불가 |

**해결 방법 1: ignore_error_codes 설정**

`~/.steampipe/config/aws.spc`:
```hcl
connection "aws" {
  plugin = "aws"
  ignore_error_codes = [
    "AccessDenied",
    "AccessDeniedException",
    "UnauthorizedOperation"
  ]
}
```

이 설정은 **테이블 레벨** 에러만 무시합니다.

**해결 방법 2: 컬럼 제거**

컬럼 hydrate 에러는 해당 컬럼을 쿼리에서 제거해야 합니다. AWSops는 SCP 환경을 고려하여 문제가 되는 컬럼을 기본 쿼리에서 제외했습니다.

**제거된 컬럼**
- `mfa_enabled` (IAM 사용자 목록)
- `attached_policy_arns` (IAM 사용자 목록)
- `tags` (Lambda 목록)

</details>

<details>
<summary>로그인이 안 돼요</summary>

Cognito 인증 관련 문제입니다.

**1. Cognito 도메인 확인**
- 도메인에 'aws' 문자열 포함 불가
- 예: `ops-dashboard-auth.auth.ap-northeast-2.amazoncognito.com`

**2. Lambda@Edge 리전 확인**
- Lambda@Edge는 **us-east-1에만** 배포 가능
- CloudFront와 연동되므로 리전이 일치해야 함

**3. 콜백 URL 확인**
Cognito App Client의 Callback URL이 올바른지 확인:
```
https://<cloudfront-domain>/awsops/api/auth/callback
```

**4. 쿠키 확인**
- HttpOnly 쿠키가 설정되어 있어 JavaScript에서 확인 불가
- 브라우저 개발자 도구 > Application > Cookies에서 확인
- `id_token`, `access_token`, `refresh_token` 존재 여부 확인

**5. 로그아웃 후 재로그인**
```bash
# 서버 사이드 쿠키 삭제
curl -X POST https://<domain>/awsops/api/auth
```

</details>
