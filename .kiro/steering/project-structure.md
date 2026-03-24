# Project Structure / 프로젝트 구조

## Directory Map

```
awsops/
├── .kiro/                        # Kiro AI 설정
│   ├── AGENT.md                  # 에이전트 컨텍스트
│   ├── rules.md                  # 프로젝트 규칙
│   ├── steering/                 # 가이드라인
│   │   ├── coding-standards.md
│   │   ├── architecture-decisions.md
│   │   └── project-structure.md
│   └── docs/
│       ├── data-flow.md
│       └── troubleshooting-quick-ref.md
├── src/
│   ├── app/                      # 34 pages + 12 API routes (49 routes total)
│   │   ├── page.tsx              # Dashboard (18 StatsCards)
│   │   ├── ai/                   # AI Assistant (SSE, multi-route)
│   │   ├── agentcore/            # AgentCore Dashboard
│   │   ├── ec2/ lambda/ ecs/ ecr/ # Compute
│   │   ├── k8s/                  # EKS (overview, pods, nodes, deployments, services, explorer)
│   │   ├── container-cost/       # ECS Container Cost (Fargate pricing)
│   │   ├── eks-container-cost/   # EKS Container Cost (OpenCost + request-based)
│   │   ├── vpc/ cloudfront-cdn/ waf/ topology/ # Network & CDN
│   │   ├── ebs/ s3/ rds/ dynamodb/ elasticache/ # Storage & DB
│   │   ├── opensearch/           # OpenSearch domains
│   │   ├── msk/                  # MSK Kafka clusters
│   │   ├── monitoring/ cloudwatch/ cloudtrail/ cost/ inventory/ # Monitoring
│   │   ├── iam/ security/ compliance/          # Security
│   │   └── api/                  # 12 API routes
│   │       ├── ai/route.ts       # 10-route classifier + SSE
│   │       ├── steampipe/route.ts # Steampipe query endpoint
│   │       ├── auth/route.ts     # Authentication
│   │       ├── agentcore/route.ts # AgentCore status
│   │       ├── code/route.ts     # Code Interpreter
│   │       ├── benchmark/route.ts # CIS benchmark
│   │       ├── msk/route.ts      # MSK metrics
│   │       ├── rds/route.ts      # RDS metrics
│   │       ├── elasticache/route.ts # ElastiCache metrics
│   │       ├── opensearch/route.ts  # OpenSearch metrics
│   │       ├── container-cost/route.ts # ECS container cost
│   │       └── eks-container-cost/route.ts # EKS container cost
│   ├── components/               # 14 shared components
│   │   ├── layout/               # Sidebar, Header
│   │   ├── dashboard/            # StatsCard, LiveResourceCard, StatusBadge
│   │   ├── charts/               # PieChartCard, BarChartCard, LineChartCard
│   │   ├── table/                # DataTable
│   │   └── k8s/                  # K9s-style (ResourceTable, DetailPanel, ClusterHeader)
│   ├── lib/
│   │   ├── steampipe.ts          # pg Pool (max 5, 120s timeout, 5min cache)
│   │   ├── resource-inventory.ts # 리소스 인벤토리 스냅샷
│   │   ├── cost-snapshot.ts      # Cost 데이터 스냅샷 (fallback)
│   │   ├── app-config.ts         # 앱 설정 (costEnabled 등)
│   │   └── queries/              # 24 SQL files (ec2, ebs, msk, opensearch, vpc, s3, rds, k8s, container-cost, eks-container-cost...)
│   └── types/aws.ts
├── agent/                        # Strands Agent (Docker arm64)
│   ├── agent.py                  # Dynamic gateway selection
│   ├── streamable_http_sigv4.py  # MCP + SigV4
│   ├── Dockerfile                # Python 3.11-slim, arm64
│   └── lambda/                   # 19 Lambda sources + create_targets.py
├── infra-cdk/                    # CDK TypeScript
│   └── lib/
│       ├── awsops-stack.ts       # VPC, EC2, ALB, CloudFront
│       └── cognito-stack.ts      # Cognito, Lambda@Edge
├── powerpipe/                    # CIS Benchmark mod
├── scripts/                      # 17 install/ops scripts (00~10)
│   ├── 06f-setup-opencost.sh     # Prometheus + OpenCost (EKS cost)
│   └── ARCHITECTURE.md           # Full architecture documentation
└── docs/                         # Guides, ADRs, Runbooks
```

## Page → Query → Data Mapping

| Page | Query File | Steampipe Tables |
|------|-----------|-----------------|
| Dashboard | ec2, vpc, s3, lambda, iam, security | Multiple (summary counts) |
| EC2 | ec2.ts | aws_ec2_instance |
| Lambda | lambda.ts | aws_lambda_function |
| ECS | ecs.ts | aws_ecs_cluster, aws_ecs_service |
| ECR | ecr.ts | aws_ecr_repository |
| VPC | vpc.ts | aws_vpc, aws_vpc_subnet, aws_vpc_security_group, aws_vpc_route_table, ... |
| CloudFront | cloudfront.ts | aws_cloudfront_distribution |
| WAF | waf.ts | aws_wafv2_web_acl |
| EBS | ebs.ts | aws_ebs_volume, aws_ebs_snapshot |
| S3 | s3.ts | aws_s3_bucket |
| RDS | rds.ts | aws_rds_db_instance |
| DynamoDB | dynamodb.ts | aws_dynamodb_table |
| ElastiCache | elasticache.ts | aws_elasticache_cluster |
| OpenSearch | opensearch.ts | aws_opensearch_domain |
| MSK | msk.ts | aws_msk_cluster |
| K8s | k8s.ts | kubernetes_node, kubernetes_pod, kubernetes_deployment, kubernetes_service |
| ECS Container Cost | container-cost.ts | aws_ecs_service (+ Fargate pricing) |
| EKS Container Cost | eks-container-cost.ts | OpenCost API (+ request-based fallback) |
| Cost | cost.ts | aws_cost_by_service_daily, aws_cost_by_service_monthly |
| Inventory | inventory.ts | Multiple (resource count trends) |
| IAM | iam.ts | aws_iam_user, aws_iam_role |
| Security | security.ts | aws_s3_bucket, aws_vpc_security_group, aws_ebs_volume, trivy_scan_vulnerability |
| Topology | relationships.ts | Multiple (cross-resource relationships) |
