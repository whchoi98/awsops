---
sidebar_position: 1
title: EC2 Instances
description: EC2 instance list, status monitoring, detailed information
---

import Screenshot from '@site/src/components/Screenshot';

# EC2 Instances

A page for monitoring the real-time status of EC2 instances and viewing detailed information.

<Screenshot src="/screenshots/compute/ec2.png" alt="EC2 Instances" />

## Key Features

### Stats Cards
Four StatsCards at the top of the page display key metrics:
- **Running**: Number of running instances (green)
- **Stopped**: Number of stopped instances (red)
- **Total vCPUs**: Total vCPU count (cyan)
- **Instance Types**: Number of instance types in use (purple)

### Visualization Charts
- **Instance Type Distribution**: Pie chart showing distribution by instance type
- **Instance Status**: Bar chart showing instance count by status

### Instance List Table
Displays all EC2 instances in a table format:
- Instance ID, Name, Type, State, Public/Private IP, VPC, Launch Time
- StatusBadge with different colors based on state (running=green, stopped=red)

### Filters and Search
- **Search box**: Text search across all fields including ID, Name, IP
- **State filter**: Filter by status such as running, stopped
- **Type filter**: Filter by instance type such as t3.micro, m5.large
- **VPC filter**: Filter by VPC ID
- **Clear all**: Reset all filters

### Detail Panel
Click an instance row in the table to open the detail panel on the right:
- **Instance section**: Instance ID, AMI, Architecture, Platform, Key Pair, IAM Role, etc.
- **Compute section**: vCPUs, Cores, Threads/Core, Memory, Network Performance
- **Network section**: VPC, Subnet, AZ, Private/Public IP, DNS, Network Interfaces
- **Security Groups section**: List of attached security groups
- **Storage section**: Root Device, Block Device Mappings
- **Tags section**: List of tags configured on the instance

## How to Use

1. Click **Compute > EC2** in the sidebar
2. Review the overall status from the stats cards at the top
3. Use filters to find specific instances
4. Click an instance in the table to view detailed information
5. Use the refresh button to load the latest data

## Tips

:::tip Quick Search
You can quickly find instances by entering just part of an IP address in the search box.
:::

:::tip Filter Combinations
Use multiple filters simultaneously for more precise instance searches. For example, view only "t3.large instances in running state".
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "Show me EC2 instance list", "How many running instances are there?", etc.
:::

## Related Pages

- [VPC](../network/vpc) - Check network configuration
- [EBS](../storage/ebs) - Check attached volumes
- [Monitoring](../monitoring) - Check CPU/memory metrics
