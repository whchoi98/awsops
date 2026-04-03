---
sidebar_position: 7
title: 데이터소스
description: 외부 데이터소스 연동 관리 (Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog)
---

import Screenshot from '@site/src/components/Screenshot';
import DatasourceFlow from '@site/src/components/diagrams/DatasourceFlow';
import DatasourceExploreFlow from '@site/src/components/diagrams/DatasourceExploreFlow';

# 데이터소스

외부 모니터링 및 관측성 시스템을 AWSops에 연동하여 통합 관리할 수 있는 Grafana 스타일의 데이터소스 관리 페이지입니다.

<Screenshot src="/screenshots/monitoring/datasources.png" alt="Datasources" />

## 개요

AWSops 데이터소스 기능은 외부 관측성 플랫폼을 중앙에서 관리합니다. 데이터소스를 등록하면 대시보드에서 쿼리를 실행하거나, AI 어시스턴트가 분석에 활용할 수 있습니다.

<DatasourceFlow />

주요 특징:
- **7종 데이터소스** 지원 (Prometheus, Loki, Tempo, ClickHouse, Jaeger, Dynatrace, Datadog)
- **CRUD 관리**: 데이터소스 추가, 수정, 삭제 (관리자 전용)
- **연결 테스트**: 원클릭 연결 확인 및 응답 시간 측정
- **쿼리 실행**: 각 데이터소스 고유 쿼리 언어 지원
- **보안**: SSRF 방지, 자격 증명 마스킹

## 지원 데이터소스

| 데이터소스 | 쿼리 언어 | 기본 포트 | 주요 기능 |
|-----------|----------|----------|----------|
| **Prometheus** | PromQL | 9090 | 메트릭 수집, 알림, 시계열 데이터 |
| **Loki** | LogQL | 3100 | 로그 집계, 레이블 기반 검색 |
| **Tempo** | TraceQL | 3200 | 분산 트레이싱, 스팬 검색 |
| **ClickHouse** | SQL | 8123 | 컬럼 기반 분석, 대량 데이터 처리 |
| **Jaeger** | Trace ID | 16686 | 분산 트레이싱, 서비스 의존성 |
| **Dynatrace** | DQL | 443 | 풀스택 모니터링, AI 기반 분석 |
| **Datadog** | Query | 443 | 인프라 모니터링, APM, 로그 |

## 데이터소스 추가

:::info 관리자 전용
데이터소스 생성, 수정, 삭제는 관리자 역할이 필요합니다. 관리자는 `data/config.json`의 `adminEmails`에 등록된 사용자입니다.
:::

### 설정 필드

| 필드 | 필수 | 설명 |
|------|------|------|
| **Name** | O | 데이터소스 식별 이름 |
| **Type** | O | 데이터소스 유형 (7종 중 선택) |
| **URL** | O | 엔드포인트 URL (예: `http://prometheus:9090`) |
| **Authentication** | - | 인증 방식 (None, Basic, Bearer Token, Custom Header) |
| **Timeout** | - | 요청 타임아웃 (기본값: 30초) |
| **Cache TTL** | - | 캐시 유효 시간 (기본값: 5분) |
| **Database** | - | 데이터베이스 이름 (ClickHouse 전용) |

### 추가 절차

1. **Datasources** 페이지에서 **Add Datasource** 버튼 클릭
2. 데이터소스 유형 선택
3. 이름, URL, 인증 정보 입력
4. **Test Connection**으로 연결 확인
5. **Save**로 저장

## 연결 테스트

**Test Connection** 버튼을 클릭하면 데이터소스별로 다음을 확인합니다:

| 데이터소스 | 테스트 엔드포인트 | 확인 내용 |
|-----------|-----------------|----------|
| Prometheus | `/-/healthy` | 서버 상태, 응답 시간 |
| Loki | `/ready` | 서버 준비 상태, 응답 시간 |
| Tempo | `/ready` | 서버 준비 상태, 응답 시간 |
| ClickHouse | `SELECT 1` | 쿼리 실행 가능 여부, 응답 시간 |
| Jaeger | `/api/services` | 서비스 목록 조회, 응답 시간 |
| Dynatrace | `/api/v2/entities` | API 접근 가능 여부, 응답 시간 |
| Datadog | `/api/v1/validate` | API 키 유효성, 응답 시간 |

