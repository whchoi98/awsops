# Coding Standards / 코딩 표준

## TypeScript / Next.js

### Page Pattern
```tsx
'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';

export default function ServicePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const res = await fetch('/awsops/api/steampipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: { summary: queries.summary, list: queries.list } }),
    });
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);
  // ... render with Sidebar, Header, StatsCards, DataTable
}
```

### Import Rules
- `import X from '@/components/...'` — default import만 사용
- `{ X }` named import 금지
- 경로 alias: `@/` = `src/`

### Fetch Rules
- 모든 URL에 `/awsops` prefix 필수: `/awsops/api/steampipe`
- basePath는 fetch()에 자동 적용되지 않음

### Color System (Dark Navy Theme)
- Background: navy-900 `#0a0e1a`, navy-800 `#0f1629`, navy-700 `#151d30`
- Border: navy-600 `#1a2540`
- Accents: cyan `#00d4ff`, green `#00ff88`, purple `#a855f7`, orange `#f59e0b`, red `#ef4444`, pink `#ec4899`
- StatsCard/LiveResourceCard `color` prop: 이름 문자열 ('cyan', 'green') — hex 금지

## SQL (Steampipe)

### 쿼리 작성 전 필수
```bash
steampipe query "SELECT column_name FROM information_schema.columns WHERE table_name = 'TABLE'" --output json --input=false
```

### 금지 패턴
- `$` in SQL → `conditions::text LIKE '%..%'` 사용
- SCP 차단 컬럼 (list 쿼리): `mfa_enabled`, `attached_policy_arns`, Lambda `tags`
- `trivy_vulnerability` → `trivy_scan_vulnerability`
- `versioning` → `versioning_enabled` (S3)

## Python (Agent/Lambda)
- Python 3.11+ (agent), 3.12 (Lambda)
- boto3 read-only 호출만 허용
- arm64 Docker 빌드 필수

## API Routes (12개)
- `ai/route.ts` — 10-route classifier + SSE streaming
- `steampipe/route.ts` — Steampipe query endpoint
- `auth/route.ts` — Authentication
- `agentcore/route.ts` — AgentCore status
- `code/route.ts` — Code Interpreter
- `benchmark/route.ts` — CIS benchmark
- `msk/route.ts` — MSK CloudWatch metrics
- `rds/route.ts` — RDS CloudWatch metrics
- `elasticache/route.ts` — ElastiCache CloudWatch metrics
- `opensearch/route.ts` — OpenSearch CloudWatch metrics
- `container-cost/route.ts` — ECS container cost (Fargate pricing)
- `eks-container-cost/route.ts` — EKS container cost (OpenCost + request-based)
