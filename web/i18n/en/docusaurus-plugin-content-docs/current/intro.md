---
sidebar_position: 1
title: Introduction to AWSops
description: Overview and key features of the AWS + Kubernetes operations dashboard
---

import Screenshot from '@site/src/components/Screenshot';

# Introduction to AWSops

AWSops is an integrated operations dashboard for real-time monitoring and management of AWS and Kubernetes infrastructure. Built on Steampipe, Next.js 14, and Amazon Bedrock AgentCore, it provides powerful data querying and AI-powered analysis capabilities.

<Screenshot src="/screenshots/overview/dashboard.png" alt="Dashboard" />

## Key Features

### Real-time Resource Monitoring
- View AWS and Kubernetes resource status at a glance across **37 pages**
- Dashboards for major services including EC2, Lambda, ECS, EKS, S3, RDS, and VPC
- Real-time CloudWatch metrics integration

### AI-Powered Analysis
- AI assistant powered by **Amazon Bedrock AgentCore**
- Query and analyze infrastructure using natural language
- Leverage 8 specialized Gateways and 125 MCP tools
- Support for Claude Sonnet/Opus 4.6 models

### Network Troubleshooting
- VPC Flow Logs analysis
- Reachability Analyzer integration
- Transit Gateway routing diagnostics
- Network topology visualization

### Security and Compliance
- CIS Benchmark v1.5 through v4.0 support (431 controls)
- IAM user/role/policy analysis
- Automatic detection of security issues (Public S3, Open SG, Unencrypted EBS)

### Cost Management
- Cost Explorer integration
- Cost analysis by service and region
- ECS/EKS container workload cost tracking

## Architecture

<div style={{background: 'white', padding: '16px', borderRadius: '8px', marginBottom: '1rem'}}>

![System Architecture](/img/architecture.png)

</div>

### Infrastructure

| Component | Configuration | Description |
|-----------|--------------|-------------|
| **CloudFront** | CACHING_DISABLED | Custom Header validation blocks direct ALB access |
| **Lambda@Edge** | us-east-1, Node.js 20 | JWT validation, OAuth2 callback, cookie management |
| **Cognito** | User Pool + Hosted UI | Email/username login, HttpOnly cookie auth |
| **ALB** | Internet-facing | Port 80 (VSCode) / 3000 (Dashboard) |
| **EC2** | t4g.2xlarge (ARM64 Graviton) | 100GB GP3 EBS, Private Subnet |
| **VPC** | 10.10.0.0/16, 2 AZs | NAT Gateway, Public + Private Subnets |

### Next.js 14 Application

| Item | Count |
|------|-------|
| **App Router** | 8 |
| **Pages** | 37 |
| **API Routes** | 13 |
| **SSE Streaming** | Real-time AI response streaming |

### Data Layer

| Component | Description |
|-----------|-------------|
| **Steampipe** | Embedded PostgreSQL (port 9193) |
| **AWS Plugin** | 380+ tables (EC2, Lambda, S3, RDS, VPC, IAM, etc.) |
| **K8s Plugin** | 60+ tables (Pods, Nodes, Deployments, etc.) |
| **AWS CLI v2** | CloudWatch per-metric-data, execFileSync |
| **kubectl** | `/kube/config`, EKS Access Entry based auth |
| **Cache** | node-cache 5min TTL, batch query 5 sequential |

### Data Directory

| Path | Purpose |
|------|---------|
| `data/config.json` | App config (AgentCore ARN, Cost enabled, etc.) |
| `data/memory/` | AI conversation history (per-user) |
| `data/inventory/` | Resource inventory snapshots |
| `data/cost/` | Cost data snapshots (fallback) |

### AI Engine — AgentCore

Docker arm64 images are built on EC2, pushed to ECR, and run on AgentCore managed service.

| Component | Description |
|-----------|-------------|
| **Bedrock Model** | Claude Sonnet/Opus 4.6 |
| **Runtime** | Strands Agent Framework (Docker arm64, ECR) |
| **Code Interpreter** | Python sandbox (pandas, matplotlib, etc.) |
| **Memory** | Conversation history storage (365-day retention) |

### AI Routing (10-Level Priority)

Questions are automatically routed to the optimal Gateway based on type:

