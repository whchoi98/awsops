---
sidebar_position: 4
title: Architecture Deep Dive
description: In-depth technical FAQ about AWSops internals
---

# Architecture Deep Dive

Advanced technical FAQ about AWSops internal architecture and design decisions.

<details>
<summary>How are network costs (networkCost) calculated?</summary>

Network cost calculation differs between **ECS** and **EKS**.

```mermaid
flowchart LR
  subgraph ECS["ECS Container Cost"]
    CW["CloudWatch<br/>Container Insights"] --> FARE[Fargate Pricing]
    FARE --> ECOST["CPU + Memory<br/>(no network)"]
  end
  subgraph EKS["EKS Container Cost"]
    OC[OpenCost API] -->|"5 components"| FULL["CPU + RAM +<br/>Network + PV + GPU"]
    FB["Steampipe<br/>kubernetes_pod"] -->|fallback| EST["CPU + Memory<br/>(no network)"]
  end
```

### ECS Containers: Network Cost Not Included

ECS container cost (`/api/container-cost`) only calculates **CPU + Memory**:

```
CPU Cost = (CPU Units / 1024) x $0.04048/hr x hours
Memory Cost = (Memory MB / 1024) x $0.004445/hr x hours
Total Cost = CPU Cost + Memory Cost
```

CloudWatch Container Insights collects `CpuUtilized` and `MemoryUtilized` metrics with Fargate pricing applied. Network transfer metrics (`NetworkRxBytes`/`NetworkTxBytes`) are collected but not reflected in cost calculation.

### EKS Containers: Network Cost Only in OpenCost Mode

**OpenCost Mode** (when `opencostEndpoint` is set in `data/config.json`):

```typescript
// src/app/api/eks-container-cost/route.ts
const res = await fetch(
  `${opencostEndpoint}/allocation/compute?window=${window}&aggregate=namespace,pod`
);

// 5 cost components from OpenCost
const cpuCost = (alloc.cpuCost || 0) * scale;
const memCost = (alloc.ramCost || 0) * scale;
const networkCost = (alloc.networkCost || 0) * scale;   // Network cost
const pvCost = (alloc.pvCost || 0) * scale;              // PV (EBS) cost
const gpuCost = (alloc.gpuCost || 0) * scale;            // GPU cost
```

**How OpenCost calculates network cost internally**:

1. **CNI-based traffic tracking**: OpenCost tracks per-pod network traffic via Kubernetes CNI (Container Network Interface)
2. **Only Cross-AZ transfers are charged**: Same-AZ transfers are free; Cross-AZ transfers incur AWS data transfer charges
3. **Daily cost scaling**: OpenCost returns cost for the query window (e.g., 1 hour), scaled to 24 hours:

```typescript
const minutes = alloc.minutes || 60;
const scale = (24 * 60) / minutes;  // Scale 1-hour data to 24 hours
const networkCostDaily = (alloc.networkCost || 0) * scale;
```

**Request-based fallback mode** (when OpenCost is not installed):

Network cost is not calculated. Cost is estimated based on CPU/Memory request ratios only.

### UI Display

The network cost column only appears in OpenCost mode:

```typescript
// src/app/eks-container-cost/page.tsx
...(data?.dataSource === 'opencost' ? [
  { key: 'networkCostDaily', label: 'Network' },
  { key: 'pvCostDaily', label: 'Storage' },
  { key: 'gpuCostDaily', label: 'GPU' },
] : []),
```

</details>

<details>
<summary>How does OpenCost calculate pod-level costs?</summary>

EKS pod cost calculation has two modes.

### Mode 1: OpenCost API (Recommended)

OpenCost calculates costs based on **actual usage** using Prometheus metrics.

**Data flow**:

```mermaid
flowchart TD
  P[Prometheus] -->|metrics collection| OC[OpenCost Engine]
  OC -->|"/allocation/compute"| API[AWSops API]
  API -->|"5 costs × scale"| UI[Dashboard UI]

  SP[Steampipe] -->|"kubernetes_pod<br/>kubernetes_node"| FB[Request-based<br/>Fallback]
  FB -->|"CPU+Memory only"| UI

  API -.->|"OpenCost unavailable"| FB
```

