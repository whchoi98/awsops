'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { RangePicker } from '@/components/inventory/metrics/shared';
import { axisTick } from '@/components/charts/theme';
import { useChartColors } from '@/lib/use-chart-colors';
import { useI18n } from '@/components/shell/LanguageProvider';
import {
  NFM_TIMELINE_PRESETS, buildTimelineRows, formatMicros, formatTimelineTick, rowStats,
  type TimelinePoint, type TimelineRow,
} from '@/lib/nfm-format';
import type { NfmCoverage, NfmTimelineMetricKey } from '@/lib/nfm';

// 모니터별 추이 — GET /api/nfm/timeline (전 모니터 × 5메트릭 CW 배치, lib/nfm.ts).
// Grafana 패리티 2가지를 채택 (실사용 사례 대조): ① 메트릭 4패널 동시
// 그리드(전환 없이 한눈 비교) ② 범례 = 통계 테이블(Max/Mean/Last — 시리즈가 많아도
// 최악 페어가 랭킹으로 보임). 기간은 CW 경로 전용 프리셋(15m~7d) — 쿼리 패널의
// 1h 캡과 무관. /GB 정규화는 타임아웃·재전송에만 (트래픽 증가에 따른 착시 제거).

type PanelMetric = Exclude<NfmTimelineMetricKey, 'health'>; // health(0/1)는 HealthBand 전담
/** 추이 차트 클릭 → 플로우 조회 연동용 메트릭 매핑 (NFM 쿼리 enum). */
export const PANEL_TO_QUERY_METRIC: Record<PanelMetric, string> = {
  timeouts: 'TIMEOUTS', retx: 'RETRANSMISSIONS', rtt: 'ROUND_TRIP_TIME', transfer: 'DATA_TRANSFERRED',
};
export type FleetPointClick = (tMs: number, queryMetric: string) => void;
const NORMALIZABLE = new Set<PanelMetric>(['timeouts', 'retx']);
const MB = 1 / 1e6;

const PANELS: { key: PanelMetric; label: string }[] = [
  { key: 'timeouts', label: '타임아웃' },
  { key: 'retx', label: '재전송' },
  { key: 'rtt', label: 'RTT' },
  { key: 'transfer', label: '전송량' },
];

interface TimelineResp {
  available: boolean;
  rangeSec: number;
  monitors: string[];
  series: Partial<Record<NfmTimelineMetricKey, Record<string, TimelinePoint[]>>>;
  /** 모니터별 감시 대상 (GetMonitor local/remoteResources) — best-effort, 없을 수 있음. */
  coverage?: Record<string, NfmCoverage>;
  error?: string;
}

/** 범례용 커버리지 요약 — 로컬 리소스 타입별 개수 (예: 'Subnet×2 · VPC'). 없으면 null. */
function covSummary(c?: NfmCoverage): string | null {
  if (!c?.local.length) return null;
  const counts = new Map<string, number>();
  for (const r of c.local) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  return [...counts].map(([t, n]) => (n > 1 ? `${t}×${n}` : t)).join(' · ');
}

/** 호버 툴팁용 전체 목록 — 로컬 id 나열 + 원격(비어있으면 전체 트래픽). */
function covTitle(monitor: string, c: NfmCoverage | undefined, allLabel: string): string {
  if (!c?.local.length) return monitor;
  const local = c.local.map((r) => r.id).join(', ');
  const remote = c.remote.length ? c.remote.map((r) => r.id).join(', ') : allLabel;
  return `${monitor}\n${local} → ${remote}`;
}

