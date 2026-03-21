---
sidebar_position: 2
---

# Troubleshooting FAQ

Problems that may occur while using the AWSops dashboard and their solutions.

<details>
<summary>Data is not being displayed</summary>

Check if the Steampipe service is running.

**1. Check Service Status**
```bash
steampipe service status
```

**2. Start the Service if Stopped**
```bash
steampipe service start --database-listen local --database-port 9193
```

**3. Test Connection**
```bash
steampipe query "SELECT COUNT(*) FROM aws_ec2_instance" --output json --input=false
```

**4. Check Logs**
```bash
tail -20 /tmp/awsops-server.log
```

**Common Causes**
- Steampipe service not running
- AWS credentials expired (check EC2 Instance Role)
- Network connectivity issues

</details>

<details>
<summary>Page loading is slow</summary>

**1. Check Production Build**

Development mode is very slow. Use the Production build:

```bash
# Check current mode
ps aux | grep next

# Run Production build
npm run build
npm run start
```

| Mode | Response Time |
|------|---------------|
| Development (npm run dev) | 1-2 seconds |
| Production (npm run build + start) | 3-6ms |

**2. Check Steampipe Pool Settings**

Pool configuration in `src/lib/steampipe.ts`:
```typescript
const pool = new Pool({
  max: 5,                    // Concurrent connections
  statement_timeout: 120000,  // 2-minute timeout
});
```

**3. If Only Specific Pages Are Slow**
- CloudTrail: Takes time with many events (lazy-load on tab click)
- Cost: Snapshot fallback when CE API is blocked in MSP environments
- Compliance: 2-5 minutes for benchmark execution (normal)

</details>

<details>
<summary>Cost page is not visible</summary>

This occurs in environments (such as MSP) where the Cost Explorer API is blocked.

**1. Check Cost Availability**

Check if Cost-related cards are displayed on the dashboard home. If not displayed, the API is blocked.

**2. Use Snapshot Mode**

When the Cost API is blocked, snapshot data is used:

```bash
# Save snapshot (from an environment with Cost API access)
aws ce get-cost-and-usage ... > data/cost/snapshot.json
```

**3. Check Configuration**

`costEnabled` setting in `data/config.json`:
```json
{
  "costEnabled": true
}
```

In MSP environments, this is automatically detected as `false`.

</details>

<details>
<summary>CloudTrail event loading times out</summary>

CloudTrail event queries can take time depending on the data volume.

**Current Implementation**
- Page load: Only fetches Trail list (fast)
- Events/Writes tab click: Separate API call to fetch events (lazy-load)

**CloudFront Timeout Settings**
- Default: 30 seconds
- Recommended: 60 seconds

Increase Origin Read Timeout in CDK:
```typescript
originReadTimeout: Duration.seconds(60)
```

**Alternatives**
- Query only recent events (limit time period)
- Filter specific events (eventName, userName)
- Query the AI assistant in natural language

</details>

<details>
<summary>Some data is missing due to SCP blocking</summary>

Some data may be missing when certain APIs are blocked by SCP (Service Control Policy).

**Affected API Examples**
| API | Impact |
|-----|--------|
| `iam:ListMFADevices` | Cannot query MFA status |
| `lambda:GetFunction` | Cannot query Lambda tags |
| `iam:ListAttachedUserPolicies` | Cannot query attached policies |

**Solution 1: ignore_error_codes Setting**

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

This setting only ignores **table-level** errors.

**Solution 2: Remove Columns**

Column hydrate errors require removing those columns from the query. AWSops has excluded problematic columns from default queries considering SCP environments.

**Excluded Columns**
- `mfa_enabled` (IAM user list)
- `attached_policy_arns` (IAM user list)
- `tags` (Lambda list)

</details>

<details>
<summary>Cannot log in</summary>

This is a Cognito authentication issue.

**1. Check Cognito Domain**
- Domain cannot contain the string 'aws'
- Example: `ops-dashboard-auth.auth.ap-northeast-2.amazoncognito.com`

**2. Check Lambda@Edge Region**
- Lambda@Edge can **only** be deployed in us-east-1
- Must match CloudFront region

**3. Check Callback URL**
Verify the Callback URL in the Cognito App Client is correct:
```
https://<cloudfront-domain>/awsops/api/auth/callback
```

**4. Check Cookies**
- HttpOnly cookies cannot be checked via JavaScript
- Check in Browser Developer Tools > Application > Cookies
- Verify existence of `id_token`, `access_token`, `refresh_token`

**5. Log Out and Log In Again**
```bash
# Server-side cookie deletion
curl -X POST https://<domain>/awsops/api/auth
```

</details>