**API call**:
```typescript
// src/app/api/eks-container-cost/route.ts
const res = await fetch(
  `${opencostEndpoint}/allocation/compute?window=1d&aggregate=namespace,pod`
);
```

**5 cost components**:

| Component | Description | Basis |
|-----------|-------------|-------|
| `cpuCost` | CPU usage cost | Actual CPU usage x AWS price |
| `ramCost` | Memory usage cost | Actual memory usage x AWS price |
| `networkCost` | Network transfer cost | Cross-AZ transfer x data transfer price |
| `pvCost` | PersistentVolume cost | PVC -> EBS volume mapping |
| `gpuCost` | GPU usage cost | GPU allocation time x GPU price |

**Efficiency metrics**: OpenCost also provides CPU/Memory efficiency:
```typescript
cpuEfficiency: alloc.cpuEfficiency,    // actual usage / requested
ramEfficiency: alloc.ramEfficiency,    // actual usage / requested
```

### Mode 2: Request-based Estimation (Fallback)

When OpenCost is not installed, costs are estimated using Steampipe's `kubernetes_pod` and `kubernetes_node` tables.

**Core algorithm: 50% CPU + 50% Memory weighting**

```typescript
// src/app/api/eks-container-cost/route.ts
// 1. Parse pod resource requests
const cpuReq = parseCpu(container.requests?.cpu);      // "500m" -> 0.5
const memReqMB = parseMemoryMB(container.requests?.memory); // "512Mi" -> 512

// 2. Calculate ratio against node capacity
const cpuRatio = cpuReq / node.allocCpu;     // Pod CPU / Node CPU
const memRatio = memReqMB / node.allocMemMB; // Pod Memory / Node Memory

// 3. Split node cost 50:50
const cpuCostDaily = cpuRatio * node.hourlyRate * 24 * 0.5;
const memCostDaily = memRatio * node.hourlyRate * 24 * 0.5;
const totalCostDaily = cpuCostDaily + memCostDaily;
```

**EC2 pricing table** (ap-northeast-2 on-demand):
```typescript
const EC2_PRICING: Record<string, number> = {
  'm5.large': 0.118, 'm5.xlarge': 0.236,
  'm6g.large': 0.0998, 'c5.xlarge': 0.196,
  'r5.large': 0.152, 't3.large': 0.104,
  // ... hourly rates per instance type
};
const DEFAULT_HOURLY_RATE = 0.236; // m5.xlarge fallback
```

### Comparison

| Aspect | OpenCost | Request-based |
|--------|----------|---------------|
| CPU | Actual usage based | Request ratio based |
| Memory | Actual usage based | Request ratio based |
| Network | Cross-AZ transfer tracking | **Not included** |
| Storage | PVC -> EBS mapping | **Not included** |
| GPU | GPU time tracking | **Not included** |
| Accuracy | High (actual metrics) | Estimate (request-based) |
| Requirements | Prometheus + OpenCost | None (Steampipe only) |

### Installing OpenCost

```bash
# Run scripts/07-setup-opencost.sh
bash scripts/07-setup-opencost.sh

# Installs: Metrics Server -> Prometheus -> OpenCost
# After install, add endpoint to data/config.json:
# { "opencostEndpoint": "http://localhost:9003" }
```

</details>

<details>
<summary>How does agent communication work, and how to improve FTTT?</summary>

### Full Communication Flow

