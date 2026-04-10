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
- Kubernetes Version, VPC ID, Platform Version, Region
- **Access Entry badge**: K8s Connected (green) / No Access (red)
- **Register ViewPolicy button**: Auto-register Access Entry + AdminViewPolicy for unregistered clusters
- **Click to filter**: Click a cluster card to filter all data to that cluster (cyan border)

:::tip Cluster Access
Unregistered clusters cannot display data. Use the "Register ViewPolicy" button or ask the cluster owner to follow the [Authentication Guide](./eks-auth).
:::

### Stats Cards (Click to Navigate)
Click each card to navigate to the detail page:
- **Nodes** → Node Details (`/k8s/nodes`)
- **Pods** → Pod Details (`/k8s/pods`)
- **Deployments** → Deployment Details (`/k8s/deployments`)
- **Services** → Service Details (`/k8s/services`)

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

### Visualization Charts (Tab Switching)

**Pod Analysis tab:**
- **Pod Status Distribution**: Running, Pending, Failed, Succeeded distribution (pie chart)
- **Pods per Namespace**: Pod count by namespace (bar chart)

**Service Resources tab:**
- **CPU per Service (millicores)**: Sum of CPU requests for pods belonging to each Service (bar chart)
- **Memory per Service (MiB)**: Sum of memory requests for pods belonging to each Service (bar chart)

### Warning Events Table
Display Kubernetes Warning events in real-time:
- Kind, Object, Reason, Message, Count, Last Seen

## How to Use

1. Click **Compute > EKS** in the sidebar
2. Click a cluster card to filter to a specific cluster
3. Click stats cards to navigate to Pods/Nodes/Deployments/Services detail pages
4. Identify nodes with high resource usage from the node cards
5. Click a node to view detailed resources and Pod list
6. Switch to **Service Resources** tab to analyze CPU/Memory allocation per Service
7. Monitor problem events in Warning Events

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

- [EKS Authentication Setup](./eks-auth) - Access Entry / aws-auth authentication guide
- [EKS Explorer](./eks-explorer) - K9s-style terminal UI
- [EKS Pods](./eks-pods) - Pod detailed list
- [EKS Nodes](./eks-nodes) - Node detailed list
- [EKS Deployments](./eks-deployments) - Deployment list
- [EKS Services](./eks-services) - Service list
- [EKS Container Cost](./eks-container-cost) - Pod cost analysis (OpenCost)
