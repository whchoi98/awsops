# Agent Module

## Role
Strands Agent for AgentCore Runtime. Connects to 7 role-based Gateways via MCP protocol.

## Key Files
- `agent.py` — Main entrypoint: dynamic Gateway selection via `payload.gateway` parameter
- `streamable_http_sigv4.py` — MCP StreamableHTTP with AWS SigV4 signing
- `Dockerfile` — Python 3.11-slim, arm64, port 8080
- `requirements.txt` — strands-agents, boto3, bedrock-agentcore, psycopg2-binary
- `lambda/` — 19 Lambda source files + `create_targets.py`

## Rules
- Docker image must be arm64 (`docker buildx --platform linux/arm64`)
- Gateway URL selected dynamically from `GATEWAYS` dict based on payload
- System prompt is role-specific (infra/iac/data/security/monitoring/cost/ops)
- Fallback: if MCP connection fails, run without tools (Bedrock direct)