```mermaid
flowchart TD
  FE["Frontend<br/>(ai/page.tsx)"] -->|"POST /api/ai<br/>SSE Stream"| API["Next.js API<br/>(route.ts)"]

  API -->|"1️⃣ Intent classification"| BED["Bedrock Sonnet<br/>~1-2s"]
  BED -->|route decision| API

  API -->|"route=code"| CI["Code Interpreter<br/>Python Sandbox"]
  API -->|"route=aws-data"| SQL["Steampipe SQL<br/>+ Bedrock analysis"]
  API -->|"other routes"| AC["AgentCore Runtime<br/>InvokeAgentRuntimeCommand"]

  AC -->|"JSON payload"| AG["agent.py<br/>(Strands Agent)"]
  AG -->|"MCP + SigV4"| GW["Gateway<br/>(8 gateways, 125 tools)"]
  GW -->|"mcp.lambda"| LM["Lambda<br/>(19 functions)"]
```

### Communication at Each Stage

**Stage 1: Frontend -> Next.js API (SSE)**
```typescript
// Frontend: fetch with ReadableStream
const res = await fetch('/awsops/api/ai', {
  method: 'POST',
  body: JSON.stringify({ messages, stream: true }),
});

// API sends SSE events
send('status', { step: 'classifying', message: 'Analyzing question...' });
send('status', { step: 'agentcore', message: 'Running tools...' });
send('done', { content, usedTools, route });
```

**Stage 2: API -> AgentCore Runtime (AWS SDK)**
```typescript
// 90-second timeout, JSON payload includes gateway name
const command = new InvokeAgentRuntimeCommand({
  agentRuntimeArn: config.agentRuntimeArn,
  payload: JSON.stringify({ messages: recentMessages, gateway }),
});
const response = await agentCoreClient.send(command);
```

**Stage 3: AgentCore -> Gateway (MCP + SigV4)**
```python
# agent.py: SigV4-signed HTTP to Gateway
mcp_client = MCPClient(lambda: create_gateway_transport(url))
tools = get_all_tools(mcp_client)  # list_tools with pagination
agent = Agent(model=model, tools=tools)
response = agent(user_input)
```

**Stage 4: Gateway -> Lambda (MCP Lambda Protocol)**
Gateways invoke Lambda functions via `mcp.lambda` protocol with `credentialProviderConfigurations`.

### FTTT (Time To First Token) Breakdown

FTTT is the time from when a user submits a question until the **first response text appears** on screen.

| Stage | Duration | Description |
|-------|----------|-------------|
| Intent classification | 1-2s | Bedrock Sonnet determines route |
| AgentCore Cold Start | 10-30s | Initial container startup (0s when warm) |
| Tool discovery | 1-3s | `list_tools_sync()` pagination |
| Model inference | 2-5s | Strands Agent LLM call |
| Tool execution | 2-30s | Lambda execution (including API calls) |
| **Total FTTT (Cold)** | **~15-60s** | |
| **Total FTTT (Warm)** | **~5-15s** | |

### How to Improve FTTT

**1. Eliminate Cold Start (biggest impact)**
```bash
# Set minimum instances on AgentCore Runtime
aws bedrock-agentcore update-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --min-instances 1
```

**2. Cache intent classification**
```typescript
// Cache classification results for similar question patterns
const classificationCache = new Map<string, string[]>();
```

**3. Cache Gateway tool lists**
```python
# Cache list_tools results in memory
TOOL_CACHE: dict[str, list] = {}
TOOL_CACHE_TTL = 300  # 5 minutes
```

**4. Multi-route parallel execution (already implemented)**
```typescript
// When multiple routes are classified, execute simultaneously
const results = await Promise.all(
  routes.map(route => invokeAgentCore(messages, route))
);
```

**5. Keepalive to prevent CloudFront timeout (already implemented)**
```typescript
// Send SSE events every 15 seconds to prevent CloudFront 60s timeout
const keepaliveInterval = setInterval(() => {
  send('status', { message: `Running tools... (${count * 15}s)` });
}, 15000);
```

**6. Three Streaming Modes (Implemented)**

AWSops provides three optimized streaming modes for different response paths:

