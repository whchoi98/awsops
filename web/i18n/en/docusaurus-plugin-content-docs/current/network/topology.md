---
sidebar_position: 4
title: Topology
description: React Flow-based AWS infrastructure and Kubernetes cluster visualization
---

import Screenshot from '@site/src/components/Screenshot';

# Topology

A page to visually explore relationships between AWS infrastructure and Kubernetes clusters.

<Screenshot src="/screenshots/network/topology.png" alt="Topology" />

## Key Features

### View Toggle

Switch between two views using the top toggle:

| View | Target | Purpose |
|------|--------|---------|
| **Infrastructure** | AWS Resources | Visualize VPC, EC2, RDS, ELB relationships |
| **Kubernetes** | EKS Workloads | Pod, Service, Ingress, Node relationships |

### Infrastructure View

Two display modes are available:

**Map View (Default)**
- 5-column layout showing resource hierarchy
- External (IGW/TGW) → VPCs → Subnets → Compute → NAT
- Click/search to highlight related resources

**Graph View**
- React Flow-based node-edge graph
- Drag nodes to reposition
- Zoom/pan for navigation
- MiniMap for overall structure overview

### Kubernetes View

Displays EKS workloads in a 4-column resource map:

| Column | Resource | Description |
|--------|----------|-------------|
| **Ingress** | K8s Ingress | External traffic entry point |
| **Services** | K8s Service | Load balancing, ClusterIP/NodePort/LoadBalancer |
| **Pods** | K8s Pod | Running containers |
| **Nodes** | EKS Node | Worker nodes (EC2) |

### Interactive Features

**Search**
- Infrastructure: Search EC2, Subnet, VPC by name/ID/CIDR
- Kubernetes: Search Pod, Service, Namespace
- Automatically highlights matched and related resources

**Click Selection**
- Click a resource to select it
- All connected resources are highlighted
- Click again to deselect

**Graph View Only**
- Mouse wheel: Zoom in/out
- Drag: Pan canvas
- Node drag: Adjust node position
- Controls: Zoom reset, fit to screen
- MiniMap: Overview preview

## How to Use

### Understand Infrastructure Structure

1. Select **Infrastructure** view
2. Review hierarchical structure in **Map View**
3. Follow the VPC → Subnet → EC2 flow
4. Check external connectivity via IGW/TGW

### Track Specific Resources

1. Enter resource name/ID in the search bar
2. View highlighted matching resources
3. Related VPC and Subnets are also highlighted
4. Click "Clear search" button to reset

### Analyze K8s Traffic Flow

1. Select **Kubernetes** view
2. Follow the Ingress → Service → Pod → Node flow
3. Click a Service to see connected Pods
4. Search to track specific workloads

### Use Graph View

1. Select **Graph View** in Infrastructure view
2. React Flow graph renders
3. Drag nodes to adjust layout
4. Use MiniMap to view overall structure

## Tips

:::tip Network Path Tracing
To trace the path from a specific EC2 to the external internet:
1. Enter EC2 name in the search bar
2. Check the highlighted Subnet
3. Verify if Subnet is connected to NAT Gateway or IGW
4. Private Subnet uses NAT, Public Subnet uses IGW path
:::

:::tip K8s Service Debugging
Troubleshooting "No Pods connected to Service":
1. Click the Service in Kubernetes view
2. Check connected Pods (0 pods indicates a problem)
3. Verify Pod labels match Service selector
4. If Pods exist, trace to Node to check resource status
:::

:::info Color Legend
| Color | Infrastructure | Kubernetes |
|-------|---------------|------------|
| Cyan | VPC, IGW | Ingress |
| Green | Subnet | Node |
| Purple | EC2 | Pod |
| Pink | ELB | - |
| Orange | RDS, NAT | Service |
| Red | TGW | - |
:::

## Related Pages

- [VPC](../network/vpc) - VPC details and resource map
- [EKS Overview](../compute/eks) - EKS cluster details
- [EC2](../compute/ec2) - EC2 instance details
