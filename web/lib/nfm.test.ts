import { describe, it, expect, vi, beforeEach } from 'vitest';

const nfmSend = vi.fn();
const cwSend = vi.fn();
vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: class { send = cwSend; },
  GetMetricDataCommand: class { constructor(public input: Record<string, unknown>) {} },
}));
vi.mock('@aws-sdk/client-networkflowmonitor', () => ({
  NetworkFlowMonitorClient: class { send = nfmSend; },
  ListMonitorsCommand: class { constructor(public input: unknown) {} },
  ListScopesCommand: class { constructor(public input: unknown) {} },
  StartQueryMonitorTopContributorsCommand: class { constructor(public input: unknown) {} },
  GetQueryStatusMonitorTopContributorsCommand: class { constructor(public input: unknown) {} },
  GetQueryResultsMonitorTopContributorsCommand: class { constructor(public input: unknown) {} },
  StopQueryMonitorTopContributorsCommand: class { constructor(public input: unknown) {} },
}));

beforeEach(async () => {
  nfmSend.mockReset();
  cwSend.mockReset();
  const { _resetNfmCacheForTests } = await import('./nfm');
  _resetNfmCacheForTests();
});

// Dispatch helper: the 7 pod-transfer query chains run in parallel, so responses
// must be routed by command type (and queryId), not by call order.
type Cmd = { constructor: { name: string }; input: Record<string, unknown> };
// 라이브 ListMonitors는 monitorArn을 항상 포함한다 — 픽스처도 동일하게 생성.
const arnOf = (name: string) => `arn:aws:networkflowmonitor:ap-northeast-2:111122223333:monitor/${name}`;
const monitorsResponse = (monitors: { monitorName: string; monitorStatus: string }[]) =>
  ({ monitors: monitors.map((m) => ({ monitorArn: arnOf(m.monitorName), ...m })) });

describe('bytesToUsd', () => {
  it('charges $0.01/GB for INTER_AZ / INTER_VPC / INTER_REGION', async () => {
    const { bytesToUsd } = await import('./nfm');
    expect(bytesToUsd(1e9, 'INTER_AZ')).toBe(0.01);
    expect(bytesToUsd(1e9, 'INTER_VPC')).toBe(0.01);
    expect(bytesToUsd(1e9, 'INTER_REGION')).toBe(0.01);
    expect(bytesToUsd(5e9, 'INTER_AZ')).toBeCloseTo(0.05);
  });

  it('returns 0 for non-billable categories', async () => {
    const { bytesToUsd } = await import('./nfm');
    expect(bytesToUsd(1e12, 'INTRA_AZ')).toBe(0);
    expect(bytesToUsd(1e12, 'AMAZON_S3')).toBe(0);
    expect(bytesToUsd(1e12, 'AMAZON_DYNAMODB')).toBe(0);
    expect(bytesToUsd(1e12, 'UNCLASSIFIED')).toBe(0);
  });
});

describe('nfmStatus', () => {
  it('parses monitors (nfm-eks-X → cluster X, others → null) and scope count', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') {
        return monitorsResponse([
          { monitorName: 'nfm-eks-prod', monitorStatus: 'ACTIVE' },
          { monitorName: 'nfm-vpc-all', monitorStatus: 'ACTIVE' },
        ]);
      }
      if (cmd.constructor.name === 'ListScopesCommand') return { scopes: [{}, {}, {}] };
      throw new Error(`unexpected command ${cmd.constructor.name}`);
    });
    const { nfmStatus } = await import('./nfm');
    const s = await nfmStatus();
    expect(s.monitors).toEqual([
      { name: 'nfm-eks-prod', status: 'ACTIVE', cluster: 'prod', arn: arnOf('nfm-eks-prod') },
      { name: 'nfm-vpc-all', status: 'ACTIVE', cluster: null, arn: arnOf('nfm-vpc-all') },
    ]);
    expect(s.scopeCount).toBe(3);
  });

  it('caches: second call sends no additional commands', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) =>
      cmd.constructor.name === 'ListMonitorsCommand' ? monitorsResponse([]) : { scopes: [] });
    const { nfmStatus } = await import('./nfm');
    await nfmStatus();
    expect(nfmSend).toHaveBeenCalledTimes(2); // ListMonitors + ListScopes
    await nfmStatus();
    expect(nfmSend).toHaveBeenCalledTimes(2); // cache hit — no extra send
  });

  it('degrades scopeCount to 0 when ListScopes fails', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') return monitorsResponse([]);
      throw new Error('AccessDenied');
    });
    const { nfmStatus } = await import('./nfm');
    expect((await nfmStatus()).scopeCount).toBe(0);
  });
});

