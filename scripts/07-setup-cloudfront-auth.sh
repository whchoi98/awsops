#!/bin/bash
set -e
################################################################################
#                                                                              #
#   Step 7: CloudFront Lambda@Edge Authentication                              #
#                                                                              #
#   Attaches Cognito Lambda@Edge to CloudFront /awsops* behavior               #
#                                                                              #
#   Environment variables:                                                     #
#     CF_DOMAIN            - CloudFront domain (auto-detect)                   #
#     LAMBDA_EDGE_ARN      - Lambda@Edge ARN (auto-detect)                     #
#                                                                              #
################################################################################

# -- Colors & common variables ------------------------------------------------
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
WORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

CF_DOMAIN="${CF_DOMAIN:-}"
LAMBDA_EDGE_ARN="${LAMBDA_EDGE_ARN:-}"

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   Step 7: CloudFront Lambda@Edge Authentication${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# -- [1/4] Auto-detect CloudFront distribution --------------------------------
echo -e "${CYAN}[1/4] Auto-detecting CloudFront distribution...${NC}"

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

DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='${CF_DOMAIN}'].Id | [0]" \
    --output text --region us-east-1 2>/dev/null || echo "")

if [ -z "$DIST_ID" ] || [ "$DIST_ID" = "None" ]; then
    echo -e "${RED}ERROR: Could not find distribution ID for $CF_DOMAIN${NC}"
    exit 1
fi

echo "  Distribution ID: $DIST_ID"
echo "  Domain:          $CF_DOMAIN"

# -- [2/4] Auto-detect Lambda@Edge ARN ---------------------------------------
echo ""
echo -e "${CYAN}[2/4] Auto-detecting Lambda@Edge ARN...${NC}"

if [ -z "$LAMBDA_EDGE_ARN" ]; then
    VERSION=$(aws lambda list-versions-by-function \
        --function-name awsops-cognito-auth \
        --region us-east-1 \
        --query "Versions[?Version!='\$LATEST'].Version | [-1]" \
        --output text 2>/dev/null || echo "")

    if [ -z "$VERSION" ] || [ "$VERSION" = "None" ]; then
        echo -e "${RED}ERROR: Could not find published version for awsops-cognito-auth.${NC}"
        echo "  Run 05-setup-cognito.sh first to create the Lambda@Edge function."
        exit 1
    fi

    LAMBDA_EDGE_ARN="arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:awsops-cognito-auth:${VERSION}"
    echo "  Auto-detected version: $VERSION"
fi

echo "  Lambda@Edge ARN: $LAMBDA_EDGE_ARN"

# -- [3/4] Update CloudFront distribution ------------------------------------
echo ""
echo -e "${CYAN}[3/4] Updating CloudFront distribution...${NC}"

aws cloudfront get-distribution-config --id "$DIST_ID" --output json --region us-east-1 > /tmp/cf-config.json

ETAG=$(python3 -c "import json; data=json.load(open('/tmp/cf-config.json')); print(data['ETag'])")

python3 << PYEOF
import json, sys

with open('/tmp/cf-config.json') as f:
    data = json.load(f)

config = data['DistributionConfig']
lambda_arn = "${LAMBDA_EDGE_ARN}"

# Find the /awsops* cache behavior
behavior = None
if 'CacheBehaviors' in config and 'Items' in config['CacheBehaviors']:
    for b in config['CacheBehaviors']['Items']:
        if b.get('PathPattern', '') == '/awsops*':
            behavior = b
            break

if behavior is None:
    print("ERROR: No /awsops* cache behavior found in CloudFront distribution.", file=sys.stderr)
    sys.exit(1)

# Check if already attached with the same ARN (idempotent)
existing = behavior.get('LambdaFunctionAssociations', {}).get('Items', [])
for assoc in existing:
    if assoc.get('LambdaFunctionARN') == lambda_arn and assoc.get('EventType') == 'viewer-request':
        print("ALREADY_ATTACHED")
        # Still write the config so the script can skip gracefully
        with open('/tmp/cf-config-updated.json', 'w') as out:
            json.dump(config, out, indent=2)
        sys.exit(0)

# Add Lambda@Edge association
behavior['LambdaFunctionAssociations'] = {
    'Quantity': 1,
    'Items': [
        {
            'LambdaFunctionARN': lambda_arn,
            'EventType': 'viewer-request',
            'IncludeBody': False
        }
    ]
}

with open('/tmp/cf-config-updated.json', 'w') as out:
    json.dump(config, out, indent=2)

print("UPDATED")
PYEOF

RESULT=$?
if [ $RESULT -ne 0 ]; then
    echo -e "${RED}ERROR: Failed to update distribution config.${NC}"
    exit 1
fi

UPDATE_STATUS=$(python3 << 'CHECKEOF'
import json, sys
with open('/tmp/cf-config.json') as f:
    data = json.load(f)
config = data['DistributionConfig']
if 'CacheBehaviors' in config and 'Items' in config['CacheBehaviors']:
    for b in config['CacheBehaviors']['Items']:
        if b.get('PathPattern', '') == '/awsops*':
            existing = b.get('LambdaFunctionAssociations', {}).get('Items', [])
            for assoc in existing:
                if assoc.get('EventType') == 'viewer-request':
                    print("ALREADY_ATTACHED")
                    sys.exit(0)
print("NEEDS_UPDATE")
CHECKEOF
)

if [ "$UPDATE_STATUS" = "ALREADY_ATTACHED" ]; then
    echo -e "  ${YELLOW}Lambda@Edge already attached to /awsops* behavior, skipping update.${NC}"
else
    aws cloudfront update-distribution \
        --id "$DIST_ID" \
        --if-match "$ETAG" \
        --distribution-config file:///tmp/cf-config-updated.json \
        --region us-east-1 > /dev/null

    echo "  CloudFront distribution updated with Lambda@Edge viewer-request trigger."
fi

# -- [4/4] Wait for deployment + verify --------------------------------------
echo ""
echo -e "${CYAN}[4/4] Waiting for CloudFront deployment...${NC}"
echo -e "  ${YELLOW}NOTE: This may take several minutes${NC}"

aws cloudfront wait distribution-deployed --id "$DIST_ID" --region us-east-1

echo "  Distribution deployed."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${CF_DOMAIN}/awsops" 2>/dev/null || echo "000")
echo "  Response code: $HTTP_CODE"

if [ "$HTTP_CODE" = "302" ]; then
    LOCATION=$(curl -s -D - -o /dev/null "https://${CF_DOMAIN}/awsops" 2>/dev/null | grep -i "^location:" | tr -d '\r')
    echo -e "  ${GREEN}Authentication redirect working.${NC}"
    echo "  Login URL: ${LOCATION#*: }"
else
    echo -e "  ${YELLOW}Expected 302 redirect, got $HTTP_CODE. Verify manually.${NC}"
fi

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}   Step 7 Complete: CloudFront Lambda@Edge attached${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo "  Distribution:     $DIST_ID ($CF_DOMAIN)"
echo "  Lambda@Edge ARN:  $LAMBDA_EDGE_ARN"
echo "  CloudFront URL:   https://${CF_DOMAIN}/awsops"
echo ""
echo "  Login: admin@awsops.local"
echo "  Password policy: symbols NOT required (known issue fix)"
echo ""
