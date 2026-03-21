---
sidebar_position: 3
---

import Screenshot from '@site/src/components/Screenshot';

# CIS Compliance

The CIS Compliance page evaluates security compliance status based on the AWS CIS (Center for Internet Security) benchmarks. It uses Powerpipe to automatically check hundreds of controls.

<Screenshot src="/screenshots/security/compliance.png" alt="Compliance" />

## Supported Benchmarks

The following CIS AWS Foundations Benchmark versions are supported:

| Version | Controls | Notes |
|---------|----------|-------|
| CIS v4.0.0 | Latest | 2024 release |
| CIS v3.0.0 | Default | Recommended version |
| CIS v2.0.0 | Legacy | |
| CIS v1.5.0 | Legacy | |

:::tip Version Selection
Unless you have specific requirements, we recommend using CIS v3.0.0. It incorporates the latest security recommendations while remaining stable.
:::

## Running the Benchmark

1. Select a benchmark version from the dropdown
2. Click the **Run Benchmark** button
3. Progress status is displayed during execution (approximately 2-5 minutes)

:::info Execution Time
The benchmark performs hundreds of AWS API calls. It may take 2-5 minutes depending on the number of AWS resources.
:::

## Results Summary

### Statistics Cards

| Metric | Description |
|--------|-------------|
| Pass Rate | Pass rate (OK / Total) |
| Total Controls | Total number of controls checked |
| OK | Passed controls |
| Alarm | Failed controls (action required) |
| Skipped | Skipped controls |
| Errors | Execution errors |

### Pass Rate Thresholds

| Pass Rate | Status | Meaning |
|-----------|--------|---------|
| 80% or above | Green | Good |
| 50-79% | Orange | Improvement needed |
| Below 50% | Red | Serious action required |

## Visualization Charts

### Compliance Status (Pie Chart)
Displays the distribution of control statuses:

- **OK** (Green): Passed
- **Alarm** (Red): Failed - action required
- **Skip** (Gray): Skipped - not applicable
- **Error** (Orange): Execution error
- **Info** (Cyan): Informational

### Alarms by Section (Bar Chart)
Compares the number of failures (Alarm) by section. Focus on sections with the most failures first.

## Section Details

CIS benchmarks are organized into the following major sections:

| Section | Key Checks |
|---------|------------|
| 1. Identity and Access Management | Root account, MFA, password policy, IAM users |
| 2. Storage | S3 bucket encryption, public access blocking |
| 3. Logging | CloudTrail, Config, VPC Flow Logs |
| 4. Monitoring | CloudWatch alarms, metric filters |
| 5. Networking | Security Groups, NACLs, VPC configuration |

### Section Cards

Information available on each section card:

- Section title
- OK / ALARM / SKIP counts
- Pass rate percentage
- Progress bar (visual status indicator)

Click a section card to expand the list of controls in that section.

## Control Details

### Control List

Clicking a section displays the list of child controls:

| Icon | Status |
|------|--------|
| Green check | OK - Passed |
| Red X | ALARM - Failed |
| Orange warning | ERROR - Error |
| Gray minus | SKIP - Skipped |
| Cyan info | INFO - Information |

### Control Details Panel

Click a control to view detailed information in a slide panel:

- **Control ID**: CIS control number (e.g., 1.1, 2.1.1)
- **Title**: Control title
- **Status**: Check result status
- **Reason**: Pass/fail reason
- **Resource**: Target resource ARN
- **Description**: Control description and recommendations

:::tip Addressing Failures
For controls in ALARM status, check the Reason and Resource to take action. Most controls can be easily fixed via the AWS Console or CLI.
:::

## Saving Results

Benchmark results are cached on the server. The last execution results persist even after page refresh.

Click the **Run Benchmark** button again when you need new results.
