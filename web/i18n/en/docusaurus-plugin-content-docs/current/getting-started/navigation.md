---
sidebar_position: 2
title: Navigation Guide
description: AWSops dashboard layout and navigation methods
---

import Screenshot from '@site/src/components/Screenshot';

# Navigation Guide

The AWSops dashboard provides sidebar-based navigation. With 35 pages organized into 6 groups, you can quickly find the information you need.

<Screenshot src="/screenshots/overview/dashboard.png" alt="AWSops dashboard full screen — sidebar, header, and main content area" />

## Screen Layout

The screen is divided into 3 main areas.

### ① Sidebar (Left)

A fixed navigation area on the left side of the screen.

- **Top**: AWSops logo + Sign Out button
- **Center**: 6 menu groups (Overview, Compute, Network & CDN, Storage & DB, Monitoring, Security)
- **Bottom**: Cost ON/OFF toggle + version info (v1.6.0)
- The current page is indicated with a **cyan highlight** on the left

### ② Header (Top)

The area displayed at the top of each page.

- **Page Name**: Title of the current page
- **Refresh Button**: Click to refresh data (bypasses cache)
- **ONLINE Status**: Server connection status indicator (green dot = normal)

### ③ Main Content (Center)

The area where data for the selected page is displayed.

- **Dashboard**: StatsCards, warning status, charts
- **Service pages**: Resource tables, detail panels, CloudWatch metrics

## Menu Groups

### Overview (3 pages)

| Menu | Description |
|------|-------------|
| **Dashboard** | Overall resource summary, 20 StatsCards, warning status |
| **AI Assistant** | AI-based Q&A, analyze infrastructure with natural language |
| **AgentCore** | AgentCore Runtime/Gateway status, call statistics |

### Compute (8 pages)

| Menu | Description |
|------|-------------|
| **EC2** | EC2 instance list and details |
| **Lambda** | Lambda functions, runtime distribution |
| **ECS** | ECS clusters, services, tasks |
| **ECR** | ECR repositories, images |
| **EKS** | EKS cluster overview, nodes, pod summary |
| **EKS Explorer** | K9s-style terminal UI |
| **ECS Container Cost** | Cost analysis by ECS workload |
| **EKS Container Cost** | Cost analysis by EKS workload |

### Network & CDN (4 pages)

| Menu | Description |
|------|-------------|
| **VPC / Network** | VPC, Subnet, Security Group, TGW, NAT |
| **CloudFront** | CloudFront distribution status |
| **WAF** | WAF Web ACLs, rule groups |
| **Topology** | Infrastructure topology visualization (React Flow) |

### Storage & DB (7 pages)

| Menu | Description |
|------|-------------|
| **EBS** | EBS volumes, snapshots, encryption status |
| **S3** | S3 buckets, TreeMap visualization |
| **RDS** | RDS instances, CloudWatch metrics |
| **DynamoDB** | DynamoDB tables |
| **ElastiCache** | ElastiCache clusters (Redis/Memcached) |
| **OpenSearch** | OpenSearch domains |
| **MSK** | MSK Kafka clusters |

### Monitoring (6 pages)

| Menu | Description |
|------|-------------|
| **Monitoring** | Integrated CPU, Memory, Network, Disk I/O |
| **CloudWatch** | CloudWatch alarm status |
| **CloudTrail** | CloudTrail trails and events |
| **Bedrock** | Bedrock model usage, cost, and token monitoring |
| **Cost** | Cost Explorer, cost analysis |
| **Resource Inventory** | Resource inventory trends |

### Security (3 pages)

| Menu | Description |
|------|-------------|
| **IAM** | IAM users, roles, trust policies |
| **Security** | Security issues (Public S3, Open SG, CVE) |
| **CIS Compliance** | CIS Benchmark (v1.5 - v4.0) |

## Cost Toggle

The **Cost: ON/OFF** button at the bottom of the sidebar enables/disables cost-related features.

- **ON**: Show Cost menu, display cost cards on dashboard
- **OFF**: Hide Cost menu (for MSP environments without Cost Explorer support)

:::tip Cost Explorer Auto-Detection
The dashboard automatically checks Cost Explorer API availability on startup. In unsupported environments, it automatically switches to OFF.
:::

## Page Navigation

### Navigate from Sidebar
Click on the desired menu to navigate to that page. The current page is highlighted with a cyan indicator on the left.

### Navigate from Dashboard Cards
Click each StatsCard on the dashboard to navigate to the detailed page for that service.

Examples:
- **Click EC2 card** → Navigate to EC2 page
- **Click Security Issues card** → Navigate to Security page
- **Click EKS card** → Navigate to EKS page

## Data Refresh

### Auto Refresh
Data is automatically fetched when the page loads. Data is cached for 5 minutes.

### Manual Refresh
Click the refresh button in the header to fetch the latest data, bypassing the cache.

## Next Steps

- [AI Assistant Quick Start](../getting-started/ai-assistant) - Using AI features
- [Dashboard Details](../overview/dashboard) - Learn more about dashboard features
