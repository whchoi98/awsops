---
sidebar_position: 5
title: AgentCore & Memory
description: AgentCore Runtime, Gateway, Memory Store에 대한 기술 FAQ
---

# AgentCore & Memory 기술 FAQ

AgentCore Runtime, Gateway, Memory Store, 통계 추적 등 AI 엔진 내부 동작에 대한 심화 질문과 답변입니다.

<details>
<summary>AgentCore Runtime은 뭔가요? Strands Agent와의 관계는?</summary>

AgentCore Runtime과 Strands Agent는 서로 다른 레이어에서 동작합니다.

```mermaid
flowchart TD
  subgraph AC["Amazon Bedrock AgentCore"]
    RT["Runtime<br/>(관리형 컨테이너 서비스)"]
    RT -->|"Docker 컨테이너 실행"| AGENT["agent.py<br/>(Strands Agent)"]
  end

  subgraph BUILD["빌드 프로세스 (EC2)"]
    SRC["agent.py 소스"] --> DOCKER["Docker Build<br/>(arm64)"]
    DOCKER --> ECR["ECR Push"]
  end

  ECR -->|"이미지 참조"| RT

  AGENT -->|"MCP + SigV4"| GW["8 Gateways<br/>(125 tools)"]
  AGENT -->|"Bedrock API"| MODEL["Claude Sonnet/Opus 4.6"]
```

### AgentCore Runtime

- AWS가 관리하는 **서버리스 컨테이너 실행 환경**
- Docker 이미지(ECR)를 지정하면 자동으로 컨테이너를 실행/스케일링
- Cold Start 관리, 네트워크 설정, IAM Role 등을 처리
- `InvokeAgentRuntimeCommand`로 호출

### Strands Agent Framework

- **Python 기반 AI 에이전트 프레임워크** (agent.py)
- LLM(Bedrock)에게 도구를 제공하고, 도구 호출 결과를 다시 LLM에 전달하는 루프
- MCP 프로토콜로 Gateway에 연결하여 125개 도구를 사용

### 관계 정리

| 항목 | AgentCore Runtime | Strands Agent |
|------|------------------|---------------|
| 역할 | 컨테이너 실행 환경 | AI 에이전트 로직 |
| 레벨 | 인프라 | 애플리케이션 |
| 관리 주체 | AWS | 개발자 |
| 코드 위치 | AWS 서비스 | `agent/agent.py` |
| 설정 | CDK/CLI | Python 코드 |

</details>

<details>
<summary>Gateway와 Lambda는 어떤 관계인가요?</summary>

Gateway는 **MCP 프로토콜 라우터**이고, Lambda는 **실제 AWS API를 실행하는 백엔드**입니다.

```mermaid
flowchart LR
  AG["Strands Agent"] -->|"MCP Protocol<br/>(SigV4 서명)"| GW["Gateway<br/>(예: Network)"]
  GW -->|"mcp.lambda"| L1["Lambda 1<br/>VPC/Subnet 조회"]
  GW -->|"mcp.lambda"| L2["Lambda 2<br/>Flow Logs 분석"]
  GW -->|"mcp.lambda"| L3["Lambda 3<br/>TGW 라우트 조회"]
```

### Gateway (8개)

- Agent가 `list_tools`로 사용 가능한 도구 목록을 조회
- Agent가 도구를 선택하면 Gateway가 해당 Lambda를 호출
- **MCP(Model Context Protocol)** 표준을 사용
- Gateway Target 생성 시 `mcp.lambda` 프로토콜과 `credentialProviderConfigurations` 지정

### Lambda (19개)

- 각 Lambda는 특정 AWS API를 실행하는 함수들을 포함
- 예: Network Lambda는 `describe_vpcs`, `describe_flow_logs` 등 AWS SDK 호출
- `agent/lambda/*.py`에 소스 코드
- `agent/lambda/create_targets.py`로 Gateway Target 일괄 생성

### 왜 Lambda를 사용하나요?

| 이유 | 설명 |
|------|------|
| **격리** | 각 도구가 독립 실행, 하나가 실패해도 다른 도구에 영향 없음 |
| **권한 분리** | Lambda별로 최소 권한 IAM Role 부여 가능 |
| **스케일링** | 동시 호출 시 자동 스케일링 |
| **비용** | 호출 시에만 과금, 유휴 비용 없음 |

:::caution Gateway Target 생성 시 주의
CLI의 `--inline-payload` 옵션은 JSON 파싱 이슈가 있습니다. **Python/boto3**로 생성해야 합니다.
:::

</details>