const fmtCount = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 }));
function fmtFor(metric: PanelMetric, normalized: boolean): (v: number) => string {
  if (metric === 'rtt') return formatMicros;
  if (metric === 'transfer') return (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
  return normalized ? (v) => `${v.toFixed(1)}` : fmtCount;
}

function MetricPanel({ metric, label, rows, monitors, unit, valueFmt, rangeSec, coverage, onPointClick }: {
  metric: PanelMetric; label: string; rows: TimelineRow[]; monitors: string[];
  unit: string; valueFmt: (v: number) => string; rangeSec: number;
  coverage?: Record<string, NfmCoverage>;
  onPointClick?: FleetPointClick;
}) {
  const { tt } = useI18n();
  const c = useChartColors();
  const colorFor = (i: number) => c.palette[i % c.palette.length];
  // recharts 3: 외부 onClick/onMouseMove state의 activeLabel이 undefined (실측) —
  // 툴팁 content 렌더가 마지막 활성 버킷을 ref에 기록하고 클릭이 그 값을 쓴다.
  const hoverT = useRef<number | null>(null);
  const TipContent = ({ active, label, payload }: {
    active?: boolean; label?: number | string;
    payload?: { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }[];
  }) => {
    const t = Number(label);
    hoverT.current = active && Number.isFinite(t) ? t : null;
    if (!active || !payload?.length) return null;
    const rows = [...payload].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    return (
      <div style={{ background: c.tooltipBg, borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,.25)', padding: '8px 10px' }}>
        <div style={{ color: c.tooltipFg, fontSize: 11, marginBottom: 2 }}>{formatTimelineTick(t, rangeSec)}</div>
        {rows.map((p, i) => (
          <div key={String(p.dataKey ?? i)} style={{ color: c.tooltipFg, fontSize: 12 }}>
            <span style={{ color: p.color }}>●</span> {String(p.name)} : {valueFmt(Number(p.value) || 0)}
          </div>
        ))}
      </div>
    );
  };
  // Grafana 범례 테이블 패리티 — Max 내림차순: 최악 시리즈가 맨 위.
  const stats = monitors
    .map((m, i) => ({ m, i, s: rowStats(rows, m) }))
    .filter((x): x is { m: string; i: number; s: NonNullable<ReturnType<typeof rowStats>> } => x.s != null)
    .sort((a, b) => b.s.max - a.s.max);
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <div className="mb-1 text-[12px] font-medium text-ink-600">
        {tt(label)} <span className="font-normal text-ink-400">({unit})</span>
      </div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* syncId — 4패널 커서/툴팁 동기화 (한 패널 호버 = 같은 시점을 전 패널에서 하이라이트).
              버킷 집합이 메트릭마다 다를 수 있어 인덱스가 아닌 t 값 기준(syncMethod="value"). */}
          <LineChart
            data={rows}
            margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
            syncId="nfm-fleet-timeline"
            syncMethod="value"
            style={onPointClick ? { cursor: 'pointer' } : undefined}
            onMouseLeave={() => { hoverT.current = null; }}
            onClick={() => {
              if (hoverT.current != null) onPointClick?.(hoverT.current, PANEL_TO_QUERY_METRIC[metric]);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="t" tick={axisTick(c)} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(t) => formatTimelineTick(Number(t), rangeSec)} />
            <YAxis tick={axisTick(c)} tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<TipContent />} />
            {monitors.map((m, i) => (
              <Line key={m} type="monotone" dataKey={m} name={m} stroke={colorFor(i)} strokeWidth={1.6} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {stats.length > 0 && (
        <table className="mt-2.5 w-full border-t border-ink-100 text-[11.5px]" data-metric={metric}>
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-400">
              <th className="pb-1 pt-1.5 text-left font-medium">{tt('모니터')}</th>
              <th className="w-[72px] pb-1 pt-1.5 text-right font-medium">Max</th>
              <th className="w-[72px] pb-1 pt-1.5 text-right font-medium">Mean</th>
              <th className="w-[72px] pb-1 pt-1.5 text-right font-medium">Last</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(({ m, i, s }) => (
              <tr key={m} className="border-t border-ink-50 hover:bg-ink-50/60">
                <td className="max-w-[280px] py-1 pr-2" title={covTitle(m, coverage?.[m], tt('전체'))}>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(i) }} />
                    <span className="truncate font-medium text-ink-700">{m}</span>
                    {covSummary(coverage?.[m]) && (
                      <Badge tone="neutral" variant="outline" mono>{covSummary(coverage?.[m])}</Badge>
                    )}
                  </span>
                </td>
                <td className="tabular py-1 text-right font-semibold text-ink-800">{valueFmt(s.max)}</td>
                <td className="tabular py-1 text-right text-ink-600">{valueFmt(s.mean)}</td>
                <td className="tabular py-1 text-right text-ink-600">{valueFmt(s.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function FleetTimeline({ onPointClick }: { onPointClick?: FleetPointClick } = {}) {
  const { tt } = useI18n();
  const [range, setRange] = useState(86400);
  const [perGb, setPerGb] = useState(false);
  const [data, setData] = useState<TimelineResp | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setErr('');
    fetch(`/api/nfm/timeline?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: TimelineResp) => { if (alive) setData(d); })
      .catch((e) => { if (alive) { setData(null); setErr(e instanceof Error ? e.message : String(e)); } });
    return () => { alive = false; };
  }, [range]);

  // 패널별 recharts 행 — /GB는 타임아웃·재전송에만 적용, 전송량은 MB 스케일.
  const rowsByMetric = useMemo(() => {
    const out = {} as Record<PanelMetric, TimelineRow[]>;
    for (const { key } of PANELS) {
      const byMonitor = data?.series?.[key];
      out[key] = byMonitor
        ? buildTimelineRows(byMonitor, {
            scale: key === 'transfer' ? MB : 1,
            perGbBy: perGb && NORMALIZABLE.has(key) ? data?.series?.transfer : undefined,
          })
        : [];
    }
    return out;
  }, [data, perGb]);

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setPerGb((p) => !p)}
        className={`rounded-md border px-2 py-1 text-[11.5px] ${perGb ? 'border-brand-300 bg-brand-500/10 font-medium text-brand-700' : 'border-ink-200 text-ink-400 hover:bg-ink-50'}`}
        title={tt('버킷별 전송량(GB)으로 나눈 정규화 — 트래픽 증가에 따른 절대 건수 착시 제거')}
      >
        /GB
      </button>
      <RangePicker value={range} onChange={setRange} ranges={NFM_TIMELINE_PRESETS} />
    </div>
  );

  const body = !data && !err
    ? <div className="py-6 text-center text-[12.5px] text-ink-400">{tt('로딩 중…')}</div>
    : err || !data?.available
      ? (
        <div className="py-6 text-center text-[12.5px] text-ink-400">
          {err ? `${tt('조회 실패')}: ${err}` : tt('수집 전 — 기간 내 CW 메트릭 데이터 없음')}
        </div>
      )
      : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {PANELS.map(({ key, label }) => {
            const normalized = perGb && NORMALIZABLE.has(key);
            const unit = key === 'transfer' ? 'MB' : key === 'rtt' ? 'µs' : normalized ? tt('건/GB') : tt('건');
            return (
              <MetricPanel
                key={key}
                metric={key}
                label={label}
                rows={rowsByMetric[key]}
                monitors={data.monitors}
                unit={unit}
                valueFmt={fmtFor(key, normalized)}
                rangeSec={range}
                coverage={data.coverage}
                onPointClick={onPointClick}
              />
            );
          })}
        </div>
      );

  return <Card title={tt('모니터별 추이')} right={controls}>{body}</Card>;
}
