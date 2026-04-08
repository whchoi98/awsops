---
name: code-review
description: Review changed code against AWSops project conventions
triggers: review, PR, code quality
---

# 스킬: 코드 리뷰 / Skill: Code Review

## 사용 시점 / When to Use
머지 전에 변경된 페이지, 컴포넌트, 쿼리 파일 또는 API 라우트를 리뷰합니다.
(Review any changed page, component, query file, or API route before merging.)

## 체크리스트 / Checklist

### 쿼리 파일 / Query Files (`src/lib/queries/*.ts`)
- [ ] 컬럼명을 `information_schema.columns`로 검증 (Column names verified against `information_schema.columns`)
- [ ] 목록 쿼리에 SCP 차단 컬럼 없음: mfa_enabled, tags, attached_policy_arns (No SCP-blocked columns in list queries)
- [ ] `trivy_vulnerability`가 아닌 `trivy_scan_vulnerability` 사용 (Uses `trivy_scan_vulnerability` not `trivy_vulnerability`)
- [ ] SQL에 `$` 문자 없음 — `::text LIKE` 사용 (No `$` character in SQL — use `::text LIKE` instead)
- [ ] CloudTrail 쿼리는 지연 로딩 사용, 페이지 수준 fetch 아님 (CloudTrail queries use lazy-load, not page-level fetch)

### 페이지 파일 / Page Files (`src/app/*/page.tsx`)
- [ ] `'use client'`로 시작 (Starts with `'use client'`)
- [ ] fetch URL이 `/awsops/api/steampipe` 접두사 사용 (fetch URL uses `/awsops/api/steampipe` prefix)
- [ ] 컴포넌트는 default import: `import X from '...'` (Components imported as default: `import X from '...'`)
- [ ] 색상은 hex가 아닌 이름('cyan') 사용 (StatsCard/LiveResourceCard color uses name ('cyan') not hex)
- [ ] 상세 패널은 Section/Row 패턴 준수 (Detail panel follows Section/Row pattern)
- [ ] 데이터 로딩 중 스켈레톤 표시 (Loading skeleton shown while data loads)
- [ ] 오류 상태를 적절히 처리 (Error states handled gracefully)

### API 라우트 / API Routes (`src/app/api/*/route.ts`)
- [ ] 입력 검증 존재 (Input validation present)
- [ ] 오류 시 적절한 HTTP 상태 코드 반환 (Errors return proper HTTP status codes)
- [ ] 시크릿 하드코딩 금지 — 환경 변수 사용 (No secrets hardcoded — use env vars)
- [ ] Steampipe 쿼리는 `runQuery()` 또는 `batchQuery()` 사용 (Steampipe queries go through `runQuery()` or `batchQuery()`)

### 일반 / General
- [ ] 프로덕션 코드에 `console.log` 남기지 않음 (No `console.log` left in production code)
- [ ] TypeScript: 근거 없는 `@ts-ignore` 금지 (No `@ts-ignore` without justification)
- [ ] Tailwind 클래스는 테마 토큰 사용 (navy-*, accent-*) (Tailwind classes use theme tokens)