테스트 결과에는 연결 성공/실패 상태와 응답 지연 시간(ms)이 표시됩니다.

## 쿼리 실행

각 데이터소스의 고유 쿼리 언어를 사용하여 직접 쿼리를 실행할 수 있습니다.

### PromQL (Prometheus)

```promql
rate(http_requests_total{job="api-server"}[5m])
```

CPU 사용률, 요청률, 에러율 등 메트릭 데이터를 시계열로 조회합니다.

### LogQL (Loki)

```logql
{namespace="production"} |= "error" | json | line_format "{{.message}}"
```

레이블 기반 로그 검색과 파이프라인 필터링을 지원합니다.

### TraceQL (Tempo)

```
{span.http.status_code >= 500 && resource.service.name = "api"}
```

분산 트레이스를 조건 기반으로 검색합니다.

### ClickHouse SQL

```sql
SELECT toStartOfHour(timestamp) AS hour, count() AS events
FROM logs
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour
```

대량 데이터에 대한 빠른 분석 쿼리를 실행합니다.

### Jaeger

서비스 이름 또는 Trace ID로 분산 트레이스를 검색합니다.

### Dynatrace (DQL)

```
fetch logs | filter contains(content, "error") | limit 100
```

### Datadog

메트릭 쿼리 또는 로그 검색 구문을 사용합니다.

## 인증 설정

데이터소스 연결 시 4가지 인증 방식을 지원합니다:

| 인증 방식 | 설명 | 사용 예시 |
|----------|------|----------|
| **None** | 인증 없음 | 내부 네트워크의 Prometheus/Loki |
| **Basic** | 사용자명/비밀번호 | ClickHouse, 인증이 설정된 Prometheus |
| **Bearer Token** | API 토큰 | Dynatrace, Datadog, Tempo |
| **Custom Header** | 사용자 정의 헤더 | 커스텀 프록시, API 게이트웨이 |

:::tip 자격 증명 마스킹
저장된 비밀번호와 토큰은 UI에서 마스킹 처리됩니다. 수정 시에만 새 값을 입력할 수 있습니다.
:::

## 보안

### SSRF 방지

데이터소스 URL에 대해 다음 보안 검사가 적용됩니다:

- **프라이빗 IP 차단**: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.0.0.1` 등 내부 IP 차단
- **메타데이터 엔드포인트 차단**: `169.254.169.254` (EC2 인스턴스 메타데이터) 접근 차단
- **링크-로컬 주소 차단**: `169.254.x.x` 대역 차단
- **프로토콜 제한**: `http://`와 `https://`만 허용

:::caution SSRF 보호
외부 데이터소스 URL은 서버에서 요청을 전송하므로 SSRF(Server-Side Request Forgery) 공격을 방지하기 위해 내부 네트워크 접근이 차단됩니다.
:::

### ClickHouse SQL 인젝션 방지

ClickHouse 쿼리 실행 시 위험한 SQL 구문(DROP, ALTER, INSERT, UPDATE, DELETE, TRUNCATE 등)이 차단됩니다. 읽기 전용 쿼리(SELECT)만 허용됩니다.

## AI 연동

AI 어시스턴트는 등록된 데이터소스를 활용하여 분석을 수행할 수 있습니다.

### 사용 예시

- "Prometheus에서 지난 1시간 CPU 사용률 추이를 보여줘"
- "Loki에서 production 네임스페이스의 에러 로그를 검색해줘"
- "ClickHouse에서 오늘 이벤트 수를 시간대별로 집계해줘"

### 동작 방식

1. AI 어시스턴트가 질문을 분석하여 적절한 데이터소스를 선택
2. 데이터소스 유형에 맞는 쿼리를 자동 생성
3. 쿼리 결과를 기반으로 분석 및 인사이트 제공

:::tip datasource 라우트 연동
데이터소스 관련 질문은 `datasource` 라우트를 통해 처리됩니다. AI가 Steampipe 데이터와 외부 데이터소스를 함께 분석할 수 있습니다.
:::

