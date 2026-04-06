---
sidebar_position: 1
---

# 일반 FAQ

AWSops 대시보드에 대한 일반적인 질문과 답변입니다.

<details>
<summary>AWSops는 무엇인가요?</summary>

AWSops는 AWS와 Kubernetes 환경을 위한 실시간 운영 대시보드입니다. 주요 기능은 다음과 같습니다:

- **리소스 모니터링**: EC2, Lambda, ECS, EKS, RDS, S3 등 주요 AWS 서비스 현황
- **네트워크 시각화**: VPC, 서브넷, Security Group, Transit Gateway 토폴로지
- **보안 분석**: CIS 컴플라이언스, CVE 취약점 스캔, IAM 분석
- **비용 관리**: Cost Explorer, 컨테이너 비용 분석
- **AI 어시스턴트**: 자연어 질의로 AWS 리소스 분석 및 문제 해결

Steampipe, Next.js 14, Amazon Bedrock AgentCore를 기반으로 구축되었습니다.

</details>

<details>
<summary>어떤 AWS 서비스를 지원하나요?</summary>

AWSops는 Steampipe AWS 플러그인을 통해 380개 이상의 AWS 테이블에 접근합니다. 주요 지원 서비스:

**Compute**
- EC2 인스턴스, Auto Scaling
- Lambda 함수
- ECS 클러스터/서비스/태스크
- EKS 클러스터/노드/Pod

**Storage & Database**
- S3 버킷
- EBS 볼륨/스냅샷
- RDS 인스턴스
- DynamoDB 테이블
- ElastiCache (Valkey/Redis/Memcached)
- OpenSearch 도메인
- MSK 클러스터

**Network**
- VPC, 서브넷, Security Group
- Transit Gateway, VPN
- ELB/ALB/NLB
- CloudFront, WAF

**Security & Monitoring**
- IAM 사용자/역할/정책
- CloudTrail, CloudWatch
- CIS 컴플라이언스

</details>

<details>
<summary>시스템 요구사항은 무엇인가요?</summary>

**서버 요구사항**
- EC2: t4g.2xlarge 이상 권장 (ARM64)
- 메모리: 16GB 이상
- 스토리지: 50GB 이상

**필수 소프트웨어**
- Steampipe + AWS/Kubernetes/Trivy 플러그인
- Node.js 20+
- Docker (AgentCore 빌드용)

**네트워크**
- Private Subnet 배치 권장
- ALB + CloudFront를 통한 접근
- Steampipe는 로컬(127.0.0.1:9193)에서만 접근

**클라이언트**
- 모던 웹 브라우저 (Chrome, Firefox, Safari, Edge)
- 최소 해상도: 1280x720

</details>

<details>
<summary>데이터는 어디에 저장되나요?</summary>

**실시간 데이터 (캐시 5분)**
- Steampipe 내장 PostgreSQL (포트 9193)에서 AWS/K8s API를 실시간 조회
- 결과는 node-cache를 통해 5분간 메모리 캐시
- 새로고침 버튼으로 캐시 무효화 가능

**영구 데이터**
- `data/inventory/`: 리소스 인벤토리 스냅샷 (JSON)
- `data/cost/`: Cost 데이터 스냅샷 (MSP 환경 폴백용)
- `data/memory/`: AI 대화 이력 (사용자별 분리, 365일 보관)
- `data/config.json`: 앱 설정 (AgentCore ARN 등)

**외부 저장소 없음**
- 별도의 데이터베이스 설치 불필요 (Steampipe 내장 PostgreSQL 사용)
- 모든 데이터는 EC2 인스턴스 내에 저장

</details>

<details>
<summary>비용이 발생하나요?</summary>

**무료**
- Steampipe 및 플러그인
- Powerpipe (CIS 벤치마크)
- Next.js 애플리케이션

**AWS 사용량 기반 과금**
- EC2 인스턴스 비용 (t4g.2xlarge 기준 ~$0.27/시간)
- ALB 비용
- CloudFront 비용

