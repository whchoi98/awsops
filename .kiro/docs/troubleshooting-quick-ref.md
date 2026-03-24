# Troubleshooting Quick Reference / 빠른 문제 해결

## Steampipe

| 증상 | 원인 | 해결 |
|------|------|------|
| 쿼리 실패 (column not found) | 컬럼명 오류 | `information_schema.columns`로 확인 |
| 전체 쿼리 실패 (hydrate error) | SCP 차단 컬럼 | 해당 컬럼 제거 (mfa_enabled, attached_policy_arns, Lambda tags) |
| 연결 거부 | Steampipe 미실행 | `steampipe service start --database-listen network --database-port 9193` |
| 느린 쿼리 (4s+) | CLI 사용 중 | pg Pool 사용 확인 (steampipe.ts) |

## Next.js

| 증상 | 원인 | 해결 |
|------|------|------|
| 404 on fetch | basePath 누락 | URL에 `/awsops/api/...` 접두사 추가 |
| Component not found | named import | `import X from '...'` (default) 사용 |
| 빌드 실패 | TypeScript 에러 | `npx tsc --noEmit` 으로 확인 |
| 포트 충돌 | 3000 사용 중 | `fuser -k 3000/tcp` |

## AI / AgentCore

| 증상 | 원인 | 해결 |
|------|------|------|
| 30-60s 지연 | AgentCore 콜드 스타트 | 정상 — 첫 호출 후 빨라짐 |
| Gateway 연결 실패 | MCP 연결 에러 | Bedrock Direct로 자동 폴백 |
| Code Interpreter 이름 에러 | 하이픈 사용 | 언더스코어만 사용 `[a-zA-Z][a-zA-Z0-9_]` |
| arm64 빌드 실패 | 플랫폼 미지정 | `docker buildx --platform linux/arm64` |
| Gateway Target inlinePayload 에러 | CLI 사용 | Python/boto3 사용 (`mcp.lambda` structure) |

## CloudWatch Metrics API

| 증상 | 원인 | 해결 |
|------|------|------|
| MSK/RDS/ElastiCache 메트릭 없음 | CloudWatch 지연 | 5분 대기 후 재시도 |
| OpenSearch 메트릭 에러 | 도메인명 불일치 | DomainName dimension 확인 |

## Container Cost

| 증상 | 원인 | 해결 |
|------|------|------|
| EKS 비용 0 표시 | OpenCost 미설치 | `bash scripts/06f-setup-opencost.sh` 실행 |
| EKS fallback 모드 | OpenCost API 접근 불가 | Prometheus + OpenCost pod 상태 확인 |
| ECS 비용 부정확 | Container Insights 미활성 | ECS 클러스터에서 Container Insights 활성화 |

## Services

```bash
# 전체 시작
bash scripts/08-start-all.sh

# 전체 중지
bash scripts/09-stop-all.sh

# 헬스 체크
bash scripts/10-verify.sh

# Steampipe 강제 재시작
steampipe service stop --force && sleep 2 && steampipe service start --database-listen network --database-port 9193

# Next.js 재시작
fuser -k 3000/tcp && PORT=3000 npm run start &

# 비밀번호 재동기화
bash scripts/02-setup-nextjs.sh
```
