# Runbook: Start Services

## Quick Start
```bash
bash scripts/07-start-all.sh
```

## Manual Start

### 1. Steampipe
```bash
steampipe service start --database-listen local --database-port 9193
steampipe service status --show-password
```

### 2. Next.js
```bash
cd /home/ec2-user/awsops
PORT=3000 npm run start &
```

### 3. Verify
```bash
curl -s http://localhost:3000/awsops  # should return 200
bash scripts/09-verify.sh             # full check
```

## Troubleshooting
- Port 3000 in use: `fuser -k 3000/tcp`
- Steampipe won't start: `steampipe service stop --force && sleep 2 && steampipe service start`
- Password mismatch: `bash scripts/02-setup-nextjs.sh` (re-syncs password)