<details>
<summary>Docker arm64 빌드가 필수인 이유는?</summary>

AgentCore Runtime은 **AWS Graviton(ARM64)** 프로세서에서 실행됩니다.

```bash
# 올바른 빌드 명령
docker buildx build --platform linux/arm64 --load -t awsops-agent .

# ECR 푸시
docker tag awsops-agent:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

### x86(amd64)로 빌드하면?

컨테이너가 시작되지 않거나 `exec format error`가 발생합니다. Runtime 상태가 `FAILED`로 전환됩니다.

### Apple Silicon Mac에서 개발 시

Apple Silicon(M1/M2/M3)은 네이티브 ARM64이므로 `--platform` 없이도 arm64로 빌드됩니다. 단, **Intel Mac**에서는 반드시 `--platform linux/arm64`를 명시해야 합니다.

### EC2 빌드 환경

AWSops는 `t4g.2xlarge`(Graviton) 인스턴스를 사용하므로, EC2에서 빌드하면 네이티브 arm64 빌드가 됩니다.

</details>

<details>
<summary>agent.py를 수정하면 어떻게 재배포하나요?</summary>

agent.py 수정 후 배포는 3단계입니다.

```mermaid
flowchart LR
  EDIT["agent.py 수정"] --> BUILD["Docker Build<br/>(arm64)"]
  BUILD --> PUSH["ECR Push"]
  PUSH --> UPDATE["Runtime Update"]
```

### Step 1: Docker 빌드 및 ECR 푸시

```bash
cd agent
docker buildx build --platform linux/arm64 --load -t awsops-agent .
docker tag awsops-agent:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

### Step 2: Runtime 업데이트

```bash
aws bedrock-agentcore update-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --role-arn $ROLE_ARN \
  --network-configuration "$NETWORK_CONFIG"
```

:::warning 필수 파라미터
`update-agent-runtime`은 `--role-arn`과 `--network-configuration`을 **반드시** 함께 전달해야 합니다. 생략하면 기존 설정이 초기화될 수 있습니다.
:::

### Step 3: 확인

```bash
aws bedrock-agentcore get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --query 'status'
# "READY"가 되면 배포 완료
```

### Gateway URL 변경 시

`agent.py`의 `GATEWAYS` 딕셔너리에 계정별 Gateway URL이 있습니다. 새 계정에 배포할 때는 이 URL을 업데이트한 후 Docker 재빌드가 필요합니다.

</details>

<details>
<summary>Memory Store는 어떻게 동작하나요?</summary>

AWSops의 Memory Store는 **인메모리 캐시 + 디바운스 디스크 플러시** 패턴을 사용합니다.

```mermaid
flowchart TD
  API["AI API 응답 완료"] -->|"saveConversation()"| MEM["인메모리 캐시<br/>(conversations[])"]
  MEM -->|"5초 디바운스"| DISK["data/memory/<br/>conversations.json"]

  SEARCH["대화 검색 요청"] --> MEM
  MEM -->|"첫 접근 시"| LOAD["디스크에서 로드"]
```

### 저장 구조

```typescript
// src/lib/agentcore-memory.ts
interface ConversationRecord {
  id: string;           // 고유 ID
  userId: string;       // Cognito sub (사용자 식별)
  timestamp: string;    // ISO 8601
  route: string;        // 라우트 (network, cost 등)
  gateway: string;      // 게이트웨이 이름
  question: string;     // 사용자 질문
  summary: string;      // AI 응답 요약
  usedTools: string[];  // 사용된 도구 목록
  responseTimeMs: number; // 응답 시간
  via: string;          // 처리 경로
}
```

### 동작 방식

| 항목 | 설명 |
|------|------|
| **최대 보관** | 100건 (초과 시 오래된 것부터 삭제) |
| **캐시** | 인메모리 — 디스크 읽기 최소화 |
| **플러시** | 5초 디바운스 — 빈번한 저장 시 마지막 1회만 디스크 기록 |
| **파일 위치** | `data/memory/conversations.json` |
| **검색** | 질문, 요약, 라우트, 도구명으로 키워드 검색 |

### 왜 데이터베이스가 아닌 파일?

- 추가 인프라 불필요 (EC2 내 파일 시스템)
- 100건 수준의 데이터에 DB는 과도
- 인메모리 캐시로 조회 성능 충분
- JSON 파일이므로 백업/이동 간편

### AgentCore Memory Store와의 차이

`data/config.json`의 `memoryId`는 **AgentCore 서비스의 Memory Store**입니다. 이것은 agent.py 내부에서 Strands Agent가 사용하는 장기 메모리이고, `agentcore-memory.ts`는 **AWSops 대시보드 UI**에서 대화 이력을 표시하기 위한 별도 저장소입니다.

