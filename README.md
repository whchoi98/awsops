# AWSops Dashboard

> AWS + Kubernetes 운영 대시보드 — Steampipe, Next.js, Amazon Bedrock AgentCore

**실시간 AWS/K8s 리소스 조회, 네트워크 트러블슈팅, CIS 컴플라이언스, AI 분석을 단일 대시보드에서 제공합니다.**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Internet                                        │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CloudFront (HTTPS)                                                          │
│  ┌─ Lambda@Edge (us-east-1) ─────────────────────────────────────────────┐  │
│  │  JWT 검증 → Cognito Hosted UI 리다이렉트 or pass through             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  /awsops*       → ALB:3000 (Dashboard)                                      │
│  /*             → ALB:80   (VSCode)                                         │
│  Security: X-Custom-Secret 헤더                                              │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ALB (Internet-facing) — SG: CloudFront Prefix List Only                     │
│  Port 80 → VSCode (8888)  |  Port 3000 → Dashboard (3000)                   │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EC2 (t4g.2xlarge, Private Subnet) — ★ 모든 서비스가 단일 인스턴스에서 실행   │
│                                                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │  Next.js :3000  │  │  Steampipe :9193 │  │  VSCode :8888             │  │
│  │  (21 Pages)     │──│  (내장 PostgreSQL)│  │  (code-server)            │  │
│  │  (5 APIs)       │  │  aws / k8s / trivy│  │                           │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────────────┘  │
│  ┌─────────────────┐  ┌──────────────────────────────────────────────────┐  │
│  │  Powerpipe      │  │  Docker: awsops-agent (Strands, arm64)          │  │
│  │  CIS Benchmark  │  │  → ECR → AgentCore Runtime                      │  │
│  └─────────────────┘  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard Pages (21)

| Category | Page | Path | Features |
|----------|------|------|----------|
| **Overview** | Dashboard | `/awsops` | Stats, Live Resources, Charts, Warnings |
| | AI Assistant | `/awsops/ai` | Claude Sonnet/Opus 4.6 + Code Interpreter |
| **Compute** | EC2 | `/awsops/ec2` | Instances + detail panel |
| | Lambda | `/awsops/lambda` | Functions, runtimes |
| | ECS | `/awsops/ecs` | Clusters, services, tasks |
| | EKS | `/awsops/k8s` | Nodes, pods, deployments |
| | EKS Explorer | `/awsops/k8s/explorer` | K9s-style terminal UI |
| **Network** | VPC/Network | `/awsops/vpc` | VPC, Subnet, SG, TGW, ELB, NAT, IGW |
| | Topology | `/awsops/topology` | Interactive resource graph (React Flow) |
| **Storage & DB** | S3 | `/awsops/s3` | Buckets, versioning, public access |
| | RDS | `/awsops/rds` | Instances, engines |
| | DynamoDB | `/awsops/dynamodb` | Tables |
| | ElastiCache | `/awsops/elasticache` | Redis/Memcached clusters |
| **Monitoring** | Monitoring | `/awsops/monitoring` | CPU, Memory, Network, Disk I/O |
| | CloudWatch | `/awsops/cloudwatch` | Alarms |
| | CloudTrail | `/awsops/cloudtrail` | Trails, events (read/write) |
| | Cost | `/awsops/cost` | Monthly/daily cost, service breakdown |
| **Security** | IAM | `/awsops/iam` | Users, roles, trust policies |
| | Security | `/awsops/security` | Public S3, Open SGs, Unencrypted EBS, CVE |
| | CIS Compliance | `/awsops/compliance` | CIS v1.5~v4.0 benchmarks (431 controls) |

---

## AI Assistant

4가지 라우팅으로 질문 유형에 따라 최적 경로를 자동 선택합니다.

```
사용자 질문
    │
    ├─ "코드 실행", "계산" ──────→ Bedrock + Code Interpreter (Python sandbox)
    │
    ├─ ENI, 라우트, flow log ───→ AgentCore Runtime (Strands)
    │                                → Gateway MCP (4 Lambda, 20 tools)
    │                                  ├─ Reachability Analyzer
    │                                  ├─ Flow Monitor
    │                                  ├─ Network MCP (TGW, NACL, ENI)
    │                                  └─ Steampipe Query
    │
    ├─ EC2, VPC, RDS, Cost ────→ Steampipe 실시간 쿼리 + Bedrock 분석
    │
    └─ 일반 질문 ──────────────→ AgentCore Runtime → Bedrock 폴백
```

### Models
- **Claude Sonnet 4.6** — 빠른 응답 (기본)
- **Claude Opus 4.6** — 심층 분석

### AgentCore Gateway MCP Tools (20개)

| Lambda Target | Tools |
|--------------|-------|
| **reachability-analyzer** | analyzeReachability, listInsightsPaths, listAnalyses |
| **flow-monitor** | listFlowLogs, queryFlowLogs, findEni, getSecurityGroupRules, getRouteTables, listVpnConnections |
| **network-mcp** | getPathTraceMethodology, getEniDetails, getTgwRoutes, getTgwAttachments, getSubnetNacls, getVpcConfig, listTransitGateways |
| **steampipe-query** | queryAWSResources (14종 사전정의 쿼리) |

---

## Data Flow

```
┌──────────┐     ┌─────────────────┐     ┌──────────────────────────────┐
│ Browser  │     │ Next.js :3000   │     │ Steampipe (내장 PostgreSQL)  │
│          │────▶│ POST /awsops/   │────▶│ :9193                        │
│ 21 Pages │     │  api/steampipe  │     │                              │
│ Charts   │     │ batchQuery()    │     │ ┌─ aws (380+ 테이블) ──→ AWS API
│ Tables   │◀────│ 3개씩 순차실행  │◀────│ ├─ k8s (60+ 테이블)  ──→ K8s API
│          │     │ 5분 TTL 캐시    │     │ └─ trivy             ──→ CVE DB
└──────────┘     └─────────────────┘     └──────────────────────────────┘
```

| 경로 | 데이터 소스 | 응답 시간 |
|------|-----------|----------|
| 대시보드 페이지 | Steampipe pg Pool → AWS API | ~2초 (캐시 시 즉시) |
| AI (AWS 리소스) | Steampipe + Bedrock Sonnet 4.6 | ~5초 |
| AI (네트워크 분석) | AgentCore → Gateway MCP → Lambda | ~30-60초 |
| AI (코드 실행) | Bedrock + Code Interpreter | ~10초 |
| CIS Compliance | Powerpipe → Steampipe → AWS API | ~3-5분 |
| Topology 그래프 | Steampipe → React Flow | ~2초 |

---

## AWS Services

| Service | Region | Purpose |
|---------|--------|---------|
| EC2 (t4g.2xlarge) | ap-northeast-2 | 전체 서비스 호스팅 |
| ALB | ap-northeast-2 | 로드밸런서 |
| CloudFront | Global | CDN + HTTPS |
| Cognito | ap-northeast-2 | 사용자 인증 |
| Lambda@Edge | us-east-1 | CloudFront 인증 |
| Lambda (x4) | ap-northeast-2 | 네트워크 분석 도구 |
| AgentCore Runtime | ap-northeast-2 | Strands AI Agent |
| AgentCore Gateway | ap-northeast-2 | MCP 도구 라우팅 |
| AgentCore Code Interpreter | ap-northeast-2 | Python Sandbox |
| ECR | ap-northeast-2 | Agent Docker 이미지 |
| Bedrock (Sonnet/Opus 4.6) | us-east-1 | AI 모델 |
| SSM | ap-northeast-2 | EC2 접근 |
| CloudFormation | ap-northeast-2 | 인프라 배포 |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, React Flow |
| Backend | Node.js 20, pg (PostgreSQL client) |
| Data | Steampipe (embedded PostgreSQL), Powerpipe |
| AI | Amazon Bedrock, AgentCore Runtime (Strands), AgentCore Gateway (MCP) |
| Auth | Amazon Cognito, Lambda@Edge |
| IaC | CloudFormation, CDK (infra-cdk/) |
| Container | Docker (arm64), ECR |

---

## Quick Start

### Prerequisites
- AWS Account (Admin access)
- EC2 Instance (Amazon Linux 2023, t4g.2xlarge+)
- AWS credentials configured
- kubectl + kubeconfig (for K8s features)

### Installation

```bash
# Step 0: Deploy EC2 infrastructure
export VSCODE_PASSWORD='YourPassword'
bash scripts/00-deploy-infra.sh

# SSM into the instance
aws ssm start-session --target <instance-id>

# Step 1-3: Install everything
bash scripts/install-all.sh

# Optional
bash scripts/04-setup-alb.sh          # ALB for dashboard
bash scripts/05-setup-cognito.sh      # Cognito auth
bash scripts/06-setup-agentcore.sh    # AI AgentCore
```

### Operations

```bash
bash scripts/07-start-all.sh    # Start + status + URLs
bash scripts/08-stop-all.sh     # Stop all
bash scripts/09-verify.sh       # 46-item health check
```

### CDK (Alternative)

```bash
cd infra-cdk && npm install
cdk bootstrap
cdk deploy AwsopsStack
cdk deploy AwsopsCognitoStack
```

---

## Project Structure

```
awsops/
├── src/
│   ├── app/                      # 21 pages + 5 API routes
│   ├── components/               # UI (Sidebar, Charts, Table, K9s)
│   ├── lib/steampipe.ts          # pg Pool (NOT CLI)
│   ├── lib/queries/              # SQL queries (13 files)
│   └── types/aws.ts
├── agent/                        # Strands Agent (Docker, arm64)
├── powerpipe/                    # CIS Benchmark mod
├── infra-cdk/                    # CDK (VPC, ALB, CF, Cognito, AgentCore)
├── scripts/                      # 11 install/ops scripts + ARCHITECTURE.md
├── docs/                         # Guides + Troubleshooting
├── .kiro/rules.md                # Kiro vibe-coding rules
└── .amazonq/rules.md             # Amazon Q rules
```

---

## Authentication

| Method | Component |
|--------|-----------|
| CloudFront → Lambda@Edge | JWT cookie (1h TTL) |
| Cognito Hosted UI | OAuth2 Authorization Code |
| ALB | X-Custom-Secret header |
| AgentCore Gateway | IAM Role |

---

## Known Issues & Solutions

자세한 내용은 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) 참조.

| Issue | Solution |
|-------|---------|
| SCP blocks IAM/Lambda hydrate | `ignore_error_codes` + 해당 컬럼 제거 |
| Steampipe CLI 느림 (4s/query) | pg Pool 사용 (0.006s/query) |
| basePath fetch 미적용 | 모든 fetch URL에 `/awsops` prefix |
| CloudTrail >60s timeout | 이벤트 탭 lazy-load |
| AgentCore arm64 only | `docker buildx --platform linux/arm64` |
| PostgreSQL 별도 설치? | 불필요 — Steampipe에 내장 |

---

## Documentation

- [ARCHITECTURE.md](scripts/ARCHITECTURE.md) — 전체 아키텍처 상세
- [INSTALL_GUIDE.md](docs/INSTALL_GUIDE.md) — 설치 가이드
- [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — 10가지 이슈 + 해결법
- [COMPARISON_VS_FAST.md](docs/COMPARISON_VS_FAST.md) — vs FAST 템플릿 비교

---

## License

Apache-2.0
