---
sidebar_position: 3
---

# AI 어시스턴트 FAQ

AWSops AI 어시스턴트에 대한 질문과 답변입니다.

<details>
<summary>어떤 질문을 할 수 있나요?</summary>

AI 어시스턴트는 10개의 전문 라우트를 통해 다양한 질문에 답변합니다:

**1. Code (코드 실행)**
- "이 데이터를 분석해줘"
- "Python으로 차트 그려줘"
- 코드 인터프리터로 Python 코드 실행

**2. Network (네트워크 분석)**
- "EC2 인스턴스 A에서 B로 연결이 안 돼요"
- "VPC 피어링 라우팅 확인해줘"
- "Security Group 규칙 분석해줘"

**3. Container (컨테이너 분석)**
- "EKS Pod가 Pending 상태예요"
- "ECS 서비스 배포 실패 원인은?"
- "Istio 서비스 메시 문제 분석"

**4. IaC (Infrastructure as Code)**
- "이 CDK 코드 검토해줘"
- "CloudFormation 스택 생성 실패 원인은?"
- "Terraform 베스트 프랙티스 알려줘"

**5. Data (데이터베이스)**
- "RDS 연결이 느려요"
- "DynamoDB 쓰로틀링 원인은?"
- "ElastiCache 메모리 부족 해결 방법"

**6. Security (보안)**
- "이 IAM 정책 권한 분석해줘"
- "S3 버킷 접근 권한 시뮬레이션"
- "크로스 계정 역할 설정 방법"

**7. Monitoring (모니터링)**
- "CloudWatch 알람 설정 방법"
- "CloudTrail에서 특정 이벤트 찾아줘"
- "EC2 CPU 사용률 추이 분석"

**8. Cost (비용)**
- "이번 달 비용 분석해줘"
- "비용 급증 원인은?"
- "비용 최적화 방안 추천해줘"

**9. AWS Data (리소스 목록/현황)**
- "EC2 인스턴스 목록 보여줘"
- "RDS 인스턴스 상태 확인"
- "Lambda 함수 런타임별 통계"

**10. General (일반)**
- 위 카테고리에 해당하지 않는 AWS 관련 질문

**11. Datasource (데이터소스 진단)**
- "Prometheus 연결이 안 돼요"
- "데이터소스 인증 문제 분석해줘"

</details>

<details>
<summary>AI가 잘못된 답변을 하면 어떻게 하나요?</summary>

AI 어시스턴트는 Amazon Bedrock (Claude Sonnet/Opus 4.6)을 기반으로 합니다.

**데이터 정확성**
- AWS 리소스 데이터는 Steampipe를 통해 **실시간** 조회
- 데이터 자체는 정확하지만, AI의 **해석**이 틀릴 수 있음

**잘못된 답변 대처 방법**

1. **추가 질문으로 확인**
   - "그 정보의 출처가 뭐야?"
   - "더 자세히 설명해줘"

2. **직접 확인**
   - 대시보드의 해당 페이지에서 데이터 직접 확인
   - AWS 콘솔에서 검증

3. **피드백 제공**
   - 대화에서 "틀렸어" 또는 "다시 확인해줘"라고 말하면 재분석
   - 구체적인 오류를 지적하면 더 정확한 답변 가능

**AI 한계**
- 실시간 이벤트 (현재 진행 중인 장애)는 즉시 인지 불가
- AWS 서비스의 최신 기능은 학습 데이터에 포함되지 않을 수 있음
- 계정별 특수 설정이나 SCP 제한은 고려하지 못할 수 있음

</details>

<details>
<summary>대화 내역은 저장되나요?</summary>

예, 대화 내역은 사용자별로 저장됩니다.

**저장 위치**
- 서버: `data/memory/` 디렉토리
- 사용자별 분리: Cognito 사용자 ID(sub) 기준

**보관 기간**
- 최대 365일
- AgentCore Memory Store 사용

**확인 방법**
- AgentCore 대시보드 페이지에서 대화 이력 검색 가능
- 날짜, 키워드로 필터링

**개인정보 보호**
- 대화 내역은 해당 사용자만 접근 가능
- 다른 사용자의 대화 내역은 조회 불가
- 서버 관리자는 파일 시스템에서 접근 가능

**삭제 요청**
현재 UI에서 직접 삭제 기능은 없습니다. 관리자에게 요청하거나 서버에서 직접 삭제해야 합니다:
```bash
rm data/memory/<user-sub>/*
```

:::info 기술 상세
Memory Store 내부 동작(인메모리 캐시 + 디바운스 flush), 사용자별 분리 원리는 [AgentCore & Memory FAQ](./agentcore-memory)를 참고하세요.
:::

