import json
import urllib.request

MCP_URL = "https://knowledge-mcp.global.api.aws"

TOOL_MAP = {
    "search_documentation": "aws___search_documentation",
    "read_documentation": "aws___read_documentation",
    "recommend": "aws___recommend",
    "list_regions": "aws___list_regions",
    "get_regional_availability": "aws___get_regional_availability",
}


def call_mcp_tool(tool_name, arguments):
    """Call a tool on the remote AWS Knowledge MCP server."""
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }).encode()
    req = urllib.request.Request(MCP_URL, data=payload, headers={
        "Content-Type": "application/json",
        "Accept": "application/json"
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    result = data.get("result", {})
    content = result.get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    return "\n".join(texts) if texts else json.dumps(result)


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)

    # Determine tool name
    tool_name = params.get("tool_name", "")
    arguments = params.get("arguments", params)

    # Infer tool from parameters if not specified
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

    # Map to MCP tool name (add aws___ prefix)
    mcp_tool = TOOL_MAP.get(tool_name, "")
    if not mcp_tool:
        return {"statusCode": 400, "body": json.dumps({
            "error": "Unknown tool: " + tool_name,
            "available": list(TOOL_MAP.keys())
        })}

    try:
        result = call_mcp_tool(mcp_tool, arguments)
        return {"statusCode": 200, "body": result[:50000]}
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
