// Container Cost API: ECS task metadata + CloudWatch Container Insights metrics
// 컨테이너 비용 API: ECS Task 메타데이터 + CloudWatch Container Insights 메트릭
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { runQuery } from '@/lib/steampipe';
import { getConfig } from '@/lib/app-config';
import { queries } from '@/lib/queries/container-cost';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const DEFAULT_REGION = 'ap-northeast-2';

function getAccountProfile(accountId?: string | null): { region: string; profileArgs: string[] } {
  if (!accountId) return { region: DEFAULT_REGION, profileArgs: [] };
  const config = getConfig();
  const account = config.accounts?.find((a: any) => a.accountId === accountId);
  if (!account) return { region: DEFAULT_REGION, profileArgs: [] };
  return {
    region: account.region || DEFAULT_REGION,
    profileArgs: account.profile ? ['--profile', account.profile] : [],
  };
}

// AWS CLI helper — same pattern as msk/route.ts / AWS CLI 헬퍼 — msk/route.ts와 동일 패턴
function awsCli(args: string[], region: string = DEFAULT_REGION, profileArgs: string[] = []): any | null {
  try {
    const result = execFileSync('aws', [...args, '--region', region, ...profileArgs, '--output', 'json'], {
      encoding: 'utf-8', timeout: 30000,
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

// Fargate cost calculation / Fargate 비용 계산
function calculateFargateCost(cpuUnits: number, memoryMb: number, hours: number): {
  cpuCost: number; memoryCost: number; totalCost: number;
} {
  const config = getConfig();
  const pricing = config.fargatePricing || { vcpuPerHour: 0.04048, gbMemPerHour: 0.004445 };
  const vcpu = cpuUnits / 1024;
  const gbMem = memoryMb / 1024;
  const cpuCost = vcpu * (pricing.vcpuPerHour || 0.04048) * hours;
  const memoryCost = gbMem * (pricing.gbMemPerHour || 0.004445) * hours;
  return { cpuCost, memoryCost, totalCost: cpuCost + memoryCost };
}

// Container Insights metrics query / Container Insights 메트릭 쿼리
function getContainerInsightsMetrics(clusterName: string, serviceName?: string, region: string = DEFAULT_REGION, profileArgs: string[] = []): any | null {
  const now = new Date();
  const start = new Date(now.getTime() - 3600 * 1000); // 1 hour ago / 1시간 전

  const dimensions: any[] = [{ Name: 'ClusterName', Value: clusterName }];
  if (serviceName) dimensions.push({ Name: 'ServiceName', Value: serviceName });

  const metricDefs = [
    { key: 'cpuUtilized', name: 'CpuUtilized', stat: 'Average' },
    { key: 'memoryUtilized', name: 'MemoryUtilized', stat: 'Average' },
    { key: 'cpuReserved', name: 'CpuReserved', stat: 'Average' },
    { key: 'memoryReserved', name: 'MemoryReserved', stat: 'Average' },
  ];

  const metricQueries = metricDefs.map((m, i) => ({
    Id: `m${i}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/ECS/ContainerInsights',
        MetricName: m.name,
        Dimensions: dimensions,
      },
      Period: 300,
      Stat: m.stat,
    },
  }));

  const input = {
    MetricDataQueries: metricQueries,
    StartTime: start.toISOString(),
    EndTime: now.toISOString(),
  };

  // Write to temp file to avoid arg length limits / 임시 파일로 arg 길이 제한 회피
  const tmpFile = join(tmpdir(), `container-cost-${Date.now()}.json`);
  try {
    writeFileSync(tmpFile, JSON.stringify(input));
    const result = awsCli(['cloudwatch', 'get-metric-data', '--cli-input-json', `file://${tmpFile}`], region, profileArgs);
    unlinkSync(tmpFile);

    if (!result?.MetricDataResults) return null;

    const metrics: Record<string, number> = {};
    result.MetricDataResults.forEach((r: any, i: number) => {
      const values = r.Values || [];
      metrics[metricDefs[i].key] = values.length > 0
        ? values.reduce((a: number, b: number) => a + b, 0) / values.length
        : 0;
    });
    return metrics;
  } catch {
    try { unlinkSync(tmpFile); } catch {}
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const accountId = searchParams.get('accountId');
  const { region, profileArgs } = getAccountProfile(accountId);
  const queryOpts = accountId ? { accountId } : {};

  try {
    if (action === 'tasks') {
      // ECS running tasks / ECS 실행 중 Task 목록
      const result = await runQuery(queries.ecsRunningTasks, queryOpts);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

      // Calculate cost per task / Task별 비용 계산
      const tasks = result.rows.map((t: any) => {
        const cpuUnits = parseInt(t.cpu) || 256;
        const memoryMb = parseInt(t.memory) || 512;
        const startedAt = new Date(t.started_at);
        const hoursRunning = Math.max((Date.now() - startedAt.getTime()) / 3600000, 0.01);
        const cost = t.launch_type === 'FARGATE'
          ? calculateFargateCost(cpuUnits, memoryMb, hoursRunning)
          : { cpuCost: 0, memoryCost: 0, totalCost: 0 };
        const dailyCost = t.launch_type === 'FARGATE'
          ? calculateFargateCost(cpuUnits, memoryMb, 24)
          : { cpuCost: 0, memoryCost: 0, totalCost: 0 };
        return { ...t, hoursRunning: Math.round(hoursRunning * 10) / 10, cost, dailyCost };
      });

      return NextResponse.json({ tasks });
    }

    if (action === 'metrics') {
      // Container Insights metrics per cluster / 클러스터별 Container Insights 메트릭
      const clusterName = searchParams.get('cluster');
      const serviceName = searchParams.get('service') || undefined;
      if (!clusterName) return NextResponse.json({ error: 'cluster required' }, { status: 400 });

      const metrics = getContainerInsightsMetrics(clusterName, serviceName, region, profileArgs);
      if (!metrics) {
        return NextResponse.json({
          metrics: null,
          insightsEnabled: false,
          message: 'Container Insights not enabled or no data available',
        });
      }
      return NextResponse.json({ metrics, insightsEnabled: true });
    }

    // Default: summary / 기본: 요약
    const [tasksResult, servicesResult, clustersResult] = await Promise.all([
      runQuery(queries.ecsRunningTasks, queryOpts),
      runQuery(queries.ecsServiceSummary, queryOpts),
      runQuery(queries.ecsClusters, queryOpts),
    ]);

    const tasks = (tasksResult.rows || []).map((t: any) => {
      const cpuUnits = parseInt(t.cpu) || 256;
      const memoryMb = parseInt(t.memory) || 512;
      const dailyCost = t.launch_type === 'FARGATE'
        ? calculateFargateCost(cpuUnits, memoryMb, 24)
        : { cpuCost: 0, memoryCost: 0, totalCost: 0 };
      return { ...t, dailyCost };
    });

    const totalDailyCost = tasks.reduce((sum: number, t: any) => sum + t.dailyCost.totalCost, 0);
    const fargateCount = tasks.filter((t: any) => t.launch_type === 'FARGATE').length;
    const ec2Count = tasks.filter((t: any) => t.launch_type === 'EC2').length;

    // Service cost aggregation / 서비스별 비용 집계
    const serviceCosts: Record<string, number> = {};
    tasks.forEach((t: any) => {
      const svc = t.service_name || 'unknown';
      serviceCosts[svc] = (serviceCosts[svc] || 0) + t.dailyCost.totalCost;
    });
    const namespaceCosts = Object.entries(serviceCosts)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 1000) / 1000 }))
      .sort((a, b) => b.cost - a.cost);

    return NextResponse.json({
      summary: {
        totalDailyCost: Math.round(totalDailyCost * 1000) / 1000,
        totalMonthly: Math.round(totalDailyCost * 30 * 100) / 100,
        taskCount: tasks.length,
        fargateCount,
        ec2Count,
        clusterCount: clustersResult.rows?.length || 0,
        topService: namespaceCosts[0] || null,
      },
      tasks,
      services: servicesResult.rows || [],
      clusters: clustersResult.rows || [],
      namespaceCosts,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch container cost data' }, { status: 500 });
  }
}
