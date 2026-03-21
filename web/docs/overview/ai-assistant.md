---
sidebar_position: 2
title: AI 어시스턴트
description: AWSops AI 어시스턴트 상세 가이드 - 10단계 라우팅 및 고급 기능
---

import Screenshot from '@site/src/components/Screenshot';

# AI 어시스턴트

AI 어시스턴트는 Amazon Bedrock AgentCore를 기반으로 자연어로 AWS 인프라를 분석하고 관리할 수 있는 기능입니다.

<Screenshot src="/screenshots/overview/ai-assistant.png" alt="AI 어시스턴트" />

## 아키텍처

![AI 의도 분류 흐름](/diagrams/ai-routing.png)

## 10단계 라우팅

AI 어시스턴트는 질문을 분석하여 가장 적합한 라우트로 자동 분류합니다.

### 라우팅 테이블

| 우선순위 | 라우트 | Gateway | 도구 수 | 설명 |
|---------|--------|---------|--------|------|
| 1 | **code** | - | - | Python 코드 실행, 계산, 시각화 |
| 2 | **network** | Network | 17 | VPC, TGW, VPN, Flow Logs, Reachability |
| 3 | **container** | Container | 24 | EKS, ECS, Istio 트러블슈팅 |
| 4 | **iac** | IaC | 12 | CDK, CloudFormation, Terraform |
| 5 | **data** | Data | 24 | DynamoDB, RDS, ElastiCache, MSK |
| 6 | **security** | Security | 14 | IAM, 정책 시뮬레이션, 보안 요약 |
| 7 | **monitoring** | Monitoring | 16 | CloudWatch, CloudTrail |
| 8 | **cost** | Cost | 9 | 비용 분석, 예측, 예산 |
| 9 | **aws-data** | Ops | SQL | 리소스 목록/현황 (Steampipe SQL) |
| 10 | **general** | Ops | 9 | 일반 AWS 질문, 문서 검색 |

### 라우트별 상세

#### 1. code - Code Interpreter

Python 코드 실행이 필요한 경우 사용됩니다.

**예시 질문:**
- "AWS 비용 데이터를 차트로 시각화해줘"
- "랜덤 숫자 통계를 계산해줘"
- "JSON 데이터를 파싱하는 코드를 만들어줘"

#### 2. network - Network Gateway

VPC 네트워킹, Transit Gateway, VPN, 트래픽 분석에 사용됩니다.

**주요 도구:**
- `list_vpcs`, `get_vpc_network_details`, `describe_network`
- `list_transit_gateways`, `get_tgw_routes`, `get_all_tgw_routes`
- `list_vpn_connections`, `list_network_firewalls`
- `analyze_reachability`, `query_flow_logs`

**예시 질문:**
- "TGW 라우트 분석해줘"
- "VPN 연결 상태 진단해줘"
- "EC2 간 통신 가능한지 확인해줘"
- "VPC Flow Logs에서 거부된 트래픽 조회해줘"

#### 3. container - Container Gateway

EKS, ECS, Istio 서비스 메시 관련 트러블슈팅에 사용됩니다.

**주요 도구:**
- `list_eks_clusters`, `get_eks_vpc_config`, `get_eks_insights`
- `ecs_resource_management`, `ecs_troubleshooting_tool`
- `istio_overview`, `list_virtual_services`, `check_sidecar_injection`

**예시 질문:**
- "EKS 클러스터 상태 진단해줘"
- "ECS 서비스가 정상인지 확인해줘"
- "Istio sidecar injection 상태 확인해줘"

#### 4. iac - IaC Gateway

Infrastructure as Code 관련 작업에 사용됩니다.

**주요 도구:**
- `validate_cloudformation_template`, `check_cloudformation_template_compliance`
- `search_cdk_documentation`, `cdk_best_practices`
- `SearchAwsProviderDocs`, `terraform_best_practices`

**예시 질문:**
- "CDK 모범사례 알려줘"
- "CloudFormation 스택 오류 원인 분석해줘"
- "Terraform VPC 모듈 검색해줘"

#### 5. data - Data Gateway

AWS 데이터베이스 및 스트리밍 서비스에 사용됩니다.

**주요 도구:**
- `list_tables`, `describe_table`, `query_table`, `dynamodb_data_modeling`
- `list_db_instances`, `describe_db_instance`, `execute_sql`
- `list_cache_clusters`, `elasticache_best_practices`
- `list_clusters` (MSK), `msk_best_practices`

**예시 질문:**
- "DynamoDB 테이블 상세 정보 보여줘"
- "RDS 인스턴스 상태 확인해줘"
- "ElastiCache 모범사례 알려줘"

#### 6. security - Security Gateway

IAM 및 보안 관련 분석에 사용됩니다.

**주요 도구:**
- `list_users`, `list_roles`, `list_policies`
- `list_access_keys`, `simulate_principal_policy`
- `get_account_security_summary`

**예시 질문:**
- "IAM 사용자 목록과 Access Key 상태 보여줘"
- "이 역할이 S3에 접근할 수 있는지 시뮬레이션해줘"
- "계정 보안 요약 알려줘"

