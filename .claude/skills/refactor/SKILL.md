# 스킬: 리팩토링 / Skill: Refactor

## 사용 시점 / When to Use
일관성과 성능 향상을 위해 기존 페이지, 컴포넌트 또는 쿼리를 리팩토링합니다.
(Refactor existing pages, components, or queries for consistency and performance.)

## 단계 / Steps

### 1. 현재 상태 분석 / Analyze Current State
- 파일을 읽어 현재 구현 파악 (Read the file to understand current implementation)
- CLAUDE.md 규칙 위반 확인 (Check for violations of CLAUDE.md rules)
- 중복 패턴 식별 (Identify duplicated patterns)

### 2. 일반적인 리팩토링 패턴 / Common Refactoring Patterns

#### 상세 패널 추출 / Extract Detail Panel
페이지에 인라인 상세 렌더링이 있으면 표준 패턴으로 추출합니다:
(If a page has inline detail rendering, extract to the standard pattern:)
```tsx
{(selected || detailLoading) && (
  <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
    <div className="absolute inset-0 bg-black/50" />
    <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
      onClick={(e) => e.stopPropagation()}>
      {/* 헤더 + 콘텐츠 + Section/Row 헬퍼 */}
      {/* (Header + Content + Section/Row helpers) */}
    </div>
  </div>
)}
```

#### 쿼리 파일 표준화 / Standardize Query File
모든 쿼리 파일은 다음을 export 해야 합니다:
(Every query file should export:)
- `summary` — StatsCard용 집계 수 (aggregated counts for StatsCards)
- `list` — 메인 테이블 데이터, SCP 차단 컬럼 제외 (main table data, avoid SCP-blocked columns)
- `detail` — WHERE 절이 포함된 전체 리소스 상세 (full resource details with WHERE clause)
- 선택: 차트용 분포 쿼리 (Optional: distribution queries for charts)

#### Fetch 패턴 통합 / Consolidate Fetch Pattern
모든 페이지는 다음 패턴을 사용해야 합니다:
(All pages should use:)
```tsx
const fetchData = useCallback(async (bustCache = false) => {
  setLoading(true);
  try {
    const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: { ... } }),
    });
    setData(await res.json());
  } catch {} finally { setLoading(false); }
}, []);
```

### 3. 검증 / Verify
- `npm run build` 통과 확인 (`npm run build` passes)
- `bash scripts/11-verify.sh`에서 새로운 실패 없음 확인 (`bash scripts/11-verify.sh` shows no new failures)
