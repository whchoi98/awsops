# 앱 모듈

## 역할
Next.js 14 App Router 페이지 및 API 라우트. 각 하위 디렉토리는 라우트 세그먼트.

## 페이지 (35개)

### Overview (4)
- `page.tsx` — 대시보드 홈 (20 StatsCards, Cost 가용성 감지, 인벤토리 스냅샷)
- `ai/page.tsx` — AI 어시스턴트 (SSE 스트리밍, 멀티 라우트, 도구 사용 표시, 사용자별 대화 이력, 토큰 비용 표시)
- `agentcore/page.tsx` — AgentCore 대시보드 (Runtime/Gateway/Tools 상태, 호출 통계, 대화 이력 검색)
- `bedrock/page.tsx` — Bedrock 모니터링 (모델별 사용량, 토큰 비용, 프롬프트 캐싱, Account vs AWSops 비교)

### Compute (6)
- `ec2/page.tsx` — EC2 인스턴스 + 상세 패널
- `lambda/page.tsx` — Lambda 함수, 런타임
- `ecs/page.tsx` — ECS 클러스터/서비스/태스크
- `ecr/page.tsx` — ECR 리포지토리/이미지
- `k8s/page.tsx` — EKS Overview (클러스터, 노드, Pod 요약)
- `k8s/explorer/page.tsx` — K9s 스타일 터미널 UI

### EKS 하위 (4)
- `k8s/pods/page.tsx`, `k8s/nodes/page.tsx`, `k8s/deployments/page.tsx`, `k8s/services/page.tsx`

### Network & CDN (4)
- `vpc/page.tsx` — VPC/Subnet/SG/TGW/ELB/NAT/IGW + 리소스 맵
- `cloudfront-cdn/page.tsx` — CloudFront 배포
- `waf/page.tsx` — WAF Web ACL/규칙
- `topology/page.tsx` — 인프라 맵 + K8s 맵 (React Flow)

### Storage & DB (7)
- `ebs/page.tsx` — EBS 볼륨/스냅샷 (암호화, EC2 어태치먼트 매핑)
- `s3/page.tsx` — S3 버킷 (TreeMap/검색/IAM)
- `rds/page.tsx` — RDS 인스턴스 (SG 체이닝/메트릭/CloudWatch 메트릭 테이블)
- `dynamodb/page.tsx` — DynamoDB 테이블
- `elasticache/page.tsx` — ElastiCache (Valkey/Redis/Memcached, 노드 메트릭 테이블)
- `opensearch/page.tsx` — OpenSearch 도메인 (암호화, VPC, 도메인 메트릭 테이블)
- `msk/page.tsx` — MSK 클러스터 (브로커 노드 + CPU/Memory/Network 메트릭)

### Monitoring & Cost (8)
- `monitoring/page.tsx` — CPU/메모리/네트워크/Disk I/O
- `bedrock/page.tsx` — Bedrock 모델 사용량 대시보드 (CloudWatch 메트릭 + AWSops 토큰 추적)
- `cloudwatch/page.tsx` — CloudWatch 알람
- `cloudtrail/page.tsx` — CloudTrail 트레일/이벤트
- `cost/page.tsx` — Cost Explorer (MSP 자동 감지, 스냅샷 폴백)
- `inventory/page.tsx` — Resource Inventory (수량 추이, 비용 영향 추정)
- `container-cost/page.tsx` — ECS Container Cost (Fargate 가격 + Container Insights)
- `eks-container-cost/page.tsx` — EKS Container Cost (OpenCost + Request 기반 폴백)

### Security (3)
- `iam/page.tsx` — IAM 사용자/역할/트러스트 정책
- `security/page.tsx` — Public S3, Open SG, Unencrypted EBS, CVE
- `compliance/page.tsx` — CIS v1.5~v4.0 벤치마크

## API 라우트 (13개)

| API | 설명 |
|-----|------|
| `api/ai/route.ts` | AI 라우팅 (10 routes, 멀티 라우트, SSE, 도구 추론, 토큰 추적) |
| `api/steampipe/route.ts` | Steampipe 쿼리 + Cost 가용성 + 인벤토리 |
| `api/auth/route.ts` | 로그아웃 — HttpOnly 쿠키 서버 사이드 삭제 |
| `api/msk/route.ts` | MSK 브로커 노드 + CloudWatch 메트릭 |
| `api/rds/route.ts` | RDS 인스턴스 CloudWatch 메트릭 |
| `api/elasticache/route.ts` | ElastiCache 노드 CloudWatch 메트릭 |
| `api/opensearch/route.ts` | OpenSearch 도메인 CloudWatch 메트릭 |
| `api/agentcore/route.ts` | AgentCore Runtime/Gateway 상태 |
| `api/code/route.ts` | 코드 인터프리터 |
| `api/benchmark/route.ts` | CIS 컴플라이언스 벤치마크 |
| `api/container-cost/route.ts` | ECS 컨테이너 비용 (CloudWatch Container Insights + Fargate 가격) |
| `api/eks-container-cost/route.ts` | EKS 컨테이너 비용 (OpenCost API + Request 기반 폴백) |
| `api/bedrock-metrics/route.ts` | Bedrock 모델 사용량 (CloudWatch 메트릭 + AWSops 앱 토큰 통계) |

