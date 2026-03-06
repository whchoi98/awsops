#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 5: Cognito Authentication Setup                                       #
#                                                                              #
#   Creates:                                                                   #
#     1. User Pool (email username, NO symbols required in password)           #
#     2. Domain (no 'aws' in name - Cognito restriction)                       #
#     3. App Client (OAuth2 authorization code flow)                           #
#     4. Admin user (email format, permanent password)                         #
#     5. Lambda@Edge (us-east-1) with embedded Cognito config                 #
#     6. Published Lambda version (for CloudFront association)                 #
#                                                                              #
#   Environment variables:                                                     #
#     CF_DOMAIN              - CloudFront domain name                          #
#     ADMIN_EMAIL            - Admin email [admin@awsops.local]               #
#     ADMIN_PASSWORD         - Admin password [!234Qwer]                      #
#     COGNITO_DOMAIN_PREFIX  - Domain prefix [ops-dashboard-auth]             #
#                                                                              #
#   Known issues handled:                                                      #
#     - Domain cannot contain 'aws' -> use 'ops-dashboard-auth'               #
#     - Username must be email format -> username-attributes email             #
#     - Password policy must NOT require symbols (known issue)                #
#     - Lambda@Edge must be in us-east-1                                       #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

CF_DOMAIN="${CF_DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@awsops.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-!234Qwer}"
COGNITO_DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX:-ops-dashboard-auth}"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 5: Cognito Authentication Setup${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# Auto-detect CloudFront domain if not set
if [ -z "$CF_DOMAIN" ]; then
    CF_DOMAIN=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?contains(Origins.Items[].DomainName, 'elb.amazonaws.com')].DomainName | [0]" \
        --output text --region us-east-1 2>/dev/null || echo "")
    if [ -n "$CF_DOMAIN" ] && [ "$CF_DOMAIN" != "None" ]; then
        echo "  Auto-detected CloudFront: $CF_DOMAIN"
    else
        echo -e "${RED}ERROR: CF_DOMAIN not set and could not auto-detect.${NC}"
        echo "  export CF_DOMAIN='dXXXXXXXXXX.cloudfront.net'"
        exit 1
    fi
fi

echo "  CloudFront:   $CF_DOMAIN"
echo "  Admin Email:  $ADMIN_EMAIL"
echo "  Domain:       $COGNITO_DOMAIN_PREFIX"
echo ""

# -- [1/6] Create User Pool ---------------------------------------------------
#   KNOWN ISSUE: Password policy must NOT require symbols.
#   We had failures when RequireSymbols was true.
#   See: docs/TROUBLESHOOTING.md #10 (Cognito)
echo -e "${CYAN}[1/6] Creating Cognito User Pool...${NC}"
echo -e "  ${YELLOW}NOTE: Password policy does NOT require symbols (known issue fix)${NC}"

POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name AWSops-UserPool \
    --auto-verified-attributes email \
    --username-attributes email \
    --mfa-configuration OFF \
    --policies '{
        "PasswordPolicy": {
            "MinimumLength": 8,
            "RequireUppercase": true,
            "RequireLowercase": true,
            "RequireNumbers": true,
            "RequireSymbols": false,
            "TemporaryPasswordValidityDays": 7
        }
    }' \
    --region "$REGION" \
    --query "UserPool.Id" --output text 2>&1)

if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
    echo -e "${RED}ERROR: Failed to create User Pool.${NC}"
    exit 1
fi
echo "  User Pool ID: $POOL_ID"

# -- [2/6] Create Domain ------------------------------------------------------
#   KNOWN ISSUE: Domain name cannot contain 'aws'.
#   See: docs/TROUBLESHOOTING.md #10
echo ""
echo -e "${CYAN}[2/6] Creating Cognito domain...${NC}"
echo -e "  ${YELLOW}NOTE: Domain cannot contain 'aws' -> using '$COGNITO_DOMAIN_PREFIX'${NC}"

aws cognito-idp create-user-pool-domain \
    --domain "$COGNITO_DOMAIN_PREFIX" \
    --user-pool-id "$POOL_ID" \
    --region "$REGION" 2>/dev/null || echo "  Domain may already exist, continuing..."

