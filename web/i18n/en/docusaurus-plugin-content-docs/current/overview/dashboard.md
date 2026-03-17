---
sidebar_position: 1
title: Dashboard
description: AWSops main dashboard detailed guide
---

import Screenshot from '@site/src/components/Screenshot';

# Dashboard

The Dashboard is the main page of AWSops, providing an at-a-glance view of your entire AWS and Kubernetes infrastructure.

<Screenshot src="/screenshots/overview/dashboard.png" alt="Dashboard" />

## Screen Layout

The dashboard consists of the following sections:

1. **Compute & Containers** - Computing resource summary
2. **Network & Storage** - Network and storage summary
3. **Security, Monitoring & Cost** - Security, monitoring, and cost summary
4. **Active Warnings** - Real-time alerts
5. **Charts** - Resource distribution and status charts

## StatsCards

### Compute & Containers (6 cards)

| Card | Display | Details |
|------|---------|---------|
| **EC2** | Total instance count | running / stopped count |
| **Lambda** | Total function count | Runtime count, long timeout functions |
| **AgentCore** | 8 GW | 125 tools, 19 Lambda, Multi-route |
| **ECR** | Total repository count | Scan enabled, immutable tags count |
| **EKS** | Total node count | Ready nodes, pods, deployments count |
| **CloudFront** | Total distribution count | Enabled, HTTP allowed count |

### Network & Storage (9 cards)

| Card | Display | Details |
|------|---------|---------|
| **VPCs** | VPC count | Subnets, NAT Gateway, TGW count |
| **WAF** | Web ACL count | Rule groups, IP sets count |
| **EBS** | Volume count | Total capacity (GB), unencrypted volumes |
| **S3 Buckets** | Bucket count | public/private breakdown |
| **RDS** | Instance count | Total storage (GB), Multi-AZ count |
| **DynamoDB** | Table count | On-demand status |
| **ElastiCache** | Cluster count | Redis/Memcached breakdown, node count |
| **OpenSearch** | Domain count | VPC domains, encryption status |
| **MSK** | Cluster count | Active cluster count |

### Security, Monitoring & Cost (6 cards)

| Card | Display | Details |
|------|---------|---------|
| **Security Issues** | Total issue count | Public S3, Open SG, Unencrypted EBS |
| **IAM Users** | User count | Roles, groups, no MFA count |
| **CW Alarms** | Alarm count | Metrics, log groups count |
| **CloudTrail** | Trail count | Active, multi-region, validated count |
| **CIS Compliance** | Compliance rate (%) | Alarm, skip, error count |
| **Monthly Cost** | Monthly cost ($) | Daily average, month-over-month change |

## Card Click Navigation

Click each StatsCard to navigate to the detailed page for that service.

| Card | Destination |
|------|-------------|
| EC2 | `/ec2` |
| Lambda | `/lambda` |
| AgentCore | `/agentcore` |
| EKS | `/k8s` |
| S3 Buckets | `/s3` |
| RDS | `/rds` |
| Security Issues | `/security` |
| CIS Compliance | `/compliance` |
| Monthly Cost | `/cost` (when Cost Explorer is available) |

:::tip Environments Without Cost Explorer
In environments where Cost Explorer is not supported (e.g., MSP accounts), clicking the Monthly Cost card navigates to `/inventory` (Resource Inventory) instead.
:::

## Active Warnings

Displays alerts detected in real-time.

| Warning Type | Description | Severity |
|--------------|-------------|----------|
| **Public S3 Buckets** | Publicly accessible S3 buckets | Error (red) |
| **IAM users without MFA** | IAM users without MFA enabled | Warning (orange) |
| **CloudWatch Alarms** | Active CloudWatch alarms | Error (red) |
| **Open Security Groups** | Security groups with 0.0.0.0/0 inbound | Warning (orange) |
| **K8s Warning events** | Kubernetes warning events | Warning (orange) |

Click a warning to navigate to the detailed page for that service.

## Charts

### Resource Distribution (Bar Chart)

Displays resource counts by type as a bar graph.

- EC2, Lambda, S3, RDS, ECS Tasks, DynamoDB, K8s Pods

### EC2 Instance Types (Pie Chart)

Displays EC2 instance type distribution as a pie chart.

- Top 8 types: t3.micro, t3.small, m5.large, etc.

### K8s Pod Status (Pie Chart)

Displays Kubernetes pod status distribution as a pie chart.

- Running, Pending, Failed, Succeeded

### Recent K8s Events

Displays recent Kubernetes Warning events.

- Namespace, Pod name, Reason, Message

## Data Refresh

### Auto Load
Data is automatically fetched when accessing the page.

### Manual Refresh
Click the refresh button in the header to fetch the latest data, bypassing the cache.

### Cache
- Data is cached for 5 minutes
- Data loading begins after Cost availability check

## Cost Availability Auto-Detection

The dashboard automatically checks Cost Explorer API availability on load.

1. Calls `/api/steampipe?action=cost-check` API
2. Includes/excludes cost-related queries based on response
3. Displays "N/A" if Cost Explorer is not supported

## Inventory Snapshot

Resource inventory snapshots are automatically saved when dashboard data is fetched.

- Location: `data/inventory/`
- Purpose: Trend analysis on the Resource Inventory page

:::info AI Analysis
If you need more detailed analysis of information shown on the dashboard, ask the AI Assistant.

Examples:
- "Security Issues shows 3 Open SGs - tell me which security groups they are"
- "There are many stopped EC2 instances - analyze if they can be terminated for cost savings"
:::

## Next Steps

- [AI Assistant Details](../overview/ai-assistant) - Analyze dashboard data with AI
- [AgentCore Details](../overview/agentcore) - Understand AgentCore architecture