**AI 기능 (선택적)**
- Amazon Bedrock: 모델 사용량에 따른 토큰 기반 과금
- AgentCore Runtime: 실행 시간 기반 과금
- Lambda: 호출 수 및 실행 시간 기반

**비용 최적화 팁**
- AI 기능 비활성화 시 Bedrock/AgentCore 비용 없음
- Spot 인스턴스 사용 가능 (비프로덕션 환경)
- 사용하지 않을 때 인스턴스 중지

</details>

<details>
<summary>여러 AWS 계정을 지원하나요?</summary>

**단일 계정 모드 (기본)**
- EC2 인스턴스에 연결된 IAM Role의 계정만 조회

**멀티 계정 모드 (설정 필요)**
Steampipe의 AWS 플러그인 설정을 통해 여러 계정을 지원합니다:

```hcl
# ~/.steampipe/config/aws.spc
connection "aws_prod" {
  plugin  = "aws"
  profile = "production"
  regions = ["ap-northeast-2"]
}

connection "aws_dev" {
  plugin  = "aws"
  profile = "development"
  regions = ["ap-northeast-2"]
}

connection "aws" {
  plugin      = "aws"
  type        = "aggregator"
  connections = ["aws_*"]
}
```

집계(aggregator) 연결을 사용하면 여러 계정의 데이터를 통합하여 조회할 수 있습니다.

**Organizations 연동**
AWS Organizations를 사용하는 경우 Cross-Account Role을 통해 멤버 계정에 접근할 수 있습니다.

</details>

<details>
<summary>외부 데이터소스(Prometheus, Loki 등)를 연결할 수 있나요?</summary>

예, **7종의 외부 데이터소스**를 Grafana 스타일로 등록하고 쿼리할 수 있습니다.

**지원 데이터소스**

| 타입 | 쿼리 언어 | 주요 용도 |
|------|-----------|-----------|
| **Prometheus** | PromQL | 메트릭 수집/쿼리 |
| **Loki** | LogQL | 로그 집계/검색 |
| **Tempo** | TraceQL | 분산 추적 |
| **ClickHouse** | SQL | 분석용 데이터 웨어하우스 |
| **Jaeger** | Trace API | 분산 추적 |
| **Dynatrace** | API | APM / 풀스택 관측 |
| **Datadog** | API | 모니터링 / APM |

**등록 방법**
1. `/datasources` 페이지에서 "Add Datasource" 클릭
2. 타입, URL, 인증 방식(None/Basic/Bearer/Custom Header) 설정
3. "Test Connection"으로 연결 확인
4. 저장 — `data/config.json`의 `datasources[]` 배열에 저장됨

**인증 방식 4종**

| 방식 | 용도 |
|------|------|
| **None** | 인증 불필요 (로컬 Prometheus 등) |
| **Basic Auth** | 사용자명 + 비밀번호 (ClickHouse 등) |
| **Bearer Token** | API 토큰 (Datadog, Dynatrace 등) |
| **Custom Header** | 사용자 지정 헤더 (특수 인증) |

**보안**
- **SSRF 방어**: Private IP, Cloud metadata endpoint, Loopback 주소 차단
- **SQL Injection 방지**: ClickHouse 파라미터화 쿼리 사용
- **Credential 마스킹**: API 응답에서 비밀번호/토큰 `***` 처리
- **Admin 전용**: 데이터소스 CRUD는 Admin 권한 필요

**AI 연동**
등록된 데이터소스는 AI 종합진단의 Auto-Collect 에이전트(Trace Analyze, Incident, EKS Optimize)가 자동으로 활용합니다. AI 어시스턴트에게 "Prometheus 연결 안 돼요"라고 질문하면 데이터소스 진단 에이전트가 네트워크/인증/SSL/DNS 문제를 분석합니다.

:::info 데이터소스 관리 원칙
기존 `accounts[]`와 동일한 패턴입니다. `data/config.json`만 수정하면 코드 변경 없이 데이터소스를 추가/제거할 수 있습니다.
:::

</details>