## 규칙
- 모든 페이지 파일은 `'use client'`로 시작
- 모든 fetch URL에 `/awsops/api/*` 접두사 필수
- 컴포넌트 임포트는 `import X from '...'` (default export)
- StatsCard `color`는 이름('cyan') 사용 — hex 아님
- CloudWatch 메트릭 API: `execFileSync`로 AWS CLI 호출 (shell injection 방지)

---

# App Module (English)

## Role
Next.js 14 App Router pages and API routes. Each subdirectory is a route segment.

## Pages (35)

### Overview (4)
- `page.tsx` — Dashboard home (20 StatsCards, Cost availability detection, inventory snapshot)
- `ai/page.tsx` — AI Assistant (SSE streaming, multi-route, tool usage display, per-user conversation history, token cost display)
- `agentcore/page.tsx` — AgentCore dashboard (Runtime/Gateway/Tools status, call stats, conversation history search)
- `bedrock/page.tsx` — Bedrock Monitoring (per-model usage, token costs, prompt caching, Account vs AWSops comparison)

### Compute (6)
- `ec2/page.tsx` — EC2 instances + detail panel
- `lambda/page.tsx` — Lambda functions, runtimes
- `ecs/page.tsx` — ECS clusters/services/tasks
- `ecr/page.tsx` — ECR repositories/images
- `k8s/page.tsx` — EKS Overview (clusters, nodes, pod summary)
- `k8s/explorer/page.tsx` — K9s-style terminal UI

### EKS Sub-pages (4)
- `k8s/pods/page.tsx`, `k8s/nodes/page.tsx`, `k8s/deployments/page.tsx`, `k8s/services/page.tsx`

### Network & CDN (4)
- `vpc/page.tsx` — VPC/Subnet/SG/TGW/ELB/NAT/IGW + Resource Map
- `cloudfront-cdn/page.tsx` — CloudFront distributions
- `waf/page.tsx` — WAF Web ACLs/rules
- `topology/page.tsx` — Infra Map + K8s Map (React Flow)

### Storage & DB (7)
- `ebs/page.tsx` — EBS volumes/snapshots (encryption, EC2 attachment mapping)
- `s3/page.tsx` — S3 buckets (TreeMap/search/IAM)
- `rds/page.tsx` — RDS instances (SG chaining/metrics/CloudWatch metrics table)
- `dynamodb/page.tsx` — DynamoDB tables
- `elasticache/page.tsx` — ElastiCache (Valkey/Redis/Memcached, node metrics table)
- `opensearch/page.tsx` — OpenSearch domains (encryption, VPC, domain metrics table)
- `msk/page.tsx` — MSK clusters (broker nodes + CPU/Memory/Network metrics)

### Monitoring & Cost (8)
- `monitoring/page.tsx` — CPU/Memory/Network/Disk I/O
- `bedrock/page.tsx` — Bedrock model usage dashboard (CloudWatch metrics + AWSops token tracking)
- `cloudwatch/page.tsx` — CloudWatch alarms
- `cloudtrail/page.tsx` — CloudTrail trails/events
- `cost/page.tsx` — Cost Explorer (MSP auto-detect, snapshot fallback)
- `inventory/page.tsx` — Resource Inventory (count trends, cost impact estimation)
- `container-cost/page.tsx` — ECS Container Cost (Fargate pricing + Container Insights)
- `eks-container-cost/page.tsx` — EKS Container Cost (OpenCost + request-based fallback)

### Security (3)
- `iam/page.tsx` — IAM users/roles/trust policies
- `security/page.tsx` — Public S3, Open SGs, Unencrypted EBS, CVE
- `compliance/page.tsx` — CIS v1.5~v4.0 benchmarks (431 controls)

## API Routes (13)

| API | Description |
|-----|------------|
| `api/ai/route.ts` | AI routing (10 routes, multi-route, SSE, tool inference, token tracking) |
| `api/steampipe/route.ts` | Steampipe queries + Cost availability + Inventory |
| `api/auth/route.ts` | Logout — server-side HttpOnly cookie deletion |
| `api/msk/route.ts` | MSK broker nodes + CloudWatch metrics |
| `api/rds/route.ts` | RDS instance CloudWatch metrics |
| `api/elasticache/route.ts` | ElastiCache node CloudWatch metrics |
| `api/opensearch/route.ts` | OpenSearch domain CloudWatch metrics |
| `api/agentcore/route.ts` | AgentCore Runtime/Gateway status |
| `api/code/route.ts` | Code Interpreter |
| `api/benchmark/route.ts` | CIS compliance benchmark |
| `api/container-cost/route.ts` | ECS Container Cost (CloudWatch Container Insights + Fargate pricing) |
| `api/eks-container-cost/route.ts` | EKS Container Cost (OpenCost API + request-based fallback) |
| `api/bedrock-metrics/route.ts` | Bedrock model usage metrics (CloudWatch + AWSops app token stats) |

## Rules
- All page files start with `'use client'`
- All fetch URLs must use `/awsops/api/*` prefix
- Component imports: `import X from '...'` (default export)
- StatsCard `color`: names ('cyan') not hex
- CloudWatch metric APIs use `execFileSync` (no shell injection)
