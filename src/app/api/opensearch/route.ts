// OpenSearch Domain Metrics API — CloudWatch get-metric-data per domain
// OpenSearch 도메인 메트릭 API — 도메인별 CloudWatch 메트릭 조회
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { getConfig } from '@/lib/app-config';

const DEFAULT_REGION = 'ap-northeast-2';
const DOMAIN_PATTERN = /^[a-zA-Z0-9._-]+$/;

function getAccountProfile(accountId?: string | null): { region: string; profileArgs: string[] } {
  if (!accountId) return { region: DEFAULT_REGION, profileArgs: [] };
  const config = getConfig();
  const account = config.accounts?.find(a => a.accountId === accountId);
  if (!account) return { region: DEFAULT_REGION, profileArgs: [] };
  return {
    region: account.region || DEFAULT_REGION,
    profileArgs: account.profile ? ['--profile', account.profile] : [],
  };
}

function awsCli(args: string[], region: string, profileArgs: string[] = [], timeout = 15000): any {
  try {
    const output = execFileSync('aws', [...args, '--region', region, ...profileArgs, '--output', 'json'],
      { encoding: 'utf-8', timeout });
    return JSON.parse(output);
  } catch { return null; }
}

function buildMetricQueries(domainNames: string[]): any[] {
  const metrics = [
    { id: 'cpu', name: 'CPUUtilization', stat: 'Average' },
    { id: 'mem_pressure', name: 'JVMMemoryPressure', stat: 'Average' },
    { id: 'free_storage', name: 'FreeStorageSpace', stat: 'Average' },
    { id: 'cluster_status_green', name: 'ClusterStatus.green', stat: 'Maximum' },
    { id: 'cluster_status_yellow', name: 'ClusterStatus.yellow', stat: 'Maximum' },
    { id: 'cluster_status_red', name: 'ClusterStatus.red', stat: 'Maximum' },
    { id: 'nodes', name: 'Nodes', stat: 'Average' },
    { id: 'searchable_docs', name: 'SearchableDocuments', stat: 'Average' },
    { id: 'search_latency', name: 'SearchLatency', stat: 'Average' },
    { id: 'indexing_latency', name: 'IndexingLatency', stat: 'Average' },
    { id: 'search_rate', name: 'SearchRate', stat: 'Sum' },
    { id: 'indexing_rate', name: 'IndexingRate', stat: 'Sum' },
  ];

  const queries: any[] = [];
  for (const domain of domainNames) {
    const safeId = domain.replace(/[^a-zA-Z0-9]/g, '_');
    for (const m of metrics) {
      queries.push({
        Id: `${m.id}_${safeId}`.substring(0, 255),
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ES',
            MetricName: m.name,
            Dimensions: [
              { Name: 'DomainName', Value: domain },
              { Name: 'ClientId', Value: '*' },
            ],
          },
          Period: 300,
          Stat: m.stat,
        },
      });
    }
  }
  return queries;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domainsParam = searchParams.get('domains');
  const accountId = searchParams.get('accountId');
  const { region, profileArgs } = getAccountProfile(accountId);

  if (!domainsParam) {
    return NextResponse.json({ error: 'Missing domains' }, { status: 400 });
  }

  const domains = domainsParam.split(',').filter(d => DOMAIN_PATTERN.test(d));
  if (domains.length === 0) {
    return NextResponse.json({ error: 'Invalid domains' }, { status: 400 });
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const queries = buildMetricQueries(domains);

    const metricInput = JSON.stringify({
      MetricDataQueries: queries,
      StartTime: oneHourAgo.toISOString(),
      EndTime: now.toISOString(),
    });

    const tmpFile = `/tmp/os-metrics-${Date.now()}.json`;
    execFileSync('bash', ['-c', `cat > ${tmpFile}`], { input: metricInput, encoding: 'utf-8' });

    const result = awsCli([
      'cloudwatch', 'get-metric-data',
      '--cli-input-json', `file://${tmpFile}`,
    ], region, profileArgs, 20000);

    try { execFileSync('rm', [tmpFile]); } catch {}

    if (!result) {
      return NextResponse.json({ metrics: {} });
    }

    const domainMetrics: Record<string, Record<string, number>> = {};
    for (const d of domains) {
      domainMetrics[d] = {};
    }

    for (const r of (result.MetricDataResults || [])) {
      const firstUnderscore = r.Id.indexOf('_');
      if (firstUnderscore < 0) continue;
      const metricKey = r.Id.substring(0, firstUnderscore);
      const safeDomain = r.Id.substring(firstUnderscore + 1);
      const matchedDomain = domains.find(d => d.replace(/[^a-zA-Z0-9]/g, '_') === safeDomain);
      if (!matchedDomain) continue;
      const values = r.Values || [];
      if (values.length > 0 && domainMetrics[matchedDomain] !== undefined) {
        domainMetrics[matchedDomain][metricKey] = values[0];
      }
    }

    return NextResponse.json({ metrics: domainMetrics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get metrics';
    return NextResponse.json({ error: message, metrics: {} }, { status: 500 });
  }
}
