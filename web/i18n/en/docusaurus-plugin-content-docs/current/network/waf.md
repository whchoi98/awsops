---
sidebar_position: 3
title: WAF
description: Monitoring AWS WAF Web ACLs, Rule Groups, and IP Sets
---

import Screenshot from '@site/src/components/Screenshot';

# WAF

A page to monitor AWS Web Application Firewall and review rules.

<Screenshot src="/screenshots/network/waf.png" alt="WAF" />

## Key Features

### Summary Statistics

View WAF resource status in the top cards:

| Metric | Description | Color |
|--------|-------------|-------|
| **Web ACLs** | Total number of Web ACLs | cyan |
| **Rule Groups** | Total number of rule groups | purple |
| **IP Sets** | Total number of IP sets | orange |

### Web ACL List

View all Web ACLs in the table:

- **Name**: Web ACL name
- **ID**: Unique identifier
- **Scope**: REGIONAL or CLOUDFRONT
- **Capacity**: WCU (Web ACL Capacity Units) usage
- **Description**: Description
- **Region**: Region (CLOUDFRONT is Global)

### Detail Panel

Click a Web ACL row to view detailed information:

**Web ACL Section**
- Name, ID, ARN
- Scope, Capacity
- Description
- Default Action (Allow/Block)

**Rules Section**
- Rule name and Priority
- Action (Allow, Block, Count)
- Managed Rule Group references

## How to Use

### Check Web ACL Status

1. Navigate to the WAF page
2. Review total resource counts in the top summary cards
3. View Web ACL list in the table
4. Distinguish Regional/CloudFront by Scope

### Analyze Web ACL Rules

1. Click a Web ACL row in the table
2. Check the Rules section in the detail panel
3. For each rule:
   - **Name**: Rule name
   - **Priority**: Evaluation order (lower = first)
   - **Action**: Action when matched

### Understanding Scope

| Scope | Associated Resources | Region |
|-------|---------------------|--------|
| **REGIONAL** | ALB, API Gateway, AppSync | Specific region |
| **CLOUDFRONT** | CloudFront Distribution | us-east-1 (Global) |

## Tips

:::tip Leverage AWS Managed Rules
AWS provides various Managed Rule Groups:
- **AWSManagedRulesCommonRuleSet**: OWASP Top 10 protection
- **AWSManagedRulesSQLiRuleSet**: SQL Injection blocking
- **AWSManagedRulesKnownBadInputsRuleSet**: Known malicious input blocking

Managed Rules are continuously updated by AWS, reducing manual management overhead.
:::

:::info WCU (Web ACL Capacity Units)
Each rule consumes WCU. The default limit for a Web ACL is 1,500 WCU. If your Capacity value is high, reduce the number of rules or request a limit increase through AWS Support.
:::

:::tip Default Action Settings
- **Allow (default)**: Allow if no rules match (explicit block approach)
- **Block (default)**: Block if no rules match (explicit allow approach)

In most cases, the recommended approach is **Allow** as default + adding block rules.
:::

## Related Pages

- [CloudFront](../network/cloudfront) - CDN distributions with WAF attached
- [VPC](../network/vpc) - Check VPC where ALB is located
- [Compliance](../security/compliance) - WAF-related compliance checks
