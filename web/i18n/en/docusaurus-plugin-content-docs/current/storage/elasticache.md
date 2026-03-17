---
sidebar_position: 5
---

import Screenshot from '@site/src/components/Screenshot';

# ElastiCache

Monitor ElastiCache clusters (Valkey, Redis, Memcached) and check performance metrics.

<Screenshot src="/screenshots/storage/elasticache.png" alt="ElastiCache" />

## Key Features

### Statistics Cards
- **Clusters**: Total number of clusters (including Replication Groups)
- **Total Nodes**: Total number of nodes
- **Valkey**: Number of Valkey engine clusters
- **Redis**: Number of Redis engine clusters
- **Memcached**: Number of Memcached engine clusters
- **Repl Groups**: Number of Replication Groups
- **Node Types**: Number of node types in use

### Visualization Charts
- **Engine Distribution**: Distribution by engine (Valkey, Redis, Memcached)
- **Node Type Distribution**: Distribution by node type

### Cache Nodes Metrics Table
Real-time metrics collected from CloudWatch:
- **Cluster ID**: Cluster identifier
- **Engine**: Engine type (color-coded)
- **Node ID**: Node identifier
- **Status**: Node status
- **CPU**: CPU utilization
- **Engine CPU**: Engine CPU utilization
- **Memory**: Available memory
- **Network In/Out**: Network traffic
- **Connections**: Current number of connections
- **AZ**: Availability Zone
- **Endpoint**: Node endpoint

### Detail Panel
Information available when clicking on a cluster:
- Cluster ID, ARN, engine, version
- Node type, status, node count
- Replication Group information
- Network settings (subnet group, AZ)
- Security settings (At-Rest/Transit encryption, Auth Token)
- Configuration settings (snapshot retention, maintenance window)
- Security Groups and inbound rules
- CloudWatch metrics charts

## How to Use

### View Cluster List
1. View cluster list in the Cache Clusters table
2. Enter cluster ID, engine, etc. in the search box
3. Click a row to view detailed information

### Node Performance Monitoring
In the Cache Nodes table:
1. Check CPU/Engine CPU utilization
2. Monitor Memory usage
3. Check Network In/Out traffic
4. Monitor Connections count

### Check Replication Groups
In the Replication Groups table:
- Group ID, status
- Multi-AZ setting
- Auto Failover setting
- Cluster Mode status

## Tips

:::tip Engine Selection Guide
- **Valkey**: Redis-compatible open source, AWS optimized
- **Redis**: Rich data structures, Pub/Sub support
- **Memcached**: Simple key-value caching, multi-threaded support
:::

:::info Encryption Recommended
For security, enable both At-Rest encryption and Transit encryption. Current encryption settings can be checked in the Security section of the detail panel.
:::

## AI Analysis Tips

Try asking the AI assistant:

- "Which ElastiCache clusters have encryption disabled?"
- "Analyze memory utilization for Redis clusters"
- "Check clusters with low Cache Hit Rate"
- "Compare costs by ElastiCache node type"

:::tip Data Gateway
The AI assistant supports ElastiCache performance analysis, cache optimization, and cost analysis through the Data Gateway (15 tools).
:::

## Related Pages

- [VPC](../network/vpc) - VPC and Security Groups where ElastiCache is deployed
- [CloudWatch](../monitoring/cloudwatch) - ElastiCache-related alarms
- [Cost Explorer](../monitoring/cost) - ElastiCache cost analysis
