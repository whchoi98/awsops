---
sidebar_position: 10
title: EKS Services
description: Kubernetes Service list, types, endpoint information
---

import Screenshot from '@site/src/components/Screenshot';

# EKS Services

A page for viewing the list and network configuration of Kubernetes Services.

<Screenshot src="/screenshots/compute/eks-services.png" alt="EKS Services" />

## Key Features

### Stats Cards
- **Total Services**: Total Service count (cyan)
- **ClusterIP**: ClusterIP type service count (green)
- **NodePort**: NodePort type service count (purple)
- **LoadBalancer**: LoadBalancer type service count (orange)

### Service Type Distribution Chart
Visualize service type distribution with a pie chart:
- ClusterIP, NodePort, LoadBalancer, Other (ExternalName, etc.)

### Service Table
| Column | Description |
|--------|-------------|
| Name | Service name |
| Namespace | Namespace |
| Type | Service type |
| Cluster IP | Cluster internal IP |
| External IP | External IP (LoadBalancer type) |
| Created | Creation time |

## Understanding Service Types

### ClusterIP (Default)
- Accessible only within the cluster
- Used for internal service-to-service communication
- Examples: Backend API, Database

### NodePort
- Externally accessible via a specific port on all nodes
- Port range: 30000-32767
- Primarily used in development/test environments

### LoadBalancer
- Automatically creates cloud load balancer (AWS ELB/NLB)
- Routes external traffic to the service
- Used for production external services

### ExternalName
- Maps external DNS names to internal cluster names
- Creates CNAME records

## How to Use

1. Click **Compute > K8s > Services** in the sidebar
2. Review service type distribution from the stats cards
3. Check External IP for LoadBalancer services
4. Check Cluster IP for each service in the table

## AWS Integration

### LoadBalancer Type + AWS
- AWS ELB/NLB automatically provisioned on Service creation
- Control settings via Annotations:
  - `service.beta.kubernetes.io/aws-load-balancer-type: nlb`
  - `service.beta.kubernetes.io/aws-load-balancer-internal: "true"`

### Cost Considerations
- LoadBalancer type incurs AWS ELB cost for each service
- Use single ALB for multiple services: AWS Load Balancer Controller + Ingress

## Tips

:::tip LoadBalancer External IP Check
If External IP is `<pending>`:
- AWS Load Balancer is being provisioned
- Check for missing subnet tags
- Check IAM permissions
:::

:::tip ClusterIP Service Access
ClusterIP services cannot be directly accessed from outside the cluster. Use LoadBalancer or Ingress for external access.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "Service list", "LoadBalancer service status", "Find LoadBalancers without External IP", etc.
:::

## Related Pages

- [EKS Overview](../compute/eks) - Overall cluster status
- [EKS Deployments](../compute/eks-deployments) - Deployments connected to Services
- [VPC](../network/vpc) - Network configuration and load balancers
- [EKS Explorer](../compute/eks-explorer) - Ingress details
