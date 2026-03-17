---
sidebar_position: 9
title: EKS Deployments
description: Kubernetes Deployment list, replica status, update strategy
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Deployments

A page for viewing the replica status and availability of Kubernetes Deployments.

<Screenshot src="/screenshots/compute/eks-deployments.png" alt="EKS Deployments" />

## Key Features

### Stats Cards
- **Total Deployments**: Total Deployment count (cyan)
- **Fully Available**: Deployment count with all desired replicas available (green)
- **Partially Available**: Deployment count with only some replicas available (orange)

### Replica Comparison Chart
Visually compare Desired vs Available replicas:
- **Semi-transparent cyan bar**: Desired (desired replica count)
- **Green bar**: Available (actual available replica count)
- Each Deployment shows `available/desired` numbers

### Deployment Table
| Column | Description |
|--------|-------------|
| Name | Deployment name |
| Namespace | Namespace |
| Desired | Desired replica count |
| Available | Available replica count |
| Ready | Ready status replica count |
| Created | Creation time |

## Understanding Replica Status

| Status | Description | Action |
|--------|-------------|--------|
| Desired = Available = Ready | Fully normal | - |
| Available < Desired | Some Pods unavailable | Check Pod status |
| Ready < Available | Health check failed | Check application logs |
| Available = 0 | All Pods unavailable | Urgent action required |

## How to Use

1. Click **Compute > K8s > Deployments** in the sidebar
2. Check the Partially Available count from the stats cards
3. Identify problematic Deployments in the Replica Comparison chart
4. Check detailed replica counts in the table

## Deployment Update Strategies

### RollingUpdate (Default)
- Gradually creates new version Pods and terminates old versions
- `maxSurge`: Number of additional Pods that can be created simultaneously
- `maxUnavailable`: Number of Pods that can be unavailable simultaneously

### Recreate
- Terminates all old version Pods before creating new versions
- Causes downtime, used to prevent resource conflicts

## Tips

:::tip Partially Available Diagnosis
If Available is less than Desired:
1. Check Pod status (Pending, Failed)
2. Check for node resource shortage
3. Check for image pull errors
4. Check for Readiness Probe failures
:::

:::tip Rollout Monitoring
During deployment, Available may temporarily be lower than Desired. If the difference persists after deployment completes, there's a problem.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "Deployment status", "Find Deployments with replica mismatch", "Analyze deployment failure cause", etc.
:::

## Related Pages

- [EKS Overview](../compute/eks) - Overall cluster status
- [EKS Pods](../compute/eks-pods) - Check Pods of Deployments
- [EKS Explorer](../compute/eks-explorer) - ReplicaSet details
- [EKS Services](../compute/eks-services) - Services connected to Deployments
