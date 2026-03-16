// MSK Broker Nodes + Metrics API — AWS CLI (Steampipe has no broker node/metric tables)
// MSK 브로커 노드 + 메트릭 API — AWS CLI 사용
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { getConfig } from '@/lib/app-config';

const DEFAULT_REGION = 'ap-northeast-2';
const ARN_PATTERN = /^arn:aws:kafka:[a-z0-9-]+:\d{12}:cluster\/[a-zA-Z0-9._-]+\/[a-z0-9-]+$/;
const CLUSTER_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

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

// Build CloudWatch metric query for MSK broker / MSK 브로커용 CloudWatch 메트릭 쿼리 생성
function buildMetricQueries(clusterName: string, brokerIds: number[]): any[] {
  const metrics = [
    { id: 'cpu_user', name: 'CpuUser', stat: 'Average' },
    { id: 'cpu_system', name: 'CpuSystem', stat: 'Average' },
    { id: 'mem_used', name: 'MemoryUsed', stat: 'Average' },
    { id: 'mem_free', name: 'MemoryFree', stat: 'Average' },
    { id: 'net_rx', name: 'NetworkRxPackets', stat: 'Sum' },
    { id: 'net_tx', name: 'NetworkTxPackets', stat: 'Sum' },
    { id: 'bytes_in', name: 'BytesInPerSec', stat: 'Average' },
    { id: 'bytes_out', name: 'BytesOutPerSec', stat: 'Average' },
  ];

  const queries: any[] = [];
  for (const brokerId of brokerIds) {
    for (const m of metrics) {
      queries.push({
        Id: `${m.id}_b${brokerId}`,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/Kafka',
            MetricName: m.name,
            Dimensions: [
              { Name: 'Cluster Name', Value: clusterName },
              { Name: 'Broker ID', Value: String(brokerId) },
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
  const action = searchParams.get('action');
  const clusterArn = searchParams.get('clusterArn');
  const clusterName = searchParams.get('clusterName');
  const accountId = searchParams.get('accountId');
  const { region, profileArgs } = getAccountProfile(accountId);

  // Action: metrics — fetch CloudWatch metrics for brokers
  if (action === 'metrics') {
    if (!clusterName || !CLUSTER_NAME_PATTERN.test(clusterName)) {
      return NextResponse.json({ error: 'Invalid clusterName' }, { status: 400 });
    }
    const brokerIdsParam = searchParams.get('brokerIds');
    if (!brokerIdsParam) {
      return NextResponse.json({ error: 'Missing brokerIds' }, { status: 400 });
    }
    const brokerIds = brokerIdsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    if (brokerIds.length === 0) {
      return NextResponse.json({ error: 'Invalid brokerIds' }, { status: 400 });
    }

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const queries = buildMetricQueries(clusterName, brokerIds);

      // CloudWatch allows max 500 queries per call
      const metricInput = JSON.stringify({
        MetricDataQueries: queries,
        StartTime: oneHourAgo.toISOString(),
        EndTime: now.toISOString(),
      });

      // Write metric query to temp file to avoid arg length limits
      const tmpFile = `/tmp/msk-metrics-${Date.now()}.json`;
      execFileSync('bash', ['-c', `cat > ${tmpFile}`], { input: metricInput, encoding: 'utf-8' });

      const result = awsCli([
        'cloudwatch', 'get-metric-data',
        '--cli-input-json', `file://${tmpFile}`,
      ], region, profileArgs, 20000);

      // Clean up temp file
      try { execFileSync('rm', [tmpFile]); } catch {}

      if (!result) {
        return NextResponse.json({ metrics: {} });
      }

      // Parse results into per-broker metrics / 브로커별 메트릭으로 파싱
      const brokerMetrics: Record<number, Record<string, number>> = {};
      for (const brokerId of brokerIds) {
        brokerMetrics[brokerId] = {};
      }

      for (const r of (result.MetricDataResults || [])) {
        const match = r.Id.match(/^(.+)_b(\d+)$/);
        if (!match) continue;
        const metricKey = match[1];
        const bId = Number(match[2]);
        const values = r.Values || [];
        if (values.length > 0 && brokerMetrics[bId] !== undefined) {
          brokerMetrics[bId][metricKey] = values[0]; // latest value
        }
      }

      return NextResponse.json({ metrics: brokerMetrics });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get metrics';
      return NextResponse.json({ error: message, metrics: {} }, { status: 500 });
    }
  }

  // Default action: list nodes
  if (!clusterArn || !ARN_PATTERN.test(clusterArn)) {
    return NextResponse.json({ error: 'Invalid or missing clusterArn' }, { status: 400 });
  }

  try {
    const data = awsCli(['kafka', 'list-nodes', '--cluster-arn', clusterArn], region, profileArgs);
    return NextResponse.json({ nodes: data?.NodeInfoList || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list MSK nodes';
    return NextResponse.json({ error: message, nodes: [] }, { status: 500 });
  }
}
