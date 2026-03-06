# AWSops Dashboard vs FAST (Fullstack AgentCore Solution Template) 비교

## 요약

| 항목 | FAST (AWS Labs) | AWSops Dashboard |
|------|-----------------|------------------|
| **목적** | 범용 AI Agent 풀스택 템플릿 | AWS/K8s 운영 대시보드 + AI |
| **성숙도** | Proof-of-Value (비운영) | 운영 환경 검증 완료 |
| **데이터 소스** | 없음 (Agent에 의존) | Steampipe 실시간 AWS/K8s 380+ 테이블 |
| **Stars** | 337 ⭐ | - |

---

## 1. Architecture 비교

### FAST
```
Amplify (React) → Cognito → AgentCore Runtime → AgentCore Gateway
                                                  └─ Lambda Tools
```
- Frontend: Amplify 호스팅
- Backend: AgentCore Runtime only
- 데이터: Agent가 직접 조회 (도구 기반)

### AWSops
```
CloudFront → Lambda@Edge (Cognito) → ALB → EC2
                                      │
                                      ├─ Next.js (21 페이지)
                                      ├─ Steampipe (pg, 380+ 테이블)
                                      ├─ Powerpipe (CIS Benchmark)
                                      └─ Bedrock + AgentCore (AI)
                                           └─ Gateway MCP (4 Lambda)
```
- Frontend + Backend + DB: 단일 EC2
- 실시간 데이터: Steampipe PostgreSQL
- AI: AgentCore + Bedrock Direct 하이브리드

---

## 2. 기능 비교

### 2-1. 대시보드 / UI

| 기능 | FAST | AWSops |
|------|------|--------|
| 메인 대시보드 | ❌ 채팅만 | ✅ 21개 페이지, 차트, 테이블 |
| EC2/VPC/RDS 등 서비스별 페이지 | ❌ | ✅ 12개 AWS 서비스 + 상세 패널 |
| 네트워크 토폴로지 그래프 | ❌ | ✅ React Flow 인터랙티브 |
| 성능 모니터링 (CPU/Memory/Network) | ❌ | ✅ CloudWatch 메트릭 시계열 |
| K8s/EKS 대시보드 | ❌ | ✅ K9s 스타일 탐색기 |
| CIS Compliance 벤치마크 | ❌ | ✅ Powerpipe CIS v1.5~v4.0 |
| Cost Explorer | ❌ | ✅ 서비스별 비용, 월별/일별 추이 |
| Security Overview | ❌ | ✅ CVE, Open SG, Unencrypted Volumes |
| 다크 테마 | ❌ (기본 shadcn) | ✅ 맞춤 Navy/Cyan 테마 |

### 2-2. AI / Agent

| 기능 | FAST | AWSops |
|------|------|--------|
| AI 채팅 | ✅ 멀티턴 | ✅ 멀티턴 + 모델 선택 |
| AgentCore Runtime | ✅ Strands/LangGraph | ✅ Strands |
| AgentCore Gateway | ✅ 텍스트 분석 Lambda | ✅ 네트워크 분석 4 Lambda (20개 도구) |
| **실시간 AWS 데이터 기반 응답** | ❌ Agent에 의존 | ✅ Steampipe 자동 쿼리 → Claude 컨텍스트 |
| Code Interpreter | ✅ (Sandbox Python) | ❌ |
| 네트워크 트러블슈팅 | ❌ | ✅ Reachability Analyzer, TGW Routes, NACL |
| 모델 선택 | ❌ (코드 변경 필요) | ✅ UI 드롭다운 (Sonnet/Opus 4.6) |
| Markdown 렌더링 | ❌ (기본) | ✅ react-markdown + GFM 테이블 |

### 2-3. 인증

| 기능 | FAST | AWSops |
|------|------|--------|
| Cognito User Pool | ✅ | ✅ |
| OAuth2 Authorization Code | ✅ | ✅ |
| Machine-to-Machine Auth | ✅ (Runtime↔Gateway) | ✅ (IAM Role) |
| Lambda@Edge JWT 검증 | ❌ (Amplify 내장) | ✅ CloudFront 레벨 |
| API Gateway Authorizer | ✅ | ❌ (ALB 직접) |

### 2-4. 인프라 / 배포

| 기능 | FAST | AWSops |
|------|------|--------|
| IaC | CDK / Terraform | CloudFormation |
| 프론트엔드 호스팅 | Amplify | CloudFront + ALB + EC2 |
| 백엔드 | AgentCore Runtime만 | EC2 (Next.js + Steampipe + Powerpipe) |
| 설치 스크립트 | `cdk deploy` | 단계별 Shell 스크립트 (10개) |
| 검증 스크립트 | ❌ | ✅ 46항목 자동 검증 |
| 트러블슈팅 가이드 | ❌ | ✅ 10가지 이슈 + 해결법 |

---

## 3. AWSops의 강점 (FAST 대비)

