// ElastiCache Node Metrics API — CloudWatch get-metric-data per cache node
// ElastiCache 노드 메트릭 API — 캐시 노드별 CloudWatch 메트릭 조회
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { getConfig } from '@/lib/app-config';

const DEFAULT_REGION = 'ap-northeast-2';
const CLUSTER_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

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

// CloudWatch 메트릭 쿼리 빌드 / Build CloudWatch metric queries
function buildMetricQueries(clusterIds: string[]): any[] {
  const metrics = [
    { id: 'cpu', name: 'CPUUtilization', stat: 'Average' },
    { id: 'ecpu', name: 'EngineCPUUtilization', stat: 'Average' },
    { id: 'mem', name: 'FreeableMemory', stat: 'Average' },
    { id: 'conn', name: 'CurrConnections', stat: 'Average' },
    { id: 'net_in', name: 'NetworkBytesIn', stat: 'Sum' },
    { id: 'net_out', name: 'NetworkBytesOut', stat: 'Sum' },
  ];

  const queries: any[] = [];
  for (const clusterId of clusterIds) {
    // 클러스터 ID에서 안전한 쿼리 ID 생성 / Create safe query ID from cluster ID
    const safeId = clusterId.replace(/[^a-zA-Z0-9]/g, '_');
    for (const m of metrics) {
      queries.push({
        Id: `${m.id}_${safeId}`.substring(0, 255),
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ElastiCache',
            MetricName: m.name,
            Dimensions: [
              { Name: 'CacheClusterId', Value: clusterId },
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
  const clusterIdsParam = searchParams.get('clusterIds');
  const accountId = searchParams.get('accountId');
  const { region, profileArgs } = getAccountProfile(accountId);

  if (!clusterIdsParam) {
    return NextResponse.json({ error: 'Missing clusterIds' }, { status: 400 });
  }

  const clusterIds = clusterIdsParam.split(',').filter(id => CLUSTER_ID_PATTERN.test(id));
  if (clusterIds.length === 0) {
    return NextResponse.json({ error: 'Invalid clusterIds' }, { status: 400 });
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const queries = buildMetricQueries(clusterIds);

    const metricInput = JSON.stringify({
      MetricDataQueries: queries,
      StartTime: oneHourAgo.toISOString(),
      EndTime: now.toISOString(),
    });

    // 임시 파일로 입력 전달 (arg 길이 제한 회피) / Use temp file to avoid arg length limits
    const tmpFile = `/tmp/ec-metrics-${Date.now()}.json`;
    execFileSync('bash', ['-c', `cat > ${tmpFile}`], { input: metricInput, encoding: 'utf-8' });

    const result = awsCli([
      'cloudwatch', 'get-metric-data',
      '--cli-input-json', `file://${tmpFile}`,
    ], region, profileArgs, 20000);

    try { execFileSync('rm', [tmpFile]); } catch {}

    if (!result) {
      return NextResponse.json({ metrics: {} });
    }

    // 클러스터별 메트릭으로 파싱 / Parse into per-cluster metrics
    const clusterMetrics: Record<string, Record<string, number>> = {};
    for (const id of clusterIds) {
      clusterMetrics[id] = {};
    }

    for (const r of (result.MetricDataResults || [])) {
      // ID 형식: cpu_clusterId, mem_clusterId 등
      const firstUnderscore = r.Id.indexOf('_');
      if (firstUnderscore < 0) continue;
      const metricKey = r.Id.substring(0, firstUnderscore);
      const safeClusterId = r.Id.substring(firstUnderscore + 1);

      // safeId를 원본 clusterIds와 매칭 / Match safeId to original clusterIds
      const matchedId = clusterIds.find(id => id.replace(/[^a-zA-Z0-9]/g, '_') === safeClusterId);
      if (!matchedId) continue;

      const values = r.Values || [];
      if (values.length > 0 && clusterMetrics[matchedId] !== undefined) {
        clusterMetrics[matchedId][metricKey] = values[0];
      }
    }

    return NextResponse.json({ metrics: clusterMetrics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get metrics';
    return NextResponse.json({ error: message, metrics: {} }, { status: 500 });
  }
}
