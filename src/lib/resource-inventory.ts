import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const DATA_DIR = resolve(process.cwd(), 'data/inventory');

// Dashboard query key → field → inventory label 매핑
// 대시보드의 기존 쿼리 결과에서 수량 추출 (추가 쿼리 0건)
const RESOURCE_MAP: Record<string, Record<string, string>> = {
  ec2Status:     { _sum_value: 'EC2 Instances' },
  s3Summary:     { total_buckets: 'S3 Buckets' },
  rdsSummary:    { total_instances: 'RDS Instances' },
  lambdaSummary: { total_functions: 'Lambda Functions' },
  vpcSummary:    {
    vpc_count: 'VPCs',
    subnet_count: 'Subnets',
    nat_gateway_count: 'NAT Gateways',
    alb_count: 'ALBs',
    nlb_count: 'NLBs',
    route_table_count: 'Route Tables',
  },
  iamSummary:    { total_users: 'IAM Users', total_roles: 'IAM Roles' },
  ecsSummary:    { total_tasks: 'ECS Tasks', total_services: 'ECS Services' },
  dynamoSummary: { total_tables: 'DynamoDB Tables' },
  k8sNodes:      { total_nodes: 'EKS Nodes' },
  k8sPods:       { total_pods: 'K8s Pods' },
  k8sDeploy:     { total_deployments: 'K8s Deployments' },
  ecacheSummary: { total_clusters: 'ElastiCache Clusters' },
  cfSummary:     { total_distributions: 'CloudFront Distributions' },
  wafSummary:    { total_web_acls: 'WAF Web ACLs' },
  ecrSummary:    { total_repos: 'ECR Repositories' },
  ebsSummary:    { total_volumes: 'EBS Volumes', unencrypted_count: 'Unencrypted EBS' },
  secSummary:    { public_buckets: 'Public S3 Buckets', open_sgs: 'Open Security Groups', total_snapshots: 'EBS Snapshots' },
};

export interface InventorySnapshot {
  date: string;
  timestamp: string;
  resources: Record<string, number>;
}

export interface InventoryTrend {
  label: string;
  current: number;
  d7ago: number | null;
  d30ago: number | null;
  delta7: number | null;
  delta30: number | null;
  pct7: number | null;
  pct30: number | null;
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function dateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function saveSnapshot(
  dashboardData: Record<string, { rows: unknown[]; error?: string }>
): Promise<void> {
  ensureDir();
  const today = dateStr();
  const resources: Record<string, number> = {};

  for (const [queryKey, mapping] of Object.entries(RESOURCE_MAP)) {
    const result = dashboardData[queryKey];
    if (!result || result.error) continue;

    for (const [field, label] of Object.entries(mapping)) {
      if (field === '_sum_value') {
        // ec2Status: sum all rows' value field / ec2Status는 모든 행의 value를 합산
        const total = (result.rows || []).reduce(
          (sum: number, r: unknown) => sum + (Number((r as Record<string, unknown>).value) || 0), 0
        );
        resources[label] = total;
      } else {
        const firstRow = (result.rows || [])[0] as Record<string, unknown> | undefined;
        if (firstRow && firstRow[field] !== undefined) {
          resources[label] = Number(firstRow[field]) || 0;
        }
      }
    }
  }

  const snapshot: InventorySnapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    resources,
  };

  writeFileSync(join(DATA_DIR, `${today}.json`), JSON.stringify(snapshot, null, 2), 'utf-8');
  cleanOldSnapshots(90);
}

export async function getHistory(days: number = 90): Promise<InventorySnapshot[]> {
  ensureDir();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = dateStr(cutoff);

  const files = readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  const history: InventorySnapshot[] = [];
  for (const file of files) {
    if (file.replace('.json', '') < cutoffStr) continue;
    try {
      const raw = readFileSync(join(DATA_DIR, file), 'utf-8');
      history.push(JSON.parse(raw));
    } catch { /* skip corrupt files */ }
  }
  return history;
}

export function calculateTrends(history: InventorySnapshot[]): InventoryTrend[] {
  if (history.length === 0) return [];

  const latest = history[history.length - 1];
  const latestDate = new Date(latest.date);

  const findClosest = (daysAgo: number): InventorySnapshot | null => {
    const target = new Date(latestDate);
    target.setDate(target.getDate() - daysAgo);
    const targetTime = target.getTime();
    let best: InventorySnapshot | null = null;
    let bestDiff = Infinity;
    for (const snap of history) {
      const diff = Math.abs(new Date(snap.date).getTime() - targetTime);
      if (diff < bestDiff && diff <= 2 * 86400000) { // 2일 허용 범위
        bestDiff = diff;
        best = snap;
      }
    }
    return best;
  };

  const snap7 = findClosest(7);
  const snap30 = findClosest(30);

  return Object.keys(latest.resources).map(label => {
    const current = latest.resources[label] || 0;
    const v7 = snap7 ? (snap7.resources[label] ?? null) : null;
    const v30 = snap30 ? (snap30.resources[label] ?? null) : null;
    return {
      label,
      current,
      d7ago: v7,
      d30ago: v30,
      delta7: v7 !== null ? current - v7 : null,
      delta30: v30 !== null ? current - v30 : null,
      pct7: v7 !== null && v7 > 0 ? ((current - v7) / v7) * 100 : null,
      pct30: v30 !== null && v30 > 0 ? ((current - v30) / v30) * 100 : null,
    };
  });
}

function cleanOldSnapshots(maxDays: number): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = dateStr(cutoff);
    const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (file.replace('.json', '') < cutoffStr) {
        unlinkSync(join(DATA_DIR, file));
      }
    }
  } catch { /* ignore cleanup errors */ }
}
