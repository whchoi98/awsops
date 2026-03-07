"""AWS IaC MCP Lambda - CloudFormation/CDK validation, troubleshooting, documentation"""
import json
import boto3
import urllib.request
import re
import html


# --- Static content tools ---

CDK_BEST_PRACTICES = """# CDK Best Practices
## Security
- Use IAM least-privilege policies, avoid wildcards
- Enable encryption at rest (KMS) and in transit (TLS)
- Use VPC with private subnets for compute resources
- Enable CloudTrail and VPC Flow Logs

## Architecture
- One stack per environment (dev/staging/prod)
- Use constructs for reusable components
- Parameterize with CfnParameters or context values
- Tag all resources with environment, project, owner

## Code Quality
- Use L2/L3 constructs over L1 (Cfn*) when available
- Write unit tests with assertions library
- Use cdk diff before deploy
- Store secrets in Secrets Manager, not environment variables

## Deployment
- Use cdk bootstrap for each account/region
- Use --require-approval for production
- Enable termination protection on production stacks
- Use change sets for critical updates
"""

PRE_DEPLOY_VALIDATION = """# CloudFormation Pre-Deploy Validation
## Steps
1. **Lint**: `cfn-lint template.yaml` - syntax and schema validation
2. **Guard**: `cfn-guard validate -d template.yaml -r rules.guard` - compliance rules
3. **Change Set**: Create and review before executing
   ```
   aws cloudformation create-change-set \\
     --stack-name MyStack \\
     --template-body file://template.yaml \\
     --change-set-name review-changes
   aws cloudformation describe-change-set \\
     --stack-name MyStack \\
     --change-set-name review-changes
   ```
4. **Review**: Check for replacements, deletions, and scope of changes
5. **Execute**: `aws cloudformation execute-change-set --change-set-name review-changes --stack-name MyStack`
"""


def validate_cfn_template(template_content, region='ap-northeast-2'):
    """Validate CloudFormation template using AWS API."""
    cfn = boto3.client('cloudformation', region_name=region)
    try:
        resp = cfn.validate_template(TemplateBody=template_content)
        return {
            'valid': True,
            'description': resp.get('Description', ''),
            'parameters': [{'key': p['ParameterKey'], 'default': p.get('DefaultValue', '')}
                           for p in resp.get('Parameters', [])],
            'capabilities': resp.get('Capabilities', []),
            'resources_count': template_content.count('Type: AWS::') + template_content.count('"Type": "AWS::'),
        }
    except Exception as e:
        return {'valid': False, 'error': str(e)}


def troubleshoot_cfn_deployment(stack_name, region='ap-northeast-2'):
    """Troubleshoot CloudFormation deployment failures."""
    cfn = boto3.client('cloudformation', region_name=region)
    try:
        # Get stack info
        stack = cfn.describe_stacks(StackName=stack_name)['Stacks'][0]
        status = stack['StackStatus']

        # Get failed events
        events = cfn.describe_stack_events(StackName=stack_name)['StackEvents']
        failed = [e for e in events if 'FAILED' in e.get('ResourceStatus', '')]

        failures = []
        for e in failed[:10]:
            failures.append({
                'resource': e.get('LogicalResourceId', ''),
                'type': e.get('ResourceType', ''),
                'status': e.get('ResourceStatus', ''),
                'reason': e.get('ResourceStatusReason', ''),
                'timestamp': str(e.get('Timestamp', '')),
            })

        result = {
            'stackName': stack_name,
            'status': status,
            'statusReason': stack.get('StackStatusReason', ''),
            'failures': failures,
            'consoleUrl': 'https://{}.console.aws.amazon.com/cloudformation/home?region={}#/stacks/stackinfo?stackId={}'.format(
                region, region, stack.get('StackId', '')),
        }

        # Common patterns
        for f in failures:
            reason = f['reason'].lower()
            if 'already exists' in reason:
                f['suggestion'] = 'Resource already exists. Use import or change logical ID.'
            elif 'limit' in reason or 'quota' in reason:
                f['suggestion'] = 'Service quota exceeded. Request increase via Service Quotas.'
            elif 'permission' in reason or 'denied' in reason:
                f['suggestion'] = 'IAM permission issue. Check execution role policies.'
            elif 'not found' in reason:
                f['suggestion'] = 'Referenced resource not found. Check cross-stack exports.'

        return result
    except Exception as e:
        return {'error': str(e)}


