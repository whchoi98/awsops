---
sidebar_position: 7
---

import Screenshot from '@site/src/components/Screenshot';

# MSK

Monitor Amazon MSK (Managed Streaming for Apache Kafka) clusters and check broker performance.

<Screenshot src="/screenshots/storage/msk.png" alt="MSK" />

## Key Features

### Statistics Cards
- **Total Clusters**: Total number of clusters (including active clusters)
- **Active**: Number of active clusters
- **Total Brokers**: Total number of broker nodes
- **Enhanced Monitoring**: Number of clusters with enhanced monitoring enabled
- **In-Transit Encrypted**: Number of clusters with in-transit encryption enabled
- **Avg Brokers/Cluster**: Average number of brokers per cluster

### Visualization Charts
- **Cluster State**: Distribution by state (ACTIVE, CREATING, etc.)
- **Kafka Version**: Distribution by Kafka version

### Broker Nodes Metrics Table
Real-time metrics per broker collected from CloudWatch:
- **Cluster**: Cluster name
- **Type**: BROKER or CONTROLLER
- **ID**: Broker ID
- **Instance**: Instance type
- **VPC IP**: Broker VPC IP address
- **ENI**: Connected ENI ID
- **CPU**: CPU utilization (User + System)
- **Memory**: Memory utilization
- **Network In/Out**: Network traffic (KB/s)
- **Endpoint**: Broker endpoint

### Detail Panel
Information available when clicking on a cluster:
- Cluster name, state, type
- Kafka version, broker count
- Enhanced Monitoring setting
- Storage mode
- Broker configuration (instance type, EBS size, AZ distribution)
- Security Group, Subnet information
- Encryption settings (In-Transit, At-Rest, KMS)
- Authentication settings (IAM, SCRAM, TLS)
- Bootstrap Brokers (Plaintext, TLS)
- Broker node details
- Open Monitoring (JMX/Node Exporter)
- Logging settings

## How to Use

### View Cluster List
1. Enter cluster name, Kafka version, etc. in the search box
2. Check status, instance type, broker count in the table
3. Click a row to view detailed information

### Broker Performance Monitoring
In the Broker Nodes table:
1. Check **CPU** utilization (caution above 80%)
2. Monitor **Memory** utilization (warning above 85%)
3. Check **Network In/Out** traffic
4. Verify broker distribution per cluster

### Check Bootstrap Brokers
Check Bootstrap Brokers endpoints in the detail panel:
- **Plaintext**: For unencrypted connections
- **TLS**: For TLS encrypted connections

## Tips

:::tip Broker Count Planning
Plan the appropriate number of brokers considering partition count and replication factor. Generally, 3 or more brokers are recommended, distributed across multiple AZs for high availability.
:::

:::info KRaft Mode
Kafka 3.x and above can use KRaft mode instead of ZooKeeper. If CONTROLLER type nodes are displayed in the Broker Nodes table, it is KRaft mode.
:::

## AI Analysis Tips

Try asking the AI assistant:

- "Which MSK brokers have high CPU utilization?"
- "Check clusters with in-transit encryption disabled"
- "Analyze MSK cluster network traffic trends"
- "Which clusters need Kafka version upgrades?"

:::tip Data Gateway
The AI assistant supports MSK cluster analysis, broker performance tuning, and topic management through the Data Gateway (15 tools).
:::

## Related Pages

- [VPC](../network/vpc) - VPC and Security Groups where MSK is deployed
- [CloudWatch](../monitoring/cloudwatch) - MSK-related alarms
- [Cost Explorer](../monitoring/cost) - MSK cost analysis
