---
sidebar_position: 3
title: CloudTrail
description: Query AWS API activity logs and analyze audit events.
---

import Screenshot from '@site/src/components/Screenshot';

# CloudTrail

A page for viewing CloudTrail trails and events that record API activity in your AWS account.

<Screenshot src="/screenshots/monitoring/cloudtrail.png" alt="CloudTrail" />

## Key Features

### Trail Summary
- **Total Trails**: Total number of trails
- **Active**: Number of trails with logging enabled
- **Multi-Region**: Number of multi-region trails
- **Log Validated**: Number of trails with log file validation enabled

### Tab Structure
| Tab | Content |
|-----|---------|
| Trails | Trail list, configuration, S3 bucket |
| Recent Events | Recent API events (all events) |
| Write Events | Write events only (resource change audit) |

:::info Lazy Loading
The Events and Write Events tabs load data only when clicked. This optimization prevents CloudFront timeout (30 seconds).
:::

### Trail Details
Click on a trail row to view in the slide panel:
- **Trail**: Name, ARN, home region, logging status, Multi-Region flag
- **Storage**: S3 bucket, prefix, SNS topic, KMS key
- **CloudWatch**: Log group, IAM role, last delivery time
- **Validation**: Log file validation, last delivery time
- **Tags**: Resource tags

### Event Details
Click on an event row to view:
- **Event**: ID, name, source, time, user, Access Key
- **Resource**: Resource type and name
- **Raw Event**: Full event data in JSON format

## How to Use

1. **Trails Tab**: Check trail configuration and status
2. **Events Tab**: View recent API activity (Read + Write)
3. **Write Events Tab**: Filter for resource change events for audit
4. **View Details**: Click a row to view full information

:::tip Read vs Write Events
- **Read**: Query operations like DescribeInstances, GetObject
- **Write**: Change operations like CreateInstance, DeleteBucket
Focus on the Write Events tab for security audits.
:::

## Usage Tips

### Security Best Practices Check
- **Multi-Region**: Required to log activity across all regions
- **Log Validation**: Detects log file tampering
- **KMS Encryption**: Encrypts log files stored in S3

### Detecting Suspicious Activity
Check the following in the Write Events tab:
- API calls at unusual times
- Unknown usernames or Access Keys
- Large number of delete (Delete*) events
- IAM-related change events

### CloudWatch Logs Integration
If a CloudWatch Log Group is configured in trail details, you can use real-time alerts and metric filters.

:::info Event Retention Period
CloudTrail event history is retained for 90 days by default. Create a trail to store events in S3 for long-term retention.
:::

## AI Analysis Tips

Example questions using the Monitoring Gateway in AI Assistant:

- "Analyze security-related events that occurred today"
- "Show recent activity history for a specific user"
- "Find suspicious patterns among delete events"
- "Check if this trail configuration follows security best practices"

## Related Pages

- [CloudWatch](../monitoring/cloudwatch) - Alarm management
- [IAM](../security/iam) - User and role management
- [Compliance](../security/compliance) - CIS benchmarks
