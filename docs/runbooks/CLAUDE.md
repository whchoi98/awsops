# Runbooks

운영 시나리오별 대응 가이드. 각 런북은 증상 → 확인 → 조치 순서로 구성.
Operational playbooks organized by scenario. Each follows symptoms → diagnosis → action.

## 목록 / Index

| 런북 / Runbook | 주제 / Topic |
|---|---|
| [start-services.md](start-services.md) | 전체 서비스 시작 (Steampipe + Next.js) |
| [deploy-new-version.md](deploy-new-version.md) | 새 버전 배포 (앱 / 에이전트 / Lambda / CDK) |
| [add-new-page.md](add-new-page.md) | 새 대시보드 페이지 추가 |
| [multi-account-setup.md](multi-account-setup.md) | 신규 AWS 계정 추가 (Steampipe Aggregator) |
| [alert-pipeline-troubleshoot.md](alert-pipeline-troubleshoot.md) | 알림 파이프라인 장애 대응 (ADR-008/013) |
| [cache-warmer-issues.md](cache-warmer-issues.md) | 캐시 워머 stale / 에러 대응 |
| [cognito-auth-issues.md](cognito-auth-issues.md) | 로그인 실패, Lambda@Edge 검증 오류 |
| [user-offboarding.md](user-offboarding.md) | 퇴사자 Cognito 계정 처리 — 계정 인수 경로 차단 (ADR-002/009) |
| [v1-to-v2-aurora-backfill.md](v1-to-v2-aurora-backfill.md) | v1→v2 Aurora 이력 백필 |
| [v1-decommission.md](v1-decommission.md) | v1 레거시 폐기 5단계 절차 (ADR-016) |
| [agent-sql-reader.md](agent-sql-reader.md) | `execute_sql`/`inventory-read` Data API auth 실패 — `awsops_sql_reader` 롤·비밀번호 동기화 (`apply → make migrate → make agentcore`) |

## 규칙 / Conventions
- 파일명: `kebab-case.md`, 도메인-주제 순서
- 구조: **증상 → 원인 후보 → 검증 명령 → 조치 → 관련 파일/ADR**
- 한국어/영어 병기
- 명령어는 복사-붙여넣기 가능한 형태로
- 관련 ADR 번호를 하단에 명시

## 새 런북 추가 / Adding a Runbook
1. 이 파일 목록에 추가
2. 기존 런북의 구조(start-services.md, deploy-new-version.md)를 템플릿으로 사용
3. 증상 → 진단 → 조치 순서 엄수
4. 관련 파일 경로를 반드시 포함