COGNITO_DOMAIN="${COGNITO_DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com"
echo "  Domain: $COGNITO_DOMAIN"

# -- [3/6] Create App Client ---------------------------------------------------
echo ""
echo -e "${CYAN}[3/6] Creating App Client (OAuth2 authorization code flow)...${NC}"

CLIENT_OUTPUT=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-name AWSops-Dashboard \
    --generate-secret \
    --supported-identity-providers COGNITO \
    --callback-urls "https://${CF_DOMAIN}/awsops/_callback" \
    --logout-urls "https://${CF_DOMAIN}/awsops" \
    --allowed-o-auth-flows code \
    --allowed-o-auth-scopes openid email profile \
    --allowed-o-auth-flows-user-pool-client \
    --region "$REGION" --output json 2>&1)

CLIENT_ID=$(echo "$CLIENT_OUTPUT" | python3 -c "import json,sys;print(json.load(sys.stdin)['UserPoolClient']['ClientId'])")
CLIENT_SECRET=$(echo "$CLIENT_OUTPUT" | python3 -c "import json,sys;print(json.load(sys.stdin)['UserPoolClient']['ClientSecret'])")

if [ -z "$CLIENT_ID" ]; then
    echo -e "${RED}ERROR: Failed to create App Client.${NC}"
    exit 1
fi
echo "  Client ID:     $CLIENT_ID"
echo "  Client Secret: ${CLIENT_SECRET:0:8}********"

# -- [4/6] Create Admin User --------------------------------------------------
echo ""
echo -e "${CYAN}[4/6] Creating admin user ($ADMIN_EMAIL)...${NC}"

aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
    --message-action SUPPRESS \
    --temporary-password 'TempPass1!' \
    --region "$REGION" 2>/dev/null || true

aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD" \
    --permanent \
    --region "$REGION" 2>/dev/null

echo "  Admin: $ADMIN_EMAIL (permanent password set)"

# -- [5/6] Create Lambda@Edge -------------------------------------------------
#   KNOWN ISSUE: Lambda@Edge MUST be deployed to us-east-1.
#   See: docs/TROUBLESHOOTING.md #10
echo ""
echo -e "${CYAN}[5/6] Creating Lambda@Edge (us-east-1)...${NC}"
echo -e "  ${YELLOW}NOTE: Lambda@Edge must be in us-east-1${NC}"

# Create IAM role for Lambda@Edge
aws iam create-role \
    --role-name AWSopsLambdaEdgeRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"},
            {"Effect": "Allow", "Principal": {"Service": "edgelambda.amazonaws.com"}, "Action": "sts:AssumeRole"}
        ]
    }' 2>/dev/null || true

aws iam attach-role-policy --role-name AWSopsLambdaEdgeRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

# Generate Lambda@Edge code with embedded Cognito config
cat > /tmp/cognito_edge.py << PYEOF
import json, base64, urllib.request, urllib.parse, hashlib, hmac

CONFIG = {
    'USER_POOL_ID': '${POOL_ID}',
    'CLIENT_ID': '${CLIENT_ID}',
    'CLIENT_SECRET': '${CLIENT_SECRET}',
    'COGNITO_DOMAIN': '${COGNITO_DOMAIN}',
    'CALLBACK_PATH': '/awsops/_callback',
    'PROTECTED_PATH': '/awsops',
}

def lambda_handler(event, context):
    request = event['Records'][0]['cf']['request']
    uri = request.get('uri', '')
    headers = request.get('headers', {})
    if not uri.startswith(CONFIG['PROTECTED_PATH']):
        return request
    if uri == CONFIG['CALLBACK_PATH']:
        return handle_callback(request, headers)
    cookies = parse_cookies(headers)
    id_token = cookies.get('awsops_token', '')
    if id_token:
        try:
            payload = decode_jwt_payload(id_token)
            import time
            if payload.get('exp', 0) > time.time():
                return request
        except:
            pass
    host = headers.get('host', [{}])[0].get('value', '')
    cb = f'https://{host}{CONFIG["CALLBACK_PATH"]}'
    url = (f'https://{CONFIG["COGNITO_DOMAIN"]}/login?'
           f'client_id={CONFIG["CLIENT_ID"]}&response_type=code&'
           f'scope=openid+email+profile&redirect_uri={urllib.parse.quote(cb)}')
    return {
        'status': '302', 'statusDescription': 'Found',
        'headers': {
            'location': [{'key': 'Location', 'value': url}],
            'cache-control': [{'key': 'Cache-Control', 'value': 'no-cache'}]
        }
    }