| Mode | Applied Path | Method | Latency |
|------|-------------|--------|---------|
| **Real Streaming** | Multi-route synthesis | `ConverseStreamCommand` (Bedrock Converse API) | Token-level immediate delivery |
| **Simulated Streaming** | Single Gateway response | `simulateStreaming()` (50 chars/15ms chunking) | Typing effect |
| **Direct Streaming** | Bedrock Direct (aws-data) | `InvokeModelWithResponseStreamCommand` | Token-level immediate delivery |

```typescript
// Multi-route synthesis: Real-time streaming via Converse Stream API
async function synthesizeResponsesStreaming(results, send) {
  const command = new ConverseStreamCommand({
    modelId: 'anthropic.claude-sonnet-4-6-20250514-v1:0',
    messages: [{ role: 'user', content: [{ text: synthesisPrompt }] }],
  });
  const response = await bedrockClient.send(command);
  for await (const event of response.stream) {
    if (event.contentBlockDelta?.delta?.text) {
      send('chunk', { delta: event.contentBlockDelta.delta.text });
    }
  }
}

// Single Gateway response: Simulated typing effect
async function simulateStreaming(content, send) {
  const CHUNK_SIZE = 50, CHUNK_DELAY_MS = 15;
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    send('chunk', { delta: content.slice(i, i + CHUNK_SIZE) });
    await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
  }
}
```

:::info Why three modes?
- **AgentCore Gateway** returns the complete response at once, so simulateStreaming provides a typing effect
- **Multi-route synthesis** combines results from multiple Gateways via Bedrock, utilizing the Converse API's native streaming
- **Bedrock Direct** natively supports token streaming
:::

</details>

<details>
<summary>How to auto-trigger agents from AlertManager?</summary>

### Current State

AlertManager is currently **disabled** in AWSops:

```bash
# scripts/07-setup-opencost.sh
helm install prometheus prometheus-community/prometheus \
  --set alertmanager.enabled=false   # Explicitly disabled
```

Prometheus is installed only for OpenCost metric collection.

However, **CloudWatch alarm tools** already exist:
- `get_active_alarms`: Query alarms in ALARM state
- `get_alarm_history`: Get alarm state change history
- `get_recommended_metric_alarms`: Get recommended alarm thresholds

### Approach 1: AlertManager Webhook (Prometheus-based)

**Step 1. Enable AlertManager**

Modify `scripts/07-setup-opencost.sh`:
```bash
helm upgrade prometheus prometheus-community/prometheus \
  --set alertmanager.enabled=true
```

**Step 2. Create webhook API endpoint**

```typescript
// src/app/api/alert-webhook/route.ts (new file)
import { NextRequest, NextResponse } from 'next/server';

interface AlertManagerPayload {
  alerts: Array<{
    status: 'firing' | 'resolved';
    labels: Record<string, string>;
    annotations: Record<string, string>;
    startsAt: string;
    endsAt: string;
  }>;
}

export async function POST(request: NextRequest) {
  const payload: AlertManagerPayload = await request.json();

  // Transform AlertManager format -> AI message
  const alertSummary = payload.alerts.map(alert => {
    const severity = alert.labels.severity || 'warning';
    const name = alert.labels.alertname;
    const description = alert.annotations.description || '';
    return `[${severity.toUpperCase()}] ${name}: ${description}`;
  }).join('\n');

  const aiMessage = {
    messages: [{
      role: 'user',
      content: `The following alerts have fired. Analyze the root cause and suggest remediation:\n\n${alertSummary}`
    }],
    stream: false,
  };

  // Call internal AI API
  const aiResponse = await fetch('http://localhost:3000/awsops/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aiMessage),
  });

  const analysis = await aiResponse.json();
  return NextResponse.json({ status: 'processed', analysis });
}
```

**Step 3. Configure AlertManager**

```yaml
# alertmanager-config.yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'awsops-ai'
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h

receivers:
  - name: 'awsops-ai'
    webhook_configs:
      - url: 'http://<EC2-Private-IP>:3000/awsops/api/alert-webhook'
        send_resolved: true
```

**Step 4. Define Prometheus alerting rules**

