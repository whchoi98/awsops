// RDS Instance Metrics API — CloudWatch get-metric-data per DB instance
// RDS 인스턴스 메트릭 API — DB 인스턴스별 CloudWatch 메트릭 조회
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { getConfig } from '@/lib/app-config';

const DEFAULT_REGION = 'ap-northeast-2';
const ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

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

function buildMetricQueries(instanceIds: string[]): any[] {
  const metrics = [
    { id: 'cpu', name: 'CPUUtilization', stat: 'Average' },
    { id: 'mem', name: 'FreeableMemory', stat: 'Average' },
    { id: 'conn', name: 'DatabaseConnections', stat: 'Average' },
    { id: 'riops', name: 'ReadIOPS', stat: 'Average' },
    { id: 'wiops', name: 'WriteIOPS', stat: 'Average' },
    { id: 'storage', name: 'FreeStorageSpace', stat: 'Average' },
    { id: 'net_rx', name: 'NetworkReceiveThroughput', stat: 'Average' },
    { id: 'net_tx', name: 'NetworkTransmitThroughput', stat: 'Average' },
  ];

  const queries: any[] = [];
  for (const instId of instanceIds) {
    const safeId = instId.replace(/[^a-zA-Z0-9]/g, '_');
    for (const m of metrics) {
      queries.push({
        Id: `${m.id}_${safeId}`.substring(0, 255),
        MetricStat: {
          Metric: {
            Namespace: 'AWS/RDS',
            MetricName: m.name,
            Dimensions: [
              { Name: 'DBInstanceIdentifier', Value: instId },
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
  const instanceIdsParam = searchParams.get('instanceIds');
  const accountId = searchParams.get('accountId');
  const { region, profileArgs } = getAccountProfile(accountId);

  if (!instanceIdsParam) {
    return NextResponse.json({ error: 'Missing instanceIds' }, { status: 400 });
  }

  const instanceIds = instanceIdsParam.split(',').filter(id => ID_PATTERN.test(id));
  if (instanceIds.length === 0) {
    return NextResponse.json({ error: 'Invalid instanceIds' }, { status: 400 });
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const queries = buildMetricQueries(instanceIds);

    const metricInput = JSON.stringify({
      MetricDataQueries: queries,
      StartTime: oneHourAgo.toISOString(),
      EndTime: now.toISOString(),
    });

    const tmpFile = `/tmp/rds-metrics-${Date.now()}.json`;
    execFileSync('bash', ['-c', `cat > ${tmpFile}`], { input: metricInput, encoding: 'utf-8' });

    const result = awsCli([
      'cloudwatch', 'get-metric-data',
      '--cli-input-json', `file://${tmpFile}`,
    ], region, profileArgs, 20000);

    try { execFileSync('rm', [tmpFile]); } catch {}

    if (!result) {
      return NextResponse.json({ metrics: {} });
    }

    // 인스턴스별 메트릭으로 파싱 / Parse into per-instance metrics
    const instanceMetrics: Record<string, Record<string, number>> = {};
    for (const id of instanceIds) {
      instanceMetrics[id] = {};
    }

    for (const r of (result.MetricDataResults || [])) {
      const firstUnderscore = r.Id.indexOf('_');
      if (firstUnderscore < 0) continue;
      const metricKey = r.Id.substring(0, firstUnderscore);
      const safeInstId = r.Id.substring(firstUnderscore + 1);
      const matchedId = instanceIds.find(id => id.replace(/[^a-zA-Z0-9]/g, '_') === safeInstId);
      if (!matchedId) continue;
      const values = r.Values || [];
      if (values.length > 0 && instanceMetrics[matchedId] !== undefined) {
        instanceMetrics[matchedId][metricKey] = values[0];
      }
    }

    return NextResponse.json({ metrics: instanceMetrics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get metrics';
    return NextResponse.json({ error: message, metrics: {} }, { status: 500 });
  }
}