| Priority | Route | Target |
|----------|-------|--------|
| 1 | `code` | Code Interpreter — Python code execution |
| 2 | `network` | Network Gateway — VPC, TGW, VPN, Firewall |
| 3 | `container` | Container Gateway — EKS, ECS, Istio |
| 4 | `iac` | IaC Gateway — CDK, CloudFormation, Terraform |
| 5 | `data` | Data Gateway — DynamoDB, RDS, ElastiCache, MSK |
| 6 | `security` | Security Gateway — IAM, policy simulation |
| 7 | `monitoring` | Monitoring Gateway — CloudWatch, CloudTrail |
| 8 | `cost` | Cost Gateway — billing, forecast, budget |
| 9 | `aws-data` | Steampipe SQL — listing/status/config analysis |
| 10 | `general` | Ops Gateway — AWS docs, API calls, fallback |

### 8 Gateways × 125 MCP Tools

Each Gateway provides specialized tools through Lambda functions:

| Gateway | Tools | Lambda | Key Capabilities |
|---------|-------|--------|-----------------|
| **Network** | 17 | Lambda × 5 | VPC, TGW, Firewall, Reachability, Flow Logs |
| **Container** | 24 | Lambda × 3 | EKS, ECS, Istio service mesh |
| **IaC** | 12 | Lambda × 2 | CDK, CloudFormation, Terraform |
| **Data** | 24 | Lambda × 4 | DynamoDB, RDS/Aurora, ElastiCache, MSK |
| **Security** | 14 | Lambda × 1 | IAM users/roles/policies, Access Keys |
| **Monitoring** | 16 | Lambda × 2 | CloudWatch Metrics/Logs, CloudTrail |
| **Cost** | 9 | Lambda × 1 | Cost/usage, forecast, budgets |
| **Ops** | 9 | Lambda × 1 | AWS docs, API calls, Steampipe SQL |
| **Total** | **125** | **19** | |

:::tip Multi-Route
Complex questions invoke multiple Gateways in parallel for comprehensive answers. Example: "Diagnose network issues in my EKS cluster" → Container + Network Gateway called simultaneously.
:::

## Supported Data Sources

### AWS (380+ Tables)
Real-time data from the following services via the Steampipe AWS plugin:

| Category | Services |
|----------|----------|
| Compute | EC2, Lambda, ECS, ECR, Auto Scaling |
| Network | VPC, Subnet, Security Group, Transit Gateway, VPN, CloudFront, WAF |
| Storage | S3, EBS, EFS |
| Database | RDS, DynamoDB, ElastiCache, OpenSearch, MSK |
| Security | IAM, KMS, Secrets Manager |
| Monitoring | CloudWatch, CloudTrail |
| Cost | Cost Explorer, Budgets |

### External Datasources (7 Types)
Integrate external observability platforms as datasources for unified analysis:

| Category | Datasources |
|----------|-------------|
| Metrics | Prometheus, Dynatrace, Datadog |
| Logs | Loki, ClickHouse |
| Traces | Tempo, Jaeger |

### Kubernetes (60+ Tables)
Monitor the following resources by connecting to EKS clusters:

- Pods, Nodes, Deployments, Services
- ConfigMaps, Secrets, ServiceAccounts
- Events, Metrics

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Recharts, React Flow |
| Backend | Steampipe (embedded PostgreSQL port 9193), Node.js |
| AI Engine | Amazon Bedrock (Claude Sonnet/Opus 4.6), AgentCore Runtime (Strands) |
| AI Tools | 8 Gateways, 125 MCP tools, 19 Lambda, Code Interpreter, Memory |
| Auth | Amazon Cognito, Lambda@Edge (us-east-1) |
| Infrastructure | AWS CDK, CloudFront, ALB, EC2 (t4g.2xlarge ARM64) |

## Next Steps

- [Login Guide](./getting-started/login) - How to access the dashboard
- [Navigation Guide](./getting-started/navigation) - Understanding the UI layout
- [AI Assistant Quick Start](./getting-started/ai-assistant) - Using AI features
- [Deployment Guide](./getting-started/deployment) - Deploy to a new account
- [Authentication Flow](./getting-started/auth) - Cognito auth details
- [AgentCore Details](./overview/agentcore) - Full Gateway and tool listing
