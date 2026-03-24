# 변경 이력

AWSops 대시보드 프로젝트의 모든 주요 변경 사항을 기록합니다.

---

## [1.7.0] - 2026-03-24

### 멀티 어카운트 + 실시간 스트리밍 + 캐시 프리워밍 + 고객 로고 / Multi-Account + Streaming + Cache Warming + Customer Logo

#### 멀티 어카운트 지원 (PR #6) / Multi-Account Support
- Steampipe Aggregator 패턴: `aws` = 전체 계정 통합, `aws_{id}` = 개별 계정
- `AccountContext` + `AccountSelector`: 계정 전환 Context + Sidebar 드롭다운 (ARIA, 키보드 지원)
- `AccountBadge`: 계정별 컬러 도트 + alias 표시
- `/accounts` 페이지: 계정 추가/삭제/테스트, 인라인 에러 피드백
- `buildSearchPath(accountId)`: Steampipe 계정별 search_path 전환
- `runCostQueriesPerAccount()`: 계정별 Cost 쿼리 실행 후 병합 (chunked parallel)
- 모든 25개 SQL 쿼리 파일에 `account_id` 컬럼 추가
- 모든 35개 페이지에 `useAccountContext()` 통합
- DataTable: `isMultiAccount && data[0].account_id` 감지 시 Account 컬럼 자동 추가
- `cross_account.py`: STS AssumeRole 헬퍼 (credential 캐싱, ExternalId, audit logging)
- `cfn-target-account-role.yaml`: 타겟 어카운트 IAM Role (ExternalId 필수)
- `scripts/11-setup-multi-account.sh`: 멀티 어카운트 설정 자동화
- ADR-008: 멀티 어카운트 아키텍처 결정

#### 보안 수정 (코드 리뷰 25건 반영) / Security Fixes
- **CRITICAL**: AssumeRole 감사 로그 (JSON 구조화, CloudWatch 추적 가능)
- **CRITICAL**: ExternalId 필수화 (Confused Deputy 방지)
- **HIGH**: Admin 엔드포인트 Rate Limiting (5 req/min/user, HTTP 429)
- **HIGH**: Alias/Region 입력 검증 강화 (길이 64자 제한, 정규식)
- **HIGH**: `execSync` → `execFileSync` (Shell Injection 방지)
- **MEDIUM**: Pool exhaustion 방지, `RESET search_path` 실패 시 커넥션 파괴

#### 실시간 Bedrock 스트리밍 / Real-time Bedrock Streaming
- `InvokeModelWithResponseStreamCommand`: Bedrock 응답 청크 단위 수신
- `streamBedrockToSSE()` 헬퍼: SSE `chunk` 이벤트로 실시간 전송
- 클라이언트: `streamingContent` state → ReactMarkdown 실시간 렌더링
- 적용: SQL 분석, 코드 생성, Bedrock Direct 폴백

#### 캐시 프리워밍 / Cache Pre-warming
- `cache-warmer.ts`: 서버 시작 시 대시보드(23개) + 모니터링(10개) 쿼리 백그라운드 실행
- 4분 주기 자동 갱신 (5분 TTL 만료 전), CloudWatch 메트릭 TTL 10분
- `ensureCacheWarmerStarted()`: 첫 API 요청 시 자동 시작 (lazy-init)
- 캐시 워머 상태 바: 대시보드, 모니터링, AgentCore 페이지 하단 표시
- AgentCore API: node-cache 5분 캐시 (CLI 10~30초 → 즉시 응답)

#### 고객 로고 / Customer Logo
- `public/logos/`: 고객 로고 디렉토리 (default.png, autoever.png)
- `customerLogo`, `customerName`, `customerLogoBg` config 필드
- Sidebar 최상단에 로고 표시 (light: 흰색 배경, dark: 투명 배경)
- 서버 재시작 없이 config 변경으로 1분 내 반영

#### 변경 / Changed
- v1.6.0 → v1.7.0, 35 pages, 50 routes, 15 components, 8 ADRs
- Config: `accounts[]` 배열 추가 — 코드 변경 없이 계정 추가/삭제
- Cache key: `sp:{accountId}:{sql}` 형태로 계정별 캐시 분리
- 배포 스크립트 11단계 (Step 11: 멀티 어카운트 설정 추가)

---

## [1.6.0] - 2026-03-21

### 다국어(i18n) + Bedrock 모니터링 / i18n + Bedrock Monitoring

#### 다국어 지원 / i18n Support
- React Context + localStorage 방식 (URL 라우팅 없음, basePath 충돌 방지)
- `LanguageContext.tsx`: Provider + useLanguage 훅
- `translations/en.json`, `ko.json`: 500+ 키 각각
- Sidebar 상단 EN/한 토글, 기본 언어: 한국어
- 모든 35개 페이지 + Header/Sidebar + AI 진행 상태 메시지 번역
- AI 응답이 언어 설정에 따라 영어/한국어로 출력

