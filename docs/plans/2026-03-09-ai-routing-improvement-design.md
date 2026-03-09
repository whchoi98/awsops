# AI Routing Improvement Design / AI 라우팅 개선 설계

## Problem / 문제
AI 답변이 일관되지 않고 잘못된 답변이 발생하는 5가지 근본 원인:
1. 대화 히스토리 미전달 (AgentCore에 마지막 메시지만 전송)
2. 키워드 라우팅 충돌 (여러 라우트 동시 매칭)
3. AWSData 라우트의 하드코딩된 SQL
4. AgentCore 매 요청마다 새 에이전트 (세션 메모리 없음)
5. 폴스루 시 사용자 피드백 없음

## Solution / 해결책

### A. Conversation History / 대화 히스토리 전달
- `invokeAgentCore()`에 전체 messages 배열 전달 (최근 10턴 제한)
- `agent.py`에서 Strands Agent의 messages 파라미터로 전달
- payload: `{ messages: [...], gateway: "infra" }`

### B. Sonnet Intent Classification / Sonnet 의도 분류
- 9개 `needs*()` 키워드 함수 제거
- Sonnet 호출 1회로 의도를 JSON 분류: `{ route, confidence }`
- max_tokens: 100, 5초 타임아웃
- 실패 시 키워드 기반 폴백

### C. AWSData Route → Ops Gateway / AWSData 라우트 통합
- `detectQueries()` + `queryAWS()` 제거
- AWSData → Ops Gateway의 `run_steampipe_query` 도구로 통합
- Agent가 질문에 맞는 SQL을 동적 생성

## Files Changed / 변경 파일
- `src/app/api/ai/route.ts` — 의도 분류, 히스토리 전달, AWSData 제거
- `agent/agent.py` — messages 배열 수신 및 전달

## Risks / 리스크
- 의도 분류 지연 (~1-2초) → max_tokens 제한 + 타임아웃
- 비용 증가 → 분류용 입출력 최소화
- Docker 재배포 필요 → 기존 단일 메시지 호환 유지
