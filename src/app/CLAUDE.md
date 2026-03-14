# 앱 모듈 / App Module

## 역할 / Role
Next.js 14 App Router 페이지 및 API 라우트. 각 하위 디렉토리는 라우트 세그먼트.
(Next.js 14 App Router pages and API routes. Each subdirectory is a route segment.)

## 페이지 (30 page files) / Pages

### Overview (3)
- `page.tsx` — 대시보드 홈 (18 StatsCards, Cost 가용성 감지, 인벤토리 스냅샷 자동 저장) (Dashboard home with 18 StatsCards, cost availability detection, inventory auto-snapshot)
- `ai/page.tsx` — AI 어시스턴트 (SSE 스트리밍 채팅) (AI Assistant with SSE streaming chat)
- `agentcore/page.tsx` — AgentCore 대시보드 (Runtime/Gateway/Tools 상태) (AgentCore dashboard)

### Compute (6)
- `ec2/page.tsx` — EC2 인스턴스 + 상세 패널 (Instances + detail panel)
- `lambda/page.tsx` — Lambda 함수, 런타임 (Functions, runtimes)
- `ecs/page.tsx` — ECS 클러스터/서비스/태스크 (Clusters, services, tasks)
- `ecr/page.tsx` — ECR 리포지토리/이미지 (Repositories, images)
- `k8s/page.tsx` — EKS Overview (클러스터, 노드, Pod 요약) (Cluster, nodes, pod summary)
- `k8s/explorer/page.tsx` — K9s 스타일 터미널 UI (K9s-style terminal UI)

### EKS Sub-pages (4)
- `k8s/pods/page.tsx` — Pod 목록/상태 (Pod list/status)
- `k8s/nodes/page.tsx` — 노드 목록/용량 (Node list/capacity)
- `k8s/deployments/page.tsx` — Deployment 목록 (Deployment list)
- `k8s/services/page.tsx` — Service 목록 (Service list)

### Network & CDN (4)
- `vpc/page.tsx` — VPC/Subnet/SG/Route Tables/TGW/ELB/NAT/IGW + Resource Map (탭 기반) (Tab-based)
- `cloudfront-cdn/page.tsx` — CloudFront 배포 (Distributions)
- `waf/page.tsx` — WAF Web ACL/규칙 (Web ACLs, rules)
- `topology/page.tsx` — 인프라 맵 + 그래프 / K8s 맵 (Infra Map+Graph / K8s Map, React Flow)

### Storage & DB (7)
- `ebs/page.tsx` — EBS 볼륨/스냅샷 (암호화, 어태치먼트 매핑, 상세 패널) (Volumes/Snapshots with encryption, attachment mapping, detail panel)
- `s3/page.tsx` — S3 버킷 (TreeMap/검색/IAM) (Buckets with TreeMap/search/IAM)
- `rds/page.tsx` — RDS 인스턴스 (SG 체이닝/메트릭) (Instances with SG chaining/metrics)
- `dynamodb/page.tsx` — DynamoDB 테이블 (Tables)
- `elasticache/page.tsx` — ElastiCache 클러스터 (SG/메트릭) (Clusters with SG/metrics)
- `opensearch/page.tsx` — OpenSearch 도메인 (암호화, VPC, 클러스터 구성, EBS) (Domains with encryption, VPC, cluster config, EBS)
- `msk/page.tsx` — MSK 클러스터 (Kafka 버전, 브로커, 암호화, 모니터링) (Clusters with Kafka version, brokers, encryption, monitoring)

### Monitoring (5)
- `monitoring/page.tsx` — CPU/메모리/네트워크/디스크 I/O (날짜 범위 선택) (Date range selector)
- `cloudwatch/page.tsx` — CloudWatch 알람 (Alarms)
- `cloudtrail/page.tsx` — CloudTrail 트레일/이벤트 (Trails, events read/write)
- `cost/page.tsx` — Cost Explorer (기간/서비스 필터, Cost 불가 시 비활성화 UI) (Period/service filter, unavailable UI when Cost Explorer blocked)
- `inventory/page.tsx` — Resource Inventory (리소스 수량 추이, 비용 영향 추정) (Resource count trends, cost impact estimation)

### Security (3)
- `iam/page.tsx` — IAM 사용자/역할/트러스트 정책 (Users, roles, trust policies)
- `security/page.tsx` — Public S3, Open SGs, Unencrypted EBS, CVE
- `compliance/page.tsx` — CIS v1.5~v4.0 벤치마크 (431 controls)

## API 라우트 (5) / API Routes

- `api/ai/route.ts` — AI 라우팅, 10단계 우선순위: Code→Network→Container→IaC→Data→Security→Monitoring→Cost→AWSData→General (10-route priority, multi-route support 1-3 routes, SSE streaming)
- `api/steampipe/route.ts` — Steampipe 쿼리 + Cost 가용성 + 인벤토리 (POST: batchQuery+saveInventory, GET: cost-check/inventory/config/cost-snapshot, PUT: config)
- `api/msk/route.ts` — MSK 브로커 노드 + CloudWatch 메트릭 (AWS CLI: kafka list-nodes, cloudwatch get-metric-data)
- `api/code/route.ts` — 코드 인터프리터 엔드포인트 (Code interpreter endpoint)
- `api/benchmark/route.ts` — CIS 컴플라이언스 벤치마크 엔드포인트 (CIS Compliance benchmark endpoint)

## 규칙 / Rules
- 모든 페이지 파일은 `'use client'`로 시작해야 함
  (Every page file must start with `'use client'`)
- 모든 fetch URL에 `/awsops/api/*` 접두사 필수 — basePath 자동 적용 안 됨
  (All fetch URLs must use `/awsops/api/*` prefix — basePath not auto-applied)
- 컴포넌트는 기본 내보내기로 임포트: `{ X }` 형태가 아닌 `import X from '...'`
  (Components imported as default: `import X from '...'` — NOT `{ X }`)
- StatsCard/LiveResourceCard의 `color` 속성은 hex가 아닌 이름('cyan') 사용
  (StatsCard/LiveResourceCard `color` prop uses names ('cyan') not hex)
- 새 페이지: `docs/runbooks/add-new-page.md`의 패턴을 따를 것
  (New pages: follow the pattern in `docs/runbooks/add-new-page.md`)
