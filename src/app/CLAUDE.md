# App Module

## Role
Next.js 14 App Router pages and API routes. Each subdirectory is a route segment.

## Key Files
- `layout.tsx` — Root layout with Sidebar and global styles
- `page.tsx` — Dashboard home page
- `globals.css` — Tailwind base + custom theme variables
- `api/steampipe/route.ts` — Main Steampipe query endpoint
- `api/ai/route.ts` — AI routing (9-route priority: Code→Infra→IaC→Data→Security→Monitoring→Cost→AWSData→Ops)
- `api/code/route.ts` — Code interpreter endpoint
- `api/benchmark/route.ts` — CIS Compliance benchmark endpoint

## Rules
- Every page file must start with `'use client'`
- All fetch URLs must use `/awsops/api/*` prefix (basePath not auto-applied)
- Components imported as default: `import X from '...'` (NOT `{ X }`)
- StatsCard/LiveResourceCard `color` prop uses names ('cyan') not hex
- New pages: follow the pattern in `docs/runbooks/add-new-page.md`
