---
sidebar_position: 3
---

import Screenshot from '@site/src/components/Screenshot';

# RDS

Monitor RDS (Relational Database Service) instances and check performance metrics.

<Screenshot src="/screenshots/storage/rds.png" alt="RDS" />

## Key Features

### Statistics Cards
- **Total Instances**: Total number of RDS instances
- **Storage (GB)**: Total allocated storage capacity
- **Multi-AZ**: Number of instances deployed with Multi-AZ
- **Engines**: Number of database engine types in use

### Visualization Charts
- **Engine Distribution**: Distribution by engine (MySQL, PostgreSQL, Aurora, etc.)
- **Storage by Instance**: Storage usage by instance

### Instance Metrics Table
Real-time metrics collected from CloudWatch displayed in a table:
- **CPU**: CPU utilization (progress bar + value)
- **Free Memory**: Available memory
- **Connections**: Current number of connections
- **Read/Write IOPS**: Read/write IOPS
- **Network In/Out**: Network traffic
- **Free Storage**: Available storage

### Security Group Chaining
View Security Groups and inbound rules connected to RDS in the detail panel:
- Security Group ID, name
- Protocol, port range
- Source IP or referenced Security Group

### Detail Panel
Information available when clicking on an instance:
- Instance identifier, engine, version, class
- Storage settings (type, capacity, encryption)
- Network settings (VPC, subnet, endpoint)
- Backup settings (retention period, backup window)
- Security features (IAM authentication, Performance Insights, etc.)
- CloudWatch metrics charts

## How to Use

### View Instance List
1. Enter instance identifier, engine, etc. in the search box
2. Check status, engine, class in the table
3. Click a row to view detailed information

### Performance Monitoring
In the Instance Metrics table:
1. Check CPU utilization (caution above 80%)
2. Check Free Memory and Free Storage
3. Monitor Connection count
4. Check IOPS and network traffic

### Check Security Groups
In the "Security Groups" section of the detail panel:
1. View the list of connected Security Groups
2. Check inbound rules for each SG
3. Verify no unintended wide-range permissions

## Tips

:::tip Multi-AZ Recommended
Multi-AZ deployment is recommended for production workloads. It ensures high availability with automatic failover. Check current deployment status in the Multi-AZ card.
:::

:::info Storage Auto Scaling
Review storage auto scaling settings when Free Storage gets low. You can monitor available storage for each instance in the metrics table.
:::

## AI Analysis Tips

Try asking the AI assistant:

- "Which RDS instances have high CPU utilization?"
- "Check production databases without Multi-AZ configured"
- "Analyze RDS connection count trends"
- "Analyze Security Groups with access to a specific RDS"

:::tip Data Gateway
The AI assistant supports RDS performance analysis, query optimization suggestions, and backup status checks through the Data Gateway (15 tools). CloudWatch alarm settings can also be analyzed in conjunction with the Monitoring Gateway.
:::

## Related Pages

- [VPC](../network/vpc) - VPC and Security Groups where RDS is deployed
- [CloudWatch](../monitoring/cloudwatch) - RDS-related alarms
- [Cost Explorer](../monitoring/cost) - RDS cost analysis