describe('nfmMonitorForCluster', () => {
  it('matches only ACTIVE monitors for the cluster', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') {
        return monitorsResponse([
          { monitorName: 'nfm-eks-prod', monitorStatus: 'ACTIVE' },
          { monitorName: 'nfm-eks-dev', monitorStatus: 'PENDING' },
        ]);
      }
      return { scopes: [] };
    });
    const { nfmMonitorForCluster } = await import('./nfm');
    expect(await nfmMonitorForCluster('prod')).toBe('nfm-eks-prod');
    expect(await nfmMonitorForCluster('dev')).toBeNull();     // exists but not ACTIVE
    expect(await nfmMonitorForCluster('missing')).toBeNull(); // no such monitor
  });
});

describe('nfmTopContributors', () => {
  it('runs start → status → results and normalizes rows (k8s metadata, traversed dedupe, unit)', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      switch (cmd.constructor.name) {
        case 'StartQueryMonitorTopContributorsCommand':
          expect(cmd.input.monitorName).toBe('nfm-eks-prod');
          expect(cmd.input.metricName).toBe('DATA_TRANSFERRED');
          expect(cmd.input.destinationCategory).toBe('INTER_AZ');
          return { queryId: 'q-1' };
        case 'GetQueryStatusMonitorTopContributorsCommand':
          return { status: 'SUCCEEDED' };
        case 'GetQueryResultsMonitorTopContributorsCommand':
          return {
            unit: 'Bytes',
            topContributors: [{
              localIp: '10.0.1.10', localAz: 'apne2-az1', localVpcId: 'vpc-1',
              remoteIp: '10.0.2.20', remoteAz: 'apne2-az2',
              value: 123,
              snatIp: '1.2.3.4', targetPort: 443,
              traversedConstructs: [
                { componentType: 'TGW' }, { componentType: 'TGW' }, { serviceName: 'NAT' }, {},
              ],
              kubernetesMetadata: {
                localPodName: 'pod-a', localPodNamespace: 'default', localServiceName: 'svc-a',
                remotePodName: 'pod-b', remotePodNamespace: 'kube-system',
              },
            }],
          };
        default:
          throw new Error(`unexpected command ${cmd.constructor.name}`);
      }
    });
    const { nfmTopContributors } = await import('./nfm');
    const r = await nfmTopContributors('nfm-eks-prod', 'DATA_TRANSFERRED', 'INTER_AZ', 3600);
    expect(r.unit).toBe('Bytes');
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    // kubernetesMetadata pod fields mapped onto local/remote endpoints
    expect(row.local).toMatchObject({ ip: '10.0.1.10', podName: 'pod-a', podNamespace: 'default', serviceName: 'svc-a' });
    expect(row.remote).toMatchObject({ ip: '10.0.2.20', podName: 'pod-b', podNamespace: 'kube-system' });
    expect(row.traversed).toEqual(['TGW', 'NAT']); // deduped, empties dropped
    expect(row).toMatchObject({ value: 123, unit: 'Bytes', category: 'INTER_AZ', snatIp: '1.2.3.4', targetPort: 443 });
  });

  it('caches by parameters: second identical call sends nothing new', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      switch (cmd.constructor.name) {
        case 'StartQueryMonitorTopContributorsCommand': return { queryId: 'q-1' };
        case 'GetQueryStatusMonitorTopContributorsCommand': return { status: 'SUCCEEDED' };
        default: return { unit: 'Bytes', topContributors: [] };
      }
    });
    const { nfmTopContributors } = await import('./nfm');
    await nfmTopContributors('m', 'DATA_TRANSFERRED', 'INTER_AZ', 3600);
    const calls = nfmSend.mock.calls.length;
    await nfmTopContributors('m', 'DATA_TRANSFERRED', 'INTER_AZ', 3600);
    expect(nfmSend).toHaveBeenCalledTimes(calls);
  });

  it('throws when the query status is FAILED', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      switch (cmd.constructor.name) {
        case 'StartQueryMonitorTopContributorsCommand': return { queryId: 'q-bad' };
        case 'GetQueryStatusMonitorTopContributorsCommand': return { status: 'FAILED' };
        default: throw new Error(`unexpected command ${cmd.constructor.name}`);
      }
    });
    const { nfmTopContributors } = await import('./nfm');
    await expect(nfmTopContributors('m', 'RETRANSMISSIONS', 'INTER_VPC', 3600)).rejects.toThrow('NFM query FAILED');
  });
});

