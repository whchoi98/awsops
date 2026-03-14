# AWSops Dashboard - Architecture

## 1. Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Internet                                           │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  CloudFront (HTTPS)                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐       │
│  │  Lambda@Edge (viewer-request)                                        │       │
│  │  ├─ JWT 토큰 검증 (awsops_token 쿠키)                                │       │
│  │  ├─ 토큰 없음 → Cognito Hosted UI로 302 리다이렉트                    │       │
│  │  └─ 토큰 유효 → Origin으로 통과                                      │       │
│  └──────────────────────────────────────────────────────────────────────┘       │
│                                                                                 │
│  Behaviors:                                                                     │
│    /awsops*         → ALB:3000 (AWSopsDashboardOrigin)                         │
│    /awsops/_next/*  → ALB:3000 (정적 리소스)                                    │
│    /*               → ALB:80   (VSCode, PublicALBOrigin)                        │
│                                                                                 │
│  Security: X-Custom-Secret 헤더 자동 주입                                       │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Application Load Balancer (Internet-facing)                                    │
│  Security Group: CloudFront Prefix List Only                                    │
│                                                                                 │
│  Listeners:                                                                     │
│    Port 80   → VSCode (8888)   [X-Custom-Secret 검증]                          │
│    Port 3000 → Dashboard (3000) [X-Custom-Secret 검증]                          │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EC2 Instance (t4g.2xlarge, Private Subnet)                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  ★ 모든 서비스가 이 단일 인스턴스에서 실행                               │   │
│  │                                                                         │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐    │   │
│  │  │  Next.js :3000   │  │ VSCode :8888     │  │ Steampipe :9193   │    │   │
│  │  │  (Dashboard)     │  │ (Code Editor)    │  │ (내장 PostgreSQL) │    │   │
│  │  └────────┬─────────┘  └──────────────────┘  └────────┬──────────┘    │   │
│  │           │                                            │               │   │
│  │           │         pg Pool (0.006s/query)             │               │   │
│  │           └────────────────────────────────────────────┘               │   │
│  │                                                                         │   │
│  │  ┌──────────────────┐  ┌──────────────────────────────────────────┐    │   │
│  │  │ Powerpipe (CLI)  │  │ Docker                                   │    │   │
│  │  │ CIS Benchmark    │  │ └─ awsops-agent (Strands, arm64)        │    │   │
│  │  └──────────────────┘  └──────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Flow

```
Browser                    CloudFront              Lambda@Edge            Cognito
  │                            │                       │                     │
  ├── GET /awsops ────────────▶│                       │                     │
  │                            ├── viewer-request ────▶│                     │
  │                            │                       ├── 쿠키 확인         │
  │                            │                       │   (awsops_token)    │
  │                            │                       │                     │
  │   [토큰 없음]              │◀── 302 Redirect ──────┤                     │
  │◀── 302 ───────────────────┤                       │                     │
  │                            │                       │                     │
  ├── Cognito Login Page ─────────────────────────────────────────────────▶│
  │◀── Login Form ──────────────────────────────────────────────────────── │
  ├── ID/PW 입력 ──────────────────────────────────────────────────────── ▶│
  │◀── 302 + code ──────────────────────────────────────────────────────── │
  │                            │                       │                     │
  ├── GET /awsops/_callback ──▶│                       │                     │
  │                            ├── viewer-request ────▶│                     │
  │                            │                       ├── code → token 교환 │
  │                            │                       │   (oauth2/token)    │
  │                            │                       │                     │
  │◀── 302 + Set-Cookie ──────┤◀── Set awsops_token ──┤                     │
  │   (awsops_token, 1h TTL)  │                       │                     │
  │                            │                       │                     │
  ├── GET /awsops ────────────▶│                       │                     │
  │                            ├── viewer-request ────▶│                     │
  │                            │                       ├── 토큰 유효 ✓       │
  │                            │                       │                     │
  │◀── Dashboard HTML ────────┤◀── pass through ──────┤                     │
```

---

## 3. Data Flow (Dashboard)

```
┌──────────┐     ┌─────────────────┐     ┌──────────────────────────────────────┐
│ Browser  │     │ Next.js :3000   │     │ Steampipe (내장 PostgreSQL :9193)    │
│          │     │                 │     │                                      │
│ Dashboard├────▶│ POST /awsops/   │     │  ┌─────────────────────────────┐    │
│ Pages    │     │  api/steampipe  │────▶│  │ aws plugin                  │    │
│          │     │                 │     │  │  ├─ aws_ec2_instance        │───▶ AWS API
│ Charts   │     │ batchQuery()    │     │  │  ├─ aws_vpc                 │
│ Tables   │     │  5개씩 순차실행 │     │  │  ├─ aws_s3_bucket           │
│          │     │  pg Pool max:5  │     │  │  ├─ aws_rds_db_instance     │
│          │◀────│                 │◀────│  │  ├─ aws_lambda_function     │
│          │     │ 5분 TTL 캐시    │     │  │  ├─ aws_iam_user/role       │
│          │     │ (node-cache)    │     │  │  ├─ aws_cloudwatch_alarm    │
└──────────┘     └─────────────────┘     │  │  ├─ aws_cost_by_service_*   │
                                         │  │  └─ ... (380+ 테이블)       │
                                         │  │                             │
                                         │  ├─ kubernetes plugin          │
                                         │  │  ├─ kubernetes_pod          │───▶ K8s API
                                         │  │  ├─ kubernetes_node         │
                                         │  │  ├─ kubernetes_deployment   │
                                         │  │  └─ ... (60+ 테이블)       │
                                         │  │                             │
                                         │  └─ trivy plugin              │
                                         │     └─ trivy_scan_vulnerability│───▶ CVE DB
                                         └──────────────────────────────────────┘
```

---

## 4. AI Assistant Flow (10-Route Priority)
## 4. AI 어시스턴트 흐름 (10단계 라우팅 우선순위)

```
Browser (/awsops/ai)
    │
    ├── 사용자 질문 입력
    │
    ▼
Next.js API (/awsops/api/ai)  ── route.ts 키워드 분석 (10-route priority)
    │
    │  ┌──────────────────────────────────────────────────────────────────────┐
    │  │  라우팅 우선순위 / Route Priority                                     │
    │  │                                                                      │
    │  │   1. Code 실행 키워드 ──────────────────→ Code Interpreter           │
    │  │   2. Network 키워드 (ENI, flow log..) ─→ AgentCore → Network GW(17) │
    │  │   3. Container 키워드 (EKS, ECS...) ──→ AgentCore → Container GW(24)│
    │  │   4. IaC 키워드 (CDK, CFn, TF...) ────→ AgentCore → IaC GW (12)    │
    │  │   5. Data 키워드 (DynamoDB, RDS...) ──→ AgentCore → Data GW (24)    │
    │  │   6. Security 키워드 (IAM, policy..) ─→ AgentCore → Security GW(14) │
    │  │   7. Monitoring 키워드 (CW, trail..) ─→ AgentCore → Monitoring GW(16)│
    │  │   8. Cost 키워드 (billing, budget..) ─→ AgentCore → Cost GW (9)     │
    │  │   9. AWS 리소스 키워드 (EC2, S3...) ──→ Steampipe + Bedrock Direct  │
    │  │  10. 일반 질문 ────────────────────────→ AgentCore → Ops GW (9)     │
    │  │                                           (폴백 → Bedrock Direct)    │
    │  └──────────────────────────────────────────────────────────────────────┘
    │
    │  [Routes 2-8, 10] AgentCore Runtime (서울)
    │                   ┌───────────────────────────────────┐
    │                   │ Strands Agent (arm64)              │
    │                   │ + Bedrock Sonnet/Opus 4.6         │
    │                   └──────────────┬────────────────────┘
    │                                  │ gateway 파라미터로 라우팅
    │                                  ▼
    │                   8 역할 기반 AgentCore Gateways (서울)
    │                   8 Role-based AgentCore Gateways (Seoul)
    │                   ┌───────────────────────────────────┐
    │                   │                                   │
    │                   │  Network GW ─── 17 tools ─┐      │
    │                   │  Container GW ─ 24 tools ─┤      │
    │                   │  IaC GW ─────── 12 tools ─┤      │
    │                   │  Data GW ────── 24 tools ─┤ 19   │
    │                   │  Security GW ── 14 tools ─┤ Lambda│
    │                   │  Monitoring GW─ 16 tools ─┤      │
    │                   │  Cost GW ────── 9 tools ──┤      │
    │                   │  Ops GW ─────── 9 tools ──┘      │
    │                   │                                   │
    │                   │  합계: 125 MCP 도구               │
    │                   │  Total: 125 MCP tools             │
    │                   └───────────────────────────────────┘
    │
    │  [Route 8] Steampipe 실시간 쿼리
    │            ┌──────────────────────┐
    │            │ 자동 키워드 감지     │
    │            │ → SQL 생성 → 실행    │
    │            │ → 결과를 Claude에     │
    │            │   컨텍스트로 전달     │
    │            └──────────┬───────────┘
    │                       ▼
    │            Bedrock Sonnet/Opus 4.6
    │            (us-east-1)
    │            ┌──────────────────────┐
    │            │ 실제 데이터 기반     │
    │            │ 분석 응답 생성       │
    │            └──────────────────────┘
    │
    └── [폴백] ─── Bedrock Direct (AgentCore 실패 시)
```

---

## 5. CIS Compliance Flow

```
Browser (/awsops/compliance)
    │
    ├── "Run Benchmark" 클릭
    │
    ▼
Next.js API (/awsops/api/benchmark)
    │
    ├── POST ?action=run
    │
    ▼
Powerpipe CLI (백그라운드 실행)
    │
    ├── powerpipe benchmark run aws_compliance.benchmark.cis_v300
    │     --database postgres://steampipe:***@127.0.0.1:9193/steampipe
    │     --output json
    │
    ├── Steampipe PostgreSQL을 통해 AWS API 호출
    │   (IAM, S3, CloudTrail, VPC, EC2 등 380+ 컨트롤 체크)
    │
    ├── 결과 JSON → /tmp/powerpipe-results/cis_v300.json
    │
    ▼
Browser (5초 폴링)
    │
    ├── GET ?action=status  → "running" / "done"
    ├── GET ?action=result  → JSON 결과
    │
    ▼
Dashboard 렌더링
    ├── Pass Rate, OK/ALARM/SKIP/ERROR 통계
    ├── 섹션별 카드 + 진행률 바
    ├── 컨트롤 목록 (OK/ALARM 아이콘)
    └── 컨트롤 상세 패널 (Status, Reason, Resource)
```

---

## 6. Network Topology Flow

```
Browser (/awsops/topology)
    │
    ▼
Next.js API → Steampipe 쿼리
    │
    ├── VPC + Subnet 관계
    ├── EC2 → Subnet 매핑
    ├── ELB → VPC 매핑
    ├── RDS → VPC 매핑
    ├── NAT/IGW → VPC 매핑
    ├── TGW → VPC Attachments
    └── K8s Node → Pod 매핑
    │
    ▼
React Flow (인터랙티브 그래프)
    │
    ├── Infrastructure 뷰:
    │   IGW ──▶ VPC ──▶ Subnet ──▶ EC2
    │                      │          │
    │                     NAT        ELB
    │                                 │
    │   TGW ──▶ VPC (Cross-VPC)     RDS
    │
    └── Kubernetes 뷰:
        Node ──▶ Pod ──▶ Pod ──▶ Pod
```

---

## 7. Deployment Architecture (CDK)

```
IaC: infra-cdk/lib/awsops-stack.ts (CDK TypeScript)
Deploy: bash scripts/00-deploy-infra.sh

┌─────────────────────────────────────────────────────────┐
│  VPC (10.254.0.0/16)                                    │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐     │
│  │ Public Subnet A     │  │ Public Subnet B     │     │
│  │                     │  │                     │     │
│  │  ┌───────────────┐  │  │                     │     │
│  │  │ NAT Gateway   │  │  │                     │     │
│  │  └───────────────┘  │  │                     │     │
│  │  ┌───────────────────────────────────┐       │     │
│  │  │ ALB (Internet-facing)             │       │     │
│  │  │  Port 80   → VSCode (8888)       │       │     │
│  │  │  Port 3000 → Dashboard (3000)    │       │     │
│  │  │  SG: CloudFront Prefix List      │       │     │
│  │  │      Port range 80-3000 (※1)     │       │     │
│  │  └───────────────────────────────────┘       │     │
│  └─────────────────────┘  └─────────────────────┘     │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐     │
│  │ Private Subnet A    │  │ Private Subnet B    │     │
│  │                     │  │                     │     │
│  │  ┌───────────────┐  │  │                     │     │
│  │  │ EC2           │  │  │                     │     │
│  │  │ t4g.2xlarge   │  │  │                     │     │
│  │  │ (ARM64)       │  │  │                     │     │
│  │  │               │  │  │                     │     │
│  │  │ ┌───────────┐ │  │  │ SSM VPC Endpoints   │     │
│  │  │ │ Next.js   │ │  │  │ ┌─────────────────┐ │     │
│  │  │ │ Steampipe │ │  │  │ │ ssm             │ │     │
│  │  │ │ Powerpipe │ │  │  │ │ ssmmessages     │ │     │
│  │  │ │ VSCode    │ │  │  │ │ ec2messages     │ │     │
│  │  │ │ Docker    │ │  │  │ └─────────────────┘ │     │
│  │  │ └───────────┘ │  │  │                     │     │
│  │  └───────────────┘  │  │                     │     │
│  └─────────────────────┘  └─────────────────────┘     │
│                                                         │
│  Route Tables:                                          │
│    Public  → IGW (0.0.0.0/0)                           │
│    Private → NAT GW (0.0.0.0/0)                        │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    CloudFront → ALB → EC2
    (HTTPS)     (HTTP)  (Private)

  ※1 SG 규칙 한도: CloudFront prefix list에 120+ IP가 있어
      포트별 개별 규칙 대신 포트 범위(80-3000)로 통합.
      CachePolicy: 관리형 CACHING_DISABLED 사용
      (커스텀 TTL=0 + HeaderBehavior 조합은 CloudFront에서 거부)

CDK Stacks:
  AwsopsStack         → VPC, EC2, ALB, CloudFront (ap-northeast-2)
  AwsopsCognitoStack  → User Pool, Lambda@Edge   (us-east-1)
  AwsopsAgentCoreStack → Placeholder (스크립트로 배포)
```

---

## 8. Installation Flow

```
Step 0: CDK 인프라 배포 (로컬)           ← 00-deploy-infra.sh
  │     ├─ cdk bootstrap (ap-northeast-2 + us-east-1)
  │     ├─ cdk deploy AwsopsStack
  │     └─ VPC, EC2, ALB, CloudFront, SSM Endpoints
  │     기본: t4g.2xlarge (ARM64 Graviton)
  │
  ├── SSM 접속
  │     aws ssm start-session --target <instance-id>
  │
  ▼
Step 1: Steampipe + Powerpipe 설치       ← 01-install-base.sh
  │     ├─ steampipe + plugins (aws, k8s, trivy)
  │     ├─ aws.spc (ignore_error_codes for SCP)
  │     └─ powerpipe + CIS benchmark mod
  │
  ▼
Step 2: Next.js + Steampipe 서비스       ← 02-setup-nextjs.sh
  │     ├─ npm install
  │     ├─ steampipe service start (내장 PostgreSQL :9193)
  │     └─ steampipe.ts password 동기화
  │
  ▼
Step 3: Build + Deploy                   ← 03-build-deploy.sh
  │     ├─ Pre-build 검증 (basePath, fetch URLs, eslint)
  │     ├─ npm run build (production)
  │     └─ npm run start (port 3000)
  │
  ▼
Step 9: 검증 (46항목)                    ← 10-verify.sh
  │     ├─ Services (2)
  │     ├─ Queries (18 테이블)
  │     ├─ Pages (20 페이지)
  │     ├─ APIs (3 엔드포인트)
  │     └─ Configuration (4 설정)
  │
  ────── 대시보드 기본 동작 완료 ──────
  │
  ▼
Step 5: Cognito 인증                     ← 05-setup-cognito.sh
  │     ├─ User Pool + Domain + App Client
  │     ├─ Admin 사용자 생성 (email format, symbols 불필요)
  │     └─ Lambda@Edge (us-east-1, Python 3.12)
  │
  ▼
Step 6: AgentCore AI                     ← 06-setup-agentcore.sh (래퍼)
  │                                         또는 개별 실행:
  │
  ├─ Step 6a: Runtime                    ← 06a-setup-agentcore-runtime.sh
  │     ├─ IAM Role (AWSopsAgentCoreRole)
  │     ├─ ECR Repository (awsops-agent)
  │     ├─ Docker image (arm64, docker buildx)
  │     ├─ AgentCore Runtime (Strands Agent)
  │     └─ Runtime Endpoint
  │
  ├─ Step 6b: 8 Gateways                ← 06b-setup-agentcore-gateway.sh
  │     ├─ 8개 역할 기반 AgentCore Gateways (MCP 프로토콜, NONE 인증)
  │     │   (8 role-based AgentCore Gateways, MCP protocol, NONE auth)
  │     │   ├─ awsops-network-gateway    (VPC, TGW, VPN, ENI, Flow Logs)
  │     │   ├─ awsops-container-gateway  (EKS, ECS, Istio)
  │     │   ├─ awsops-iac-gateway        (CDK, CFn, Terraform)
  │     │   ├─ awsops-data-gateway       (DynamoDB, RDS, ElastiCache, MSK)
  │     │   ├─ awsops-security-gateway   (IAM, policy simulation)
  │     │   ├─ awsops-monitoring-gateway (CloudWatch, CloudTrail)
  │     │   ├─ awsops-cost-gateway       (Cost Explorer, budgets)
  │     │   └─ awsops-ops-gateway        (일반 운영 / general operations)
  │     └─ route.ts gateway 파라미터로 선택
  │
  ├─ Step 6c: Tools & MCP               ← 06c-setup-agentcore-tools.sh
  │     ├─ IAM Role (AWSopsLambdaNetworkRole)
  │     ├─ Lambda Functions (19개)
  │     │   ├─ Network: reachability-analyzer, flow-monitor, network-mcp
  │     │   ├─ Data: dynamodb-mcp, rds-mcp, elasticache-mcp, msk-mcp
  │     │   ├─ Security: iam-analyzer, policy-simulator
  │     │   ├─ Monitoring: cloudwatch-mcp, cloudtrail-mcp
  │     │   ├─ Cost: cost-explorer-mcp
  │     │   ├─ IaC: cdk-mcp, cfn-mcp, terraform-mcp
  │     │   ├─ Ops: steampipe-query, istio-mcp, eks-mcp
  │     │   └─ (VPC Lambda: steampipe-query uses SG for DB access)
  │     └─ Gateway Targets (create_targets.py, boto3)
  │         ├─ 8개 Gateway에 걸쳐 125개 MCP 도구
  │         │   (125 MCP tools across 8 Gateways)
  │         ├─ targetConfiguration: mcp.lambda (※2)
  │         └─ credentialProviderConfigurations: GATEWAY_IAM_ROLE
  │
  └─ Step 6d: Code Interpreter           ← 06d-setup-agentcore-interpreter.sh
        └─ Code Interpreter (awsops_code_interpreter)
            ├─ 이름: 언더스코어만 허용 ([a-zA-Z][a-zA-Z0-9_])
            └─ networkConfiguration: {"networkMode":"PUBLIC"}
  │
  ▼
Step 7: CloudFront Lambda@Edge 연동      ← 07-setup-cloudfront-auth.sh
        ├─ CloudFront distribution 자동 감지
        ├─ Lambda@Edge ARN 자동 감지 (최신 published version)
        ├─ /awsops* behavior에 viewer-request 연결
        └─ 배포 대기 + 302 리다이렉트 검증

  ※2 Gateway Target API 주의사항:
      - CLI가 아닌 Python/boto3 사용 (CLI는 inlinePayload 이슈)
      - targetConfiguration.mcp.lambda.toolSchema.inlinePayload 구조
      - inlinePayload: [{name, description, inputSchema: {type, properties, required}}]
      - credentialProviderConfigurations 필수
```

---

## 9. Port Map

| Port | Service | Access |
|------|---------|--------|
| 3000 | Next.js Dashboard | ALB → CloudFront |
| 8888 | VSCode Server | ALB → CloudFront |
| 9193 | Steampipe PostgreSQL | localhost only |

---

## 10. AWS Services Used

| Service | Region | Purpose | Deployed By |
|---------|--------|---------|-------------|
| CloudFormation / CDK | ap-northeast-2 | 인프라 배포 (AwsopsStack) | Step 0 |
| EC2 (t4g.2xlarge) | ap-northeast-2 | 전체 서비스 호스팅 | Step 0 (CDK) |
| ALB | ap-northeast-2 | 로드밸런서 (SG: CF prefix list, port 80-3000) | Step 0 (CDK) |
| CloudFront | Global | CDN + HTTPS + CACHING_DISABLED | Step 0 (CDK) |
| Cognito User Pool | ap-northeast-2 | 사용자 인증 (OAuth2 code flow) | Step 5 |
| Lambda@Edge | us-east-1 | CloudFront 인증 (Python 3.12) | Step 5 → Step 7 |
| AgentCore Runtime | ap-northeast-2 | Strands AI Agent (arm64 container) | Step 6a |
| AgentCore Gateway (8개) | ap-northeast-2 | 8개 역할 기반 Gateway (Network/Container/IaC/Data/Security/Monitoring/Cost/Ops) | Step 6b |
| Lambda (19개) | ap-northeast-2 | MCP 도구: Network, DynamoDB, RDS, ElastiCache, MSK, IAM, CloudWatch, CloudTrail, Cost, CDK, CFn, Terraform, Steampipe, Istio, EKS | Step 6c |
| AgentCore Code Interpreter | ap-northeast-2 | Python 코드 실행 샌드박스 | Step 6d |
| ECR | ap-northeast-2 | Agent Docker 이미지 (arm64) | Step 6a |
| Bedrock (Sonnet/Opus 4.6) | us-east-1 | AI 모델 (cross-region) | Step 6a |
| SSM + VPC Endpoints | ap-northeast-2 | EC2 프라이빗 접근 | Step 0 (CDK) |
| IAM | Global | 권한 관리 (3 roles) | Step 0, 5, 6a, 6c |

### IAM Roles

| Role | Created By | Purpose |
|------|-----------|---------|
| AwsopsStack-EC2Role | CDK (Step 0) | EC2 인스턴스 (SSM + CloudWatch) |
| AWSopsAgentCoreRole | Step 6a | AgentCore Runtime (Bedrock + ECR + Lambda) |
| AWSopsLambdaNetworkRole | Step 6c | Lambda 함수 (EC2/VPC/Logs 네트워크 권한) |
| AWSopsLambdaEdgeRole | Step 5 | Lambda@Edge (CloudFront 인증) |
