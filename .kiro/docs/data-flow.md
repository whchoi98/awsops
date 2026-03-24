# Data Flow / 데이터 흐름

## Dashboard Pages (일반 페이지)
```
Browser → Next.js page ('use client')
  → fetch('/awsops/api/steampipe', { queries })
    → steampipe.ts: batchQuery() → pg Pool :9193 (max 5, 120s timeout)
      → Steampipe → AWS API / K8s API / Trivy DB
    → node-cache (5min TTL)
  → JSON response → Recharts / DataTable / React Flow
```
- 응답 시간: ~2s (캐시 히트 시 즉시)
- batchQuery: 3개 쿼리 동시 실행 (순차 배치)

## AI Assistant (SSE Streaming)
```
Browser → POST /awsops/api/ai (question + model + history)
  → Classifier: 질문 분석 → 1~3개 route 결정
  → 각 route별 처리:
    ├─ code      → Bedrock + Code Interpreter (Python sandbox) ~10s
    ├─ network   → AgentCore Runtime → Network Gateway (17 MCP tools) ~30-60s
    ├─ container → AgentCore Runtime → Container Gateway (24 tools) ~30-60s
    ├─ iac       → AgentCore Runtime → IaC Gateway (12 tools) ~30-60s
    ├─ data      → AgentCore Runtime → Data Gateway (24 tools) ~10-30s
    ├─ security  → AgentCore Runtime → Security Gateway (14 tools) ~30-60s
    ├─ monitoring→ AgentCore Runtime → Monitoring Gateway (16 tools) ~30-60s
    ├─ cost      → AgentCore Runtime → Cost Gateway (9 tools) ~30-60s
    ├─ aws-data  → Steampipe SQL + Bedrock Sonnet 4.6 ~5s
    └─ general   → Ops Gateway (9 tools) + Bedrock fallback ~5-30s
  → 멀티 라우트: 병렬 호출 → Bedrock 응답 합성
  → SSE stream → Browser
```

## CIS Compliance
```
Browser → POST /awsops/api/benchmark (version)
  → Powerpipe → Steampipe → AWS API
  → 431 controls 평가 (~3-5min)
  → JSON response
```

## CloudWatch Metrics (MSK, RDS, ElastiCache, OpenSearch)
```
Browser → GET /awsops/api/{msk,rds,elasticache,opensearch}
  → boto3 CloudWatch get_metric_statistics()
  → JSON response (CPU, Memory, Network, etc.)
```

## Container Cost
```
ECS: Browser → POST /awsops/api/container-cost
  → Steampipe (ECS services) + Fargate pricing + Container Insights
EKS: Browser → POST /awsops/api/eks-container-cost
  → OpenCost API (CPU/Mem/Net/Storage/GPU) || request-based fallback
```

## AgentCore Gateway → Lambda
```
AgentCore Runtime (Strands agent.py)
  → MCP StreamableHTTP + SigV4
    → AgentCore Gateway (role-based)
      → Lambda Target (boto3 read-only)
        → AWS API
      → Response → Gateway → Runtime → API → Browser
```
