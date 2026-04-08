# AWSops Scripts Review Report

**Date**: 2026-04-02
**Reviewer**: Kiro CLI
**Scope**: All 20 shell scripts in `scripts/`
**Project**: AWSops Dashboard v1.7.0 (Next.js 14 + Steampipe + Bedrock AgentCore on EC2 t4g.2xlarge ARM)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| Important | 14 |
| Minor | 12 |
| **Total** | **31** |

---

## Critical Issues

### C-01: JWT Token Not Signature-Verified in Lambda@Edge

**File**: `05-setup-cognito.sh:307-309`
**Category**: Security — JWT

The `decode_jwt_payload()` function in the generated Lambda@Edge code only base64-decodes the JWT payload without verifying the signature against Cognito's JWKS endpoint. An attacker can forge a JWT with any payload (including a future `exp` timestamp) and bypass authentication entirely.

```python
def decode_jwt_payload(token):
    p = token.split('.')[1]
    p += '=' * (4 - len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p))
```

**Impact**: Complete authentication bypass. Any crafted JWT cookie will be accepted.
**Fix**: Fetch Cognito JWKS from `https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json`, verify the RS256 signature using `python-jose` or manual RSA verification, and validate `iss`, `aud`, and `token_use` claims. Alternatively, use the Cognito `/oauth2/userInfo` endpoint to validate the token server-side.

---

### C-02: Cognito Client Secret Embedded in Lambda@Edge Source Code

**File**: `05-setup-cognito.sh:227-229`
**Category**: Security — Credential Exposure

The Cognito `CLIENT_SECRET` is interpolated directly into the Lambda@Edge Python source code as a plaintext string literal, then zipped and deployed. Anyone with Lambda read access (`lambda:GetFunction`) can extract the secret.

```python
CONFIG = {
    'CLIENT_SECRET': '${CLIENT_SECRET}',
    ...
}
```

**Impact**: Credential exposure via Lambda console, API, or CloudWatch logs.
**Fix**: Store the client secret in AWS Secrets Manager or SSM Parameter Store (SecureString) and fetch it at runtime. Lambda@Edge has limited environment variable support, so Secrets Manager with caching is the recommended approach.

---

### C-03: SQL Injection Bypass in steampipe_query Lambda

**File**: `06c-setup-agentcore-tools.sh:201-202`
**Category**: Security — Injection

The SQL keyword blocklist uses Python `str.split()` which splits on whitespace only. SQL comments (`/**/`), newlines, or tabs can bypass the check:

```python
for kw in ["drop","delete","update","insert","alter","create","truncate"]:
    if kw in sql.lower().split(): return ...
```

Bypass examples:
- `SELECT 1;DROP/**/TABLE/**/foo` — `split()` produces `['select', '1;drop/**/table/**/foo']`, no match for `drop`
- `SELECT 1;\nDROP TABLE foo` — newline-separated, `split()` catches this but semicolons aren't blocked
- `SELECT 1; TRUNCATE\ttable_name` — tab character, `split()` does catch this

**Impact**: Destructive SQL execution against Steampipe's embedded PostgreSQL.
**Fix**: Use a proper SQL parser or at minimum: (1) reject any query containing `;`, (2) use regex `re.search(r'\b(drop|delete|update|insert|alter|create|truncate)\b', sql, re.IGNORECASE)` for word-boundary matching, (3) set the PostgreSQL role to read-only at the database level.

---

### C-04: Default Admin Password Hardcoded

**File**: `05-setup-cognito.sh:37`
**Category**: Security — Weak Credentials

```bash
ADMIN_PASSWORD="${ADMIN_PASSWORD:-!234Qwer}"
```

If the `ADMIN_PASSWORD` environment variable is not set, the script silently uses `!234Qwer` as the permanent admin password. This is a well-known default that could be discovered from the public repository.

**Impact**: Unauthorized access to the dashboard if the default is not changed.
**Fix**: Remove the default value and require the user to provide a password interactively or via environment variable. Add a prompt similar to how `00-deploy-infra.sh` handles `VSCODE_PASSWORD`.

---

### C-05: Access Keys Written to Persistent AWS Profile

**File**: `00-deploy-infra.sh:131-133`
**Category**: Security — Credential Persistence

