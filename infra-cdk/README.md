# AWSops Infrastructure CDK

CDK project that recreates the AWSops Dashboard CloudFormation infrastructure.

## Stacks

| Stack | Description |
|-------|-------------|
| `AwsopsStack` | VPC, ALB, EC2, CloudFront, SSM endpoints |
| `AwsopsCognitoStack` | Cognito User Pool, Lambda@Edge auth (us-east-1) |
| `AwsopsAgentCoreStack` | AgentCore placeholder (deploy via script) |

## Prerequisites

- Node.js 20+
- AWS CDK CLI: `npm install -g aws-cdk`
- AWS credentials configured
- CloudFront prefix list ID for your region

## Quick Start

```bash
cd infra-cdk
npm install

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT_ID/ap-northeast-2
cdk bootstrap aws://ACCOUNT_ID/us-east-1  # for Lambda@Edge

# Review changes
cdk diff

# Deploy all stacks
cdk deploy --all \
  --parameters AwsopsStack:VSCodePassword=YOUR_PASSWORD \
  --parameters AwsopsStack:CloudFrontPrefixListId=pl-22a6434b \
  --parameters AwsopsStack:InstanceType=t4g.2xlarge
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `InstanceType` | `t4g.2xlarge` | EC2 instance type (ARM64 Graviton) |
| `VSCodePassword` | (required) | code-server password (min 8 chars) |
| `CloudFrontPrefixListId` | (required) | CloudFront prefix list for ALB SG |

## Architecture

```
Internet -> CloudFront (HTTPS)
              |-- /awsops*       -> ALB:3000 -> EC2:3000 (Dashboard)
              |-- /awsops/_next  -> ALB:3000 (static, cached)
              |-- /*             -> ALB:80   -> EC2:8888 (VSCode)

VPC 10.254.0.0/16
  Public Subnets:  ALB, NAT Gateway
  Private Subnets: EC2, SSM VPC Endpoints
```

## Post-Deploy Steps

After CDK deploy, continue with the setup scripts:
1. SSM into EC2: `aws ssm start-session --target INSTANCE_ID`
2. Run `01-install-base.sh` (Steampipe + Powerpipe)
3. Run `02-setup-nextjs.sh` (Next.js app)
4. Run `03-build-deploy.sh` (build and start)
5. Run `05-setup-cognito.sh` (update Cognito callback URLs)
6. Run `06-setup-agentcore.sh` (AI agent)

## Cleanup

```bash
cdk destroy --all
```
