# EKS Container Cost / EKS 컨테이너 비용

## Role / 역할
EKS Pod cost analysis page with dual data source: OpenCost (primary) and request-based estimation (fallback).
OpenCost(기본) + Request 기반 추정(폴백) 이중 데이터 소스의 EKS Pod 비용 분석 페이지.

## Files / 파일
- `page.tsx` — EKS Container Cost dashboard (StatsCards, charts, Pods/Nodes tabs, calculation basis)

## Data Sources / 데이터 소스
- **OpenCost (primary)**: `data/config.json` `opencostEndpoint` → OpenCost REST API
  - 5 cost items: CPU, Memory, Network, Storage (PV), GPU
  - Requires: Prometheus + Metrics Server + OpenCost (scripts/07-setup-opencost.sh)
  - Access: kubectl port-forward localhost:9003 → OpenCost svc
- **Request-based (fallback)**: Steampipe `kubernetes_pod` + `kubernetes_node`
  - 2 cost items: CPU, Memory (from resource requests)
  - Formula: Pod request ratio × EC2 node hourly rate (50% CPU + 50% Memory)

## Auto-detection / 자동 감지
- If `opencostEndpoint` is set and reachable → uses OpenCost data (dataSource: 'opencost')
- If not set or unreachable → falls back to request-based (dataSource: 'request-based')
- UI dynamically shows Network/Storage/GPU columns only in OpenCost mode

## Related / 관련
- ECS Container Cost: `src/app/container-cost/` (Fargate pricing)
- API: `src/app/api/eks-container-cost/route.ts`
- Queries: `src/lib/queries/eks-container-cost.ts`
- Install: `scripts/07-setup-opencost.sh` (Prometheus + OpenCost)