When the user selects option 3 (manual Access Key entry), the credentials are written to the `awsops-deploy` profile in `~/.aws/credentials` and never cleaned up:

```bash
aws configure set aws_access_key_id "$INPUT_ACCESS_KEY" --profile awsops-deploy
aws configure set aws_secret_access_key "$INPUT_SECRET_KEY" --profile awsops-deploy
```

**Impact**: Long-lived credentials persist on disk after the script completes.
**Fix**: Use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables instead of writing to a profile, or add a cleanup trap: `trap 'aws configure set aws_access_key_id "" --profile awsops-deploy; aws configure set aws_secret_access_key "" --profile awsops-deploy' EXIT`.

---

## Important Issues

### I-01: Two Scripts Share the Same Step Number (06e)

**Files**: `06e-setup-agentcore-config.sh`, `06e-setup-agentcore-memory.sh`
**Category**: Inconsistency — Naming

Both files are named `06e-*` but serve completely different purposes (config application vs memory store creation). The `06-setup-agentcore.sh` wrapper only calls `06e-setup-agentcore-config.sh`, silently skipping the memory setup.

**Impact**: Memory store is never created when running the batch installer. Users must know to run the memory script separately.
**Fix**: Rename `06e-setup-agentcore-memory.sh` to `06f-setup-agentcore-memory.sh` (shifting OpenCost to `06g`), or add it to the `06-setup-agentcore.sh` wrapper.

---

### I-02: Step Number Mismatch — 10-verify.sh Says "Step 9"

**File**: `10-verify.sh:5`
**Category**: Inconsistency — Documentation

The file is named `10-verify.sh` but the header and output say "Step 9":

```bash
#   Step 9: Verification & Health Check
```

**Impact**: Confusing for operators following the numbered installation sequence.
**Fix**: Change the header to "Step 10" to match the filename.

---

### I-03: Step Counter Mismatch in 09-stop-all.sh

**File**: `09-stop-all.sh:25-45`
**Category**: Bug — Display

The comments say `[1/3]`, `[2/3]`, `[3/3]` but the echo output says `[1/2]`, `[2/3]`, `[2/2]`:

```bash
# -- [1/3] Stop Next.js -------
echo -e "${CYAN}[1/2] Stopping Next.js...    # says 1/2
# -- [2/3] Stop OpenCost ------
echo -e "${CYAN}[2/3] Stopping OpenCost...   # says 2/3
# -- [3/3] Stop Steampipe -----
echo -e "${CYAN}[2/2] Stopping Steampipe...  # says 2/2
```

**Impact**: Confusing output. The OpenCost step was added later but the echo labels weren't updated consistently.
**Fix**: Change all three to `[1/3]`, `[2/3]`, `[3/3]`.

---

### I-04: Section Counter Mismatch in 02-setup-nextjs.sh

**File**: `02-setup-nextjs.sh:37-101`
**Category**: Bug — Display

The script header says 4 actions but sections are labeled `[1/3]`, `[2/3]`, `[3/3]`, then `[4/4]`, `[5/5]`:

```bash
echo -e "${CYAN}[1/3] Installing npm dependencies...${NC}"
echo -e "${CYAN}[2/3] Starting Steampipe...${NC}"
echo -e "${CYAN}[3/3] Syncing password...${NC}"
echo -e "${CYAN}[4/4] Detecting account type...${NC}"
echo -e "${CYAN}[5/5] Registering host account...${NC}"
```

**Impact**: Confusing output — the denominator changes mid-script.
**Fix**: Renumber to `[1/5]` through `[5/5]`.

---

### I-05: 06d Summary Says "4 Lambda + 4 Gateway Targets" (Should Be 19)

**File**: `06d-setup-agentcore-interpreter.sh:66`
**Category**: Inconsistency — Documentation

```bash
echo "    6c: Tools       (4 Lambda + 4 Gateway Targets)"
```

The actual `06c` script deploys 17 standard + 2 VPC = 19 Lambda functions and 19 Gateway Targets. This summary was never updated.

**Impact**: Misleading post-install summary.
**Fix**: Change to `(19 Lambda + 19 Gateway Targets)`.

---

### I-06: 06b Comment Says "Create 7 Gateways" but Creates 8

**File**: `06b-setup-agentcore-gateway.sh:42`
**Category**: Inconsistency — Documentation

