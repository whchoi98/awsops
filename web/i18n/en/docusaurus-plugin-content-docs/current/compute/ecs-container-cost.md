---
sidebar_position: 11
title: ECS Container Cost
description: ECS Fargate task cost analysis, CloudWatch Container Insights metrics
---

import Screenshot from '@site/src/components/Screenshot';

# ECS Container Cost

A page for analyzing the cost of ECS Fargate tasks. Costs are calculated based on Fargate pricing and CloudWatch Container Insights metrics.

<Screenshot src="/screenshots/compute/ecs-container-cost.png" alt="ECS Container Cost" />

## Key Features

### Stats Cards
- **Daily Cost (ECS)**: Total daily cost (cyan)
- **Monthly Estimate**: Estimated monthly cost (green)
- **Running Tasks**: Number of running tasks - Fargate/EC2 breakdown (purple)
- **Top Cost Service**: Highest cost service (orange)

### Service Cost Distribution Chart
Pie chart showing daily cost distribution by service

### Cost by Service (CPU vs Memory) Chart
Stacked bar chart comparing CPU cost vs Memory cost per service

### ECS Tasks Table
| Column | Description |
|--------|-------------|
| Cluster | Cluster name |
| Service | Service name |
| Task ID | Task ID (first 12 characters) |
| Type | Launch type (FARGATE/EC2) |
| CPU (units) | CPU units and vCPU equivalent |
| Memory (MB) | Memory and GB equivalent |
| Daily Cost | Daily cost (Fargate only) |
| AZ | Availability Zone |

## Cost Calculation Method

### Fargate Pricing (ap-northeast-2)
| Resource | Rate | Billing Unit |
|----------|------|--------------|
| vCPU | $0.04048 | per vCPU-hour |
| Memory | $0.004445 | per GB-hour |
| Ephemeral Storage (>20GB) | $0.000111 | per GB-hour |

### Calculation Formula
```
CPU Cost = (CPU Units / 1024) x $0.04048/hr x 24hr
Memory Cost = (Memory MB / 1024) x $0.004445/hr x 24hr
Daily Cost = CPU Cost + Memory Cost
Monthly Estimate = Daily Cost x 30
```

### Calculation Example
Fargate Task: 512 CPU units (0.5 vCPU) + 1024 MB (1 GB)
- CPU: 0.5 vCPU x $0.04048/hr x 24hr = **$0.486/day**
- Memory: 1 GB x $0.004445/hr x 24hr = **$0.107/day**
- Total: **$0.593/day ($17.78/month)**

## How to Use

1. Click **Compute > Container Cost** in the sidebar
2. Review overall cost status from the stats cards
3. Identify high-cost services from the charts
4. Check detailed cost per task in the table
5. Expand the "Cost Calculation Basis" section to verify calculation basis

## Support Scope

| Item | Support |
|------|---------|
| Fargate Launch Type | O (cost calculation supported) |
| EC2 Launch Type | X (requires node cost distribution, not supported) |
| Spot Fargate | - (based on On-Demand pricing) |

## Tips

:::tip EC2 Launch Type
EC2 type tasks are displayed as "N/A (EC2)". EC2 costs require node cost distribution and are currently not supported.
:::

:::tip Cost Optimization
If one side is significantly higher in the CPU vs Memory chart, consider adjusting the task definition. Fargate has limited CPU and Memory combinations.
:::

:::tip Changing Price Settings
You can change region-specific pricing in the `fargatePricing` field of `data/config.json`.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "ECS cost analysis", "Highest cost service", "Fargate cost optimization recommendations", etc.
:::

## Related Pages

- [ECS](../compute/ecs) - ECS cluster and service status
- [EKS Container Cost](../compute/eks-container-cost) - EKS Pod cost analysis
- [Cost](../monitoring/cost) - Overall AWS cost analysis
