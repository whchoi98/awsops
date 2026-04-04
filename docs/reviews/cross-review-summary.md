# AWSops Scripts Cross-Review Summary

**Date**: 2026-04-02
**Reviewers**: Claude Code (3 parallel agents) + Kiro CLI
**Scope**: `scripts/` folder — 22 deployment shell scripts

---

## Overview

| Metric | Claude Code | Kiro CLI |
|--------|-------------|----------|
| Critical | 7 | 5 |
| Important | 13 | 14 |
| Minor | 6 (comment/count) | 12 |
| **Total** | **26** | **31** |

---

## Cross-Reference: Issues Found by Both (High Confidence)

These issues were independently identified by both reviewers, confirming high severity and priority.

| # | Issue | Claude Code | Kiro CLI | Severity |
|---|-------|-------------|----------|----------|
| 1 | **Lambda@Edge JWT signature not verified** — complete auth bypass | #1 (95%) | C-01 | CRITICAL |
| 2 | **SQL keyword blocklist trivially bypassable** via `.split()` | #14 (85%) | C-03 | CRITICAL |
| 3 | **Cognito client secret in plaintext** (Lambda source + temp files) | #16 (83%) | C-02 | CRITICAL |
| 4 | **Duplicate `06e-*` naming** — memory setup silently skipped | #3 (92%) | I-01 | CRITICAL |
| 5 | **Steampipe password interpolation** into Python/JSON (shell injection) | #7 (90%) | I-10 | CRITICAL |
| 6 | **`06f-setup-opencost.sh` hardcodes region** | #10 (90%) | I-08 | IMPORTANT |
| 7 | **`06e-setup-agentcore-memory.sh` hardcodes WORK_DIR** | #13 (85%) | I-09 | IMPORTANT |
| 8 | **Step numbering inconsistent** in 02, 08, 09 scripts | #9, #15 | I-02, I-03, I-04 | IMPORTANT |
| 9 | **Cognito setup not idempotent** (duplicate User Pool) | #18 (82%) | M-12 | IMPORTANT |
| 10 | **Temp files not cleaned up** (secrets on disk) | #16 (83%) | I-12 | IMPORTANT |
| 11 | **Comment/count mismatches** (7→8 gateways, 16→17 lambdas, etc.) | 6 items | I-05, I-06, I-07, M-04 | MINOR |

---

## Issues Found Only by Claude Code

| # | Issue | Ref | Severity |
|---|-------|-----|----------|
| A | **`06e-setup-agentcore-config.sh` sed targets removed constants** — ARN never written to config.json | #2 (95%) | CRITICAL |
| B | **`--external-id ""` breaks multi-account AssumeRole** | #4 (92%) | CRITICAL |
| C | **CloudFront Lambda@Edge update skipped** on version upgrade (dual idempotency check conflict) | #5 (90%) | CRITICAL |
| D | **Steampipe password in Lambda env vars** as plaintext | #6 (90%) | CRITICAL |
| E | **VPC auto-detection proceeds with empty values** | #11 (88%) | IMPORTANT |
| F | **Steampipe `.spc` includes empty `assume_role_external_id`** | #12 (88%) | IMPORTANT |
| G | **Runtime endpoint creation race condition** (5s sleep vs 30-120s needed) | #17 (82%) | IMPORTANT |
| H | **Fetch URL validation only covers `/api/steampipe`** | #19 (82%) | IMPORTANT |
| I | **Steampipe DB network-exposed** without config.json permission restriction | #20 (80%) | IMPORTANT |
| J | **Documentation mismatch**: pool max 3 vs actual 5 | #8 (95%) | IMPORTANT |

---

## Issues Found Only by Kiro CLI

| # | Issue | Ref | Severity |
|---|-------|-----|----------|
| K | **Default admin password `!234Qwer` hardcoded** as fallback | C-04 | CRITICAL |
| L | **Access keys written to persistent `~/.aws/credentials`** profile, never cleaned up | C-05 | CRITICAL |
| M | **`rm -rf *` in /tmp** without safe `cd` check | I-11 | IMPORTANT |
| N | **Missing `set -e`** in `06e-memory` and `06f-opencost` | I-13 | IMPORTANT |
| O | **Missing `set -o pipefail`** in 19 of 20 scripts | I-14 | IMPORTANT |
| P | **`grep -P` (Perl regex)** not portable | M-10 | MINOR |
| Q | **CF_DOMAIN not validated** before use in OAuth URLs | M-11 | MINOR |
| R | **README says "17 scripts"** but there are 20 | M-02 | MINOR |
| S | **`install-all.sh` says "Step 9"** but calls `10-verify.sh` | M-03 | MINOR |
| T | **`run_or_fail` function** defined but inconsistently used | M-09 | MINOR |
| U | **curl health checks lack `--max-time`** timeout | M-05 | MINOR |

---

## Consolidated Priority Matrix

### P0 — Fix Immediately (Security)

| # | Issue | Both? | Action |
|---|-------|-------|--------|
| 1 | JWT signature verification | YES | Implement JWKS verification in Lambda@Edge |
| K | Default admin password | Kiro only | Remove default, require explicit input |
| L | Persistent access keys | Kiro only | Use env vars or add cleanup trap |
| 3 | Cognito secret in plaintext | YES | Move to Secrets Manager |
| D | Steampipe password in Lambda env | Claude only | Move to SSM SecureString |
| 5 | Shell injection via password interpolation | YES | Use environment variables |
| 2 | SQL injection bypass | YES | Use regex word-boundary + reject semicolons |

### P1 — Fix Before Next Deployment (Functionality)

| # | Issue | Both? | Action |
|---|-------|-------|--------|
| A | Config sed targets removed constants | Claude only | Rewrite to use JSON update |
| 4 | Duplicate 06e naming | YES | Rename + add to orchestrator |
| B | `--external-id ""` breaks AssumeRole | Claude only | Conditionally include flag |
| C | CloudFront update skipped | Claude only | Remove duplicate idempotency check |
| G | Runtime endpoint race condition | Claude only | Add ACTIVE polling loop |
| E | VPC auto-detection empty values | Claude only | Add validation |
| N | Missing `set -e` in 2 scripts | Kiro only | Add `set -e` |
| O | Missing `set -o pipefail` | Kiro only | Add to all scripts |

### P2 — Quality Improvements

All step numbering fixes, documentation mismatches, comment/count updates, idempotency improvements, temp file cleanup, and portability fixes.

---

## Review Methodology Comparison

| Aspect | Claude Code | Kiro CLI |
|--------|-------------|----------|
| Approach | 3 specialized agents in parallel | Single agent, sequential |
| Time | ~3 min (parallel) | ~3.5 min |
| Depth | Deep code tracing (e.g., found sed→config refactor mismatch, dual Python check conflict) | Broad surface scan with good pattern matching |
| Unique strength | Cross-file dependency analysis, runtime behavior prediction | Shell scripting best practices (`pipefail`, `set -e`), credential hygiene |
| Missed by other | Kiro missed config.json ARN write failure, external-id empty string, CloudFront update skip | Claude missed default admin password, persistent access keys, `rm -rf *` safety |

**Conclusion**: The two reviewers are highly complementary. Claude Code excels at tracing cross-file dependencies and runtime behavior, while Kiro CLI catches shell scripting anti-patterns and credential hygiene issues. Together they found **31 unique issues** (11 overlapping), with **9 Critical** issues confirmed.