```bash
# -- Create 7 Gateways --------
echo -e "${CYAN}[1/1] Creating 8 role-based Gateways...${NC}"
```

The comment says 7 but the echo and the actual `GATEWAYS` array both have 8 entries. The comment was not updated when the Ops gateway was added.

**Fix**: Change comment to `# -- Create 8 Gateways`.

---

### I-07: 06e-config Says "7 Gateway URLs" but There Are 8

**File**: `06e-setup-agentcore-config.sh:12,186`
**Category**: Inconsistency — Documentation

```bash
#     - agent.py: 7 Gateway URLs
echo "    - agent/agent.py (7 Gateway URLs)"
```

The script iterates over 8 gateway keys: `network container iac data security monitoring cost ops`.

**Fix**: Change to "8 Gateway URLs".

---

### I-08: 06f-setup-opencost.sh Hardcodes Region

**File**: `06f-setup-opencost.sh:17`
**Category**: Bug — Hardcoded Value

```bash
REGION="ap-northeast-2"
```

Every other script uses `REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"` to allow override. This script ignores the environment variable.

**Fix**: Change to `REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"`.

---

### I-09: 06e-setup-agentcore-memory.sh Hardcodes WORK_DIR

**File**: `06e-setup-agentcore-memory.sh:25`
**Category**: Bug — Hardcoded Path

```bash
WORK_DIR="${HOME}/awsops"
```

Every other script uses `WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"` to dynamically resolve the project root. This script assumes the project is always at `~/awsops`.

**Impact**: Fails if the project is cloned to a different path.
**Fix**: Change to `WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"`.

---

### I-10: Steampipe Password Interpolated into Python via Shell Expansion

**File**: `02-setup-nextjs.sh:92`
**Category**: Security — Injection

```bash
python3 -c "
...
cfg['steampipePassword'] = '${SP_PASSWORD}'
..."
```

If the Steampipe password contains single quotes, this breaks the Python code and could allow code injection. The same pattern appears in `06c-setup-agentcore-tools.sh:230,240` where `$SP_PASS` is interpolated into `--environment` values.

**Impact**: Script failure or potential code injection if the password contains special characters.
**Fix**: Pass the password via environment variable and read it with `os.environ` in Python, or use a heredoc with proper escaping.

---

### I-11: `rm -rf *` in /tmp Directory

**File**: `06c-setup-agentcore-tools.sh:184`
**Category**: Security — Dangerous Command

```bash
mkdir -p /tmp/vpc-lambda-pkg && cd /tmp/vpc-lambda-pkg && rm -rf *
```

If the `cd` fails (e.g., permission denied), the `rm -rf *` would execute in the current directory. While `set -e` should catch the `cd` failure, this is a dangerous pattern.

**Impact**: Potential data loss if `cd` fails silently.
**Fix**: Use `rm -rf /tmp/vpc-lambda-pkg && mkdir -p /tmp/vpc-lambda-pkg && cd /tmp/vpc-lambda-pkg` or check `cd` explicitly.

---

### I-12: Temp Files Not Cleaned Up

**Files**: `05-setup-cognito.sh`, `06c-setup-agentcore-tools.sh`, `07-setup-cloudfront-auth.sh`
**Category**: Security — Temp File Hygiene

Multiple scripts leave sensitive files in `/tmp/`:
- `/tmp/cognito_edge.py` — contains Cognito client secret in plaintext
- `/tmp/cognito_edge.zip` — same
- `/tmp/cf-config.json` — CloudFront distribution config
- `/tmp/*.zip` — Lambda deployment packages
- `/tmp/vpc-lambda-pkg/` — Lambda source with Steampipe credentials

**Impact**: Sensitive credentials readable by any user on the EC2 instance.
**Fix**: Add `trap 'rm -f /tmp/cognito_edge.py /tmp/cognito_edge.zip ...' EXIT` or use `mktemp -d` for temporary directories.

---

### I-13: Missing `set -e` in Two Scripts

**Files**: `06e-setup-agentcore-memory.sh:1-2`, `06f-setup-opencost.sh:1-2`
**Category**: Bug — Error Handling

These two scripts lack `set -e`, meaning failures in any command will be silently ignored and the script will continue executing.