describe('nfmHealthSummary', () => {
  const ARN = arnOf('nfm-eks-prod');
  const T1 = new Date('2026-08-04T05:00:00Z');
  const T2 = new Date('2026-08-04T05:01:00Z');
  const cwResponse = (byId: Record<string, number[]>) => ({
    MetricDataResults: Object.entries(byId).map(([Id, Values]) => ({
      Id, Timestamps: Values.map((_, i) => (i === 0 ? T1 : T2)), Values,
    })),
  });

  it('fetches all four metrics in ONE GetMetricData call scoped to the monitor ARN', async () => {
    cwSend.mockResolvedValue(cwResponse({ rtt: [30, 50], health: [0, 1], retx: [3, 4], tmo: [0, 2] }));
    const { nfmHealthSummary } = await import('./nfm');
    const s = await nfmHealthSummary(ARN, 3600);

    expect(cwSend).toHaveBeenCalledTimes(1); // 배치 1콜 — 모니터별/메트릭별 개별 콜 금지
    const input = (cwSend.mock.calls[0][0] as Cmd).input as {
      MetricDataQueries: { MetricStat: { Metric: { Namespace: string; Dimensions: { Name: string; Value: string }[] } } }[];
    };
    expect(input.MetricDataQueries).toHaveLength(4);
    for (const q of input.MetricDataQueries) {
      expect(q.MetricStat.Metric.Namespace).toBe('AWS/NetworkFlowMonitor');
      expect(q.MetricStat.Metric.Dimensions).toEqual([{ Name: 'MonitorId', Value: ARN }]);
    }

    expect(s.available).toBe(true);
    expect(s.degraded).toBe(true);        // HealthIndicator max > 0 → AWS망 이슈
    expect(s.timeouts).toBe(2);           // Sum
    expect(s.retransmissions).toBe(7);    // Sum
    expect(s.rttAvgUs).toBe(40);          // µs 평균 (CW 원단위 유지)
    expect(s.series.rtt).toEqual([{ t: T1.getTime(), v: 30 }, { t: T2.getTime(), v: 50 }]);
    expect(s.series.timeouts).toEqual([{ t: T1.getTime(), v: 0 }, { t: T2.getTime(), v: 2 }]);
  });

  it('reports healthy when HealthIndicator stays 0', async () => {
    cwSend.mockResolvedValue(cwResponse({ rtt: [30], health: [0, 0], retx: [0], tmo: [0] }));
    const { nfmHealthSummary } = await import('./nfm');
    const s = await nfmHealthSummary(ARN, 3600);
    expect(s.degraded).toBe(false);
    expect(s.timeouts).toBe(0);
  });

  it('degrades to available:false when no metric has datapoints', async () => {
    cwSend.mockResolvedValue({ MetricDataResults: [{ Id: 'rtt', Timestamps: [], Values: [] }] });
    const { nfmHealthSummary } = await import('./nfm');
    const s = await nfmHealthSummary(ARN, 3600);
    expect(s).toMatchObject({ available: false, degraded: null, timeouts: null, retransmissions: null, rttAvgUs: null });
  });

  it('keeps rttAvgUs null when RTT is sparse but other metrics exist', async () => {
    cwSend.mockResolvedValue(cwResponse({ health: [0], retx: [1], tmo: [0] }));
    const { nfmHealthSummary } = await import('./nfm');
    const s = await nfmHealthSummary(ARN, 3600);
    expect(s.available).toBe(true);
    expect(s.rttAvgUs).toBeNull(); // RTT는 sparse 가능 — UI가 "수집 전"을 그린다
  });

  it('caches per (arn, range): second call sends nothing new', async () => {
    cwSend.mockResolvedValue(cwResponse({ rtt: [30], health: [0], retx: [0], tmo: [0] }));
    const { nfmHealthSummary } = await import('./nfm');
    await nfmHealthSummary(ARN, 3600);
    await nfmHealthSummary(ARN, 3600);
    expect(cwSend).toHaveBeenCalledTimes(1);
    await nfmHealthSummary(ARN, 900); // 다른 range는 별도 키
    expect(cwSend).toHaveBeenCalledTimes(2);
  });
});