### ✅ 실시간 AWS 데이터
FAST는 Agent가 도구를 호출해야 데이터를 얻지만, AWSops는 **Steampipe가 380+ AWS 테이블을 SQL로 즉시 조회**. AI 응답에 실제 데이터가 포함됨.

### ✅ 운영 대시보드
FAST는 채팅 UI만 제공. AWSops는 **21개 전용 페이지**로 EC2, VPC, RDS, K8s 등을 즉시 파악.

### ✅ 네트워크 심층 분석
FAST에 없는 기능:
- VPC Reachability Analyzer
- Transit Gateway 라우트 테이블
- NACL + SG 규칙 종합 분석
- Flow Log 쿼리
- 네트워크 토폴로지 그래프

### ✅ 컴플라이언스
Powerpipe CIS Benchmark (v1.5~v4.0) 자동 실행, 431개 컨트롤 체크.

### ✅ K8s/EKS 통합
Steampipe K8s 플러그인으로 Pod, Deployment, Service 등 실시간 조회. K9s 스타일 터미널 UI.

### ✅ 성능 모니터링
CloudWatch 메트릭 (CPU, Memory, Network, Disk I/O) 시계열 차트 + 상세 패널.

### ✅ AI 하이브리드 라우팅
질문 유형에 따라 최적 경로 자동 선택:
- 네트워크 → AgentCore Gateway MCP (Lambda 도구)
- AWS 리소스 → Steampipe + Bedrock Direct
- 일반 → AgentCore Runtime (Strands)

---

## 4. FAST의 강점 (AWSops 대비)

### ✅ Code Interpreter
Sandbox Python 실행 환경. 데이터 분석, 차트 생성 가능. AWSops에는 없음.

### ✅ CDK/Terraform IaC
인프라를 코드로 관리. AWSops는 CloudFormation + Shell 스크립트.

### ✅ Amplify 호스팅
프론트엔드 CI/CD 자동화. AWSops는 EC2 수동 배포.

### ✅ 프레임워크 선택
Strands + LangGraph 패턴 모두 제공. AWSops는 Strands만.

### ✅ 문서화 / Vibe-Coding
`.amazonq/`, `.kiro/` 규칙 파일로 AI 어시스턴트가 코드 수정 가이드.

### ✅ Machine-to-Machine OAuth2
Runtime↔Gateway 간 OAuth2 Client Credentials. AWSops는 IAM Role 기반.

---

## 5. 개선 제안 (AWSops에 적용 가능)

| # | FAST에서 가져올 기능 | 난이도 | 효과 |
|---|---------------------|--------|------|
| 1 | **Code Interpreter** 통합 | 중 | AI가 Python 실행하여 데이터 분석 |
| 2 | **CDK로 IaC 전환** | 상 | 인프라 코드 관리, 재현성 |
| 3 | **Amplify 프론트엔드** 분리 | 중 | CI/CD 자동화, EC2 부하 분산 |
| 4 | **LangGraph 패턴** 추가 | 하 | 복잡한 멀티스텝 분석 워크플로우 |
| 5 | **OAuth2 M2M** 인증 | 중 | Runtime↔Gateway 보안 강화 |
| 6 | **Vibe-Coding 규칙** 파일 | 하 | .kiro/, .amazonq/ 가이드 추가 |
| 7 | **Terraform 옵션** | 중 | CloudFormation 대안 |

### 반대로, FAST에 없어서 AWSops가 우수한 영역:

| # | AWSops 고유 기능 | FAST에 없는 이유 |
|---|-----------------|-----------------|
| 1 | Steampipe 실시간 SQL | 범용 템플릿이라 데이터 소스 미포함 |
| 2 | 21개 운영 대시보드 | 채팅 UI만 목표 |
| 3 | CIS Compliance | 보안 컴플라이언스 범위 밖 |
| 4 | 네트워크 토폴로지 | 시각화 범위 밖 |
| 5 | 성능 모니터링 | CloudWatch 연동 범위 밖 |
| 6 | K9s 스타일 탐색기 | K8s 범위 밖 |
| 7 | 46항목 검증 스크립트 | 자동 검증 없음 |

---

## 6. 결론

**FAST**는 **AI Agent 풀스택 템플릿**으로, 인프라 구성과 인증 패턴에 집중.
프론트엔드(React)와 백엔드(AgentCore)를 빠르게 연결하는 것이 목표.

**AWSops**는 **AWS 운영 대시보드 + AI**로, 실시간 데이터 시각화와 분석에 집중.
Steampipe 기반 380+ 테이블 실시간 조회가 핵심 차별점.

| 용도 | 추천 |
|------|------|
| AI Agent 앱 개발 (범용) | FAST |
| **AWS/K8s 인프라 운영 + 모니터링 + AI 분석** | **AWSops** |
| 두 가지 모두 | AWSops + FAST의 Code Interpreter/CDK 통합 |
