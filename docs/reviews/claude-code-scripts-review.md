# AWSops Scripts Review — Claude Code

**Date**: 2026-04-01
**Reviewer**: Claude Code (3 parallel agents)
**Scope**: `scripts/` folder — 22 deployment shell scripts
**Method**: 3 agents reviewed in parallel (infra/base, AgentCore, EKS/auth/ops)

---

## CRITICAL Issues (7)

### 1. Lambda@Edge JWT signature not verified — full auth bypass
- **File**: `scripts/05-setup-cognito.sh:245-252`
- **Confidence**: 95%
- **Description**: The generated `cognito_edge.py` Lambda@Edge function only decodes the JWT payload (base64) and checks the `exp` claim. It never verifies the JWT signature against Cognito's JWKS public keys. An attacker can forge a JWT with arbitrary payload (e.g., `{"exp": 99999999999}`) and set it as the `awsops_token` cookie to gain full dashboard access.
- **Fix**: Fetch JWKS from `https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json` and verify RS256 signature. Since Lambda@Edge cannot use layers, bundle a lightweight JWT verification implementation.

### 2. `06e-setup-agentcore-config.sh` fails to write ARN to config.json
- **File**: `scripts/06e-setup-agentcore-config.sh:95,100`
- **Confidence**: 95%
- **Description**: The script uses `sed` to replace `const AGENT_RUNTIME_ARN = '...';` and `const CODE_INTERPRETER_ID = '...';` in `route.ts`. But the code was refactored to read from `data/config.json` via `getConfig()`. Those constants no longer exist, so `sed` matches nothing. `agentRuntimeArn` and `codeInterpreterName` are never written to config.
- **Impact**: All AI chat, AgentCore status, and Code Interpreter features are effectively disabled after fresh deployment.
- **Fix**: Replace `sed` with Python JSON updates to `data/config.json`.

### 3. AgentCore orchestrator skips Memory setup — duplicate `06e-` naming
- **File**: `scripts/06-setup-agentcore.sh:29`
- **Confidence**: 92%
- **Description**: Two files share the `06e-` prefix: `06e-setup-agentcore-config.sh` and `06e-setup-agentcore-memory.sh`. The orchestrator only calls the config script. Memory Store creation is silently skipped, so `memoryId`/`memoryName` are never configured and conversation history persistence is broken.
- **Fix**: Rename `06e-setup-agentcore-memory.sh` to `06g-setup-agentcore-memory.sh` and add it to the orchestrator.

### 4. `--external-id ""` causes AssumeRole failure in multi-account setup
- **File**: `scripts/11-setup-multi-account.sh:219-243`
- **Confidence**: 92%
- **Description**: `EXTERNAL_ID` defaults to empty string. AWS STS `AssumeRole` requires `--external-id` to be at least 2 characters if provided. Passing `--external-id ""` causes API validation error. Multi-account setup is unusable without explicitly setting `AWSOPS_EXTERNAL_ID`.
- **Fix**: Conditionally include `--external-id` only when non-empty.

### 5. CloudFront Lambda@Edge version update silently skipped
- **File**: `scripts/07-setup-cloudfront-auth.sh:173-200`
- **Confidence**: 90%
- **Description**: Two idempotency checks conflict. The first detects a different ARN and generates an updated config. The second re-reads the **original** config, finds an existing Lambda, and returns "ALREADY_ATTACHED". The `update-distribution` call is skipped and new Lambda version is never deployed.
- **Fix**: Remove the second Python check. Use the first check's output to decide whether to update.

### 6. Steampipe password stored as plaintext in Lambda environment variables
- **File**: `scripts/06c-setup-agentcore-tools.sh:230,240`
- **Confidence**: 90%
- **Description**: `$SP_PASS` is passed via `--environment "Variables={...STEAMPIPE_PASSWORD=$SP_PASS}"`. Lambda env vars are visible in plaintext in AWS Console and via `lambda:GetFunctionConfiguration`.
- **Fix**: Store in Secrets Manager or SSM Parameter Store (SecureString).

### 7. Shell injection via Steampipe password interpolation
- **File**: `scripts/02-setup-nextjs.sh:89-97`
- **Confidence**: 90%
- **Description**: Steampipe password is interpolated directly into inline Python code and JSON via `${SP_PASSWORD}`. Special characters (single quotes, backslashes, double quotes) can cause code execution or invalid JSON.
- **Fix**: Pass password via environment variable instead of string interpolation.

