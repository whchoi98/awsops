"""
AWS Knowledge MCP Lambda - Proxy to AWS Knowledge MCP for documentation search, recommendations, and region info
AWS 문서 검색, 추천, 리전 정보를 위한 AWS Knowledge MCP 프록시 람다
"""
import json
import urllib.request
from cross_account import get_client

# AWS Knowledge MCP endpoint URL / AWS Knowledge MCP 엔드포인트 URL
MCP_URL = "https://knowledge-mcp.global.api.aws"

# Tool name mapping: short name -> MCP tool name / 도구 이름 매핑: 단축 이름 -> MCP 도구 이름
TOOL_MAP = {
    "search_documentation": "aws___search_documentation",
    "read_documentation": "aws___read_documentation",
    "recommend": "aws___recommend",
    "list_regions": "aws___list_regions",
    "get_regional_availability": "aws___get_regional_availability",
}


def call_mcp_tool(tool_name, arguments):
    """Call a tool on the remote AWS Knowledge MCP server. / 원격 AWS Knowledge MCP 서버에서 도구를 호출합니다."""
    # Build JSON-RPC 2.0 request payload / JSON-RPC 2.0 요청 페이로드 구성
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }).encode()
    # Send HTTP POST to MCP endpoint / MCP 엔드포인트에 HTTP POST 전송
    req = urllib.request.Request(MCP_URL, data=payload, headers={
        "Content-Type": "application/json",
        "Accept": "application/json"
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    # Extract text content from MCP response / MCP 응답에서 텍스트 콘텐츠 추출
    result = data.get("result", {})
    content = result.get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    return "\n".join(texts) if texts else json.dumps(result)


def lambda_handler(event, context):
    """Lambda entry point for AWS Knowledge MCP tools. / AWS Knowledge MCP 도구의 람다 진입점."""
    params = event if isinstance(event, dict) else json.loads(event)

    # Determine tool name / 도구 이름 결정
    tool_name = params.get("tool_name", "")
    arguments = params.get("arguments", params)
    target_account_id = arguments.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Infer tool from parameters if not specified / 도구명이 없으면 파라미터로 추론
    if not tool_name:
        if "search_phrase" in params:
            tool_name = "search_documentation"
            arguments = params
        elif "url" in params and "max_length" in params:
            tool_name = "read_documentation"
            arguments = params
        elif "url" in params:
            tool_name = "recommend"
            arguments = params
        elif "resource_type" in params:
            tool_name = "get_regional_availability"
            arguments = params
        else:
            tool_name = "list_regions"
            arguments = {}

    # Map to MCP tool name (add aws___ prefix) / MCP 도구 이름으로 매핑 (aws___ 접두사 추가)
    mcp_tool = TOOL_MAP.get(tool_name, "")
    if not mcp_tool:
        # Unknown tool error / 알 수 없는 도구 오류
        return {"statusCode": 400, "body": json.dumps({
            "error": "Unknown tool: " + tool_name,
            "available": list(TOOL_MAP.keys())
        })}

    try:
        # Call remote MCP tool and return result / 원격 MCP 도구 호출 후 결과 반환
        result = call_mcp_tool(mcp_tool, arguments)
        return {"statusCode": 200, "body": result[:50000]}
    except Exception as e:
        # Return error if MCP call fails / MCP 호출 실패 시 오류 반환
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
