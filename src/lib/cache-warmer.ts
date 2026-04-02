// Cache pre-warming: background refresh for dashboard & monitoring queries
// 캐시 프리워밍: 대시보드 & 모니터링 쿼리 백그라운드 갱신
// Runs on server start + every 4 minutes (before 5-min cache TTL expires)
// 서버 시작 시 + 4분마다 실행 (5분 캐시 TTL 만료 전)

import { batchQuery, checkCostAvailability, startZombieCleanup } from '@/lib/steampipe';
import { getAccounts, isMultiAccount } from '@/lib/app-config';
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
// Monitoring queries removed from cache warmer — CloudWatch FDW causes pool exhaustion

const WARM_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes / 4분
// METRIC_CACHE_TTL removed — monitoring queries no longer run in cache warmer
let warmingTimer: ReturnType<typeof setInterval> | null = null;
let isWarming = false;
let initialized = false; // Lazy-init flag / 지연 초기화 플래그

// ============================================================================
// Cache warmer status tracking / 캐시 워머 상태 추적
// ============================================================================
interface CacheWarmerStatus {
  isRunning: boolean;           // Currently warming / 현재 워밍 중
  lastWarmedAt: string | null;  // Last successful warm timestamp / 마지막 성공 시각
  lastDurationSec: number | null; // Last warm duration in seconds / 마지막 소요 시간
  warmCount: number;            // Total successful warms since start / 시작 이후 총 성공 횟수
  lastError: string | null;     // Last error message / 마지막 에러
  startedAt: string | null;     // Server start time / 서버 시작 시각
  intervalMin: number;          // Refresh interval in minutes / 갱신 주기 (분)
  dashboardQueries: number;     // Number of dashboard queries / 대시보드 쿼리 수
  monitoringQueries: number;    // Number of monitoring queries / 모니터링 쿼리 수
  metricCacheTtlMin: number;    // Metric cache TTL in minutes / 메트릭 캐시 TTL (분)
}

const status: CacheWarmerStatus = {
  isRunning: false,
  lastWarmedAt: null,
  lastDurationSec: null,
  warmCount: 0,
  lastError: null,
  startedAt: null,
  intervalMin: WARM_INTERVAL_MS / 60000,
  dashboardQueries: 0,
  monitoringQueries: 0,
  metricCacheTtlMin: 0,
};

// Export status getter / 상태 조회 함수
export function getCacheWarmerStatus(): CacheWarmerStatus {
  return { ...status, isRunning: isWarming };
}

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

// Monitoring queries DISABLED — CloudWatch metric tables cause pg pool exhaustion
// via slow Steampipe FDW API calls that accumulate as zombie connections.
// 모니터링 쿼리 비활성화 — CloudWatch 메트릭 테이블의 느린 API 호출이 좀비 연결로 누적

async function warmCache(): Promise<void> {
  if (isWarming) return; // Skip if already running / 이미 실행 중이면 스킵
  isWarming = true;
  const start = Date.now();

  try {
    // 1. Check cost availability / Cost 가용성 확인
    const costResult = await checkCostAvailability();
    const includeCost = costResult.available;

    // 2. Run dashboard queries / 대시보드 쿼리 실행
    const dashQueries = getDashboardQueries(includeCost);
    status.dashboardQueries = Object.keys(dashQueries).length;
    await batchQuery(dashQueries);

    // 3. Monitoring queries DISABLED — CloudWatch metric tables make slow AWS API
    // calls via Steampipe FDW, causing zombie connections that exhaust the pg pool.
    // Monitoring page fetches its own data on demand.
    // 모니터링 쿼리 비활성화 — CloudWatch 메트릭 테이블은 Steampipe FDW를 통해
    // 느린 AWS API 호출을 하여 좀비 연결로 pg 풀을 고갈시킴.
    // 모니터링 페이지는 필요 시 직접 데이터를 가져옴.

    // 4. Multi-account: warm each account's dashboard cache (max 3 accounts)
    // 멀티 어카운트: 각 계정별 대시보드 캐시 워밍 (최대 3개)
    if (isMultiAccount()) {
      const MAX_WARM_ACCOUNTS = 3;
      const accounts = getAccounts().slice(0, MAX_WARM_ACCOUNTS);
      for (const acc of accounts) {
        try {
          const accDash = getDashboardQueries(acc.features?.costEnabled ?? false);
          await batchQuery(accDash, { accountId: acc.accountId });
        } catch (err: unknown) {
          console.warn(`[CacheWarmer] Account ${acc.alias} warm failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
      console.log(`[CacheWarmer] Warmed ${accounts.length} account caches`);
    }

    const elapsed = (Date.now() - start) / 1000;
    status.lastWarmedAt = new Date().toISOString();
    status.lastDurationSec = Math.round(elapsed * 10) / 10;
    status.warmCount++;
    status.lastError = null;
    const acctInfo = isMultiAccount() ? ` + ${Math.min(getAccounts().length, 3)} accounts` : '';
    console.log(`[CacheWarmer] Warmed dashboard (${status.dashboardQueries})${acctInfo} cache in ${elapsed.toFixed(1)}s`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    status.lastError = message;
    console.error(`[CacheWarmer] Failed: ${message}`);
  } finally {
    isWarming = false;
  }
}

// Start background cache warming / 백그라운드 캐시 워밍 시작
export function startCacheWarmer(): void {
  if (warmingTimer) return; // Already started / 이미 시작됨

  status.startedAt = new Date().toISOString();
  console.log('[CacheWarmer] Starting background cache warming (interval: 4min)');

  // Start zombie connection cleanup alongside cache warmer
  // 캐시 워머와 함께 좀비 연결 정리 시작
  startZombieCleanup();

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

// Lazy-init: auto-start on first API request (more reliable than instrumentation.ts)
// 지연 초기화: 첫 API 요청 시 자동 시작 (instrumentation.ts보다 안정적)
export function ensureCacheWarmerStarted(): void {
  if (initialized) return;
  initialized = true;
  startCacheWarmer();
}
