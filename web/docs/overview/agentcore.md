---
sidebar_position: 3
title: AgentCore
description: Amazon Bedrock AgentCore 아키텍처 및 MCP 도구 상세
---

import Screenshot from '@site/src/components/Screenshot';

# AgentCore

AgentCore는 Amazon Bedrock AgentCore Runtime과 Gateway를 기반으로 AI 어시스턴트의 도구 실행을 담당합니다.

<Screenshot src="/screenshots/overview/agentcore.png" alt="AgentCore" />

## 아키텍처

![AgentCore 아키텍처](/diagrams/agentcore-architecture.png)

## AgentCore Runtime

### 구성

| 항목 | 설명 |
|------|------|
| **엔진** | Strands Agent Framework |
| **컨테이너** | Docker arm64 (ECR 저장) |
| **실행 환경** | AgentCore 관리형 서비스 |
| **모델** | Claude Sonnet/Opus 4.6 |

### 상태

- **READY**: 정상 작동 중
- **CREATING**: 생성 중
- **UPDATING**: 업데이트 중
- **FAILED**: 오류 상태

## Gateway 상세

### Network Gateway (17 tools)

VPC, Transit Gateway, VPN, 네트워크 분석 도구를 제공합니다.

| 도구 | 설명 |
|------|------|
| `list_vpcs` | VPC 목록 조회 |
| `get_vpc_network_details` | VPC 네트워크 상세 |
| `describe_network` | 네트워크 구성 설명 |
| `find_ip_address` | IP 주소 검색 |
| `get_eni_details` | ENI 상세 정보 |
| `get_vpc_flow_logs` | VPC Flow Logs 조회 |
| `list_transit_gateways` | TGW 목록 |
| `get_tgw_details` | TGW 상세 |
| `get_tgw_routes` | TGW 라우트 테이블 |
| `get_all_tgw_routes` | 전체 TGW 라우트 |
| `list_tgw_peerings` | TGW 피어링 목록 |
| `list_vpn_connections` | VPN 연결 목록 |
| `list_network_firewalls` | Network Firewall 목록 |
| `get_firewall_rules` | 방화벽 규칙 조회 |
| `analyze_reachability` | Reachability Analyzer |
| `query_flow_logs` | Flow Logs 쿼리 |
| `get_path_trace_methodology` | 경로 추적 방법론 |

### Container Gateway (24 tools)

EKS, ECS, Istio 서비스 메시 관련 도구를 제공합니다.

| 카테고리 | 도구 |
|---------|------|
| **EKS** | `list_eks_clusters`, `get_eks_vpc_config`, `get_eks_insights`, `get_cloudwatch_logs`, `get_cloudwatch_metrics`, `get_eks_metrics_guidance`, `get_policies_for_role`, `search_eks_troubleshoot_guide`, `generate_app_manifest` |
| **ECS** | `ecs_resource_management`, `ecs_troubleshooting_tool`, `wait_for_service_ready` |
| **Istio** | `istio_overview`, `list_virtual_services`, `list_destination_rules`, `list_istio_gateways`, `list_service_entries`, `list_authorization_policies`, `list_peer_authentications`, `check_sidecar_injection`, `list_envoy_filters`, `list_istio_crds`, `istio_troubleshooting`, `query_istio_resource` |

### IaC Gateway (12 tools)

Infrastructure as Code 관련 도구를 제공합니다.

| 도구 | 설명 |
|------|------|
| `validate_cloudformation_template` | CFn 템플릿 검증 |
| `check_cloudformation_template_compliance` | CFn 컴플라이언스 체크 |
| `troubleshoot_cloudformation_deployment` | CFn 배포 트러블슈팅 |
| `search_cdk_documentation` | CDK 문서 검색 |
| `search_cloudformation_documentation` | CFn 문서 검색 |
| `cdk_best_practices` | CDK 모범사례 |
| `read_iac_documentation_page` | IaC 문서 페이지 읽기 |
| `SearchAwsProviderDocs` | Terraform AWS Provider 문서 |
| `SearchAwsccProviderDocs` | Terraform AWSCC Provider 문서 |
| `SearchSpecificAwsIaModules` | AWS IA 모듈 검색 |
| `SearchUserProvidedModule` | 사용자 모듈 검색 |
| `terraform_best_practices` | Terraform 모범사례 |

### Data Gateway (24 tools)

AWS 데이터베이스 및 스트리밍 서비스 도구를 제공합니다.

| 카테고리 | 도구 |
|---------|------|
| **DynamoDB** | `list_tables`, `describe_table`, `query_table`, `get_item`, `dynamodb_data_modeling`, `compute_performances_and_costs` |
| **RDS/Aurora** | `list_db_instances`, `list_db_clusters`, `describe_db_instance`, `describe_db_cluster`, `execute_sql`, `list_snapshots` |
| **ElastiCache** | `list_cache_clusters`, `describe_cache_cluster`, `list_replication_groups`, `describe_replication_group`, `list_serverless_caches`, `elasticache_best_practices` |
| **MSK** | `list_clusters`, `get_cluster_info`, `get_configuration_info`, `get_bootstrap_brokers`, `list_nodes`, `msk_best_practices` |

### Security Gateway (14 tools)

IAM 및 보안 분석 도구를 제공합니다.

