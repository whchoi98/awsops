# Skill: Refactor

## When to Use
Refactor existing pages, components, or queries for consistency and performance.

## Steps

### 1. Analyze Current State
- Read the file to understand current implementation
- Check for violations of CLAUDE.md rules
- Identify duplicated patterns

### 2. Common Refactoring Patterns

#### Extract Detail Panel
If a page has inline detail rendering, extract to the standard pattern:
```tsx
{(selected || detailLoading) && (
  <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
    <div className="absolute inset-0 bg-black/50" />
    <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
      onClick={(e) => e.stopPropagation()}>
      {/* Header + Content + Section/Row helpers */}
    </div>
  </div>
)}
```

#### Standardize Query File
Every query file should export:
- `summary` — aggregated counts for StatsCards
- `list` — main table data (avoid SCP-blocked columns)
- `detail` — full resource details with WHERE clause
- Optional: distribution queries for charts

#### Consolidate Fetch Pattern
All pages should use:
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

### 3. Verify
- `npm run build` passes
- `bash scripts/09-verify.sh` shows no new failures