## 설정 참조

### 공통 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| **timeout** | 30초 | 요청 타임아웃 (최대 120초) |
| **cacheTTL** | 300초 (5분) | 쿼리 결과 캐시 유효 시간 |

### ClickHouse 전용

| 설정 | 기본값 | 설명 |
|------|--------|------|
| **database** | `default` | 대상 데이터베이스 이름 |

### 제한사항

- 최대 등록 가능 데이터소스 수: 제한 없음
- 쿼리 결과 최대 행 수: 1,000행
- ClickHouse: SELECT 쿼리만 허용 (DDL/DML 차단)
- URL: 프라이빗 IP 및 메타데이터 엔드포인트 차단

## Explore 페이지

Explore 페이지에서는 등록된 데이터소스에 직접 쿼리를 실행하고 결과를 시각화할 수 있습니다. AI 쿼리 생성과 멀티 시리즈 차트를 지원합니다.

<DatasourceExploreFlow />

### 주요 기능

- **데이터소스 선택 드롭다운**: 등록된 모든 데이터소스 중 쿼리 대상을 선택합니다.
- **시간 범위 프리셋**: 15m, 1h, 6h, 24h, 7d, 30d 중 선택하여 조회 기간을 지정합니다.
- **네이티브 쿼리 에디터**: 데이터소스 타입별 구문 하이라이팅이 적용된 쿼리 에디터를 제공합니다 (PromQL, LogQL, SQL 등).
- **예제 쿼리 칩**: 데이터소스 타입별로 자주 사용되는 쿼리를 원클릭으로 입력할 수 있습니다.
- **결과 메타데이터**: 쿼리 실행 후 행 수, 실행 시간(ms), 쿼리 언어가 상단에 표시됩니다.

### AI 쿼리 생성

**AI Assist** 토글을 활성화하면 자연어로 쿼리를 작성할 수 있습니다. Bedrock Sonnet이 데이터소스 타입에 맞는 쿼리를 자동 생성하고 설명 배너를 표시합니다.

**데이터소스 타입별 예시 프롬프트:**

| 데이터소스 | 예시 프롬프트 |
|-----------|-------------|
| Prometheus | "지난 1시간 동안 CPU 사용률 상위 5개 Pod" |
| Loki | "production 네임스페이스에서 error 레벨 로그 검색" |
| ClickHouse | "오늘 시간대별 이벤트 수 집계" |
| Tempo | "500 에러가 발생한 트레이스 검색" |

**사용 방법:**

1. AI Assist 토글을 ON으로 전환
2. 자연어로 원하는 데이터를 설명
3. **Ctrl+Enter** 또는 실행 버튼 클릭
4. Bedrock Sonnet이 PromQL/LogQL/SQL 쿼리를 생성
5. 생성된 쿼리와 함께 설명 배너가 표시됨

:::tip AI Assist 단축키
**Ctrl+Enter**로 빠르게 쿼리를 생성하고 실행할 수 있습니다.
:::

### 멀티 시리즈 차트

Prometheus 데이터소스에서 최대 **8개 시리즈**를 동시에 시각화할 수 있습니다.

- **Line/Bar 차트 토글**: 데이터 특성에 맞는 차트 유형을 선택합니다.
- **커스텀 컬러 팔레트**: 각 시리즈에 고유 색상이 자동 할당되며, 8가지 테마 컬러를 사용합니다.
- **시리즈 수 표시기**: 차트 하단에 현재 렌더링 중인 시리즈 수가 표시됩니다.

:::info 시리즈 제한
성능을 위해 Prometheus 멀티 시리즈 차트는 최대 8개 시리즈로 제한됩니다. 8개를 초과하는 결과는 상위 8개만 표시됩니다.
:::

## 데이터소스 진단

데이터소스 연결에 문제가 있을 때 **Diagnose** 버튼(청진기 아이콘)을 클릭하면 자동으로 8단계 진단을 수행합니다.

:::info 관리자 전용
Diagnose 기능은 관리자 역할이 필요합니다.
:::

### datasource-diag AI 라우트

