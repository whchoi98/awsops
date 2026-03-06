# ADR-002: AI Hybrid Routing

## Status: Accepted

## Context
AI Assistant needs to handle 4 types of questions: code execution, network troubleshooting, AWS resource queries, and general questions. Each requires different data sources and processing.

## Decision
Route questions to different backends based on keyword detection:
1. Code execution → Bedrock + AgentCore Code Interpreter
2. Network (ENI, route, flow log) → AgentCore Runtime (Strands + Gateway MCP)
3. AWS resources (EC2, VPC, RDS) → Steampipe query + Bedrock Direct
4. General → AgentCore Runtime → Bedrock fallback

## Reason
- AgentCore Runtime runs in isolated microVM → cannot access localhost Steampipe
- Steampipe provides real-time data → best for AWS resource questions
- Gateway MCP tools (Lambda) → best for network analysis (Reachability Analyzer, TGW routes, NACLs)
- Code Interpreter → best for computation and data analysis

## Consequences
- `needsCodeInterpreter()`, `needsAgentCore()`, `needsAWSData()` keyword functions in `api/ai/route.ts`
- AgentCore cold start can take 30-60 seconds
- Steampipe queries cached for 5 minutes