```yaml
# prometheus-rules.yaml
groups:
  - name: kubernetes
    rules:
      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          description: "Pod {{ $labels.pod }} in {{ $labels.namespace }} is crash looping"

      - alert: HighCPUUsage
        expr: sum(rate(container_cpu_usage_seconds_total[5m])) by (pod) > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          description: "Pod {{ $labels.pod }} CPU usage > 90% for 10 minutes"
```

### Approach 2: CloudWatch Alarms -> SNS -> Lambda (AWS Native)

An AWS-only approach without Prometheus:

```mermaid
flowchart LR
  subgraph M1["Approach 1: AlertManager"]
    PR[Prometheus] -->|PromQL rules| AM[AlertManager]
    AM -->|webhook POST| WH["/api/alert-webhook"]
  end

  subgraph M2["Approach 2: CloudWatch"]
    CWA[CloudWatch Alarm] --> SNS[SNS Topic]
    SNS --> LM[Lambda]
    LM -->|POST| WH2["/api/alert-webhook"]
  end

  WH --> AI["AI Agent<br/>Analysis & Response"]
  WH2 --> AI
```

**Lambda function (Python)**:
```python
import json
import urllib3

def handler(event, context):
    # Parse SNS message
    sns_message = json.loads(event['Records'][0]['Sns']['Message'])
    alarm_name = sns_message['AlarmName']
    reason = sns_message['NewStateReason']

    # Call AWSops AI API
    http = urllib3.PoolManager()
    response = http.request('POST',
        'http://<EC2-IP>:3000/awsops/api/alert-webhook',
        body=json.dumps({
            'alerts': [{
                'status': 'firing',
                'labels': {'alertname': alarm_name, 'severity': 'critical'},
                'annotations': {'description': reason},
            }]
        }),
        headers={'Content-Type': 'application/json'}
    )
    return {'statusCode': 200}
```

### Comparison

| Aspect | AlertManager | CloudWatch + SNS |
|--------|-------------|-----------------|
| Metric source | Prometheus (K8s focused) | CloudWatch (all AWS) |
| Alert rules | PromQL | CloudWatch Metric Math |
| Setup required | Enable AlertManager | Create 1 Lambda |
| Best for | EKS Pod/Node monitoring | All AWS services |
| Cost | Free (open source) | Lambda/SNS invocation costs |

:::tip Recommended Setup
Use **AlertManager** for EKS cluster monitoring and **CloudWatch + SNS** for broad AWS service coverage. Both can be used simultaneously to route all alerts through the AI agent.
:::

</details>

<details>
<summary>Why is Steampipe pg Pool 660x faster than CLI?</summary>

### CLI vs pg Pool Comparison

```mermaid
flowchart LR
  subgraph CLI["steampipe query (CLI)"]
    SPAWN["Process spawn"] --> FDW["FDW Plugin<br/>initialization"]
    FDW --> EXEC1["SQL execution"]
    EXEC1 --> EXIT["Process exit"]
  end

  subgraph POOL["pg Pool (runQuery)"]
    CONN["Reuse existing<br/>connection"] --> EXEC2["SQL execution"]
  end
```

### Benchmark

| Method | `SELECT COUNT(*) FROM aws_ec2_instance` | Notes |
|--------|----------------------------------------|-------|
| `steampipe query "SQL"` CLI | ~3,300ms | Process spawn + FDW init each time |
| pg Pool `runQuery()` | ~5ms (cache hit), ~200ms (cache miss) | Connection pool reuse |
| **Performance gap** | **~660x** (cache hit) | |

### Pool Configuration

```typescript
// src/lib/steampipe.ts
const pool = new Pool({
  host: '127.0.0.1',
  port: 9193,
  max: 10,                    // 10 connections maintained
  idleTimeoutMillis: 30000,   // Idle return after 30s
  connectionTimeoutMillis: 15000, // Fail if no connection in 15s
  statement_timeout: 30000,   // 30s query timeout
});
```

