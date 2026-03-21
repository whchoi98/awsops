---
sidebar_position: 2
title: Bedrock
description: Monitor Amazon Bedrock model usage, costs, and token consumption
---

# Bedrock Monitoring

A real-time dashboard for monitoring per-model usage, token costs, and Prompt Caching savings across Amazon Bedrock.

import Screenshot from '@site/src/components/Screenshot';

<Screenshot src="/screenshots/monitoring/bedrock.png" alt="Bedrock Monitoring" />

## Key Features

### Stats Cards (8)

| Card | Description |
|------|-------------|
| Total Cost | Total model cost for the selected time range |
| Invocations | Total number of model invocations |
| Input Tokens | Total input token count |
| Output Tokens | Total output token count |
| Avg Latency | Average response latency (seconds) |
| Errors | Client (4xx) + Server (5xx) error total |
| Cache Savings | Cost saved via Prompt Caching + cache hit rate (%) |
| Models Used | Number of distinct models used in the period |

### Charts (3)

- **Cost by Model** (Pie chart): Cost distribution across models
- **Invocations by Model** (Bar chart): Invocation count comparison per model
- **Token Usage Over Time** (Line chart): Token consumption trend over time

### Account Total vs AWSops Usage

Side-by-side comparison of account-wide usage (CloudWatch) and AWSops app-internal usage:

- **Account Total**: Account-wide Invocations, Input/Output Tokens, and estimated cost from CloudWatch `AWS/Bedrock` namespace
- **AWSops App**: Cumulative AI Assistant calls, token usage, and per-model distribution

### Prompt Caching Summary

At-a-glance view of caching effectiveness for Prompt Caching-enabled models:
- Cache Read/Write token counts
- Cache hit rate (%)
- Cache cost and savings

### Model Detail Panel

Click a model row in the table to open a slide-out panel:
- **Cost Breakdown**: Detailed Input/Output/Cache Read/Cache Write costs
- **Usage**: Invocations, token counts, latency, error counts
- **Pricing**: Per-model pricing per 1M tokens
- **Time Series Charts**: Invocation trend, token usage trend

### Time Range Selection

Use the time range buttons in the top right to change the query period:
- **1h**: Last 1 hour (5-minute intervals)
- **6h**: Last 6 hours (5-minute intervals)
- **24h**: Last 24 hours (1-hour intervals)
- **7d**: Last 7 days (1-day intervals) — default
- **30d**: Last 30 days (1-day intervals)

## AI Page Token Cost Display

On the AI Assistant page (`/ai`), each response shows token usage and cost:
- Input/Output token counts
- Cost calculated based on per-model pricing
- Uses the same pricing table as the Bedrock dashboard

## Data Sources

- **CloudWatch**: `AWS/Bedrock` namespace metrics — `Invocations`, `InputTokenCount`, `OutputTokenCount`, `InvocationLatency`, `InvocationClientErrors`, `InvocationServerErrors`, `CacheReadInputTokenCount`, `CacheWriteInputTokenCount`
- **AWSops Stats**: Cumulative call/token data from `agentcore-stats.ts`

## Usage Tips

:::tip Cost Optimization
If your Prompt Caching hit rate is low, restructure repetitive system prompts and context into cacheable formats to significantly reduce costs.
:::

:::info Cross-Region Inference
Cross-region inference model IDs (e.g., `us.anthropic.claude-*`) are automatically recognized and mapped to the correct pricing.
:::

## Related Pages

- [Monitoring Overview](./monitoring.md) - Infrastructure performance monitoring
- [Cost Explorer](./cost.md) - AWS-wide cost analysis
- [AI Assistant](../overview/ai-assistant.md) - AI Assistant usage guide
