---
sidebar_position: 4
title: Cost Explorer
description: Analyze AWS costs by service, daily, and monthly to identify trends.
---

import Screenshot from '@site/src/components/Screenshot';

# Cost Explorer

A page for analyzing and visualizing AWS cost data from various perspectives.

<Screenshot src="/screenshots/monitoring/cost.png" alt="Cost" />

## Key Features

### Cost Summary
- **This Month**: Month-to-date accumulated cost
- **Last Month**: Total cost from previous month
- **Projected**: Projected end-of-month cost (estimated based on current date)
- **Daily Avg**: Daily average cost
- **MoM Change**: Month-over-month change rate
- **Services**: Number of services incurring costs

### Time Range Filter
| Option | Description |
|--------|-------------|
| This Month | Current month only |
| 3 Months | Last 3 months |
| 6 Months | Last 6 months |
| 1 Year | Last 1 year |

### Service Filter
Select specific services to analyze. When multiple services are selected, the sum of those services is displayed.

### Visualizations
- **Daily Cost Trend**: Daily cost trend for the last 30 days
- **Monthly Cost Trend**: Monthly cost trend
- **Cost by Service (Top 8)**: Pie chart showing top 8 services by cost share
- **Top 10 Services**: Bar chart showing top 10 services

### Service Details
Click on a service row to view in the slide panel:
- Total cost per service
- Monthly cost trend line chart
- Monthly breakdown details

## How to Use

1. **Select Time Range**: Choose the analysis period (1m, 3m, 6m, 12m)
2. **Service Filter**: Click the Services button to filter specific services
3. **Check Charts**: Review cost trends and service distribution
4. **Detailed Analysis**: Click a service row for monthly breakdown

:::tip MSP Environment Auto-Detection
In Managed Service Provider (MSP) environments, Cost Explorer API access may be restricted. AWSops automatically detects this and displays alternative data.
:::

## Usage Tips

### Identifying Cost Spike Causes
1. If MoM Change is high (>10%), check the Change column in the service table
2. Click services with Change >20% to view monthly trends
3. If there was a spike in a specific month, check resource change history for that period

### Budget Management
Check the Projected value for end-of-month cost estimate. If you're likely to exceed budget:
- Clean up unused resources
- Review Reserved Instances/Savings Plans
- Optimize resource sizing

### Identifying Cost Optimization Targets
Review services with high cost share in the Share column as priority optimization candidates.

:::info Cost Explorer Unavailable Environments
In environments where Cost Explorer is disabled, snapshot data is displayed. A "Showing cached data" banner appears along with the last cache timestamp.
:::

### costEnabled Toggle
Use the **Cost** toggle at the bottom of the sidebar to enable or disable Cost Explorer functionality. Disable it in MSP environments to reduce API calls.

## AI Analysis Tips

Example questions using the Cost Gateway (11 tools) in AI Assistant:

- "Analyze why costs increased this month"
- "Recommend EC2 cost optimization strategies"
- "Calculate savings if we convert to Reserved Instances"
- "Show 3-month cost forecast by service"
- "Analyze costs by tag"

## Related Pages

- [Resource Inventory](../monitoring/inventory) - Resource counts and cost impact
- [ECS Container Cost](../compute/ecs-container-cost) - ECS container costs
- [EKS Container Cost](../compute/eks-container-cost) - EKS container costs