1. **Connection reuse**: 10 connections managed in pool, no per-query creation
2. **node-cache**: Query results cached for 5 minutes (key: `sp:{accountId}:{SQL}`)
3. **Steampipe service mode**: `steampipe service start` keeps FDW always loaded
4. **No binary overhead**: Direct PostgreSQL protocol from Node.js process

### Batch Queries

Dashboard home loads 20+ queries using `batchQuery()`:

```typescript
// 8 queries in parallel (reserves 2 of 10 pool connections for other requests)
const results = await batchQuery(queries);  // BATCH_SIZE = 8
```

</details>

<details>
<summary>What happens if Steampipe goes down?</summary>

When the Steampipe process stops, pg Pool connections fail. Here's how each layer behaves.

### Failure Propagation

```mermaid
flowchart TD
  SP["Steampipe process down"] -->|"port 9193 unreachable"| POOL["pg Pool connection failure"]

  POOL -->|"runQuery() catch"| ERR["{ rows: [], error: message }"]
  ERR --> DASH["Dashboard: shows empty data"]
  ERR --> AI_SQL["AI aws-data route: reports unavailability"]

  SP -->|"no impact"| AC["AgentCore Gateway"]
  AC --> LAMBDA["Lambda (direct AWS API calls)"]
```

### Impact by Layer

| Layer | When Steampipe is down | Details |
|-------|------------------------|---------|
| **Dashboard pages** | Empty data displayed | `runQuery()` returns `{ rows: [], error }`, UI renders empty tables |
| **AI aws-data route** | "Unable to query data" message | Steampipe SQL fails → Bedrock explains the error |
| **AI Gateway routes** | **Works normally** | AgentCore → Lambda calls AWS APIs directly (no Steampipe dependency) |
| **Cached data** | Normal for 5 minutes | Cache hits within TTL don't touch Steampipe |
| **Cost data** | Snapshot fallback | Falls back to latest JSON in `data/cost/` (retained for 180 days) |

### Error Handling

```typescript
// src/lib/steampipe.ts — runQuery()
try {
  const result = await pool.query(sql);
  return { rows: result.rows };
} catch (error) {
  // Never throws → returns safe empty result to caller
  return { rows: [], error: error.message };
}
```

All queries are wrapped in try/catch — **Steampipe failure never crashes the Next.js server**.

### Recovery

```bash
# 1. Check Steampipe service status
steampipe service status

# 2. Restart
steampipe service restart --force

# 3. Pool reset in Next.js (admin API or server restart)
# resetPool() retries connection up to 15 times (1-second intervals)
```

### Zombie Connection Cleanup

Slow Steampipe FDW API calls can exhaust the connection pool. A cleanup runs every 2 minutes:

```typescript
// Terminates SELECT queries running for 5+ minutes
// Excludes FDW internal connections (client_addr IS NULL)
pg_terminate_backend(pid)
```

</details>

<details>
<summary>How does pg Pool caching work?</summary>

AWSops uses **node-cache** in-memory caching to store Steampipe query results for 5 minutes.

### Cache Flow

```mermaid
flowchart TD
  REQ["API request"] --> CHECK{"Result<br/>in cache?"}
  CHECK -->|"hit"| RET["Return cached result<br/>(~0ms)"]
  CHECK -->|"miss"| QUERY["Execute Steampipe SQL<br/>(100~500ms)"]
  QUERY --> SAVE["Store in cache<br/>(TTL: 5min)"]
  SAVE --> RET2["Return result"]

  WARM["Cache Warmer<br/>(every 4min)"] -->|"pre-execute key queries"| SAVE
```

### Cache Key Structure

```
sp:{accountId}:{SQL statement}
```

- **Multi-account**: Scoped per account (`sp:111111111111:SELECT...`)
- **Single account**: `sp:__all__:SELECT...`
- **Cost availability**: `cost:available:{accountId}` (TTL: 1 hour)

### Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Default TTL | 300s (5 min) | General query cache lifetime |
| Cost availability TTL | 3,600s (1 hour) | `checkCostAvailability` result |
| Check period | 60s | Expired key cleanup interval |
| Cache Warmer interval | 240s (4 min) | Refreshes before TTL expires |

### Cache Invalidation

| Method | Trigger | Action |
|--------|---------|--------|
| **Refresh button** | User click in UI | `bustCache: true` → skip cache, re-query |
| **clearCache()** | Admin API | `cache.flushAll()` wipes everything |
| **resetPool()** | Pool recreation | Flushes cache + pool simultaneously |
| **Natural expiry** | TTL elapsed | Expired keys cleaned every 60s |

### Cache Warmer (Pre-warming)

Starting 5 seconds after server boot, runs every 4 minutes to pre-populate cache with key dashboard queries:

```typescript
// src/lib/cache-warmer.ts
// Warms: EC2, S3, RDS, Lambda, VPC, IAM, ECS, DynamoDB, etc. (~22 queries)
// CloudWatch monitoring queries EXCLUDED (slow FDW API causes zombie connections)
```

- Multi-account: Warms up to 3 accounts sequentially
- `isWarming` flag prevents overlapping runs

</details>

<details>
<summary>Does batchQuery incur AWS API costs?</summary>

### Short Answer

**Zero cost on cache hits. AWS API calls only on cache misses.**

### Cost Structure

```mermaid
flowchart LR
  BQ["batchQuery()<br/>8 in parallel"] --> CACHE{"Cache<br/>hit?"}
  CACHE -->|"hit"| FREE["No cost<br/>(returned from memory)"]
  CACHE -->|"miss"| SP["Steampipe FDW"]
  SP -->|"AWS API call"| AWS["AWS API<br/>(mostly free)"]
```

### AWS API Call Costs

Steampipe FDW calls **real AWS APIs** on cache miss. Most `Describe`/`List` APIs are free:

| API Type | Cost | Examples |
|----------|------|---------|
| EC2 Describe* | Free | `DescribeInstances`, `DescribeVpcs` |
| S3 List* | $0.005/1,000 req | `ListBuckets` |
| IAM List/Get* | Free | `ListUsers`, `ListRoles` |
| CloudWatch GetMetricData | $0.01/1,000 metrics | Metric queries |
| Cost Explorer GetCostAndUsage | $0.01/request | Cost data |
| CloudTrail LookupEvents | Free (last 90 days) | Event lookup |

### Real-World Cost Scenarios

**Dashboard home load (~22 queries)**:

| Scenario | API Calls | Est. Cost |
|----------|-----------|-----------|
| Cache hit (revisit within 5 min) | 0 | $0 |
| Cache miss (first load) | ~22 Describe/List | ~$0 (mostly free APIs) |
| Cache Warmer per hour (15 cycles) | ~330 | ~$0 |

**APIs with meaningful costs**:

| API | Unit Price | Monthly Est. (4-min warming) |
|-----|-----------|------------------------------|
| Cost Explorer | $0.01/req | ~$3.24 (6 req/hr × 24h × 30d × $0.01) |
| CloudWatch GetMetricData | $0.01/1,000 | < $0.01 |
| S3 ListBuckets | $0.005/1,000 | < $0.01 |

### Cost Optimization Design

1. **5-minute cache**: Zero API calls on page revisits
2. **Cache Warmer**: Pre-fills cache → most requests are cache hits
3. **Cost availability 1-hour cache**: `checkCostAvailability()` probes only once per hour
4. **Batch size 8**: Uses 8 of 10 pool connections, reserves 2 for real-time requests
5. **CloudWatch queries excluded from warming**: Slow FDW API causes zombie connections → only executed on user request

:::info Cost Explorer Cost Reduction
Cost Explorer API has the highest per-call cost. `checkCostAvailability()` uses a dedicated 10-second timeout for quick detection, and MSP environments set `costEnabled: false` to skip API calls entirely.
:::

</details>
