---
sidebar_position: 1
---

# General FAQ

Common questions and answers about the AWSops dashboard.

<details>
<summary>What is AWSops?</summary>

AWSops is a real-time operations dashboard for AWS and Kubernetes environments. Key features include:

- **Resource Monitoring**: Status of major AWS services including EC2, Lambda, ECS, EKS, RDS, S3
- **Network Visualization**: VPC, subnet, Security Group, Transit Gateway topology
- **Security Analysis**: CIS compliance, CVE vulnerability scanning, IAM analysis
- **Cost Management**: Cost Explorer, container cost analysis
- **AI Assistant**: Natural language queries for AWS resource analysis and troubleshooting

Built on Steampipe, Next.js 14, and Amazon Bedrock AgentCore.

</details>

<details>
<summary>Which AWS services are supported?</summary>

AWSops accesses over 380 AWS tables through the Steampipe AWS plugin. Major supported services:

**Compute**
- EC2 instances, Auto Scaling
- Lambda functions
- ECS clusters/services/tasks
- EKS clusters/nodes/Pods

**Storage & Database**
- S3 buckets
- EBS volumes/snapshots
- RDS instances
- DynamoDB tables
- ElastiCache (Valkey/Redis/Memcached)
- OpenSearch domains
- MSK clusters

**Network**
- VPC, subnets, Security Groups
- Transit Gateway, VPN
- ELB/ALB/NLB
- CloudFront, WAF

**Security & Monitoring**
- IAM users/roles/policies
- CloudTrail, CloudWatch
- CIS compliance

</details>

<details>
<summary>What are the system requirements?</summary>

**Server Requirements**
- EC2: t4g.2xlarge or higher recommended (ARM64)
- Memory: 16GB or more
- Storage: 50GB or more

**Required Software**
- Steampipe + AWS/Kubernetes/Trivy plugins
- Node.js 20+
- Docker (for AgentCore builds)

**Network**
- Private Subnet deployment recommended
- Access via ALB + CloudFront
- Steampipe accessible only locally (127.0.0.1:9193)

**Client**
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Minimum resolution: 1280x720

</details>

<details>
<summary>Where is data stored?</summary>

**Real-time Data (5-minute cache)**
- Steampipe embedded PostgreSQL (port 9193) queries AWS/K8s APIs in real-time
- Results cached in memory for 5 minutes via node-cache
- Cache can be invalidated using the refresh button

**Persistent Data**
- `data/inventory/`: Resource inventory snapshots (JSON)
- `data/cost/`: Cost data snapshots (fallback for MSP environments)
- `data/memory/`: AI conversation history (per-user, 365-day retention)
- `data/config.json`: App settings (AgentCore ARN, etc.)

**No External Storage**
- No separate database installation required (uses Steampipe embedded PostgreSQL)
- All data stored within the EC2 instance

</details>

<details>
<summary>Are there any costs?</summary>

**Free**
- Steampipe and plugins
- Powerpipe (CIS benchmarks)
- Next.js application

**AWS Usage-Based Charges**
- EC2 instance cost (~$0.27/hour for t4g.2xlarge)
- ALB cost
- CloudFront cost

**AI Features (Optional)**
- Amazon Bedrock: Token-based pricing by model usage
- AgentCore Runtime: Execution time-based pricing
- Lambda: Invocation count and execution time-based

**Cost Optimization Tips**
- No Bedrock/AgentCore costs when AI features are disabled
- Spot instances available (non-production environments)
- Stop instances when not in use

</details>

<details>
<summary>Does it support multiple AWS accounts?</summary>

**Single Account Mode (Default)**
- Only queries the account associated with the IAM Role attached to the EC2 instance

**Multi-Account Mode (Configuration Required)**
Multiple accounts are supported through Steampipe's AWS plugin configuration:

```hcl
# ~/.steampipe/config/aws.spc
connection "aws_prod" {
  plugin  = "aws"
  profile = "production"
  regions = ["ap-northeast-2"]
}

connection "aws_dev" {
  plugin  = "aws"
  profile = "development"
  regions = ["ap-northeast-2"]
}

connection "aws" {
  plugin      = "aws"
  type        = "aggregator"
  connections = ["aws_*"]
}
```

Using an aggregator connection allows you to query data from multiple accounts in an integrated view.

**Organizations Integration**
When using AWS Organizations, you can access member accounts through Cross-Account Roles.

</details>
