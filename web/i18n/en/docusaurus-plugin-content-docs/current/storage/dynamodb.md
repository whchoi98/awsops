---
sidebar_position: 4
---

import Screenshot from '@site/src/components/Screenshot';

# DynamoDB

Manage DynamoDB tables and monitor capacity and settings.

<Screenshot src="/screenshots/storage/dynamodb.png" alt="DynamoDB" />

## Key Features

### Statistics Cards
- **Tables**: Total number of tables
- **Active**: Number of active tables
- **Total Items**: Total number of items across all tables
- **Total Size**: Total data size across all tables

### Visualization Charts
- **Table Status**: Distribution by status (ACTIVE, CREATING, etc.)
- **Items per Table**: Distribution of items per table

### Table List
- Table name
- Status (ACTIVE, CREATING, etc.)
- Item count
- Data size
- Billing mode (On-Demand/Provisioned)
- Region

### Detail Panel
Information available when clicking on a table:
- Table name, ARN, status
- Item count, data size
- Billing mode
- Creation date, region
- Key schema (Partition Key, Sort Key)
- Read/write capacity
- Point-in-Time Recovery setting
- Encryption setting (SSE)
- Tags

## How to Use

### View Table List
1. View all tables in the table list
2. Identify table status with status badges
3. Click a row to view detailed information

### Check Capacity Mode
Check capacity mode in the billing column:
- **On-Demand**: Usage-based billing (PAY_PER_REQUEST)
- **Provisioned**: Pre-configured capacity-based billing

### Check Key Schema
In the "Keys" section of the detail panel:
- Check HASH (Partition Key)
- Check RANGE (Sort Key) if present

## Tips

:::tip On-Demand vs Provisioned
On-Demand mode is suitable for unpredictable or highly variable traffic patterns. For stable traffic patterns, Provisioned mode can reduce costs.
:::

:::info Point-in-Time Recovery
Enable PITR (Point-in-Time Recovery) for tables storing important data. Current settings can be checked in the Settings section of the detail panel.
:::

## AI Analysis Tips

Try asking the AI assistant:

- "Which DynamoDB tables have PITR disabled?"
- "Analyze costs for On-Demand mode tables"
- "Show DynamoDB table capacity usage trends"
- "Check global table configuration status"

:::tip Data Gateway
The AI assistant supports DynamoDB table analysis, capacity planning, and index optimization through the Data Gateway (15 tools).
:::

## Related Pages

- [Cost Explorer](../monitoring/cost) - DynamoDB cost analysis
- [IAM](../security/iam) - DynamoDB access permissions
- [CloudWatch](../monitoring/cloudwatch) - DynamoDB-related alarms
