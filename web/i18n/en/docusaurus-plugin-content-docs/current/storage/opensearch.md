---
sidebar_position: 6
---

import Screenshot from '@site/src/components/Screenshot';

# OpenSearch

Monitor Amazon OpenSearch Service domains and check cluster health.

<Screenshot src="/screenshots/storage/opensearch.png" alt="OpenSearch" />

## Key Features

### Statistics Cards
- **Total Domains**: Total number of domains (including active domains)
- **Processing**: Number of domains with configuration updates in progress
- **Node-to-Node Enc**: Number of domains with node-to-node encryption enabled
- **At-Rest Enc**: Number of domains with at-rest encryption enabled
- **VPC Domains**: Number of domains deployed within a VPC
- **Public Domains**: Number of domains with public access enabled

### Visualization Charts
- **Engine Version**: Distribution by OpenSearch/Elasticsearch version
- **Encryption Status**: Distribution of encryption settings

### Domain Metrics Table
Real-time metrics collected from CloudWatch:
- **Domain**: Domain name
- **Engine**: Engine version
- **Cluster Status**: GREEN/YELLOW/RED status
- **CPU**: CPU utilization
- **JVM Memory**: JVM memory pressure
- **Nodes**: Number of nodes
- **Documents**: Number of searchable documents
- **Free Storage**: Available storage
- **Search Rate/Latency**: Search request count and latency
- **Index Rate/Latency**: Indexing request count and latency

### Detail Panel
Information available when clicking on a domain:
- Domain name, ID, engine version
- Status, IP type, endpoint
- Cluster configuration (instance type, node count, Master settings)
- EBS storage settings
- Encryption settings (Node-to-Node, At-Rest, KMS key)
- Advanced Security settings
- VPC/network configuration
- Service software version
- Log publishing settings

## How to Use

### View Domain List
1. Enter domain name, engine version in the search box
2. Check status, instance type, node count in the table
3. Click a row to view detailed information

### Cluster Health Monitoring
In the Domain Metrics table:
1. Check **Cluster Status** (GREEN is healthy)
2. Monitor CPU and JVM Memory pressure
3. Check Search/Index Latency
4. Monitor Free Storage

### Check Security Settings
1. Check overall encryption status in the encryption cards
2. Verify VPC/Public domain distinction
3. Check Fine-Grained Access Control in the detail panel

## Tips

:::tip Cluster Status Management
- **GREEN**: All shards are properly allocated
- **YELLOW**: Some replica shards are unallocated (functionality normal)
- **RED**: Some primary shards are unallocated (potential data loss)

RED status requires immediate action.
:::

:::info VPC Deployment Recommended
For security, it is recommended to deploy OpenSearch domains within a VPC. If the Public Domains card is displayed in red, consider VPC migration.
:::

## AI Analysis Tips

Try asking the AI assistant:

- "Which OpenSearch domains have YELLOW/RED cluster status?"
- "Check domains with node-to-node encryption disabled"
- "Analyze OpenSearch domains with high search latency"
- "Tell me how to optimize OpenSearch index performance"

:::tip Data Gateway
The AI assistant supports OpenSearch cluster analysis, index optimization, and search performance tuning through the Data Gateway (15 tools).
:::

## Related Pages

- [VPC](../network/vpc) - VPC and Security Groups where OpenSearch is deployed
- [CloudWatch](../monitoring/cloudwatch) - OpenSearch-related alarms
- [Cost Explorer](../monitoring/cost) - OpenSearch cost analysis
