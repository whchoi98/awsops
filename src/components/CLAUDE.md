# Components Module

## Role
Shared React components used across pages. Layout components, cards, charts, and UI primitives.

## Key Files
- `layout/Sidebar.tsx` — Main navigation (6 groups)
- Reusable cards: StatsCard, LiveResourceCard
- Chart wrappers using Recharts
- Network topology using React Flow

## Rules
- All components use `export default`
- Tailwind classes use theme tokens (navy-*, accent colors)
- Color prop accepts name strings ('cyan', 'green', 'purple') not hex values