진단 요청은 `datasource-diag` AI 라우트로 전달됩니다. 이 라우트는 데이터소스 연결 문제를 체계적으로 분석하기 위해 8개의 전문 진단 도구를 순차적으로 실행합니다.

### 8단계 자동 진단

| 단계 | 도구 | 설명 |
|------|------|------|
| 1 | **URL Validation** | URL 형식, 프로토콜, Allowed Networks 목록 검증 |
| 2 | **DNS Resolution** | 호스트명을 IP로 변환하고 도달 가능성 확인 |
| 3 | **NLB Health** | Network Load Balancer 대상 그룹 상태 점검 |
| 4 | **SG Chain** | Security Group 인바운드/아웃바운드 규칙 체인 검증 |
| 5 | **Network Path** | VPC 라우팅, 서브넷, NACL 경로 추적 |
| 6 | **HTTP Test** | HTTP 요청 전송 및 응답 코드/본문 검증 |
| 7 | **K8s Endpoint** | Kubernetes Service 및 Pod 엔드포인트 상태 확인 |
| 8 | **Full Report** | 모든 결과를 종합한 진단 리포트 생성 |

진단이 시작되면 자동으로 AI 어시스턴트 화면으로 이동하여 실시간으로 진단 과정을 확인할 수 있습니다.

## Allowed Networks

관리자는 SSRF 방지로 차단되는 프라이빗 네트워크에 대해 예외 허용 목록을 설정할 수 있습니다.

:::info 관리자 전용
Allowed Networks 설정은 관리자 역할이 필요합니다.
:::

### 지원 패턴

| 패턴 유형 | 예시 | 설명 |
|----------|------|------|
| **CIDR** | `10.0.0.0/16` | 특정 서브넷 대역 허용 |
| **단일 IP** | `10.0.1.50` | 특정 IP 주소 허용 |
| **호스트명** | `prometheus.internal` | 특정 내부 호스트명 허용 |

### SSRF 방지와의 관계

기본적으로 프라이빗 IP 대역(`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`)은 SSRF 방지를 위해 차단됩니다. Allowed Networks에 등록된 주소는 이 차단 규칙의 예외로 처리되어, 내부 네트워크에 위치한 데이터소스에도 안전하게 접근할 수 있습니다.

:::caution 보안 주의
Allowed Networks에 지나치게 넓은 CIDR 대역을 추가하면 SSRF 보호가 약화될 수 있습니다. 필요한 최소 범위만 등록하세요.
:::

## AI 에이전트 연동

등록된 데이터소스는 AI 어시스턴트(`/ai`)에서 자동으로 활용됩니다. 질문에 데이터소스 키워드가 포함되면 AI가 자동으로 쿼리를 생성하고 실행합니다.

### 단일 데이터소스 쿼리

```
"프로메테우스에서 CPU 사용량 확인해줘"
→ datasource 라우트 → PromQL 자동 생성 → 결과 분석
```

### 멀티 데이터소스 상관 분석

여러 데이터소스를 동시에 조회하여 상관 분석할 수 있습니다:

```
"프로메테우스 메트릭과 로키 에러 로그 상관 분석해줘"
→ Prometheus PromQL + Loki LogQL 병렬 실행 → 종합 분석
```

### AWS 리소스와 교차 분석

데이터소스 쿼리와 AWS 리소스를 함께 분석하여 근본 원인을 찾을 수 있습니다:

```
"Prometheus CPU 스파이크와 CloudWatch 알람 비교해줘"
→ datasource + monitoring 멀티 라우트 → 교차 상관 분석
```

:::tip AI 키워드
AI 어시스턴트가 인식하는 키워드: **프로메테우스/prometheus**, **로키/loki**, **템포/tempo**, **클릭하우스/clickhouse**, **예거/jaeger**, **다이나트레이스/dynatrace**, **데이터독/datadog**
:::

## 관련 페이지

- [모니터링 대시보드](./monitoring.md) - 시스템 모니터링 현황
- [CloudWatch](./cloudwatch) - AWS CloudWatch 메트릭
- [AI 어시스턴트](../overview/ai-assistant) - AI 분석 기능
