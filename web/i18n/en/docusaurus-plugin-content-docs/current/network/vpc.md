---
sidebar_position: 1
title: VPC / Network
description: Monitoring VPC, Subnet, Security Group, Transit Gateway, ELB, NAT Gateway, and Internet Gateway
---

import Screenshot from '@site/src/components/Screenshot';

# VPC / Network

A unified monitoring page to view your AWS network infrastructure at a glance.

<Screenshot src="/screenshots/network/vpc.png" alt="VPC" />

## Key Features

### Tab-Based Resource Organization

Manage network resources systematically across 8 tabs:

| Tab | Resource | Key Information |
|-----|----------|-----------------|
| **VPCs** | Virtual Private Cloud | CIDR, Tenancy, DNS Settings |
| **Subnets** | Subnets | AZ, CIDR, Public/Private |
| **Security Groups** | Security Groups | Inbound/Outbound Rules |
| **Route Tables** | Route Tables | Routes, Subnet Associations |
| **Transit Gateway** | TGW | VPC Attachments, Route Tables |
| **ELB** | Load Balancers | ALB/NLB, Target Groups, Listeners |
| **NAT** | NAT Gateway | EIP, Connection Status |
| **IGW** | Internet Gateway | VPC Attachment |

### Resource Map

Visualize relationships between all resources within a VPC:

- **5-Column Layout**: External (IGW/TGW) → VPCs → Subnets → Compute → NAT
- **Interaction**: Click to highlight related resources
- **Search**: Search EC2, Subnet, VPC by name/ID/CIDR

### Detail Panel

Click a resource row to view detailed information in a slide panel:

- Transit Gateway: Route tables, routes, attached VPCs
- Security Group: Full list of inbound/outbound rules
- ELB: Target groups, listeners, health check settings

## How to Use

### View Resource Lists

1. Select the resource type from the top tabs
2. Review resources in the table
3. Click a row to open the detail panel

### Use the Resource Map

1. Click the **Resource Map** button in the VPCs tab
2. View infrastructure structure in the 5-column view
3. Click resources to highlight relationships
4. Use the search bar to find specific resources

### Analyze Transit Gateway

1. Select the **Transit Gateway** tab
2. Click a TGW row
3. In the detail panel:
   - Route Tables: TGW route table list
   - Routes: Routes for each table (VPC CIDR → Attachment)
   - Attachments: List of attached VPCs/VPNs

## Tips

:::tip Network Troubleshooting
When you ask network-related questions in the AI Assistant, the **Network Gateway** is automatically activated. It leverages 17 specialized tools including:

- **Reachability Analyzer**: Analyze connectivity paths between two endpoints
- **VPC Flow Logs**: Analyze network traffic patterns
- **Transit Gateway Routing**: Diagnose multi-VPC routing issues
- **Security Group Rule Validation**: Analyze inbound/outbound rules

Example question: "EC2 i-xxx cannot connect to RDS" → Reachability Analyzer runs automatically
:::

:::info Security Group Rules Check
Click a row in the Security Groups tab to view all inbound/outbound rules at a glance. Ports open to 0.0.0.0/0 are highlighted in orange as a warning.
:::

## Related Pages

- [Topology](../network/topology) - React Flow-based infrastructure visualization
- [WAF](../network/waf) - Web Application Firewall rule management
- [CloudFront](../network/cloudfront) - CDN distribution management
- [Security](../security) - Open Security Group detection