describe('nfmPodTransfer', () => {
  it('returns available:false when the cluster has no ACTIVE monitor', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) =>
      cmd.constructor.name === 'ListMonitorsCommand'
        ? monitorsResponse([{ monitorName: 'nfm-vpc-all', monitorStatus: 'ACTIVE' }])
        : { scopes: [] });
    const { nfmPodTransfer } = await import('./nfm');
    const r = await nfmPodTransfer('prod', 3600);
    expect(r).toEqual({
      available: false, monitor: null, rangeSec: 3600, pods: [],
      totals: { bytes: 0, billableBytes: 0, estUsd: 0, byCategory: {} },
      failedCategories: [],
    });
    // No top-contributors queries were started
    expect(nfmSend.mock.calls.some(([c]) => (c as Cmd).constructor.name === 'StartQueryMonitorTopContributorsCommand')).toBe(false);
  });

  it('aggregates by local pod, computes billable/estUsd, records failed categories', async () => {
    // Per-category fixtures; queryId encodes the category so status/results can route.
    const resultsByCategory: Record<string, unknown[]> = {
      INTER_AZ: [
        { value: 2_000_000_000, kubernetesMetadata: { localPodName: 'pod-a', localPodNamespace: 'default' } },
        { value: 500_000_000, kubernetesMetadata: { localPodName: 'pod-b', localPodNamespace: 'default' } },
      ],
      INTRA_AZ: [
        { value: 1_000_000_000, kubernetesMetadata: { localPodName: 'pod-a', localPodNamespace: 'default' } },
        { value: 3_000_000_000, localInstanceId: 'i-abc' }, // non-pod local → instance key
      ],
    };
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      switch (cmd.constructor.name) {
        case 'ListMonitorsCommand':
          return monitorsResponse([{ monitorName: 'nfm-eks-prod', monitorStatus: 'ACTIVE' }]);
        case 'ListScopesCommand':
          return { scopes: [{}] };
        case 'StartQueryMonitorTopContributorsCommand':
          return { queryId: `q-${cmd.input.destinationCategory}` };
        case 'GetQueryStatusMonitorTopContributorsCommand':
          return { status: cmd.input.queryId === 'q-UNCLASSIFIED' ? 'FAILED' : 'SUCCEEDED' };
        case 'GetQueryResultsMonitorTopContributorsCommand': {
          const cat = String(cmd.input.queryId).slice(2);
          return { unit: 'Bytes', topContributors: resultsByCategory[cat] ?? [] };
        }
        default:
          throw new Error(`unexpected command ${cmd.constructor.name}`);
      }
    });
    const { nfmPodTransfer } = await import('./nfm');
    const r = await nfmPodTransfer('prod', 3600);

    expect(r.available).toBe(true);
    expect(r.monitor).toBe('nfm-eks-prod');
    expect(r.failedCategories).toEqual(['UNCLASSIFIED']);

    // Sorted by estUsd desc, then bytes desc
    expect(r.pods.map((p) => p.key)).toEqual(['pod:default/pod-a', 'pod:default/pod-b', 'i:i-abc']);

    const [podA, podB, node] = r.pods;
    expect(podA).toMatchObject({
      podName: 'pod-a', namespace: 'default',
      bytes: 3_000_000_000, billableBytes: 2_000_000_000,
      byCategory: { INTER_AZ: 2_000_000_000, INTRA_AZ: 1_000_000_000 },
    });
    expect(podA.estUsd).toBeCloseTo(0.02);
    expect(podB).toMatchObject({ podName: 'pod-b', bytes: 500_000_000, billableBytes: 500_000_000 });
    expect(podB.estUsd).toBeCloseTo(0.005);
    expect(node).toMatchObject({ podName: null, namespace: null, bytes: 3_000_000_000, billableBytes: 0, estUsd: 0 });

    expect(r.totals.bytes).toBe(6_500_000_000);
    expect(r.totals.billableBytes).toBe(2_500_000_000);
    expect(r.totals.estUsd).toBeCloseTo(0.025);
    expect(r.totals.byCategory).toEqual({ INTER_AZ: 2_500_000_000, INTRA_AZ: 4_000_000_000 });
  });
});