#### 7. monitoring - Monitoring Gateway

CloudWatch 및 CloudTrail 분석에 사용됩니다.

**주요 도구:**
- `get_metric_data`, `analyze_metric`, `get_active_alarms`
- `describe_log_groups`, `execute_log_insights_query`
- `lookup_events`, `lake_query`

**예시 질문:**
- "EC2 CPU 사용량 추세 보여줘"
- "CloudTrail에서 최근 IAM 이벤트 조회해줘"
- "활성화된 알람 목록 보여줘"

#### 8. cost - Cost Gateway

비용 분석 및 최적화에 사용됩니다.

**주요 도구:**
- `get_cost_and_usage`, `get_cost_and_usage_comparisons`
- `get_cost_forecast`, `get_pricing`
- `list_budgets`

**예시 질문:**
- "이번 달 비용 분석해줘"
- "서비스별 비용 비교해줘"
- "다음 달 비용 예측해줘"

#### 9. aws-data - Bedrock + Steampipe SQL

리소스 목록, 현황, 개수 조회에 사용됩니다.

**처리 방식:**
1. Claude Sonnet이 질문에서 SQL 생성
2. Steampipe pg Pool에서 직접 쿼리 실행
3. 결과를 Bedrock이 분석하여 응답

**예시 질문:**
- "EC2 인스턴스 목록 보여줘"
- "S3 버킷이 몇 개 있는지 확인해줘"
- "VPC 네트워크 구성을 분석해줘"
- "전체 리소스 요약해줘"

#### 10. general - Ops Gateway

일반적인 AWS 질문, 문서 검색, 모범사례에 사용됩니다.

**주요 도구:**
- `search_documentation`, `read_documentation`
- `recommend`, `list_regions`, `get_regional_availability`

**예시 질문:**
- "이 서비스가 서울 리전에서 사용 가능한지 확인해줘"
- "ECS와 EKS 차이점 알려줘"
- "서버리스 아키텍처 추천해줘"

## 멀티 라우트

하나의 질문이 여러 도메인에 걸쳐 있을 때 최대 3개의 라우트로 분류되어 병렬 처리됩니다.

**예시:**
```
"VPC 보안그룹과 비용을 분석해줘"
→ ["network", "cost"]

"보안 점검하고 IAM 사용자도 확인해줘"
→ ["security"]
```

:::info 멀티 라우트 응답
멀티 라우트 처리 시 각 Gateway의 응답이 합성되어 하나의 통합된 답변으로 제공됩니다.
:::

## SSE 스트리밍

응답은 Server-Sent Events(SSE)로 스트리밍됩니다.

### 진행 상태 표시

```
질문 분석 중...
→ Network Gateway 호출 중...
→ 응답 생성 중...
```

### 스트리밍 이벤트

| 이벤트 | 설명 |
|--------|------|
| `status` | 진행 상태 메시지 |
| `done` | 완료된 응답 데이터 |
| `error` | 오류 메시지 |

## 도구 사용 표시

응답 하단에 사용된 MCP 도구가 표시됩니다.

```
Tools: list_vpcs, get_vpc_network_details, analyze_reachability
Queried: aws_vpc, aws_vpc_subnet, aws_vpc_security_group
```

## 대화 이력

### 세션 내 컨텍스트

현재 세션의 대화가 유지되어 후속 질문이 가능합니다.

```
사용자: "VPC 목록 보여줘"
AI: (VPC 목록 응답)

사용자: "그중에서 default VPC 상세 정보 알려줘"
AI: (이전 컨텍스트를 참조하여 default VPC 상세 응답)
```

### 저장된 이력

대화 이력은 사용자별로 저장되며, 화면 하단 패널에서 확인할 수 있습니다.

- **저장 정보**: 질문, 응답 요약, 라우트, 응답 시간, 타임스탬프
- **보관 기간**: 365일
- **검색**: 키워드로 이전 대화 검색 가능

## 세션 통계

화면 하단에 현재 세션의 통계가 표시됩니다.

```
5 queries  │  avg 3.2s  │  100%  │  aws-data:3  security:1  network:1
```

- **queries**: 총 질문 수
- **avg**: 평균 응답 시간
- **성공률**: 성공한 응답 비율
- **라우트 분포**: 라우트별 호출 횟수

## 연관 질문 추천

응답 후 관련된 후속 질문이 라우트별로 추천됩니다.

| 라우트 | 추천 질문 예시 |
|--------|--------------|
| security | "IAM 사용자 목록과 Access Key 상태를 보여줘" |
| network | "VPC 서브넷과 라우트 테이블을 보여줘" |
| container | "EKS 노드의 CPU/메모리 사용률을 확인해줘" |
| cost | "서비스별 비용을 비교해줘" |

## 다음 단계

- [AgentCore 상세](../overview/agentcore) - Gateway 및 도구 상세 정보
- [대시보드](../overview/dashboard) - 대시보드로 돌아가기
