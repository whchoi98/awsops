// NFM 표시 단위 변환 — AWS SDK 무의존(클라이언트 컴포넌트에서 import 가능).
// CW의 RoundTripTime은 µs 단위(콘솔 실측: min 25µs, 대부분 <100µs)인 반면 monitor
// 쿼리 폴백 unit은 Milliseconds — 1000배 함정. µs 변환·표시는 이 모듈 한 곳에만 둔다.

// NFM 조회 기간 프리셋 — monitor 쿼리 1h 한도(NFM_MAX_RANGE_SEC)에 맞춘 enum.
// 쿼리 패널(RangePicker)과 상태 요약 밴드 라우트가 같은 값을 공유한다 (이중 정의 방지).
export const NFM_RANGE_PRESETS = [['15m', 900], ['30m', 1800], ['1h', 3600]] as const;
export const NFM_RANGE_VALUES: readonly number[] = NFM_RANGE_PRESETS.map(([, sec]) => sec);

// 모니터 추이 차트 프리셋 — CW 메트릭 경로 전용이라 1h 캡과 무관 (CW 보관: 1분 15일 /
// 5분 63일 — 15m/30m은 1분 버킷 그대로). 쿼리 패널 프리셋과 절대 합치지 말 것 —
// top-contributors는 1h가 하드 한도.
export const NFM_TIMELINE_PRESETS = [['15m', 900], ['30m', 1800], ['1h', 3600], ['6h', 21600], ['24h', 86400], ['7d', 604800]] as const;
export const NFM_TIMELINE_VALUES: readonly number[] = NFM_TIMELINE_PRESETS.map(([, sec]) => sec);

/** µs 값을 적응형 단위(µs → ms → s)로 표시. */
export function formatMicros(us: number): string {
  if (us < 1000) return `${Math.round(us)} µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)} ms`;
  return `${(us / 1_000_000).toFixed(1)} s`;
}

// ── 모니터 추이 차트 데이터 셰이핑 (recharts 입력) ──────────────────────────

export interface TimelinePoint { t: number; v: number }
export type TimelineRow = { t: number } & Record<string, number | null>;

/**
 * 모니터별 시계열을 recharts 행(버킷당 1행, 모니터당 1컬럼)으로 피벗.
 * - `scale`: 값 배율 (예: bytes → MB = 1/1e6)
 * - `perGbBy`: 같은 버킷의 전송량(bytes)으로 나눠 /GB 정규화 — 전송량 0/무데이터
 *   버킷은 null (나눗셈 불능을 0으로 오표시하지 않음; recharts는 null을 끊어 그림).
 */
export function buildTimelineRows(
  byMonitor: Record<string, TimelinePoint[]>,
  opts: { scale?: number; perGbBy?: Record<string, TimelinePoint[]> } = {},
): TimelineRow[] {
  const scale = opts.scale ?? 1;
  const monitors = Object.keys(byMonitor);
  const ts = [...new Set(monitors.flatMap((m) => byMonitor[m].map((p) => p.t)))].sort((a, b) => a - b);
  const lookup = new Map(monitors.map((m) => [m, new Map(byMonitor[m].map((p) => [p.t, p.v]))]));
  const gbLookup = opts.perGbBy
    ? new Map(monitors.map((m) => [m, new Map((opts.perGbBy?.[m] ?? []).map((p) => [p.t, p.v / 1e9]))]))
    : null;
  return ts.map((t) => {
    const row: TimelineRow = { t };
    for (const m of monitors) {
      const v = lookup.get(m)?.get(t);
      if (v == null) { row[m] = null; continue; }
      if (gbLookup) {
        const gb = gbLookup.get(m)?.get(t);
        row[m] = gb != null && gb > 0 ? v / gb : null;
      } else {
        row[m] = v * scale;
      }
    }
    return row;
  });
}

/** 시리즈별 범례 통계 (Grafana 범례 테이블 패리티) — null 버킷은 제외. */
export function rowStats(rows: TimelineRow[], key: string): { max: number; mean: number; last: number } | null {
  const vs = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
  if (!vs.length) return null;
  return { max: Math.max(...vs), mean: vs.reduce((a, v) => a + v, 0) / vs.length, last: vs[vs.length - 1] };
}

/** X축 틱 — 24h 이내는 HH:MM, 그 초과는 M/D HH:MM (로컬 시간). */
export function formatTimelineTick(t: number, rangeSec: number): string {
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return rangeSec > 86400 ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm;
}
