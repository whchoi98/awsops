# Architecture Decisions / 아키텍처 결정

## ADR Index

| # | Decision | Status | Date |
|---|----------|--------|------|
| 001 | Steampipe pg Pool (CLI 대신) | Accepted | 2026-03 |
| 002 | AI 하이브리드 라우팅 (10-route) | Accepted | 2026-03 |
| 003 | SCP 차단 컬럼 처리 | Accepted | 2026-03 |
| 004 | Gateway 역할 분리 (8개) | Accepted | 2026-03 |
| 005 | VPC Lambda → Steampipe 접근 | Accepted | 2026-03 |
| 006 | OpenCost + Prometheus (EKS cost) | Accepted | 2026-03 |

## Key Decisions Summary

### Data: Steampipe pg Pool
- CLI (4s/query) 대신 pg Pool (0.006s/query) — 660배 빠름
- `Pool({ host: '127.0.0.1', port: 9193, max: 5, statement_timeout: 120000 })`
- node-cache 5분 TTL, batchQuery 3개 동시 실행

### AI: 10-Route Hybrid
- AgentCore Runtime은 격리된 microVM → localhost Steampipe 접근 불가
- 따라서 AWS 리소스 질문은 Steampipe + Bedrock Direct로 처리
- 네트워크/컨테이너/보안 등 전문 분석은 Gateway MCP 도구 활용
- 멀티 라우트: 복합 질문 시 1~3개 Gateway 병렬 호출 + 결과 통합
- Models: Sonnet 4.6 (`global.anthropic.claude-sonnet-4-6`), Opus 4.6 (`global.anthropic.claude-opus-4-6-v1`)

### Security: SCP Column Handling
- `ignore_error_codes`는 테이블 레벨만 처리
- 컬럼 hydrate 에러는 해당 컬럼을 쿼리에서 제거해야 함
- 영향 컬럼: `mfa_enabled`, `attached_policy_arns`, Lambda `tags`

### Infra: Single EC2
- 모든 서비스(Next.js, Steampipe, Powerpipe, code-server, Docker)가 단일 EC2에서 실행
- t4g.2xlarge (ARM64 Graviton) — Private Subnet
- CloudFront → ALB → EC2 구조

### Cost: EKS OpenCost + Request-based Fallback
- EKS 컨테이너 비용: OpenCost API (CPU/Mem/Net/Storage/GPU) 우선
- OpenCost 미설치 시 request-based fallback (Fargate pricing 기반 추정)
- ECS 컨테이너 비용: Fargate pricing + Container Insights metrics
- Prometheus + OpenCost 설치: `scripts/07-setup-opencost.sh`