</details>

<details>
<summary>코드 실행이 가능한가요?</summary>

예, Code Interpreter를 통해 Python 코드를 실행할 수 있습니다.

**사용 방법**
- "Python으로 분석해줘"
- "코드로 계산해줘"
- "차트 그려줘"
- 데이터 분석, 시각화 관련 질문

**지원 기능**
- Python 3.x 실행 환경
- 주요 라이브러리: pandas, numpy, matplotlib, seaborn
- 파일 입출력 (임시 디렉토리 내)
- 차트/그래프 생성

**제한 사항**
- 샌드박스 환경 (네트워크 접근 제한)
- 실행 시간 제한
- AWS API 직접 호출 불가 (대신 AI가 먼저 데이터 조회 후 분석)

**예시 질문**
- "EC2 인스턴스 타입별 비용을 파이 차트로 보여줘"
- "최근 30일 CloudTrail 이벤트를 시간대별로 분석해줘"
- "Lambda 함수 메모리 사용량 통계를 계산해줘"

</details>

<details>
<summary>어떤 도구를 사용하나요?</summary>

AI 어시스턴트는 125개의 MCP(Model Context Protocol) 도구를 사용합니다.

**Gateway 구성 (8개)**

| Gateway | 용도 | 주요 도구 |
|---------|------|----------|
| Network | 네트워크 분석 | Reachability Analyzer, Flow Logs, TGW, VPN |
| Container | 컨테이너 분석 | EKS, ECS, Istio 진단 |
| IaC | 인프라 코드 | CDK, CloudFormation, Terraform |
| Data | 데이터베이스 | DynamoDB, RDS, ElastiCache, MSK |
| Security | 보안 | IAM 시뮬레이션, 정책 분석 |
| Monitoring | 모니터링 | CloudWatch, CloudTrail |
| Cost | 비용 | CE API, 예산, 예측 |
| Ops | 운영 | 범용 AWS 작업 |

**Lambda 함수 (19개)**
각 Gateway의 백엔드로 Lambda 함수가 실행됩니다.

**도구 사용 표시**
AI 응답에서 어떤 도구를 사용했는지 UI에 표시됩니다. 응답 내용의 키워드를 기반으로 추론합니다.

:::info 기술 상세
Gateway↔Lambda 관계, MCP 프로토콜 동작 방식, 새 도구 추가 방법은 [AgentCore & Memory FAQ](./agentcore-memory)를 참고하세요.
:::

</details>

<details>
<summary>응답이 느린 경우 어떻게 하나요?</summary>

AI 응답 지연의 일반적인 원인과 해결 방법입니다.

**1. AgentCore Runtime Cold Start**
- 첫 번째 요청은 컨테이너 시작에 시간이 걸림 (10-30초)
- 이후 요청은 빠름 (Warm 상태)
- 해결: 주기적인 헬스체크로 Warm 상태 유지

**2. 복잡한 질문**
- 여러 Gateway를 거치는 질문은 시간이 더 걸림
- 해결: 질문을 단순하게 분리
- 예: "네트워크 문제 분석하고 비용도 확인해줘" → 두 개의 질문으로 분리

**3. 대용량 데이터 조회**
- CloudTrail 이벤트, 대량의 리소스 목록
- 해결: 기간이나 필터 조건 명시
- 예: "최근 1시간 CloudTrail 이벤트" 또는 "production 태그가 있는 EC2만"

**4. 네트워크 지연**
- CloudFront → ALB → EC2 → AgentCore 경로
- 해결: CloudFront Origin Timeout 설정 확인 (60초 권장)

**스트리밍 응답**
AI 응답은 SSE(Server-Sent Events)로 스트리밍됩니다. 전체 응답을 기다리지 않고 실시간으로 텍스트가 표시됩니다.

**타임아웃**
- 기본 타임아웃: 120초
- 타임아웃 발생 시 질문을 단순화하거나 다시 시도하세요

:::info 기술 상세
FTTT(Time To First Token) 구성 요소와 단계별 소요 시간, 개선 방법은 [아키텍처 Deep Dive](./architecture)를 참고하세요.
:::

</details>

<details>
<summary>AI 종합진단 리포트란 무엇인가요?</summary>

AI 종합진단(`/ai-diagnosis`)은 AWS 환경 전체를 **15개 섹션**으로 분석하는 종합 리포트입니다.

