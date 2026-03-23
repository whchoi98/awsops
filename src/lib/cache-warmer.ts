// Cache pre-warming: background refresh for dashboard & monitoring queries
// 캐시 프리워밍: 대시보드 & 모니터링 쿼리 백그라운드 갱신
// Runs on server start + every 4 minutes (before 5-min cache TTL expires)
// 서버 시작 시 + 4분마다 실행 (5분 캐시 TTL 만료 전)

import { batchQuery, checkCostAvailability } from '@/lib/steampipe';
import { queries as ec2Q } from '@/lib/queries/ec2';
import { queries as s3Q } from '@/lib/queries/s3';
import { queries as rdsQ } from '@/lib/queries/rds';
import { queries as lambdaQ } from '@/lib/queries/lambda';
import { queries as vpcQ } from '@/lib/queries/vpc';
import { queries as iamQ } from '@/lib/queries/iam';
import { queries as cwQ } from '@/lib/queries/cloudwatch';
import { queries as ecsQ } from '@/lib/queries/ecs';
import { queries as dynamoQ } from '@/lib/queries/dynamodb';
import { queries as costQ } from '@/lib/queries/cost';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { queries as secQ } from '@/lib/queries/security';
import { queries as ecacheQ } from '@/lib/queries/elasticache';
import { queries as ctQ } from '@/lib/queries/cloudtrail';
import { queries as cfQ } from '@/lib/queries/cloudfront';
import { queries as wafQ } from '@/lib/queries/waf';
import { queries as ecrQ } from '@/lib/queries/ecr';
import { queries as ebsQ } from '@/lib/queries/ebs';
import { queries as mskQ } from '@/lib/queries/msk';
import { queries as osQ } from '@/lib/queries/opensearch';
import { queries as metQ } from '@/lib/queries/metrics';

const WARM_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes / 4분
const METRIC_CACHE_TTL = 600; // 10 minutes for CloudWatch metric queries / CloudWatch 메트릭 쿼리는 10분
let warmingTimer: ReturnType<typeof setInterval> | null = null;
let isWarming = false;

// Dashboard queries (same as page.tsx) / 대시보드 쿼리 (page.tsx와 동일)
function getDashboardQueries(includeCost: boolean): Record<string, string> {
  return {
    ec2Status: ec2Q.statusCount,
    ec2Types: ec2Q.typeDistribution,
    s3Summary: s3Q.summary,
    rdsSummary: rdsQ.summary,
    lambdaSummary: lambdaQ.summary,
    vpcSummary: vpcQ.summary,
    iamSummary: iamQ.summary,
    cwSummary: cwQ.summary,
    ecsSummary: ecsQ.summary,
    dynamoSummary: dynamoQ.summary,
    ...(includeCost ? { costSummary: costQ.summary, costDetail: costQ.dashboardDetail } : {}),
    k8sNodes: k8sQ.nodeSummary,
    k8sPods: k8sQ.podSummary,
    k8sDeploy: k8sQ.deploymentSummary,
    secSummary: secQ.summary,
    ecacheSummary: ecacheQ.summary,
    ctSummary: ctQ.summary,
    cfSummary: cfQ.summary,
    wafSummary: wafQ.summary,
    ecrSummary: ecrQ.summary,
    ebsSummary: ebsQ.summary,
    mskSummary: mskQ.summary,
    osSummary: osQ.summary,
    k8sWarnings: k8sQ.warningEvents,
  };
}

// Monitoring queries (same as monitoring/page.tsx) / 모니터링 쿼리
function getMonitoringQueries(): Record<string, string> {
  return {
    ec2CpuLatest: metQ.ec2CpuLatest,
    ec2CpuHourly: metQ.ec2CpuHourly,
    ec2NetworkLatest: metQ.ec2NetworkLatest,
    ebsIopsLatest: metQ.ebsIopsLatest,
    ebsIopsHourly: metQ.ebsIopsHourly,
    rdsMetrics: metQ.rdsMetrics,
    rdsConnections: metQ.rdsConnections,
    rdsCpuDaily: metQ.rdsCpuDaily,
    k8sNodes: metQ.k8sNodeResources,
    k8sPodRes: metQ.k8sNodePodResources,
  };
}

async function warmCache(): Promise<void> {
  if (isWarming) return; // Skip if already running / 이미 실행 중이면 스킵
  isWarming = true;
  const start = Date.now();

  try {
    // 1. Check cost availability / Cost 가용성 확인
    const costResult = await checkCostAvailability();
    const includeCost = costResult.available;

    // 2. Run dashboard queries / 대시보드 쿼리 실행
    await batchQuery(getDashboardQueries(includeCost));

    // 3. Run monitoring queries with longer TTL (CloudWatch metrics are slow)
    // 모니터링 쿼리는 CloudWatch API 호출이 느리므로 TTL을 10분으로 설정
    await batchQuery(getMonitoringQueries(), false, METRIC_CACHE_TTL);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[CacheWarmer] Warmed dashboard + monitoring cache in ${elapsed}s`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[CacheWarmer] Failed: ${message}`);
  } finally {
    isWarming = false;
  }
}

// Start background cache warming / 백그라운드 캐시 워밍 시작
export function startCacheWarmer(): void {
  if (warmingTimer) return; // Already started / 이미 시작됨

  console.log('[CacheWarmer] Starting background cache warming (interval: 4min)');

  // Initial warm after 5s delay (let server fully start) / 서버 시작 5초 후 초기 워밍
  setTimeout(() => {
    warmCache();
  }, 5000);

  // Periodic refresh every 4 minutes / 4분마다 주기적 갱신
  warmingTimer = setInterval(() => {
    warmCache();
  }, WARM_INTERVAL_MS);
}

// Stop background cache warming / 백그라운드 캐시 워밍 중지
export function stopCacheWarmer(): void {
  if (warmingTimer) {
    clearInterval(warmingTimer);
    warmingTimer = null;
    console.log('[CacheWarmer] Stopped background cache warming');
  }
}
