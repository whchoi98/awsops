---
sidebar_position: 2
title: Lambda Functions
description: Lambda function list, runtime distribution, memory/timeout settings
---

import Screenshot from '@site/src/components/Screenshot';

# Lambda Functions

A page for viewing the list and configuration information of AWS Lambda functions.

<Screenshot src="/screenshots/compute/lambda.png" alt="Lambda Functions" />

## Key Features

### Stats Cards
- **Total Functions**: Total number of Lambda functions (cyan)
- **Runtimes**: Number of runtime types in use (purple)
- **Avg Memory (MB)**: Average memory allocation (green)
- **Long Timeout (>5m)**: Number of functions with timeout exceeding 5 minutes (orange)

### Visualization Charts
- **Runtime Distribution**: Pie chart showing function distribution by runtime (Python, Node.js, Java, etc.)
- **Memory Allocation**: Bar chart showing function distribution by memory setting

### Function List Table
| Column | Description |
|--------|-------------|
| Function Name | Function name |
| Runtime | Runtime (includes deprecated indicator) |
| Memory (MB) | Allocated memory |
| Timeout (s) | Timeout setting |
| Code Size | Code size |
| Last Modified | Last modification date |
| Region | Region |

### Deprecated Runtime Indicator
The following runtimes are displayed with an orange "deprecated" label:
- Python 2.7, 3.6, 3.7
- Node.js 10.x, 12.x, 14.x
- .NET Core 2.1, 3.1
- Ruby 2.5, 2.7
- Java 8, Go 1.x

### Detail Panel
Click a function to view detailed information:
- **Function section**: Name, ARN, Runtime, Handler, Architectures, Package Type, Code Size
- **Deployment section**: Version, State, Last Update, Layers information
- **Configuration section**: Memory, Timeout settings
- **Network section**: VPC connection info (VPC ID, Subnets, Security Groups)

## How to Use

1. Click **Compute > Lambda** in the sidebar
2. Review runtime distribution in the Runtime Distribution chart
3. Identify memory configuration patterns in the Memory Allocation chart
4. Identify deprecated runtime functions and plan upgrades
5. Click a function to view detailed configuration

## Tips

:::tip Deprecated Runtime Management
Functions with an orange "deprecated" label in the Runtime column have AWS support that has ended or is ending soon. We recommend upgrading promptly.
:::

:::tip Long Timeout Function Review
Functions with timeouts of 5 minutes or more should be reviewed from cost optimization and error handling perspectives.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "Lambda function list", "Functions using Python runtime", "Find deprecated runtime functions", etc.
:::

## Related Pages

- [CloudWatch](../monitoring/cloudwatch) - Lambda execution logs and alarms
- [IAM](../security/iam) - Check Lambda execution roles
- [VPC](../network/vpc) - VPC-connected Lambda network configuration