def search_cfn_docs(query):
    """Search CloudFormation documentation via AWS Knowledge MCP."""
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "aws___search_documentation",
                   "arguments": {"search_phrase": "CloudFormation " + query, "limit": 5}}
    }).encode()
    req = urllib.request.Request("https://knowledge-mcp.global.api.aws",
        data=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    content = data.get("result", {}).get("content", [])
    return "\n".join(c.get("text", "") for c in content if c.get("type") == "text")


def search_cdk_docs(query, language='typescript'):
    """Search CDK documentation via AWS Knowledge MCP."""
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "aws___search_documentation",
                   "arguments": {"search_phrase": "CDK {} {}".format(language, query), "limit": 5}}
    }).encode()
    req = urllib.request.Request("https://knowledge-mcp.global.api.aws",
        data=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    content = data.get("result", {}).get("content", [])
    return "\n".join(c.get("text", "") for c in content if c.get("type") == "text")


def read_doc_page(url, max_length=10000):
    """Fetch documentation page and convert to simple text."""
    req = urllib.request.Request(url, headers={'User-Agent': 'AWSops-IaC-MCP/1.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode('utf-8', errors='replace')
    # Simple HTML to text
    text = re.sub(r'<script[^>]*>.*?</script>', '', raw, flags=re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:max_length]


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    tool_name = params.get("tool_name", "")
    args = params.get("arguments", params)

    # Infer tool
    if not tool_name:
        if "template_content" in params:
            tool_name = "validate_cloudformation_template"
        elif "stack_name" in params:
            tool_name = "troubleshoot_cloudformation_deployment"
        elif "query" in params and "cdk" in params.get("query", "").lower():
            tool_name = "search_cdk_documentation"
        elif "query" in params:
            tool_name = "search_cloudformation_documentation"
        elif "url" in params:
            tool_name = "read_iac_documentation_page"
        else:
            tool_name = "cdk_best_practices"
        args = params

    if tool_name == "validate_cloudformation_template":
        result = validate_cfn_template(args.get("template_content", ""), args.get("region", "ap-northeast-2"))
        return {"statusCode": 200, "body": json.dumps(result, default=str)}

    elif tool_name == "check_cloudformation_template_compliance":
        # Simplified: run validate + basic security checks
        tmpl = args.get("template_content", "")
        issues = []
        if "AWS::IAM" in tmpl and "*" in tmpl:
            issues.append({"severity": "HIGH", "rule": "no-wildcard-iam", "message": "Wildcard (*) found in IAM policy"})
        if "PubliclyAccessible" in tmpl and "true" in tmpl.lower():
            issues.append({"severity": "HIGH", "rule": "no-public-access", "message": "PubliclyAccessible is true"})
        if "Encrypted" not in tmpl and ("AWS::RDS" in tmpl or "AWS::EBS" in tmpl):
            issues.append({"severity": "MEDIUM", "rule": "encryption-required", "message": "Encryption not explicitly enabled"})
        validation = validate_cfn_template(tmpl)
        return {"statusCode": 200, "body": json.dumps({"validation": validation, "compliance_issues": issues}, default=str)}

    elif tool_name == "troubleshoot_cloudformation_deployment":
        result = troubleshoot_cfn_deployment(args.get("stack_name", ""), args.get("region", "ap-northeast-2"))
        return {"statusCode": 200, "body": json.dumps(result, default=str)}

    elif tool_name == "get_cloudformation_pre_deploy_validation_instructions":
        return {"statusCode": 200, "body": PRE_DEPLOY_VALIDATION}

    elif tool_name == "search_cdk_documentation":
        result = search_cdk_docs(args.get("query", ""), args.get("language", "typescript"))
        return {"statusCode": 200, "body": result[:50000]}

    elif tool_name == "search_cloudformation_documentation":
        result = search_cfn_docs(args.get("query", ""))
        return {"statusCode": 200, "body": result[:50000]}

    elif tool_name == "search_cdk_samples_and_constructs":
        result = search_cdk_docs(args.get("query", "") + " example sample", args.get("language", "typescript"))
        return {"statusCode": 200, "body": result[:50000]}

    elif tool_name == "cdk_best_practices":
        return {"statusCode": 200, "body": CDK_BEST_PRACTICES}

    elif tool_name == "read_iac_documentation_page":
        try:
            text = read_doc_page(args.get("url", ""), args.get("max_length", 10000))
            return {"statusCode": 200, "body": text}
        except Exception as e:
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + tool_name})}
