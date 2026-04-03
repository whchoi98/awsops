---
sidebar_position: 4
title: Deployment Guide
description: AWSops deployment steps and requirements
---

import DeploymentPipeline from '@site/src/components/diagrams/DeploymentPipeline';

# Deployment Guide

Complete guide for deploying AWSops to a new AWS account.

<DeploymentPipeline />

## Prerequisites

| Item | Requirement |
|------|-------------|
| **AWS Account** | Appropriate IAM permissions (Admin or PowerUser) |
| **CDK CLI** | Installed locally (`npm install -g aws-cdk`) |
| **Docker** | arm64 build support (`docker buildx`) |
| **Node.js** | v20 or higher |
| **AWS CLI** | v2, profile configured |

## Quick Install

:::tip install-all.sh
A convenience script that automatically runs Step 1 → 2 → 3 → 10 in sequence. Use after deploying CDK infrastructure (Step 0).

```bash
bash scripts/install-all.sh
```
:::

## Deployment Steps

### Step 0: CDK Infrastructure (Local)

```bash
cd infra-cdk && cdk deploy --all
```

Resources deployed by CDK:
- **VPC**: 10.10.0.0/16, 2 AZs, NAT Gateway, Public + Private Subnets (configurable via CDK context parameter `newVpcCidr`)
- **EC2**: t4g.2xlarge (ARM64 Graviton), 100GB GP3, Private Subnet
- **ALB**: Internet-facing, Custom Header validation
- **CloudFront**: CACHING_DISABLED, ALB Origin
- **Cognito**: User Pool + Lambda@Edge (us-east-1)

### Step 1: Install Steampipe (EC2)

```bash
bash scripts/01-install-base.sh
```

Installs Steampipe + AWS/K8s/Trivy plugins. 380+ AWS tables available via PostgreSQL on port 9193.

### Step 2: Setup Next.js (EC2)

```bash
bash scripts/02-setup-nextjs.sh
```

Installs Next.js 14 app, registers Steampipe service, auto-detects MSP environment.

### Step 3: Production Build (EC2)

```bash
bash scripts/03-build-deploy.sh
```

Runs `npm run build` + `npm start` for production server.

### Step 4: EKS Access Setup (EC2)

```bash
bash scripts/04-setup-eks-access.sh
```

Configures EKS cluster access:
- **kubectl** installation (ARM64 binary)
- Auto-discovery of EKS clusters in the region
- **kubeconfig** setup (`aws eks update-kubeconfig`)
- EKS access entry registration
- Steampipe **Kubernetes** plugin + **Trivy** plugin connection setup

:::info No EKS in your environment?
You can skip this step if there are no EKS clusters in the account. Only Kubernetes-related pages will be disabled.
:::

### Step 5: Cognito Auth (EC2)

```bash
bash scripts/05-setup-cognito.sh
```

Creates Cognito User Pool users and configures app client.

### Step 6a-6f: AgentCore (EC2)

A **wrapper script** can run steps 6a through 6e sequentially:

```bash
bash scripts/06-setup-agentcore.sh
```

| Script | Description |
|--------|-------------|
| `06a-setup-agentcore-runtime.sh` | IAM role, ECR, Docker arm64 build, Runtime Endpoint |
| `06b-setup-agentcore-gateway.sh` | Create 8 Gateways (MCP) |
| `06c-setup-agentcore-tools.sh` | 19 Lambda + register 125 tools across 8 Gateways |
| `06d-setup-agentcore-interpreter.sh` | Create Code Interpreter |
| `06e-setup-agentcore-config.sh` | Auto-configure `route.ts` / `agent.py` (ARNs, Gateway URLs, etc.) |
| `06e-setup-agentcore-memory.sh` | Create Memory Store (365-day retention) — **must be run manually** |
| `06f-setup-opencost.sh` | Prometheus + OpenCost (EKS cost analysis) |

