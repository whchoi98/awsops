---
sidebar_position: 5
title: Resource Inventory
description: Track AWS resource count trends and estimate cost impact.
---

import Screenshot from '@site/src/components/Screenshot';

# Resource Inventory

A page for tracking daily changes in AWS resource counts and estimating cost impact.

<Screenshot src="/screenshots/monitoring/inventory.png" alt="Inventory" />

## Key Features

### Summary Statistics
- **Resource Types**: Number of resource types being tracked
- **Total Count**: Total resource count
- **7d Net Change**: Net change over 7 days

### Resource Trend Graph
- Multi-line chart visualizing resource count trends by type
- Time range toggle: 30 days / 90 days
- Resource type toggles to select which resources to display

### Core Resources (Displayed by Default)
- EC2 Instances
- RDS Instances
- S3 Buckets
- EBS Volumes
- Lambda Functions

### Other Resources
- VPCs, Subnets, NAT Gateways
- ALBs, NLBs, Route Tables
- IAM Users, IAM Roles
- ECS Tasks, ECS Services
- DynamoDB Tables
- EKS Nodes, K8s Pods, K8s Deployments
- ElastiCache Clusters
- CloudFront Distributions
- WAF Web ACLs
- ECR Repositories
- Public S3 Buckets, Open Security Groups, Unencrypted EBS

### Resource Table
| Column | Description |
|--------|-------------|
| Resource | Resource type |
| Current | Current count |
| 7d Ago | Count 7 days ago |
| 30d Ago | Count 30 days ago |
| 7d Change | 7-day change amount and rate |
| 30d Change | 30-day change amount and rate |

### Cost Impact Estimation
Estimates monthly cost impact based on resource count changes:
- RDS Instances: $200/month (estimated)
- ElastiCache Clusters: $150/month
- EKS Nodes: $100/month
- NAT Gateways: $45/month
- EC2 Instances: $80/month
- Weight factors applied for other resources

## How to Use

1. **Check Trends**: Review resource count change patterns in the graph
2. **Change Time Range**: Toggle between 30d/90d for analysis period
3. **Select Resources**: Use toggle buttons to show only resources of interest
4. **Analyze Table**: Review detailed numbers and change rates
5. **Cost Impact**: Check the cost estimation section at the bottom

:::tip Snapshot-Based Data
Resource Inventory automatically saves snapshots when the dashboard loads. History data accumulates without additional API queries, so there is no performance impact.
:::

## Usage Tips

### Tracking Resource Growth
Check resources highlighted in orange (increase) in the 7d Change or 30d Change columns. Unexpected increases may be causing cost spikes.

### Security Resource Monitoring
Pay attention to changes in these resources:
- **Public S3 Buckets**: Increase may indicate data exposure risk
- **Open Security Groups**: Increase may indicate security vulnerabilities
- **Unencrypted EBS**: Compliance issues

### Interpreting Cost Impact
In the Cost Impact Estimation section:
- Positive (+): Expected cost increase
- Negative (-): Expected cost decrease

Actual costs may vary depending on instance types, usage, etc.

:::info Data Retention
Snapshot data is stored in the `data/inventory/` directory. Data older than 90 days is excluded from analysis but files are retained.
:::

## AI Analysis Tips

Example questions for AI Assistant:

- "Analyze which resources increased the most over the last 30 days"
- "If this resource growth trend continues, how much will the monthly cost be?"
- "Summarize security-related resource changes"
- "Recommend items that need resource cleanup"

## Related Pages

- [Cost Explorer](../monitoring/cost) - Actual cost analysis
- [Security Overview](../security) - Security resource details
- [Monitoring Overview](../monitoring) - Performance monitoring
