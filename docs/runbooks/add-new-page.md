# Runbook: Add New Dashboard Page

## Steps

### 1. Verify Table Columns
```bash
steampipe query "SELECT column_name FROM information_schema.columns WHERE table_name = 'aws_NEW_TABLE'" --output json --input=false
```

### 2. Create Query File
```bash
# src/lib/queries/newservice.ts
export const queries = {
  summary: `SELECT COUNT(*) AS total FROM aws_new_table`,
  list: `SELECT col1, col2 FROM aws_new_table ORDER BY col1`,
  detail: `SELECT * FROM aws_new_table WHERE id = '{id}'`,
};
```

### 3. Create Page
```bash
# src/app/newservice/page.tsx
# Copy pattern from src/app/ec2/page.tsx
# Include: 'use client', fetchData, StatsCard, DataTable, detail panel
```

### 4. Add to Sidebar
Edit `src/components/layout/Sidebar.tsx`:
- Add to appropriate `navGroup` (Compute, Network, Storage, Monitoring, Security)
- Import icon from `lucide-react`

### 5. Build & Verify
```bash
npm run build
bash scripts/09-verify.sh
```

## Checklist
- [ ] fetch URL uses `/awsops/api/steampipe`
- [ ] Component imports are default (not named)
- [ ] StatsCard color uses name ('cyan') not hex
- [ ] No SCP-blocked columns in list query
- [ ] Detail panel uses Section/Row helpers
