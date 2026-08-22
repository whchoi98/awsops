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
  GetMonitorCommand: class { constructor(public input: unknown) {} },
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

describe('nfmFleetTimeline', () => {
  const T1 = new Date('2026-08-19T05:00:00Z');
  const T2 = new Date('2026-08-19T05:42:00Z');
  const listMonitors = (names: string[]) => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') {
        return monitorsResponse(names.map((n) => ({ monitorName: n, monitorStatus: 'ACTIVE' })));
      }
      return { scopes: [] };
    });
  };
  const result = (Id: string, Values: number[], extra: Record<string, unknown> = {}) => ({
    Id, Timestamps: Values.map((_, i) => (i === 0 ? T1 : T2)), Values, ...extra,
  });

  it('batches ALL monitors × 5 metrics into one GetMetricData call and maps results back', async () => {
    listMonitors(['nfm-eks-prod', 'nfm-vpc-all']);
    cwSend.mockResolvedValue({
      MetricDataResults: [
        result('m0_timeouts', [0, 3]),
        result('m0_rtt', [30, 50]),
        result('m1_transfer', [1e9, 2e9]),
      ],
    });
    const { nfmFleetTimeline } = await import('./nfm');
    const t = await nfmFleetTimeline(604800);

    expect(cwSend).toHaveBeenCalledTimes(1); // 모니터별/메트릭별 개별 콜 금지 — 1콜 배치
    const input = (cwSend.mock.calls[0][0] as Cmd).input as {
      ScanBy: string;
      MetricDataQueries: { Id: string; MetricStat: { Period: number; Stat: string; Metric: { Namespace: string; MetricName: string; Dimensions: { Name: string; Value: string }[] } } }[];
    };
    expect(input.ScanBy).toBe('TimestampAscending');
    expect(input.MetricDataQueries).toHaveLength(10); // 2 monitors × 5 metrics
    const q0 = input.MetricDataQueries.find((q) => q.Id === 'm0_rtt');
    expect(q0?.MetricStat.Metric.Namespace).toBe('AWS/NetworkFlowMonitor');
    expect(q0?.MetricStat.Metric.MetricName).toBe('RoundTripTime');
    expect(q0?.MetricStat.Stat).toBe('Average');
    expect(q0?.MetricStat.Metric.Dimensions).toEqual([{ Name: 'MonitorId', Value: arnOf('nfm-eks-prod') }]);
    const q1 = input.MetricDataQueries.find((q) => q.Id === 'm1_transfer');
    expect(q1?.MetricStat.Metric.MetricName).toBe('DataTransferred');
    expect(q1?.MetricStat.Stat).toBe('Sum');
    expect(q1?.MetricStat.Metric.Dimensions).toEqual([{ Name: 'MonitorId', Value: arnOf('nfm-vpc-all') }]);
    // 7d — 버킷 ≤ 240개, period는 60의 배수
    const period = q0!.MetricStat.Period;
    expect(period % 60).toBe(0);
    expect(604800 / period).toBeLessThanOrEqual(240);

    expect(t.available).toBe(true);
    expect(t.monitors).toEqual(['nfm-eks-prod', 'nfm-vpc-all']);
    expect(t.series.timeouts['nfm-eks-prod']).toEqual([{ t: T1.getTime(), v: 0 }, { t: T2.getTime(), v: 3 }]);
    expect(t.series.rtt['nfm-eks-prod']).toEqual([{ t: T1.getTime(), v: 30 }, { t: T2.getTime(), v: 50 }]);
    expect(t.series.transfer['nfm-vpc-all']).toEqual([{ t: T1.getTime(), v: 1e9 }, { t: T2.getTime(), v: 2e9 }]);
    expect(t.series.transfer['nfm-eks-prod']).toEqual([]); // 무데이터 시리즈는 빈 배열
  });

  it('merges paginated GetMetricData responses (NextToken)', async () => {
    listMonitors(['nfm-eks-prod']);
    cwSend
      .mockResolvedValueOnce({ MetricDataResults: [result('m0_timeouts', [1])], NextToken: 'p2' })
      .mockResolvedValueOnce({ MetricDataResults: [{ Id: 'm0_timeouts', Timestamps: [T2], Values: [2] }] });
    const { nfmFleetTimeline } = await import('./nfm');
    const t = await nfmFleetTimeline(3600);
    expect(cwSend).toHaveBeenCalledTimes(2);
    expect(t.series.timeouts['nfm-eks-prod']).toEqual([{ t: T1.getTime(), v: 1 }, { t: T2.getTime(), v: 2 }]);
  });

  it('degrades to available:false when no monitor has any datapoint', async () => {
    listMonitors(['nfm-eks-prod']);
    cwSend.mockResolvedValue({ MetricDataResults: [{ Id: 'm0_rtt', Timestamps: [], Values: [] }] });
    const { nfmFleetTimeline } = await import('./nfm');
    const t = await nfmFleetTimeline(3600);
    expect(t.available).toBe(false);
    expect(t.monitors).toEqual(['nfm-eks-prod']);
  });

  it('returns available:false without calling CW when there are no monitors', async () => {
    listMonitors([]);
    const { nfmFleetTimeline } = await import('./nfm');
    const t = await nfmFleetTimeline(3600);
    expect(t).toMatchObject({ available: false, monitors: [] });
    expect(cwSend).not.toHaveBeenCalled();
  });

  it('caches per range: second identical call sends nothing new', async () => {
    listMonitors(['nfm-eks-prod']);
    cwSend.mockResolvedValue({ MetricDataResults: [result('m0_rtt', [30, 40])] });
    const { nfmFleetTimeline } = await import('./nfm');
    await nfmFleetTimeline(3600);
    await nfmFleetTimeline(3600);
    expect(cwSend).toHaveBeenCalledTimes(1);
    await nfmFleetTimeline(21600);
    expect(cwSend).toHaveBeenCalledTimes(2);
  });
});