**Impact**: Partial/broken installations that appear successful.
**Fix**: Add `set -e` after the shebang line.

---

### I-14: No `set -o pipefail` in Any Script

**Files**: All scripts except `11-setup-multi-account.sh`
**Category**: Bug — Error Handling

Without `pipefail`, a failure in the left side of a pipe is silently ignored. For example:

```bash
SP_PASSWORD=$(steampipe service status --show-password 2>&1 | grep Password | awk '{print $2}')
```

If `steampipe service status` fails, the pipeline still succeeds (exit code from `awk`), and `SP_PASSWORD` is empty.

**Impact**: Silent failures in piped commands leading to empty variables used downstream.
**Fix**: Add `set -o pipefail` to all scripts.

---

## Minor Issues

### M-01: README Says 06-setup-agentcore.sh Runs "6a→6b→6c→6d→6e" but Wrapper Doesn't Include Memory

**File**: `README.md:257`, `06-setup-agentcore.sh`
**Category**: Documentation Mismatch

The README lists `06e-setup-agentcore-memory.sh` as part of the Step 6 sequence, but the wrapper script only runs `06a` through `06e-setup-agentcore-config.sh`. The memory script is never called.

**Fix**: Either add the memory script to the wrapper or clarify in the README that it's a separate optional step.

---

### M-02: README Says "17 install/ops scripts" but There Are 20

**File**: `README.md:335`
**Category**: Documentation Mismatch

The project structure section says "17 install/ops scripts" but the `scripts/` directory contains 20 `.sh` files (plus `ARCHITECTURE.md` and `test-ai-routes.py`).

**Fix**: Update count to 20.

---

### M-03: install-all.sh Says "Step 9 (verify)" but Calls 10-verify.sh

**File**: `install-all.sh:14`
**Category**: Inconsistency — Documentation

```bash
#   Runs: Step 1 -> Step 2 -> Step 3 -> Step 9 (verify)
```

The script actually calls `10-verify.sh`, not a "Step 9" script.

**Fix**: Change to "Step 10 (verify)".

---

### M-04: 06c Lists 17 Standard Lambdas but Comment Says 16

**File**: `06c-setup-agentcore-tools.sh:85`
**Category**: Inconsistency — Documentation

```bash
echo -e "${CYAN}[2/4] Deploying 16 standard Lambda functions from agent/lambda/...${NC}"
```

The `STANDARD_LAMBDAS` array actually contains 17 entries (including `awsops-msk-mcp`).

**Fix**: Change to "17 standard Lambda functions".

---

### M-05: curl Calls Without Timeout

**Files**: `03-build-deploy.sh:120`, `06e-setup-agentcore-config.sh:167`, `07-setup-cloudfront-auth.sh:211`, `08-start-all.sh:87`, `10-verify.sh:57,122`
**Category**: Bug — Reliability

Several `curl` calls lack `--max-time` or `--connect-timeout`, which means they can hang indefinitely if the server is unresponsive.

**Fix**: Add `--max-time 10` to all health-check curl calls.

---

### M-06: 06c Placeholder Copy Does Nothing Useful

**File**: `06c-setup-agentcore-tools.sh:108-109`
**Category**: Bug — Dead Code

```bash
if [ ! -f "$WORK_DIR/agent/lambda/reachability.py" ]; then
    cp "$WORK_DIR/agent/lambda/network_mcp.py" /tmp/_placeholder.py 2>/dev/null || true
fi
```

This copies `network_mcp.py` to `/tmp/_placeholder.py` but never uses it. The `reachability.py` and `flowmonitor.py` entries in `STANDARD_LAMBDAS` will be skipped by the `[ ! -f "$SRC" ]` check anyway.

**Fix**: Remove the dead code block or implement proper placeholder logic.

---

### M-07: 06c VPC Lambda Loop Reuses Same Zip for Both Functions

**File**: `06c-setup-agentcore-tools.sh:213-251`
**Category**: Bug — Deployment

The loop builds the zip once in `/tmp/vpc-lambda-pkg/` and reuses it for both `steampipe_query` and `istio_mcp`. The `aws_istio_mcp.py` is copied in for the second iteration but the zip name uses `${HANDLER}_vpc.zip` which is different each time. However, the `steampipe_query.py` file remains in the package for the `istio-mcp` Lambda, adding unnecessary code to that deployment.