def handle_callback(request, headers):
    params = dict(urllib.parse.parse_qsl(request.get('querystring', '')))
    code = params.get('code', '')
    if not code:
        return {'status': '400', 'body': 'Missing authorization code'}
    host = headers.get('host', [{}])[0].get('value', '')
    cb = f'https://{host}{CONFIG["CALLBACK_PATH"]}'
    auth = base64.b64encode(f'{CONFIG["CLIENT_ID"]}:{CONFIG["CLIENT_SECRET"]}'.encode()).decode()
    data = urllib.parse.urlencode({
        'grant_type': 'authorization_code', 'code': code,
        'redirect_uri': cb, 'client_id': CONFIG['CLIENT_ID']
    }).encode()
    req = urllib.request.Request(
        f'https://{CONFIG["COGNITO_DOMAIN"]}/oauth2/token',
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': f'Basic {auth}'}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            tokens = json.loads(resp.read())
    except Exception as e:
        return {'status': '500', 'body': str(e)}
    return {
        'status': '302', 'statusDescription': 'Found',
        'headers': {
            'location': [{'key': 'Location', 'value': f'https://{host}/awsops'}],
            'set-cookie': [{'key': 'Set-Cookie',
                'value': f'awsops_token={tokens.get("id_token","")};Path=/;Secure;HttpOnly;SameSite=Lax;Max-Age=3600'}],
            'cache-control': [{'key': 'Cache-Control', 'value': 'no-cache'}]
        }
    }

def parse_cookies(headers):
    cookies = {}
    for c in headers.get('cookie', []):
        for p in c.get('value', '').split(';'):
            if '=' in p:
                k, v = p.strip().split('=', 1)
                cookies[k] = v
    return cookies

def decode_jwt_payload(token):
    p = token.split('.')[1]
    p += '=' * (4 - len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p))
PYEOF

cd /tmp && zip -j cognito_edge.zip cognito_edge.py

# Wait for IAM role propagation
echo "  Waiting for IAM role propagation (10s)..."
sleep 10

aws lambda create-function \
    --function-name awsops-cognito-auth \
    --runtime python3.12 \
    --handler cognito_edge.lambda_handler \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/AWSopsLambdaEdgeRole" \
    --zip-file fileb:///tmp/cognito_edge.zip \
    --timeout 5 --memory-size 128 \
    --region us-east-1 2>/dev/null || \
aws lambda update-function-code \
    --function-name awsops-cognito-auth \
    --zip-file fileb:///tmp/cognito_edge.zip \
    --region us-east-1

echo "  Lambda function: awsops-cognito-auth (us-east-1)"

# -- [6/6] Publish Lambda version ----------------------------------------------
echo ""
echo -e "${CYAN}[6/6] Publishing Lambda version...${NC}"
sleep 3

LAMBDA_VERSION=$(aws lambda publish-version \
    --function-name awsops-cognito-auth \
    --region us-east-1 \
    --query Version --output text)

LAMBDA_ARN="arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:awsops-cognito-auth:${LAMBDA_VERSION}"
echo "  Version: $LAMBDA_VERSION"
echo "  ARN:     $LAMBDA_ARN"

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 5 Complete: Cognito configured${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  User Pool ID:     $POOL_ID"
echo "  Client ID:        $CLIENT_ID"
echo "  Cognito Domain:   $COGNITO_DOMAIN"
echo "  Admin Login:      $ADMIN_EMAIL / ********"
echo "  Lambda@Edge:      awsops-cognito-auth:$LAMBDA_VERSION (us-east-1)"
echo "  Lambda ARN:       $LAMBDA_ARN"
echo ""
echo "  NEXT: Attach Lambda@Edge to CloudFront distribution"
echo "    CloudFront -> Behaviors -> /awsops* -> Viewer Request -> $LAMBDA_ARN"
echo ""
echo "  Password policy: symbols NOT required (known issue fix)"
echo ""
