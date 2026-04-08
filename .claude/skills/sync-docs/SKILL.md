---
name: sync-docs
description: Synchronize project documentation with current code state
triggers: sync docs, documentation update
---

# 문서 동기화 스킬 / Sync Docs Skill

프로젝트 문서를 현재 코드 상태와 동기화합니다.
(Synchronize project documentation with current code state.)

## 작업 / Actions

### 1. 품질 평가 / Quality Assessment
각 CLAUDE.md 파일을 다음 기준으로 점수(0-100) 평가:
(Score each CLAUDE.md file (0-100) across:)
- 명령어/워크플로우 — 20점 (Commands/workflows — 20 pts)
- 아키텍처 명확성 — 20점 (Architecture clarity — 20 pts)
- 비자명적 패턴 — 15점 (Non-obvious patterns — 15 pts)
- 간결성 — 15점 (Conciseness — 15 pts)
- 최신성 — 15점 (Currency — 15 pts)
- 실행 가능성 — 15점 (Actionability — 15 pts)

변경 전 등급(A-F) 포함 품질 보고서를 출력합니다.
(Output quality report with grades (A-F) before making changes.)

### 2. 루트 CLAUDE.md 동기화 / Root CLAUDE.md Sync
- 개요, 아키텍처, 핵심 규칙, 주요 파일 업데이트 (Update Overview, Architecture, Critical Rules, Key Files)
- 명령어가 실제 스크립트와 일치하여 복사-붙여넣기 가능한지 검증 (Verify commands are copy-paste ready against actual scripts)
- 워크플로우 변경 시 "새 페이지 추가" 섹션 업데이트 (Update "Adding New Pages" if the workflow has changed)

### 3. 아키텍처 문서 동기화 / Architecture Doc Sync
- `docs/architecture.md`를 현재 시스템 구조에 맞게 업데이트 (Update `docs/architecture.md` to reflect current system structure)
- `scripts/ARCHITECTURE.md`와 교차 검증하여 일관성 확보 (Cross-reference with `scripts/ARCHITECTURE.md` for consistency)
- 새 컴포넌트 추가, 데이터 흐름 업데이트, 인프라 변경 반영 (Add new components, update data flows, reflect infrastructure changes)

### 4. 모듈 CLAUDE.md 감사 / Module CLAUDE.md Audit
- `src/app/`, `src/components/`, `src/lib/`, `src/types/` 스캔 (Scan `src/app/`, `src/components/`, `src/lib/`, `src/types/`)
- 누락된 모듈에 CLAUDE.md 생성 (Create CLAUDE.md for modules missing one)
- 기존 모듈 CLAUDE.md가 오래된 경우 업데이트 (Update existing module CLAUDE.md files if out of date)
- 각 모듈 CLAUDE.md 점수 평가 (Score each module CLAUDE.md)

### 5. ADR 감사 / ADR Audit
- 최근 커밋 확인: `git log --oneline -20` (Check recent commits: `git log --oneline -20`)
- `docs/decisions/`의 기존 ADR 검토 (Review existing ADRs in `docs/decisions/`)
- 문서화되지 않은 아키텍처 결정에 대한 새 ADR 제안 (Suggest new ADRs for undocumented architectural decisions)

### 6. README.md 동기화 / README.md Sync
- 프로젝트 구조 섹션을 실제 디렉토리 레이아웃에 맞게 업데이트 (Update project structure section to match actual directory layout)

### 7. 보고서 / Report
변경 전/후 품질 점수와 전체 변경 목록을 출력합니다.
(Output before/after quality scores and list of all changes.)

## 사용법 / Usage
`/sync-docs` 명령어로 실행 (Run with `/sync-docs` command)