**분석 섹션 (Well-Architected 기반)**
- **비용 최적화**: EC2/RDS/ElastiCache 라이트사이징, 유휴 리소스, Savings Plans
- **보안**: IAM 정책, Security Group, 암호화, 컴플라이언스
- **안정성**: EKS 워크로드, MSK 클러스터, 데이터베이스 가용성
- **운영 우수성**: 모니터링 알람, 인시던트, 서비스 추적
- **종합 요약**: 6개 Well-Architected 필러별 점수 + 핵심 권고사항

**리포트 생성 방식**
1. 6종 Auto-Collect 에이전트가 멀티 소스에서 데이터 자동 수집
2. 15개 섹션을 5개 배치(배치당 3개)로 병렬 Bedrock 분석
3. 진행률을 5초마다 프론트엔드에 폴링
4. 완료 시 DOCX/MD를 S3에 업로드, 7일 Presigned URL 생성

**내보내기 형식**

| 형식 | 방법 |
|------|------|
| **DOCX** | 다운로드 버튼 (A4 전문 리포트, 표지+목차+섹션별 스타일) |
| **Markdown** | 다운로드 버튼 (모든 섹션 합본 `.md` 파일) |
| **PDF** | "인쇄/PDF 저장" 버튼 → 브라우저 Print-to-PDF |

:::info 예약 리포트
주간/격주/월간 주기로 자동 생성할 수 있습니다. AI 종합진단 페이지의 예약 설정 패널에서 빈도, 요일, 시간, 언어를 설정하세요.
:::

</details>

<details>
<summary>Auto-Collect 에이전트란 무엇인가요?</summary>

Auto-Collect 에이전트는 AI 종합진단 리포트를 위해 **멀티 소스에서 데이터를 자동 수집**하는 6종의 전용 에이전트입니다.

| 에이전트 | 수집 대상 |
|----------|-----------|
| **EKS Optimize** | Prometheus 메트릭 + K8s 리소스 + EKS 비용 (CPU/메모리, 스로틀링, Pod 재시작) |
| **DB Optimize** | RDS/ElastiCache/OpenSearch 인스턴스 + CloudWatch 메트릭 (라이트사이징 분석) |
| **MSK Optimize** | MSK 브로커 + CloudWatch + Prometheus Kafka 메트릭 (처리량, 컨슈머 랙) |
| **Idle Scan** | 미부착 EBS, gp2 볼륨, 미사용 EIP, 중지 EC2, 오래된 스냅샷 + 비용 추정 |
| **Trace Analyze** | Tempo/Jaeger 트레이스 + Prometheus 서비스 메트릭 (에러/느린 트레이스) |
| **Incident** | CloudWatch ALARM + K8s Warning 이벤트 + Prometheus 이상 징후 |

**동작 원리**
- 모든 에이전트는 동일한 `Collector` 인터페이스를 구현
- `Promise.allSettled`로 멀티 소스 병렬 수집
- `SendFn` 콜백으로 진행 상황을 실시간 스트리밍
- 수집된 데이터는 Bedrock에 전달되어 섹션별 분석 생성

**외부 데이터소스 연동**
Trace Analyze, Incident, EKS Optimize 에이전트는 Prometheus, Tempo, Jaeger 등 외부 데이터소스가 등록되어 있을 때 더 풍부한 분석을 제공합니다. `/datasources` 페이지에서 데이터소스를 등록하세요.

</details>

<details>
<summary>FinOps MCP 도구란 무엇인가요?</summary>

Cost Gateway에 추가된 **5개 FinOps 전용 MCP 도구**입니다. AI 어시스턴트에게 비용 최적화를 질문하면 자동으로 호출됩니다.

| 도구 | 설명 |
|------|------|
| **Rightsizing Recommendations** | Compute Optimizer 기반 EC2/RDS/ECS/Lambda 라이트사이징 + 월간 절감액 |
| **Savings Plans Recommendations** | Cost Explorer 기반 SP 구매 추천 (1년/3년, No Upfront) |
| **Reserved Instance Recommendations** | RI 구매 추천 (EC2/RDS/ElastiCache/Redshift) |
| **Cost Optimization Hub** | 통합 최적화 추천 (Rightsize/Stop/Upgrade/SP) |
| **Trusted Advisor Cost Checks** | 비용 최적화 카테고리 체크 + 플래그 리소스 |

**크로스 계정 지원**
모든 도구는 `target_account_id` 파라미터로 멀티 계정 환경에서도 사용 가능합니다.

**사용 예시**
- "비용 절감 방안 추천해줘"
- "EC2 라이트사이징 추천 보여줘"
- "Savings Plans 구매하면 얼마나 절약돼?"

</details>
