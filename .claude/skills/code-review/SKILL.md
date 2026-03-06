# Skill: Code Review

## When to Use
Review any changed page, component, query file, or API route before merging.

## Checklist

### Query Files (`src/lib/queries/*.ts`)
- [ ] Column names verified against `information_schema.columns`
- [ ] No SCP-blocked columns in list queries (mfa_enabled, tags, attached_policy_arns)
- [ ] Uses `trivy_scan_vulnerability` not `trivy_vulnerability`
- [ ] No `$` character in SQL (use `::text LIKE` instead)
- [ ] CloudTrail queries use lazy-load (not page-level fetch)

### Page Files (`src/app/*/page.tsx`)
- [ ] Starts with `'use client'`
- [ ] fetch URL uses `/awsops/api/steampipe` prefix
- [ ] Components imported as default (`import X from '...'`)
- [ ] StatsCard/LiveResourceCard color uses name ('cyan') not hex
- [ ] Detail panel follows Section/Row pattern
- [ ] Loading skeleton shown while data loads
- [ ] Error states handled gracefully

### API Routes (`src/app/api/*/route.ts`)
- [ ] Input validation present
- [ ] Errors return proper HTTP status codes
- [ ] No secrets hardcoded (use env vars)
- [ ] Steampipe queries go through `runQuery()` or `batchQuery()`

### General
- [ ] No `console.log` left in production code
- [ ] TypeScript: no `@ts-ignore` without justification
- [ ] Tailwind classes use theme tokens (navy-*, accent-*)
