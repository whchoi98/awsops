#!/bin/bash
# Setup Cognito Hosted UI customization (logo + dark theme CSS)
# Cognito Hosted UI 커스터마이징 (로고 + 다크 테마 CSS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CSS_FILE="$PROJECT_DIR/infra-cdk/assets/cognito-login.css"
LOGO_FILE="$PROJECT_DIR/public/logos/default.png"

echo "=== Cognito Hosted UI Customization ==="

# Get User Pool ID
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 --query "UserPools[?Name=='AWSops-UserPool'].Id | [0]" --output text)
if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
  echo "ERROR: User Pool 'awsops-user-pool' not found"
  exit 1
fi
echo "User Pool ID: $USER_POOL_ID"

# Get App Client ID
CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id "$USER_POOL_ID" --query "UserPoolClients[?ClientName=='AWSops-Dashboard'].ClientId | [0]" --output text)
if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
  echo "ERROR: App Client 'awsops-app-client' not found"
  exit 1
fi
echo "App Client ID: $CLIENT_ID"

# Validate files
if [ ! -f "$CSS_FILE" ]; then
  echo "ERROR: CSS file not found: $CSS_FILE"
  exit 1
fi
if [ ! -f "$LOGO_FILE" ]; then
  echo "ERROR: Logo file not found: $LOGO_FILE"
  exit 1
fi

# Check logo size (Cognito limit: 100KB)
LOGO_SIZE=$(stat -c%s "$LOGO_FILE" 2>/dev/null || stat -f%z "$LOGO_FILE" 2>/dev/null)
if [ "$LOGO_SIZE" -gt 102400 ]; then
  echo "WARNING: Logo file is ${LOGO_SIZE} bytes (> 100KB limit). Resizing..."
  if command -v python3 &>/dev/null; then
    python3 -c "
from PIL import Image
import io
img = Image.open('$LOGO_FILE')
img.thumbnail((400, 200), Image.LANCZOS)
img.save('$LOGO_FILE', optimize=True, quality=85)
print(f'Resized to {img.size[0]}x{img.size[1]}')
"
  else
    echo "ERROR: python3 with Pillow required to resize logo"
    exit 1
  fi
fi

echo ""
echo "Applying CSS ($(wc -c < "$CSS_FILE") bytes)..."
echo "Applying logo ($(stat -c%s "$LOGO_FILE" 2>/dev/null || stat -f%z "$LOGO_FILE") bytes)..."

# Apply UI customization (client-level for specific app client)
aws cognito-idp set-ui-customization \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --css "$(cat "$CSS_FILE")" \
  --image-file "fileb://$LOGO_FILE" \
  --query "UICustomization.{CSS: 'applied', LastModified: LastModifiedDate}" \
  --output table

echo ""
echo "✅ Cognito Hosted UI customization applied!"
echo ""

# Get Hosted UI URL
DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --query "UserPool.Domain" --output text)
REGION=$(aws configure get region 2>/dev/null || echo "ap-northeast-2")
echo "Preview URL: https://${DOMAIN}.auth.${REGION}.amazoncognito.com/login?client_id=${CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=https://example.com/callback"
echo ""
echo "Note: Open the URL above in a browser to verify the customization."
echo "      Replace 'redirect_uri' with your actual callback URL."