</details>

<details>
<summary>대화 이력이 사용자별로 분리되는 원리는?</summary>

Cognito JWT에서 사용자 ID를 추출하여 각 대화에 태그합니다.

```mermaid
flowchart LR
  REQ["HTTP Request"] -->|"Cookie: id_token"| AUTH["auth-utils.ts<br/>getUserFromRequest()"]
  AUTH -->|"JWT payload decode"| SUB["{ email, sub }"]
  SUB -->|"userId = sub"| SAVE["saveConversation()"]
  SAVE --> MEM["conversations.json"]

  QUERY["대화 조회"] -->|"userId 필터"| FILTER["getConversations(<br/>limit, userId)"]
  FILTER --> RESULT["해당 사용자<br/>대화만 반환"]
```

### 인증 흐름

1. **Lambda@Edge**가 CloudFront에서 JWT를 검증 (서명, 만료 확인)
2. 검증 통과한 요청이 EC2에 도달
3. `auth-utils.ts`의 `getUserFromRequest()`가 JWT payload를 **디코딩만** 수행 (서명 재검증 불필요)
4. `sub` (Cognito User Pool 고유 ID)를 사용자 식별자로 사용

### 저장 시

```typescript
// src/app/api/ai/route.ts
const user = getUserFromRequest(request);
await saveConversation({
  id: crypto.randomUUID(),
  userId: user?.sub || 'anonymous',
  // ... 나머지 필드
});
```

### 조회 시

```typescript
// 사용자별 필터링
const conversations = await getConversations(20, user?.sub);
// → userId가 일치하는 대화만 반환
```

### 인증 미설정 환경

Cognito가 설정되지 않은 환경에서는 `userId`가 `'anonymous'`로 저장되어 모든 사용자의 대화가 통합됩니다.

</details>

<details>
<summary>AgentCore 호출 통계는 어떻게 추적되나요?</summary>

`agentcore-stats.ts`가 모든 AI 호출을 인메모리로 집계하고 디스크에 영구 저장합니다.

### 추적 항목

```typescript
// src/lib/agentcore-stats.ts
interface AgentCoreCallRecord {
  timestamp: string;
  route: string;        // 라우트 (network, cost 등)
  gateway: string;      // 게이트웨이
  responseTimeMs: number;
  usedTools: string[];  // 사용된 도구
  success: boolean;
  via: string;          // 처리 경로
  inputTokens?: number;  // 입력 토큰
  outputTokens?: number; // 출력 토큰
  model?: string;        // 사용 모델
}
```

### 집계 통계

| 통계 | 설명 |
|------|------|
| `totalCalls` | 전체 호출 수 |
| `successCalls` / `failedCalls` | 성공/실패 횟수 |
| `avgResponseTimeMs` | **이동 평균** 응답 시간 |
| `callsByGateway` | 게이트웨이별 호출 수 |
| `callsByRoute` | 라우트별 호출 수 |
| `uniqueToolsUsed` | 사용된 고유 도구 목록 (최대 200개) |
| `tokensByModel` | 모델별 입력/출력 토큰 및 호출 수 |
| `recentCalls` | 최근 50건 상세 기록 |

### 성능 최적화

Memory Store와 동일한 **인메모리 캐시 + 5초 디바운스 flush** 패턴:

```
recordCall() → 인메모리 업데이트 → 5초 대기 → 디스크 기록
recordCall() → 인메모리 업데이트 → 타이머 리셋 → 5초 대기 → 디스크 기록
```

연속 호출 시 마지막 1회만 디스크에 기록하므로 I/O 부하가 최소화됩니다.

### UI에서 확인

AgentCore 대시보드 페이지(`/awsops/agentcore`)에서 실시간 통계를 확인할 수 있습니다.

</details>

<details>
<summary>토큰 사용량과 비용은 어떻게 모니터링하나요?</summary>

AWSops는 **2가지 소스**에서 토큰 사용량을 추적합니다.

```mermaid
flowchart TD
  subgraph APP["AWSops 앱 추적"]
    AI["AI API 응답"] -->|"recordCall()"| STATS["agentcore-stats.ts<br/>inputTokens, outputTokens"]
  end

  subgraph CW["CloudWatch 메트릭"]
    BED["Bedrock 서비스"] -->|"자동 발행"| METRIC["InputTokenCount<br/>OutputTokenCount"]
  end

  STATS --> UI["Bedrock 모니터링 페이지"]
  METRIC --> UI
```

