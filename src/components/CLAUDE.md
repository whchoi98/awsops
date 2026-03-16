# 컴포넌트 모듈

## 역할
페이지 전반에 걸쳐 사용되는 공유 React 컴포넌트. 레이아웃, 카드, 차트, 테이블, K8s UI.

## 주요 파일 (16개)

### layout/ — 레이아웃 (3)
- `layout/Sidebar.tsx` — 메인 네비게이션 (6개 그룹) + Sign Out 버튼 (로고 우측)
- `layout/Header.tsx` — 페이지 헤더 (새로고침, ONLINE 상태)
- `layout/AccountSelector.tsx` — 어카운트 전환 드롭다운 (Sidebar, isMultiAccount=false면 숨김)

### dashboard/ — 대시보드 카드 (5)
- `dashboard/StatsCard.tsx` — 통계 카드 (color prop: 이름 문자열)
- `dashboard/LiveResourceCard.tsx` — 실시간 리소스 카드
- `dashboard/CategoryCard.tsx` — 카테고리 카드
- `dashboard/StatusBadge.tsx` — 상태 배지 (`status` prop만 받음 — `text` prop 없음)
- `dashboard/AccountBadge.tsx` — 어카운트 alias + 색상 코딩 배지

### charts/ — Recharts 차트 래퍼 (3)
- `charts/BarChartCard.tsx` — 바 차트
- `charts/LineChartCard.tsx` — 라인 차트
- `charts/PieChartCard.tsx` — 파이 차트

### table/ — 데이터 테이블 (1)
- `table/DataTable.tsx` — 범용 데이터 테이블 (정렬, render 함수)

### k8s/ — K8s 전용 (4)
- `k8s/K9sResourceTable.tsx`, `K9sDetailPanel.tsx`, `K9sClusterHeader.tsx`, `NamespaceFilter.tsx`

## 규칙
- 모든 컴포넌트는 `export default`
- Tailwind 클래스는 테마 토큰 사용: navy-*, accent-*
- color 속성은 hex가 아닌 이름 문자열: 'cyan', 'green', 'purple', 'orange', 'red', 'pink'
- DataTable: 멀티 어카운트 모드에서 account_id 컬럼 자동 추가 (effectiveColumns)
- Sign Out: Sidebar 상단 로고 옆에 위치 → `POST /api/auth` (HttpOnly 쿠키 서버 사이드 삭제)

---

# Components Module (English)

## Role
Shared React components across pages: layout, cards, charts, tables, K8s UI.

## Key Files (16)

### layout/ — Layout (3)
- `layout/Sidebar.tsx` — Main navigation (6 groups) + Sign Out button (next to logo)
- `layout/Header.tsx` — Page header (refresh, ONLINE status)
- `layout/AccountSelector.tsx` — Account switcher dropdown (Sidebar, hidden when isMultiAccount=false)

### dashboard/ — Dashboard Cards (5)
- `dashboard/StatsCard.tsx` — Stats card (color prop: name strings)
- `dashboard/LiveResourceCard.tsx` — Live resource card
- `dashboard/CategoryCard.tsx` — Category card
- `dashboard/StatusBadge.tsx` — Status badge (`status` prop only — no `text` prop)
- `dashboard/AccountBadge.tsx` — Account alias + color-coded badge

### charts/ — Recharts Chart Wrappers (3)
- `charts/BarChartCard.tsx` — Bar chart
- `charts/LineChartCard.tsx` — Line chart
- `charts/PieChartCard.tsx` — Pie chart

### table/ — Data Table (1)
- `table/DataTable.tsx` — Generic data table (sorting, render functions)

### k8s/ — K8s Components (4)
- `k8s/K9sResourceTable.tsx`, `K9sDetailPanel.tsx`, `K9sClusterHeader.tsx`, `NamespaceFilter.tsx`

## Rules
- All components use `export default`
- Tailwind classes use theme tokens: navy-*, accent-*
- Color prop: name strings ('cyan', 'green', 'purple') not hex values
- DataTable: auto-adds account_id column in multi-account mode (effectiveColumns)
- Sign Out: in Sidebar next to logo → `POST /api/auth` (server-side HttpOnly cookie deletion)
