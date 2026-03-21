---
sidebar_position: 3
title: ECS
description: ECS cluster, service, and task monitoring
---

import Screenshot from '@site/src/components/Screenshot';

# ECS (Elastic Container Service)

A page for monitoring the status of ECS clusters, services, and tasks.

<Screenshot src="/screenshots/compute/ecs.png" alt="ECS" />

## Key Features

### Stats Cards
- **Clusters**: Total number of ECS clusters (cyan)
- **Services**: Total number of services (purple)
- **Tasks**: Number of running tasks (green)
- **Container Instances**: Number of EC2 container instances (orange)

### Visualization Charts
- **Running Tasks per Cluster**: Pie chart showing running tasks per cluster

### Cluster Table
| Column | Description |
|--------|-------------|
| Cluster Name | Cluster name |
| Status | Status (ACTIVE, INACTIVE) |
| Running Tasks | Number of running tasks |
| Pending Tasks | Number of pending tasks |
| Active Services | Number of active services |
| Container Instances | Number of container instances |
| Region | Region |

### Service Table
| Column | Description |
|--------|-------------|
| Service Name | Service name |
| Status | Status (ACTIVE, DRAINING) |
| Desired | Desired task count |
| Running | Running task count |
| Pending | Pending task count |
| Launch Type | Launch type (FARGATE, EC2) |
| Strategy | Scheduling strategy |

### Cluster Detail Panel
Click a cluster to view detailed information:
- **Cluster section**: Name, ARN, Status, Tasks, Services, Container Instances
- **Settings section**: Cluster settings (Container Insights, etc.)
- **Tags section**: Cluster tags

## How to Use

1. Click **Compute > ECS** in the sidebar
2. Review the overall ECS status from the stats cards at the top
3. Check cluster status in the Clusters table
4. Compare Desired vs Running tasks for each service in the Services table
5. Click a cluster to view detailed settings

## Fargate vs EC2 Launch Type

| Aspect | Fargate | EC2 |
|--------|---------|-----|
| Infrastructure Management | Serverless (AWS managed) | Self-managed |
| Cost | vCPU/Memory based | EC2 instance cost |
| Scaling | Automatic | Auto Scaling configuration required |
| Cost Analysis | Container Cost page supported | Phase 2 planned |

## Tips

:::tip Service Status Check
If Running is less than Desired in the Services table, there may be an issue with task deployment. Check the task failure cause.
:::

:::tip Pending Tasks Monitoring
If Pending Tasks persist for a long time, suspect resource shortage or scheduling issues.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "ECS cluster list", "Show Fargate services", "Analyze task deployment failure cause", etc.
:::

## Related Pages

- [ECR](../compute/ecr) - Container image registry
- [ECS Container Cost](../compute/ecs-container-cost) - ECS task cost analysis
- [VPC](../network/vpc) - ECS network configuration