---

## IMPORTANT Issues (13)

### 8. Documentation mismatch: pool max and batch size
- **File**: `scripts/02-setup-nextjs.sh:77-230`
- **Confidence**: 95%
- **Description**: Script comments/output say `max: 3, batch: 3` but actual code is `max: 5, batch: 5`.

### 9. Step numbering inconsistent in 02-setup-nextjs.sh
- **File**: `scripts/02-setup-nextjs.sh:37-141`
- **Confidence**: 92%
- **Description**: Steps labeled [1/3]...[3/3] then [4/4] then [5/5].

### 10. OpenCost script hardcodes region
- **File**: `scripts/06f-setup-opencost.sh:17`
- **Confidence**: 90%
- **Description**: Uses `REGION="ap-northeast-2"` instead of `${AWS_DEFAULT_REGION:-ap-northeast-2}`.

### 11. VPC auto-detection proceeds with empty values
- **File**: `scripts/06c-setup-agentcore-tools.sh:148-162`
- **Confidence**: 88%
- **Description**: If no matching EC2 instance found, empty VPC/subnet/SG values cause confusing Lambda creation errors.

### 12. Steampipe `.spc` always includes empty `assume_role_external_id`
- **File**: `scripts/11-setup-multi-account.sh:444`
- **Confidence**: 88%
- **Description**: When `EXTERNAL_ID` is empty, `.spc` config contains `assume_role_external_id = ""` which may fail.

### 13. Memory script hardcodes WORK_DIR
- **File**: `scripts/06e-setup-agentcore-memory.sh:25`
- **Confidence**: 85%
- **Description**: Uses `WORK_DIR="${HOME}/awsops"` instead of relative path derivation.

### 14. SQL keyword blocklist trivially bypassable
- **File**: `scripts/06c-setup-agentcore-tools.sh:201-202`
- **Confidence**: 85%
- **Description**: `.split()` method only splits on whitespace. `SELECT 1;DROP TABLE x` bypasses the filter.

### 15. Start/Stop scripts step numbering inconsistent
- **Files**: `scripts/08-start-all.sh`, `scripts/09-stop-all.sh`
- **Confidence**: 85%
- **Description**: Step counts not updated after OpenCost was added.

### 16. Cognito client secret left in plaintext temp files
- **File**: `scripts/05-setup-cognito.sh:223-313`
- **Confidence**: 83%
- **Description**: `CLIENT_SECRET` written to `/tmp/cognito_edge.py` and `/tmp/cognito_edge.zip` with no cleanup trap.

### 17. Runtime endpoint creation race condition
- **File**: `scripts/06a-setup-agentcore-runtime.sh:130`
- **Confidence**: 82%
- **Description**: Only 5-second sleep before endpoint creation. Runtime typically takes 30-120 seconds to reach ACTIVE.

### 18. Cognito setup not idempotent
- **File**: `scripts/05-setup-cognito.sh:115-131`
- **Confidence**: 82%
- **Description**: Re-running creates duplicate User Pool. No check for existing "AWSops-UserPool".

### 19. Fetch URL validation covers only 1 of 13 API routes
- **File**: `scripts/03-build-deploy.sh:56`
- **Confidence**: 82%
- **Description**: Only checks `/api/steampipe` for missing `/awsops` prefix.

### 20. Steampipe DB network-exposed without config.json permission restriction
- **File**: `scripts/02-setup-nextjs.sh:59`
- **Confidence**: 80%
- **Description**: `--database-listen network` binds to 0.0.0.0:9193. `config.json` with password has default permissions.

---

## Comment/Count Mismatches (6)

| File:Line | Says | Correct |
|-----------|------|---------|
| `06b:42` | "7 Gateways" | 8 Gateways |
| `06c:85` | "16 Lambda" | 17 Lambda |
| `06c:276` | "Gateways: 7" | 8 |
| `06d:66` | "4 Lambda + 4 Gateway" | 19 Lambda + 19 Gateway |
| `06e-config:12,191` | "7 Gateway URLs" | 8 |
| `10-verify.sh:5` | "Step 9" | Step 10 |

---

## CLAUDE.md Documentation Gaps

Missing from deployment scripts table:
- Step 4: `04-setup-eks-access.sh` — EKS cluster access
- Step 8: `08-start-all.sh` — Start all services
- Step 9: `09-stop-all.sh` — Stop all services
- Step 10: `10-verify.sh` — Verification & health check