:::warning 06e file naming conflict
Two files share the `06e` prefix: `06e-setup-agentcore-config.sh` and `06e-setup-agentcore-memory.sh`. The wrapper script (`06-setup-agentcore.sh`) only runs the config step, so Memory Store creation must be run separately:

```bash
bash scripts/06e-setup-agentcore-memory.sh
```
:::

### Step 7: CloudFront Auth Integration (EC2)

```bash
bash scripts/07-setup-cloudfront-auth.sh
```

Connects Lambda@Edge to CloudFront viewer-request.

### Step 8: Start All Services (EC2)

```bash
bash scripts/08-start-all.sh
```

Starts the following services in sequence:
- **Steampipe** service (PostgreSQL port 9193)
- **Next.js** production server (port 3000)
- **OpenCost** (EKS cost analysis, if EKS is configured)

### Step 9: Stop All Services (EC2)

```bash
bash scripts/09-stop-all.sh
```

Gracefully stops all running AWSops services. Use for maintenance or updates.

### Step 10: Verify & Health Check (EC2)

```bash
bash scripts/10-verify.sh
```

Performs a 5-stage automated verification:
1. **Service status** — Steampipe, Next.js process checks
2. **Steampipe tables** — Verifies 18 core tables exist
3. **Page access** — HTTP response code validation for 20+ pages
4. **API response** — Key API endpoint functionality checks
5. **Config file** — `data/config.json` validity check

:::tip Required after deployment
Run `10-verify.sh` after Step 3 or any update to confirm all components are healthy. It is also included in `install-all.sh`.
:::

### Step 11: Multi-Account Setup (EC2, Optional)

```bash
bash scripts/11-setup-multi-account.sh
```

Configures multiple AWS accounts to be managed from a single AWSops instance:
- Steampipe **Aggregator** connection setup (`aws` = all accounts merged)
- Cross-account **IAM role** creation and trust relationship configuration
- Updates `accounts[]` array in `data/config.json`

:::info Optional step
Not required for single-account environments. Only run this if you need multi-account support.
:::

## Configuration File

`data/config.json` is auto-generated after deployment. For new account deployments, only update this file.

```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID",
  "codeInterpreterName": "awsops_code_interpreter_XXXXX",
  "memoryId": "awsops_memory_XXXXX",
  "memoryName": "awsops_memory",
  "adminEmails": ["admin@example.com"],
  "accounts": [
    {
      "accountId": "111111111111",
      "alias": "Host",
      "connectionName": "aws_111111111111",
      "region": "ap-northeast-2",
      "isHost": true,
      "features": { "costEnabled": true, "eksEnabled": true, "k8sEnabled": true }
    },
    {
      "accountId": "222222222222",
      "alias": "Staging",
      "connectionName": "aws_222222222222",
      "region": "ap-northeast-2",
      "isHost": false,
      "features": { "costEnabled": false, "eksEnabled": false, "k8sEnabled": false }
    }
  ],
  "customerLogo": "default.png"
}
```

:::tip No Code Changes Required
For per-account deployment, just update `data/config.json`. No source code changes needed.
:::

## Known Issues

:::warning Deployment caveats

**1. `06e` file naming conflict**
`06e-setup-agentcore-config.sh` and `06e-setup-agentcore-memory.sh` share the same prefix. Memory Store creation is not included in the wrapper script, so it must be run manually:
```bash
bash scripts/06e-setup-agentcore-memory.sh
```

**2. systemd service configuration**
The default generated systemd service file may still reference `proxy.js`. The correct start command is `npm run start`. In nvm environments, use the full Node.js path (`/home/ec2-user/.nvm/versions/node/v20.x.x/bin/node`).

**3. Docker arm64 required**
AgentCore Runtime Docker images must be built for arm64:
```bash
docker buildx build --platform linux/arm64 --load -t awsops-agent .
```
:::

## Related Pages

- [Authentication Flow](./auth) - Cognito auth details
- [AgentCore](../overview/agentcore) - AgentCore architecture details
- [Dashboard](../overview/dashboard) - System architecture overview
