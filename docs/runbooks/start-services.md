# Runbook: 서비스 시작 / Start Services

## 빠른 시작 / Quick Start
```bash
bash scripts/08-start-all.sh
```

## 수동 시작 / Manual Start

### 1. Steampipe
```bash
steampipe service start --database-listen network --database-port 9193
steampipe service status --show-password
```

> **멀티 어카운트**: Steampipe 시작 시 `--database-listen network` 필수 (VPC Lambda 접근용).
> aws.spc에 aggregator + 개별 connection이 설정되어 있어야 함.
> (Multi-account: `--database-listen network` required. aws.spc must have aggregator + per-account connections.)

### 2. Next.js
```bash
cd /home/ec2-user/project/awsops
PORT=3000 npm run start &
```

### 3. 검증 / Verify
```bash
curl -s http://localhost:3000/awsops  # 200 응답이 와야 함 (should return 200)
bash scripts/10-verify.sh             # 전체 점검 (full check)
```

## 멀티 어카운트 검증 / Multi-Account Verification
```bash
# Steampipe aggregator 확인 (Verify aggregator)
steampipe query "SELECT account_id FROM aws.aws_account" --output csv

# 개별 어카운트 연결 확인 (Verify individual connections)
steampipe query "SELECT account_id FROM aws_939105814298.aws_account LIMIT 1" --output csv

# API 어카운트 목록 확인 (Verify accounts API)
curl -s http://localhost:3000/awsops/api/steampipe?action=accounts | python3 -m json.tool
```

## 어카운트 추가 / Add Account
1. Target 어카운트에서 CFN 배포: `infra-cdk/cfn-target-account-role.yaml`
2. AWSops Dashboard > Accounts 페이지 > Add Account
3. 빌드: `npm run build` → 서비스 재시작

## 문제 해결 / Troubleshooting
- 포트 3000이 사용 중인 경우 (Port 3000 in use): `fuser -k 3000/tcp`
- Steampipe가 시작되지 않는 경우 (Steampipe won't start): `steampipe service stop --force && sleep 2 && steampipe service start --database-listen network --database-port 9193`
- 비밀번호 불일치 (Password mismatch): `bash scripts/02-setup-nextjs.sh` (비밀번호 재동기화 / re-syncs password)
- 어카운트 추가 후 데이터 안 나옴 (No data after adding account): pg Pool 리셋 필요 — 서버 재시작 또는 Accounts 페이지에서 재추가
- cross-account 실패 (AssumeRole fails): Target 어카운트에 `AWSopsReadOnlyRole` 존재 확인 + Host EC2 역할에 `sts:AssumeRole` 권한 확인