**Fix**: Clean the package directory between iterations or build separate packages.

---

### M-08: 04-setup-eks-access.sh Uses `chown` That May Fail

**File**: `04-setup-eks-access.sh:148`
**Category**: Bug — Permissions

```bash
chown -R ec2-user:ec2-user /home/ec2-user/.kube 2>/dev/null || true
```

If the script is run as `ec2-user` (not root), this `chown` silently fails. If run via SSM (as `ssm-user`), it may also fail. The error is suppressed.

**Impact**: kubeconfig may have wrong ownership, causing kubectl failures for `ec2-user`.
**Fix**: Use `sudo chown` or check the current user first.

---

### M-09: 06a Uses `run_or_fail` Inconsistently

**File**: `06a-setup-agentcore-runtime.sh:30-38`
**Category**: Bug — Error Handling

The `run_or_fail` helper is defined and used for IAM operations but not for the Docker build, ECR login, or AgentCore Runtime creation — which are the most failure-prone steps. Those use inline `|| { ... exit 1; }` instead.

**Impact**: Inconsistent error reporting style.
**Fix**: Either use `run_or_fail` consistently or remove it in favor of the inline pattern.

---

### M-10: 11-setup-multi-account.sh Uses `-P` Flag for grep

**File**: `11-setup-multi-account.sh:207`
**Category**: Bug — Portability

```bash
if ! echo "$target_id" | grep -qP '^\d{12}$'; then
```

The `-P` (Perl regex) flag is not available on all systems (e.g., macOS grep). Since this runs on Amazon Linux 2023 it works, but it's not portable.

**Fix**: Use `-E` with POSIX extended regex: `grep -qE '^[0-9]{12}$'`.

---

### M-11: 05-setup-cognito.sh Doesn't Validate CF_DOMAIN Format

**File**: `05-setup-cognito.sh:100-110`
**Category**: Bug — Input Validation

The CloudFront domain is used in callback URLs and Cognito configuration without validating that it looks like a valid domain name. A malformed value could create broken OAuth2 redirect URIs.

**Fix**: Add basic validation: `echo "$CF_DOMAIN" | grep -qE '^[a-z0-9.-]+\.(cloudfront\.net|[a-z]+\.[a-z]+)$'`.

---

### M-12: Idempotency Issues in Multiple Scripts

**Files**: Various
**Category**: Idempotency

Most scripts handle re-runs reasonably well (using `2>/dev/null || true` for create operations), but some have issues:

| Script | Issue |
|--------|-------|
| `02-setup-nextjs.sh` | Re-running renames `aws` connection again, potentially creating `aws_aws_{id}` |
| `05-setup-cognito.sh` | Creates a new User Pool on every run (no check for existing) |
| `06a-setup-agentcore-runtime.sh` | Creates a new Runtime on every run (no check for existing) |
| `06c-setup-agentcore-tools.sh` | `add-permission` with same `--statement-id` fails silently (OK) but VPC Lambda config may conflict |

**Fix**: Add existence checks before create operations, similar to how `06b-setup-agentcore-gateway.sh` checks for existing gateways.

---

## Consolidated Recommendations

### High Priority
1. Implement proper JWT signature verification in Lambda@Edge (C-01)
2. Move Cognito client secret to Secrets Manager (C-02)
3. Fix SQL injection in steampipe_query Lambda with regex word-boundary matching + semicolon rejection (C-03)
4. Remove default admin password, require explicit input (C-04)
5. Clean up temp files containing secrets (I-12)

### Medium Priority
6. Rename `06e-setup-agentcore-memory.sh` to avoid step collision (I-01)
7. Add `set -e` and `set -o pipefail` to all scripts (I-13, I-14)
8. Fix all step counter mismatches (I-02, I-03, I-04)
9. Update all count references to match actual resources (I-05, I-06, I-07, M-02, M-04)
10. Fix hardcoded region in `06f` and hardcoded path in `06e-memory` (I-08, I-09)

### Low Priority
11. Add `--max-time` to all curl health checks (M-05)
12. Add idempotency checks to `05-setup-cognito.sh` and `06a` (M-12)
13. Remove dead placeholder code in `06c` (M-06)
14. Pass passwords via environment variables instead of shell interpolation (I-10)
