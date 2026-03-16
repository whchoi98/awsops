# 런북: 새 대시보드 페이지 추가 / Runbook: Add New Dashboard Page

## 단계 / Steps

### 1. Steampipe 테이블 컬럼 확인 / Verify Table Columns
반드시 실제 컬럼명을 확인 후 쿼리 작성 (Steampipe 테이블마다 구조가 다름)
(Always verify actual column names — Steampipe tables vary in structure)
```bash
steampipe query "SELECT column_name FROM information_schema.columns WHERE table_name = 'aws_NEW_TABLE'" --output json --input=false
```

> **주의**: MSK처럼 대부분 데이터가 JSONB 컬럼(`provisioned` 등)에 중첩된 경우가 있음.
> JSONB 내용도 확인할 것.
> (Note: Some tables like MSK nest data in JSONB columns. Check JSONB content too.)
```bash
steampipe query "SELECT provisioned::text FROM aws_msk_cluster LIMIT 1" --output json --input=false
```

### 2. 쿼리 파일 생성 / Create Query File
`src/lib/queries/newservice.ts` 생성:
(Create `src/lib/queries/newservice.ts`:)
```typescript
export const queries = {
  summary: `SELECT COUNT(*) AS total FROM aws_new_table`,
  list: `SELECT account_id, col1, col2 FROM aws_new_table ORDER BY col1`,
  detail: `SELECT account_id, * FROM aws_new_table WHERE id = '{id}'`,
  // 분포 차트용 / For distribution charts
  typeDistribution: `SELECT type AS name, COUNT(*) AS value FROM aws_new_table GROUP BY type`,
};
```

> **멀티 어카운트**: `list`와 `detail` 쿼리에 반드시 `account_id` 컬럼을 포함할 것.
> DataTable이 멀티 어카운트 모드에서 자동으로 Account 컬럼을 표시함.
> (Multi-account: Always include `account_id` in `list` and `detail` queries.
> DataTable auto-displays Account column in multi-account mode.)

### 3. 페이지 생성 / Create Page
`src/app/newservice/page.tsx` — 기존 페이지 패턴 참고:
(Reference existing page patterns:)
- 간단한 목록: `src/app/ecr/page.tsx`
- 상세 패널 + 차트: `src/app/ebs/page.tsx`
- 외부 API + 메트릭: `src/app/msk/page.tsx`

필수 포함 / Must include:
- `'use client'` 선언
- `import { useAccountContext } from '@/contexts/AccountContext'`
- `const { currentAccountId, isMultiAccount } = useAccountContext()`
- `fetchData`의 body에 `accountId: currentAccountId` 포함
- `fetchData`의 `useCallback` 의존성에 `currentAccountId` 포함
- StatsCard, DataTable, PieChartCard
- 상세 패널: `{selected.account_id && isMultiAccount && (<Row label="Account" value={selected.account_id} />)}`
- 검색 필터 (Search input)

### 4. 사이드바에 추가 / Add to Sidebar
`src/components/layout/Sidebar.tsx` 편집:
(Edit `src/components/layout/Sidebar.tsx`:)
- 적절한 `navGroup`에 추가: Compute / Network & CDN / Storage & DB / Monitoring / Security
  (Add to appropriate `navGroup`)
- `lucide-react`에서 아이콘 임포트
  (Import icon from `lucide-react`)

### 5. 대시보드 카드 추가 (선택) / Add Dashboard Card (Optional)
`src/app/page.tsx` — 적절한 행에 StatsCard 추가:
(Add StatsCard to appropriate row:)
- import 추가: 쿼리 파일 + lucide 아이콘
- batchQuery에 summary 쿼리 추가
- getFirst로 데이터 추출
- CardLink + StatsCard 추가

### 6. Resource Inventory 매핑 (선택) / Add Inventory Mapping (Optional)
`src/lib/resource-inventory.ts`의 `RESOURCE_MAP`에 매핑 추가:
(Add mapping to `RESOURCE_MAP`:)
```typescript
newSummary: { total_items: 'New Service Items' },
```

### 7. 빌드 및 검증 / Build & Verify
```bash
npm run build
# 라우트 목록에서 새 페이지 확인
# (Verify new page in route list)
```

### 8. 문서 업데이트 / Update Documentation
- `src/app/CLAUDE.md` — 페이지 수 + 목록 업데이트
- `src/lib/queries/CLAUDE.md` — 쿼리 파일 수 + 목록 업데이트
- `README.md` — 페이지 테이블 + 프로젝트 구조 업데이트
- `CHANGELOG.md` — 변경 이력 추가

## 체크리스트 / Checklist
- [ ] `information_schema.columns`로 컬럼명 확인 (Verified column names)
- [ ] JSONB 컬럼 내용 확인 (Checked JSONB column structure if applicable)
- [ ] list/detail 쿼리에 `account_id` 포함 (list/detail queries include `account_id`)
- [ ] `useAccountContext` import + `currentAccountId` 사용 (Uses account context)
- [ ] fetch body에 `accountId: currentAccountId` 포함 (fetch body includes accountId)
- [ ] `useCallback` 의존성에 `currentAccountId` 포함 (useCallback depends on currentAccountId)
- [ ] 상세 패널에 Account Row 추가 (Detail panel shows Account row in multi-account mode)
- [ ] fetch URL이 `/awsops/api/steampipe`를 사용 (fetch URL uses `/awsops/api/steampipe`)
- [ ] 컴포넌트 임포트가 default (Component imports are default, not named)
- [ ] StatsCard color에 이름('cyan') 사용 — hex 아님 (Uses name not hex)
- [ ] 리스트 쿼리에 SCP 차단 컬럼 없음 (No SCP-blocked columns in list query)
- [ ] SQL에 `$` 미사용 (No `$` in SQL)
- [ ] `npm run build` 성공 (Build succeeds)
- [ ] 관련 CLAUDE.md 문서 업데이트 (Updated relevant CLAUDE.md files)
