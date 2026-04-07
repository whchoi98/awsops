# Changelog

[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#한국어)

---

# English

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- External datasource integration with 7 observability platforms: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog ([#10](https://github.com/whchoi98/awsops/pull/10))
- Datasource management page (`/datasources`) with CRUD, connection test, and auth configuration
- Datasource Explore page (`/datasources/explore`) with direct query execution and AI query generation (natural language to PromQL/LogQL/TraceQL/SQL)
- Multi-datasource AI correlation: cross-analyze external metrics with AWS resources via `datasource` route
- AI routing expanded from 10 to 11 routes (added `datasource` route for external platform queries)
- SSRF protection with allowlist-based private network access and defense-in-depth URL validation
- Converse Stream API for multi-route synthesis with real-time SSE streaming
- Typing effect simulation for AgentCore gateway responses
- Automatic zombie PostgreSQL connection cleanup (queries running longer than 5 minutes)

### Fixed

- Exclude Steampipe internal FDW connections (`client_addr IS NULL`) from zombie cleanup
- Remove monitoring queries from cache warmer to prevent pg pool exhaustion from slow CloudWatch FDW calls
- Add time range filters to all monitoring metric queries to prevent unbounded query execution
- Prevent AI chat bubble width jump during SSE streaming ([#8](https://github.com/whchoi98/awsops/pull/8))

### Security

- SSRF defense in depth: URL validation in `datasource-client.ts` protects all outbound fetch paths including AI route
- Admin-only access enforced on datasource query and AI query generation actions
- IPv6 private/link-local address detection added (`fc00::/7`, `fe80::/10`)
- Regex capture groups for safe Tempo/Jaeger trace ID URL insertion

## [1.7.0] - 2026-03-24

### Added

- Multi-account support with Steampipe Aggregator pattern (`aws` = all accounts, `aws_{id}` = single account)
- Account management page (`/accounts`) with add/remove/test functionality (admin-only via `adminEmails` config)
- `AccountSelector` dropdown and `AccountBadge` component for per-account navigation
- `buildSearchPath(accountId)` for per-account query scoping and `runCostQueriesPerAccount()` for cost data merging
- `account_id` column added to all 25 SQL query files for multi-account filtering
- Cross-account IAM role setup script (`scripts/11-setup-multi-account.sh`)
- Real-time Bedrock streaming via `InvokeModelWithResponseStreamCommand` with SSE chunk events
- Background cache pre-warming (`cache-warmer.ts`) for dashboard queries on 4-minute interval
- Cache warmer status bar displayed on dashboard, monitoring, and AgentCore pages
- Configurable customer logo in sidebar (`customerLogo`, `customerName`, `customerLogoBg` in config)

### Changed

- All 35 pages integrated with `useAccountContext()` for multi-account awareness
- DataTable auto-adds Account column when multi-account data detected
- Cache key format changed to `sp:{accountId}:{sql}` for per-account cache isolation
- Config `accounts[]` array manages accounts without code changes
- Deployment scripts expanded to 11 steps (Step 11: multi-account setup)

### Fixed

- Pool exhaustion prevention with `RESET search_path` failure handling and connection destruction

### Security

- **CRITICAL**: AssumeRole audit logging with structured JSON for CloudWatch tracking
- **CRITICAL**: ExternalId required for cross-account AssumeRole (Confused Deputy prevention)
- **HIGH**: Admin endpoint rate limiting (5 req/min/user, HTTP 429)
- **HIGH**: Alias/Region input validation (64-char limit, regex pattern)
- **HIGH**: Replace `execSync` with `execFileSync` to prevent shell injection ([#6](https://github.com/whchoi98/awsops/pull/6))

## [1.6.0] - 2026-03-21

### Added

- i18n support with Korean/English language toggle (React Context + localStorage)
- 500+ translation keys in `translations/en.json` and `ko.json`
- AI responses follow language setting (English or Korean output)
- Bedrock monitoring page (`/bedrock`) with per-model usage dashboard (CloudWatch + AWSops token tracking)
- Account Total vs AWSops usage comparison charts
- Token cost display in AI chat (input/output tokens, USD cost)
- ECS container cost page (`/container-cost`) with Fargate pricing and Container Insights metrics
- EKS container cost page (`/eks-container-cost`) with OpenCost API and request-based fallback
- OpenCost installation script (`06f-setup-opencost.sh`) for Prometheus + OpenCost on EKS
- AgentCore Memory Store for conversation history persistence (365-day retention, per-user isolation)
- Conversation history toggle panel at bottom of AI Assistant page

### Changed

- Default Bedrock dashboard time range from 24 hours to 7 days
- Cross-region model IDs added to Bedrock pricing map

## [1.5.2] - 2026-03-15

### Added

- EBS page (`/ebs`) with volumes, snapshots, encryption status, EC2 attachment mapping, idle volume detection
- MSK page (`/msk`) with Kafka clusters, broker node metrics table (CPU/Memory/Network), KRaft controllers
- OpenSearch page (`/opensearch`) with domains, encryption (N2N/At-Rest), VPC config, cluster metrics
- Resource Inventory page (`/inventory`) with 18 resource count trends, multi-line chart, cost impact estimation ([#1](https://github.com/whchoi98/awsops/pull/1))
- CloudWatch metrics tables for MSK, RDS, ElastiCache, and OpenSearch (progress bars + metric values)
- Valkey engine support in ElastiCache with color-coded engine badges
- Cost Explorer MSP/Direct Payer auto-detection at install time
- Cost snapshot fallback showing last known data on query failure
- AgentCore config externalized to `data/config.json` (no hardcoded account ARNs)
- MCP tool usage inference from response keywords displayed as badges in AI chat
- AgentCore Memory with auto-save (question/summary/route/tools/response time per conversation)

### Changed

- Dashboard cards expanded with EBS, MSK, OpenSearch in Network & Storage row
- Pool max connections increased from 3 to 5, batch size from 3 to 5
- Multi-route fallback to Bedrock Direct added, timeout increased from 60s to 90s
- Sign Out moved from Header to Sidebar (next to logo)

### Fixed

- HttpOnly cookie sign-out via server-side API (`POST /api/auth`) instead of client-side deletion

## [1.4.0] - 2026-03-13

### Added

- Multi-route AI classification: 1-3 gateways called in parallel with Bedrock response synthesis
- AgentCore dashboard page (`/agentcore`) with Runtime status, 8 Gateway cards, 125 tool inventory
- AgentCore status API (`/api/agentcore`) for Runtime/Gateway state queries
- CloudFront page (`/cloudfront-cdn`) with distributions, origins, aliases, WAF, protocol settings
- WAF page (`/waf`) with Web ACL list, rules, IP sets
- ECR page (`/ecr`) with repositories, scan config, encryption, tag mutability
- Sign Out button in Header with cookie deletion and Cognito re-authentication
- S3 Bucket TreeMap visualization by region with Public/Versioned/Standard color coding
- S3 IAM Roles section showing roles with S3 access
- RDS Security Groups with inbound rules and chained resource display
- RDS CloudWatch metrics: CPU, Memory, Connections, IOPS, Storage mini-charts
- ElastiCache Security Groups and CloudWatch metrics
- Monitoring instance detail view with full-screen metrics and date range filter (1h/6h/24h/7d/30d)
- Resource Topology redesign: Infrastructure Graph/Map views + Kubernetes 4-column resource map
- VPC Resource Map with AWS Console-style 4-column layout and click highlight
- EKS node cards with CPU/Memory progress bars and ENI detail view
- Cost Explorer period filter, service filter, projected monthly cost, and MoM change

### Changed

- Dashboard layout redesigned to 18 cards (6x3) with 1:1 sidebar mapping
- CIS Compliance updated to v4.0.0 baseline
- AI Assistant header styled to match EC2/VPC pages with ONLINE badge

### Fixed

- PieChart/BarChart Steampipe bigint string to `Number()` conversion across 8 pages
- Cost query `COALESCE(unblended, blended, 0)` for accounts with null blended_cost
- Multi-route build TypeScript implicit any type errors

## [1.3.0] - 2026-03-12

### Added

- 18 dashboard StatsCards (6x3 layout) with 1:1 sidebar menu mapping and sub-metrics
- CIS Compliance pass rate display with alarm/skip/error breakdown
- Monthly Cost sub-metrics: daily average, last month comparison, MoM change
- SSE streaming in AI Assistant with real-time progress indicators
- Response time display, clipboard copy, and follow-up question suggestions in AI chat
- EC2 memory/network info via `aws_ec2_instance_type` JOIN
- Multi-filter support in EC2: text search + State + Instance Type + VPC dropdown
- K8s Overview node cards with CPU/Memory usage progress bars
- K8s node detail view with ENI cards, per-ENI traffic, and Pods table
- EKS Explorer: Status/Node filters, pagination (25/50/100/200), cluster selector
- Route Table tab in VPC with associations, routes, and target/state details
- TGW Route Tables and Attachment detail views

### Changed

- Sidebar font size increased (`text-sm` to `text-[15px]`), icon size 16px to 18px
- StatsCard auto-shrink for long values, unified `h-full` card height

### Fixed

- RDS/ElastiCache metric chart overlap resolved with direct Recharts rendering
- Monitoring EC2 detail chart sizing with dedicated Recharts components
- K8s `parseMiB` const hoisting issue resolved by moving function outside component
- AgentCore `bedrock-agentcore:*` permission and `<tool_call>` tag cleanup
- Bedrock region changed from us-east-1 to ap-northeast-2 (global.* inference)
- Cognito custom domain `SupportedIdentityProviders` and callback URL path fixes

## [1.2.0] - 2026-03-11

### Added

- Network Gateway (17 tools) split from Infra Gateway for VPC, TGW, VPN, ENI, Firewall, Reachability, Flow Logs
- Container Gateway (24 tools) split from Infra Gateway for EKS, ECS, Istio
- AI test script `scripts/test-ai-routes.py` with interactive menu, 104 questions, 9 categories, content validation
- Test guide `docs/AI_TEST_GUIDE.md` with usage, output interpretation, and troubleshooting

### Changed

- **BREAKING:** Infra Gateway (41 tools) split into Network (17) + Container (24) for 54% faster container responses
- Gateway count increased from 7 to 8, route count from 9 to 10
- Bedrock region changed to ap-northeast-2 with global.* inference profile for ~20% latency reduction
- Benchmark route Steampipe password changed from hardcoded to dynamic lookup

### Fixed

- AgentCore permission failure with missing `bedrock-agentcore:*` in IAM role
- EKS access entry `arn:aws:sts::` to `arn:aws:iam::` format conversion
- K8s PVC `capacity`/`access_modes` JSONB serialization error with `::text` casting
- AgentCore response `<tool_call>` tag exposure cleaned with regex removal
- Cognito custom domain `SupportedIdentityProviders` and callback URL path

## [1.1.0] - 2026-03-07

### Added

- 7 role-based AgentCore Gateways replacing single gateway (Network/IaC/Data/Security/Monitoring/Cost/Ops)
- 19 Lambda functions as MCP tool targets with 125 total tools
- Dynamic gateway routing via `payload.gateway` parameter in `agent.py`
- 9-route priority keyword-based routing in `route.ts`
- Role-specific system prompts for each gateway specialist
- `create_targets.py` script for automated Gateway Target creation
- All 16 Lambda source files version controlled under `agent/lambda/`

### Changed

- **BREAKING:** Single gateway (29 tools) replaced with 7 specialized gateways (125 tools) for improved tool selection accuracy
- `network-mcp` rewritten from 1 tool (693B) to 15 tools (17KB)
- `steampipe-query` upgraded from boto3 keyword fallback to real SQL via pg8000
- Legacy gateway (`awsops-gateway-g0ihtogknw`) removed

## [1.0.1] - 2026-03-07

### Added

- CDK infrastructure stack (`awsops-stack.ts`) with VPC, EC2, ALB, CloudFront
- Cognito User Pool with OAuth2 Authorization Code flow
- Lambda@Edge (Python 3.12, us-east-1) for CloudFront JWT authentication
- AgentCore Runtime with Strands agent (arm64 Docker, ECR)
- AgentCore Gateway with MCP protocol and Code Interpreter
- 4 sub-step AgentCore scripts: Runtime (6a), Gateway (6b), Tools (6c), Interpreter (6d)
- Claude Code project scaffolding with auto-sync hooks and module documentation
- Git commit-msg hook to auto-strip Co-Authored-By lines

### Fixed

- CloudFront CachePolicy TTL=0 rejection resolved with managed `CACHING_DISABLED`
- ALB Security Group rules limit with CloudFront prefix list 120+ IPs consolidated to port range
- EC2 UserData Steampipe installation running as root instead of ec2-user
- Steampipe listen mode changed from `local` to `network` for VPC Lambda access
- Gateway Target API structure corrected to `mcp.lambda` with `credentialProviderConfigurations`
- Code Interpreter naming restriction: hyphens changed to underscores
- psycopg2 Lambda incompatibility resolved by switching to pg8000

## [1.0.0] - 2026-03-07

### Added

- AWSops Dashboard with 21 pages and 5 API routes
- Next.js 14 (App Router) with Tailwind CSS dark navy theme
- Steampipe embedded PostgreSQL integration (380+ AWS tables, 60+ K8s tables)
- Recharts metrics visualization and React Flow network topology
- Powerpipe CIS v1.5~v4.0 benchmarks
- AI routing: Code Interpreter, AgentCore, Steampipe+Bedrock, Bedrock Direct
- Bedrock Claude Sonnet/Opus 4.6 integration

[Unreleased]: https://github.com/whchoi98/awsops/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/whchoi98/awsops/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/whchoi98/awsops/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/whchoi98/awsops/compare/v1.4.0...v1.5.2
[1.4.0]: https://github.com/whchoi98/awsops/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/whchoi98/awsops/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/whchoi98/awsops/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/awsops/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/whchoi98/awsops/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/whchoi98/awsops/releases/tag/v1.0.0

---

# 한국어

이 프로젝트의 모든 주요 변경 사항은 이 파일에 기록됩니다.
이 문서는 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 기반으로 하며,
[Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 따릅니다.

## [Unreleased]

### Added

- 7종 외부 관측성 플랫폼 연동: Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog ([#10](https://github.com/whchoi98/awsops/pull/10))
- 데이터소스 관리 페이지(`/datasources`) — CRUD, 연결 테스트, 인증 설정
- 데이터소스 Explore 페이지(`/datasources/explore`) — 직접 쿼리 실행 + AI 쿼리 생성 (자연어 → PromQL/LogQL/TraceQL/SQL)
- 멀티 데이터소스 AI 상관 분석: `datasource` 라우트로 외부 메트릭과 AWS 리소스 교차 분석
- AI 라우팅 10개 → 11개로 확장 (외부 플랫폼 쿼리용 `datasource` 라우트 추가)
- SSRF 방지: allowlist 기반 사설 네트워크 접근 제어 + 심층 방어 URL 검증
- 멀티 라우트 합성에 Converse Stream API 적용 (실시간 SSE 스트리밍)
- AgentCore 게이트웨이 응답에 타이핑 효과 시뮬레이션 추가
- 좀비 PostgreSQL 연결 자동 정리 (5분 이상 실행 쿼리 종료)

### Fixed

- Steampipe 내부 FDW 연결(`client_addr IS NULL`)을 좀비 정리 대상에서 제외
- CloudWatch FDW의 느린 API 호출로 인한 pg 풀 고갈 방지를 위해 캐시 워머에서 모니터링 쿼리 제거
- 모든 모니터링 메트릭 쿼리에 시간 범위 필터 추가 (무제한 쿼리 실행 방지)
- AI 채팅 버블이 SSE 스트리밍 중 폭이 점프하는 현상 수정 ([#8](https://github.com/whchoi98/awsops/pull/8))

### Security

- SSRF 심층 방어: `datasource-client.ts`에 URL 검증 추가 (AI route 포함 모든 outbound fetch 보호)
- 데이터소스 쿼리 및 AI 쿼리 생성 액션에 관리자 전용 접근 적용
- IPv6 사설/링크로컬 주소 차단 추가 (`fc00::/7`, `fe80::/10`)
- Tempo/Jaeger trace ID URL 삽입에 정규식 캡처 그룹 사용

## [1.7.0] - 2026-03-24

### Added

- Steampipe Aggregator 패턴 기반 멀티 어카운트 지원 (`aws` = 전체 통합, `aws_{id}` = 개별 계정)
- 계정 관리 페이지(`/accounts`) — 추가/삭제/테스트 기능 (관리자 전용, `adminEmails` 설정)
- `AccountSelector` 드롭다운 및 `AccountBadge` 컴포넌트 (계정별 네비게이션)
- `buildSearchPath(accountId)` 계정별 쿼리 스코핑 및 `runCostQueriesPerAccount()` 비용 데이터 병합
- 25개 전체 SQL 쿼리 파일에 `account_id` 컬럼 추가
- 교차 계정 IAM 역할 설정 스크립트 (`scripts/11-setup-multi-account.sh`)
- `InvokeModelWithResponseStreamCommand` 기반 실시간 Bedrock 스트리밍 (SSE 청크 이벤트)
- 대시보드 쿼리 백그라운드 캐시 프리워밍 (`cache-warmer.ts`, 4분 주기)
- 대시보드/모니터링/AgentCore 페이지에 캐시 워머 상태 바 표시
- 사이드바에 고객 로고 설정 (`customerLogo`, `customerName`, `customerLogoBg`)

### Changed

- 35개 전체 페이지에 `useAccountContext()` 통합 (멀티 어카운트 인식)
- DataTable에서 멀티 어카운트 데이터 감지 시 Account 컬럼 자동 추가
- 캐시 키 형식을 `sp:{accountId}:{sql}`로 변경 (계정별 캐시 분리)
- `config.json`의 `accounts[]` 배열로 코드 수정 없이 계정 관리
- 배포 스크립트 11단계로 확장 (Step 11: 멀티 어카운트 설정)

### Fixed

- `RESET search_path` 실패 시 커넥션 파괴로 풀 고갈 방지

### Security

- **CRITICAL**: AssumeRole 감사 로그 (JSON 구조화, CloudWatch 추적 가능)
- **CRITICAL**: 교차 계정 AssumeRole에 ExternalId 필수화 (Confused Deputy 방지)
- **HIGH**: 관리자 엔드포인트 Rate Limiting (5 req/min/user, HTTP 429)
- **HIGH**: Alias/Region 입력 검증 강화 (64자 제한, 정규식 패턴)
- **HIGH**: `execSync`를 `execFileSync`로 교체 (Shell Injection 방지) ([#6](https://github.com/whchoi98/awsops/pull/6))

## [1.6.0] - 2026-03-21

### Added

- 한국어/영어 전환 다국어(i18n) 지원 (React Context + localStorage)
- `translations/en.json`, `ko.json`에 500+ 번역 키
- AI 응답이 언어 설정에 따라 한국어/영어로 출력
- Bedrock 모니터링 페이지(`/bedrock`) — 모델별 사용량 대시보드 (CloudWatch + AWSops 토큰 추적)
- Account Total vs AWSops 사용량 비교 차트
- AI 채팅에 토큰 비용 표시 (입력/출력 토큰, USD 비용)
- ECS 컨테이너 비용 페이지(`/container-cost`) — Fargate 가격 + Container Insights 메트릭
- EKS 컨테이너 비용 페이지(`/eks-container-cost`) — OpenCost API + Request 기반 폴백
- OpenCost 설치 스크립트(`06f-setup-opencost.sh`) — Prometheus + OpenCost (EKS)
- AgentCore Memory Store 대화 이력 영구 저장 (365일 보관, 사용자별 분리)
- AI Assistant 하단에 대화 이력 토글 패널

### Changed

- Bedrock 대시보드 기본 시간 범위를 24시간에서 7일로 변경
- Bedrock 가격 맵에 교차 리전 모델 ID 추가

## [1.5.2] - 2026-03-15

### Added

- EBS 페이지(`/ebs`) — 볼륨/스냅샷, 암호화 상태, EC2 어태치먼트 매핑, Idle 볼륨 감지
- MSK 페이지(`/msk`) — Kafka 클러스터, 브로커 노드 메트릭 테이블 (CPU/Memory/Network), KRaft 컨트롤러
- OpenSearch 페이지(`/opensearch`) — 도메인, 암호화 (N2N/At-Rest), VPC 구성, 클러스터 메트릭
- Resource Inventory 페이지(`/inventory`) — 18종 리소스 수량 추이, 멀티라인 차트, 비용 영향 추정 ([#1](https://github.com/whchoi98/awsops/pull/1))
- MSK/RDS/ElastiCache/OpenSearch CloudWatch 메트릭 테이블 (프로그레스 바 + 수치)
- ElastiCache Valkey 엔진 지원 (엔진별 색상 배지)
- 설치 시 Cost Explorer MSP/Direct Payer 자동 판별
- Cost 쿼리 실패 시 마지막 스냅샷 데이터 폴백 표시
- AgentCore 설정을 `data/config.json`으로 외부화 (하드코딩 ARN 제거)
- 응답 내용 키워드 매칭으로 MCP 도구 사용 추론 → AI 채팅에 배지 표시
- AgentCore Memory 자동 저장 (질문/요약/라우트/도구/응답시간)

### Changed

- 대시보드에 EBS/MSK/OpenSearch 카드 추가 (Network & Storage 행, 9열)
- pg Pool max 3 → 5, 배치 크기 3 → 5로 확대
- 멀티 라우트 실패 시 Bedrock Direct 폴백 추가, 타임아웃 60초 → 90초로 확대
- Sign Out 버튼을 Header에서 Sidebar 상단(로고 옆)으로 이동

### Fixed

- HttpOnly 쿠키 로그아웃을 서버 사이드 API(`POST /api/auth`)로 변경 (클라이언트 삭제 불가 수정)

## [1.4.0] - 2026-03-13

### Added

- 멀티 라우트 AI 분류 — 복합 질문 시 1-3개 Gateway 병렬 호출 + Bedrock 응답 합성
- AgentCore 대시보드 페이지(`/agentcore`) — Runtime 상태, 8 Gateway 카드, 125 도구 목록
- AgentCore 상태 API(`/api/agentcore`) — Runtime/Gateway 상태 조회
- CloudFront 페이지(`/cloudfront-cdn`) — Distribution, Origins, Aliases, WAF, Protocol
- WAF 페이지(`/waf`) — Web ACL 목록, Rules, IP Sets
- ECR 페이지(`/ecr`) — Repository, Scan 설정, Encryption, Tag Mutability
- Header에 Sign Out 버튼 (쿠키 삭제 → Cognito 재인증)
- S3 Bucket TreeMap 시각화 (리전별, Public/Versioned/Standard 색상 구분)
- S3 IAM Roles 섹션 (S3 접근 가능 역할 표시)
- RDS Security Groups 인바운드 규칙 및 체이닝 리소스 표시
- RDS CloudWatch 메트릭 — CPU, Memory, Connections, IOPS, Storage 미니 차트
- ElastiCache Security Groups 및 CloudWatch 메트릭
- Monitoring 인스턴스 상세 메트릭 뷰 (전체 화면 차트, 날짜 범위 필터 1h/6h/24h/7d/30d)
- Resource Topology 재설계 — Infrastructure Graph/Map 전환 + Kubernetes 4컬럼 리소스 맵
- VPC Resource Map — AWS 콘솔 스타일 4컬럼 레이아웃, 클릭 하이라이트
- EKS 노드 카드에 CPU/Memory 프로그레스 바 및 ENI 상세 뷰
- Cost Explorer 기간/서비스 필터, Projected 월말 비용, MoM 변화율

### Changed

- 대시보드 레이아웃 18 카드(6x3)로 재설계, 사이드바 메뉴와 1:1 매핑
- CIS Compliance 기준을 v4.0.0으로 갱신
- AI Assistant 헤더를 EC2/VPC 페이지와 동일 스타일로 통일 (ONLINE 배지)

### Fixed

- 8개 페이지에서 PieChart/BarChart Steampipe bigint 문자열 → `Number()` 변환
- Cost 쿼리 `COALESCE(unblended, blended, 0)` — blended_cost null 계정 지원
- 멀티 라우트 빌드 TypeScript implicit any 타입 오류

## [1.3.0] - 2026-03-12

### Added

- 대시보드 18개 StatsCards (6x3 레이아웃), 사이드바 메뉴와 1:1 매핑, 카드별 sub-metrics
- CIS Compliance Pass Rate 표시 (alarm/skip/error 세부 분류)
- Monthly Cost sub-metrics — 일평균, 전월 대비, MoM 변화율
- AI Assistant SSE 스트리밍 (실시간 진행 상태 표시)
- AI 채팅에 응답 시간, 클립보드 복사, 연관 추천 질문 기능
- EC2 메모리/네트워크 정보 (`aws_ec2_instance_type` JOIN)
- EC2 다중 필터 — 텍스트 검색 + State + Instance Type + VPC 드롭다운
- K8s Overview 노드 카드에 CPU/Memory 사용량 프로그레스 바
- K8s 노드 상세 뷰 — ENI 카드, ENI별 트래픽, Pod 테이블
- EKS Explorer — Status/Node 필터, 페이지네이션 (25/50/100/200), 클러스터 선택기
- VPC Route Table 탭 (Associations, Routes, target/state 상세)
- TGW Route Tables 및 Attachment 상세 뷰

### Changed

- 사이드바 글씨 크기 확대 (`text-sm` → `text-[15px]`), 아이콘 16px → 18px
- StatsCard 긴 값 자동 축소, `h-full` 카드 높이 통일

### Fixed

- RDS/ElastiCache 메트릭 차트 겹침 — 직접 Recharts 렌더링으로 해결
- Monitoring EC2 상세 차트 크기 — 전용 Recharts 컴포넌트로 수정
- K8s `parseMiB` const hoisting 문제 — 컴포넌트 밖 함수로 이동
- AgentCore `bedrock-agentcore:*` 권한 추가 및 `<tool_call>` 태그 정리
- Bedrock 리전 us-east-1 → ap-northeast-2 변경 (global.* inference)
- Cognito custom domain `SupportedIdentityProviders` 및 콜백 URL 경로 수정

## [1.2.0] - 2026-03-11

### Added

- Infra Gateway에서 Network Gateway(17 도구) 분리 — VPC, TGW, VPN, ENI, Firewall, Reachability, Flow Logs
- Infra Gateway에서 Container Gateway(24 도구) 분리 — EKS, ECS, Istio
- AI 테스트 스크립트 `scripts/test-ai-routes.py` — 대화형 메뉴, 104개 질문, 9 카테고리, 내용 검증
- 테스트 가이드 `docs/AI_TEST_GUIDE.md` — 사용법, 출력 해석, 트러블슈팅

### Changed

- **BREAKING:** Infra Gateway(41 도구) → Network(17) + Container(24) 분리 (Container 54% 속도 개선)
- Gateway 7개 → 8개, 라우트 9개 → 10개로 확장
- Bedrock 리전을 ap-northeast-2로 변경 (global.* inference profile, ~20% 지연 감소)
- 벤치마크 라우트 Steampipe 비밀번호를 하드코딩에서 동적 조회로 변경

### Fixed

- AgentCore IAM 역할에 `bedrock-agentcore:*` 누락으로 Gateway 호출 실패
- EKS access entry `arn:aws:sts::` → `arn:aws:iam::` 형식 변환
- K8s PVC `capacity`/`access_modes` JSONB 직렬화 오류 (`::text` 캐스팅)
- AgentCore 응답에 `<tool_call>` 태그 노출 (regex 제거)
- Cognito custom domain `SupportedIdentityProviders` 및 콜백 URL 경로

## [1.1.0] - 2026-03-07

### Added

- 단일 게이트웨이를 7개 역할 기반 AgentCore Gateway로 교체 (Network/IaC/Data/Security/Monitoring/Cost/Ops)
- MCP 도구 타겟으로 19개 Lambda 함수 추가 (총 125 도구)
- `agent.py`에서 `payload.gateway` 파라미터 기반 동적 게이트웨이 라우팅
- `route.ts`에 9단계 우선순위 키워드 기반 라우팅
- 게이트웨이별 전문가 역할 시스템 프롬프트
- Gateway Target 자동 생성 스크립트 `create_targets.py`
- 16개 Lambda 소스 파일 `agent/lambda/`에 버전 관리

### Changed

- **BREAKING:** 단일 게이트웨이(29 도구) → 7개 전문 게이트웨이(125 도구)로 전환 (도구 선택 정확도 향상)
- `network-mcp` 1개 도구(693B) → 15개 도구(17KB)로 재작성
- `steampipe-query` boto3 키워드 폴백에서 pg8000 실제 SQL로 업그레이드
- 레거시 게이트웨이(`awsops-gateway-g0ihtogknw`) 삭제

## [1.0.1] - 2026-03-07

### Added

- CDK 인프라 스택(`awsops-stack.ts`) — VPC, EC2, ALB, CloudFront
- Cognito User Pool + OAuth2 Authorization Code 인증 흐름
- Lambda@Edge(Python 3.12, us-east-1) CloudFront JWT 인증
- AgentCore Runtime (Strands 에이전트, arm64 Docker, ECR)
- AgentCore Gateway (MCP 프로토콜) 및 Code Interpreter
- 4개 하위 단계 AgentCore 스크립트: Runtime(6a), Gateway(6b), Tools(6c), Interpreter(6d)
- Claude Code 프로젝트 스캐폴딩 (자동 동기화 hooks + 모듈 문서)
- Git commit-msg 훅 (Co-Authored-By 자동 제거)

### Fixed

- CloudFront CachePolicy TTL=0 거부 — managed `CACHING_DISABLED`로 해결
- ALB 보안 그룹 규칙 제한 (CloudFront prefix list 120+ IP) — 포트 범위로 통합
- EC2 UserData Steampipe 설치를 ec2-user 대신 root로 실행
- Steampipe 수신 모드 `local` → `network` 변경 (VPC Lambda 접근 허용)
- Gateway Target API 구조를 `mcp.lambda` + `credentialProviderConfigurations`로 수정
- Code Interpreter 이름에 하이픈 사용 불가 — 언더스코어로 변경
- Lambda에서 psycopg2 호환 불가 — pg8000(순수 Python)으로 전환

## [1.0.0] - 2026-03-07

### Added

- AWSops 대시보드 21개 페이지 + 5개 API 라우트
- Next.js 14 (App Router) + Tailwind CSS 다크 네이비 테마
- Steampipe 내장 PostgreSQL 연동 (380+ AWS 테이블, 60+ K8s 테이블)
- Recharts 메트릭 시각화 및 React Flow 네트워크 토폴로지
- Powerpipe CIS v1.5~v4.0 벤치마크
- AI 라우팅: Code Interpreter, AgentCore, Steampipe+Bedrock, Bedrock Direct
- Bedrock Claude Sonnet/Opus 4.6 통합

[Unreleased]: https://github.com/whchoi98/awsops/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/whchoi98/awsops/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/whchoi98/awsops/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/whchoi98/awsops/compare/v1.4.0...v1.5.2
[1.4.0]: https://github.com/whchoi98/awsops/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/whchoi98/awsops/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/whchoi98/awsops/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/awsops/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/whchoi98/awsops/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/whchoi98/awsops/releases/tag/v1.0.0