### 1. AWSops 앱 내부 추적

AI API(`/api/ai`)에서 Bedrock 응답의 `usage` 필드를 파싱하여 `recordCall()`에 전달:

```typescript
recordCall({
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  model: 'sonnet-4.6',
  // ...
});
```

모델별로 집계되어 `tokensByModel`에 저장됩니다.

### 2. CloudWatch 메트릭

Bedrock 서비스가 자동으로 발행하는 메트릭:
- `InputTokenCount`, `OutputTokenCount`
- `InvocationCount`, `InvocationLatency`
- 모델 ID별, 리전별 필터링 가능

### Bedrock 모니터링 페이지

`/awsops/bedrock` 페이지에서 두 소스를 비교 표시합니다:

| 항목 | Account 전체 (CloudWatch) | AWSops 앱만 (내부 추적) |
|------|--------------------------|----------------------|
| 소스 | CloudWatch `AWS/Bedrock` | `agentcore-stats.ts` |
| 범위 | 계정 내 모든 Bedrock 호출 | AWSops 대시보드 호출만 |
| 용도 | 전체 비용 파악 | 대시보드 기여분 파악 |

:::tip 비용 추정
Bedrock 토큰 비용 = (입력 토큰 × 입력 단가) + (출력 토큰 × 출력 단가). Sonnet 4.6 기준 입력 $3/MTok, 출력 $15/MTok입니다.
:::

</details>

<details>
<summary>Code Interpreter나 Memory 이름에 하이픈을 쓰면 안 되는 이유는?</summary>

AgentCore API의 **네이밍 규칙 제약** 때문입니다.

### 영향받는 리소스

| 리소스 | 잘못된 예 | 올바른 예 |
|--------|----------|----------|
| Code Interpreter | `awsops-code-interpreter` | `awsops_code_interpreter` |
| Memory Store | `awsops-memory` | `awsops_memory` |

### 증상

하이픈이 포함된 이름으로 생성 시:
- `ValidationException` 또는 생성은 되지만 호출 시 실패
- 에러 메시지가 불명확할 수 있음

### config.json 설정

```json
{
  "codeInterpreterName": "awsops_code_interpreter-XXXXX",
  "memoryId": "awsops_memory-XXXXX",
  "memoryName": "awsops_memory"
}
```

`codeInterpreterName`과 `memoryId`의 `-XXXXX` 부분은 AWS가 자동 생성한 **suffix**입니다. 사용자가 지정하는 이름 부분(`awsops_code_interpreter`, `awsops_memory`)에만 제약이 적용됩니다.

### Memory Store 추가 제약

- `eventExpiryDuration`: 최대 365일
- 만료된 이벤트는 자동 삭제

</details>

<details>
<summary>config.json만 바꾸면 다른 계정에 배포 가능한 이유는?</summary>

AWSops는 **계정 의존적 값을 코드에 하드코딩하지 않고** `data/config.json`에서 런타임에 로드합니다.

### config.json 구조

```json
{
  "costEnabled": true,
  "agentRuntimeArn": "arn:aws:bedrock-agentcore:ap-northeast-2:123456789012:runtime/RT_ID",
  "codeInterpreterName": "awsops_code_interpreter-XXXXX",
  "memoryId": "awsops_memory-XXXXX",
  "memoryName": "awsops_memory"
}
```

### 로드 방식

```typescript
// src/lib/app-config.ts
export function getConfig(): AppConfig {
  // data/config.json을 읽어서 반환
  // 파일이 없으면 기본값 사용
}

// src/app/api/ai/route.ts — 사용 예
function getAgentRuntimeArn(): string {
  const config = getConfig();
  return config.agentRuntimeArn || '';
}
```

### 계정별 배포 절차

1. 새 계정에서 배포 스크립트(Step 0~7) 실행
2. 생성된 ARN, 이름을 `data/config.json`에 기록
3. 코드 수정 없이 바로 사용 가능

### 계정별로 달라지는 값

| 항목 | 설명 |
|------|------|
| `agentRuntimeArn` | AgentCore Runtime ARN (계정+리전+ID) |
| `codeInterpreterName` | Code Interpreter 이름 (계정별 고유) |
| `memoryId` | Memory Store ID (계정별 고유) |
| `costEnabled` | Cost Explorer 사용 가능 여부 (MSP는 false) |

### agent.py Gateway URL

`agent.py` 내부의 Gateway URL도 계정별로 다릅니다. 이 부분은 config.json이 아닌 Docker 이미지에 포함되므로, **새 계정 배포 시 Docker 재빌드가 필요**합니다.

</details>
