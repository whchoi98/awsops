---
sidebar_position: 3
title: AI Assistant Quick Start
description: Basic usage of the AWSops AI Assistant
---

# AI Assistant Quick Start

The AWSops AI Assistant is powered by Amazon Bedrock AgentCore, allowing you to ask questions and request analysis about your AWS infrastructure using natural language.

## Getting Started

### 1. Access the AI Assistant Page

Click **AI Assistant** in the sidebar.

### 2. Enter Your Question

Type your question in the input field at the bottom of the screen and press **Enter** or click the send button.

### 3. View the Response

The AI analyzes your question, routes it to the appropriate Gateway, and generates a response using available tools.

## Example Questions

### Resource Status Queries

```
Show me the EC2 instance status
```

```
How many S3 buckets do we have?
```

```
List the Lambda functions
```

### Network Analysis

```
Analyze the VPC network configuration
```

```
Check if any security groups have 0.0.0.0/0 inbound rules
```

### Security Checks

```
Check for security issues
```

```
Are there any IAM users without MFA enabled?
```

### Cost Analysis

```
Show me this month's cost breakdown
```

```
Compare costs by service
```

### Container Status

```
What's the EKS cluster status?
```

```
Check the ECS service status
```

## 10-Route Classification

The AI Assistant analyzes questions and automatically routes them to the most appropriate of 10 specialized routes.

| Priority | Route | Purpose |
|----------|-------|---------|
| 1 | code | Python code execution, calculations, visualization |
| 2 | network | VPC, TGW, VPN, Flow Logs analysis |
| 3 | container | EKS, ECS, Istio troubleshooting |
| 4 | iac | CDK, CloudFormation, Terraform |
| 5 | data | DynamoDB, RDS, ElastiCache, MSK |
| 6 | security | IAM, policy simulation, security summary |
| 7 | monitoring | CloudWatch, CloudTrail |
| 8 | cost | Cost analysis, forecasting, budgets |
| 9 | aws-data | Resource lists/status (Steampipe SQL) |
| 10 | general | General AWS questions, documentation search |

:::tip Checking the Route
You can see which Gateway was used in the route information displayed at the bottom of each response.
Example: `Network Gateway (17 tools)`, `Bedrock + Steampipe SQL`
:::

## Understanding Responses

### Response Structure

```
┌────────────────────────────────────────────────────────┐
│  [AI Icon]                                             │
│                                                        │
│  Response content (Markdown format)                    │
│  - Supports tables, lists, code blocks                 │
│                                                        │
├────────────────────────────────────────────────────────┤
│  Network Gateway (17 tools)  │  Claude sonnet-4.6  │ 3.2s │
├────────────────────────────────────────────────────────┤
│  Tools: list_vpcs, get_vpc_network_details, ...        │
│  Queried: aws_vpc, aws_vpc_subnet                      │
└────────────────────────────────────────────────────────┘
```

### Displayed Information

- **Route Path**: Which Gateway processed the request
- **Model**: The Claude model used (Sonnet/Opus)
- **Response Time**: Time taken to process
- **Tools Used**: List of MCP tools called
- **Queried Resources**: Tables queried from Steampipe

### Real-time Streaming

Responses are streamed in real-time and displayed progressively on screen. The optimal streaming mode is automatically selected based on the response path:

- **Single Gateway response**: Displayed naturally with a typing effect
- **Multi-route synthesis**: Real-time streaming of synthesis results via Bedrock Converse API
- **Data queries (aws-data)**: Bedrock native token streaming

## Model Selection

Select a model from the dropdown in the upper right corner:

- **Claude Sonnet 4.6**: Fast responses, suitable for general questions (default)
- **Claude Opus 4.6**: Complex analysis, suitable for deep reasoning

## Related Questions

After each response, related follow-up questions appear as buttons. Click one to automatically input that question.

Example:
```
[Show IAM user list with Access Key status]
[Check if any users don't have MFA enabled]
[Check for security groups with 0.0.0.0/0 inbound]
```

## Conversation History

### Session History
The current session's conversation is maintained on screen. You can ask follow-up questions that reference previous conversations.

### Saved History
Expand the **Conversation History** panel at the bottom of the screen to view and re-ask questions from previous sessions.

## Next Steps

- [AI Assistant Details](../overview/ai-assistant) - 10-route classification details and advanced features
- [AgentCore Details](../overview/agentcore) - AgentCore architecture and tool list
