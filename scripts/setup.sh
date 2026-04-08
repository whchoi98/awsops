#!/bin/bash
# AWSops Developer Setup Script
# Installs dependencies and verifies local environment
set -euo pipefail

echo "=== AWSops Developer Setup ==="
echo ""

# 1. Check Node.js
echo "[1/5] Checking Node.js..."
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "  Node.js $NODE_VER found"
else
  echo "  ERROR: Node.js not found. Install Node.js 18+ first."
  exit 1
fi

# 2. Install npm dependencies
echo "[2/5] Installing dependencies..."
npm install

# 3. Check AWS CLI
echo "[3/5] Checking AWS CLI..."
if command -v aws &>/dev/null; then
  AWS_VER=$(aws --version 2>&1 | head -1)
  echo "  $AWS_VER"
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "NOT_CONFIGURED")
  echo "  Current account: $ACCOUNT"
else
  echo "  WARNING: AWS CLI not found. Some features may not work."
fi

# 4. Check Steampipe
echo "[4/5] Checking Steampipe..."
if command -v steampipe &>/dev/null; then
  SP_VER=$(steampipe -v 2>&1 | head -1)
  echo "  $SP_VER"
  # Check if service is running
  if pg_isready -h 127.0.0.1 -p 9193 &>/dev/null; then
    echo "  Steampipe service is running on port 9193"
  else
    echo "  WARNING: Steampipe service not running. Start with: steampipe service start --database-listen network"
  fi
else
  echo "  WARNING: Steampipe not found. Run scripts/01-install-base.sh first."
fi

# 5. Check config
echo "[5/5] Checking configuration..."
if [ -f "data/config.json" ]; then
  ACCOUNT_COUNT=$(node -e "const c=require('./data/config.json'); console.log((c.accounts||[]).length)" 2>/dev/null || echo 0)
  echo "  data/config.json found ($ACCOUNT_COUNT accounts configured)"
else
  echo "  WARNING: data/config.json not found. Copy from .env.example or run scripts/02-setup-nextjs.sh"
fi

if [ -f ".env.local" ]; then
  echo "  .env.local found"
else
  echo "  INFO: .env.local not found. Copy .env.example to .env.local if needed."
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Ensure Steampipe is running: steampipe service start --database-listen network"
echo "  2. Build: npm run build"
echo "  3. Start: npm run start"
echo "  4. Open: http://localhost:3000/awsops/"