describe('nfmMonitorCoverage', () => {
  it('fetches GetMonitor per monitor and summarizes local/remote resources', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') {
        return monitorsResponse([
          { monitorName: 'nfm-eks-prod', monitorStatus: 'ACTIVE' },
          { monitorName: 'nfm-vpc-all', monitorStatus: 'ACTIVE' },
        ]);
      }
      if (cmd.constructor.name === 'ListScopesCommand') return { scopes: [] };
      if (cmd.constructor.name === 'GetMonitorCommand') {
        const name = (cmd.input as { monitorName: string }).monitorName;
        return name === 'nfm-eks-prod'
          ? {
              localResources: [
                { type: 'AWS::EC2::Subnet', identifier: 'subnet-aaa' },
                { type: 'AWS::EC2::Subnet', identifier: 'subnet-bbb' },
              ],
              remoteResources: [],
            }
          : {
              localResources: [{ type: 'AWS::EC2::VPC', identifier: 'vpc-111' }],
              remoteResources: [{ type: 'AWS::EC2::VPC', identifier: 'vpc-222' }],
            };
      }
      throw new Error(`unexpected ${cmd.constructor.name}`);
    });
    const { nfmMonitorCoverage } = await import('./nfm');
    const cov = await nfmMonitorCoverage();
    expect(cov['nfm-eks-prod']).toEqual({
      local: [{ type: 'Subnet', id: 'subnet-aaa' }, { type: 'Subnet', id: 'subnet-bbb' }],
      remote: [],
    });
    expect(cov['nfm-vpc-all']).toEqual({
      local: [{ type: 'VPC', id: 'vpc-111' }],
      remote: [{ type: 'VPC', id: 'vpc-222' }],
    });
  });

  it('drops a monitor whose GetMonitor fails instead of failing the whole map', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') {
        return monitorsResponse([
          { monitorName: 'ok', monitorStatus: 'ACTIVE' },
          { monitorName: 'broken', monitorStatus: 'ACTIVE' },
        ]);
      }
      if (cmd.constructor.name === 'ListScopesCommand') return { scopes: [] };
      if ((cmd.input as { monitorName?: string }).monitorName === 'broken') throw new Error('boom');
      return { localResources: [{ type: 'AWS::EC2::Subnet', identifier: 's-1' }], remoteResources: [] };
    });
    const { nfmMonitorCoverage } = await import('./nfm');
    const cov = await nfmMonitorCoverage();
    expect(cov['ok']).toBeDefined();
    expect(cov['broken']).toBeUndefined();
  });

  it('caches: second call sends no additional GetMonitor', async () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'ListMonitorsCommand') return monitorsResponse([{ monitorName: 'a', monitorStatus: 'ACTIVE' }]);
      if (cmd.constructor.name === 'ListScopesCommand') return { scopes: [] };
      return { localResources: [], remoteResources: [] };
    });
    const { nfmMonitorCoverage } = await import('./nfm');
    await nfmMonitorCoverage();
    const calls = nfmSend.mock.calls.length;
    await nfmMonitorCoverage();
    expect(nfmSend.mock.calls.length).toBe(calls);
  });
});

describe('nfmTopContributors — explicit window', () => {
  const mockQueryFlow = () => {
    nfmSend.mockImplementation(async (cmd: Cmd) => {
      if (cmd.constructor.name === 'StartQueryMonitorTopContributorsCommand') return { queryId: 'q1' };
      if (cmd.constructor.name === 'GetQueryStatusMonitorTopContributorsCommand') return { status: 'SUCCEEDED' };
      if (cmd.constructor.name === 'GetQueryResultsMonitorTopContributorsCommand') return { topContributors: [], unit: 'Count' };
      throw new Error(`unexpected ${cmd.constructor.name}`);
    });
  };

  it('queries the given historical window instead of the trailing range', async () => {
    mockQueryFlow();
    const { nfmTopContributors } = await import('./nfm');
    const startMs = Date.parse('2026-08-19T12:00:00Z');
    const endMs = Date.parse('2026-08-19T13:00:00Z');
    await nfmTopContributors('m', 'TIMEOUTS', 'INTRA_AZ', 3600, 50, { startMs, endMs });
    const start = nfmSend.mock.calls.map((c) => c[0] as Cmd).find((c) => c.constructor.name === 'StartQueryMonitorTopContributorsCommand')!;
    const input = start.input as { startTime: Date; endTime: Date };
    expect(input.startTime.getTime()).toBe(startMs);
    expect(input.endTime.getTime()).toBe(endMs);
  });

  it('rejects a window longer than 1h regardless of rangeSec', async () => {
    mockQueryFlow();
    const { nfmTopContributors } = await import('./nfm');
    await expect(
      nfmTopContributors('m', 'TIMEOUTS', 'INTRA_AZ', 900, 50, { startMs: 0, endMs: 7200_000 }),
    ).rejects.toThrow(/max 3600s/);
  });

  it('caches windowed and trailing queries under distinct keys', async () => {
    mockQueryFlow();
    const { nfmTopContributors } = await import('./nfm');
    await nfmTopContributors('m', 'TIMEOUTS', 'INTRA_AZ', 3600, 50, { startMs: 0, endMs: 3600_000 });
    await nfmTopContributors('m', 'TIMEOUTS', 'INTRA_AZ', 3600, 50);
    const starts = nfmSend.mock.calls.map((c) => c[0] as Cmd).filter((c) => c.constructor.name === 'StartQueryMonitorTopContributorsCommand');
    expect(starts).toHaveLength(2); // 창 조회와 trailing 조회는 별도 캐시 키
  });
});