| 도구 | 설명 |
|------|------|
| `list_users` | IAM 사용자 목록 |
| `get_user` | 사용자 상세 |
| `list_roles` | IAM 역할 목록 |
| `get_role_details` | 역할 상세 |
| `list_groups` | IAM 그룹 목록 |
| `get_group` | 그룹 상세 |
| `list_policies` | 정책 목록 |
| `list_user_policies` | 사용자 정책 목록 |
| `list_role_policies` | 역할 정책 목록 |
| `get_user_policy` | 사용자 인라인 정책 |
| `get_role_policy` | 역할 인라인 정책 |
| `list_access_keys` | Access Key 목록 |
| `simulate_principal_policy` | 정책 시뮬레이션 |
| `get_account_security_summary` | 계정 보안 요약 |

### Monitoring Gateway (16 tools)

CloudWatch 및 CloudTrail 관련 도구를 제공합니다.

| 카테고리 | 도구 |
|---------|------|
| **CloudWatch Metrics** | `get_metric_data`, `get_metric_metadata`, `analyze_metric`, `get_recommended_metric_alarms`, `get_active_alarms`, `get_alarm_history` |
| **CloudWatch Logs** | `describe_log_groups`, `analyze_log_group`, `execute_log_insights_query`, `get_logs_insight_query_results`, `cancel_logs_insight_query` |
| **CloudTrail** | `lookup_events`, `list_event_data_stores`, `lake_query`, `get_query_status`, `get_query_results` |

### Cost Gateway (9 tools)

비용 분석 및 예측 도구를 제공합니다.

| 도구 | 설명 |
|------|------|
| `get_today_date` | 오늘 날짜 조회 |
| `get_cost_and_usage` | 비용 및 사용량 조회 |
| `get_cost_and_usage_comparisons` | 비용 비교 |
| `get_cost_comparison_drivers` | 비용 변동 원인 |
| `get_cost_forecast` | 비용 예측 |
| `get_dimension_values` | 차원 값 조회 |
| `get_tag_values` | 태그 값 조회 |
| `get_pricing` | AWS 서비스 가격 |
| `list_budgets` | 예산 목록 |

### Ops Gateway (9 tools)

일반 AWS 운영 및 문서 관련 도구를 제공합니다.

| 도구 | 설명 |
|------|------|
| `search_documentation` | AWS 문서 검색 |
| `read_documentation` | AWS 문서 읽기 |
| `recommend` | 추천 |
| `list_regions` | AWS 리전 목록 |
| `get_regional_availability` | 리전별 서비스 가용성 |
| `prompt_understanding` | 프롬프트 이해 |
| `call_aws` | AWS API 호출 |
| `suggest_aws_commands` | AWS CLI 명령 제안 |
| `run_steampipe_query` | Steampipe SQL 실행 |

## Code Interpreter

Python 코드 실행을 위한 샌드박스 환경을 제공합니다.

### 특징

- **격리된 환경**: 안전한 Python 실행
- **데이터 분석**: pandas, numpy 등 라이브러리 지원
- **시각화**: matplotlib, plotly 등 차트 생성
- **파일 처리**: JSON, CSV 등 데이터 파싱

### 사용 예시

```
"AWS 비용 데이터를 월별 추이 차트로 시각화해줘"
"이 JSON 데이터를 파싱해서 통계를 계산해줘"
```

## 호출 통계

AgentCore 페이지에서 다음 통계를 확인할 수 있습니다:

| 통계 | 설명 |
|------|------|
| **총 호출** | 전체 AI 요청 수 |
| **평균 응답 시간** | 평균 처리 시간 |
| **사용된 도구** | 고유 도구 수, 총 호출 횟수 |
| **성공률** | 성공/실패 비율 |
| **멀티 라우트** | 병렬 Gateway 호출 수 |
| **라우트별 호출 분포** | 각 라우트 사용 비율 |

## 대화 이력 검색

AgentCore 페이지에서 저장된 대화 이력을 검색할 수 있습니다.

### 검색 기능

- **키워드 검색**: 질문 내용으로 검색
- **최근 대화**: 시간순 정렬
- **라우트 필터**: 라우트별 필터링 (UI에서)

### 표시 정보

- 질문 내용
- 응답 요약
- 라우트
- 사용된 도구 수
- 응답 시간
- 타임스탬프

## 설정 파일

AgentCore 설정은 `data/config.json`에서 관리됩니다.

```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID",
  "codeInterpreterName": "awsops_code_interpreter-XXXXX",
  "memoryId": "awsops_memory-XXXXX",
  "memoryName": "awsops_memory"
}
```

:::tip 계정별 배포
새 계정에 배포할 때는 이 config 파일만 업데이트하면 됩니다. 코드 수정은 필요하지 않습니다.
:::

## 알려진 제한사항

| 항목 | 제한 |
|------|------|
| **Docker 아키텍처** | arm64 필수 |
| **Code Interpreter 이름** | 하이픈 불가, 언더스코어만 |
| **Memory 이름** | 하이픈 불가, 언더스코어만 |
| **대화 이력 보관** | 최대 365일 |
| **AgentCore 응답** | 최종 텍스트만 반환 (도구 추론) |

## 다음 단계

- [AI 어시스턴트](../overview/ai-assistant) - AI 기능 활용하기
- [대시보드](../overview/dashboard) - 대시보드로 돌아가기
