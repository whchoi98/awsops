# 컴포넌트 모듈

## 역할
페이지 전반에 걸쳐 사용되는 공유 React 컴포넌트. 레이아웃, 카드, 차트, 테이블, K8s UI.

## 주요 파일 (17개)

### layout/ — 레이아웃 (3)
- `layout/Sidebar.tsx` — 메인 네비게이션 (6개 그룹, Bedrock 포함) + Sign Out 버튼 (로고 우측) + AccountSelector + 계정별 기능 필터링
- `layout/Header.tsx` — 페이지 헤더 (새로고침, ONLINE 상태)
- `layout/AccountSelector.tsx` — 어카운트 선택 드롭다운 (멀티 어카운트 모드에서만 표시)

### providers/ — 프로바이더 (1)
- `providers/ClientProviders.tsx` — 클라이언트 프로바이더 래퍼 (LanguageProvider + AccountProvider)

### dashboard/ — 대시보드 카드 (5)
- `dashboard/StatsCard.tsx` — 통계 카드 (color prop: 이름 문자열)
- `dashboard/LiveResourceCard.tsx` — 실시간 리소스 카드
- `dashboard/CategoryCard.tsx` — 카테고리 카드
- `dashboard/StatusBadge.tsx` — 상태 배지 (`status` prop만 받음 — `text` prop 없음)
- `dashboard/AccountBadge.tsx` — 어카운트 배지 (accountId로 alias + 컬러 도트 표시)

### charts/ — Recharts 차트 래퍼 (3)
- `charts/BarChartCard.tsx` — 바 차트
- `charts/LineChartCard.tsx` — 라인 차트
- `charts/PieChartCard.tsx` — 파이 차트

### table/ — 데이터 테이블 (1)
- `table/DataTable.tsx` — 범용 데이터 테이블 (정렬, render 함수, 멀티어카운트 시 Account 컬럼 자동 추가)

### report/ — 리포트 (1)
- `ReportMarkdown.tsx` — 진단 리포트 마크다운 렌더러 (ReactMarkdown + remarkGfm, 다크 테마, 섹션별 강조색)

### k8s/ — K8s 전용 (4)
- `k8s/K9sResourceTable.tsx`, `K9sDetailPanel.tsx`, `K9sClusterHeader.tsx`, `NamespaceFilter.tsx`

## 규칙
- 모든 컴포넌트는 `export default`
- Tailwind 클래스는 테마 토큰 사용: navy-*, accent-*
- color 속성은 hex가 아닌 이름 문자열: 'cyan', 'green', 'purple', 'orange', 'red', 'pink'
- Sign Out: Sidebar 상단 로고 옆에 위치 → `POST /api/auth` (HttpOnly 쿠키 서버 사이드 삭제)

---

# Components Module (English)

## Role
Shared React components across pages: layout, cards, charts, tables, K8s UI.

## Key Files (17)

### layout/ — Layout (3)
- `layout/Sidebar.tsx` — Main navigation (6 groups, incl. Bedrock) + Sign Out button (next to logo) + AccountSelector + account feature filtering
- `layout/Header.tsx` — Page header (refresh, ONLINE status)
- `layout/AccountSelector.tsx` — Account selector dropdown (only visible in multi-account mode)

### providers/ — Providers (1)
- `providers/ClientProviders.tsx` — Client provider wrapper (LanguageProvider + AccountProvider)

### dashboard/ — Dashboard Cards (5)
- `dashboard/StatsCard.tsx` — Stats card (color prop: name strings)
- `dashboard/LiveResourceCard.tsx` — Live resource card
- `dashboard/CategoryCard.tsx` — Category card
- `dashboard/StatusBadge.tsx` — Status badge (`status` prop only — no `text` prop)
- `dashboard/AccountBadge.tsx` — Account badge (shows alias + colored dot from accountId)

### charts/ — Recharts Chart Wrappers (3)
- `charts/BarChartCard.tsx` — Bar chart
- `charts/LineChartCard.tsx` — Line chart
- `charts/PieChartCard.tsx` — Pie chart

### table/ — Data Table (1)
- `table/DataTable.tsx` — Generic data table (sorting, render functions, auto Account column in multi-account mode)

### report/ — Report (1)
- `ReportMarkdown.tsx` — Diagnosis report markdown renderer (ReactMarkdown + remarkGfm, dark theme, per-section accent colors)

### k8s/ — K8s Components (4)
- `k8s/K9sResourceTable.tsx`, `K9sDetailPanel.tsx`, `K9sClusterHeader.tsx`, `NamespaceFilter.tsx`

## Rules
- All components use `export default`
- Tailwind classes use theme tokens: navy-*, accent-*
- Color prop: name strings ('cyan', 'green', 'purple') not hex values
- Sign Out: in Sidebar next to logo → `POST /api/auth` (server-side HttpOnly cookie deletion)