#### Bedrock 모니터링 / Bedrock Monitoring
- `/bedrock` 페이지: 모델별 사용량 대시보드 (CloudWatch + AWSops 토큰 추적)
- Account Total vs AWSops 사용량 비교 차트
- AI 채팅에 토큰 비용 표시 (입력/출력 토큰, USD 비용)
- 프롬프트 캐싱 히트율 표시, 기본 범위 7일

#### 컨테이너 비용 / Container Cost
- `/container-cost`: ECS Fargate 비용 (Container Insights + 가격 계산)
- `/eks-container-cost`: EKS Pod 비용 (OpenCost API + Request 기반 폴백)
- `06f-setup-opencost.sh`: Prometheus + OpenCost 설치

#### AgentCore Memory / 대화 이력
- 대화 자동 저장 (질문/요약/라우트/도구/응답시간), 사용자별 분리 (JWT email)
- AI 페이지 하단: 대화 이력 토글 패널 (최근 30건, 검색)
- AgentCore 페이지: 호출 통계 + 대화 이력 검색

---

## [1.5.2] - 2026-03-15

### 한국어

#### 신규 페이지
- **EBS** (`/ebs`): 볼륨/스냅샷, 암호화 상태, EC2 어태치먼트 매핑, Idle 볼륨 감지
- **MSK** (`/msk`): Kafka 클러스터, 브로커 노드 테이블 (CPU/Memory/Network 메트릭), KRaft 컨트롤러
- **OpenSearch** (`/opensearch`): 도메인, 암호화 (N2N/At-Rest), VPC, 클러스터 구성, EBS 스토리지
- **Resource Inventory** (`/inventory`): 18종 리소스 수량 추이, 멀티라인 차트, 비용 영향 추정 (PR #1)

#### CloudWatch 메트릭 테이블 (4개 서비스)
- **MSK**: 브로커별 CPU/Memory/BytesIn/BytesOut 프로그레스 바 (API: `/api/msk`)
- **RDS**: 인스턴스별 CPU/Free Memory/Connections/IOPS/Network/Storage (API: `/api/rds`)
- **ElastiCache**: 노드별 CPU/Engine CPU/Free Memory/Network/Connections (API: `/api/elasticache`)
- **OpenSearch**: 도메인별 CPU/JVM Memory/Cluster Status/Nodes/Documents/Search+Index Rate (API: `/api/opensearch`)
- 4개 서비스 모두 동일 패턴: `cloudwatch get-metric-data` → 프로그레스 바 + 수치 테이블

#### ElastiCache 강화
- Valkey 엔진 카드 추가 (valkey/redis/memcached 구분 배지)
- Cache Nodes 상세 테이블: 노드별 상태, AZ, 엔드포인트, 메트릭

#### Cost Explorer 가용성 관리 (PR #1)
- 설치 시 Direct Payer vs MSP Payer 자동 판별 (`02-setup-nextjs.sh`)
- `data/config.json`에 `costEnabled` 영구 저장 → MSP 계정에서 Cost 메뉴 자동 숨김
- Cost 스냅샷 폴백: 장애 시 마지막 스냅샷 표시

#### 인증
- **Sign Out 수정**: HttpOnly 쿠키를 서버 사이드 API(`POST /api/auth`)로 삭제

#### AI 라우팅 개선
- AgentCore 설정 외부화: `data/config.json`에서 ARN 읽기 (하드코딩 제거)
- 분류 개선: 목록/현황/구성 분석 → `aws-data` (Steampipe SQL), 트러블슈팅 → 전문 Gateway
- 도구 사용 표시: 응답 내용 키워드 매칭으로 사용된 MCP 도구 추론 → UI 하단에 배지 표시
- 멀티 라우트 실패 시 Bedrock Direct 폴백 추가, 타임아웃 60s → 90s

#### AgentCore Memory (대화 이력)
- **Memory Store**: `06e-setup-agentcore-memory.sh` — AgentCore Memory 생성 (365일 보관)
- 대화 자동 저장: 모든 AI 응답 후 질문/요약/라우트/도구/응답시간 기록
- **사용자별 분리**: Cognito JWT에서 email 추출 → 사용자별 대화 이력 분리
- AgentCore 페이지: 호출 통계 (6 StatsCards) + 라우트 분포 + 최근 호출 + 대화 이력 검색
- AI Assistant 하단: 대화 이력 토글 패널 (클릭으로 재질문)

#### UI 개선
- Sign Out: Header에서 Sidebar 상단 로고 옆으로 이동
- AI 응답 하단에 사용된 도구(Tools used) + Queried 리소스 배치

#### 변경
- Dashboard: EBS/MSK/OpenSearch 카드 추가 (Network & Storage 행, 9열)
- pool max 3 → 5, batch size 3 → 5
- ADR-006 (Cost 가용성), ADR-007 (Resource Inventory) 추가

---

### English

#### New Pages
- **EBS** (`/ebs`): Volumes/Snapshots, encryption status, EC2 attachment mapping, idle volume detection
- **MSK** (`/msk`): Kafka clusters, broker node table (CPU/Memory/Network metrics), KRaft controllers
- **OpenSearch** (`/opensearch`): Domains, encryption (N2N/At-Rest), VPC, cluster config, EBS storage
- **Resource Inventory** (`/inventory`): 18 resource count trends, multi-line chart, cost impact estimation (PR #1)

#### CloudWatch Metrics Tables (4 services)
- **MSK**: Per-broker CPU/Memory/BytesIn/BytesOut progress bars (API: `/api/msk`)
- **RDS**: Per-instance CPU/Free Memory/Connections/IOPS/Network/Storage (API: `/api/rds`)
- **ElastiCache**: Per-node CPU/Engine CPU/Free Memory/Network/Connections (API: `/api/elasticache`)
- **OpenSearch**: Per-domain CPU/JVM Memory/Cluster Status/Nodes/Documents/Search+Index Rate (API: `/api/opensearch`)
- All 4 services follow same pattern: `cloudwatch get-metric-data` → progress bars + metric table

#### ElastiCache Enhancement
- Valkey engine card added (valkey/redis/memcached color badges)
- Cache Nodes detail table: per-node status, AZ, endpoint, metrics

#### Cost Explorer Availability (PR #1)
- Install-time Direct Payer vs MSP Payer detection (`02-setup-nextjs.sh`)
- `data/config.json` stores `costEnabled` → Cost menu auto-hidden for MSP accounts
- Cost snapshot fallback: shows last snapshot on failure

#### Auth
- **Sign Out fix**: HttpOnly cookie cleared via server-side API (`POST /api/auth`)

#### AI Routing Improvements
- AgentCore config externalized: ARN from `data/config.json` (no hardcoded accounts)
- Classification: listing/status/config analysis → `aws-data` (Steampipe SQL), troubleshooting → specialized Gateway
- Tool usage display: infer used MCP tools from response keywords → show badges at bottom
- Multi-route fallback to Bedrock Direct, timeout 60s → 90s

#### AgentCore Memory (Conversation History)
- **Memory Store**: `06e-setup-agentcore-memory.sh` — creates AgentCore Memory (365-day retention)
- Auto-save: records question/summary/route/tools/time after every AI response
- **Per-user isolation**: extracts email from Cognito JWT → separate history per user
- AgentCore page: call stats (6 StatsCards) + route distribution + recent calls + history search
- AI Assistant bottom: conversation history toggle panel (click to re-ask)

#### UI Improvements
- Sign Out: moved from Header to Sidebar (next to logo)
- Tools used + Queried resources moved to bottom of AI responses

#### Changed
- Dashboard: EBS/MSK/OpenSearch cards added (Network & Storage row, 9 columns)
- Pool max 3 → 5, batch size 3 → 5
- ADR-006 (Cost availability), ADR-007 (Resource Inventory) added

---

## [1.4.0] - 2026-03-13

### 멀티 라우트 + AgentCore 대시보드 + 새 페이지 / Multi-Route + AgentCore Dashboard + New Pages

#### 추가 / Added
- **멀티 라우트 AI**: 복합 질문 시 1-3개 Gateway 병렬 호출 + Bedrock 응답 합성
  - 예: "VPC 보안그룹과 비용을 분석해줘" → network + cost 병렬 호출
  - SSE: 📡 멀티 라우트 → 🤖 N개 Gateway 병렬 호출 → 📊 응답 합성
- **AgentCore 대시보드** (`/agentcore`): Runtime 상태, 8 Gateway 카드, 125 도구 전체 목록, 아키텍처 다이어그램
- **AgentCore API** (`/api/agentcore`): AWS CLI로 Runtime/Gateway 상태 + 타겟 수 조회
- **CloudFront 페이지** (`/cloudfront-cdn`): Distribution 목록, Origins, Aliases, WAF, Protocol
- **WAF 페이지** (`/waf`): Web ACL, Rules, IP Sets
- **ECR 페이지** (`/ecr`): Repository, Scan 설정, Encryption, Tag Mutability
- **Sign Out 버튼**: Header에 로그아웃 (쿠키 삭제 → Cognito 재인증)
- **Cognito demo 계정**: demo@awsops.local

#### S3 강화 / S3 Enhancement
- Bucket Map (TreeMap): 리전별 버킷 블록, 색상 (Public/Versioned/Standard)
- 검색 + 필터: 이름, 리전, Public/Private
- IAM Roles 섹션: S3 접근 가능한 역할 목록

#### RDS 강화 / RDS Enhancement
- Security Groups: SG 인바운드 규칙 + 체이닝된 리소스
- CloudWatch 메트릭: CPU, Memory, Connections, IOPS, Storage (미니 차트)
- Features: Deletion Protection, IAM Auth, Performance Insights

#### ElastiCache 강화 / ElastiCache Enhancement
- Security Groups: SG 인바운드 규칙
- CloudWatch 메트릭: CPU, Memory, Connections, NetworkBytes, CacheHitRate

#### Monitoring 강화 / Monitoring Enhancement
- 인스턴스 상세 메트릭 뷰: EC2 클릭 → 전체 화면 차트
- Date Range 필터: 1h, 6h, 24h, 7d, 30d
- 로딩 프로그레스 바

#### Resource Topology 재설계 / Resource Topology Redesign
- Infrastructure: Graph View (ReactFlow) / Map View (5컬럼) 전환
  - Map View: External → VPCs → Subnets → Compute → NAT
  - 검색 + 클릭 하이라이트
- Kubernetes: 4컬럼 리소스 맵 (Ingress → Service → Pod → Node)
  - 검색 + 클릭 하이라이트

#### VPC Resource Map / VPC 리소스 맵
- AWS 콘솔 스타일 4컬럼: VPC → Subnets → Route Tables → Network Connections
- 클릭 하이라이트 + 텍스트 검색
- Route Table 탭 + TGW Route Tables + TGW Attachment 상세

#### EKS 강화 / EKS Enhancement
- K8s Overview 노드 카드: CPU/Memory 사용량 프로그레스 바
- 노드 상세: ENI 카드 + per-ENI 트래픽 + Pods 테이블
- EKS Explorer: Status/Node 필터, 페이지네이션, 클러스터 선택기

#### Cost Explorer 강화 / Cost Explorer Enhancement
- 기간 필터 + 서비스 필터
- Projected 월말 비용, Monthly Trend, 서비스 비중 %

#### 변경 / Changed
- Dashboard: 18 카드 (6×3) → ECS 제거, AgentCore 추가
- 사이드바: AgentCore 메뉴 추가, v1.4.0 버전 표시
- AI Assistant: 세션 통계 바 (대시보드는 /agentcore로 이동)
- Cost 쿼리: `COALESCE(unblended, blended, 0)` — blended null 계정 지원
- CIS: v4.0.0 기준

#### 수정 / Fixed
- RDS/ElastiCache 메트릭 차트 겹침: LineChartCard → 직접 Recharts (h-20)
- Monitoring EC2 상세: LineChartCard → 직접 Recharts (h-36 with axes)
- 멀티 라우트 빌드: TypeScript implicit any 타입 수정

---

## [1.3.0] - 2026-03-12

85개 커밋, 전면 UX/기능 업그레이드. (85 commits, comprehensive UX/feature upgrade.)

### 대시보드 전면 재설계 / Dashboard Redesign

#### 추가 / Added
- **18개 카드 (6×3 레이아웃)**: 사이드바 메뉴와 1:1 매핑, 모든 카드 클릭 → 해당 페이지 이동
  - Compute: EC2, Lambda, ECS, ECR, EKS, CloudFront
  - Network & Data: VPC, WAF, S3, RDS, DynamoDB, ElastiCache
  - Security/Monitoring/Cost: Security Issues, IAM, CW Alarms, CloudTrail, CIS, Cost
- **카드 하단 sub-metrics**: 각 카드에 2-3개 세부 지표 (예: EC2 `18 running · 4 stopped`)
- **CIS Compliance**: Pass Rate % 볼드, alarm/skip/error 하단 표시 (v4.0.0 기준)
- **Monthly Cost sub-metrics**: daily avg, last month, MoM change
- **로딩 프로그레스 바**: Dashboard, Monitoring
- **Resource Distribution + K8s Pod Status 차트**

### 새 페이지 / New Pages

#### 추가 / Added
- **CloudFront** (`/cloudfront-cdn`): Distribution 목록, 상세 (Origins, Aliases, WAF, Protocol)
- **WAF** (`/waf`): Web ACL 목록, Rules, IP Sets
- **ECR** (`/ecr`): Repository 목록, Scan 설정, Encryption, Tag Mutability
- 사이드바: Network & CDN 그룹 (CloudFront, WAF 추가), Compute에 ECR 추가

### AI Assistant 개선 / AI Assistant Enhancement

#### 추가 / Added
- **SSE 스트리밍**: 실시간 진행 상태 (🔍 분석 중 → 📡 Gateway 연결 → 🤖 도구 호출 → 완료)
- **응답 시간 표시**: 각 응답에 `12.3s` 표시
- **클립보드 복사**: Copy 버튼 (Copied 피드백)
- **연관 추천 질문**: 라우트별 3개 follow-up 질문 (pill 버튼)
- **Bedrock AgentCore 배지**: "Powered by Amazon Bedrock AgentCore"

#### 변경 / Changed
- 헤더: EC2/VPC 페이지와 동일 스타일, ONLINE 배지, 모델 선택기
- 채팅 영역 가운데 정렬 + 넓은 레이아웃 (`max-w-6xl`)
- 아이콘: MessageSquare → BrainCircuit

### EC2 강화 / EC2 Enhancement

#### 추가 / Added
- **Memory/Network 정보**: `aws_ec2_instance_type` JOIN으로 메모리(GiB), 네트워크 성능, Max ENI, Instance Storage
- **다중 필터**: 텍스트 검색 + State + Instance Type + VPC 드롭다운 + Clear all

#### 변경 / Changed
- **Lambda 상세**: Deployment 섹션 (Version, State, Layers), VPC 개별 컬럼

### Kubernetes (EKS) 대폭 강화 / Kubernetes Major Enhancement

#### 추가 / Added
- **K8s Overview 노드 카드**: CPU/Memory 사용량 프로그레스 바 (Pod requests 기반)
- **노드 클릭 → 상세 뷰**: CPU/Memory/Pod Info 카드 + ENI 목록 + 트래픽 + Pods 테이블
- **ENI 상세**: 노드별 ENI 카드, IP 슬롯 사용률 바, per-ENI 트래픽 (CloudWatch), secondary IP 목록
- **EKS Cluster/VPC 필터**: 멀티 선택 토글 + 클러스터 카드 (version, VPC, platform)
- **K8s Nodes 페이지**: 3단계 리소스 사용 바 (Requested / Available / System Reserved)
- **K8s Memory 포맷**: `32986188Ki` → `31.5 GiB` (전체 K8s 페이지)
- **EKS Explorer**: Status/Node 필터, 페이지네이션 (25/50/100/200), 접을 수 있는 노드 패널, 클러스터 선택기

### VPC & Network 강화 / VPC & Network Enhancement

#### 추가 / Added
- **Route Table 탭**: 라우트 테이블 목록, 상세 (Associations, Routes with target/state)
- **TGW Route Tables**: TGW 상세에서 Route Table + Routes (destination, type, attachment, state)
- **TGW Attachment 상세**: 클릭 → state, resource, association, options
- **VPC Resource Map**: AWS 콘솔 스타일 4컬럼 레이아웃 (VPC → Subnets → Route Tables → Network Connections)
  - 클릭 하이라이트: Subnet→RT→Target 연결 관계 표시, 비관련 dimmed
  - 텍스트 검색: subnet/RT/target 이름, ID, CIDR로 검색 + 하이라이트
  - 즉시 렌더링: pre-loaded 데이터에서 클라이언트 필터링 (API 호출 없음)

### Resource Topology 재설계 / Resource Topology Redesign

#### 추가 / Added
- **Infrastructure**: Graph View (ReactFlow) / Map View (5컬럼 리소스 맵) 전환
  - Map View: External(IGW/TGW) → VPCs → Subnets → Compute(EC2/ELB/RDS) → NAT
  - 검색 + 클릭 하이라이트 (VPC→Subnet→EC2 연결 관계)
- **Kubernetes**: 4컬럼 리소스 맵 (Ingress → Service → Pod → Node)
  - 검색 하이라이트: `carts` 입력 → 관련 Pod/Service/Ingress/Node 강조
  - 클릭 하이라이트: Pod→Node→Service→Ingress 연결 관계
  - Service→Pod selector 매핑, Ingress→Service rules 파싱

### Cost Explorer 강화 / Cost Explorer Enhancement

#### 추가 / Added
- **기간 필터**: This Month / 3 Months / 6 Months / 1 Year
- **서비스 필터**: 멀티 선택 토글
- **추가 지표**: Projected 월말 비용, MoM Change, 서비스 수 + 20% 이상 증가 서비스
- **추가 차트**: Monthly Trend 라인, Cost by Service 파이 차트
- **테이블 강화**: This Month, Last Month, Change %, Share % + 프로그레스 바
- **서비스 상세 패널**: Monthly Trend 라인 차트 추가

#### 수정 / Fixed
- `COALESCE(unblended, blended, 0)` — blended_cost가 null인 계정 지원

### S3 강화 / S3 Enhancement

#### 추가 / Added
- **Bucket Map (TreeMap)**: 리전별 버킷 블록, 색상 (Public=빨강, Versioned=초록, Standard=시안)
- **검색 + 필터**: 이름 검색, 리전 드롭다운, Public/Private 필터
- **IAM Roles 섹션**: S3 접근 가능한 IAM 역할 목록 (상세 패널)

### RDS 강화 / RDS Enhancement

#### 추가 / Added
- **Security Groups**: SG 인바운드 규칙 (CIDR, 포트, 참조 SG = 체이닝된 리소스)
- **CloudWatch 메트릭**: CPU, FreeableMemory, DatabaseConnections, IOPS, FreeStorage (미니 차트)
- **Features 섹션**: Deletion Protection, IAM Auth, Performance Insights
- **텍스트 검색 필터**

### ElastiCache 강화 / ElastiCache Enhancement

#### 추가 / Added
- **Security Groups**: SG 인바운드 규칙 (RDS와 동일)
- **CloudWatch 메트릭**: CPU, FreeableMemory, CurrConnections, NetworkBytes, CacheHitRate (미니 차트)
- **텍스트 검색 필터**

### Monitoring 강화 / Monitoring Enhancement

#### 추가 / Added
- **인스턴스 상세 메트릭 뷰**: EC2 클릭 → 전체 화면 메트릭 차트
  - CPU, NetworkIn/Out, DiskRead/WriteOps, PacketsIn/Out
  - Date Range 필터: 1h, 6h, 24h, 7d, 30d (period 자동 조정)
- **로딩 프로그레스 바**

### UI/UX 공통 / Common UI/UX

#### 변경 / Changed
- **사이드바**: 글씨 크기 증가 (`text-sm` → `text-[15px]`), 아이콘 16→18px
- **StatsCard**: 긴 값 자동 축소, `h-full` 카드 높이 통일, `highlight` prop
- **LiveResourceCard**: `h-full` + `flex-col` 높이 통일

#### 수정 / Fixed (전체)
- PieChart/BarChart: Steampipe bigint 문자열 → `Number()` 변환 (8개 페이지)
- Cost 쿼리: `CAST(float8 AS numeric)` null → `::numeric` 사용
- EKS access entry: `arn:aws:sts::` → `arn:aws:iam::` 변환
- Next.js `router.push()`: basePath 자동 추가 고려
- K8s `parseMiB`: const hoisting 문제 → 컴포넌트 밖 함수로 이동
- AgentCore: `bedrock-agentcore:*` 권한 추가, `<tool_call>` 태그 제거
- Bedrock 리전: us-east-1 → ap-northeast-2 (global.* inference)
- Cognito custom domain: `SupportedIdentityProviders` + 콜백 URL 경로 수정

---

## [1.2.0] - 2026-03-11

### 게이트웨이 분리 + 배포 안정성 + 성능 최적화 / Gateway Split + Deployment Reliability + Performance

#### 추가 / Added
- **Network Gateway** (17 tools) — VPC, TGW, VPN, ENI, Firewall, Reachability, Flow Logs
- **Container Gateway** (24 tools) — EKS, ECS, Istio service mesh
- AI 테스트 스크립트 `scripts/test-ai-routes.py` — 대화형 메뉴, 104개 질문, 9 카테고리, 내용 검증
- 테스트 가이드 `docs/AI_TEST_GUIDE.md` — 사용법, 출력 해석, 트러블슈팅
- Custom domain 지원: `awsops.whchoi.net` (CNAME → CloudFront)

#### 변경 / Changed
- **Infra Gateway (41 tools) → Network (17) + Container (24) 분리** — Container 54% 속도 개선 (50s → 23s)
- 7 Gateways → **8 Gateways** (Network / Container / IaC / Data / Security / Monitoring / Cost / Ops)
- 9 Routes → **10 Routes** (Code → Network → Container → IaC → Data → Security → Monitoring → Cost → AWSData → Ops)
- **Bedrock 리전 us-east-1 → ap-northeast-2** (global.* inference profile) — ~20% 지연 감소
- `route.ts`: AgentCore 응답에서 `<tool_call>`/`<tool_response>` 태그 자동 제거
- `benchmark/route.ts`: Steampipe 비밀번호 하드코딩 → 동적 조회 (`steampipe service status`)
- `06a`: `run_or_fail` 헬퍼 + AWS 자격 증명 프리플라이트 체크 + `bedrock-agentcore:*` 권한 추가
- `06b`: 8 Gateways 생성 (network-gateway, container-gateway 추가)
- `06e`: Gateway 키 목록 8개로 업데이트
- `07`: CloudFront 자동 감지 — CDK 스택(AwsopsStack) 우선, ALB origin 폴백
- `04`: EKS access entry ARN `sts` → `iam` 변환 수정
- `install-all.sh`: 8 Gateways, Docker 재빌드 단계 안내, CDK CloudFront 감지

#### 수정 / Fixed
- `06a`: 권한 부족 시 에러 메시지 없이 종료되던 문제 — 단계별 에러 메시지 + 힌트 출력
- `04`: EKS access entry에 `arn:aws:sts::` 형식 사용 → `arn:aws:iam::` 변환 누락으로 kubectl 인증 실패
- `benchmark/route.ts`: 배포 환경별 Steampipe 비밀번호 불일치 (하드코딩 → 동적)
- `k8s.ts`: PVC `capacity`/`access_modes` JSONB 직렬화 에러 → `::text` 캐스팅
- AgentCore `AWSopsAgentCoreRole`에 `bedrock-agentcore:*` 누락 → Gateway 호출 실패
- AgentCore 응답에 `<tool_call>` 태그 노출 → regex 제거
- Cognito custom domain: `SupportedIdentityProviders`에 `COGNITO` 누락 → Hosted UI 에러
- Cognito 콜백 URL: `/awsops` → `/awsops/_callback` 경로 수정

#### 테스트 결과 / Test Results
- **104/104 질문 통과** (0 failed)
- **라우트 분류 93% 정확도** (97/104)
- **내용 검증 99% 통과** (103/104 valid)
- **평균 응답 27초** (min 8.6s / max 71.8s)

---

## [1.1.0] - 2026-03-07

### AgentCore MCP 게이트웨이 아키텍처 / AgentCore MCP Gateway Architecture

단일 게이트웨이에서 7개 역할 기반 게이트웨이 및 125개 MCP 도구로 전면 재설계.
(Complete redesign from single Gateway to 7 role-based Gateways with 125 MCP tools.)

#### 추가 - 게이트웨이 (7개) / Added - Gateways (7)
- **Infra Gateway** (41 tools) — Network, EKS, ECS, Istio
- **IaC Gateway** (12 tools) — CloudFormation, CDK, Terraform
- **Data Gateway** (24 tools) — DynamoDB, RDS MySQL/PostgreSQL, ElastiCache/Valkey, MSK Kafka
- **Security Gateway** (14 tools) — IAM users, roles, groups, policies, simulation
- **Monitoring Gateway** (16 tools) — CloudWatch metrics/alarms/logs, CloudTrail events/Lake
- **Cost Gateway** (9 tools) — Cost Explorer, Pricing, Budgets, Forecasts
- **Ops Gateway** (9 tools) — Steampipe SQL, AWS Knowledge, Core MCP

#### 추가 - Lambda 함수 (19개) / Added - Lambda Functions (19)
- `awsops-network-mcp` — 15 tools: VPC, TGW, VPN, ENI, Network Firewall, Flow Logs
- `awsops-reachability-analyzer` — VPC Reachability Analyzer
- `awsops-flow-monitor` — VPC Flow Log analysis
- `awsops-eks-mcp` — EKS cluster management, CloudWatch, IAM, troubleshooting
- `awsops-ecs-mcp` — ECS cluster/service/task management, troubleshooting
- `awsops-istio-mcp` [VPC] — Istio Service Mesh via Steampipe K8s CRD tables
- `awsops-iac-mcp` — CloudFormation validate/compliance/troubleshoot, CDK docs
- `awsops-terraform-mcp` — AWS/AWSCC provider docs, Registry module analysis
- `awsops-iam-mcp` — IAM users/roles/groups/policies, policy simulation
- `awsops-cloudwatch-mcp` — Metrics, alarms, Log Insights queries
- `awsops-cloudtrail-mcp` — Event lookup, CloudTrail Lake SQL analytics
- `awsops-cost-mcp` — Cost/usage, comparisons, drivers, forecast, pricing, budgets
- `awsops-dynamodb-mcp` — Tables, queries, data modeling, cost estimation
- `awsops-rds-mcp` — RDS/Aurora instances and clusters, SQL via Data API
- `awsops-valkey-mcp` — ElastiCache clusters, replication groups, serverless
- `awsops-msk-mcp` — MSK Kafka clusters, brokers, configurations
- `awsops-aws-knowledge` — AWS documentation search, regional availability
- `awsops-core-mcp` — Prompt understanding, AWS CLI execution, command suggestions
- `awsops-steampipe-query` [VPC] — Real SQL against 580+ Steampipe tables via pg8000

#### 추가 - 동적 라우팅 / Added - Dynamic Routing
- `agent.py`: 게이트웨이 선택을 `payload.gateway` 파라미터로 수행 (Gateway selection via `payload.gateway` parameter)
- `route.ts`: 9단계 우선순위 키워드 기반 라우팅 (9-route priority keyword-based routing)
  - Code → Infra → IaC → Data → Security → Monitoring → Cost → AWS Data → Ops
- 각 게이트웨이 전문가별 역할 시스템 프롬프트 (Role-specific system prompts for each Gateway specialist)

#### 변경 / Changed
- 도구 선택 정확도 향상을 위해 단일 게이트웨이(29 tools)에서 7개 게이트웨이(125 tools)로 분리 (Single Gateway → 7 Gateways for better tool selection accuracy)
- `network-mcp` 1개 도구(693B)에서 15개 도구(17KB)로 재작성 (rewritten from 1 tool to 15 tools)
- `steampipe-query` boto3 키워드 폴백에서 pg8000 통한 실제 SQL로 업그레이드 [VPC] (upgraded from boto3 keyword fallback to real SQL via pg8000)
- 레거시 게이트웨이 삭제 (`awsops-gateway-g0ihtogknw`) (Legacy Gateway deleted)

#### 추가 - 설치 스크립트 / Added - Installation Scripts
- `agent/lambda/create_targets.py` — Python script to create all 19 Gateway Targets
- `agent/lambda/*.py` — All 16 Lambda source files version controlled
- `06b-setup-agentcore-gateway.sh` rewritten for 7 Gateways
- `06c-setup-agentcore-tools.sh` rewritten for 19 Lambda + 19 Targets

---

## [1.0.1] - 2026-03-07

### 배포 및 인프라 / Deployment & Infrastructure

#### 추가 - CDK 인프라 / Added - CDK Infrastructure
- `infra-cdk/lib/awsops-stack.ts` — VPC, EC2, ALB, CloudFront (CDK)
- `00-deploy-infra.sh` rewritten for CDK (was CloudFormation)
- CDK bootstrap for ap-northeast-2 + us-east-1

#### 추가 - 인증 / Added - Authentication
- Cognito User Pool + OAuth2 Authorization Code flow
- Lambda@Edge (Python 3.12, us-east-1) for CloudFront authentication
- `07-setup-cloudfront-auth.sh` — Lambda@Edge → CloudFront `/awsops*` viewer-request

#### 추가 - AgentCore / Added - AgentCore
- AgentCore Runtime (Strands 에이전트, arm64 Docker, ECR) (Strands Agent, arm64 Docker, ECR)
- AgentCore Gateway (MCP 프로토콜) (MCP protocol)
- 코드 인터프리터 (`awsops_code_interpreter`) (Code Interpreter)
- 4개 하위 단계 스크립트: 06a (Runtime), 06b (Gateway), 06c (Tools), 06d (Interpreter) (4 sub-step scripts)

#### 추가 - Claude Code 스캐폴딩 / Added - Claude Code Scaffolding
- `.claude/hooks/check-doc-sync.sh` — Auto-detect missing module docs
- `.claude/skills/sync-docs/SKILL.md` — Full documentation sync skill
- Module CLAUDE.md files: `src/app/`, `src/components/`, `src/lib/`, `src/types/`
- Auto-Sync Rules in root CLAUDE.md
- `docs/architecture.md`, `docs/decisions/.template.md`, `docs/runbooks/.template.md`

#### 추가 - Git 훅 / Added - Git Hooks
- `.git/hooks/commit-msg` — Auto-strip Co-Authored-By lines
- `.claude/hooks/install-git-hooks.sh` — Portable hook installer

#### 수정 - CDK 배포 이슈 / Fixed - CDK Deployment Issues
- CloudFront CachePolicy: TTL=0 + HeaderBehavior rejected → managed `CACHING_DISABLED`
- ALB SG rules limit: CloudFront prefix list 120+ IPs → port range 80-3000
- EC2 UserData: Steampipe install as root (not ec2-user)
- Steampipe listen mode: `local` → `network` for VPC Lambda access

#### 수정 - AgentCore 알려진 이슈 / Fixed - AgentCore Known Issues
- Gateway Target API: `lambdaTargetConfiguration` → `mcp.lambda` structure
- `credentialProviderConfigurations` required (GATEWAY_IAM_ROLE)
- Code Interpreter naming: hyphens → underscores
- Code Interpreter: `networkConfiguration.networkMode` required
- psycopg2 incompatible with Lambda → pg8000 (pure Python)

#### 변경 - 문서 / Changed - Documentation
- `ARCHITECTURE.md` — CDK architecture, 10-step installation flow, IAM roles table
- `CLAUDE.md` — Deployment scripts, AgentCore known issues
- `README.md` — 10-step installation, project structure, known issues

---

## [1.0.0] - 2026-03-07

### 최초 릴리스 / Initial Release

- AWSops 대시보드 21개 페이지 + 5개 API 라우트 (21 pages + 5 API routes)
- Next.js 14 (App Router) + Tailwind CSS 다크 테마 (dark theme)
- Steampipe 내장 PostgreSQL (380+ AWS 테이블, 60+ K8s 테이블) (380+ AWS tables, 60+ K8s tables)
- Recharts 메트릭 시각화 (metrics visualization)
- React Flow 네트워크 토폴로지 (network topology)
- Powerpipe CIS v1.5~v4.0 벤치마크 (CIS benchmarks)
- AI 라우팅: Code Interpreter → AgentCore → Steampipe+Bedrock → Bedrock Direct (AI routing)
- Bedrock Sonnet/Opus 4.6 통합 (Bedrock integration)
