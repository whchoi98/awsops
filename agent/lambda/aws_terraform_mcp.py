"""
AWS Terraform MCP Lambda - Terraform/Terragrunt execution, provider docs, module search, Checkov
Terraform/Terragrunt 실행, 프로바이더 문서, 모듈 검색, Checkov 보안 스캔을 위한 AWS Terraform MCP 람다
"""
import json
import urllib.request
import re
from cross_account import get_client


def search_provider_docs(asset_name, provider='aws'):
    """Search AWS/AWSCC provider docs via AWS Knowledge MCP. / AWS Knowledge MCP를 통해 AWS/AWSCC 프로바이더 문서를 검색합니다."""
    prefix = 'Terraform {} provider'.format(provider)
    # Build JSON-RPC request payload / JSON-RPC 요청 페이로드 구성
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "aws___search_documentation",
                   "arguments": {"search_phrase": "{} {}".format(prefix, asset_name), "limit": 5}}
    }).encode()
    # Send request to AWS Knowledge MCP endpoint / AWS Knowledge MCP 엔드포인트에 요청 전송
    req = urllib.request.Request("https://knowledge-mcp.global.api.aws",
        data=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    # Extract text content from MCP response / MCP 응답에서 텍스트 콘텐츠 추출
    content = data.get("result", {}).get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    result = "\n".join(texts) if texts else "No results found"
    # Add direct doc links / 직접 문서 링크 추가
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
    """Search AWS-IA Terraform modules. / AWS-IA Terraform 모듈을 검색합니다."""
    # Return all modules if no query / 쿼리가 없으면 전체 모듈 반환
    if not query:
        return AWS_IA_MODULES
    # Filter modules by name, description, or features / 이름, 설명, 기능으로 모듈 필터링
    q = query.lower()
    return [m for m in AWS_IA_MODULES if q in m["name"].lower() or q in m["description"].lower()
            or any(q in f.lower() for f in m["features"])] or AWS_IA_MODULES


def search_registry_module(module_url, version=None):
    """Fetch Terraform Registry module details. / Terraform 레지스트리 모듈 세부 정보를 가져옵니다."""
    # Parse module identifier (e.g., "hashicorp/consul/aws" or full URL) / 모듈 식별자 파싱 (예: "hashicorp/consul/aws" 또는 전체 URL)
    module_id = module_url
    if "registry.terraform.io" in module_url:
        parts = module_url.rstrip("/").split("/modules/")
        if len(parts) > 1:
            module_id = parts[1]

    # Build Terraform Registry API URL / Terraform 레지스트리 API URL 구성
    api_url = "https://registry.terraform.io/v1/modules/{}".format(module_id)
    if version:
        api_url += "/{}".format(version)

    try:
        # Fetch module metadata from Registry API / 레지스트리 API에서 모듈 메타데이터 가져오기
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
        # Get root module details (inputs/outputs) / 루트 모듈 세부 정보 조회 (입력/출력)
        root = data.get("root", {})
        if root:
            result["inputs"] = [{"name": v.get("name"), "type": v.get("type", ""), "required": v.get("required", False),
                                  "description": v.get("description", "")[:100]}
                                 for v in root.get("inputs", [])]
            result["outputs"] = [{"name": o.get("name"), "description": o.get("description", "")[:100]}
                                  for o in root.get("outputs", [])]
        return result
    except Exception as e:
        # Return error if registry lookup fails / 레지스트리 조회 실패 시 오류 반환
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
    """Lambda entry point for Terraform MCP tools. / Terraform MCP 도구의 람다 진입점."""
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    target_account_id = args.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Infer tool from parameters if not specified / 도구명이 없으면 파라미터로 추론
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

    # Tool handler: search AWS provider docs / 도구 핸들러: AWS 프로바이더 문서 검색
    if t == "SearchAwsProviderDocs":
        result = search_provider_docs(args.get("asset_name", ""), "aws")
        return {"statusCode": 200, "body": result[:50000]}

    # Tool handler: search AWSCC provider docs / 도구 핸들러: AWSCC 프로바이더 문서 검색
    elif t == "SearchAwsccProviderDocs":
        result = search_provider_docs(args.get("asset_name", ""), "awscc")
        return {"statusCode": 200, "body": result[:50000]}

    # Tool handler: search AWS-IA modules / 도구 핸들러: AWS-IA 모듈 검색
    elif t == "SearchSpecificAwsIaModules":
        modules = search_aws_ia_modules(args.get("query", ""))
        return {"statusCode": 200, "body": json.dumps(modules, indent=2)}

    # Tool handler: search user-provided module from Registry / 도구 핸들러: 사용자 지정 레지스트리 모듈 검색
    elif t == "SearchUserProvidedModule":
        result = search_registry_module(args.get("module_url", ""), args.get("version"))
        return {"statusCode": 200, "body": json.dumps(result, default=str, indent=2)}

    # Tool handler: Terraform/Terragrunt CLI execution (requires EC2) / 도구 핸들러: Terraform/Terragrunt CLI 실행 (EC2 필요)
    elif t in ("ExecuteTerraformCommand", "ExecuteTerragruntCommand"):
        return {"statusCode": 200, "body": json.dumps({
            "message": "Terraform/Terragrunt execution requires CLI access on EC2.",
            "suggestion": "Use the call_aws tool or SSM to run on EC2: "
                          "aws ssm send-command --document-name AWS-RunShellScript "
                          "--parameters 'commands=[\"cd /path && terraform {}\"]'".format(args.get("command", "plan")),
            "command": args.get("command", ""),
            "working_directory": args.get("working_directory", ""),
        })}

    # Tool handler: Checkov security scan (requires EC2) / 도구 핸들러: Checkov 보안 스캔 (EC2 필요)
    elif t == "RunCheckovScan":
        return {"statusCode": 200, "body": json.dumps({
            "message": "Checkov scan requires CLI access on EC2.",
            "suggestion": "Install and run: pip install checkov && checkov -d {} --framework terraform".format(
                args.get("working_directory", ".")),
        })}

    # Tool handler: Terraform best practices / 도구 핸들러: Terraform 모범 사례
    elif t == "terraform_best_practices":
        return {"statusCode": 200, "body": TF_BEST_PRACTICES}

    # Unknown tool error / 알 수 없는 도구 오류
    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + t})}
