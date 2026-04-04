# AI 테스트 질문 20선 / AI Test Questions

AWSops 대시보드 AI 채팅(`/awsops/ai`)의 9개 라우트를 검증하기 위한 테스트 질문입니다.
(Test questions to validate all 9 AI routes in the AWSops dashboard.)

## 라우트별 질문 / Questions by Route

### 1. Security Gateway (보안, 14 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 1 | 보안 이슈가 있는지 확인해줘 | `get_account_security_summary` 호출 |
| 2 | IAM 사용자 목록과 Access Key 상태를 보여줘 | `list_users` → `list_access_keys` 체인 |
| 3 | AWSopsAgentCoreRole의 권한을 분석해줘 | `get_role_details` → `list_role_policies` |

### 2. Infra Gateway (인프라/네트워크, 41 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 4 | VPC 현황과 서브넷 구성을 알려줘 | `list_vpcs` → `get_vpc_network_details` |
| 5 | EKS 클러스터 상태와 노드 현황을 확인해줘 | `list_eks_clusters` → `get_eks_insights` |
| 6 | 보안그룹 규칙을 확인해줘 | `describe_network` |

### 3. Cost Gateway (비용, 9 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 7 | 이번 달 비용을 서비스별로 분석해줘 | `get_today_date` → `get_cost_and_usage` |
| 8 | 전월 대비 비용 변화와 증가 원인을 알려줘 | `get_cost_and_usage_comparisons` → `get_cost_comparison_drivers` |
| 9 | 다음 달 비용을 예측해줘 | `get_cost_forecast` |

### 4. Monitoring Gateway (모니터링, 16 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 10 | 현재 활성화된 CloudWatch 알람이 있어? | `get_active_alarms` |
| 11 | EC2 인스턴스 CPU 사용량 추세를 보여줘 | `get_metric_data` → `analyze_metric` |
| 12 | 최근 CloudTrail 이벤트를 조회해줘 | `lookup_events` |

### 5. Data Gateway (데이터, 24 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 13 | DynamoDB 테이블 목록을 보여줘 | `list_tables` |
| 14 | RDS 인스턴스 현황과 상태를 확인해줘 | `list_db_instances` |
| 15 | ElastiCache 클러스터 구성을 알려줘 | `list_cache_clusters` |

### 6. AWS-Data (Bedrock + Steampipe SQL)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 16 | EC2 인스턴스 목록을 보여줘 | SQL 생성 → pg Pool 쿼리 |
| 17 | S3 버킷 현황을 정리해줘 | SQL 생성 → 분석 |

### 7. IaC Gateway (IaC, 12 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 18 | CDK 모범사례를 알려줘 | `cdk_best_practices` |

### 8. Code Interpreter (코드 실행)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 19 | 피보나치 수열 처음 20개를 파이썬으로 계산해줘 | Code Interpreter 실행 |

### 9. General / Ops Gateway (일반, 9 tools)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 20 | 서울 리전에서 Bedrock이 사용 가능한지 확인해줘 | `get_regional_availability` |

### 10. EKS Cost Optimizer (EKS 리소스 최적화, auto-collect)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 21 | EKS 비용 개선점 찾아줘 | Prometheus 9개 메트릭 + Steampipe K8s + Cost API 자동 수집 |
| 22 | 컨테이너 리소스 낭비 분석해줘 | CPU/Memory usage vs requests 비교 분석 |

### 11. DB Cost Optimizer (RDS/ElastiCache/OpenSearch, auto-collect)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 23 | RDS 인스턴스 rightsizing 분석해줘 | CloudWatch CPU/Memory/IOPS + Steampipe 설정 수집 |
| 24 | ElastiCache 비용 최적화해줘 | ElastiCache 노드 메트릭 + 설정 분석 |
| 25 | 데이터베이스 비용 절감 방안 찾아줘 | RDS + ElastiCache + OpenSearch 통합 분석 |

### 12. MSK Optimizer (MSK 브로커 최적화, auto-collect)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 26 | MSK 브로커 비용 분석해줘 | CloudWatch 브로커 메트릭 + Steampipe 클러스터 설정 |
| 27 | Kafka 처리량 대비 브로커 rightsizing | CPU/Memory/BytesIn/Out 대비 인스턴스 용량 분석 |

### 13. Idle Resource Scanner (유휴 리소스 스캔, auto-collect)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 28 | 미사용 리소스 찾아줘 | 6개 카테고리 SQL 스캔 (EBS, EIP, EC2, 스냅샷, SG, gp2) |
| 29 | 비용 낭비되는 리소스 정리해줘 | 유휴 리소스별 월간 비용 추정 |

### 14. Service Trace Analyzer (서비스 트레이스, auto-collect)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 30 | 서비스 의존성 분석해줘 | Tempo/Jaeger 자동 감지 → 서비스 목록 + 트레이스 샘플 수집 |
| 31 | 지연시간 병목 찾아줘 | slow trace 분석 (duration > 500ms) |

### 15. Incident Analyzer (멀티소스 사고 분석, auto-collect)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 32 | 장애 원인 분석해줘 | Prometheus + Loki + Tempo + CloudWatch 알람 + K8s 이벤트 교차 분석 |
| 33 | 최근 이상 현상 분석해줘 | 가용 소스 자동 감지 → 타임라인 재구성 |

### 16. FinOps MCP Tools (Cost Gateway 확장)

| # | 질문 / Question | 검증 포인트 / Validation |
|---|-----------------|------------------------|
| 34 | Compute Optimizer로 rightsizing 추천 보여줘 | `get_rightsizing_recommendations` 호출 |
| 35 | Savings Plans 구매 추천해줘 | `get_savings_plans_recommendations` 호출 |
| 36 | RI 구매 추천 분석해줘 | `get_reserved_instance_recommendations` 호출 |
| 37 | Cost Optimization Hub 추천 보여줘 | `get_cost_optimization_hub_recommendations` 호출 |
| 38 | Trusted Advisor 비용 체크 결과 알려줘 | `get_trusted_advisor_cost_checks` 호출 |

## 추천 테스트 순서 / Recommended Test Order

기본 동작부터 확인 후 각 라우트를 순차 검증합니다.
(Verify basic operation first, then validate each route sequentially.)

1. **#7** (비용) — Cost Gateway 기본 동작
2. **#16** (EC2 목록) — Steampipe SQL 생성 + 쿼리
3. **#1** (보안 요약) — Security Gateway
4. **#4** (VPC 현황) — Infra Gateway
5. **#10** (알람 확인) — Monitoring Gateway
6. **#13** (DynamoDB) — Data Gateway
7. **#18** (CDK 모범사례) — IaC Gateway
8. **#19** (파이썬 코드) — Code Interpreter
9. **#20** (리전 가용성) — Ops Gateway

## 성공 기준 / Success Criteria

- [ ] 각 라우트가 올바르게 분류되는지 (`route` 필드 확인)
- [ ] `<tool_call>` / `<tool_response>` 태그가 UI에 노출되지 않는지
- [ ] 실제 AWS 데이터가 반환되는지 (하드코딩 아닌 라이브 데이터)
- [ ] 한국어 질문에 한국어로 응답하는지
- [ ] 60초 이내에 응답이 완료되는지
