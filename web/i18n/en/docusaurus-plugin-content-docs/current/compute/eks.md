---
sidebar_position: 5
title: EKS Overview
description: EKS cluster status, node resources, Pod status summary
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Overview

A page for viewing the overall status of EKS clusters, node resources, and Pod status at a glance.

<Screenshot src="/screenshots/compute/eks.png" alt="EKS Overview" />

## Key Features

### Cluster Filter
- Filter by EKS cluster
- Filter by VPC
- Multi-select support

### EKS Cluster Cards
Display key information for each cluster in card format:
- Cluster Name, Status (ACTIVE)
- Kubernetes Version
- VPC ID
- Platform Version
- Region

### Stats Cards
- **Nodes**: Total nodes / Ready nodes
- **Pods**: Total Pods / Running Pods
- **Deployments**: Total Deployments / Fully Available count
- **Services**: Total services

### Node Card Grid
Visually display resource usage for each node:
- Node name, Pod count, status (Ready/NotReady)
- **CPU usage bar**: Pod requests / total capacity (percent)
- **Memory usage bar**: Pod requests / total capacity (percent)
- 80% or higher: red, 50% or higher: orange, otherwise: cyan/purple

### Node Detail View
Click a node card to navigate to the detail page:
- **CPU/Memory/Pod Info cards**: Capacity, Allocatable, Requested, Available
- **ENI list**: IP allocation per network interface, traffic (NetworkIn/Out)
- **Pods table**: List of Pods running on that node

### Visualization Charts
- **Pod Status Distribution**: Running, Pending, Failed, Succeeded distribution
- **Namespaces**: Resource distribution by namespace

### Warning Events Table
Display Kubernetes Warning events in real-time:
- Kind, Object, Reason, Message, Count, Last Seen

## How to Use

1. Click **Compute > K8s** in the sidebar
2. Select specific cluster/VPC using the cluster filter
3. Review overall status from the stats cards
4. Identify nodes with high resource usage from the node cards
5. Click a node to view detailed resources and Pod list
6. Monitor problem events in Warning Events

## Tips

:::tip Node Resource Monitoring
If a node card's CPU/Memory bar is red (80% or higher), there's a risk of resource shortage. Consider adding nodes or rebalancing Pods.
:::

:::tip ENI IP Usage
In the node detail view, if ENI IP Slots Used is close to 15/15, new Pod scheduling may fail.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "EKS cluster status", "CPU usage by node", "Analyze Warning events", etc.
:::

## Related Pages

- [EKS Explorer](../compute/eks-explorer) - K9s-style terminal UI
- [EKS Pods](../compute/eks-pods) - Pod detailed list
- [EKS Nodes](../compute/eks-nodes) - Node detailed list
- [EKS Container Cost](../compute/eks-container-cost) - Pod cost analysis
