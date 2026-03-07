"""AWS Terraform MCP Lambda - Terraform/Terragrunt execution, provider docs, module search, Checkov"""
import json
import urllib.request
import re


def search_provider_docs(asset_name, provider='aws'):
    """Search AWS/AWSCC provider docs via AWS Knowledge MCP."""
    prefix = 'Terraform {} provider'.format(provider)
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "aws___search_documentation",
                   "arguments": {"search_phrase": "{} {}".format(prefix, asset_name), "limit": 5}}
    }).encode()
    req = urllib.request.Request("https://knowledge-mcp.global.api.aws",
        data=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    content = data.get("result", {}).get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    result = "\n".join(texts) if texts else "No results found"
    # Add direct doc links
    clean_name = asset_name.replace("awscc_", "").replace("aws_", "")
    service = clean_name.split("_")[0] if "_" in clean_name else clean_name
    if provider == 'aws':
        result += "\n\nDocs: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/{}".format(asset_name.replace("aws_", ""))
    elif provider == 'awscc':
        result += "\n\nDocs: https://registry.terraform.io/providers/hashicorp/awscc/latest/docs/resources/{}".format(asset_name.replace("awscc_", ""))
    return result


AWS_IA_MODULES = [
    {"name": "terraform-aws-bedrock", "description": "Amazon Bedrock module for generative AI applications",
     "url": "https://registry.terraform.io/modules/aws-ia/bedrock/aws/latest",
     "features": ["Knowledge Bases", "Agents", "Guardrails", "Data Automation"]},
    {"name": "terraform-aws-opensearch-serverless", "description": "OpenSearch Serverless for vector search",
     "url": "https://registry.terraform.io/modules/aws-ia/opensearch-serverless/aws/latest",
     "features": ["Vector collections", "Search collections", "Time series"]},
    {"name": "terraform-aws-sagemaker-endpoint", "description": "SageMaker real-time inference endpoints",
     "url": "https://registry.terraform.io/modules/aws-ia/sagemaker-endpoint/aws/latest",
     "features": ["Model deployment", "Auto-scaling", "Multi-model endpoints"]},
    {"name": "terraform-aws-serverless-streamlit", "description": "Serverless Streamlit applications on AWS",
     "url": "https://registry.terraform.io/modules/aws-ia/serverless-streamlit/aws/latest",
     "features": ["Cognito auth", "CloudFront", "ECS Fargate"]},
]


def search_aws_ia_modules(query):
    """Search AWS-IA Terraform modules."""
    if not query:
        return AWS_IA_MODULES
    q = query.lower()
    return [m for m in AWS_IA_MODULES if q in m["name"].lower() or q in m["description"].lower()
            or any(q in f.lower() for f in m["features"])] or AWS_IA_MODULES


def search_registry_module(module_url, version=None):
    """Fetch Terraform Registry module details."""
    # Parse module identifier (e.g., "hashicorp/consul/aws" or full URL)
    module_id = module_url
    if "registry.terraform.io" in module_url:
        parts = module_url.rstrip("/").split("/modules/")
        if len(parts) > 1:
            module_id = parts[1]

    api_url = "https://registry.terraform.io/v1/modules/{}".format(module_id)
    if version:
        api_url += "/{}".format(version)

    try:
        req = urllib.request.Request(api_url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        result = {
            "name": data.get("name", ""),
            "provider": data.get("provider", ""),
            "version": data.get("version", ""),
            "description": data.get("description", ""),
            "source": data.get("source", ""),
            "published_at": data.get("published_at", ""),
            "downloads": data.get("downloads", 0),
        }
        # Get root module details
        root = data.get("root", {})
        if root:
            result["inputs"] = [{"name": v.get("name"), "type": v.get("type", ""), "required": v.get("required", False),
                                  "description": v.get("description", "")[:100]}
                                 for v in root.get("inputs", [])]
            result["outputs"] = [{"name": o.get("name"), "description": o.get("description", "")[:100]}
                                  for o in root.get("outputs", [])]
        return result
    except Exception as e:
        return {"error": str(e), "module_url": module_url}


TF_BEST_PRACTICES = """# Terraform AWS Best Practices
## Structure
- Use modules for reusable components
- Separate environments (dev/staging/prod) with workspaces or directories
- Use remote state (S3 + DynamoDB locking)
## Security
- Use AWSCC provider for newer resources (Cloud Control API)
- Enable encryption on all storage resources
- Use IAM least-privilege policies
- Store secrets in Secrets Manager/SSM Parameter Store
## Code
- Pin provider and module versions
- Use variables with type constraints and validation
- Run terraform fmt and terraform validate before commits
- Use checkov or tfsec for security scanning
"""


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)

    if not t:
        if "asset_name" in params and "awscc" in params.get("asset_name", ""):
            t = "SearchAwsccProviderDocs"
        elif "asset_name" in params:
            t = "SearchAwsProviderDocs"
        elif "module_url" in params:
            t = "SearchUserProvidedModule"
        elif "query" in params:
            t = "SearchSpecificAwsIaModules"
        elif "command" in params:
            t = "ExecuteTerraformCommand"
        else:
            t = "terraform_best_practices"
        args = params

    if t == "SearchAwsProviderDocs":
        result = search_provider_docs(args.get("asset_name", ""), "aws")
        return {"statusCode": 200, "body": result[:50000]}

    elif t == "SearchAwsccProviderDocs":
        result = search_provider_docs(args.get("asset_name", ""), "awscc")
        return {"statusCode": 200, "body": result[:50000]}

    elif t == "SearchSpecificAwsIaModules":
        modules = search_aws_ia_modules(args.get("query", ""))
        return {"statusCode": 200, "body": json.dumps(modules, indent=2)}

    elif t == "SearchUserProvidedModule":
        result = search_registry_module(args.get("module_url", ""), args.get("version"))
        return {"statusCode": 200, "body": json.dumps(result, default=str, indent=2)}

    elif t in ("ExecuteTerraformCommand", "ExecuteTerragruntCommand"):
        return {"statusCode": 200, "body": json.dumps({
            "message": "Terraform/Terragrunt execution requires CLI access on EC2.",
            "suggestion": "Use the call_aws tool or SSM to run on EC2: "
                          "aws ssm send-command --document-name AWS-RunShellScript "
                          "--parameters 'commands=[\"cd /path && terraform {}\"]'".format(args.get("command", "plan")),
            "command": args.get("command", ""),
            "working_directory": args.get("working_directory", ""),
        })}

    elif t == "RunCheckovScan":
        return {"statusCode": 200, "body": json.dumps({
            "message": "Checkov scan requires CLI access on EC2.",
            "suggestion": "Install and run: pip install checkov && checkov -d {} --framework terraform".format(
                args.get("working_directory", ".")),
        })}

    elif t == "terraform_best_practices":
        return {"statusCode": 200, "body": TF_BEST_PRACTICES}

    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + t})}
