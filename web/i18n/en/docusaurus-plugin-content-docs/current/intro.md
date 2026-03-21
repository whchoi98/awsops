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
- View AWS and Kubernetes resource status at a glance across **34 pages**
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

![System Architecture](/diagrams/system-architecture.png)

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

### Kubernetes (60+ Tables)
Monitor the following resources by connecting to EKS clusters:

- Pods, Nodes, Deployments, Services
- ConfigMaps, Secrets, ServiceAccounts
- Events, Metrics

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Recharts, React Flow |
| Backend | Steampipe (embedded PostgreSQL), Node.js |
| AI Engine | Amazon Bedrock (Claude Sonnet/Opus 4.6), AgentCore Runtime |
| Auth | Amazon Cognito, Lambda@Edge |
| Infrastructure | AWS CDK, CloudFront, ALB, EC2 |

## Next Steps

- [Login Guide](./getting-started/login) - How to access the dashboard
- [Navigation Guide](./getting-started/navigation) - Understanding the UI layout
- [AI Assistant Quick Start](./getting-started/ai-assistant) - Using AI features
