# ADR-004: Split AgentCore Gateway by Role

## Status
Accepted

## Context
Single AgentCore Gateway with 29 MCP tools caused poor tool selection accuracy. LLM had to choose from too many tools, leading to irrelevant tool calls and longer response times.

## Decision
Split into 7 role-based Gateways (Infra/IaC/Data/Security/Monitoring/Cost/Ops) with 1 shared Runtime. route.ts keyword-based routing selects the appropriate Gateway via payload parameter.

## Consequences
- Tool selection accuracy improved (3-24 tools per gateway vs 29)
- Role-specific system prompts enable domain expertise
- No additional Runtime cost (single Runtime, dynamic Gateway)
- Gateway management complexity increased (7 vs 1)
- Lambda sources version controlled in agent/lambda/
